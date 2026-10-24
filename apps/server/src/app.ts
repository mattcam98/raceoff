/** Wires the HTTP API, the socket handshake and the rooms into one server. */
import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ChangePasswordSchema, HandshakeSchema, LoginSchema, normalizeRoomCode, RemoveRecordSchema, ServerSettingsSchema, SetupSchema,
  type AdminStatus, type AdminView, type CreateRoomResponse, type JoinResponse,
} from '@raceoff/shared';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import type { z } from 'zod';
import { Admin, type Caller } from './admin';
import type { Config } from './config';
import { VERSION } from './config';
import { Records } from './records';
import { Room, RoomSnapshotSchema, type AppServer } from './room';
import { clientAddress, inContainer, lanAddresses, Limiter, log, randomRoomCode, randomToken, readJsonFile, sha256, writeAtomic } from './util';

const MAX_ROOMS = 300;
const SWEEP_MS = 30_000;
const MINUTE_MS = 60_000;
/** A room no TV ever opened: made and abandoned, or made only to take up space. */
const NO_TV_MS = 2 * MINUTE_MS;

export interface App {
  server: HttpServer;
  rooms: Map<string, Room>;
  admin: Admin;
  /** Close the rooms that have expired. Runs by itself every half minute. */
  sweep(): void;
  close(): Promise<void>;
}

/** Thrown from a route to answer with a status and a message the page can show. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function createApp(config: Config): Promise<App> {
  const startedAt = Date.now();
  const dataDir = config.DATA_DIR || null;
  const admin = await Admin.load(dataDir);
  if (admin.setupCode) {
    log.warn(`no admin password yet: open /settings and enter the setup code ${admin.setupCode} to choose one`, { setupCode: admin.setupCode });
  }
  const records = await Records.load(dataDir);
  const rooms = new Map<string, Room>();
  const server = createServer();
  const io: AppServer = new Server(server, {
    // WebSocket only: polling would add latency and jitter to every steering input.
    transports: ['websocket'],
    serveClient: false,
    // The largest real message, a full race's status or four giants' dashboards, is a few kilobytes.
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  // Rooms are kept on disk too, so a restart (an update, a crash) does not end the party: the TV and the phones
  // reconnect with the keys they kept and carry on from the lobby.
  const roomsFile = config.DATA_DIR ? join(config.DATA_DIR, 'rooms.json') : null;
  let saveTimer: NodeJS.Timeout | null = null;
  let saving = Promise.resolve();
  const saveRooms = () => {
    if (!roomsFile) return Promise.resolve();
    const body = JSON.stringify([...rooms.values()].map((r) => r.snapshot()));
    saving = saving.then(() => writeAtomic(roomsFile, body)).catch((err) => log.error('could not save rooms', { err }));
    return saving;
  };
  const roomsChanged = () => {
    if (!roomsFile || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveRooms();
    }, 1000);
  };
  const addRoom = (room: Room) => {
    room.onChange = roomsChanged;
    rooms.set(room.code, room);
    roomsChanged();
  };
  for (const snap of (roomsFile && (await readJsonFile(roomsFile, RoomSnapshotSchema.array()))) || []) {
    if (Date.now() - snap.updatedAt > admin.settings.roomIdleMinutes * MINUTE_MS * 4) continue;
    addRoom(Room.restore(io, snap, records, admin.settings.roomDefaults));
  }
  if (rooms.size) log.info('restored rooms', { count: rooms.size });

  const http = express();
  http.disable('x-powered-by');
  http.use(compression());
  http.use(express.json({ limit: '16kb' }));
  http.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    // Never shown inside another site's frame, where a click could be steered onto a button of ours.
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Read on every request, so a change to the proxy setting applies at once.
  const address = (req: Request) => clientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'], admin.settings.trustProxy);
  const caller = (req: Request): Caller => ({ ip: address(req), agent: req.get('user-agent') ?? '' });
  const creating = new Limiter(0.2, 6);
  const joining = new Limiter(1, 12);
  // Looking a code up says whether a room exists: enough for a phone opening a link, too slow to try them all.
  const looking = new Limiter(1, 20);
  // Each guess costs a twentieth of a second of scrypt: a handful in a burst, then one every ten seconds.
  const guessing = new Limiter(0.1, 6);

  http.get('/api/health', (_req, res) => void res.json({ ok: true, version: VERSION, rooms: rooms.size }));
  http.get('/api/info', (_req, res) => void res.json({ publicUrl: admin.settings.publicUrl, lan: lanAddresses(), version: VERSION }));
  http.get('/api/records', (_req, res) => void res.json(records.view));

  http.post('/api/rooms', (req, res) => {
    if (!creating.allow(address(req))) return void res.status(429).json({ error: 'Too many rooms made from here. Wait a moment.' });
    if (rooms.size >= MAX_ROOMS) return void res.status(503).json({ error: 'This server is full right now.' });
    let code = randomRoomCode();
    for (let i = 0; rooms.has(code); i++) {
      if (i > 50) return void res.status(503).json({ error: 'No free room codes. Try again.' });
      code = randomRoomCode();
    }
    const key = randomToken(32);
    addRoom(new Room(io, code, sha256(key), records, admin.settings.roomDefaults));
    log.info('room created', { code });
    const body: CreateRoomResponse = { code, key };
    res.json(body);
  });

  http.get('/api/rooms/:code', (req, res) => {
    if (!looking.allow(address(req))) return void res.status(429).json({ error: 'Too many tries. Wait a moment.' });
    const room = rooms.get(normalizeRoomCode(String(req.params.code)));
    if (!room) return void res.status(404).json({ error: 'No room with that code.' });
    res.json({ code: room.code, players: room.playerCount, tv: room.tvConnected });
  });

  http.post('/api/rooms/:code/join', (req, res) => {
    if (!joining.allow(address(req))) return void res.status(429).json({ error: 'Too many tries. Wait a moment.' });
    const room = rooms.get(normalizeRoomCode(String(req.params.code)));
    if (!room) return void res.status(404).json({ error: 'No room with that code. Check the TV.' });
    const result = room.join(String(req.body?.name ?? ''));
    if ('error' in result) return void res.status(409).json({ error: result.error });
    const body: JoinResponse = result;
    res.json(body);
  });

  // ------------------------------------------------------------ settings (/settings in the app)

  const bearer = (req: Request) => req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const parse = <T extends z.ZodType>(schema: T, body: unknown): z.output<T> => {
    const r = schema.safeParse(body);
    if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? 'That was not understood.');
    return r.data;
  };
  const guard = (req: Request) => {
    if (!guessing.allow(address(req))) throw new HttpError(429, 'Too many tries. Wait a minute.');
  };
  const signedIn = (req: Request, _res: Response, next: NextFunction) => {
    if (admin.allows(bearer(req))) return next();
    next(new HttpError(401, admin.needsSetup ? 'This server needs setting up first.' : 'Sign in to change settings.'));
  };
  const view = (req: Request): AdminView => ({
    settings: admin.settings,
    sessions: admin.listSessions(bearer(req)),
    audit: admin.activity(),
    rooms: [...rooms.values()].map((r) => r.summary()).sort((a, b) => b.updatedAt - a.updatedAt),
    server: {
      version: VERSION, startedAt, inContainer, dataDir,
      recordPlayers: records.view.players.length, recordTracks: Object.values(records.view.tracks).filter((t) => t.bestLap || t.races.length).length,
    },
    // Each proxy adds one address to X-Forwarded-For (Cloudflare the visitor's, a local proxy Cloudflare's).
    request: { ip: address(req), proxies: String(req.headers['x-forwarded-for'] ?? '').split(',').filter((s) => s.trim()).length },
  });
  // Nothing here may be cached by a browser or a proxy.
  http.use('/api/admin', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  http.get('/api/admin/status', (_req, res) => void res.json({ setup: admin.needsSetup } satisfies AdminStatus));
  http.post('/api/admin/setup', async (req, res) => {
    guard(req);
    const { code, password } = parse(SetupSchema, req.body);
    if (!admin.needsSetup) throw new HttpError(409, 'This server already has a password. Sign in instead.');
    const token = await admin.setup(code, password, caller(req));
    if (!token) throw new HttpError(401, 'That setup code is not right. Check the server log.');
    res.json({ token });
  });
  http.post('/api/admin/login', async (req, res) => {
    guard(req);
    const { password } = parse(LoginSchema, req.body);
    const token = await admin.login(password, caller(req));
    if (!token) throw new HttpError(401, 'Wrong password.');
    res.json({ token });
  });
  http.post('/api/admin/logout', (req, res) => {
    admin.logout(bearer(req), caller(req));
    res.json({ ok: true });
  });
  http.get('/api/admin', signedIn, (req, res) => void res.json(view(req)));
  http.put('/api/admin/settings', signedIn, (req, res) => {
    admin.update(parse(ServerSettingsSchema, req.body), caller(req));
    res.json(view(req));
  });
  http.post('/api/admin/password', signedIn, async (req, res) => {
    guard(req);
    const { current, next } = parse(ChangePasswordSchema, req.body);
    const token = await admin.changePassword(current, next, caller(req));
    if (!token) throw new HttpError(401, 'The current password is wrong.');
    res.json({ token });
  });
  http.post('/api/admin/sessions/revoke', signedIn, (req, res) => {
    admin.revokeOthers(bearer(req), caller(req));
    res.json(view(req));
  });
  http.delete('/api/admin/rooms/:code', signedIn, (req, res) => {
    const code = normalizeRoomCode(String(req.params.code));
    const room = rooms.get(code);
    if (!room) throw new HttpError(404, 'That room has already closed.');
    room.close('closed');
    rooms.delete(code);
    roomsChanged();
    admin.note('room.closed', caller(req).ip, { code });
    res.json(view(req));
  });
  http.post('/api/admin/records/reset', signedIn, (req, res) => {
    records.clear();
    admin.note('records.reset', caller(req).ip);
    res.json(view(req));
  });
  http.post('/api/admin/records/remove', signedIn, (req, res) => {
    const { name } = parse(RemoveRecordSchema, req.body);
    if (!records.remove(name)) throw new HttpError(404, 'Nobody by that name is in the Hall of Fame.');
    admin.note('records.removed', caller(req).ip, { name });
    res.json(view(req));
  });

  http.use('/api', (_req, res) => void res.status(404).json({ error: 'Not found' }));

  // The built web app, with every other path falling through to it so client routes work on reload.
  const here = dirname(fileURLToPath(import.meta.url));
  // Resolved: res.sendFile refuses a relative path, so WEB_DIR=apps/web/dist answered every page with a 500.
  const webDir = [config.WEB_DIR && resolve(config.WEB_DIR), resolve(here, '../../web/dist'), resolve(process.cwd(), 'apps/web/dist')].find((d) => d && existsSync(join(d, 'index.html')));
  if (webDir) {
    // Vite fingerprints everything under assets/, so those never change; the rest is checked hourly.
    const assets = join(webDir, 'assets') + sep;
    http.use(express.static(webDir, { index: false, maxAge: '1h', setHeaders: (res, path) => {
      if (path.startsWith(assets)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } }));
    http.get('/{*any}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDir, 'index.html'));
    });
  } else {
    log.warn('no built web app found; run `npm run build` (or use `npm run dev`)');
  }
  http.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    // Malformed or oversized JSON bodies, from express.json().
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return void res.status(err.status ?? 400).json({ error: 'That was not understood.' });
    log.error('request failed', { err });
    res.status(500).json({ error: 'Something went wrong.' });
  });

  server.on('request', (req, res) => {
    if (!req.url?.startsWith('/socket.io/')) http(req, res);
  });

  // Sockets prove who they are once, at the handshake.
  const connections = new Limiter(3, 60);
  io.use((socket, next) => {
    const addr = clientAddress(socket.handshake.address, socket.handshake.headers['x-forwarded-for'], admin.settings.trustProxy);
    if (!connections.allow(addr)) return next(new Error('rate_limited'));
    const hs = HandshakeSchema.safeParse(socket.handshake.auth);
    if (!hs.success) return next(new Error('bad_handshake'));
    const room = rooms.get(normalizeRoomCode(hs.data.code));
    if (!room) return next(new Error('no_room'));
    if (hs.data.role === 'tv') {
      if (!room.isTv(hs.data.key)) return next(new Error('unauthorized'));
      socket.data = { role: 'tv', code: room.code };
    } else {
      const pid = room.playerFor(hs.data.token);
      if (!pid) return next(new Error('unauthorized'));
      socket.data = { role: 'player', code: room.code, playerId: pid };
    }
    next();
  });

  io.on('connection', (socket) => {
    const room = rooms.get(socket.data.code);
    if (!room) return void socket.disconnect(true);
    // Each socket gets a message budget: phones send inputs about 30 times a second. The TV sends everyone's
    // dashboards in one message ten times a second, plus status and buzzes: a few dozen, with room to spare.
    const budget = socket.data.role === 'tv' ? new Limiter(300, 600) : new Limiter(120, 240);
    socket.use((_packet, next) => (budget.allow('x') ? next() : undefined));
    // Handlers run on their own tick, where a throw would take down the server and every room on it: log it instead.
    const on = socket.on.bind(socket) as (event: string, fn: (...args: unknown[]) => void) => unknown;
    (socket as unknown as { on: typeof on }).on = (event, fn) =>
      on(event, (...args) => {
        try {
          fn(...args);
        } catch (err) {
          log.error('socket handler failed', { code: room.code, role: socket.data.role, event, err });
        }
      });
    if (socket.data.role === 'tv') room.attachTv(socket);
    else room.attachPlayer(socket, socket.data.playerId!);
  });

  const sweep = () => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.tvConnected) continue;
      if (room.hadTv ? now - Math.max(room.tvSeenAt, room.updatedAt) > admin.settings.roomIdleMinutes * MINUTE_MS : now - room.createdAt > NO_TV_MS) {
        room.close('closed');
        rooms.delete(code);
        roomsChanged();
        log.info('room expired', { code });
      }
    }
  };
  const sweeper = setInterval(sweep, SWEEP_MS);
  sweeper.unref();

  return {
    server,
    rooms,
    admin,
    sweep,
    async close() {
      clearInterval(sweeper);
      if (saveTimer) clearTimeout(saveTimer);
      await saveRooms();
      // Not "closed": the sockets drop and reconnect by themselves once the server is back.
      io.disconnectSockets(true);
      await new Promise<void>((r) => io.close(() => r()));
      await records.flush();
      await admin.flush();
      server.closeAllConnections();
    },
  };
}

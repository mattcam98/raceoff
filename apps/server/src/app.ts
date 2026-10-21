/** Wires the HTTP API, the socket handshake and the rooms into one server. */
import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { createServer, type Server as HttpServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HandshakeSchema, normalizeRoomCode, type CreateRoomResponse, type JoinResponse } from '@raceoff/shared';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import type { Config } from './config';
import { VERSION } from './config';
import { Records } from './records';
import { Room, type AppServer, type RoomSnapshot } from './room';
import { clientAddress, lanAddresses, Limiter, log, randomRoomCode, randomToken, sha256 } from './util';

const MAX_ROOMS = 300;
/** A room whose TV has been gone this long, with nobody doing anything, is closed. */
const ROOM_IDLE_MS = 30 * 60_000;
const SWEEP_MS = 60_000;

export interface App {
  server: HttpServer;
  rooms: Map<string, Room>;
  close(): Promise<void>;
}

export async function createApp(config: Config): Promise<App> {
  const records = await Records.load(config.DATA_DIR || null);
  const rooms = new Map<string, Room>();
  const server = createServer();
  const io: AppServer = new Server(server, {
    // WebSocket only: polling would add latency and jitter to every steering input.
    transports: ['websocket'],
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
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
    saving = saving.then(async () => {
      try {
        await writeFile(`${roomsFile}.tmp`, body);
        await rename(`${roomsFile}.tmp`, roomsFile);
      } catch (err) {
        log.error('could not save rooms', { err });
      }
    });
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
  if (roomsFile) {
    try {
      const snaps = JSON.parse(await readFile(roomsFile, 'utf8')) as RoomSnapshot[];
      for (const snap of snaps) {
        if (Date.now() - snap.updatedAt > ROOM_IDLE_MS * 4) continue;
        addRoom(Room.restore(io, snap, records));
      }
      if (rooms.size) log.info('restored rooms', { count: rooms.size });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('could not restore rooms', { err: String(err) });
    }
  }

  const http = express();
  http.disable('x-powered-by');
  http.set('trust proxy', config.TRUST_PROXY);
  http.use(compression());
  http.use(express.json({ limit: '16kb' }));
  http.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const address = (req: Request) => clientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'], config.TRUST_PROXY);
  const creating = new Limiter(0.2, 6);
  const joining = new Limiter(1, 12);

  http.get('/api/health', (_req, res) => void res.json({ ok: true, version: VERSION, rooms: rooms.size }));
  http.get('/api/info', (_req, res) => void res.json({ publicUrl: config.PUBLIC_URL || null, lan: lanAddresses(), version: VERSION }));
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
    addRoom(new Room(io, code, sha256(key), records));
    log.info('room created', { code });
    const body: CreateRoomResponse = { code, key };
    res.json(body);
  });

  http.get('/api/rooms/:code', (req, res) => {
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

  http.use('/api', (_req, res) => void res.status(404).json({ error: 'Not found' }));

  // The built web app, with every other path falling through to it so client routes work on reload.
  const here = dirname(fileURLToPath(import.meta.url));
  const webDir = [config.WEB_DIR, resolve(here, '../../web/dist'), resolve(process.cwd(), 'apps/web/dist')].find((d) => d && existsSync(join(d, 'index.html')));
  if (webDir) {
    http.use(express.static(webDir, { index: false, maxAge: '1h', setHeaders: (res, path) => {
      if (path.includes(`${'assets'}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } }));
    http.get('/{*any}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDir, 'index.html'));
    });
  } else {
    log.warn('no built web app found; run `npm run build` (or use `npm run dev`)');
  }
  http.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error('request failed', { err });
    res.status(500).json({ error: 'Something went wrong.' });
  });

  server.on('request', (req, res) => {
    if (!req.url?.startsWith('/socket.io/')) http(req, res);
  });

  // Sockets prove who they are once, at the handshake.
  const connections = new Limiter(3, 60);
  io.use((socket, next) => {
    const addr = clientAddress(socket.handshake.address, socket.handshake.headers['x-forwarded-for'], config.TRUST_PROXY);
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
    // Each socket gets a message budget: phones send inputs about 30 times a second. The TV, which has proved
    // it holds the room's key, sends dashboards and buzzes for four players and gets a much bigger one.
    const budget = socket.data.role === 'tv' ? new Limiter(1000, 4000) : new Limiter(120, 240);
    socket.use((_packet, next) => (budget.allow('x') ? next() : undefined));
    if (socket.data.role === 'tv') room.attachTv(socket);
    else room.attachPlayer(socket, socket.data.playerId!);
  });

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (!room.tvConnected && now - Math.max(room.tvSeenAt, room.updatedAt) > ROOM_IDLE_MS) {
        room.close('closed');
        rooms.delete(code);
        roomsChanged();
        log.info('room expired', { code });
      }
    }
  }, SWEEP_MS);
  sweeper.unref();

  return {
    server,
    rooms,
    async close() {
      clearInterval(sweeper);
      if (saveTimer) clearTimeout(saveTimer);
      await saveRooms();
      // Not "closed": the sockets drop and reconnect by themselves once the server is back.
      io.disconnectSockets(true);
      await new Promise<void>((r) => io.close(() => r()));
      await records.flush();
      server.closeAllConnections();
    },
  };
}

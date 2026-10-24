import type { AddressInfo } from 'node:net';
import { IDLE_STATUS, type AdminView, type ClientToServerEvents, type GameStatus, type RecordsView, type RelayedInput, type RoomView, type ServerToClientEvents } from '@raceoff/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from './app';
import { loadConfig } from './config';
import { setLogLevel } from './util';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let app: App;
let base: string;
const sockets: Client[] = [];

beforeAll(async () => {
  setLogLevel('error');
  // Behind a "proxy", so each test can arrive from its own address and stay under the per-address limits.
  app = await createApp(loadConfig({ DATA_DIR: '', LOG_LEVEL: 'error' } as NodeJS.ProcessEnv));
  app.admin.settings = { ...app.admin.settings, trustProxy: 1 };
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await app.close();
});

let client = 1;
const post = async <T,>(path: string, body?: unknown) => {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${client++}` };
  const res = await fetch(base + path, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json()) as T };
};

function open(auth: Record<string, string>): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s: Client = connect(base, { transports: ['websocket'], auth, reconnection: false });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const next = <E extends keyof ServerToClientEvents>(s: Client, event: E, match: (...a: Parameters<ServerToClientEvents[E]>) => boolean = () => true) =>
  new Promise<Parameters<ServerToClientEvents[E]>>((resolve) => {
    const fn = (...a: Parameters<ServerToClientEvents[E]>) => {
      if (!match(...a)) return;
      s.off(event, fn as never);
      resolve(a);
    };
    s.on(event, fn as never);
  });

async function room() {
  const { body } = await post<{ code: string; key: string }>('/api/rooms');
  const tv = await open({ role: 'tv', code: body.code, key: body.key });
  return { ...body, tv };
}

/** The TV starting a race: the room takes one report for it. */
const startRace = (tv: Client) => {
  tv.emit('tv:status', { ...IDLE_STATUS, phase: 'intro', track: 'bath' });
  tv.emit('tv:status', { ...IDLE_STATUS, phase: 'race', track: 'bath' });
};
type Report = Parameters<ClientToServerEvents['tv:report']>[0];
const sendReport = (tv: Client, report: Report) => new Promise<{ ok: boolean; data?: unknown[] }>((resolve) => tv.emit('tv:report', report, resolve));
const records = async () => (await (await fetch(`${base}/api/records`)).json()) as RecordsView;

describe('rooms', () => {
  it('creates a room and lets players join with a name', async () => {
    const { code, tv } = await room();
    const seen = next(tv, 'room', (r: RoomView) => r.players.length === 1);
    const join = await post<{ token: string; playerId: string }>(`/api/rooms/${code}/join`, { name: 'Matt' });
    expect(join.status).toBe(200);
    const [view] = await seen;
    expect(view.players[0]).toMatchObject({ name: 'Matt', slot: 0, connected: false });
    expect(view.vip).toBe(join.body.playerId);
  });

  it('turns away a fifth player and an unknown code', async () => {
    const { code } = await room();
    for (const name of ['A', 'B', 'C', 'D']) expect((await post(`/api/rooms/${code}/join`, { name })).status).toBe(200);
    expect((await post(`/api/rooms/${code}/join`, { name: 'E' })).status).toBe(409);
    expect((await post('/api/rooms/ZZZZ/join', { name: 'E' })).status).toBe(404);
  });

  it('gives a repeated name a number', async () => {
    const { code, tv } = await room();
    await post(`/api/rooms/${code}/join`, { name: 'Sam' });
    const seen = next(tv, 'room', (r: RoomView) => r.players.length === 2);
    await post(`/api/rooms/${code}/join`, { name: 'sam' });
    const [view] = await seen;
    expect(view.players.map((p) => p.name)).toEqual(['Sam', 'sam 2']);
  });

  it('refuses a socket with the wrong key or token', async () => {
    const { code } = await room();
    await expect(open({ role: 'tv', code, key: 'nope' })).rejects.toThrow('unauthorized');
    await expect(open({ role: 'player', code, token: 'nope' })).rejects.toThrow('unauthorized');
  });
});

describe('play', () => {
  it('relays a phone’s input to the TV, stamped with who sent it', async () => {
    const { code, tv } = await room();
    const join = await post<{ token: string; playerId: string }>(`/api/rooms/${code}/join`, { name: 'Pat' });
    const phone = await open({ role: 'player', code, token: join.body.token });
    const got = next(tv, 'input');
    phone.emit('p:input', { s: -40, b: 5, i: 2 });
    const [input] = (await got) as [RelayedInput];
    expect(input).toEqual({ s: -40, b: 5, i: 2, pid: join.body.playerId });
  });

  it('drops malformed input', async () => {
    const { code, tv } = await room();
    const join = await post<{ token: string }>(`/api/rooms/${code}/join`, { name: 'Pat' });
    const phone = await open({ role: 'player', code, token: join.body.token });
    let count = 0;
    tv.on('input', () => count++);
    phone.emit('p:input', { s: 500, b: 1, i: 0 } as never);
    phone.emit('p:input', { s: 0, b: 1, i: 0 });
    await new Promise((r) => setTimeout(r, 150));
    expect(count).toBe(1);
  });

  it('relays a giant’s move to the TV, stamped, and drops malformed ones', async () => {
    const { code, tv } = await room();
    const join = await post<{ token: string; playerId: string }>(`/api/rooms/${code}/join`, { name: 'Gia' });
    const phone = await open({ role: 'player', code, token: join.body.token });
    const moves: unknown[] = [];
    tv.on('giant', (m) => moves.push(m));
    phone.emit('p:giant', { kind: 'nuke', target: 1 } as never);
    phone.emit('p:giant', { kind: 'bomb', target: 99 });
    phone.emit('p:giant', { kind: 'butter', target: 3 });
    await new Promise((r) => setTimeout(r, 150));
    expect(moves).toEqual([{ kind: 'butter', target: 3, pid: join.body.playerId }]);
  });

  it('keeps settings a change does not mention: turning the Giant’s Hand off sticks', async () => {
    const { code, tv } = await room();
    const join = await post<{ token: string }>(`/api/rooms/${code}/join`, { name: 'Host' });
    const vip = await open({ role: 'player', code, token: join.body.token });
    vip.emit('p:settings', { giants: false });
    await next(tv, 'room', (v) => !v.settings.giants);
    vip.emit('p:settings', { laps: 4 });
    const [view] = await next(tv, 'room', (v) => v.settings.laps === 4);
    expect(view.settings.giants).toBe(false);
  });

  it('lets only the first phone change settings and send commands', async () => {
    const { code, tv } = await room();
    const a = await post<{ token: string }>(`/api/rooms/${code}/join`, { name: 'First' });
    const b = await post<{ token: string }>(`/api/rooms/${code}/join`, { name: 'Second' });
    const vip = await open({ role: 'player', code, token: a.body.token });
    const other = await open({ role: 'player', code, token: b.body.token });

    let commands = 0;
    tv.on('command', () => commands++);
    other.emit('p:settings', { laps: 5 });
    other.emit('p:command', 'start');
    await new Promise((r) => setTimeout(r, 150));
    expect(commands).toBe(0);

    const changed = next(tv, 'room', (r: RoomView) => r.settings.laps === 2);
    vip.emit('p:settings', { laps: 2 });
    await changed;
    const cmd = next(tv, 'command');
    vip.emit('p:command', 'start');
    expect((await cmd)[0].cmd).toBe('start');
  });

  it('passes the TV’s status to every phone and dashboards to one', async () => {
    const { code, tv } = await room();
    const a = await post<{ token: string; playerId: string }>(`/api/rooms/${code}/join`, { name: 'A' });
    const b = await post<{ token: string; playerId: string }>(`/api/rooms/${code}/join`, { name: 'B' });
    const pa = await open({ role: 'player', code, token: a.body.token });
    const pb = await open({ role: 'player', code, token: b.body.token });
    const statusA = next(pa, 'status', (s) => s.phase === 'race');
    const statusB = next(pb, 'status', (s) => s.phase === 'race');
    tv.emit('tv:status', { phase: 'race', track: 'desk', raceIndex: 0, raceCount: 1, standings: [], records: [], paused: false, racers: [a.body.playerId, b.body.playerId] });
    await Promise.all([statusA, statusB]);

    let bGot = 0;
    pb.on('hud', () => bGot++);
    const hudA = next(pa, 'hud');
    const hud = { place: 2, racers: 8, lap: 1, laps: 3, item: 'ball', count: 1, rolling: false, finished: false, time: null, charge: 0, stage: 'go', stunned: false, wrongWay: false } as const;
    tv.emit('tv:hud', { [a.body.playerId]: hud });
    expect((await hudA)[0]).toEqual(hud);
    await new Promise((r) => setTimeout(r, 100));
    expect(bGot).toBe(0);
  });

  it('keeps race records and reports the ones broken', async () => {
    const { code, tv } = await room();
    await post(`/api/rooms/${code}/join`, { name: 'Ace' });
    const report = async (time: number) => {
      startRace(tv);
      const res = await sendReport(tv, { track: 'bath', laps: 3, cc: 100, results: [{ name: 'Ace', character: 'zip', place: 1, time, bestLap: time / 3 }], cupWinner: null });
      return res.data ?? [];
    };
    expect(await report(90_000)).toHaveLength(2);
    expect(await report(95_000)).toHaveLength(0);
    const view = await records();
    expect(view.tracks.bath.races[0].time).toBe(90_000);
    expect(view.players.find((p: { name: string }) => p.name === 'Ace')).toMatchObject({ races: 2, wins: 2 });
  });

  it('takes one report per race, only for the room’s players, and no impossible times', async () => {
    const { code, tv } = await room();
    await post(`/api/rooms/${code}/join`, { name: 'Fox' });
    const result = (name: string, time = 100_000, bestLap: number | null = 32_000) => ({ name, character: 'zip' as const, place: 1, time, bestLap });
    const report = (results: Report['results'], cupWinner: string | null = null) => sendReport(tv, { track: 'desk', laps: 3, cc: 150, results, cupWinner });

    // No race under way.
    expect((await report([result('Fox')])).ok).toBe(false);
    // Too fast: a lap under ten seconds, or three laps in twenty.
    startRace(tv);
    expect((await report([result('Fox', 100_000, 5_000)])).ok).toBe(false);
    startRace(tv);
    expect((await report([result('Fox', 20_000, null)])).ok).toBe(false);
    // A name not in the room, twice the same name, a cup for a stranger: only Fox's one result counts.
    startRace(tv);
    expect((await report([result('Fox'), result('Fox', 99_000), result('Ghost', 60_000)], 'Ghost')).ok).toBe(true);
    // A second report for the same race.
    expect((await report([result('Fox', 61_000)])).ok).toBe(false);

    const view = await records();
    expect(view.players.find((p) => p.name === 'Fox')).toMatchObject({ races: 1, cups: 0 });
    expect(view.players.some((p) => p.name === 'Ghost')).toBe(false);
    expect(view.tracks.desk.races.map((r) => r.time)).toEqual([100_000]);
  });

  it('parses the TV’s status: a malformed or oversized one never reaches the phones', async () => {
    const { code, tv } = await room();
    const join = await post<{ token: string }>(`/api/rooms/${code}/join`, { name: 'Pip' });
    const phone = await open({ role: 'player', code, token: join.body.token });
    const seen: string[] = [];
    phone.on('status', (s) => seen.push(s.phase));
    const standing = { id: 'cpu:0', name: 'Abcdefghijkl', character: 'zip', cpu: true, place: 1, time: 95_123.456, bestLap: 31_234.567, points: 15, total: 45 };
    tv.emit('tv:status', { ...IDLE_STATUS, phase: 'boom' } as never);
    tv.emit('tv:status', { ...IDLE_STATUS, phase: 'results', standings: Array(9).fill(standing) });
    tv.emit('tv:status', { ...IDLE_STATUS, phase: 'results', track: 'x'.repeat(40) });
    // The largest a real one gets: eight racers, every record broken.
    const full: GameStatus = {
      ...IDLE_STATUS, phase: 'results', track: 'breakfast', standings: Array(8).fill(standing), racers: ['abcdefgh', 'abcdefgh', 'abcdefgh', 'abcdefgh'],
      records: Array(5).fill({ kind: 'race', track: 'breakfast', name: 'Abcdefghijkl', time: 95_123.456 }),
    };
    expect(JSON.stringify(full).length).toBeLessThan(4 * 1024);
    const got = next(phone, 'status', (s) => s.phase === 'results');
    tv.emit('tv:status', full);
    expect((await got)[0]).toEqual(full);
    expect(seen).toEqual(['results']);
    // Past the message size limit the TV is cut off.
    const gone = new Promise((resolve) => tv.once('disconnect', resolve));
    tv.emit('tv:status', { ...IDLE_STATUS, track: 'x'.repeat(20_000) });
    await gone;
  });

  it('relays four giants’ dashboards in one message, well inside the size limit', async () => {
    const { code, tv } = await room();
    const ids: string[] = [];
    const phones: Client[] = [];
    for (const name of ['A', 'B', 'C', 'D']) {
      const j = await post<{ token: string; playerId: string }>(`/api/rooms/${code}/join`, { name });
      ids.push(j.body.playerId);
      phones.push(await open({ role: 'player', code, token: j.body.token }));
    }
    const target = { k: 7, name: 'Abcdefghijkl', character: 'duckie', place: 8, cpu: true, slot: -1, safe: false };
    const hud = {
      place: 0, racers: 8, lap: 0, laps: 3, item: null, count: 0, rolling: false, finished: false, time: null, charge: 0, stage: 'go', stunned: false, wrongWay: false,
      giant: { charge: 2.345678, targets: Array(8).fill(target), endsIn: 12 },
    } as const;
    const huds = Object.fromEntries(ids.map((id) => [id, hud]));
    expect(JSON.stringify(huds).length).toBeLessThan(8 * 1024);
    const got = Promise.all(phones.map((p) => next(p, 'hud')));
    tv.emit('tv:hud', { ...huds, [ids[0]]: { ...hud, item: 'laser' } } as never);
    tv.emit('tv:hud', huds);
    for (const [h] of await got) expect(h).toEqual(hud);
  });

  it('gives the menus to a phone that is here when the first one is not', async () => {
    const { code, tv } = await room();
    const a = await post<{ token: string; playerId: string }>(`/api/rooms/${code}/join`, { name: 'Away' });
    const b = await post<{ token: string; playerId: string }>(`/api/rooms/${code}/join`, { name: 'Here' });
    const seen = next(tv, 'room', (r) => r.vip === b.body.playerId);
    await open({ role: 'player', code, token: b.body.token });
    await seen;
    const back = next(tv, 'room', (r) => r.vip === a.body.playerId);
    await open({ role: 'player', code, token: a.body.token });
    await back;
  });

  it('numbers keyboard players on without a gap after a full room turns one away', async () => {
    const { tv } = await room();
    const add = () => new Promise<{ ok: boolean; data?: { id: string } }>((resolve) => tv.emit('tv:addLocal', resolve));
    const added = [];
    for (let i = 0; i < 4; i++) added.push((await add()).data!.id);
    expect((await add()).ok).toBe(false);
    tv.emit('tv:kick', added[1]);
    const seen = next(tv, 'room', (r) => r.players.some((p) => p.name === 'Keys 5'));
    expect((await add()).ok).toBe(true);
    await seen;
  });
});

describe('limits', () => {
  it('closes a room no TV ever opened after two minutes, and not one with a TV', async () => {
    const lonely = (await post<{ code: string }>('/api/rooms')).body.code;
    const { code } = await room();
    for (const c of [lonely, code]) app.rooms.get(c)!.createdAt -= 3 * 60_000;
    app.sweep();
    expect(app.rooms.has(lonely)).toBe(false);
    expect(app.rooms.has(code)).toBe(true);
  });

  it('rate-limits looking room codes up', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await fetch(`${base}/api/rooms/ZZZZ`, { headers: { 'x-forwarded-for': '10.8.0.1' } })).status);
    expect(statuses.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('refuses to be framed by another site', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('restarts', () => {
  it('brings rooms back, so the TV and phones reconnect with what they kept', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'raceoff-'));
    const config = loadConfig({ DATA_DIR: dir, LOG_LEVEL: 'error' } as NodeJS.ProcessEnv);
    const start = async () => {
      const a = await createApp(config);
      await new Promise<void>((r) => a.server.listen(0, r));
      return { a, url: `http://127.0.0.1:${(a.server.address() as AddressInfo).port}` };
    };
    const first = await start();
    const made = (await (await fetch(`${first.url}/api/rooms`, { method: 'POST' })).json()) as { code: string; key: string };
    const joined = (await (await fetch(`${first.url}/api/rooms/${made.code}/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Kim' }),
    })).json()) as { token: string };
    // Mid-race when the server stops.
    const tv: Client = connect(first.url, { transports: ['websocket'], auth: { role: 'tv', code: made.code, key: made.key }, reconnection: false });
    await new Promise<void>((r) => tv.on('connect', r));
    tv.emit('tv:status', { ...IDLE_STATUS, phase: 'race', track: 'bath' });
    await new Promise((r) => setTimeout(r, 100));
    expect(first.a.rooms.get(made.code)!.summary().phase).toBe('race');
    await first.a.close();

    const second = await start();
    try {
      const info = (await (await fetch(`${second.url}/api/rooms/${made.code}`)).json()) as { players: number };
      expect(info.players).toBe(1);
      // Back in the lobby until the TV says where the race is: no phone is shown one that has gone.
      expect(second.a.rooms.get(made.code)!.summary().phase).toBe('lobby');
      const ok = (auth: Record<string, string>) =>
        new Promise<boolean>((resolve) => {
          const s: Client = connect(second.url, { transports: ['websocket'], auth, reconnection: false });
          s.on('connect', () => (s.disconnect(), resolve(true)));
          s.on('connect_error', () => resolve(false));
        });
      expect(await ok({ role: 'tv', code: made.code, key: made.key })).toBe(true);
      expect(await ok({ role: 'player', code: made.code, token: joined.token })).toBe(true);
    } finally {
      await second.a.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('saved files', () => {
  it('moves an unreadable or malformed file aside and starts afresh', async () => {
    const { mkdtemp, readdir, readFile, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'raceoff-'));
    const records = '{"tracks":{},"players":[{"name":5}]}';
    await writeFile(join(dir, 'records.json'), records);
    await writeFile(join(dir, 'rooms.json'), '[{"code":');
    const a = await createApp(loadConfig({ DATA_DIR: dir, LOG_LEVEL: 'error' } as NodeJS.ProcessEnv));
    try {
      await new Promise<void>((r) => a.server.listen(0, r));
      const url = `http://127.0.0.1:${(a.server.address() as AddressInfo).port}`;
      expect(await (await fetch(`${url}/api/records`)).json()).toEqual({ tracks: {}, players: [] });
      expect(a.rooms.size).toBe(0);
      const files = await readdir(dir);
      const bad = files.find((f) => f.startsWith('records.json.bad-'));
      expect(bad).toBeDefined();
      expect(await readFile(join(dir, bad!), 'utf8')).toBe(records);
      expect(files.some((f) => f.startsWith('rooms.json.bad-'))).toBe(true);
      expect(files).not.toContain('records.json');
    } finally {
      await a.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('settings', () => {
  let ip = 1;
  const call = async <T,>(method: string, path: string, body?: unknown, token?: string) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${ip++}` };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: (await res.json()) as T };
  };

  it('needs the setup code from the log before a first password can be set', async () => {
    expect((await call<{ setup: boolean }>('GET', '/api/admin/status')).body.setup).toBe(true);
    expect((await call('GET', '/api/admin')).status).toBe(401);
    expect((await call('POST', '/api/admin/setup', { code: 'BBBB-BBBB', password: 'long enough' })).status).toBe(401);
    expect((await call('POST', '/api/admin/setup', { code: app.admin.setupCode, password: 'short' })).status).toBe(400);
    const ok = await call<{ token: string }>('POST', '/api/admin/setup', { code: app.admin.setupCode!.toLowerCase(), password: 'long enough' });
    expect(ok.status).toBe(200);
    expect(app.admin.setupCode).toBeNull();
    expect((await call('POST', '/api/admin/setup', { code: 'BBBB-BBBB', password: 'long enough' })).status).toBe(409);
    expect((await call<{ setup: boolean }>('GET', '/api/admin/status')).body.setup).toBe(false);
  });

  it('signs in, applies settings at once and refuses bad ones', async () => {
    expect((await call('POST', '/api/admin/login', { password: 'wrong one' })).status).toBe(401);
    const { body } = await call<{ token: string }>('POST', '/api/admin/login', { password: 'long enough' });
    const view = await call<AdminView>('GET', '/api/admin', undefined, body.token);
    expect(view.status).toBe(200);
    const patch = { ...view.body.settings, publicUrl: 'https://Race.Example.com/', trustProxy: 1, roomDefaults: { ...view.body.settings.roomDefaults, laps: 5 } };
    const saved = await call<AdminView>('PUT', '/api/admin/settings', patch, body.token);
    expect(saved.body.settings.publicUrl).toBe('https://race.example.com');
    expect(((await (await fetch(`${base}/api/info`)).json()) as { publicUrl: string }).publicUrl).toBe('https://race.example.com');
    expect((await call('PUT', '/api/admin/settings', { ...patch, publicUrl: 'race.example.com/join' }, body.token)).status).toBe(400);
    // New rooms start on the saved defaults.
    const r = await room();
    expect(app.rooms.get(r.code)!.view().settings.laps).toBe(5);
    await call('PUT', '/api/admin/settings', { ...patch, publicUrl: null, roomDefaults: view.body.settings.roomDefaults }, body.token);
  });

  it('changes the password only with the current one, signing other devices out', async () => {
    const a = (await call<{ token: string }>('POST', '/api/admin/login', { password: 'long enough' })).body.token;
    const b = (await call<{ token: string }>('POST', '/api/admin/login', { password: 'long enough' })).body.token;
    expect((await call('POST', '/api/admin/password', { current: 'nope nope', next: 'brand new pass' }, a)).status).toBe(401);
    const fresh = await call<{ token: string }>('POST', '/api/admin/password', { current: 'long enough', next: 'brand new pass' }, a);
    expect(fresh.status).toBe(200);
    expect((await call('GET', '/api/admin', undefined, a)).status).toBe(401);
    expect((await call('GET', '/api/admin', undefined, b)).status).toBe(401);
    expect((await call('GET', '/api/admin', undefined, fresh.body.token)).status).toBe(200);
  });

  it('closes rooms and edits the Hall of Fame', async () => {
    const token = (await call<{ token: string }>('POST', '/api/admin/login', { password: 'brand new pass' })).body.token;
    const r = await room();
    const bye = new Promise<string>((resolve) => r.tv.once('bye', resolve));
    const closed = await call<AdminView>('DELETE', `/api/admin/rooms/${r.code}`, undefined, token);
    expect(closed.status).toBe(200);
    expect(await bye).toBe('closed');
    expect(closed.body.rooms.some((x) => x.code === r.code)).toBe(false);
    expect((await call('POST', '/api/admin/records/remove', { name: 'ACE' }, token)).status).toBe(200);
    const records = (await (await fetch(`${base}/api/records`)).json()) as RecordsView;
    expect(records.players.some((p) => p.name === 'Ace')).toBe(false);
    expect((await call('POST', '/api/admin/records/remove', { name: 'Ace' }, token)).status).toBe(404);
    const view = await call<AdminView>('GET', '/api/admin', undefined, token);
    expect(view.body.audit.map((e) => e.action)).toEqual(expect.arrayContaining(['setup', 'login.failed', 'password.changed', 'room.closed', 'records.removed']));
  });
});

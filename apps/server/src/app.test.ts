import type { AddressInfo } from 'node:net';
import type { AdminView, ClientToServerEvents, RecordsView, RelayedInput, RoomView, ServerToClientEvents } from '@raceoff/shared';
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
    const { tv } = await room();
    const report = (time: number) =>
      new Promise<unknown[]>((resolve) =>
        tv.emit('tv:report', { track: 'bath', laps: 3, cc: 100, results: [{ name: 'Ace', character: 'zip', place: 1, time, bestLap: time / 3 }], cupWinner: null }, (res) => resolve(res.data ?? [])),
      );
    expect(await report(90_000)).toHaveLength(2);
    expect(await report(95_000)).toHaveLength(0);
    const records = (await (await fetch(`${base}/api/records`)).json()) as RecordsView;
    expect(records.tracks.bath.races[0].time).toBe(90_000);
    expect(records.players.find((p: { name: string }) => p.name === 'Ace')).toMatchObject({ races: 2, wins: 2 });
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
    await first.a.close();

    const second = await start();
    try {
      const info = (await (await fetch(`${second.url}/api/rooms/${made.code}`)).json()) as { players: number };
      expect(info.players).toBe(1);
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

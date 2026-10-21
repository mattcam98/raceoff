/**
 * Connections to the server: one for the TV, one for a phone. Each keeps the
 * latest room and race status and hands them to React through
 * `useSyncExternalStore`; the hot paths (inputs to the TV, dashboards to a
 * phone) go to plain callbacks so they never cause a re-render on their own.
 */
import {
  IDLE_STATUS, type AdminStatus, type AdminView, type ClientToServerEvents, type ServerSettings, type CreateRoomResponse, type GameStatus, type HapticKind, type Hud, type JoinResponse,
  type GiantKind, type GiantMove, type MenuCommand, type RelayedInput, type RoomView, type ServerToClientEvents,
} from '@raceoff/shared';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { adminToken } from './storage';

export type LinkStatus = 'connecting' | 'online' | 'reconnecting' | 'rejected' | 'ended';

export interface LinkSnapshot {
  status: LinkStatus;
  reason: string | null;
  room: RoomView | null;
  game: GameStatus;
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

abstract class Link {
  protected socket: AppSocket;
  private snap: LinkSnapshot = { status: 'connecting', reason: null, room: null, game: IDLE_STATUS };
  private listeners = new Set<() => void>();
  private retry: number | undefined;
  private closed = false;
  /** Every time the socket (re)connects: after a network blip or a server restart. */
  onConnect: () => void = () => {};

  constructor(auth: Record<string, string>) {
    this.socket = io({
      transports: ['websocket'],
      auth,
      autoConnect: false,
      reconnectionDelay: 300,
      reconnectionDelayMax: 2500,
      timeout: 8000,
    });
    const s = this.socket;
    s.on('connect', () => {
      this.set({ status: 'online', reason: null });
      this.onConnect();
    });
    s.on('disconnect', (reason) => {
      if (this.snap.status === 'ended') return;
      if (reason === 'io server disconnect') s.connect();
      this.set({ status: 'reconnecting' });
    });
    s.on('connect_error', (err) => {
      const fatal = ['no_room', 'unauthorized', 'bad_handshake'].includes(err.message);
      this.set(fatal ? { status: 'rejected', reason: err.message } : { status: this.snap.room ? 'reconnecting' : 'connecting' });
      if (fatal) s.disconnect();
      else if (!s.active) {
        // Turned away by the server's middleware (rate limited): socket.io will not retry on its own.
        window.clearTimeout(this.retry);
        this.retry = window.setTimeout(() => !this.closed && s.connect(), 1500);
      }
    });
    s.on('room', (room) => this.set({ room }));
    s.on('status', (game) => {
      this.statusChanged(game);
      this.set({ game });
    });
    s.on('bye', (reason) => {
      this.set({ status: 'ended', reason });
      s.disconnect();
    });
  }

  open() {
    this.closed = false;
    this.socket.connect();
  }

  /** Hang up. The link can be opened again (React may mount a component twice in development). */
  close() {
    this.closed = true;
    window.clearTimeout(this.retry);
    this.socket.disconnect();
  }

  /** Called with each new race status before anything renders it. */
  protected statusChanged(_game: GameStatus) {}

  protected set(patch: Partial<LinkSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  get connected() {
    return this.socket.connected;
  }
}

export class TvLink extends Link {
  onInput: (input: RelayedInput) => void = () => {};
  onCommand: (cmd: { pid: string; cmd: MenuCommand }) => void = () => {};
  onGiant: (move: GiantMove & { pid: string }) => void = () => {};

  constructor(code: string, key: string) {
    super({ role: 'tv', code, key });
    this.socket.on('input', (i) => this.onInput(i));
    this.socket.on('command', (c) => this.onCommand(c));
    this.socket.on('giant', (m) => this.onGiant(m));
  }

  settings = (patch: Parameters<ClientToServerEvents['tv:settings']>[0]) => this.socket.emit('tv:settings', patch);
  status = (status: GameStatus) => this.socket.emit('tv:status', status);
  // Not volatile: socket.io drops a volatile packet while the last one is still being written, so a second one in
  // the same frame (the countdown buzz for every phone, a dashboard after a buzz) would be lost. While offline,
  // nothing is queued: the director sends full dashboards again on reconnecting.
  huds = (huds: Record<string, Hud>) => this.socket.connected && this.socket.emit('tv:hud', huds);
  haptic = (pid: string, kind: HapticKind) => this.socket.connected && this.socket.emit('tv:haptic', { pid, kind });
  kick = (pid: string) => this.socket.emit('tv:kick', pid);
  pick = (pid: string, character: string, body: string) => this.socket.emit('tv:pick', { pid, character, body });
  ready = (pid: string, ready: boolean) => this.socket.emit('tv:ready', { pid, ready });
  addLocal = () =>
    new Promise<string | null>((resolve) => {
      this.socket.timeout(4000).emit('tv:addLocal', (err, res) => resolve(!err && res.ok ? res.data!.id : null));
    });
  report = (report: Parameters<ClientToServerEvents['tv:report']>[0]) =>
    new Promise<import('@raceoff/shared').RecordNews[]>((resolve) => {
      this.socket.timeout(4000).emit('tv:report', report, (err, res) => resolve(!err && res.ok ? res.data ?? [] : []));
    });
}

export class PhoneLink extends Link {
  onHud: (hud: Hud) => void = () => {};
  onHaptic: (kind: HapticKind) => void = () => {};
  latestHud: Hud | null = null;

  constructor(
    code: string,
    token: string,
    readonly playerId: string,
  ) {
    super({ role: 'player', code, token });
    this.socket.on('hud', (h) => {
      this.latestHud = h;
      this.onHud(h);
    });
    this.socket.on('haptic', (k) => this.onHaptic(k));
  }

  protected override statusChanged(game: GameStatus) {
    // A new race (or the lobby): last race's dashboard no longer applies.
    if (game.phase === 'intro' || game.phase === 'lobby') this.latestHud = null;
  }

  input = (s: number, b: number, i: number) => {
    if (this.socket.connected) this.socket.volatile.emit('p:input', { s, b, i });
  };
  pick = (character: string, body: string) => this.socket.emit('p:pick', { character, body });
  ready = (ready: boolean) => this.socket.emit('p:ready', ready);
  settings = (patch: Parameters<ClientToServerEvents['p:settings']>[0]) => this.socket.emit('p:settings', patch);
  command = (cmd: MenuCommand) => this.socket.emit('p:command', cmd);
  rename = (name: string) => this.socket.emit('p:rename', name);
  leave = () => this.socket.emit('p:leave');
  giant = (kind: GiantKind, target: number) => this.socket.emit('p:giant', { kind, target });
}

export function useLink<L extends Link>(link: L | null): LinkSnapshot | null {
  useEffect(() => {
    if (!link) return;
    link.open();
    return () => link.close();
  }, [link]);
  const subscribe = useCallback((fn: () => void) => link?.subscribe(fn) ?? (() => {}), [link]);
  return useSyncExternalStore(subscribe, () => link?.getSnapshot() ?? null);
}

// ---------------------------------------------------------------- HTTP

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `Request failed (${res.status})`), { status: res.status });
  return body as T;
}

export const api = {
  createRoom: () => fetch('/api/rooms', { method: 'POST' }).then((r) => json<CreateRoomResponse>(r)),
  room: (code: string) => fetch(`/api/rooms/${code}`).then((r) => json<{ code: string; players: number; tv: boolean }>(r)),
  join: (code: string, name: string) =>
    fetch(`/api/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).then((r) =>
      json<JoinResponse>(r),
    ),
  info: () => fetch('/api/info').then((r) => json<{ publicUrl: string | null; lan: string[]; version: string }>(r)),
  records: () => fetch('/api/records').then((r) => json<import('@raceoff/shared').RecordsView>(r)),
};

/** The settings page's calls. Signed-in calls carry this browser's session; a 401 means it has ended. */
export class SignedOut extends Error {}

async function adminCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = adminToken.get();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`/api/admin${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && token && !['/login', '/setup', '/password'].includes(path)) {
    adminToken.set(null);
    throw new SignedOut('Signed out');
  }
  return json<T>(res);
}
const signIn = (p: Promise<{ token: string }>) => p.then(({ token }) => void adminToken.set(token));

export const adminApi = {
  status: () => adminCall<AdminStatus>('GET', '/status'),
  setup: (code: string, password: string) => signIn(adminCall('POST', '/setup', { code, password })),
  login: (password: string) => signIn(adminCall('POST', '/login', { password })),
  logout: () => adminCall('POST', '/logout').finally(() => adminToken.set(null)),
  view: () => adminCall<AdminView>('GET', ''),
  save: (settings: ServerSettings) => adminCall<AdminView>('PUT', '/settings', settings),
  password: (current: string, next: string) => signIn(adminCall('POST', '/password', { current, next })),
  revokeOthers: () => adminCall<AdminView>('POST', '/sessions/revoke'),
  closeRoom: (code: string) => adminCall<AdminView>('DELETE', `/rooms/${code}`),
  resetRecords: () => adminCall<AdminView>('POST', '/records/reset'),
  removeRecord: (name: string) => adminCall<AdminView>('POST', '/records/remove', { name }),
};

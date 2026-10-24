/**
 * One room: a TV, up to four players, and the settings they race with.
 *
 * The TV runs the race itself; the room is the switchboard. It owns who is in
 * the room and what they picked, relays phone inputs to the TV as fast as they
 * come, and passes the TV's race status and dashboards back out. A phone can
 * only ever speak for its own player, and only the VIP can change settings.
 */
import {
  BodyIdSchema, CharacterIdSchema, CHARACTERS, GameStatusSchema, GiantMoveSchema, HAPTIC_KINDS, HudsSchema, IDLE_STATUS, InputSchema, MAX_PLAYERS,
  MenuCommandSchema, NameSchema, PickSchema, RaceReportSchema, RoomSettingsPatchSchema, RoomSettingsSchema,
  type ClientToServerEvents, type GameStatus, type LiveRoomView, type PlayerInfo, type RoomSettings, type RoomView, type ServerToClientEvents,
} from '@raceoff/shared';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { Records } from './records';
import { log, randomId, randomToken, sha256, tokenMatches } from './util';

export interface SocketData {
  role: 'tv' | 'player';
  code: string;
  playerId?: string;
}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface Seat {
  info: PlayerInfo;
  tokenHash: string;
  socket: AppSocket | null;
  joinedAt: number;
}

/**
 * What survives a server restart: everything but the sockets and the race, which the TV starts again from its
 * lobby. Checked on loading; settings are checked on their own, so a room with outdated ones still comes back.
 */
export const RoomSnapshotSchema = z.object({
  code: z.string(),
  keyHash: z.string(),
  settings: z.unknown(),
  seats: z.array(z.object({
    info: z.object({
      id: z.string(), name: z.string(), slot: z.number().int().min(0).max(MAX_PLAYERS - 1), character: z.string(), body: z.string(),
      ready: z.boolean(), connected: z.boolean(), local: z.boolean(),
    }),
    tokenHash: z.string(),
    joinedAt: z.number(),
  })),
  localCount: z.number(),
  createdAt: z.number().optional(),
  updatedAt: z.number(),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export class Room {
  private seats = new Map<string, Seat>();
  private tv: AppSocket | null = null;
  private settings: RoomSettings;
  private status: GameStatus = IDLE_STATUS;
  private pending = false;
  private localCount = 0;
  /** Names of the players when the race under way began; null once its result is in. One report per race. */
  private racing: Set<string> | null = null;
  /** Whether a TV has ever attached: a room nobody opened on a TV expires much sooner. */
  hadTv = false;
  createdAt = Date.now();
  updatedAt = Date.now();
  /** When the TV was last seen, for expiry. */
  tvSeenAt = Date.now();

  constructor(
    private io: AppServer,
    readonly code: string,
    private keyHash: string,
    private records: Records,
    /** What the lobby starts on: the server's defaults for new rooms. */
    settings: RoomSettings,
  ) {
    this.settings = { ...settings };
  }

  isTv(key: string) {
    return tokenMatches(key, this.keyHash);
  }

  playerFor(token: string): string | null {
    for (const [id, seat] of this.seats) if (!seat.info.local && tokenMatches(token, seat.tokenHash)) return id;
    return null;
  }

  get playerCount() {
    return this.seats.size;
  }

  get tvConnected() {
    return !!this.tv?.connected;
  }

  /** Called after anything worth saving changes. */
  onChange: () => void = () => {};

  snapshot(): RoomSnapshot {
    return {
      code: this.code, keyHash: this.keyHash, settings: this.settings, localCount: this.localCount,
      createdAt: this.createdAt, updatedAt: this.updatedAt,
      seats: [...this.seats.values()].map((s) => ({ info: s.info, tokenHash: s.tokenHash, joinedAt: s.joinedAt })),
    };
  }

  /**
   * A room brought back after a restart. Phones and the TV reconnect on their own with what they kept; until the
   * TV says otherwise the room is in its lobby, so no phone shows a race that has gone.
   */
  static restore(io: AppServer, snap: RoomSnapshot, records: Records, defaults: RoomSettings): Room {
    const settings = RoomSettingsSchema.safeParse(snap.settings);
    const room = new Room(io, snap.code, snap.keyHash, records, settings.success ? settings.data : defaults);
    room.localCount = snap.localCount;
    // Its TV may just not be back yet: it gets the usual idle time.
    room.hadTv = true;
    room.createdAt = snap.createdAt ?? snap.updatedAt;
    room.updatedAt = snap.updatedAt;
    room.tvSeenAt = Date.now();
    for (const s of snap.seats) room.seats.set(s.info.id, { info: { ...s.info, connected: s.info.local }, tokenHash: s.tokenHash, socket: null, joinedAt: s.joinedAt });
    return room;
  }

  /** For the settings page's list of live rooms. */
  summary(): LiveRoomView {
    return {
      code: this.code, tv: this.tvConnected, phase: this.status.phase, createdAt: this.createdAt, updatedAt: this.updatedAt,
      players: [...this.seats.values()].sort((a, b) => a.info.slot - b.info.slot).map((s) => ({ name: s.info.name, connected: s.info.connected, local: s.info.local })),
    };
  }

  private touch() {
    this.updatedAt = Date.now();
    this.onChange();
  }

  // ---------------------------------------------------------------- roster

  private freeSlot(): number {
    const used = new Set([...this.seats.values()].map((s) => s.info.slot));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return -1;
  }

  private uniqueName(name: string, except?: string): string {
    const taken = new Set([...this.seats.values()].filter((s) => s.info.id !== except).map((s) => s.info.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; n < 10; n++) {
      const candidate = `${name.slice(0, 10)} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name.slice(0, 8)} ${randomId(1)}`;
  }

  /** A character nobody else has picked yet, so new arrivals look different from the start. */
  private freeCharacter(): string {
    const used = new Set([...this.seats.values()].map((s) => s.info.character));
    return CHARACTERS.find((c) => !used.has(c.id))?.id ?? CHARACTERS[0].id;
  }

  join(rawName: string, local = false): { token: string; playerId: string } | { error: string } {
    const parsed = NameSchema.safeParse(rawName);
    if (!parsed.success) return { error: 'Pick a name of 1 to 12 letters.' };
    const slot = this.freeSlot();
    if (slot < 0) return { error: 'This room is full: four players are already in.' };
    const id = randomId(6);
    const token = randomToken();
    this.seats.set(id, {
      info: {
        id, name: this.uniqueName(parsed.data), slot, character: this.freeCharacter(), body: 'racer',
        ready: false, connected: local, local,
      },
      tokenHash: sha256(token),
      socket: null,
      joinedAt: Date.now(),
    });
    this.touch();
    this.broadcastRoom();
    log.info('player joined', { code: this.code, id, local });
    return { token, playerId: id };
  }

  private remove(id: string, reason: string) {
    const seat = this.seats.get(id);
    if (!seat) return;
    this.seats.delete(id);
    if (seat.socket) {
      seat.socket.emit('bye', reason);
      seat.socket.disconnect(true);
    }
    this.touch();
    this.broadcastRoom();
  }

  /** The first player to have joined with a phone runs the menus; while that phone is away, the next one here does. */
  private get vip(): string | null {
    const phones = [...this.seats.values()].filter((s) => !s.info.local);
    phones.sort((a, b) => Number(b.info.connected) - Number(a.info.connected) || a.joinedAt - b.joinedAt);
    return phones[0]?.info.id ?? null;
  }

  view(): RoomView {
    const players = [...this.seats.values()].map((s) => s.info).sort((a, b) => a.slot - b.slot);
    return { code: this.code, players, settings: this.settings, vip: this.vip, tvConnected: this.tvConnected };
  }

  /** Coalesce several changes in one tick into a single message. */
  private broadcastRoom() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.io.to(this.code).emit('room', this.view());
    });
  }

  // ---------------------------------------------------------------- sockets

  attachTv(socket: AppSocket) {
    if (this.tv && this.tv.id !== socket.id) {
      // A second TV tab takes over; the first is told why it went quiet.
      this.tv.emit('bye', 'replaced');
      this.tv.disconnect(true);
    }
    this.tv = socket;
    this.hadTv = true;
    this.tvSeenAt = Date.now();
    void socket.join(this.code);
    socket.emit('room', this.view());
    socket.emit('status', this.status);

    socket.on('tv:settings', (patch) => this.applySettings(patch));
    socket.on('tv:status', (raw) => {
      const parsed = GameStatusSchema.safeParse(raw);
      if (!parsed.success) return;
      const status = parsed.data;
      if (status.phase === 'race' && this.status.phase !== 'race') this.racing = new Set([...this.seats.values()].map((s) => s.info.name));
      this.status = status;
      this.touch();
      socket.to(this.code).emit('status', status);
      // Back in the lobby, everyone readies up afresh.
      if (status.phase === 'lobby') this.resetReady();
    });
    socket.on('tv:hud', (raw) => {
      const huds = HudsSchema.safeParse(raw);
      if (!huds.success) return;
      for (const [pid, hud] of Object.entries(huds.data)) this.seats.get(pid)?.socket?.emit('hud', hud);
    });
    socket.on('tv:haptic', (msg) => {
      if (!msg || !HAPTIC_KINDS.includes(msg.kind)) return;
      this.seats.get(msg.pid)?.socket?.emit('haptic', msg.kind);
    });
    socket.on('tv:kick', (pid) => {
      if (typeof pid === 'string') this.remove(pid, 'kicked');
    });
    socket.on('tv:addLocal', (ack) => {
      if (typeof ack !== 'function') return;
      const res = this.join(`Keys ${this.localCount + 1}`, true);
      if (!('error' in res)) this.localCount++;
      ack('error' in res ? { ok: false, error: res.error } : { ok: true, data: { id: res.playerId } });
    });
    socket.on('tv:pick', (msg) => {
      const seat = msg && this.seats.get(msg.pid);
      if (!seat?.info.local) return;
      const c = CharacterIdSchema.safeParse(msg.character);
      const b = BodyIdSchema.safeParse(msg.body);
      if (c.success) seat.info.character = c.data;
      if (b.success) seat.info.body = b.data;
      this.touch();
      this.broadcastRoom();
    });
    socket.on('tv:ready', (msg) => {
      const seat = msg && this.seats.get(msg.pid);
      if (!seat?.info.local) return;
      seat.info.ready = !!msg.ready;
      this.touch();
      this.broadcastRoom();
    });
    socket.on('tv:report', (report, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = RaceReportSchema.safeParse(report);
      if (!parsed.success) return ack({ ok: false, error: 'bad report' });
      // The TV is trusted with the times, but only for a race it ran, once, and for the players who were in it.
      const racing = this.racing;
      this.racing = null;
      if (!racing) return ack({ ok: false, error: 'no race to report' });
      const { results, cupWinner } = parsed.data;
      const winner = cupWinner !== null && racing.has(cupWinner) ? cupWinner : null;
      // Each name once: deleting it as it is used turns away a second result under the same name.
      ack({ ok: true, data: this.records.report({ ...parsed.data, results: results.filter((r) => racing.delete(r.name)), cupWinner: winner }) });
    });
    socket.on('disconnect', () => {
      if (this.tv?.id !== socket.id) return;
      this.tv = null;
      this.tvSeenAt = Date.now();
      this.broadcastRoom();
    });
    this.broadcastRoom();
  }

  attachPlayer(socket: AppSocket, playerId: string) {
    const seat = this.seats.get(playerId);
    if (!seat) return void socket.disconnect(true);
    if (seat.socket && seat.socket.id !== socket.id) {
      seat.socket.emit('bye', 'replaced');
      seat.socket.disconnect(true);
    }
    seat.socket = socket;
    seat.info.connected = true;
    void socket.join(this.code);
    socket.emit('room', this.view());
    socket.emit('status', this.status);
    this.touch();
    this.broadcastRoom();

    // Inputs are the hot path: parsed, stamped with who sent them, and passed straight on. Not volatile: a
    // volatile packet is dropped while the TV's socket is still writing the last one, which is exactly when
    // two phones' inputs arrive together. They are tiny, so queueing one for a moment costs nothing.
    socket.on('p:input', (raw) => {
      const input = InputSchema.safeParse(raw);
      if (!input.success || !this.tv) return;
      this.tv.emit('input', { ...input.data, pid: playerId });
    });
    socket.on('p:pick', (raw) => {
      const pick = PickSchema.safeParse(raw);
      if (!pick.success) return;
      seat.info.character = pick.data.character;
      seat.info.body = pick.data.body;
      this.touch();
      this.broadcastRoom();
    });
    socket.on('p:ready', (ready) => {
      seat.info.ready = !!ready;
      this.touch();
      this.broadcastRoom();
    });
    socket.on('p:rename', (raw) => {
      const name = NameSchema.safeParse(raw);
      if (!name.success) return;
      seat.info.name = this.uniqueName(name.data, playerId);
      this.touch();
      this.broadcastRoom();
    });
    socket.on('p:settings', (patch) => {
      if (this.vip !== playerId) return;
      this.applySettings(patch);
    });
    socket.on('p:command', (raw) => {
      const cmd = MenuCommandSchema.safeParse(raw);
      if (!cmd.success || this.vip !== playerId || !this.tv) return;
      this.tv.emit('command', { pid: playerId, cmd: cmd.data });
    });
    // A giant's move goes to the TV, which runs the race and decides whether it can happen.
    socket.on('p:giant', (raw) => {
      const move = GiantMoveSchema.safeParse(raw);
      if (!move.success || !this.tv) return;
      this.tv.emit('giant', { ...move.data, pid: playerId });
    });
    socket.on('p:leave', () => this.remove(playerId, 'left'));
    socket.on('disconnect', () => {
      if (seat.socket?.id !== socket.id) return;
      seat.socket = null;
      seat.info.connected = false;
      this.broadcastRoom();
    });
  }

  private applySettings(raw: unknown) {
    const patch = RoomSettingsPatchSchema.safeParse(raw);
    if (!patch.success) return;
    const next = RoomSettingsSchema.safeParse({ ...this.settings, ...patch.data });
    if (!next.success) return;
    this.settings = next.data;
    this.touch();
    this.broadcastRoom();
  }

  private resetReady() {
    let changed = false;
    for (const s of this.seats.values()) {
      if (s.info.ready && !s.info.local) {
        s.info.ready = false;
        changed = true;
      }
    }
    if (changed) this.broadcastRoom();
  }

  close(reason: string) {
    this.io.to(this.code).emit('bye', reason);
    this.io.in(this.code).disconnectSockets(true);
  }
}

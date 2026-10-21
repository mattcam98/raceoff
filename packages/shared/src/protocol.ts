/**
 * Everything that travels between the server, the TV and the phones.
 *
 * The TV runs the race. The server keeps the room (who is in it, what they
 * picked, the race settings) and relays: phone inputs go to the TV, the TV's
 * race status goes to every phone, and each phone gets its own dashboard.
 * Messages from phones are parsed with the schemas below before anything
 * reads them.
 */
import { z } from 'zod';
import { BODIES, CHARACTERS, CUPS, ITEMS, MAX_PLAYERS, MAX_RACERS, TRACKS } from './roster';

export const ROOM_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;
export const normalizeRoomCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);

export const NAME_MAX = 12;

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as unknown as [T[number]['id'], ...T[number]['id'][]];

export const CharacterIdSchema = z.enum(ids(CHARACTERS));
export const BodyIdSchema = z.enum(ids(BODIES));
export const TrackIdSchema = z.enum(ids(TRACKS));
export const CupIdSchema = z.enum(ids(CUPS));
export const ItemIdSchema = z.enum(ids(ITEMS));

// ---------------------------------------------------------------- settings

export const RoomSettingsSchema = z.object({
  /** One race on one track, or a cup of three with points. */
  mode: z.enum(['race', 'gp']),
  track: z.union([TrackIdSchema, z.literal('random')]),
  cup: CupIdSchema,
  /** Engine class: how fast everything goes. */
  cc: z.union([z.literal(50), z.literal(100), z.literal(150)]),
  /** Fill the grid with computer racers up to this many karts in total. */
  racers: z.number().int().min(1).max(MAX_RACERS),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  items: z.enum(['normal', 'frantic', 'off']),
  laps: z.number().int().min(1).max(5),
  /** Split screen gives every player their own view; shared is one table-top camera. */
  camera: z.enum(['split', 'shared']),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;
export const RoomSettingsPatchSchema = RoomSettingsSchema.partial();
export type RoomSettingsPatch = z.infer<typeof RoomSettingsPatchSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  mode: 'gp',
  track: 'breakfast',
  cup: 'home',
  cc: 100,
  racers: 8,
  difficulty: 'normal',
  items: 'normal',
  laps: 3,
  camera: 'split',
};

// ---------------------------------------------------------------- room

export interface PlayerInfo {
  id: string;
  name: string;
  /** 0-3: their screen quarter, colour ring and controller label. */
  slot: number;
  character: string;
  body: string;
  ready: boolean;
  connected: boolean;
  /** Played from the TV's keyboard rather than a phone. */
  local: boolean;
}

export interface RoomView {
  code: string;
  players: PlayerInfo[];
  settings: RoomSettings;
  /** The player whose phone can change settings and start the race. */
  vip: string | null;
  tvConnected: boolean;
}

// ---------------------------------------------------------------- race status (TV → everyone)

export type Phase = 'lobby' | 'intro' | 'race' | 'results' | 'standings' | 'podium';

export interface Standing {
  /** Player id, or `cpu:N` for a computer racer. */
  id: string;
  name: string;
  character: string;
  cpu: boolean;
  place: number;
  /** Race time in ms, or null if they had not finished when the race ended. */
  time: number | null;
  bestLap: number | null;
  points: number;
  total: number;
}

export interface GameStatus {
  phase: Phase;
  track: string | null;
  /** Which race of the cup, from 0. */
  raceIndex: number;
  raceCount: number;
  /** Results of the last race (results phase) or the cup so far (standings, podium). */
  standings: Standing[];
  /** Records broken in the race just run, for the phones to celebrate. */
  records: RecordNews[];
  paused: boolean;
  /** Players with a kart in the race under way: anyone else joined too late for it. */
  racers: string[];
}

export const IDLE_STATUS: GameStatus = { phase: 'lobby', track: null, raceIndex: 0, raceCount: 0, standings: [], records: [], paused: false, racers: [] };

/** One phone's dashboard while racing. Sent only when it changes. */
export interface Hud {
  place: number;
  racers: number;
  lap: number;
  laps: number;
  item: string | null;
  /** Uses left of a triple item. */
  count: number;
  /** The item roulette is spinning. */
  rolling: boolean;
  finished: boolean;
  /** Final race time, once finished. */
  time: number | null;
  /** Drift charge 0 (none) to 3 (purple sparks). */
  charge: number;
  /** 'countdown' before the start, 'go' once racing. */
  stage: 'countdown' | 'go' | 'done';
  /** Spinning, flying or being put back on the track: input does nothing. */
  stunned: boolean;
  wrongWay: boolean;
}

export type HapticKind = 'hit' | 'item' | 'boost' | 'bump' | 'lap' | 'finish' | 'go' | 'tick';

// ---------------------------------------------------------------- input (phone → TV)

/** Button bits in `Input.b`. */
export const BTN = {
  gas: 1,
  brake: 2,
  drift: 4,
  /** Held to aim an item backwards, like holding back on a stick. */
  back: 8,
} as const;

export const InputSchema = z.object({
  /** Steering, -100 (full left) to 100 (full right). */
  s: z.number().int().min(-100).max(100),
  b: z.number().int().min(0).max(255),
  /** Counts item presses. A press is any increase, so a lost packet cannot eat one. */
  i: z.number().int().min(0).max(1_000_000),
});
export type Input = z.infer<typeof InputSchema>;

export interface RelayedInput extends Input {
  pid: string;
}

// ---------------------------------------------------------------- records

export interface RecordEntry {
  name: string;
  character: string;
  time: number;
  /** Epoch ms. */
  at: number;
}

export interface TrackRecords {
  bestLap: RecordEntry | null;
  /** Fastest races, best first, at most ten. Only from the standard three laps. */
  races: RecordEntry[];
}

export interface PlayerTally {
  name: string;
  races: number;
  wins: number;
  podiums: number;
  /** Grand Prix cups won. */
  cups: number;
}

export interface RecordsView {
  tracks: Record<string, TrackRecords>;
  players: PlayerTally[];
}

export interface RecordNews {
  kind: 'lap' | 'race';
  track: string;
  name: string;
  time: number;
}

export const RaceReportSchema = z.object({
  track: TrackIdSchema,
  laps: z.number().int().min(1).max(5),
  cc: z.union([z.literal(50), z.literal(100), z.literal(150)]),
  /** Human players only: computer racers set no records. */
  results: z
    .array(
      z.object({
        name: z.string().min(1).max(NAME_MAX),
        character: CharacterIdSchema,
        place: z.number().int().min(1).max(MAX_RACERS),
        time: z.number().nullable(),
        bestLap: z.number().nullable(),
      }),
    )
    .max(MAX_PLAYERS),
  /** Set on the last race of a cup: the name of the human who won it, if one did. */
  cupWinner: z.string().max(NAME_MAX).nullable(),
});
export type RaceReport = z.infer<typeof RaceReportSchema>;

// ---------------------------------------------------------------- handshakes and events

export const HandshakeSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('tv'), code: z.string(), key: z.string() }),
  z.object({ role: z.literal('player'), code: z.string(), token: z.string() }),
]);
export type Handshake = z.infer<typeof HandshakeSchema>;

export const PickSchema = z.object({ character: CharacterIdSchema, body: BodyIdSchema });
export const NameSchema = z.string().trim().min(1).max(NAME_MAX);

/** What a VIP phone can ask the TV to do between races. */
export const MenuCommandSchema = z.enum(['start', 'next', 'again', 'lobby', 'skip', 'pause', 'resume']);
export type MenuCommand = z.infer<typeof MenuCommandSchema>;

export interface Ack<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface ServerToClientEvents {
  room: (room: RoomView) => void;
  status: (status: GameStatus) => void;
  /** To one phone. */
  hud: (hud: Hud) => void;
  haptic: (kind: HapticKind) => void;
  /** To the TV. */
  input: (input: RelayedInput) => void;
  command: (cmd: { pid: string; cmd: MenuCommand }) => void;
  bye: (reason: string) => void;
}

export interface ClientToServerEvents {
  // TV
  'tv:settings': (patch: RoomSettingsPatch) => void;
  'tv:status': (status: GameStatus) => void;
  'tv:hud': (huds: Record<string, Hud>) => void;
  'tv:haptic': (msg: { pid: string; kind: HapticKind }) => void;
  'tv:kick': (pid: string) => void;
  'tv:addLocal': (ack: (res: Ack<{ id: string }>) => void) => void;
  'tv:pick': (msg: { pid: string; character: string; body: string }) => void;
  'tv:ready': (msg: { pid: string; ready: boolean }) => void;
  'tv:report': (report: RaceReport, ack: (res: Ack<RecordNews[]>) => void) => void;
  // phone
  'p:input': (input: Input) => void;
  'p:pick': (pick: { character: string; body: string }) => void;
  'p:ready': (ready: boolean) => void;
  'p:settings': (patch: RoomSettingsPatch) => void;
  'p:command': (cmd: MenuCommand) => void;
  'p:rename': (name: string) => void;
  'p:leave': () => void;
}

export interface CreateRoomResponse {
  code: string;
  key: string;
}

export interface JoinResponse {
  token: string;
  playerId: string;
}

export const PLAYER_COLORS = ['#ff4d6d', '#3d9bff', '#ffc233', '#3ddc84'] as const;
export const PLAYER_LABELS = ['P1', 'P2', 'P3', 'P4'] as const;

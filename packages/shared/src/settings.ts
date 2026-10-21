/**
 * Server settings, changed by the administrator in the app (/settings) and
 * applied the moment they are saved. There is no configuration file: a new
 * server starts on these defaults and is set up from its own settings page.
 */
import { z } from 'zod';
import { DEFAULT_SETTINGS, RoomSettingsSchema } from './protocol';

export const SETTINGS_LIMITS = {
  roomIdleMinutes: { min: 5, max: 24 * 60, fallback: 30 },
  sessionDays: { min: 1, max: 365, fallback: 30 },
} as const;

const bounded = (key: keyof typeof SETTINGS_LIMITS) => {
  const { min, max, fallback } = SETTINGS_LIMITS[key];
  return z.number().int().min(min).max(max).default(fallback);
};

const ORIGIN = /^(https?):\/\/([a-z0-9.-]+|\[[0-9a-f:]+\])(:\d{1,5})?\/?$/i;

/**
 * `https://race.example.com` from anything that is exactly an address (scheme, host, optional
 * port), otherwise null. Paths are refused because the app is always served from the root.
 */
export function publicOrigin(value: string): string | null {
  const match = ORIGIN.exec(value.trim());
  return match ? `${match[1]}://${match[2]}${match[3] ?? ''}`.toLowerCase() : null;
}

/** How many reverse proxies sit in front of the server, and what each value means. */
export const PROXY_CHOICES = [
  { value: 0, label: 'None', help: 'Phones and the TV reach this server directly.' },
  { value: 1, label: 'One proxy', help: 'Behind Nginx Proxy Manager, Caddy or Traefik.' },
  { value: 2, label: 'Cloudflare + proxy', help: 'Cloudflare in front of a local proxy.' },
] as const;

export const ServerSettingsSchema = z.object({
  /** The address phones open, shown in the lobby and its QR code. Null: whatever address the TV was opened with. */
  publicUrl: z
    .string()
    .max(200)
    .refine((v) => publicOrigin(v) !== null, 'Enter just the address, like https://race.example.com')
    .transform((v) => publicOrigin(v)!)
    .nullable()
    .default(null),
  /** Reverse proxies in front of the server, so rate limits see each phone's own address. */
  trustProxy: z.number().int().min(0).max(2).default(0),
  /** Minutes a room is kept after its TV leaves. */
  roomIdleMinutes: bounded('roomIdleMinutes'),
  /** How long a device stays signed in to these settings. */
  sessionDays: bounded('sessionDays'),
  /** What a new room's lobby starts on. */
  roomDefaults: RoomSettingsSchema.default(DEFAULT_SETTINGS),
});
export type ServerSettings = z.infer<typeof ServerSettingsSchema>;

export const PASSWORD_MIN_LENGTH = 8;
export const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(200);

/** The first password, proved with the one-time setup code the server prints in its log. */
export const SetupSchema = z.object({ code: z.string().max(40), password: PasswordSchema });
export const LoginSchema = z.object({ password: z.string().max(200) });
export const ChangePasswordSchema = z.object({ current: z.string().max(200), next: PasswordSchema });
/** Take a name off the Hall of Fame. */
export const RemoveRecordSchema = z.object({ name: z.string().trim().min(1).max(40) });

/** A device signed in to the settings. `id` is a label only; it cannot be used to act as that session. */
export interface AdminSessionView {
  id: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
  agent: string;
  current: boolean;
}

export type AuditAction =
  | 'setup'
  | 'login'
  | 'login.failed'
  | 'logout'
  | 'password.changed'
  | 'password.reset'
  | 'sessions.revoked'
  | 'settings.changed'
  | 'room.closed'
  | 'records.reset'
  | 'records.removed';

export interface AuditEntry {
  at: number;
  action: AuditAction;
  ip: string;
  detail: Record<string, unknown>;
}

export interface LiveRoomView {
  code: string;
  tv: boolean;
  phase: string;
  players: { name: string; connected: boolean; local: boolean }[];
  createdAt: number;
  updatedAt: number;
}

/** Everything the settings page shows, for a signed-in administrator. */
export interface AdminView {
  settings: ServerSettings;
  sessions: AdminSessionView[];
  audit: AuditEntry[];
  rooms: LiveRoomView[];
  server: { version: string; startedAt: number; inContainer: boolean; dataDir: string | null; recordPlayers: number; recordTracks: number };
  /** How this very request arrived, to help pick the proxy setting: the address seen, and the proxies it passed. */
  request: { ip: string; proxies: number };
}

/** Before signing in: whether the server still needs its first password. */
export interface AdminStatus {
  setup: boolean;
}

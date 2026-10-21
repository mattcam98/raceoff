import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@raceoff/shared';

// ---------------------------------------------------------------- logging

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let threshold = LEVELS.info;
export const setLogLevel = (level: Level) => (threshold = LEVELS[level]);

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

/** Structured JSON logs, one object per line. */
export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) =>
    write('error', msg, fields?.err instanceof Error ? { ...fields, err: fields.err.stack ?? fields.err.message } : fields),
};

// ---------------------------------------------------------------- secrets

export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');
export const randomId = (bytes = 6) => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Compare two strings in constant time. */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Tokens are stored hashed, so nothing kept in memory or on disk can be replayed as one. */
export const tokenMatches = (token: string | undefined, hash: string | undefined) => !!token && !!hash && safeEqual(sha256(token), hash);

const derive = (password: string, salt: Buffer, length: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password, salt, length, options, (err, key) => (err ? reject(err) : resolve(key))));

/** scrypt cost: 2^15 blocks of 1 KiB, about 32 MB and a twentieth of a second per guess. */
const SCRYPT = { logN: 15, r: 8, p: 1 };
const scryptOptions = (logN: number, r: number, p: number): ScryptOptions => ({ N: 2 ** logN, r, p, maxmem: 256 * 2 ** logN * r });

/**
 * Hash a password for storage. The cost parameters travel with the hash, so they can be raised later
 * without invalidating existing passwords. The work happens off the main thread, so signing in never
 * stalls a race.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 32, scryptOptions(SCRYPT.logN, SCRYPT.r, SCRYPT.p));
  return ['scrypt', SCRYPT.logN, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const want = Buffer.from(expected, 'base64url');
  const cost = [Number(logN), Number(r), Number(p)] as const;
  // Refuse absurd parameters rather than let a tampered file tie up the server.
  if (!cost.every(Number.isInteger) || cost[0] < 10 || cost[0] > 20 || cost[1] < 1 || cost[1] > 16 || cost[2] < 1 || cost[2] > 4) return false;
  const got = await derive(password, Buffer.from(salt, 'base64url'), want.length, scryptOptions(...cost));
  return got.length === want.length && timingSafeEqual(got, want);
}

export function randomRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

// ---------------------------------------------------------------- rate limiting

/** A token bucket per key: `rate` tokens a second, holding at most `burst`. */
export class Limiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private rate: number,
    private burst: number,
  ) {}

  allow(key: string, cost = 1): boolean {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: now };
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.rate);
    b.at = now;
    if (this.buckets.size > 10_000) this.buckets.clear();
    if (b.tokens < cost) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= cost;
    this.buckets.set(key, b);
    return true;
  }
}

/** The client's address, believing `trust` proxies' X-Forwarded-For entries. IPv4 comes back plain, not as ::ffff:1.2.3.4. */
export function clientAddress(direct: string | undefined, forwarded: string | string[] | undefined, trust: number): string {
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
  const raw = trust > 0 && list.length ? (list[Math.max(0, list.length - trust)] ?? direct) : direct;
  return raw ? raw.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '') : 'unknown';
}

/** Docker and Podman leave these behind in every container. */
export const inContainer = existsSync('/.dockerenv') || existsSync('/run/.containerenv');

/**
 * This machine's addresses on the local network, so a TV opened as localhost can still show phones where to go.
 * None in a container: its addresses are on the container's own network, which phones cannot reach.
 */
export function lanAddresses(): string[] {
  if (inContainer) return [];
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  // Home networks first: 192.168 then 10 then 172.
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

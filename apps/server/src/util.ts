import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
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

/** Tokens are stored hashed, so nothing kept in memory or on disk can be replayed as one. */
export function tokenMatches(token: string | undefined, hash: string | undefined) {
  if (!token || !hash) return false;
  const a = Buffer.from(sha256(token));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
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

/** The client's address, believing `trust` proxies' X-Forwarded-For entries. */
export function clientAddress(direct: string | undefined, forwarded: string | string[] | undefined, trust: number): string {
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
  if (trust > 0 && list.length) return list[Math.max(0, list.length - trust)] ?? direct ?? 'unknown';
  return direct ?? 'unknown';
}

/** This machine's addresses on the local network, so a TV opened as localhost can still show phones where to go. */
export function lanAddresses(): string[] {
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

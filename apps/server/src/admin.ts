/**
 * The administrator: one password, the devices signed in with it, the server
 * settings and an activity log, kept together in DATA_DIR/admin.json.
 *
 * The password is stored only as an scrypt hash. Signing in opens a session:
 * a random token the browser keeps, of which only a hash is stored, so nothing
 * in the file can be used to sign in. A server with no password yet prints a
 * one-time setup code in its log, and the first password can only be set with
 * that code: a fresh install reachable from the internet is never open to
 * whoever finds it first.
 */
import { randomInt } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ROOM_CODE_ALPHABET, ServerSettingsSchema,
  type AdminSessionView, type AuditAction, type AuditEntry, type ServerSettings,
} from '@raceoff/shared';
import { hashPassword, log, randomToken, safeEqual, sha256, verifyPassword } from './util';

const DAY_MS = 24 * 3_600_000;
const MAX_AUDIT = 200;

interface StoredSession {
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
  agent: string;
}

interface AdminFile {
  settings: ServerSettings;
  passwordHash: string | null;
  sessions: StoredSession[];
  audit: AuditEntry[];
}

/** Where a request came from, kept with the session and in the activity log. */
export interface Caller {
  ip: string;
  agent: string;
}

const setupCode = () => {
  let code = '';
  for (let i = 0; i < 8; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};
const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z]/g, '');

async function readAdminFile(file: string): Promise<Partial<AdminFile> | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Partial<AdminFile>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Write to a temporary file and rename it over the old one, so a crash mid-write never leaves half a file. */
async function writeAtomic(file: string, body: string) {
  await writeFile(`${file}.tmp`, body, { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

export class Admin {
  private sessions = new Map<string, StoredSession>();
  private saving = Promise.resolve();
  /** While no password is set: proof that whoever sets it can read this server's log. */
  private code: string | null;

  private constructor(
    private file: string | null,
    public settings: ServerSettings,
    private passwordHash: string | null,
    sessions: StoredSession[],
    private audit: AuditEntry[],
  ) {
    for (const s of sessions) this.sessions.set(s.tokenHash, s);
    this.code = passwordHash ? null : setupCode();
    this.prune();
  }

  /** Load from `dir`, or keep everything in memory when dir is null. */
  static async load(dir: string | null): Promise<Admin> {
    const file = dir ? join(dir, 'admin.json') : null;
    if (dir) await mkdir(dir, { recursive: true });
    let saved: Partial<AdminFile> | null = null;
    try {
      saved = file ? await readAdminFile(file) : null;
    } catch (err) {
      // Refuse to start rather than carry on without the password and quietly offer a new setup code.
      throw new Error(`could not read ${file}: ${String(err)}`);
    }
    let settings = ServerSettingsSchema.parse({});
    if (saved?.settings) {
      // Parsing fills in any setting added since the file was written.
      const parsed = ServerSettingsSchema.safeParse(saved.settings);
      if (parsed.success) settings = parsed.data;
      else log.error('saved settings could not be read; using defaults until they are saved again', { issues: parsed.error.issues.length });
    }
    const admin = new Admin(
      file, settings, typeof saved?.passwordHash === 'string' ? saved.passwordHash : null,
      Array.isArray(saved?.sessions) ? saved.sessions : [], Array.isArray(saved?.audit) ? saved.audit : [],
    );
    if (!saved && file) await admin.save();
    return admin;
  }

  private save() {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    const body: AdminFile = {
      settings: this.settings, passwordHash: this.passwordHash, sessions: [...this.sessions.values()], audit: this.audit,
    };
    const json = JSON.stringify(body, null, 2);
    this.saving = this.saving.then(() => writeAtomic(file, json)).catch((err) => log.error('could not save admin settings', { err }));
    return this.saving;
  }

  /** Record something security-relevant, in the log and on the settings page. */
  note(action: AuditAction, ip: string, detail: Record<string, unknown> = {}) {
    log.info('audit', { action, ip, ...detail });
    this.audit.push({ at: Date.now(), action, ip, detail });
    if (this.audit.length > MAX_AUDIT) this.audit.splice(0, this.audit.length - MAX_AUDIT);
    void this.save();
  }

  get setupCode() {
    return this.code;
  }

  get needsSetup() {
    return this.passwordHash === null;
  }

  /** Forget sessions that have run out. */
  private prune() {
    const now = Date.now();
    for (const s of this.sessions.values()) if (s.expiresAt <= now) this.sessions.delete(s.tokenHash);
  }

  private session(token: string | undefined): StoredSession | null {
    const s = token ? this.sessions.get(sha256(token)) : undefined;
    return s && s.expiresAt > Date.now() ? s : null;
  }

  allows(token: string | undefined): boolean {
    return !this.needsSetup && this.session(token) !== null;
  }

  private open(caller: Caller): string {
    this.prune();
    const token = randomToken(32);
    const now = Date.now();
    const s: StoredSession = {
      tokenHash: sha256(token), createdAt: now, expiresAt: now + this.settings.sessionDays * DAY_MS, ip: caller.ip, agent: caller.agent.slice(0, 200),
    };
    this.sessions.set(s.tokenHash, s);
    void this.save();
    return token;
  }

  /** Set the first password. Needs the setup code from the server's log. */
  async setup(code: string, password: string, caller: Caller): Promise<string | null> {
    if (!this.code || !safeEqual(normalizeCode(code), normalizeCode(this.code))) {
      this.note('login.failed', caller.ip, { during: 'setup' });
      return null;
    }
    this.passwordHash = await hashPassword(password);
    this.sessions.clear();
    this.code = null;
    this.note('setup', caller.ip);
    return this.open(caller);
  }

  async login(password: string, caller: Caller): Promise<string | null> {
    if (!this.passwordHash || !(await verifyPassword(password, this.passwordHash))) {
      this.note('login.failed', caller.ip);
      return null;
    }
    this.note('login', caller.ip);
    return this.open(caller);
  }

  logout(token: string | undefined, caller: Caller) {
    const s = this.session(token);
    if (!s) return;
    this.sessions.delete(s.tokenHash);
    this.note('logout', caller.ip);
  }

  /**
   * Change the password. It needs the current one even from a signed-in browser, so a borrowed session
   * cannot lock the owner out. Every other device is signed out; the caller gets a fresh session.
   */
  async changePassword(current: string, next: string, caller: Caller): Promise<string | null> {
    if (!this.passwordHash || !(await verifyPassword(current, this.passwordHash))) {
      this.note('login.failed', caller.ip, { during: 'password change' });
      return null;
    }
    this.passwordHash = await hashPassword(next);
    this.sessions.clear();
    this.note('password.changed', caller.ip);
    return this.open(caller);
  }

  /** Sign out every device except the one asking. */
  revokeOthers(token: string | undefined, caller: Caller): number {
    const keep = this.session(token)?.tokenHash;
    const ended = [...this.sessions.keys()].filter((h) => h !== keep);
    for (const h of ended) this.sessions.delete(h);
    this.note('sessions.revoked', caller.ip, { count: ended.length });
    return ended.length;
  }

  /** Save validated settings, noting what changed. */
  update(next: ServerSettings, caller: Caller) {
    const changed = (Object.keys(next) as (keyof ServerSettings)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(this.settings[k]));
    if (!changed.length) return;
    const before = this.settings;
    this.settings = next;
    this.note('settings.changed', caller.ip, {
      changes: Object.fromEntries(changed.map((k) => [k, k === 'roomDefaults' ? 'updated' : { from: before[k], to: next[k] }])),
    });
  }

  listSessions(token: string | undefined): AdminSessionView[] {
    this.prune();
    const mine = this.session(token)?.tokenHash;
    return [...this.sessions.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => ({ id: s.tokenHash.slice(0, 12), createdAt: s.createdAt, expiresAt: s.expiresAt, ip: s.ip, agent: s.agent, current: s.tokenHash === mine }));
  }

  /** Newest first. */
  activity(limit = 100): AuditEntry[] {
    return this.audit.slice(-limit).reverse();
  }

  async flush() {
    await this.saving;
  }
}

/**
 * Forget the password and every session, for when the password is lost. Run while the server is stopped,
 * or restart it straight after: on its next start it prints a new setup code.
 */
export async function resetAdminPassword(dir: string): Promise<boolean> {
  const file = join(dir, 'admin.json');
  const saved = await readAdminFile(file);
  if (!saved) return false;
  const audit = Array.isArray(saved.audit) ? saved.audit : [];
  audit.push({ at: Date.now(), action: 'password.reset', ip: 'server', detail: {} });
  await writeAtomic(file, JSON.stringify({ ...saved, passwordHash: null, sessions: [], audit: audit.slice(-MAX_AUDIT) }, null, 2));
  return true;
}

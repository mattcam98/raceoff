/**
 * /settings: the server's own settings, for whoever runs it. A new server is
 * set up here with the one-time code from its log; after that, everything is
 * behind a password and takes effect the moment it is saved.
 */
import {
  CUPS, PASSWORD_MIN_LENGTH, PROXY_CHOICES, SETTINGS_LIMITS, TRACKS, publicOrigin,
  type AdminView, type AuditEntry, type LiveRoomView, type RecordsView, type RoomSettings, type ServerSettings,
} from '@raceoff/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { adminApi, api, SignedOut } from '../lib/net';
import { Logo } from '../ui/Logo';
import '../styles/settings.css';

type Stage = { kind: 'loading' } | { kind: 'setup' } | { kind: 'signin' } | { kind: 'ready'; view: AdminView } | { kind: 'error'; message: string };

export function Settings() {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [, go] = useLocation();

  const load = useCallback(async () => {
    try {
      const { setup } = await adminApi.status();
      if (setup) return setStage({ kind: 'setup' });
      setStage({ kind: 'ready', view: await adminApi.view() });
    } catch (err) {
      if (err instanceof SignedOut || (err as { status?: number }).status === 401) return setStage({ kind: 'signin' });
      setStage({ kind: 'error', message: (err as Error).message });
    }
  }, []);
  useEffect(() => void load(), [load]);
  const onView = useCallback((view: AdminView) => setStage({ kind: 'ready', view }), []);
  const onSignedOut = useCallback(() => setStage({ kind: 'signin' }), []);

  return (
    <main className="set-page">
      <header className="set-head">
        <a href="/" onClick={(e) => (e.preventDefault(), go('/'))} aria-label="RaceOff home">
          <Logo size="s" />
        </a>
        <h1 className="title">Settings</h1>
        <span className="set-head__spacer" />
        {stage.kind === 'ready' && (
          <button className="btn btn--ghost btn--tiny" onClick={() => void adminApi.logout().finally(() => setStage({ kind: 'signin' }))}>
            Sign out
          </button>
        )}
      </header>
      {stage.kind === 'loading' && <div className="spinner" aria-label="Loading" />}
      {stage.kind === 'error' && (
        <div className="set-card set-card--narrow">
          <p className="notice">{stage.message}</p>
          <button className="btn btn--host" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {stage.kind === 'setup' && <Setup onDone={load} />}
      {stage.kind === 'signin' && <SignIn onDone={load} />}
      {stage.kind === 'ready' && <Panel view={stage.view} onView={onView} onSignedOut={onSignedOut} />}
    </main>
  );
}

// ---------------------------------------------------------------- before signing in

function Setup({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const { busy, error, run } = useAction();
  const mismatch = again.length > 0 && again !== password;
  return (
    <form
      className="set-card set-card--narrow set-gate"
      onSubmit={(e) => {
        e.preventDefault();
        if (mismatch) return;
        void run(() => adminApi.setup(code, password).then(onDone));
      }}
    >
      <p className="eyebrow">First time here</p>
      <h2>Set up this server</h2>
      <p>
        Choose the password that protects these settings. To prove the server is yours, enter the setup code it printed in
        its log:
      </p>
      <Copyable text="docker logs raceoff 2>&1 | grep setup" />
      <label className="field">
        <span>Setup code</span>
        <input className="set-input set-input--code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoComplete="off" spellCheck={false} autoFocus />
      </label>
      <label className="field">
        <span>New password</span>
        <input className="set-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} />
      </label>
      <label className="field">
        <span>Same again</span>
        <input className="set-input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
      </label>
      {mismatch && <p className="set-hint set-hint--warn">The two passwords are different.</p>}
      {error && <p className="notice">{error}</p>}
      <button className="btn btn--go btn--big" disabled={busy || !code || password.length < PASSWORD_MIN_LENGTH || again !== password}>
        {busy ? 'Setting up…' : 'Set password'}
      </button>
      <p className="set-hint">At least {PASSWORD_MIN_LENGTH} characters. Lost it later? See “Lost the password” in the README.</p>
    </form>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  return (
    <form
      className="set-card set-card--narrow set-gate"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => adminApi.login(password).then(onDone));
      }}
    >
      <h2>Sign in</h2>
      <p>Enter the settings password for this server.</p>
      <label className="field">
        <span>Password</span>
        <input className="set-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
      </label>
      {error && <p className="notice">{error}</p>}
      <button className="btn btn--go btn--big" disabled={busy || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- signed in

function Panel({ view, onView, onSignedOut }: { view: AdminView; onView: (v: AdminView) => void; onSignedOut: () => void }) {
  const [draft, setDraft] = useState<ServerSettings>(view.settings);
  const [urlText, setUrlText] = useState(view.settings.publicUrl ?? '');
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction(onSignedOut);
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(t);
  }, [saved]);

  // Live rooms change on their own: refresh them while the page is open.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.hidden) return;
      adminApi.view().then(onView, (err) => err instanceof SignedOut && onSignedOut());
    }, 10_000);
    return () => window.clearInterval(t);
  }, [onView, onSignedOut]);

  const fixedUrl = draft.publicUrl !== null;
  const urlValid = !fixedUrl || publicOrigin(urlText) !== null;
  const next: ServerSettings = { ...draft, publicUrl: fixedUrl ? (publicOrigin(urlText) ?? draft.publicUrl) : null };
  const dirty = JSON.stringify(next) !== JSON.stringify(view.settings);
  const patch = (p: Partial<ServerSettings>) => (setSaved(false), setDraft((d) => ({ ...d, ...p })));
  const patchRoom = (p: Partial<RoomSettings>) => patch({ roomDefaults: { ...draft.roomDefaults, ...p } });

  const save = () =>
    run(async () => {
      const v = await adminApi.save(next);
      onView(v);
      setDraft(v.settings);
      setUrlText(v.settings.publicUrl ?? '');
      setSaved(true);
    });
  const discard = () => {
    setDraft(view.settings);
    setUrlText(view.settings.publicUrl ?? '');
  };
  const act = (fn: () => Promise<AdminView>) => run(async () => onView(await fn()));

  const exampleBase = fixedUrl ? (publicOrigin(urlText) ?? 'https://…') : window.location.origin;
  const tip = proxyTip(view.request.proxies, draft.trustProxy);

  return (
    <div className="set-grid">
      <Section title="Phones join at" lead="The address in the lobby and its QR code.">
        <Seg
          value={fixedUrl ? 'fixed' : 'auto'}
          options={[['auto', 'Wherever the TV is'], ['fixed', 'A fixed address']]}
          onChange={(v) => patch({ publicUrl: v === 'fixed' ? (publicOrigin(urlText) ?? window.location.origin) : null })}
        />
        {fixedUrl && (
          <label className="field">
            <span>Address</span>
            <input
              className={`set-input${urlValid ? '' : ' is-bad'}`}
              value={urlText}
              onChange={(e) => (setSaved(false), setUrlText(e.target.value))}
              placeholder="https://race.example.com"
              inputMode="url"
              spellCheck={false}
            />
          </label>
        )}
        {!urlValid && <p className="set-hint set-hint--warn">Just the address, like https://race.example.com: no path after it.</p>}
        <p className="set-hint">
          Phones open <code>{exampleBase.replace(/\/+$/, '')}/join/ABCD</code>.
          {(fixedUrl ? exampleBase : window.location.origin).startsWith('http:') &&
            ' Over plain http, phones cannot steer by tilting or keep their screen awake; an https address can.'}
        </p>
      </Section>

      <Section title="Network" lead="Proxies in front of RaceOff, so each phone is rate-limited on its own address.">
        <Seg value={draft.trustProxy} options={PROXY_CHOICES.map((c) => [c.value, c.label])} onChange={(trustProxy) => patch({ trustProxy })} />
        <p className="set-hint">{PROXY_CHOICES.find((c) => c.value === draft.trustProxy)?.help}</p>
        <p className={`set-hint${tip.warn ? ' set-hint--warn' : ''}`}>{tip.text}</p>
      </Section>

      <Section title="New rooms start with" lead="What the lobby is set to when a room is made. Players can still change it." wide>
        <div className="set-race">
          <Row label="Mode">
            <Seg value={draft.roomDefaults.mode} options={[['gp', 'Grand Prix'], ['race', 'Single race']]} onChange={(mode) => patchRoom({ mode })} />
          </Row>
          {draft.roomDefaults.mode === 'gp' ? (
            <Row label="Cup">
              <Seg value={draft.roomDefaults.cup} options={CUPS.map((c) => [c.id, c.name])} onChange={(cup) => patchRoom({ cup })} />
            </Row>
          ) : (
            <Row label="Track">
              <select className="set-select" value={draft.roomDefaults.track} onChange={(e) => patchRoom({ track: e.target.value as RoomSettings['track'] })}>
                {TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value="random">Surprise me</option>
              </select>
            </Row>
          )}
          <Row label="Speed">
            <Seg value={draft.roomDefaults.cc} options={[[50, '50cc'], [100, '100cc'], [150, '150cc']]} onChange={(cc) => patchRoom({ cc })} />
          </Row>
          <Row label="Computers">
            <Seg value={draft.roomDefaults.difficulty} options={[['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]} onChange={(difficulty) => patchRoom({ difficulty })} />
          </Row>
          <Row label="Items">
            <Seg value={draft.roomDefaults.items} options={[['normal', 'Normal'], ['frantic', 'Frantic'], ['off', 'Off']]} onChange={(items) => patchRoom({ items })} />
          </Row>
          <Row label="Screen">
            <Seg value={draft.roomDefaults.camera} options={[['split', 'Split'], ['shared', 'Shared']]} onChange={(camera) => patchRoom({ camera })} />
          </Row>
          <Row label="Racers">
            <Stepper value={draft.roomDefaults.racers} min={1} max={8} onChange={(racers) => patchRoom({ racers })} />
          </Row>
          <Row label="Laps">
            <Stepper value={draft.roomDefaults.laps} min={1} max={5} onChange={(laps) => patchRoom({ laps })} />
          </Row>
        </div>
      </Section>

      <Section title="Rooms" lead="A room stays open while its TV is connected." wide>
        <Row label="Close a room once its TV has been gone for">
          <Seg
            value={draft.roomIdleMinutes}
            options={withCurrent(IDLE_CHOICES, draft.roomIdleMinutes, minutes)}
            onChange={(roomIdleMinutes) => patch({ roomIdleMinutes })}
          />
        </Row>
        <LiveRooms rooms={view.rooms} busy={busy} onClose={(code) => void act(() => adminApi.closeRoom(code))} />
      </Section>

      <HallOfFame view={view} busy={busy} act={act} />

      <Security view={view} draft={draft} patch={patch} onView={onView} onSignedOut={onSignedOut} />

      <Section title="Activity" lead="Sign-ins and changes, newest first." wide>
        <Activity entries={view.audit} />
      </Section>

      <footer className="set-foot">
        RaceOff {view.server.version} · up {since(view.server.startedAt)}
        {view.server.dataDir ? ` · data in ${view.server.dataDir}` : ' · nothing is saved to disk'}
        {view.server.inContainer && ' · in Docker'}
      </footer>

      {(dirty || saved || error) && (
        <div className={`set-save${dirty ? ' is-dirty' : ''}`} role="status">
          {error ? <span className="set-save__msg set-save__msg--bad">{error}</span> : <span className="set-save__msg">{dirty ? 'Unsaved changes' : 'Saved. Changes apply right away.'}</span>}
          {dirty && (
            <>
              <button className="btn btn--ghost btn--tiny" onClick={discard} disabled={busy}>
                Discard
              </button>
              <button className="btn btn--ready" onClick={() => void save()} disabled={busy || !urlValid}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const IDLE_CHOICES: number[] = [15, 30, 60, 120, 360, 1440];
const minutes = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${(m / 60).toFixed(1)} h`);
/** The preset choices, plus the saved value if it is not one of them. */
function withCurrent(choices: number[], current: number, label: (n: number) => string): [number, string][] {
  const list = choices.includes(current) ? choices : [...choices, current].sort((a, b) => a - b);
  return list.map((n) => [n, label(n)]);
}

function proxyTip(seen: number, chosen: number): { text: string; warn: boolean } {
  const via = seen === 0 ? 'directly, through no proxy' : seen === 1 ? 'through one proxy' : `through ${seen} proxies`;
  if (seen === chosen) return { text: `This page reached the server ${via}, which matches.`, warn: false };
  if (seen > chosen)
    return { text: `This page reached the server ${via}. With fewer set, every phone behind them shares one rate limit.`, warn: true };
  return { text: `This page reached the server ${via}. That is fine if this device is on the local network and phones come through the proxy.`, warn: false };
}

function LiveRooms({ rooms, busy, onClose }: { rooms: LiveRoomView[]; busy: boolean; onClose: (code: string) => void }) {
  if (!rooms.length) return <p className="set-empty">No rooms open right now.</p>;
  return (
    <ul className="set-rooms">
      {rooms.map((r) => (
        <li key={r.code}>
          <b className="set-rooms__code">{r.code}</b>
          <span className={`set-dot${r.tv ? ' is-on' : ''}`} title={r.tv ? 'TV connected' : 'TV away'} />
          <span className="set-rooms__phase">{PHASES[r.phase] ?? r.phase}</span>
          <span className="set-rooms__players">
            {r.players.length ? (
              r.players.map((p, i) => (
                <i key={i} className={p.connected ? '' : 'is-away'} title={p.local ? 'Keyboard player' : p.connected ? 'Connected' : 'Phone away'}>
                  {p.local ? '⌨ ' : ''}
                  {p.name}
                </i>
              ))
            ) : (
              <span className="dim">nobody yet</span>
            )}
          </span>
          <small className="dim">{since(r.createdAt)} old</small>
          <ConfirmButton label="Close" confirm="Close it?" disabled={busy} onConfirm={() => onClose(r.code)} />
        </li>
      ))}
    </ul>
  );
}
const PHASES: Record<string, string> = { lobby: 'Lobby', intro: 'Starting', race: 'Racing', results: 'Results', standings: 'Standings', podium: 'Podium' };

function HallOfFame({ view, busy, act }: { view: AdminView; busy: boolean; act: (fn: () => Promise<AdminView>) => Promise<void> }) {
  const [records, setRecords] = useState<RecordsView | null>(null);
  const stamp = `${view.server.recordPlayers}|${view.server.recordTracks}`;
  useEffect(() => {
    api.records().then(setRecords, () => undefined);
  }, [stamp]);
  // Everyone with a tally or a time, so a name can be taken off however it got on.
  const names = useMemo(() => {
    if (!records) return [];
    const all = new Map<string, string>();
    for (const p of records.players) all.set(p.name.toLowerCase(), p.name);
    for (const t of Object.values(records.tracks)) {
      for (const e of [...t.races, ...(t.bestLap ? [t.bestLap] : [])]) all.set(e.name.toLowerCase(), e.name);
    }
    return [...all.values()].sort((a, b) => a.localeCompare(b));
  }, [records]);
  return (
    <Section
      title="Hall of Fame"
      lead={`${view.server.recordPlayers} ${view.server.recordPlayers === 1 ? 'name' : 'names'} on the board, records on ${view.server.recordTracks} of ${TRACKS.length} tracks.`}
    >
      {names.length ? (
        <ul className="set-names">
          {names.map((n) => (
            <li key={n}>
              <span>{n}</span>
              <ConfirmButton label="Remove" confirm={`Remove ${n}?`} tiny disabled={busy} onConfirm={() => void act(() => adminApi.removeRecord(n))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="set-empty">Nobody on the board yet.</p>
      )}
      <p className="set-hint">Removing a name takes away its wins and times; a best lap it held is cleared.</p>
      <ConfirmButton label="Reset the Hall of Fame" confirm="Wipe every record and name?" danger disabled={busy || !names.length} onConfirm={() => void act(adminApi.resetRecords)} />
    </Section>
  );
}

function Security({ view, draft, patch, onView, onSignedOut }: {
  view: AdminView; draft: ServerSettings; patch: (p: Partial<ServerSettings>) => void; onView: (v: AdminView) => void; onSignedOut: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction(onSignedOut);
  const others = view.sessions.filter((s) => !s.current).length;
  return (
    <Section title="Password and devices" lead="Who can open these settings.">
      <form
        className="set-pass"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await adminApi.password(current, next);
            setCurrent('');
            setNext('');
            setDone(true);
            onView(await adminApi.view());
          });
        }}
      >
        <label className="field">
          <span>Current password</span>
          <input className="set-input" type="password" value={current} onChange={(e) => (setDone(false), setCurrent(e.target.value))} autoComplete="current-password" />
        </label>
        <label className="field">
          <span>New password</span>
          <input className="set-input" type="password" value={next} onChange={(e) => (setDone(false), setNext(e.target.value))} autoComplete="new-password" />
        </label>
        <button className="btn btn--host" disabled={busy || !current || next.length < PASSWORD_MIN_LENGTH}>
          Change password
        </button>
        {error && <p className="notice">{error}</p>}
        {done && <p className="set-hint set-hint--good">Changed. Every other device has been signed out.</p>}
      </form>
      <Row label="Stay signed in for">
        <Seg value={draft.sessionDays} options={withCurrent([1, 7, 30, 90], draft.sessionDays, (d) => (d === 1 ? '1 day' : `${d} days`))} onChange={(sessionDays) => patch({ sessionDays })} />
      </Row>
      <ul className="set-devices">
        {view.sessions.map((s) => (
          <li key={s.id}>
            <b>{device(s.agent)}</b>
            {s.current && <span className="set-tag">This device</span>}
            <small className="dim">
              {s.ip} · signed in {since(s.createdAt)} ago
            </small>
          </li>
        ))}
      </ul>
      <ConfirmButton
        label={`Sign out ${others === 1 ? 'the other device' : `${others} other devices`}`}
        confirm="Sign them out?"
        disabled={!others || busy}
        onConfirm={() => void run(async () => onView(await adminApi.revokeOthers()))}
      />
      <p className="set-hint">
        Rooms can be kept from {SETTINGS_LIMITS.roomIdleMinutes.min} minutes to {SETTINGS_LIMITS.roomIdleMinutes.max / 60} hours after their TV leaves; sign-ins
        last up to {SETTINGS_LIMITS.sessionDays.max} days.
      </p>
    </Section>
  );
}

function Activity({ entries }: { entries: AuditEntry[] }) {
  const [all, setAll] = useState(false);
  if (!entries.length) return <p className="set-empty">Nothing yet.</p>;
  const shown = all ? entries : entries.slice(0, 12);
  return (
    <>
      <div className="set-table" tabIndex={0} role="group" aria-label="Activity">
        <table>
          <tbody>
            {shown.map((e, i) => (
              <tr key={i} className={e.action === 'login.failed' ? 'is-warn' : ''}>
                <td className="dim">{when(e.at)}</td>
                <td>{ACTIONS[e.action] ?? e.action}</td>
                <td className="set-table__detail">{detail(e)}</td>
                <td className="dim">{e.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > shown.length && (
        <button className="btn btn--ghost btn--tiny" onClick={() => setAll(true)}>
          Show all {entries.length}
        </button>
      )}
    </>
  );
}
const ACTIONS: Record<string, string> = {
  setup: 'Server set up', login: 'Signed in', 'login.failed': 'Wrong password or code', logout: 'Signed out',
  'password.changed': 'Password changed', 'password.reset': 'Password reset from the server', 'sessions.revoked': 'Other devices signed out',
  'settings.changed': 'Settings changed', 'room.closed': 'Room closed', 'records.reset': 'Hall of Fame reset', 'records.removed': 'Name removed',
};
const SETTING_NAMES: Record<string, string> = {
  publicUrl: 'phone address', trustProxy: 'proxies', roomIdleMinutes: 'room closing', sessionDays: 'sign-in length', roomDefaults: 'new room setup',
};
function detail(e: AuditEntry): string {
  const d = e.detail as Record<string, unknown>;
  if (e.action === 'settings.changed' && d.changes && typeof d.changes === 'object') {
    return Object.keys(d.changes).map((k) => SETTING_NAMES[k] ?? k).join(', ');
  }
  if (typeof d.code === 'string') return d.code;
  if (typeof d.name === 'string') return d.name;
  if (typeof d.during === 'string') return d.during;
  if (typeof d.count === 'number') return `${d.count}`;
  return '';
}

// ---------------------------------------------------------------- pieces

function Section({ title, lead, wide, children }: { title: string; lead?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`set-card${wide ? ' set-card--wide' : ''}`}>
      <header>
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      <div className="set-card__body">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" className={v === value ? 'is-on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Fewer" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <b>{value}</b>
      <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

/** A button that asks once more before doing something that cannot be undone. */
function ConfirmButton({ label, confirm, onConfirm, disabled, danger, tiny }: {
  label: string; confirm: string; onConfirm: () => void; disabled?: boolean; danger?: boolean; tiny?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = window.setTimeout(() => setAsking(false), 4000);
    return () => window.clearTimeout(t);
  }, [asking]);
  const size = tiny ? ' btn--tiny' : '';
  if (!asking)
    return (
      <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--ghost'}${size}`} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <span className="set-confirm">
      <span>{confirm}</span>
      <button type="button" className={`btn btn--danger${size || ' btn--tiny'}`} onClick={() => (setAsking(false), onConfirm())}>
        Yes
      </button>
      <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  );
}

function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="set-copy">
      <code>{text}</code>
      {navigator.clipboard && (
        <button
          type="button"
          className="btn btn--ghost btn--tiny"
          onClick={() => void navigator.clipboard.writeText(text).then(() => (setCopied(true), window.setTimeout(() => setCopied(false), 1500)), () => undefined)}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </div>
  );
}

/** Run one request at a time, keeping its error for the page. */
function useAction(onSignedOut?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        if (err instanceof SignedOut && onSignedOut) return onSignedOut();
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [onSignedOut],
  );
  return { busy, error, run };
}

function since(at: number): string {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} days`;
}

const when = (at: number) => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A short name for a browser from its user agent. */
function device(agent: string): string {
  const os = /iPhone|iPad/.test(agent) ? 'iPhone / iPad' : /Android/.test(agent) ? 'Android' : /Mac OS X/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : '';
  return browser ? `${browser} on ${os}` : os;
}

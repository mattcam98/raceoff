import {
  BODIES, CHARACTERS, CUPS, NAME_MAX, PLAYER_COLORS, PLAYER_LABELS, TRACKS, characterById, combinedStats, trackById,
  type GameStatus, type Hud, type PlayerInfo, type RoomSettings, type RoomView,
} from '@raceoff/shared';
import { useEffect, useMemo, useState } from 'react';
import { Loading } from '../App';
import { api, PhoneLink, useLink } from '../lib/net';
import { prefs, seat as seatStore, type Seat } from '../lib/storage';
import { formatTime, ordinal, portrait } from '../ui/art';
import { Icon } from '../ui/Icon';
import { Logo } from '../ui/Logo';
import { Face, Medal } from '../ui/Racer';
import { Controller } from './Controller';
import { GiantPanel } from './Giant';
import { buzz } from './haptics';
import '../styles/phone.css';

export function Phone({ code }: { code: string }) {
  const [seat, setSeat] = useState<Seat | null>(() => seatStore.get(code));
  if (!seat) return <Join code={code} onJoined={(s) => (seatStore.set(code, s), setSeat(s))} />;
  return <Seated key={seat.token} code={code} seat={seat} onLost={() => (seatStore.set(code, null), setSeat(null))} />;
}

function Join({ code, onJoined }: { code: string; onJoined: (s: Seat) => void }) {
  const [name, setName] = useState(() => prefs.get('name', ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    // Only a definite "no such room" says so; a network blip or a restarting server still shows the form.
    api.room(code).then(
      () => setExists(true),
      (err: Error & { status?: number }) => setExists(err.status !== 404),
    );
  }, [code]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.join(code, name.trim());
      prefs.set('name', name.trim());
      onJoined({ token: res.token, playerId: res.playerId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="phone phone--join">
      <Logo size="m" />
      {exists === false ? (
        <div className="card">
          <h2>No room called {code}</h2>
          <p>Check the code on the TV and try again.</p>
          <a className="btn btn--go btn--big" href="/">
            Enter a code
          </a>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <p className="eyebrow">Room {code}</p>
          <h2>What should we call you?</h2>
          <input
            className="name-input"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="nickname"
            autoFocus
            enterKeyHint="go"
          />
          {error && <p className="notice">{error}</p>}
          <button className="btn btn--go btn--big" disabled={!name.trim() || busy}>
            {busy ? 'Joining…' : 'Join race'}
          </button>
        </form>
      )}
    </main>
  );
}

function Seated({ code, seat, onLost }: { code: string; seat: Seat; onLost: () => void }) {
  const link = useMemo(() => new PhoneLink(code, seat.token, seat.playerId), [code, seat]);
  const snap = useLink(link);
  useEffect(() => {
    link.onHaptic = (k) => buzz(k);
    if (import.meta.env.DEV) (window as unknown as { raceoffPhone: unknown }).raceoffPhone = link;
  }, [link]);
  useEffect(() => {
    if (snap?.status === 'rejected' && snap.reason === 'unauthorized') onLost();
  }, [snap?.status, snap?.reason, onLost]);

  if (!snap || (!snap.room && snap.status !== 'rejected' && snap.status !== 'ended')) return <Loading text="Connecting…" />;
  if (snap.status === 'rejected') {
    return (
      <main className="phone phone--join">
        <Logo />
        <div className="card">
          <h2>{snap.reason === 'no_room' ? 'That room has closed' : 'Could not rejoin'}</h2>
          <a className="btn btn--go btn--big" href="/">
            Join another
          </a>
        </div>
      </main>
    );
  }
  if (snap.status === 'ended') {
    return (
      <main className="phone phone--join">
        <Logo />
        <div className="card">
          <h2>{snap.reason === 'kicked' ? 'You were removed from the room' : snap.reason === 'replaced' ? 'Opened on another device' : snap.reason === 'left' ? 'You left the room' : 'The room closed'}</h2>
          <button
            className="btn btn--go btn--big"
            onClick={() => {
              // Taken over by another tab or phone: reconnecting with the same seat takes it back. Otherwise the
              // seat is gone, so join afresh.
              if (snap.reason === 'replaced') return window.location.reload();
              seatStore.set(code, null);
              window.location.href = `/join/${code}`;
            }}
          >
            {snap.reason === 'replaced' ? 'Use this phone' : 'Join again'}
          </button>
        </div>
      </main>
    );
  }
  const room = snap.room!;
  const me = room.players.find((p) => p.id === seat.playerId);
  if (!me) return <Loading text="Taking your seat…" />;
  const vip = room.vip === me.id;
  const game = snap.game;
  const offline = snap.status !== 'online';

  let body: React.ReactNode;
  if ((game.phase === 'intro' || game.phase === 'race') && !game.racers.includes(me.id)) {
    body = <Waiting me={me} link={link} vip={vip} />;
  } else if (game.phase === 'intro' || game.phase === 'race') {
    body = <Controller link={link} me={me} game={game} vip={vip} />;
  } else if (game.phase === 'lobby') {
    body = <Pick link={link} me={me} room={room} vip={vip} />;
  } else {
    body = <After link={link} me={me} game={game} vip={vip} room={room} />;
  }
  return (
    <div className="phone-shell" style={{ '--pc': PLAYER_COLORS[me.slot] } as React.CSSProperties}>
      {offline && <div className="offline">Reconnecting…</div>}
      {!room.tvConnected && game.phase !== 'race' && <div className="offline offline--soft">The TV is not connected</div>}
      {body}
    </div>
  );
}

/** Joined while a race was already running: you are in the next one. */
/** Not in this race: the Giant's Hand when it is on, otherwise a wait for the next one. */
function Waiting({ me, link, vip }: { me: PlayerInfo; link: PhoneLink; vip: boolean }) {
  const [hud, setHud] = useState<Hud | null>(link.latestHud);
  useEffect(() => {
    link.onHud = (h) => setHud(h);
    return () => {
      link.onHud = () => {};
    };
  }, [link]);
  if (hud?.giant) {
    return (
      <main className="phone phone--giant">
        <GiantPanel link={link} giant={hud.giant} vip={vip} />
      </main>
    );
  }
  return (
    <main className="phone phone--join">
      <div className="card">
        <p className="eyebrow">{PLAYER_LABELS[me.slot]} · {me.name}</p>
        <h2>Race in progress</h2>
        <p>You're in from the next race. Watch the TV and pick your kart when the lobby comes back.</p>
        <div className="spinner" aria-hidden style={{ margin: '0 auto' }} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- picking a kart

function Pick({ link, me, room, vip }: { link: PhoneLink; me: PlayerInfo; room: RoomView; vip: boolean }) {
  const [view, setView] = useState<'kart' | 'settings'>('kart');
  const ch = characterById(me.character);
  const stats = combinedStats(me.character, me.body);
  const takenBy = (id: string) => room.players.find((p) => p.character === id && p.id !== me.id);
  const pick = (character: string, body: string) => {
    buzz('tick');
    link.pick(character, body);
  };
  return (
    <main className="phone phone--pick">
      <header className="phone-bar">
        <span className="tag">{PLAYER_LABELS[me.slot]}</span>
        <b>{me.name}</b>
        {vip && (
          <nav className="mini-tabs">
            <button className={view === 'kart' ? 'is-on' : ''} onClick={() => setView('kart')}>
              Kart
            </button>
            <button className={view === 'settings' ? 'is-on' : ''} onClick={() => setView('settings')}>
              Race
            </button>
          </nav>
        )}
        <LeaveButton link={link} />
      </header>

      {view === 'settings' && vip ? (
        <VipSettings link={link} room={room} />
      ) : (
        <>
          <section className="pick-hero" style={{ '--cc': ch.color } as React.CSSProperties}>
            <div className="pick-hero__face" dangerouslySetInnerHTML={{ __html: portrait(ch.id) }} />
            <div>
              <h2>{ch.name}</h2>
              <p>{ch.tagline}</p>
              <dl className="stats stats--phone">
                {(['speed', 'accel', 'handling', 'weight'] as const).map((k) => (
                  <div key={k}>
                    <dt>{k === 'accel' ? 'Accel' : k[0].toUpperCase() + k.slice(1)}</dt>
                    <dd>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <i key={n} className={n <= stats[k] ? 'on' : ''} />
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
          <div className="pick-grid" role="radiogroup" aria-label="Character">
            {CHARACTERS.map((c) => {
              const other = takenBy(c.id);
              return (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={c.id === me.character}
                  className={`pick-face${c.id === me.character ? ' is-on' : ''}${other ? ' is-taken' : ''}`}
                  style={{ '--cc': c.color } as React.CSSProperties}
                  disabled={me.ready}
                  onClick={() => pick(c.id, me.body)}
                >
                  <i dangerouslySetInnerHTML={{ __html: portrait(c.id) }} />
                  <span>{c.name}</span>
                  {other && <em style={{ background: PLAYER_COLORS[other.slot] }}>{PLAYER_LABELS[other.slot]}</em>}
                </button>
              );
            })}
          </div>
          <div className="pick-bodies" role="radiogroup" aria-label="Kart">
            {BODIES.map((b) => (
              <button key={b.id} role="radio" aria-checked={b.id === me.body} className={b.id === me.body ? 'is-on' : ''} disabled={me.ready} onClick={() => pick(me.character, b.id)}>
                <b>{b.name}</b>
                <span>{b.tagline}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <footer className="pick-foot">
        {vip ? (
          <>
            <button className={`btn btn--big ${me.ready ? 'btn--ghost' : 'btn--ready'}`} onClick={() => (buzz('tick'), link.ready(!me.ready))}>
              {me.ready ? 'Change kart' : 'Ready'}
            </button>
            <button className="btn btn--go btn--big" onClick={() => (buzz('go'), link.command('start'))}>
              Start {room.settings.mode === 'gp' ? 'cup' : 'race'}
            </button>
          </>
        ) : (
          <button className={`btn btn--big btn--wide ${me.ready ? 'btn--ghost' : 'btn--ready'}`} onClick={() => (buzz('tick'), link.ready(!me.ready))}>
            {me.ready ? 'Ready! Tap to change' : 'Ready'}
          </button>
        )}
      </footer>
      {!vip && <p className="pick-wait">{room.players.find((p) => p.id === room.vip)?.name ?? 'The host'} starts the race.</p>}
    </main>
  );
}

function LeaveButton({ link }: { link: PhoneLink }) {
  const [ask, setAsk] = useState(false);
  if (ask)
    return (
      <span className="leave">
        <button className="btn btn--tiny btn--ghost" onClick={() => setAsk(false)}>
          Stay
        </button>
        <button className="btn btn--tiny btn--danger" onClick={() => link.leave()}>
          Leave
        </button>
      </span>
    );
  return (
    <button className="icon-btn" aria-label="Leave room" onClick={() => setAsk(true)}>
      <Icon name="close" />
    </button>
  );
}

function VipSettings({ link, room }: { link: PhoneLink; room: RoomView }) {
  const s = room.settings;
  const set = (patch: Partial<RoomSettings>) => {
    buzz('tick');
    link.settings(patch);
  };
  return (
    <section className="vip">
      <Field label="Mode">
        <Seg value={s.mode} options={[['gp', 'Grand Prix'], ['race', 'Single race']]} onChange={(mode) => set({ mode })} />
      </Field>
      {s.mode === 'gp' ? (
        <Field label="Cup">
          <Seg value={s.cup} options={CUPS.map((c) => [c.id, c.name] as [typeof c.id, string])} onChange={(cup) => set({ cup })} />
        </Field>
      ) : (
        <Field label="Track">
          <select value={s.track} onChange={(e) => set({ track: e.target.value as RoomSettings['track'] })}>
            {TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="random">Surprise me</option>
          </select>
        </Field>
      )}
      <Field label="Speed">
        <Seg value={s.cc} options={[[50, '50cc'], [100, '100cc'], [150, '150cc']]} onChange={(cc) => set({ cc })} />
      </Field>
      <Field label="Computers">
        <Seg value={s.difficulty} options={[['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]} onChange={(difficulty) => set({ difficulty })} />
      </Field>
      <Field label={`Racers: ${s.racers}`}>
        <input type="range" min={Math.max(1, room.players.length)} max={8} value={s.racers} onChange={(e) => set({ racers: Number(e.target.value) })} />
      </Field>
      <Field label="Items">
        <Seg value={s.items} options={[['normal', 'Normal'], ['frantic', 'Frantic'], ['off', 'Off']]} onChange={(items) => set({ items })} />
      </Field>
      <Field label={`Laps: ${s.laps}`}>
        <input type="range" min={1} max={5} value={s.laps} onChange={(e) => set({ laps: Number(e.target.value) })} />
      </Field>
      <Field label="TV screen">
        <Seg value={s.camera} options={[['split', 'Split screen'], ['shared', 'Shared view']]} onChange={(camera) => set({ camera })} />
      </Field>
      <Field label="Giant's Hand: finished players reach into the race">
        <Seg value={s.giants ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => set({ giants: v === 'on' })} />
      </Field>
    </section>
  );
}

/** A captioned group of controls. Not a <label>: a label passes taps on its caption to the first button inside. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button type="button" key={String(v)} className={v === value ? 'is-on' : ''} onClick={() => v !== value && onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- between races

function After({ link, me, game, vip, room }: { link: PhoneLink; me: PlayerInfo; game: GameStatus; vip: boolean; room: RoomView }) {
  const mine = game.standings.find((s) => s.id === me.id);
  const t = game.track ? trackById(game.track) : null;
  const mineRecords = game.records.filter((r) => r.name === me.name);
  useEffect(() => {
    if (mineRecords.length) buzz('finish');
  }, [mineRecords.length]);
  const single = game.raceCount <= 1;
  const title =
    game.phase === 'podium' ? (game.standings[0]?.id === me.id ? 'You won the cup!' : `Cup over: ${mine ? ordinal(mine.place) : ''}`) :
    game.phase === 'standings' ? 'Cup standings' : mine ? `You came ${ordinal(mine.place)}` : 'Results';
  return (
    <main className="phone phone--after">
      <header className="phone-bar">
        <span className="tag">{PLAYER_LABELS[me.slot]}</span>
        <b>{me.name}</b>
      </header>
      <section className="after-hero">
        {mine && <div className={`after-place after-place--${Math.min(mine.place, 4)}`}>{ordinal(mine.place)}</div>}
        <h2>{title}</h2>
        {t && game.phase === 'results' && <p className="dim">{t.name}</p>}
        {mine && game.phase === 'results' && (
          <p className="after-stats">
            {mine.time !== null ? formatTime(mine.time) : 'Did not finish'} · +{mine.points} pts · {mine.total} total
          </p>
        )}
        {mine && game.phase !== 'results' && <p className="after-stats">{mine.total} points</p>}
        {mineRecords.map((r, i) => (
          <p key={i} className="after-record">
            <Icon name="trophy" /> New {r.kind === 'lap' ? 'lap' : 'track'} record: {formatTime(r.time)}
          </p>
        ))}
      </section>
      <ol className="after-list">
        {game.standings.slice(0, 8).map((s) => {
          const slot = room.players.find((p) => p.id === s.id)?.slot;
          return (
            <li key={s.id} className={s.id === me.id ? 'is-me' : ''} style={{ '--pc': slot !== undefined ? PLAYER_COLORS[slot] : 'transparent' } as React.CSSProperties}>
              <Medal place={s.place} />
              <Face character={s.character} />
              <b>{s.name}</b>
              <em>{s.total}</em>
            </li>
          );
        })}
      </ol>
      {vip ? (
        <footer className="pick-foot">
          {game.phase === 'results' && single ? (
            <>
              <button className="btn btn--ghost btn--big" onClick={() => link.command('lobby')}>
                Lobby
              </button>
              <button className="btn btn--go btn--big" onClick={() => link.command('again')}>
                Race again
              </button>
            </>
          ) : game.phase === 'podium' ? (
            <>
              <button className="btn btn--ghost btn--big" onClick={() => link.command('lobby')}>
                Lobby
              </button>
              <button className="btn btn--go btn--big" onClick={() => link.command('again')}>
                Play again
              </button>
            </>
          ) : (
            <button className="btn btn--go btn--big btn--wide" onClick={() => link.command('next')}>
              {game.phase === 'standings' && game.raceIndex + 1 >= game.raceCount ? 'Trophies!' : 'Next'}
            </button>
          )}
        </footer>
      ) : (
        <p className="pick-wait">Waiting for {room.players.find((p) => p.id === room.vip)?.name ?? 'the host'}…</p>
      )}
    </main>
  );
}


import {
  BODIES, CHARACTERS, CUPS, MAX_PLAYERS, PLAYER_COLORS, PLAYER_LABELS, TRACKS, bodyById, characterById, combinedStats, cupTracks,
  type PlayerInfo, type RecordsView, type RoomSettings, type RoomView,
} from '@raceoff/shared';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { play } from '../audio/sound';
import { api, type TvLink } from '../lib/net';
import { Icon } from '../ui/Icon';
import { Logo } from '../ui/Logo';
import { Face } from '../ui/Racer';
import { RecordsBoard } from '../views/Records';
import type { Director } from './director';
import { SCHEME_HELP } from './keyboard';
import { trackOutline, trackStart } from './trackArt';

const onLoopback = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

/**
 * Where phones should go: the address set in Settings, this machine on the network, or wherever the TV is.
 * `reachable` is false when that is only this machine's loopback, which no phone can open.
 */
function useJoinBase() {
  const [join, setJoin] = useState({ base: window.location.origin, reachable: !onLoopback() });
  useEffect(() => {
    api.info().then(
      (info) => {
        if (info.publicUrl) return setJoin({ base: info.publicUrl.replace(/\/+$/, ''), reachable: true });
        if (onLoopback() && info.lan[0]) {
          setJoin({ base: `${window.location.protocol}//${info.lan[0]}${window.location.port ? `:${window.location.port}` : ''}`, reachable: true });
        }
      },
      () => undefined,
    );
  }, []);
  return join;
}

export function Lobby({ director, link, room }: { director: Director; link: TvLink; room: RoomView }) {
  const { base, reachable } = useJoinBase();
  const url = `${base}/join/${room.code}`;
  const [qr, setQr] = useState<string | null>(null);
  const [tab, setTab] = useState<'race' | 'records'>('race');
  const [records, setRecords] = useState<RecordsView | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#14183a', light: '#ffffff' } }).then(setQr, () => setQr(null));
  }, [url]);
  useEffect(() => {
    if (tab === 'records') api.records().then(setRecords, () => undefined);
  }, [tab]);

  const s = room.settings;
  const set = (patch: Partial<RoomSettings>) => {
    play('select');
    link.settings(patch);
  };
  const seats: (PlayerInfo | null)[] = Array.from({ length: MAX_PLAYERS }, (_, i) => room.players.find((p) => p.slot === i) ?? null);
  const locals = room.players.filter((p) => p.local);
  const ready = room.players.filter((p) => p.ready).length;
  const canStart = room.players.length > 0;

  return (
    <div className="lobby">
      <aside className="lobby__join">
        <Logo size="m" />
        <h2 className="join-title">Grab your phone!</h2>
        <ol className="join-steps">
          <li>
            <span>1</span>Scan, or open on your phone
          </li>
        </ol>
        <div className="join-qr">{qr && <img src={qr} alt={`QR code to join at ${url}`} />}</div>
        <p className="join-url">{base.replace(/^https?:\/\//, '')}</p>
        {!reachable && (
          <p className="notice">
            Phones cannot open <b>localhost</b>. Open this screen at the server's network address, or set the phone
            address under <a href="/settings">Settings</a>.
          </p>
        )}
        <ol className="join-steps" start={2}>
          <li>
            <span>2</span>Enter the room code
          </li>
        </ol>
        <div className="join-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>
          {room.code.split('').map((ch, i) => (
            <b key={i} style={{ animationDelay: `${i * 90}ms` }}>
              {ch}
            </b>
          ))}
        </div>
      </aside>

      <section className="lobby__main">
        <div className="seats">
          {seats.map((p, i) => (
            <Seat key={i} slot={i} player={p} vip={p?.id === room.vip} link={link} localIndex={p?.local ? locals.indexOf(p) : -1} />
          ))}
        </div>

        <div className="lobby__panel">
          <nav className="tabs">
            <button className={tab === 'race' ? 'is-on' : ''} onClick={() => setTab('race')}>
              Race settings
            </button>
            <button className={tab === 'records' ? 'is-on' : ''} onClick={() => setTab('records')}>
              Hall of Fame
            </button>
          </nav>
          {tab === 'race' ? (
            <div className="settings">
              <div className="settings__pick">
              <Row label="Mode">
                <Seg value={s.mode} options={[['gp', 'Grand Prix'], ['race', 'Single race']]} onChange={(mode) => set({ mode })} />
              </Row>
              {s.mode === 'gp' ? (
                <Row label="Cup">
                  <div className="cards">
                    {CUPS.map((c) => (
                      <button key={c.id} className={`cup-card${s.cup === c.id ? ' is-on' : ''}`} onClick={() => set({ cup: c.id })}>
                        <b>
                          <Icon name="trophy" /> {c.name}
                        </b>
                        <span className="cup-card__maps">
                          {cupTracks(c.id).map((t) => (
                            <TrackMap key={t.id} id={t.id} color={t.color} />
                          ))}
                        </span>
                        <span>{cupTracks(c.id).map((t) => t.name).join(' · ')}</span>
                      </button>
                    ))}
                  </div>
                </Row>
              ) : (
                <Row label="Track">
                  <div className="cards cards--tracks">
                    {TRACKS.map((t) => (
                      <button key={t.id} className={`track-card${s.track === t.id ? ' is-on' : ''}`} style={{ '--tc': t.color } as React.CSSProperties} onClick={() => set({ track: t.id })}>
                        <TrackMap id={t.id} color={t.color} />
                        <b>{t.name}</b>
                        <span>{t.place}</span>
                      </button>
                    ))}
                    <button className={`track-card track-card--random${s.track === 'random' ? ' is-on' : ''}`} onClick={() => set({ track: 'random' })}>
                      <span className="track-card__dice" aria-hidden>
                        ?
                      </span>
                      <b>Surprise me</b>
                      <span>Any track</span>
                    </button>
                  </div>
                </Row>
              )}
              </div>
              <div className="settings__grid">
                <Row label="Speed">
                  <Seg value={s.cc} options={[[50, '50cc'], [100, '100cc'], [150, '150cc']]} onChange={(cc) => set({ cc })} />
                </Row>
                <Row label="Computers">
                  <Seg value={s.difficulty} options={[['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]} onChange={(difficulty) => set({ difficulty })} />
                </Row>
                <Row label="Racers">
                  <Stepper value={s.racers} min={Math.max(1, room.players.length)} max={8} onChange={(racers) => set({ racers })} suffix={s.racers > room.players.length ? ` (${s.racers - room.players.length} CPU)` : ''} />
                </Row>
                <Row label="Items">
                  <Seg value={s.items} options={[['normal', 'Normal'], ['frantic', 'Frantic'], ['off', 'Off']]} onChange={(items) => set({ items })} />
                </Row>
                <Row label="Laps">
                  <Stepper value={s.laps} min={1} max={5} onChange={(laps) => set({ laps })} />
                </Row>
                <Row label="Screen">
                  <Seg value={s.camera} options={[['split', 'Split'], ['shared', 'Shared']]} onChange={(camera) => set({ camera })} />
                </Row>
                <Row label="Giant's Hand">
                  <Seg value={s.giants ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => set({ giants: v === 'on' })} />
                </Row>
              </div>
            </div>
          ) : records ? (
            <RecordsBoard data={records} compact />
          ) : (
            <p className="dim">Loading…</p>
          )}
        </div>

        <footer className="lobby__foot">
          <button
            className="btn btn--ghost"
            disabled={room.players.length >= MAX_PLAYERS || locals.length >= 2}
            onClick={() => {
              play('join');
              void link.addLocal();
            }}
          >
            <Icon name="keyboard" /> Keyboard player
          </button>
          <p className="lobby__hint">
            {room.players.length === 0
              ? 'Waiting for racers…'
              : ready === room.players.length
                ? 'Everyone is ready!'
                : room.vip
                  ? `${ready} of ${room.players.length} ready · ${room.players.find((p) => p.id === room.vip)?.name} can start from their phone`
                  : `${ready} of ${room.players.length} ready`}
          </p>
          <button className="btn btn--go btn--big lobby__start" disabled={!canStart} onClick={() => director.command('start')}>
            <Icon name="flag" /> {s.mode === 'gp' ? 'Start Grand Prix' : 'Start race'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Seat({ slot, player, vip, link, localIndex }: { slot: number; player: PlayerInfo | null; vip: boolean; link: TvLink; localIndex: number }) {
  const color = PLAYER_COLORS[slot];
  if (!player)
    return (
      <div className="seat seat--empty" style={{ '--pc': color } as React.CSSProperties}>
        <span className="seat__label">{PLAYER_LABELS[slot]}</span>
        <div className="seat__wait">
          <i />
          <p>Join on your phone</p>
        </div>
      </div>
    );
  const ch = characterById(player.character);
  const body = bodyById(player.body);
  const stats = combinedStats(player.character, player.body);
  const cycle = (dir: number, what: 'character' | 'body') => {
    play('select');
    if (what === 'character') {
      const i = CHARACTERS.findIndex((c) => c.id === player.character);
      link.pick(player.id, CHARACTERS[(i + dir + CHARACTERS.length) % CHARACTERS.length].id, player.body);
    } else {
      const i = BODIES.findIndex((b) => b.id === player.body);
      link.pick(player.id, player.character, BODIES[(i + dir + BODIES.length) % BODIES.length].id);
    }
  };
  return (
    <div className={`seat${player.local ? ' seat--local' : ''}${player.ready ? ' is-ready' : ''}${player.connected ? '' : ' is-away'}`} style={{ '--pc': color, '--cc': ch.color } as React.CSSProperties}>
      <span className="seat__label">
        {PLAYER_LABELS[slot]}
        {vip && <em>Host</em>}
      </span>
      <Face character={ch.id} className="seat__face" />
      <h3 className="seat__name">{player.name}</h3>
      <p className="seat__kart">
        {player.local && (
          <button onClick={() => cycle(-1, 'character')} aria-label="Previous character">
            <Icon name="left" />
          </button>
        )}
        {ch.name} · {body.name}
        {player.local && (
          <button onClick={() => cycle(1, 'character')} aria-label="Next character">
            <Icon name="right" />
          </button>
        )}
      </p>
      <dl className="stats">
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
      {player.local ? (
        <div className="seat__local">
          <small>{SCHEME_HELP[localIndex] ?? ''}</small>
          <div>
            <button className="btn btn--tiny" onClick={() => cycle(1, 'body')}>
              Kart
            </button>
            <button className="btn btn--tiny" onClick={() => link.ready(player.id, !player.ready)}>
              {player.ready ? 'Not ready' : 'Ready'}
            </button>
            <button className="btn btn--tiny btn--ghost" onClick={() => link.kick(player.id)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <>
          <span className="seat__state">
            {player.ready && player.connected && <Icon name="check" />}
            {!player.connected ? 'Phone asleep' : player.ready ? 'Ready!' : 'Choosing…'}
          </span>
          <button className="seat__kick" title={`Remove ${player.name}`} aria-label={`Remove ${player.name}`} onClick={() => link.kick(player.id)}>
            <Icon name="close" />
          </button>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <span className="row__label">{label}</span>
      {children}
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? 'is-on' : ''} onClick={() => v !== value && onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, min, max, onChange, suffix = '' }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="stepper">
      <button disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="Fewer">
        −
      </button>
      <b>
        {value}
        <small>{suffix}</small>
      </b>
      <button disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="More">
        +
      </button>
    </div>
  );
}

/** A track's outline, small, with its start marked. */
function TrackMap({ id, color }: { id: string; color: string }) {
  const start = trackStart(id);
  const d = trackOutline(id);
  return (
    <svg className="track-map" viewBox="0 0 100 64" aria-hidden style={{ '--tc': color } as React.CSSProperties}>
      <path className="track-map__rim" d={d} />
      <path className="track-map__road" d={d} />
      {start && <circle className="track-map__start" cx={start[0]} cy={start[1]} r="3.6" />}
    </svg>
  );
}

import { CUPS, PLAYER_COLORS, PLAYER_LABELS, trackById, type RoomView, type Standing } from '@raceoff/shared';
import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../ui/art';
import { Icon } from '../ui/Icon';
import { Face, Medal } from '../ui/Racer';
import type { Director, DirectorState } from './director';

const TIPS = [
  'Hold DRIFT and steer to slide round corners. Let go when the sparks turn orange for a bigger boost.',
  'Tap DRIFT just as GO appears for a rocket start: the closer to GO, the longer the boost. Too early and you stall!',
  'Tuck in right behind another racer for a moment and their slipstream slings you past.',
  'Purple sparks need you to lean into the bend. Hold out for them and the boost lasts far longer.',
  'New to drifting? Turn on "Drift by itself" or "Smart steering" in your phone’s controls (the cog).',
  'Hold BRAKE while using an item to throw it backwards.',
  'Off-road slows you down, unless you are boosting. Shortcuts love a Nitro.',
  'Press DRIFT in mid-air off a ramp to do a trick and land with a boost.',
  'The Bubble blocks one hit. Triple Balls circle you and block hits too.',
  'Last place gets the best items. Never give up!',
];

function slotOf(room: RoomView, id: string) {
  return room.players.find((p) => p.id === id)?.slot ?? -1;
}

/** A racer's player slot and colour, or a quiet grey for a computer. */
function colourOf(room: RoomView, s: Standing) {
  const slot = s.cpu ? -1 : slotOf(room, s.id);
  return { slot, pc: slot >= 0 ? PLAYER_COLORS[slot] : '#8f8ab8' };
}

function Who({ s, slot }: { s: Standing; slot: number }) {
  return (
    <span className="res-name">
      {slot >= 0 && <em>{PLAYER_LABELS[slot]}</em>}
      <span>{s.name}</span>
    </span>
  );
}

export function IntroCard({ state, room }: { state: DirectorState; room: RoomView }) {
  const t = trackById(state.track);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const cup = CUPS.find((c) => c.id === t.cup);
  const s = room.settings;
  return (
    <div className="intro" style={{ '--tc': t.color } as React.CSSProperties}>
      <div className="intro__card">
        <div className="intro__chips">
          <span className="chip chip--track">
            {state.raceCount > 1 ? `${cup?.name ?? 'Grand Prix'} · Race ${state.raceIndex + 1} of ${state.raceCount}` : 'Single race'}
          </span>
          <span className="chip">{s.cc}cc</span>
          <span className="chip">
            {s.laps} {s.laps === 1 ? 'lap' : 'laps'}
          </span>
        </div>
        <h1 className="intro__title">{t.name}</h1>
        <p className="intro__place">{t.place}</p>
      </div>
      <p className="intro__tip">
        <b>Tip</b>
        {tip}
      </p>
    </div>
  );
}

export function PauseMenu({ director }: { director: Director }) {
  const resume = useRef<HTMLButtonElement>(null);
  // A keyboard or remote lands on Resume, the thing you most likely want.
  useEffect(() => resume.current?.focus(), []);
  return (
    <div className="modal">
      <div className="modal__card pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <span className="pause__icon">
          <Icon name="pause" />
        </span>
        <h2 className="pause__title" id="pause-title">
          Paused
        </h2>
        <button ref={resume} className="btn btn--go btn--big" onClick={() => director.command('resume')}>
          Resume
        </button>
        <button className="btn" onClick={() => director.command('again')}>
          Restart race
        </button>
        <button className="btn btn--ghost" onClick={() => director.command('lobby')}>
          Quit to lobby
        </button>
      </div>
    </div>
  );
}

function Countdown({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  return (
    <span className="auto">
      <Icon name="timer" /> Continuing in {seconds}
    </span>
  );
}

/** The left of the results screens: what this is, over the 3D, leaving the winner's kart in view. */
function Heading({ eyebrow, title, color }: { eyebrow: string; title: string; color?: string }) {
  return (
    <header className="res-heading" style={color ? ({ '--tc': color } as React.CSSProperties) : undefined}>
      <span className="chip chip--track">{eyebrow}</span>
      <h2 className="res-heading__title">{title}</h2>
    </header>
  );
}

export function Results({ state, director, room }: { state: DirectorState; director: Director; room: RoomView }) {
  const t = trackById(state.track);
  const single = state.raceCount === 1;
  const winner = state.results[0];
  return (
    <div className="results">
      <div className="results__side">
        <Heading eyebrow={single ? 'Results' : `Race ${state.raceIndex + 1} of ${state.raceCount}`} title={t.name} color={t.color} />
        {winner && (
          <div className="winner" style={{ '--pc': colourOf(room, winner).pc } as React.CSSProperties}>
            <Face character={winner.character} className="winner__face" />
            <div>
              <span className="winner__label">Winner</span>
              <b className="winner__name">{winner.name}</b>
              {winner.time !== null && <span className="winner__time">{formatTime(winner.time)}</span>}
            </div>
          </div>
        )}
      </div>
      <div className="results__card">
        {state.records.length > 0 && (
          <div className="records-news">
            {state.records.map((r, i) => (
              <p key={i}>
                <Icon name="trophy" /> New {r.kind === 'lap' ? 'lap' : 'track'} record! <b>{r.name}</b> {formatTime(r.time)}
              </p>
            ))}
          </div>
        )}
        <ol className="res-table">
          <li className="res-head" aria-hidden>
            <span />
            <span />
            <span>Racer</span>
            <span>Time</span>
            <span>Pts</span>
            <span>Total</span>
          </li>
          {state.results.map((s, i) => {
            const { slot, pc } = colourOf(room, s);
            return (
              <li key={s.id} className={`res-row${s.cpu ? ' is-cpu' : ''}`} style={{ animationDelay: `${120 + i * 60}ms`, '--pc': pc } as React.CSSProperties}>
                <Medal place={s.place} />
                <Face character={s.character} />
                <Who s={s} slot={slot} />
                <span className="res-time">
                  {s.time !== null ? formatTime(s.time) : <span className="dim">Not home</span>}
                  {s.bestLap !== null && <small>Best lap {formatTime(s.bestLap)}</small>}
                </span>
                <span className="res-pts">+{s.points}</span>
                <span className="res-total">{s.total}</span>
              </li>
            );
          })}
        </ol>
        <footer>
          <Countdown seconds={state.autoIn} />
          {single ? (
            <>
              <button className="btn btn--ghost" onClick={() => director.command('lobby')}>
                Lobby
              </button>
              <button className="btn btn--go" onClick={() => director.command('again')}>
                Race again
              </button>
            </>
          ) : (
            <button className="btn btn--go" onClick={() => director.command('next')}>
              Standings
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export function Standings({ state, director, room }: { state: DirectorState; director: Director; room: RoomView }) {
  const last = state.raceIndex + 1 >= state.raceCount;
  const max = Math.max(1, ...state.standings.map((s) => s.total));
  // What each racer just won, so the bars show it growing onto what they had.
  const gained = new Map(state.results.map((r) => [r.id, r.points]));
  const cup = CUPS.find((c) => c.id === room.settings.cup);
  return (
    <div className="results">
      <div className="results__side">
        <Heading eyebrow={`After race ${state.raceIndex + 1} of ${state.raceCount}`} title={cup?.name ?? 'Cup standings'} />
      </div>
      <div className="results__card">
        <ol className="stand-table">
          {state.standings.map((s, i) => {
            const { slot, pc } = colourOf(room, s);
            const plus = gained.get(s.id) ?? 0;
            return (
              <li key={s.id} className={`stand-row${s.cpu ? ' is-cpu' : ''}`} style={{ animationDelay: `${120 + i * 60}ms`, '--pc': pc } as React.CSSProperties}>
                <Medal place={s.place} />
                <Face character={s.character} />
                <Who s={s} slot={slot} />
                <span className="stand-bar">
                  <i style={{ width: `${((s.total - plus) / max) * 100}%` }} />
                  <i className="stand-bar__new" style={{ width: `${(plus / max) * 100}%`, animationDelay: `${700 + i * 60}ms` }} />
                </span>
                <span className="res-pts">{plus ? `+${plus}` : ''}</span>
                <span className="res-total">{s.total}</span>
              </li>
            );
          })}
        </ol>
        <footer>
          <Countdown seconds={state.autoIn} />
          <button className="btn btn--ghost" onClick={() => director.command('lobby')}>
            Quit cup
          </button>
          <button className="btn btn--go" onClick={() => director.command('next')}>
            {last ? 'Trophy ceremony' : 'Next race'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Podium({ state, director, room }: { state: DirectorState; director: Director; room: RoomView }) {
  const top = state.standings.slice(0, 3);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 900);
    return () => clearTimeout(t);
  }, []);
  const winner = top[0];
  const cup = CUPS.find((c) => c.id === room.settings.cup)?.name ?? 'Cup';
  return (
    <div className="podium">
      <h1 className={`podium__title${show ? ' is-in' : ''}`}>
        <small>
          <Icon name="trophy" /> {winner?.cpu ? `The computer takes the ${cup}` : `${cup} champion`}
        </small>
        {winner ? `${winner.name}!` : 'Cup complete'}
      </h1>
      <ol className="podium__list">
        {top.map((s, i) => {
          const { slot, pc } = colourOf(room, s);
          return (
            <li key={s.id} className={`podium__spot podium__spot--${i + 1}`} style={{ '--pc': pc } as React.CSSProperties}>
              <Medal place={i + 1} />
              <Face character={s.character} />
              <span className="podium__who">
                <b>
                  {slot >= 0 && <em>{PLAYER_LABELS[slot]}</em>}
                  {s.name}
                </b>
                <small>{s.total} pts</small>
              </span>
            </li>
          );
        })}
      </ol>
      <footer>
        <button className="btn btn--ghost" onClick={() => director.command('lobby')}>
          Back to lobby
        </button>
        <button className="btn btn--go" onClick={() => director.command('again')}>
          Play the cup again
        </button>
      </footer>
    </div>
  );
}

import { CUPS, PLAYER_COLORS, PLAYER_LABELS, trackById, type RoomView, type Standing } from '@raceoff/shared';
import { useEffect, useState } from 'react';
import { formatTime, ordinal, portrait } from '../ui/art';
import type { Director, DirectorState } from './director';

const TIPS = [
  'Hold DRIFT and steer to slide round corners. Let go when the sparks turn orange for a bigger boost.',
  'Tap DRIFT just as GO appears for a rocket start: the closer to GO, the longer the boost. Too early and you stall!',
  'Tuck in right behind another racer for a moment and their slipstream slings you past.',
  'Purple sparks need you to lean into the bend. Hold out for them and the boost lasts far longer.',
  'New to drifting? Turn on "Drift by itself" or "Smart steering" in your phone’s ⚙ controls.',
  'Hold BRAKE while using an item to throw it backwards.',
  'Off-road slows you down, unless you are boosting. Shortcuts love a Nitro.',
  'Press DRIFT in mid-air off a ramp to do a trick and land with a boost.',
  'The Bubble blocks one hit. Triple Balls circle you and block hits too.',
  'Last place gets the best items. Never give up!',
];

function slotOf(room: RoomView, id: string) {
  return room.players.find((p) => p.id === id)?.slot ?? -1;
}

export function IntroCard({ state, room }: { state: DirectorState; room: RoomView }) {
  const t = trackById(state.track);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const cup = CUPS.find((c) => c.id === t.cup);
  return (
    <div className="intro" style={{ '--tc': t.color } as React.CSSProperties}>
      <div className="intro__card">
        <span className="intro__eyebrow">
          {state.raceCount > 1 ? `${cup?.name ?? 'Grand Prix'} · Race ${state.raceIndex + 1} of ${state.raceCount}` : 'Single race'} · {room.settings.cc}cc
        </span>
        <h1>{t.name}</h1>
        <p>{t.place}</p>
      </div>
      <p className="intro__tip">
        <b>Tip</b> {tip}
      </p>
    </div>
  );
}

export function PauseMenu({ director }: { director: Director }) {
  return (
    <div className="modal">
      <div className="modal__card">
        <h2 className="title">Paused</h2>
        <button className="btn btn--go btn--big" onClick={() => director.command('resume')}>
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

function Row({ s, room, showPoints, index }: { s: Standing; room: RoomView; showPoints: 'race' | 'total'; index: number }) {
  const slot = s.cpu ? -1 : slotOf(room, s.id);
  return (
    <li className={`res-row${s.cpu ? ' is-cpu' : ''}${s.place === 1 ? ' is-first' : ''}`} style={{ animationDelay: `${index * 70}ms`, '--pc': slot >= 0 ? PLAYER_COLORS[slot] : 'transparent' } as React.CSSProperties}>
      <span className="res-row__place">{ordinal(s.place)}</span>
      <i className="res-row__face" dangerouslySetInnerHTML={{ __html: portrait(s.character) }} />
      <span className="res-row__name">
        {slot >= 0 && <em>{PLAYER_LABELS[slot]}</em>}
        {s.name}
      </span>
      {showPoints === 'race' ? (
        <>
          <span className="res-row__time">{s.time !== null ? formatTime(s.time) : '—'}</span>
          <span className="res-row__lap">{s.bestLap !== null ? formatTime(s.bestLap) : ''}</span>
          <span className="res-row__pts">+{s.points}</span>
        </>
      ) : null}
      <span className="res-row__total">{s.total}</span>
    </li>
  );
}

function Countdown({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  return <span className="auto">Continuing in {seconds}</span>;
}

export function Results({ state, director, room }: { state: DirectorState; director: Director; room: RoomView }) {
  const t = trackById(state.track);
  const single = state.raceCount === 1;
  return (
    <div className="results">
      <div className="results__card">
        <header>
          <span className="eyebrow">{single ? 'Results' : `Race ${state.raceIndex + 1} of ${state.raceCount}`}</span>
          <h2 className="title">{t.name}</h2>
        </header>
        {state.records.length > 0 && (
          <div className="records-news">
            {state.records.map((r, i) => (
              <p key={i}>
                🏆 New {r.kind === 'lap' ? 'lap' : 'track'} record! <b>{r.name}</b> {formatTime(r.time)}
              </p>
            ))}
          </div>
        )}
        <ol className="res-table">
          <li className="res-head">
            <span />
            <span />
            <span>Racer</span>
            <span>Time</span>
            <span>Best lap</span>
            <span>Pts</span>
            <span>Total</span>
          </li>
          {state.results.map((s, i) => (
            <Row key={s.id} s={s} room={room} showPoints="race" index={i} />
          ))}
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
  return (
    <div className="results">
      <div className="results__card">
        <header>
          <span className="eyebrow">After race {state.raceIndex + 1} of {state.raceCount}</span>
          <h2 className="title">Cup standings</h2>
        </header>
        <ol className="stand-table">
          {state.standings.map((s, i) => {
            const slot = s.cpu ? -1 : slotOf(room, s.id);
            return (
              <li key={s.id} className={`stand-row${s.cpu ? ' is-cpu' : ''}`} style={{ animationDelay: `${i * 70}ms`, '--pc': slot >= 0 ? PLAYER_COLORS[slot] : '#8f8ab8' } as React.CSSProperties}>
                <span className="res-row__place">{ordinal(s.place)}</span>
                <i className="res-row__face" dangerouslySetInnerHTML={{ __html: portrait(s.character) }} />
                <span className="res-row__name">
                  {slot >= 0 && <em>{PLAYER_LABELS[slot]}</em>}
                  {s.name}
                </span>
                <span className="stand-bar">
                  <i style={{ width: `${(s.total / max) * 100}%` }} />
                </span>
                <span className="res-row__total">{s.total}</span>
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
  return (
    <div className="podium">
      <h1 className={`podium__title${show ? ' is-in' : ''}`}>
        {winner ? (
          <>
            <small>{winner.cpu ? 'The computer takes the cup' : 'Cup champion'}</small>
            {winner.name}!
          </>
        ) : (
          'Cup complete'
        )}
      </h1>
      <ol className="podium__list">
        {top.map((s, i) => {
          const slot = s.cpu ? -1 : slotOf(room, s.id);
          return (
            <li key={s.id} className={`podium__spot podium__spot--${i + 1}`} style={{ '--pc': slot >= 0 ? PLAYER_COLORS[slot] : '#8f8ab8' } as React.CSSProperties}>
              <i dangerouslySetInnerHTML={{ __html: portrait(s.character) }} />
              <b>{s.name}</b>
              <span>{s.total} pts</span>
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

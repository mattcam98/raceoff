import { normalizeRoomCode, ROOM_CODE_LENGTH } from '@raceoff/shared';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { CHARACTERS } from '@raceoff/shared';
import { portrait } from '../ui/art';
import { Logo } from '../ui/Logo';

const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function Home() {
  const [, go] = useLocation();
  const [code, setCode] = useState('');
  const ready = code.length === ROOM_CODE_LENGTH;

  const join = (
    <form
      className="home-card home-card--join"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) go(`/join/${code}`);
      }}
    >
      <h2>Join a race</h2>
      <p>Type the code on the TV.</p>
      <input
        className="code-input"
        value={code}
        onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
        placeholder="ABCD"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label="Room code"
        autoFocus={touch}
      />
      <button className="btn btn--go btn--big" disabled={!ready}>
        Join
      </button>
    </form>
  );
  const host = (
    <div className="home-card home-card--host">
      <h2>Host on this screen</h2>
      <p>Put this on the TV. Up to four players join with their phones; computers fill the grid.</p>
      <button className="btn btn--host btn--big" onClick={() => go('/tv')}>
        Start a room
      </button>
    </div>
  );

  return (
    <main className="home">
      <div className="home__hero">
        <Logo size="l" />
        <p className="home__tag">Tiny karts. Giant kitchen. Your phone is the wheel.</p>
        <div className="home__faces" aria-hidden>
          {CHARACTERS.map((c, i) => (
            <i key={c.id} style={{ animationDelay: `${i * 70}ms` }} dangerouslySetInnerHTML={{ __html: portrait(c.id) }} />
          ))}
        </div>
      </div>
      <div className="home__cards">
        {touch ? (
          <>
            {join}
            {host}
          </>
        ) : (
          <>
            {host}
            {join}
          </>
        )}
      </div>
      <nav className="home__links">
        <a className="home__link" href="/records" onClick={(e) => (e.preventDefault(), go('/records'))}>
          Hall of Fame
        </a>
        <a className="home__link home__link--quiet" href="/settings" onClick={(e) => (e.preventDefault(), go('/settings'))}>
          Settings
        </a>
      </nav>
    </main>
  );
}

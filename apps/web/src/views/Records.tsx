import { TRACKS, type RecordsView } from '@raceoff/shared';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api } from '../lib/net';
import { formatTime } from '../ui/art';
import { Icon } from '../ui/Icon';
import { Logo } from '../ui/Logo';
import { Face, Medal } from '../ui/Racer';

export function Records() {
  const [data, setData] = useState<RecordsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, go] = useLocation();
  useEffect(() => {
    api.records().then(setData, (e: Error) => setError(e.message));
  }, []);
  return (
    <main className="records-page">
      <header>
        <a href="/" onClick={(e) => (e.preventDefault(), go('/'))}>
          <Logo size="s" />
        </a>
        <h1 className="title">Hall of Fame</h1>
      </header>
      {error && <p className="notice">{error}</p>}
      {data && <RecordsBoard data={data} />}
    </main>
  );
}

export function RecordsBoard({ data, compact = false }: { data: RecordsView; compact?: boolean }) {
  return (
    <div className={`records${compact ? ' records--compact' : ''}`}>
      <section className="records__tracks">
        {TRACKS.map((t) => {
          const r = data.tracks[t.id];
          const best = r?.races[0];
          return (
            <article key={t.id} className="rec-track" style={{ '--tc': t.color } as React.CSSProperties}>
              <h3>{t.name}</h3>
              <dl>
                <div>
                  <dt>Fastest race</dt>
                  <dd>{best ? <Holder name={best.name} character={best.character} time={best.time} /> : <span className="dim">Nobody yet</span>}</dd>
                </div>
                <div>
                  <dt>Best lap</dt>
                  <dd>{r?.bestLap ? <Holder name={r.bestLap.name} character={r.bestLap.character} time={r.bestLap.time} /> : <span className="dim">Nobody yet</span>}</dd>
                </div>
              </dl>
              {!compact && r && r.races.length > 1 && (
                <ol className="rec-list">
                  {r.races.slice(1, 5).map((e, i) => (
                    <li key={i}>
                      <span>{e.name}</span>
                      <b>{formatTime(e.time)}</b>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}
      </section>
      <section className="records__players">
        <h3>
          <Icon name="trophy" /> Champions
        </h3>
        {data.players.length === 0 ? (
          <p className="dim">Race to get on the board.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th />
                <th>Cups</th>
                <th>Wins</th>
                <th>Podiums</th>
                <th>Races</th>
              </tr>
            </thead>
            <tbody>
              {data.players.slice(0, compact ? 6 : 30).map((p, i) => (
                <tr key={p.name}>
                  <td>
                    <span className="champ">
                      <Medal place={i + 1} />
                      {p.name}
                    </span>
                  </td>
                  <td>{p.cups}</td>
                  <td>{p.wins}</td>
                  <td>{p.podiums}</td>
                  <td>{p.races}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Holder({ name, character, time }: { name: string; character: string; time: number }) {
  return (
    <span className="holder">
      <Face character={character} />
      <span>{name}</span>
      <b>{formatTime(time)}</b>
    </span>
  );
}

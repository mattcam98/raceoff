/**
 * The Giant's Hand on the phone: for a player who is not racing (finished, or
 * joined after the start). Pick a move, then a racer: butter in their lane, a
 * gobstopper where they are heading, or a flick to help them along. The TV
 * runs the race and has the last word on every move; this only asks.
 */
import { GIANT_COST, GIANT_MAX_CHARGE, PLAYER_COLORS, type GiantHud, type GiantKind } from '@raceoff/shared';
import { useEffect, useState } from 'react';
import type { PhoneLink } from '../lib/net';
import { GIANT_ICONS, ITEM_ICONS, ordinal, portrait } from '../ui/art';
import { Icon } from '../ui/Icon';
import { buzz } from './haptics';

const MOVES: { kind: GiantKind; name: string; what: string }[] = [
  { kind: 'butter', name: 'Butter', what: 'Drops a pat in their lane, ahead of them. Drive over it and spin.' },
  { kind: 'bomb', name: 'Gobstopper', what: 'Lands where they are heading, with a ring to warn them. Dodge it or flip.' },
  { kind: 'flick', name: 'Flick', what: 'A friendly flick forward: a burst of speed.' },
];

/** Drawn art (ui/art.ts), not emoji, so it looks the same on every phone. */
const Art = ({ svg, className = '' }: { svg: string; className?: string }) => <i className={`giant__art ${className}`} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;

export function GiantPanel({ link, giant, place, vip }: { link: PhoneLink; giant: GiantHud; place?: number | null; vip: boolean }) {
  const [kind, setKind] = useState<GiantKind>('butter');
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!said) return;
    const t = window.setTimeout(() => setSaid(null), 1600);
    return () => window.clearTimeout(t);
  }, [said]);

  const move = MOVES.find((m) => m.kind === kind)!;
  // Only computers left racing: the host may call the race rather than wait for them.
  const canEnd = vip && !giant.targets.some((t) => !t.cpu);
  const cost = GIANT_COST[kind];
  const ready = giant.charge >= cost;

  const use = (t: GiantHud['targets'][number]) => {
    if (t.safe) return setSaid(`${t.name} was just picked. Give them a moment.`);
    if (!ready) return setSaid('Recharging…');
    link.giant(kind, t.k);
    buzz('item');
    setSaid(kind === 'flick' ? `Flicked ${t.name}!` : `${move.name} for ${t.name}!`);
  };

  return (
    <section className="giant">
      <header className="giant__head">
        <Art svg={GIANT_ICONS.hand} className="giant__hand" />
        <div>
          <h2>You're the giant!</h2>
          <p>{place ? `You finished ${ordinal(place)}. Now reach into the race.` : 'Not in this race? Reach into it from here.'}</p>
        </div>
        <div className="giant__charge" aria-label={`${Math.floor(giant.charge)} of ${GIANT_MAX_CHARGE} charges`}>
          {Array.from({ length: GIANT_MAX_CHARGE }, (_, i) => (
            <i key={i} style={{ '--f': Math.max(0, Math.min(1, giant.charge - i)) } as React.CSSProperties} />
          ))}
        </div>
      </header>

      <div className="giant__moves" role="radiogroup" aria-label="Move">
        {MOVES.map((m) => (
          <button
            key={m.kind}
            role="radio"
            aria-checked={kind === m.kind}
            className={`giant__move giant__move--${m.kind}${kind === m.kind ? ' is-on' : ''}`}
            onClick={() => (buzz('tick'), setKind(m.kind))}
          >
            <Art svg={GIANT_ICONS[m.kind]} />
            <b>{m.name}</b>
            <small>{'●'.repeat(GIANT_COST[m.kind])}</small>
          </button>
        ))}
      </div>
      <p className="giant__what">{said ?? move.what}</p>
      {(giant.endsIn !== null || canEnd) && (
        <div className="giant__end">
          {giant.endsIn !== null && (
            <span>
              <Icon name="timer" /> Race ends in {giant.endsIn}s
            </span>
          )}
          {canEnd && (
            <button className="btn btn--ghost btn--tiny" onClick={() => link.command('skip')}>
              Finish the race now <Icon name="skip" />
            </button>
          )}
        </div>
      )}

      <ul className="giant__targets">
        {giant.targets.length === 0 && <li className="giant__empty">Everyone is home. Watch the finish!</li>}
        {giant.targets.map((t) => (
          <li key={t.k}>
            <button
              className={`giant__target${t.safe ? ' is-safe' : ''}${ready ? '' : ' is-wait'}`}
              style={{ '--tc': t.slot >= 0 ? PLAYER_COLORS[t.slot] : 'transparent' } as React.CSSProperties}
              onClick={() => use(t)}
            >
              <b className="giant__place">{ordinal(t.place)}</b>
              <i dangerouslySetInnerHTML={{ __html: portrait(t.character) }} />
              <span>{t.name}</span>
              {t.cpu ? <small>CPU</small> : <small className="giant__player">PLAYER</small>}
              <Art svg={t.safe ? ITEM_ICONS.shield : GIANT_ICONS[kind]} className="giant__go" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

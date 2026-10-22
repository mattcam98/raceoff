import { characterById } from '@raceoff/shared';
import { portrait } from './art';

/** A finishing place: gold, silver and bronze discs for the podium, a plain italic number after that. */
export function Medal({ place }: { place: number }) {
  return <b className={`medal medal--${Math.min(place, 4)}`}>{place}</b>;
}

/** A racer's portrait on a tile in their character's colour. */
export function Face({ character, className = '' }: { character: string; className?: string }) {
  const ch = characterById(character);
  return <i className={`face ${className}`} style={{ '--cc': ch.color } as React.CSSProperties} aria-hidden dangerouslySetInnerHTML={{ __html: portrait(ch.id) }} />;
}

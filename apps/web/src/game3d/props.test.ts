import { TRACK_DEFS } from '@raceoff/game';
import { expect, it } from 'vitest';
import { bath } from './propBath';
import { desk } from './propDesk';
import { garage } from './propGarage';
import { garden } from './propGarden';
import { kitchen } from './propKitchen';
import { toys } from './propToys';

// buildProp turns an unknown kind into a magenta cube, so a renamed prop would only show up on screen.
it('has a model for every prop the tracks place', () => {
  const library = { ...kitchen, ...desk, ...bath, ...garden, ...toys, ...garage };
  const missing = Object.values(TRACK_DEFS).flatMap((def) => (def.props ?? []).filter((p) => !(p.k in library)).map((p) => `${def.id}:${p.k}`));
  expect(missing).toEqual([]);
});

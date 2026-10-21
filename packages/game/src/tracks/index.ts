import type { TrackId } from '@raceoff/shared';
import { buildTrack, type Track } from '../track/build';
import type { TrackDef } from '../track/types';
import { bath } from './bath';
import { breakfast } from './breakfast';
import { desk } from './desk';
import { garage } from './garage';
import { sandbox } from './sandbox';
import { toybox } from './toybox';

export const TRACK_DEFS: Record<TrackId, TrackDef> = { breakfast, desk, bath, sandbox, toybox, garage };

const built = new Map<string, Track>();

/** Compile a track once and keep it: compiling takes a moment and the result never changes. */
export function getTrack(id: string): Track {
  let t = built.get(id);
  if (!t) {
    const def = TRACK_DEFS[id as TrackId] ?? TRACK_DEFS.breakfast;
    t = buildTrack(def);
    built.set(id, t);
  }
  return t;
}

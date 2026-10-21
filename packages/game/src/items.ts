/**
 * Which item a box gives, and the things items leave in the world.
 *
 * The draw depends on where you are: the leader mostly gets defence, the back
 * of the pack gets the big catch-up items. Weights are given at four points
 * from first (0) to last (1) and blended between them.
 */
import type { ItemId } from '@raceoff/shared';
import { clamp, lerp, type Rng } from './math';

/** How far behind the leader, as a share of a lap, counts as hopelessly behind for the item draw. */
const GAP_FOR_LAST = 0.3;

/**
 * Where a kart stands for the item draw, from 0 (leading) to 1 (far behind). Mostly the gap to the leader,
 * as in Mario Kart 8, a little the place: last in a tight pack is not far behind, and hanging back to farm
 * the big items costs more than they give.
 */
export function itemRank(place: number, racers: number, gap: number, lapLength: number): number {
  if (racers <= 1) return 0.5;
  if (place === 1) return 0;
  const byPlace = (place - 1) / (racers - 1);
  const byGap = clamp(gap / (lapLength * GAP_FOR_LAST), 0, 1);
  return clamp(0.3 * byPlace + 0.7 * byGap, 0, 1);
}

type Weights = [first: number, upper: number, lower: number, last: number];

const TABLE: Record<ItemId, Weights> = {
  ball: [30, 24, 14, 6],
  ball3: [4, 14, 14, 6],
  seeker: [0, 14, 18, 14],
  oil: [34, 16, 6, 0],
  bomb: [0, 8, 12, 9],
  plane: [0, 2, 6, 7],
  shield: [26, 10, 5, 3],
  nitro: [6, 16, 19, 14],
  nitro3: [0, 4, 12, 18],
  sugar: [0, 2, 8, 14],
  rocket: [0, 0, 3, 14],
};

export type ItemMode = 'normal' | 'frantic' | 'off';

/**
 * Draw an item for a kart at `rank` (0 leading to 1 far behind; see `itemRank`).
 * `planeInPlay` keeps more than one Paper Jet from being in the air at once.
 */
export function drawItem(rank: number, mode: ItemMode, rand: Rng, planeInPlay: boolean): ItemId {
  let r = clamp(rank, 0, 1);
  // Frantic hands everyone the back-of-the-pack table.
  if (mode === 'frantic') r = 0.45 + r * 0.55;
  const seg = Math.min(2, Math.floor(r * 3));
  const t = r * 3 - seg;
  const entries = Object.entries(TABLE) as [ItemId, Weights][];
  let total = 0;
  const weights = entries.map(([id, w]) => {
    let v = lerp(w[seg], w[seg + 1], t);
    if (id === 'plane' && planeInPlay) v = 0;
    total += v;
    return v;
  });
  let pick = rand() * total;
  for (let i = 0; i < entries.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return entries[i][0];
  }
  return 'ball';
}

export const usesOf = (item: ItemId) => (item === 'ball3' || item === 'nitro3' ? 3 : 1);

// ---------------------------------------------------------------- world objects

export type ProjectileKind = 'ball' | 'seeker' | 'plane' | 'bomb';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  owner: number;
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  h: number;
  /** Seconds alive. */
  age: number;
  bounces: number;
  /** Kart index being chased, or -1. */
  target: number;
  /** Unwrapped progress, for things that fly along the track. */
  dist: number;
  /** Plane: cruising, then diving. */
  diving: number;
  dead: boolean;
}

export interface Drop {
  id: number;
  kind: 'oil' | 'bomb';
  owner: number;
  x: number;
  y: number;
  z: number;
  age: number;
  /** Bombs: seconds until they go off. */
  fuse: number;
  dead: boolean;
}

export interface Blast {
  id: number;
  x: number;
  y: number;
  z: number;
  r: number;
  age: number;
}

export const OIL_RADIUS = 2.6;
export const BALL_RADIUS = 0.9;
export const BLAST_RADIUS = 8.5;
export const ORBIT_RADIUS = 2.7;

import type { TrackDef } from '../track/types';

/**
 * Breakfast Bend: round a kitchen table on a gingham cloth. Sugar-cube walls
 * keep you on the table through the corners; the start straight runs open
 * along the table's edge. A narrow lane slips between the cereal bowl and the
 * sugar bowl through a puddle of milk, and a slice of toast makes a ramp over
 * a second puddle on the far side.
 */
export const breakfast: TrackDef = {
  id: 'breakfast',
  width: 18,
  floorY: 0,
  ground: 'rough',
  floor: { minX: -160, maxX: 160, minZ: -105, maxZ: 105 },
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-40, 74],
    [20, 74],
    [70, 70],
    [106, 48],
    [120, 6],
    [112, -40],
    [86, -70],
    [45, -76],
    [12, -58, 16],
    [-25, -74],
    [-72, -78],
    [-112, -58],
    [-124, -16],
    [-104, 14],
    [-120, 46],
    [-92, 74],
  ],
  edges: [
    // The start straight runs along the table edge with nothing to stop you going over.
    { from: 15.5, to: 1.6, left: 'open', right: 'open' },
    // Cut the insides of the corners across the tablecloth if you dare.
    { from: 2.5, to: 6.5, left: 'open' },
    { from: 10.5, to: 12.5, left: 'open' },
  ],
  ramps: [{ u: 11.55, len: 9, h: 2.6, look: 'toast' }],
  pads: [
    { u: 9.4, off: -0.55 },
    { u: 4.2, off: 0.5 },
  ],
  boxes: [1.4, 7.6, 12.9],
  zones: [
    { x: -121, z: 3, rx: 9, rz: 7, surface: 'slick', look: 'milk' },
    { x: 66, z: 4, rx: 7, rz: 12, surface: 'slick', look: 'milk' },
    { x: -40, z: -82, rx: 7, rz: 5, surface: 'sticky', look: 'jam' },
  ],
  shortcuts: [
    {
      points: [
        [62, 70],
        [64, 40],
        [64, 0],
        [62, -40],
        [62, -76],
      ],
      width: 9,
      surface: 'road',
      edge: 'wall',
      boxes: [2.2],
      aiChance: 0.45,
    },
  ],
  props: [
    // Infield breakfast.
    { k: 'bowl', x: 92, z: 2, s: 0.95, v: 'cereal' },
    { k: 'jar', x: 64, z: -96 + 10, s: 1 },
    { k: 'mug', x: -20, z: -20, s: 1.2 },
    { k: 'plate', x: -55, z: 15, s: 1.6 },
    { k: 'teapot', x: 10, z: 20, s: 1.2 },
    { k: 'cereal', x: -10, z: -34, r: 0.1, s: 1.1 },
    { k: 'carton', x: 28, z: -22, r: 0.4, s: 1.2 },
    { k: 'orange', x: -82, z: -30 },
    { k: 'apple', x: -72, z: -36, s: 0.9 },
    { k: 'glass', x: 30, z: 38, s: 1.2 },
    { k: 'butter', x: -30, z: 40, r: -0.3 },
    { k: 'shaker', x: 34, z: 8, v: 'salt' },
    { k: 'shaker', x: 40, z: 6, v: 'pepper' },
    { k: 'spoon', x: -60, z: -10, r: 0.6 },
    { k: 'toast', x: -84, z: 2, r: 0.3, solid: false },
    // Outside the track.
    { k: 'toaster', x: -10, z: -96, r: 0 },
    { k: 'mug', x: 140, z: -70, s: 1.3 },
    { k: 'glass', x: 145, z: 60, s: 1.1 },
    { k: 'napkin', x: -140, z: 85, r: 0.2 },
    { k: 'fork', x: 135, z: 90, r: 0.2 },
    { k: 'knife', x: 120, z: 95, r: 0.1 },
    { k: 'apple', x: -146, z: -84 },
    { k: 'jar', x: -146, z: 30, v: 'honey' },
  ],
  hazards: [],
};

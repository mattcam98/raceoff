import type { TrackDef } from '../track/types';

/**
 * Toybox Tangle: across the playroom carpet between walls of building blocks.
 * The track loops up and round the far end of the room; the shortcut cuts
 * straight across through the toy fort's gate, where the toy train crosses
 * twice. A spinning top wanders the left-hand bend and a picture book makes a
 * jump on the right.
 */
export const toybox: TrackDef = {
  id: 'toybox',
  width: 18,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-40, 100],
    [40, 100],
    [100, 96],
    [142, 66],
    [158, 20],
    [148, -24],
    [110, -52],
    [66, -66],
    [54, -108],
    [18, -140],
    [-30, -142],
    [-62, -116],
    [-90, -76],
    [-132, -72],
    [-166, -42],
    [-172, 12],
    [-146, 62],
    [-96, 96],
  ],
  edges: [{ from: 17.2, to: 1.4, left: 'open', right: 'open' }],
  ramps: [{ u: 3.35, len: 9, h: 2.8, look: 'book' }],
  pads: [
    { u: 5.5, off: 0.4 },
    { u: 9.5, off: -0.3 },
    { u: 16.4, off: -0.5 },
  ],
  boxes: [2.2, 8.6, 13.4],
  shortcuts: [
    {
      points: [
        [62, -68],
        [20, -74],
        [-30, -74],
        [-86, -77],
      ],
      width: 10,
      surface: 'road',
      edge: 'wall',
      boxes: [1.5],
      aiChance: 0.55,
    },
  ],
  hazards: [
    {
      kind: 'train',
      r: 3.4,
      cars: 4,
      motion: {
        type: 'loop',
        speed: 14,
        points: [[-24, -46], [24, -46], [34, -56], [34, -96], [24, -106], [-24, -106], [-34, -96], [-34, -56]],
      },
    },
    { kind: 'top', r: 4, motion: { type: 'circle', cx: -152, cz: 40, radius: 16, period: 8 }, look: 'top' },
  ],
  props: [
    { k: 'gate', x: -2, z: -75, solid: false },
    { k: 'teddy', x: 90, z: 40, r: -2.4 },
    { k: 'toyball', x: -100, z: 30 },
    { k: 'rings', x: -40, z: 40 },
    { k: 'cube', x: 40, z: 30, r: 0.4 },
    { k: 'block', x: -66, z: -4, v: 0 },
    { k: 'block', x: -58, z: -10, r: 0.3, v: 3 },
    { k: 'bigblock', x: 96, z: -8, r: 0.2, v: 1 },
    { k: 'crayon', x: -10, z: 60, r: 0.4, v: '#06d6a0', solid: false },
    { k: 'toycar', x: 30, z: 66, r: 1.1, v: '#ef476f', solid: false },
    { k: 'dominoes', x: -80, z: 64, r: 0.1, solid: false },
    // Out on the carpet.
    { k: 'teddy', x: 205, z: -40, s: 2, r: -1.3 },
    { k: 'toyball', x: 200, z: 110, s: 1.6 },
    { k: 'bigblock', x: -210, z: -110, s: 1.6, r: 0.5, v: 4 },
    { k: 'rings', x: 120, z: -160, s: 1.6 },
    { k: 'bigblock', x: -215, z: 90, s: 1.4, v: 2 },
    { k: 'cube', x: -100, z: -170, s: 1.5 },
  ],
};

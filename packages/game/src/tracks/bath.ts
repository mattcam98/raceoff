import type { TrackDef } from '../track/types';

/**
 * Bubble Bath Bay: round a full bathtub on the bathroom tiles. A bath bomb
 * rolls across the wide start straight.
 *
 * Two quick lefts past the sink turn you back across the room, where a
 * folded towel makes a hump to hop on the vanity straight, and a tight right
 * hairpin round the soap dish (suds on its inside) turns you along the front
 * of the tub, open to the water on your left. Round the end of the tub the
 * road climbs onto its rim and runs the whole length of it, narrowing, with
 * nothing between you and the bath water: the boxes and the pad up there are
 * on the water side. At the far end a sponge ramp leaps the overflow back down.
 *
 * Down the left the road swings out round the toilet; the soapy shortcut runs
 * straight past it, quick if you can keep it straight on the soap. The long
 * bath-mat sweep brings you back to the start.
 */
export const bath: TrackDef = {
  id: 'bath',
  width: 18,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-60, 100, 24], // 0: start straight
    [-36.7, 100, 24],
    [-13.3, 100, 24],
    [10, 100, 24],
    [33.3, 100, 24],
    [56.7, 100, 24],
    [80, 100, 24], // 6: sink corner
    [100, 94.6, 22.7],
    [114.6, 80, 21.3],
    [120, 60, 20],
    [120, 30],
    [116.7, 17.5],
    [107.5, 8.3],
    [95, 5], // 13: vanity straight
    [75, 5, 20], // 14: towel
    [55, 5, 20, 3.5],
    [25, 5], // 16: soap-dish hairpin
    [15, 2.3, 17.7],
    [7.7, -5, 17.3],
    [5, -15, 17],
    [7.7, -25, 16.7],
    [15, -32.3, 16.3],
    [25, -35, 16], // 22: tub front
    [45, -35, 17],
    [65, -35],
    [85, -35, 19],
    [105, -35, 20],
    [120, -39, 19.7],
    [131, -50, 19.3],
    [135, -65, 19], // 29: up the end of the tub
    [135, -90.3, 18.5],
    [135, -115.6], // 31: rim corner
    [130.2, -133.6, 18.7],
    [117, -146.7, 19.3],
    [99, -151.6, 20], // 34: climb onto the rim
    [77, -151.6, 19, 3],
    [55, -151.6, 18, 6], // 36: rim
    [32.8, -151.6, 17.5, 6],
    [10.7, -151.6, 17, 6],
    [-11.5, -151.6, 16.5, 6],
    [-33.7, -151.6, 16, 6],
    [-55.8, -151.6, 15.5, 6],
    [-78, -151.6, 15, 6], // 42: lip
    [-82, -151.6, 15, 6], // 43: overflow
    [-100, -151.6],
    [-120, -151.6], // 45: down the left
    [-135, -147.5],
    [-146, -136.6],
    [-150, -121.6],
    [-150, -101.6], // 49: round the toilet
    [-152.9, -87.7, 17.7],
    [-161, -76.1, 17.3],
    [-173, -68.7, 17],
    [-187.1, -59.2, 16.8],
    [-195, -44.2, 16.6],
    [-195, -27.3, 16.4],
    [-187.1, -12.4, 16.2],
    [-173, -2.9, 16],
    [-161, 4.5, 16.7],
    [-152.9, 16.1, 17.3],
    [-150, 30],
    [-150, 50, 20], // 61: bath-mat sweep
    [-146.2, 69.1, 21],
    [-135.4, 85.4, 22],
    [-119.1, 96.2, 23],
    [-100, 100, 24], // 65: grid
    [-80, 100, 24],
  ],
  edges: [
    { from: 65, to: 6, left: 'open', right: 'open' },
    // The insides of the corners past the sink and of the hairpin are open tile.
    { from: 6.3, to: 14, left: 'open' },
    { from: 16.5, to: 22.5, right: 'open' },
    // All the way round the tub, up onto the rim and along it: open on the inside, with the bath water beyond.
    { from: 22.3, to: 42, left: 'open' },
    // The insides of the corner down the left and of the swing round the toilet are open tile.
    { from: 45, to: 48, left: 'open' },
    { from: 52, to: 57, left: 'open' },
  ],
  ramps: [{ u: 41.95, len: 5, h: 1.5, gap: 10, over: 'water', look: 'sponge' }],
  pads: [
    // Out of the hairpin on the inside, and on the rim on the water side.
    { u: 21.6, off: 0.5 },
    { u: 37, off: -0.5 },
  ],
  boxes: [4.5, 13.3, 36, 61.4],
  zones: [
    // The bath water fills the tub right up to the rim and the front.
    { x: 16, z: -94, rx: 101, rz: 47, surface: 'water', look: 'water' },
    { x: 16, z: -136, rx: 98, rz: 9, surface: 'water', look: 'water' },
    { x: 65, z: -50, rx: 45, rz: 5, surface: 'water', look: 'water' },
    // Suds on the inside of the soap-dish hairpin.
    { x: 15, z: -15, rx: 4, rz: 7, surface: 'slick', look: 'suds' },
    // The soapy shortcut.
    { x: -150, z: -36, rx: 4.5, rz: 26, surface: 'slick', look: 'suds' },
  ],
  shortcuts: [
    {
      points: [
        [-150, -100],
        [-150, -60],
        [-150, -20],
        [-150, 28],
      ],
      width: 9,
      surface: 'road',
      edge: 'wall',
      boxes: [1.5],
      aiChance: 0.5,
    },
  ],
  hazards: [{ kind: 'roller', r: 3.6, motion: { type: 'across', u: 3, period: 6.5 }, look: 'bathbomb' }],
  props: [
    { k: 'tub', x: 16, z: -94, solid: false },
    { k: 'duck', x: 0, z: -110, r: 0.8, solid: false },
    { k: 'duck', x: 60, z: -86, r: -2.2, s: 1.4, solid: false, v: '#ff8fab' },
    { k: 'duck', x: -40, z: -92, r: 2.6, solid: false },
    // The folded towel under the hump, and the soap dish in the hairpin.
    { k: 'towel', x: 50, z: 5, r: 1.57, solid: false },
    { k: 'soap', x: 25, z: -15, r: 1.57 },
    // The infield tiles.
    { k: 'bathmat', x: 0, z: 55, solid: false },
    { k: 'bottle', x: 40, z: 45, v: '#7b2cbf' },
    { k: 'bottle', x: 52, z: 58, v: '#06d6a0', r: 0.4 },
    { k: 'sponge', x: -60, z: 50, r: 0.3 },
    { k: 'cup', x: -20, z: 30 },
    { k: 'soap', x: -100, z: 20, r: 0.5 },
    // The toilet roll the road swings round.
    { k: 'roll', x: -171, z: -36, s: 1.2 },
    // Around the outside.
    { k: 'towel', x: -40, z: 140, r: 0.1, solid: false },
    { k: 'duck', x: 200, z: -60, s: 2.2, r: -1.2 },
    { k: 'roll', x: 200, z: 40, s: 1.4 },
    { k: 'bottle', x: -235, z: 60, s: 1.6, v: '#ff8fab' },
    { k: 'soap', x: 180, z: 140, s: 1.4, r: 0.3, v: '#bde0fe' },
    { k: 'cup', x: -235, z: -120, s: 1.5 },
  ],
};

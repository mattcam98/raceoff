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
  width: 21.6,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-60, 100, 28.8], // 0: start straight
    [-36.7, 100, 28.8],
    [-13.3, 100, 28.8],
    [10, 100, 28.8],
    [33.3, 100, 28.8],
    [56.7, 100, 28.8],
    [80, 100, 28.8], // 6: sink corner
    [100, 94.6, 27.2],
    [114.6, 80, 25.6],
    [120, 60, 24],
    [120, 30],
    [116.7, 17.5],
    [107.5, 8.3],
    [95, 5], // 13: vanity straight
    [75, 5, 24], // 14: towel
    [55, 5, 24, 3.5],
    [25, 5], // 16: soap-dish hairpin
    [15, 2.3, 21.2],
    [7.7, -5, 20.8],
    [5, -15, 20.4],
    [7.7, -25, 20],
    [15, -32.3, 20],
    [25, -35, 20], // 22: tub front
    [45, -35, 20.4],
    [65, -35],
    [85, -35, 22.8],
    [105, -35, 24],
    [120, -39, 23.6],
    [131, -50, 23.2],
    [135, -65, 22.8], // 29: up the end of the tub
    [135, -90.3, 22.2],
    [135, -115.6], // 31: rim corner
    [130.2, -133.6, 22.4],
    [117, -146.7, 23.2],
    [99, -151.6, 24], // 34: climb onto the rim
    [77, -151.6, 22.8, 3],
    [55, -151.6, 21.6, 6], // 36: rim
    [32.8, -151.6, 21, 6],
    [10.7, -151.6, 20.4, 6],
    [-11.5, -151.6, 19.8, 6],
    [-33.7, -151.6, 19.2, 6],
    [-55.8, -151.6, 18.6, 6],
    [-78, -151.6, 18, 6], // 42: lip
    [-82, -151.6, 18, 6], // 43: overflow
    [-100, -151.6],
    [-120, -151.6], // 45: down the left
    [-135, -147.5],
    [-146, -136.6],
    [-150, -121.6],
    [-150, -101.6], // 49: round the toilet
    [-152.9, -87.7, 21.2],
    [-161, -76.1, 20.8],
    [-173, -68.7, 20.4],
    [-187.1, -59.2, 20.2],
    [-195, -44.2, 19.9],
    [-195, -27.3, 19.7],
    [-187.1, -12.4, 19.4],
    [-173, -2.9, 19.2],
    [-161, 4.5, 20],
    [-152.9, 16.1, 20.8],
    [-150, 30],
    [-150, 50, 24], // 61: bath-mat sweep
    [-146.2, 69.1, 25.2],
    [-135.4, 85.4, 26.4],
    [-119.1, 96.2, 27.6],
    [-100, 100, 28.8], // 65: grid
    [-80, 100, 28.8],
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
    { x: 16, z: -93.5, rx: 101, rz: 46, surface: 'water', look: 'water' },
    { x: 16, z: -133, rx: 98, rz: 7, surface: 'water', look: 'water' },
    { x: 65, z: -51.5, rx: 45, rz: 5, surface: 'water', look: 'water' },
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
    // Past the sink corner, beyond the rim and the overflow, and round the toilet.
    { k: 'bottle', x: 150, z: 70, v: '#06d6a0' },
    { k: 'roll', x: 152, z: 30, s: 1.1 },
    { k: 'duck', x: 148, z: -10, s: 1.4, r: 2.2 },
    { k: 'soap', x: 90, z: 50, r: 0.4, v: '#ffd6e0' },
    { k: 'bottle', x: -120, z: -178, v: '#3d9bff' },
    { k: 'soap', x: -60, z: -178, s: 1.2, r: 0.2 },
    { k: 'duck', x: -160, z: -175, s: 1.5, r: -0.6 },
    { k: 'roll', x: -220, z: -60, s: 1.2 },
    { k: 'bottle', x: -222, z: -20, v: '#ffd23f' },
    { k: 'cup', x: -215, z: 20 },
    { k: 'sponge', x: -120, z: -60, r: 0.6 },
    { k: 'duck', x: 170, z: -130, s: 1.6, r: 2.8 },
  ],
};

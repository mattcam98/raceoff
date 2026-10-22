import type { TrackDef } from '../track/types';

/**
 * Grease Lightning: the garage floor after dark, between walls of old tyres.
 *
 * The big ramp on the long start straight launches you over the inspection
 * pit, and the first long bend swings right round the oil drums, a full drift
 * with a paint can rolling across it. The road then swings out round the
 * middle of the floor: a long straight back across it, a hairpin round the
 * toolbox, and two tight rights with oil on them, wide on the first and
 * tight on the second, so no one line stays clean.
 *
 * Along the far wall the road climbs onto the car lift (boxes up there) and
 * drops off the end. The second long bend has another paint can; the
 * shortcut cuts inside it, under the workbench and through the spilt oil, on
 * bare concrete that only pays with a boost. The tyre chicane and the last
 * corner bring you back to the start.
 */
export const garage: TrackDef = {
  id: 'garage',
  width: 19,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-90, -110, 24], // 0: start straight
    [-68.7, -110, 24],
    [-47.5, -110, 24],
    [-26.2, -110, 24],
    [-5, -110, 24],
    [16.3, -110, 24],
    [37.5, -110, 24],
    [58.8, -110, 24],
    [80, -110, 24], // 8: first long bend
    [102.2, -105.6, 23.6],
    [121, -93, 23.3],
    [133.6, -74.2, 22.9],
    [138, -52, 22.5],
    [133.6, -29.8, 22.1],
    [121, -11, 21.8],
    [102.2, 1.6, 21.4],
    [80, 6, 21], // 16: middle straight
    [56.8, 6, 20.8],
    [33.7, 6, 20.7],
    [10.5, 6, 20.5],
    [-12.7, 6, 20.3],
    [-35.8, 6, 20.2],
    [-59, 6, 20], // 22: toolbox hairpin
    [-72, 9.5, 19.5],
    [-81.5, 19],
    [-85, 32, 18.5],
    [-81.5, 45, 18],
    [-72, 54.5, 17.5],
    [-59, 58, 17], // 28: oil straight
    [-39, 58, 18],
    [-19, 58],
    [1, 58, 20], // 31: oil corner
    [15, 61.8, 19.3],
    [25.2, 72, 18.7],
    [29, 86, 18],
    [29, 100, 18], // 35: second oil corner
    [25.2, 114, 18],
    [15, 124.2, 18],
    [1, 128, 18], // 38: lift
    [-19, 128, 20],
    [-49, 128, 16, 4],
    [-69, 128, 16, 4],
    [-89, 128, 16, 4], // 42: lip
    [-93, 128, 16, 4],
    [-109, 128, 18],
    [-125, 128, 20], // 45: second long bend
    [-144.1, 124.2, 20],
    [-160.4, 113.4, 20],
    [-171.2, 97.1, 20],
    [-175, 78, 20], // 49: tyre chicane
    [-175, 56.3],
    [-175, 34.7, 18],
    [-177.4, 23.7, 17],
    [-184.3, 14.8, 16],
    [-191.1, 5.8, 16],
    [-193.6, -5.2, 16],
    [-191.1, -16.2, 16],
    [-184.3, -25.1, 16],
    [-177.4, -34, 16.5],
    [-175, -45, 17],
    [-175, -65, 20], // 60: last corner
    [-169, -87.5, 21.3],
    [-152.5, -104, 22.7],
    [-130, -110, 24], // 63: grid
    [-110, -110, 24],
  ],
  edges: [
    { from: 63, to: 1.4, left: 'open', right: 'open' },
    // Tyres line the outsides of the corners; their insides are open floor.
    { from: 8.5, to: 15.5, right: 'open' },
    { from: 22.5, to: 28.5, left: 'open' },
    { from: 31, to: 38.7, right: 'open' },
    { from: 60, to: 63, right: 'open' },
  ],
  ramps: [{ u: 1.6, len: 10, h: 3, gap: 14, look: 'plank' }],
  pads: [
    // Out of the first long bend and out of the hairpin, both on the inside.
    { u: 15.5, off: 0.5 },
    { u: 27.6, off: -0.5 },
  ],
  boxes: [5, 16.3, 40.5, 49.3],
  zones: [
    // Oil on the outside of the first tight right and the inside of the second.
    { x: 26, z: 61, rx: 5, rz: 5, surface: 'slick', look: 'oil' },
    { x: 14, z: 114, rx: 5, rz: 5, surface: 'slick', look: 'oil' },
    // The spill under the workbench.
    { x: -145, z: 98, rx: 6, rz: 5, rot: 0.8, surface: 'slick', look: 'oil' },
  ],
  shortcuts: [
    {
      // Inside the second long bend, under the workbench.
      points: [
        [-100, 128],
        [-130, 112],
        [-152, 92],
        [-168, 70],
        [-175, 48],
      ],
      width: 9,
      surface: 'rough',
      edge: 'wall',
      boxes: [2],
      aiChance: 0.7,
      needsBoost: true,
    },
  ],
  hazards: [
    { kind: 'roller', r: 4, motion: { type: 'across', u: 12, period: 6 }, look: 'paint' },
    { kind: 'roller', r: 4, motion: { type: 'across', u: 47, period: 6.6 }, phase: 1.4, look: 'paint' },
  ],
  props: [
    { k: 'bench', x: -145, z: 98, r: 0.8, solid: false },
    // Inside the first long bend, and the toolbox the hairpin turns round.
    { k: 'drum', x: 80, z: -52, v: '#2a9d8f' },
    { k: 'drum', x: 68, z: -40, v: '#e76f51' },
    { k: 'drum', x: 68, z: -64, v: '#457b9d' },
    { k: 'toolbox', x: -59, z: 32, r: 1.57 },
    // The middle of the floor.
    { k: 'tire', x: 40, z: -50, v: 3 },
    { k: 'crate', x: -40, z: -60, r: 0.3 },
    { k: 'battery', x: -100, z: -30 },
    { k: 'paint', x: -130, z: 30, v: '#ffd23f' },
    { k: 'cone', x: 0, z: -30 },
    { k: 'cone', x: 20, z: -20 },
    { k: 'cone', x: -130, z: -60 },
    { k: 'wrench', x: -10, z: -70, r: 0.7, solid: false },
    { k: 'screwdriver', x: -110, z: 0, r: -0.4, solid: false },
    { k: 'crate', x: -30, z: 93, r: 0.2 },
    // Round the edges of the garage.
    { k: 'toolbox', x: 90, z: 100, s: 1.2, r: 1.2 },
    { k: 'tire', x: 220, z: 60, v: 4 },
    { k: 'drum', x: 220, z: -120, s: 1.4, v: '#457b9d' },
    { k: 'crate', x: -250, z: 160, s: 1.4 },
    { k: 'toolbox', x: -250, z: -140, s: 1.6, r: 0.5 },
    { k: 'paint', x: 200, z: -160, s: 1.6, v: '#ef476f' },
  ],
};

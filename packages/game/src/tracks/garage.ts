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
  width: 22.8,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-90, -110, 28.8], // 0: start straight
    [-68.7, -110, 28.8],
    [-47.5, -110, 28.8],
    [-26.2, -110, 28.8],
    [-5, -110, 28.8],
    [16.3, -110, 28.8],
    [37.5, -110, 28.8],
    [58.8, -110, 28.8],
    [80, -110, 28.8], // 8: first long bend
    [102.2, -105.6, 28.3],
    [121, -93, 28],
    [133.6, -74.2, 27.5],
    [138, -52, 27],
    [133.6, -29.8, 26.5],
    [121, -11, 26.2],
    [102.2, 1.6, 25.7],
    [80, 6, 25.2], // 16: middle straight
    [56.8, 6, 25],
    [33.7, 6, 24.8],
    [10.5, 6, 24.6],
    [-12.7, 6, 24.4],
    [-35.8, 6, 24.2],
    [-59, 6, 24], // 22: toolbox hairpin
    [-72, 9.5, 23.4],
    [-81.5, 19],
    [-85, 32, 22.2],
    [-81.5, 45, 21.6],
    [-72, 54.5, 21],
    [-59, 58, 20.4], // 28: oil straight
    [-39, 58, 21.6],
    [-19, 58],
    [1, 58, 24], // 31: oil corner
    [15, 61.8, 23.2],
    [25.2, 72, 22.4],
    [29, 86, 21.6],
    [29, 100, 21.6], // 35: second oil corner
    [25.2, 114, 21.6],
    [15, 124.2, 21.6],
    [1, 128, 21.6], // 38: lift
    [-19, 128, 24],
    [-49, 128, 19.2, 4],
    [-69, 128, 19.2, 4],
    [-89, 128, 19.2, 4], // 42: lip
    [-93, 128, 19.2, 4],
    [-109, 128, 21.6],
    [-125, 128, 24], // 45: second long bend
    [-144.1, 124.2, 24],
    [-160.4, 113.4, 24],
    [-171.2, 97.1, 24],
    [-175, 78, 24], // 49: tyre chicane
    [-175, 56.3],
    [-175, 34.7, 21.6],
    [-177.4, 23.7, 20.4],
    [-184.3, 14.8, 19.5],
    [-191.1, 5.8, 19.5],
    [-193.6, -5.2, 19.5],
    [-191.1, -16.2, 19.5],
    [-184.3, -25.1, 19.5],
    [-177.4, -34, 19.8],
    [-175, -45, 20.4],
    [-175, -65, 24], // 60: last corner
    [-169, -87.5, 25.6],
    [-152.5, -104, 27.2],
    [-130, -110, 28.8], // 63: grid
    [-110, -110, 28.8],
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
    { kind: 'roller', r: 4, motion: { type: 'across', u: 47, period: 6.6, span: 0.5 }, phase: 1.4, look: 'paint' },
  ],
  props: [
    { k: 'bench', x: -145, z: 98, r: 0.8, solid: false },
    // Inside the first long bend, and the toolbox the hairpin turns round.
    { k: 'drum', x: 80, z: -52, v: '#2a9d8f' },
    { k: 'drum', x: 68, z: -40, v: '#e76f51' },
    { k: 'drum', x: 68, z: -64, v: '#457b9d' },
    { k: 'toolbox', x: -59, z: 32, r: 1.57, s: 0.9 },
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
    // Tyre stacks and clutter along the first long bend, the start straight, and the tyre chicane.
    { k: 'tire', x: 168, z: -80, v: 2 },
    { k: 'tire', x: 170, z: -62, v: 3 },
    { k: 'drum', x: 172, z: -30, v: '#e76f51' },
    { k: 'crate', x: -60, z: -148, r: 0.2 },
    { k: 'drum', x: -20, z: -146, v: '#2a9d8f' },
    { k: 'tire', x: 20, z: -146, v: 4 },
    { k: 'cone', x: 50, z: -140 },
    { k: 'cone', x: 60, z: -142 },
    { k: 'battery', x: 90, z: -140 },
    { k: 'paint', x: -120, z: -145, v: '#3d9bff' },
    { k: 'tire', x: -210, z: 40, v: 1 },
    { k: 'tire', x: -210, z: 52, v: 3 },
    { k: 'toolbox', x: -226, z: -20, r: 1.57 },
    { k: 'drum', x: -208, z: -70, v: '#457b9d' },
  ],
};

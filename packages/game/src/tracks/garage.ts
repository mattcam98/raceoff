import type { TrackDef } from '../track/types';

/**
 * Grease Lightning: the garage floor after dark, between walls of old tyres.
 * The big ramp on the start straight launches you over the inspection pit,
 * paint cans roll across both long bends, and oil lies on the corners. The
 * track swings out round the middle of the floor; the shortcut cuts straight
 * under the workbench through the spilt oil, if you have the boost for it.
 */
export const garage: TrackDef = {
  id: 'garage',
  width: 19,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-60, 100],
    [30, 100],
    [100, 96],
    [150, 70],
    [168, 20],
    [160, -36],
    [124, -72],
    [70, -86],
    [20, -70],
    [0, -20],
    [-30, 12],
    [-72, 2],
    [-92, -48],
    [-130, -96],
    [-172, -88],
    [-192, -40],
    [-182, 20],
    [-146, 66],
    [-104, 94],
  ],
  edges: [{ from: 0, to: 1.3, left: 'open', right: 'open' }],
  ramps: [{ u: 1.55, len: 10, h: 3, gap: 14, look: 'plank' }],
  pads: [
    { u: 4.6, off: -0.45 },
    { u: 10.5, off: 0.4 },
    { u: 15.6, off: 0.5 },
  ],
  boxes: [2.9, 9.4, 14.5],
  zones: [
    { x: 160, z: -10, rx: 7, rz: 10, surface: 'slick', look: 'oil' },
    { x: -110, z: -74, rx: 7, rz: 5, rot: 0.6, surface: 'slick', look: 'oil' },
    { x: -156, z: 54, rx: 6, rz: 6, surface: 'slick', look: 'oil' },
    { x: -40, z: -80, rx: 8, rz: 4, surface: 'slick', look: 'oil' },
  ],
  shortcuts: [
    {
      points: [
        [16, -72],
        [-30, -80],
        [-80, -86],
        [-122, -96],
      ],
      width: 9,
      surface: 'rough',
      edge: 'wall',
      boxes: [1.6],
      aiChance: 0.7,
      needsBoost: true,
    },
  ],
  hazards: [
    { kind: 'roller', r: 4, motion: { type: 'across', u: 3.9, period: 6 }, look: 'paint' },
    { kind: 'roller', r: 4, motion: { type: 'across', u: 15.9, period: 6.6 }, phase: 1.4, look: 'paint' },
  ],
  props: [
    { k: 'bench', x: -36, z: -81, r: 0.1, solid: false },
    { k: 'toolbox', x: 60, z: 30, r: 0.2 },
    { k: 'drum', x: 110, z: 40, v: '#2a9d8f' },
    { k: 'drum', x: 98, z: 54, v: '#e76f51' },
    { k: 'tire', x: 40, z: -14, v: 3 },
    { k: 'crate', x: -60, z: 48, r: 0.3 },
    { k: 'battery', x: -10, z: 60 },
    { k: 'paint', x: -120, z: 20, v: '#ffd23f' },
    { k: 'cone', x: 136, z: -30 },
    { k: 'cone', x: 120, z: -42 },
    { k: 'cone', x: -60, z: -40 },
    { k: 'wrench', x: 20, z: 30, r: 0.7, solid: false },
    { k: 'screwdriver', x: 80, z: -20, r: -0.4, solid: false },
    // Round the edges of the garage.
    { k: 'tire', x: 215, z: 100, v: 4 },
    { k: 'drum', x: 215, z: -100, s: 1.4, v: '#457b9d' },
    { k: 'crate', x: -230, z: 120, s: 1.4 },
    { k: 'toolbox', x: -230, z: -130, s: 1.6, r: 0.5 },
    { k: 'paint', x: 190, z: -140, s: 1.6, v: '#ef476f' },
  ],
};

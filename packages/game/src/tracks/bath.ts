import type { TrackDef } from '../track/types';

/**
 * Bubble Bath Bay: round a full bathtub on the bathroom tiles. The back
 * straight runs along the tub with nothing between you and the water; a sponge
 * ramp leaps the overflow on the right; a bath bomb rolls across the start
 * straight. The soapy shortcut on the left is quick if you can keep it straight.
 */
export const bath: TrackDef = {
  id: 'bath',
  width: 18,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-50, 92],
    [30, 92],
    [90, 82],
    [126, 48],
    [132, 4],
    [118, -42],
    [82, -76],
    [30, -86],
    [-20, -86],
    [-70, -88],
    [-118, -74],
    [-152, -36],
    [-150, 14],
    [-118, 52],
    [-88, 86],
  ],
  edges: [
    // Along the tub: an open edge on the inside, with the bath water just beyond it.
    { from: 6.6, to: 9.4, left: 'open' },
    { from: 0, to: 1.2, left: 'open', right: 'open' },
  ],
  ramps: [{ u: 3.62, len: 8, h: 3, gap: 9, over: 'water', look: 'sponge' }],
  pads: [
    { u: 1.4, off: -0.5 },
    { u: 8, off: 0.55 },
  ],
  boxes: [2.2, 7.4, 12.3],
  zones: [
    // The bathtub's water, the overflow under the jump, and soap.
    { x: 0, z: -12, rx: 72, rz: 52, surface: 'water', look: 'water' },
    { x: 104, z: 66, rx: 6, rz: 4, rot: 0.7, surface: 'slick', look: 'suds' },
    { x: -150, z: -10, rx: 6, rz: 9, surface: 'slick', look: 'suds' },
    { x: -40, z: -82, rx: 6, rz: 4, surface: 'slick', look: 'suds' },
  ],
  shortcuts: [
    {
      points: [
        [-116, -76],
        [-128, -40],
        [-126, 0],
        [-114, 46],
      ],
      width: 9,
      surface: 'road',
      edge: 'wall',
      boxes: [1.5],
      aiChance: 0.5,
    },
  ],
  hazards: [{ kind: 'roller', r: 3.6, motion: { type: 'across', u: 0.7, period: 6.5 }, look: 'bathbomb' }],
  props: [
    { k: 'tub', x: 0, z: -12, solid: false },
    { k: 'duck', x: -30, z: -20, r: 0.8, solid: false },
    { k: 'duck', x: 22, z: 4, r: -2.2, s: 1.4, solid: false, v: '#ff8fab' },
    { k: 'duck', x: 40, z: -40, r: 2.6, solid: false },
    { k: 'soap', x: 76, z: 46, r: 0.5 },
    { k: 'bottle', x: 82, z: 30, v: '#7b2cbf' },
    { k: 'bottle', x: 92, z: 22, v: '#06d6a0', r: 0.4 },
    { k: 'sponge', x: -60, z: 60, r: 0.3 },
    { k: 'roll', x: -96, z: 30 },
    { k: 'cup', x: -90, z: -40 },
    // Around the outside.
    { k: 'towel', x: -60, z: 130, r: 0.1, solid: false },
    { k: 'bathmat', x: 60, z: 132, solid: false },
    { k: 'duck', x: 160, z: -60, s: 2.2, r: -1.2 },
    { k: 'roll', x: 170, z: 40, s: 1.4 },
    { k: 'bottle', x: -180, z: 60, s: 1.6, v: '#ff8fab' },
    { k: 'soap', x: 150, z: 110, s: 1.4, r: 0.3, v: '#bde0fe' },
    { k: 'cup', x: -170, z: -100, s: 1.5 },
  ],
};

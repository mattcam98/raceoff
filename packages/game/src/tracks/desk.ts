import type { TrackDef } from '../track/types';

/**
 * Office Overdrive: round a study desk walled in pencils. The back straight
 * climbs a stack of books and leaps off the end; a stapler snaps shut on the
 * fast right-hand sweep; a notepad shortcut cuts the infield S, if you have
 * a boost to get across the paper.
 */
export const desk: TrackDef = {
  id: 'desk',
  width: 17,
  floorY: 0,
  ground: 'rough',
  floor: { minX: -175, maxX: 175, minZ: -112, maxZ: 112 },
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-60, 86],
    [20, 86],
    [80, 83],
    [124, 62],
    [142, 22],
    [130, -22],
    [100, -46],
    [68, -36],
    [44, -10],
    [8, -6],
    [-22, -26],
    [-36, -62, 17, 0],
    [-66, -86, 16, 6],
    [-104, -86, 16, 6],
    [-138, -58, 17, 0],
    [-146, -12],
    [-132, 32],
    [-110, 70],
    [-88, 86],
  ],
  edges: [{ from: 0, to: 1.5, left: 'open', right: 'open' }],
  ramps: [{ u: 13.15, len: 7, h: 1.6, gap: 8, look: 'book' }],
  pads: [
    { u: 1.5, off: 0.6 },
    { u: 16.2, off: -0.4 },
  ],
  boxes: [2.5, 9.2, 15.4],
  zones: [{ x: 58, z: -25, rx: 7, rz: 5, rot: 0.4, surface: 'slick', look: 'coffee' }],
  shortcuts: [
    {
      points: [
        [96, -52],
        [60, -66],
        [20, -70],
        [-12, -68],
        [-34, -60],
      ],
      width: 9,
      surface: 'rough',
      edge: 'open',
      boxes: [2],
      aiChance: 0.8,
      needsBoost: true,
    },
  ],
  hazards: [{ kind: 'stomper', x: 140, z: 18, r: 5, period: 3.6, look: 'stapler' }],
  props: [
    { k: 'laptop', x: -45, z: 38, r: 0.12, s: 0.9, solid: false },
    { k: 'pencilcup', x: 70, z: 34 },
    { k: 'mug', x: 102, z: 12, v: '#3d5a80' },
    { k: 'calculator', x: 24, z: 50, r: -0.3 },
    { k: 'eraser', x: -96, z: 20, r: 0.6 },
    { k: 'eraser', x: 6, z: 22, r: -0.2, v: '#7fd1ff' },
    { k: 'stickies', x: -10, z: 30, r: 0.2, solid: false },
    { k: 'stickies', x: 40, z: 14, r: -0.4, v: '#ff8fab', solid: false },
    { k: 'paperclip', x: -80, z: -10, r: 0.5, solid: false },
    { k: 'paperclip', x: 90, z: 46, r: -0.8, solid: false },
    { k: 'notepad', x: 32, z: -68, r: 0.05, s: 1.1, solid: false },
    { k: 'mouse', x: 116, z: 26, r: -0.2 },
    { k: 'books', x: -84, z: -38, r: 0.1, v: 2 },
    // Around the edge of the desk.
    { k: 'lamp', x: 155, z: -88 },
    { k: 'globe', x: -158, z: -96 },
    { k: 'plant', x: 160, z: 94 },
    { k: 'books', x: -150, z: 94, r: 0.3, v: 4 },
    { k: 'pencil', x: 60, z: 102, r: 1.4, v: '#ef476f', solid: false },
    { k: 'ruler', x: -20, z: 104, r: 1.5, solid: false },
    { k: 'mug', x: 160, z: 50, v: '#ffd23f' },
  ],
};

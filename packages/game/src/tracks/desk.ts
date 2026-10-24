import type { TrackDef } from '../track/types';

/**
 * Office Overdrive: round a study desk walled in pencils. The wide start
 * straight runs along the back edge of the desk, open on that side; a
 * stapler snaps shut on the inside of the fast right-hand sweep at its end,
 * so take it wide or time it.
 *
 * Then the pencil-cup esses: a narrow right, a tight left-hand loop round the
 * pencil cup with coffee on its inside, and a right out again. A notepad
 * shortcut runs straight past them, on paper: quick only with a boost.
 *
 * The back straight is the long one: boxes at its start, ink on one lane,
 * then it climbs a stack of books (more boxes on top) and leaps off the end,
 * high over the drop to the desk. A hairpin round the globe, a long left
 * loop round the mouse to drift, the short ruler straight and the lamp sweep
 * bring you back to the start.
 */
export const desk: TrackDef = {
  id: 'desk',
  width: 21.6,
  floorY: 0,
  ground: 'rough',
  floor: { minX: -198, maxX: 140, minZ: -124, maxZ: 150 },
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-90, -100, 28.8], // 0: start straight
    [-66.7, -100, 28.8],
    [-43.3, -100, 28.8],
    [-20, -100, 28.8],
    [3.3, -100, 28.8],
    [26.7, -100, 28.8],
    [50, -100, 28.8], // 6: stapler sweep
    [73, -95.4, 27.6],
    [92.4, -82.4, 26.4],
    [105.4, -63, 25.2],
    [110, -40, 24],
    [110, -10], // 11: pencil-cup esses
    [107.1, 1, 20.4],
    [99, 9.1, 19.5],
    [88, 12, 19.5],
    [77, 14.9, 19.5],
    [68.9, 23, 19.5],
    [66, 34, 19.5],
    [68.9, 45, 19.5],
    [77, 53.1, 19.5],
    [88, 56, 19.5],
    [99, 58.9, 19.5],
    [107.1, 67, 19.5],
    [110, 78, 19.5],
    [110, 98], // 24: onto the back straight
    [106, 113, 22.4],
    [95, 124, 23.2],
    [80, 128, 24], // 27: back straight
    [58.2, 128, 24.5],
    [36.4, 128, 25],
    [14.6, 128, 25.4],
    [-7.2, 128, 25.9],
    [-29, 128, 26.4], // 32: book climb
    [-51, 128, 22.8, 4],
    [-73, 128, 19.2, 8], // 34: book top
    [-93, 128, 19.2, 8],
    [-113, 128, 19.2, 8], // 36: lip
    [-117, 128, 19.2, 8], // 37: leap
    [-135, 128],
    [-155, 128], // 39: globe hairpin
    [-164, 125.6, 21.2],
    [-170.6, 119, 20.8],
    [-173, 110, 20.4],
    [-170.6, 101, 20],
    [-164, 94.4, 20],
    [-155, 92, 20],
    [-135, 92],
    [-115, 92, 24], // 47: mouse loop
    [-96, 86.9, 23.6],
    [-82.1, 73, 23.2],
    [-77, 54, 22.8],
    [-82.1, 35, 22.4],
    [-96, 21.1, 22],
    [-115, 16],
    [-145, 16],
    [-160, 12],
    [-171, 1],
    [-175, -14], // 57: ruler
    [-175, -34.5, 22.8],
    [-175, -55, 24], // 59: lamp sweep
    [-169, -77.5, 24.8],
    [-152.5, -94, 25.6],
    [-130, -100, 26.4], // 62: grid
    [-110, -100, 27.6],
  ],
  edges: [
    // The start straight runs along the edge of the desk, open on the outside.
    { from: 62, to: 6, left: 'open' },
    // Cut the inside of the esses across the paper, through the coffee if you cut too far.
    { from: 14, to: 20, left: 'open' },
    { from: 20, to: 27, right: 'open' },
    // The insides of the mouse loop and the corners after it are open desk too.
    { from: 47, to: 53, left: 'open' },
    { from: 54, to: 62, right: 'open' },
  ],
  // The leap off the book stack: a small kick at the top, then a long drop over nothing.
  ramps: [{ u: 35.75, len: 5, h: 1, gap: 14, look: 'book' }],
  pads: [
    { u: 45.5, off: 0.5 },
    { u: 53.6, off: -0.4 },
  ],
  boxes: [2.5, 27.5, 35, 58],
  zones: [
    // Coffee on the inside of the loop round the pencil cup.
    { x: 75, z: 34, rx: 4, rz: 8, surface: 'slick', look: 'coffee' },
    // Ink on the right-hand lane of the back straight.
    { x: 20, z: 122, rx: 10, rz: 4.5, surface: 'slick', look: 'ink' },
  ],
  shortcuts: [
    {
      points: [
        [110, -6],
        [121, 16],
        [125, 40],
        [121, 64],
        [110, 92],
      ],
      width: 9,
      surface: 'rough',
      edge: 'open',
      boxes: [2],
      aiChance: 0.8,
      needsBoost: true,
    },
  ],
  hazards: [{ kind: 'stomper', x: 89, z: -79, r: 5, period: 3.6, look: 'stapler' }],
  props: [
    // The infield.
    { k: 'laptop', x: -10, z: 10, r: 0.12, s: 1.4, solid: false },
    { k: 'calculator', x: 20, z: 64, r: -0.3 },
    { k: 'mug', x: 30, z: -44, v: '#3d5a80' },
    { k: 'eraser', x: -40, z: -54, r: 0.6 },
    { k: 'eraser', x: 0, z: 96, r: -0.2, v: '#7fd1ff' },
    { k: 'stickies', x: 40, z: 0, r: 0.2, solid: false },
    { k: 'paperclip', x: -60, z: 70, r: 0.5, solid: false },
    { k: 'paperclip', x: 50, z: 96, r: -0.8, solid: false },
    { k: 'pencil', x: 10, z: -66, r: 1.4, v: '#ef476f', solid: false },
    // The esses wrap round the pencil cup; the notepad lies beside them.
    { k: 'pencilcup', x: 90, z: 34 },
    { k: 'notepad', x: 122, z: 40, r: 1.57, s: 1.1, solid: false },
    // The hairpin turns round the globe and the loop round the mouse.
    { k: 'globe', x: -153, z: 110, s: 0.7 },
    { k: 'mouse', x: -112, z: 54, r: -0.2, s: 1.5 },
    { k: 'stickies', x: -126, z: 40, r: -0.4, v: '#ff8fab', solid: false },
    { k: 'ruler', x: -150, z: -34, r: 0, solid: false },
    // Round the edge of the desk.
    { k: 'lamp', x: -178, z: -108 },
    { k: 'plant', x: 128, z: -108 },
    { k: 'books', x: -182, z: 55, r: 1.57, s: 0.6, v: 4 },
    { k: 'mug', x: 130, z: 132, v: '#ffd23f' },
  ],
};

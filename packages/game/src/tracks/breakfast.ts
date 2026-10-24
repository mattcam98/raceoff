import type { TrackDef } from '../track/types';

/**
 * Breakfast Bend: round a kitchen table on a gingham cloth. Sugar-cube walls
 * keep you on the table through the corners; the wide start straight runs
 * open along the table's edge, so a wide line goes over it.
 *
 * A long left sweep round the teapot (hold the drift all the way) feeds a
 * pad onto the breadboard: a narrow raised run with a row of boxes on it that
 * ends in a drop straight into the jam-jar hairpin. Out of the hairpin a short
 * straight and a right-hander set up the back straight across open cloth,
 * where a slice of toast makes a ramp over a puddle of milk: fly it flat out
 * and you clear the milk, come at it slow and you land in it. A right turns up
 * into the big U, the second long drift; a narrow lane slips inside it,
 * between the cereal bowl and the sugar bowl, through more milk: shorter, but
 * tight and slippery. Down the far side a chicane has jam on its tightest line,
 * and the last bend opens out onto the start straight.
 */
export const breakfast: TrackDef = {
  id: 'breakfast',
  width: 21.6,
  floorY: 0,
  ground: 'rough',
  floor: { minX: -172, maxX: 194, minZ: -132, maxZ: 121 },
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-68, 97, 28.8], // 0: start straight
    [-46, 97, 28.8],
    [-24, 97, 28.8],
    [-2, 97, 28.8],
    [20, 97, 28.8],
    [42, 97, 28.8],
    [64, 97, 28.8],
    [86, 97, 28.8],
    [108, 97, 28.8], // 8: teapot sweep
    [130.2, 92.6, 27.6],
    [149, 80, 26.4],
    [161.6, 61.2, 25.2],
    [166, 39, 24],
    [166, 9, 20.4], // 13: breadboard climb
    [166, -9, 19.8, 1.5],
    [166, -27, 19.2, 3], // 15: breadboard
    [166, -54, 19.2, 3],
    [166, -81, 19.2, 3], // 17: drop
    [166, -87, 19.2],
    [166, -95, 21], // 19: jam-jar hairpin
    [163.6, -104, 21],
    [157, -110.6, 21],
    [148, -113, 21],
    [139, -110.6, 21],
    [132.4, -104, 21],
    [130, -95, 19.2], // 25: recovery
    [130, -76.3, 19.6],
    [130, -57.7, 20],
    [130, -39, 20.4],
    [126, -24],
    [115, -13, 22.8],
    [100, -9, 24], // 31: back straight
    [76.4, -9, 24.5],
    [52.8, -9, 25],
    [29.2, -9, 25.4],
    [5.6, -9, 25.9],
    [-18, -9, 26.4],
    [-34, -13.3, 24.8],
    [-45.7, -25, 23.2],
    [-50, -41], // 39: north
    [-50, -62.4], // 40: the big U
    [-55, -84.1, 22],
    [-68.8, -101.5, 22.3],
    [-88.9, -111.2, 22.7],
    [-111.1, -111.2, 22.9],
    [-131.2, -101.5, 23.3],
    [-145, -84.1, 23.6],
    [-150, -62.4, 24], // 47: left straight
    [-150, -32.4, 24], // 48: jam chicane
    [-147.9, -23.1, 24],
    [-142.1, -15.6, 24],
    [-136.3, -8, 20],
    [-134.3, 1.3, 20],
    [-136.3, 10.6, 20],
    [-142.1, 18.1, 20],
    [-147.9, 25.7, 20],
    [-150, 35, 20],
    [-150, 55, 24], // 57: last bend
    [-144.4, 76, 25.6],
    [-129, 91.4, 27.2],
    [-108, 97, 28.8], // 60: grid
    [-88, 97, 28.8],
  ],
  edges: [
    // The start straight runs along the table edge with nothing to stop you going over.
    { from: 60, to: 8.3, left: 'open', right: 'open' },
    // Cut the insides of the sweeps across the tablecloth if you dare.
    { from: 8.3, to: 12, left: 'open' },
    { from: 57, to: 60, left: 'open' },
    // The back straight crosses open tablecloth, with the corners either end open on the inside.
    { from: 28, to: 39, right: 'open' },
    { from: 31.2, to: 36, left: 'open' },
  ],
  ramps: [{ u: 32.5, len: 8, h: 2.4, look: 'toast' }],
  pads: [
    // Out of the teapot sweep on the inside, onto the breadboard.
    { u: 12.3, off: -0.5 },
    // The hairpin's exit, for those who cut it tight.
    { u: 25.6, off: -0.45 },
  ],
  boxes: [2.5, 15.8, 31.4, 56.6],
  zones: [
    // Milk past the toast: fly over it at full speed, splash through it if you are slow.
    { x: 40, z: -9, rx: 8, rz: 7, surface: 'slick', look: 'milk' },
    // Jam on the inside of the chicane's middle kink: the tightest line is the sticky one.
    { x: -142, z: 1, rx: 4, rz: 9, surface: 'sticky', look: 'jam' },
    // The milky lane.
    { x: -100, z: -86, rx: 8, rz: 4.5, surface: 'slick', look: 'milk' },
  ],
  shortcuts: [
    {
      // Inside the big U, round the cereal bowl.
      points: [
        [-50, -42],
        [-63, -61],
        [-78, -77],
        [-100, -86],
        [-122, -77],
        // It rejoins almost alongside the main road, so nobody arrives aimed at the chicane's outside wall.
        [-138, -64],
        [-147, -50],
        [-150, -34],
      ],
      width: 9,
      surface: 'road',
      edge: 'wall',
      boxes: [3],
      aiChance: 0.45,
    },
  ],
  props: [
    // Inside the teapot sweep and along the breadboard.
    { k: 'teapot', x: 112, z: 44, s: 1.2 },
    { k: 'shaker', x: 148, z: 12, v: 'salt' },
    { k: 'shaker', x: 148, z: 2, v: 'pepper' },
    { k: 'sugar', x: 148, z: -30, r: 0.3 },
    { k: 'sugar', x: 147, z: -54, r: 0.8 },
    // The hairpin turns round the jam jar.
    { k: 'jar', x: 148, z: -93, v: 'jam' },
    // The big infield between the straights.
    { k: 'plate', x: 0, z: 44, s: 1.6 },
    { k: 'mug', x: 36, z: 24, s: 1.2 },
    { k: 'glass', x: -22, z: 66, s: 1.1 },
    { k: 'butter', x: -22, z: 22, r: -0.3 },
    { k: 'carton', x: 44, z: 66, r: 0.4, s: 1.1 },
    { k: 'spoon', x: 14, z: 72, r: 0.6 },
    // Round the chicane and the last bend.
    { k: 'cereal', x: -92, z: 20, r: 1.4, s: 1.1 },
    { k: 'orange', x: -108, z: 56 },
    { k: 'apple', x: -96, z: 66, s: 0.9 },
    { k: 'toast', x: -70, z: 44, r: 0.3, solid: false },
    // The milky lane slips between the cereal bowl and the sugar bowl.
    { k: 'bowl', x: -100, z: -62, s: 0.6, v: 'cereal' },
    { k: 'jar', x: -122, z: -88, s: 0.5, v: 'sugar' },
    // Beyond the back straight.
    { k: 'toaster', x: 24, z: -64, r: 0.1 },
    { k: 'napkin', x: 50, z: -100, r: 0.2 },
    { k: 'glass', x: -14, z: -96, s: 1.1 },
    { k: 'jar', x: 94, z: -42, v: 'honey' },
    // Round the edge of the table.
    { k: 'mug', x: 187, z: 20, s: 0.9 },
    { k: 'fork', x: 184, z: -70, r: 0.2 },
    { k: 'knife', x: 186, z: -40, r: 0.1 },
    { k: 'apple', x: -162, z: -120 },
    { k: 'orange', x: 180, z: 104, s: 0.9 },
  ],
  hazards: [],
};

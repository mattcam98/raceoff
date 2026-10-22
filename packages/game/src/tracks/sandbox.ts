import type { TrackDef } from '../track/types';

/**
 * Sandcastle Circuit: out on the lawn, through the sandpit and round the
 * castle. Grass lines most of it, so a wide line costs you rather than
 * stopping you.
 *
 * The long start straight ends in the lawn sweep, with a pad on its inside
 * that throws you at the plank ramp over the garden stream; the run up the
 * far side after it is the longest straight. Then the road dives into the
 * sandpit and out again, sand dragging at anyone off the line, and hops a
 * dune. A fast sweep round the flowerbed follows; the flowerbed shortcut cuts
 * inside it on pure sand, so bring a boost. A football rolls across the back
 * straight, a tight right turns you in, and a left hairpin wraps round the
 * sandcastle itself before two quick rights bring you back to the start.
 */
export const sandbox: TrackDef = {
  id: 'sandbox',
  width: 19,
  floorY: 0,
  ground: 'rough',
  shoulder: 4,
  defaultEdge: 'open',
  points: [
    [100, 110, 24], // 0: start straight
    [77.5, 110, 24],
    [55, 110, 24],
    [32.5, 110, 24],
    [10, 110, 24],
    [-12.5, 110, 24],
    [-35, 110, 24],
    [-57.5, 110, 24],
    [-80, 110, 24], // 8: lawn sweep
    [-101, 105.8, 23],
    [-118.9, 93.9, 22],
    [-130.8, 76, 21],
    [-135, 55, 20], // 12: stream
    [-135, 35, 19.5],
    [-135, 15],
    [-135, -15, 18],
    [-135, -41.6, 18], // 16: lawn kink
    [-136.7, -58.7],
    [-141.6, -75.3, 20],
    [-146.5, -91.8],
    [-148.1, -109, 18],
    [-148.1, -129, 18], // 21: into the sandpit
    [-144.1, -144, 17.7],
    [-133.1, -155, 17.3],
    [-118.1, -159, 17],
    [-98.1, -159, 17], // 25: down into the pit
    [-82.1, -154.7, 16.5],
    [-70.4, -143, 16],
    [-58.7, -131.3, 15.8],
    [-42.7, -127, 15.5],
    [-26.7, -131.3, 15.3],
    [-15, -143, 15],
    [-3.3, -154.7, 15.5],
    [12.7, -159, 16], // 33: dune
    [20.7, -159, 17],
    [36.7, -159, 18, 2.5],
    [52.7, -159], // 36: top straight
    [85, -159, 20], // 37: flowerbed sweep
    [108, -154.4, 20],
    [127.4, -141.4, 20],
    [140.4, -122, 20],
    [145, -99, 20], // 41: back straight
    [145, -74, 20],
    [145, -49, 20],
    [141.7, -36.5],
    [132.5, -27.3, 18],
    [120, -24, 17], // 46: turn in
    [100, -24, 17.5],
    [80, -24, 18], // 48: castle hairpin
    [64, -19.7, 18],
    [52.3, -8, 18],
    [48, 8, 18],
    [52.3, 24, 18],
    [64, 35.7, 18],
    [80, 40, 18], // 54: out of the sand
    [100, 40, 18.7],
    [120, 40, 19.3],
    [140, 40, 20],
    [155, 44, 20],
    [166, 55, 20],
    [170, 70, 20],
    [170, 80, 22], // 61: last corner
    [166, 95, 22.7],
    [155, 106, 23.3],
    [140, 110, 24], // 64: grid
    [120, 110, 24],
  ],
  ramps: [{ u: 12.5, len: 8, h: 3, gap: 9, over: 'water', look: 'plank' }],
  pads: [
    // The lawn sweep's inside, straight at the plank.
    { u: 11.5, off: 0.5 },
    // Out of the castle hairpin on the inside.
    { u: 53.6, off: -0.5 },
  ],
  boxes: [3, 15.5, 29, 54.5],
  zones: [
    // The sandpit the road dives through, and the sand round the castle.
    { x: -30, z: -105, rx: 80, rz: 48, surface: 'sand', look: 'sand', offRoad: true },
    { x: 80, z: 8, rx: 46, rz: 42, surface: 'sand', look: 'sand', offRoad: true },
    // The garden stream, under the plank.
    { x: -135, z: 32.5, rx: 50, rz: 4.5, surface: 'water', look: 'pond' },
  ],
  shortcuts: [
    {
      points: [
        [62, -159],
        [88, -140],
        [110, -118],
        [135, -95],
        [145, -75],
      ],
      width: 10,
      surface: 'sand',
      edge: 'open',
      boxes: [2],
      aiChance: 0.7,
      needsBoost: true,
    },
  ],
  hazards: [{ kind: 'roller', r: 4.5, motion: { type: 'across', u: 42.5, period: 7 }, look: 'football' }],
  props: [
    // The castle in its sand, with its buckets and spade.
    { k: 'castle', x: 80, z: 8, s: 1.1 },
    { k: 'bucket', x: 110, z: 8, v: '#ff4d6d' },
    { k: 'spade', x: 96, z: -6, r: 1.2, solid: false },
    // The sandpit.
    { k: 'bucket', x: -30, z: -100, v: '#3d9bff', r: 0.4 },
    { k: 'spade', x: -50, z: -110, r: 0.4, solid: false },
    // The lawn inside the lap.
    { k: 'gnome', x: -40, z: -40 },
    { k: 'pot', x: -60, z: 50, v: '#ff70a6' },
    { k: 'pot', x: -20, z: 64, v: '#ffd23f' },
    { k: 'can', x: -95, z: 10, r: 0.5 },
    { k: 'hose', x: -80, z: 34, solid: false },
    { k: 'stone', x: 0, z: 10 },
    { k: 'stone', x: 20, z: 60, s: 0.8 },
    { k: 'bucket', x: 105, z: 75, s: 0.9, v: '#ffd23f' },
    // The flowerbed inside the sweep, round the shortcut.
    { k: 'flower', x: 75, z: -120, v: '#ff70a6', solid: false },
    { k: 'flower', x: 95, z: -100, v: '#ffd23f', solid: false },
    { k: 'flower', x: 118, z: -142, v: '#9b5de5', solid: false },
    { k: 'flower', x: 128, z: -112, v: '#ff8fab', solid: false },
    { k: 'mushroom', x: 100, z: -70 },
    { k: 'mushroom', x: 110, z: -62, s: 0.7 },
    // The garden beyond.
    { k: 'gnome', x: 200, z: -20, s: 2 },
    { k: 'flower', x: 210, z: 60, v: '#ffd23f', s: 1.6, solid: false },
    { k: 'flower', x: -190, z: -110, v: '#ff70a6', s: 1.5, solid: false },
    { k: 'bucket', x: 200, z: 140, s: 1.6, v: '#ffd23f' },
    { k: 'stone', x: -190, z: 110, s: 2 },
    { k: 'pot', x: -60, z: -200, s: 1.5, v: '#9b5de5' },
  ],
};

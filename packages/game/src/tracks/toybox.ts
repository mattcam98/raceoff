import type { TrackDef } from '../track/types';

/**
 * Toybox Tangle: across the playroom carpet between walls of building blocks.
 *
 * The wide start straight ends in the sweep round the teddy, and a picture
 * book makes a jump on the right-hand straight. At the far end of the room
 * the road climbs onto the lid of the toy box and loops up and round the toy
 * fort, then slides back down to the carpet. The shortcut cuts straight
 * across the loop's mouth, through the fort's gate, where the toy train
 * crosses twice: much shorter, if the train lets you through.
 *
 * Off the slide the block maze jinks up and round a tower of blocks in four
 * tight corners, block alley runs back across the room, a left turns you down
 * the near side, and the block esses tangle you up before the last bend,
 * where a spinning top wanders the inside line.
 */
export const toybox: TrackDef = {
  id: 'toybox',
  width: 21.6,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-120, 110, 28.8], // 0: start straight
    [-97, 110, 28.8],
    [-74, 110, 28.8],
    [-51, 110, 28.8],
    [-28, 110, 28.8],
    [-5, 110, 28.8],
    [18, 110, 28.8],
    [41, 110, 28.8],
    [64, 110, 28.8],
    [87, 110, 28.8],
    [110, 110, 28.8], // 10: teddy sweep
    [134, 103.6, 27.2],
    [151.6, 86, 25.6],
    [158, 62, 24], // 13: book
    [158, 32, 24],
    [158, 8.7, 24],
    [158, -14.6, 24],
    [158, -37.9, 24],
    [158, -61.1, 24],
    [154, -76.1, 23.2],
    [143, -87.1, 22.4],
    [128, -91.1],
    [108, -91.1], // 22: up onto the toy box
    [95.5, -94.5, 21.2, 1.3],
    [86.3, -103.6, 20.8, 2.7],
    [83, -116.1, 20.4, 4], // 25: round the fort
    [77.4, -137.1, 20.4, 4.2],
    [62, -152.5, 20.4, 4.3],
    [41, -158.1, 20.4, 4.5],
    [20, -152.5, 20.4, 4.7],
    [4.6, -137.1, 20.4, 4.8],
    [-1, -116.1, 20.4, 5], // 31: down the slide
    [-4.3, -103.6, 20.4, 3.3],
    [-13.5, -94.5, 20.4, 1.7],
    [-26, -91.1, 20.4], // 34: block maze
    [-36, -91.1],
    [-48, -94.4, 20.8],
    [-56.8, -103.1, 20],
    [-60, -115.1, 19.5],
    [-60, -135.1, 19.5],
    [-63.2, -147.1, 19.5],
    [-72, -155.9, 19.5],
    [-84, -159.1, 19.5],
    [-94, -159.1, 20.4],
    [-106, -155.9, 20],
    [-114.8, -147.1, 19.6],
    [-118, -135.1, 19.5],
    [-118, -115.1, 19.5],
    [-121.2, -103.1, 19.6],
    [-130, -94.4, 20],
    [-142, -91.1, 20.4], // 50: block alley
    [-160, -91.1, 22.2],
    [-178, -91.1, 24],
    [-193, -87.1, 23.2],
    [-204, -76.1, 22.4],
    [-208, -61.1],
    [-208, -41.1], // 56: block esses
    [-204.8, -29.1, 19.8],
    [-196, -20.4, 19.5],
    [-187.2, -11.6, 19.5],
    [-184, 0.4, 19.5],
    [-187.2, 12.4, 19.5],
    [-196, 21.2, 19.5],
    [-204.8, 30, 19.5],
    [-208, 42, 19.5],
    [-208, 62, 24], // 65: top bend
    [-201.6, 86, 25.6],
    [-184, 103.6, 27.2],
    [-160, 110, 28.8], // 68: grid
    [-140, 110, 28.8],
  ],
  edges: [
    { from: 68, to: 10, left: 'open', right: 'open' },
    // Block walls on the outsides of the corners; the insides are open carpet, to cut across if you dare.
    { from: 18, to: 21, left: 'open' },
    { from: 35, to: 38, right: 'open' },
    { from: 39, to: 46.7, left: 'open' },
    { from: 47, to: 50.7, right: 'open' },
    { from: 52, to: 56, left: 'open' },
    { from: 33.3, to: 34.5, right: 'open' },
    { from: 65, to: 68, left: 'open' },
  ],
  ramps: [{ u: 13.5, len: 9, h: 2.8, look: 'book' }],
  pads: [
    // Off the bottom of the slide on the inside, and out of the esses.
    { u: 33.6, off: 0.5 },
    { u: 63.6, off: 0 },
  ],
  boxes: [3, 14.5, 28, 50.5],
  shortcuts: [
    {
      points: [
        [110, -91],
        [70, -91],
        [41, -91],
        [12, -91],
        [-28, -91],
      ],
      width: 10,
      surface: 'road',
      edge: 'wall',
      boxes: [2],
      aiChance: 0.45,
    },
  ],
  hazards: [
    {
      // Round the fort, crossing the shortcut on either side of the gate.
      kind: 'train',
      r: 3.4,
      cars: 4,
      motion: {
        type: 'loop',
        speed: 14,
        points: [[15, -78], [67, -78], [67, -132], [15, -132]],
      },
    },
    { kind: 'top', r: 4, motion: { type: 'circle', cx: -187, cz: 89, radius: 10, period: 8 }, look: 'top' },
  ],
  props: [
    // The fort inside the loop, its gate on the shortcut.
    { k: 'fort', x: 41, z: -110, s: 0.8 },
    { k: 'gate', x: 41, z: -91, r: 1.57, solid: false },
    // A tower of blocks inside the maze.
    { k: 'bigblock', x: -89, z: -128, v: 1 },
    { k: 'block', x: -89, z: -114, r: 0.4, v: 3 },
    // The playroom floor inside the lap.
    { k: 'teddy', x: 105, z: 68, r: -2.4 },
    { k: 'toyball', x: -110, z: 30 },
    { k: 'rings', x: -20, z: 40 },
    { k: 'cube', x: 50, z: 10, r: 0.4 },
    { k: 'block', x: -140, z: -30, v: 0 },
    { k: 'block', x: -132, z: -38, r: 0.3, v: 3 },
    { k: 'bigblock', x: 110, z: -30, r: 0.2, v: 1 },
    { k: 'block', x: -60, z: 0, r: 0.5, v: 2 },
    { k: 'crayon', x: -40, z: 70, r: 0.4, v: '#06d6a0', solid: false },
    { k: 'toycar', x: 40, z: 70, r: 1.1, v: '#ef476f', solid: false },
    { k: 'dominoes', x: 0, z: -50, r: 0.1, solid: false },
    // Out on the carpet.
    { k: 'teddy', x: 220, z: -40, s: 2, r: -1.3 },
    { k: 'toyball', x: 220, z: 130, s: 1.6 },
    { k: 'bigblock', x: -265, z: -110, s: 1.6, r: 0.5, v: 4 },
    { k: 'rings', x: 140, z: -200, s: 1.6 },
    { k: 'bigblock', x: -265, z: 90, s: 1.4, v: 2 },
    { k: 'cube', x: -160, z: -190, s: 1.5 },
    // Beside the long right-hand straight, along block alley and the esses, and past the start: scale for the long runs.
    { k: 'bigblock', x: 188, z: 30, s: 1.2, v: 3 },
    { k: 'toyball', x: 186, z: -30 },
    { k: 'rings', x: 184, z: -75 },
    { k: 'cube', x: 130, z: -40, r: 0.7 },
    { k: 'teddy', x: -60, z: 152, s: 1.2, r: 2.8 },
    { k: 'block', x: -20, z: 146, r: 0.3, v: 1 },
    { k: 'bigblock', x: 10, z: 150, r: 0.4, v: 0 },
    { k: 'cube', x: -240, z: -20, r: 0.2 },
    { k: 'toyball', x: -240, z: 40, s: 0.8 },
    { k: 'block', x: -236, z: -62, s: 1.2, r: 0.6, v: 2 },
    { k: 'bigblock', x: -150, z: -120, s: 0.9, r: 0.3, v: 4 },
    { k: 'teddy', x: -145, z: 0, r: 1.2 },
  ],
};

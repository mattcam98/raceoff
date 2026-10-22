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
  width: 18,
  floorY: 0,
  ground: 'rough',
  shoulder: 3,
  defaultEdge: 'wall',
  points: [
    [-120, 110, 24], // 0: start straight
    [-97, 110, 24],
    [-74, 110, 24],
    [-51, 110, 24],
    [-28, 110, 24],
    [-5, 110, 24],
    [18, 110, 24],
    [41, 110, 24],
    [64, 110, 24],
    [87, 110, 24],
    [110, 110, 24], // 10: teddy sweep
    [134, 103.6, 22.7],
    [151.6, 86, 21.3],
    [158, 62, 20], // 13: book
    [158, 32, 20],
    [158, 8.7, 20],
    [158, -14.6, 20],
    [158, -37.9, 20],
    [158, -61.1, 20],
    [154, -76.1, 19.3],
    [143, -87.1, 18.7],
    [128, -91.1],
    [108, -91.1], // 22: up onto the toy box
    [95.5, -94.5, 17.7, 1.3],
    [86.3, -103.6, 17.3, 2.7],
    [83, -116.1, 17, 4], // 25: round the fort
    [77.4, -137.1, 17, 4.2],
    [62, -152.5, 17, 4.3],
    [41, -158.1, 17, 4.5],
    [20, -152.5, 17, 4.7],
    [4.6, -137.1, 17, 4.8],
    [-1, -116.1, 17, 5], // 31: down the slide
    [-4.3, -103.6, 17, 3.3],
    [-13.5, -94.5, 17, 1.7],
    [-26, -91.1, 17], // 34: block maze
    [-36, -91.1],
    [-48, -94.4, 17.3],
    [-56.8, -103.1, 16.7],
    [-60, -115.1, 16],
    [-60, -135.1, 16],
    [-63.2, -147.1, 16],
    [-72, -155.9, 16],
    [-84, -159.1, 16],
    [-94, -159.1, 17],
    [-106, -155.9, 16.7],
    [-114.8, -147.1, 16.3],
    [-118, -135.1, 16],
    [-118, -115.1, 16],
    [-121.2, -103.1, 16.3],
    [-130, -94.4, 16.7],
    [-142, -91.1, 17], // 50: block alley
    [-160, -91.1, 18.5],
    [-178, -91.1, 20],
    [-193, -87.1, 19.3],
    [-204, -76.1, 18.7],
    [-208, -61.1],
    [-208, -41.1], // 56: block esses
    [-204.8, -29.1, 16.5],
    [-196, -20.4, 15],
    [-187.2, -11.6, 15],
    [-184, 0.4, 15],
    [-187.2, 12.4, 15],
    [-196, 21.2, 15],
    [-204.8, 30, 15.5],
    [-208, 42, 16],
    [-208, 62, 20], // 65: top bend
    [-201.6, 86, 21.3],
    [-184, 103.6, 22.7],
    [-160, 110, 24], // 68: grid
    [-140, 110, 24],
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
  ],
};

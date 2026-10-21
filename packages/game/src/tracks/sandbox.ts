import type { TrackDef } from '../track/types';

/**
 * Sandcastle Circuit: out on the lawn, through the sandpit and round the
 * castle. A plank ramp jumps the garden stream; a football rolls across the
 * back straight; sand drags at you in the pit unless you hold the racing line.
 * The flowerbed shortcut is pure sand: bring a boost.
 */
export const sandbox: TrackDef = {
  id: 'sandbox',
  width: 19,
  floorY: 0,
  ground: 'rough',
  shoulder: 4,
  defaultEdge: 'open',
  points: [
    [-40, 100],
    [40, 100],
    [100, 92],
    [146, 58],
    [158, 8],
    [140, -40],
    [96, -64],
    [50, -52],
    [20, -20],
    [-20, -12],
    [-50, -40],
    [-70, -86],
    [-112, -104],
    [-156, -82],
    [-170, -30],
    [-158, 30],
    [-118, 76],
    [-80, 98],
  ],
  edges: [
    { from: 3.4, to: 6.4, right: 'wall' },
    { from: 10.4, to: 14.6, right: 'wall', left: 'wall' },
  ],
  ramps: [{ u: 15.25, len: 8, h: 3, gap: 9, over: 'water', look: 'plank' }],
  pads: [
    { u: 1.6, off: 0.5 },
    { u: 9, off: -0.4 },
  ],
  boxes: [2.3, 7.5, 13],
  zones: [
    // The sandpit straddles the middle of the track; the stream crosses the left side.
    { x: 0, z: -30, rx: 62, rz: 36, surface: 'sand', look: 'sand', offRoad: true },
    { x: 60, z: 30, rx: 22, rz: 16, surface: 'water', look: 'pond' },
  ],
  shortcuts: [
    {
      points: [
        [92, -60],
        [80, -100],
        [20, -110],
        [-40, -104],
        [-78, -96],
      ],
      width: 10,
      surface: 'sand',
      edge: 'open',
      boxes: [2],
      aiChance: 0.7,
      needsBoost: true,
    },
  ],
  hazards: [{ kind: 'roller', r: 4.5, motion: { type: 'across', u: 12.3, period: 7 }, look: 'football' }],
  props: [
    { k: 'castle', x: -6, z: -54, s: 1.1 },
    { k: 'bucket', x: 40, z: 0, v: '#ff4d6d' },
    { k: 'bucket', x: -40, z: -62, v: '#3d9bff', r: 0.4 },
    { k: 'spade', x: 22, z: -6, r: 1.2, solid: false },
    { k: 'gnome', x: 60, z: 4 },
    { k: 'pot', x: -60, z: 50, v: '#ff70a6' },
    { k: 'pot', x: -20, z: 64, v: '#ffd23f' },
    { k: 'mushroom', x: 112, z: 20 },
    { k: 'mushroom', x: 120, z: 30, s: 0.7 },
    { k: 'stone', x: 82, z: 40 },
    { k: 'stone', x: 40, z: 46, s: 0.8 },
    { k: 'can', x: -110, z: 10, r: 0.5 },
    { k: 'hose', x: -100, z: 34, solid: false },
    // The flowerbed around the shortcut and the garden beyond.
    { k: 'flower', x: 50, z: -82, v: '#ff70a6', solid: false },
    { k: 'flower', x: 0, z: -80, v: '#ffd23f', solid: false },
    { k: 'flower', x: -30, z: -128, v: '#9b5de5', solid: false },
    { k: 'flower', x: 60, z: -132, v: '#ff8fab', solid: false },
    { k: 'flower', x: 120, z: -90, v: '#ff4d6d', solid: false },
    { k: 'gnome', x: 190, z: -20, s: 2 },
    { k: 'flower', x: 200, z: 60, v: '#ffd23f', s: 1.6, solid: false },
    { k: 'flower', x: -200, z: -110, v: '#ff70a6', s: 1.5, solid: false },
    { k: 'bucket', x: 180, z: 120, s: 1.6, v: '#ffd23f' },
    { k: 'stone', x: -190, z: 110, s: 2 },
  ],
};

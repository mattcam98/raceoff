/**
 * How a track is written down. A track is a closed loop of control points
 * (the racing road), optional shortcut paths that leave and rejoin it, and
 * everything placed around them. `build.ts` compiles it into the grid and
 * colliders the physics reads.
 *
 * Positions along the road are given in control-point units, `u`: 3.5 is
 * halfway between the fourth and fifth point. That keeps features attached to
 * the right corner while the shape is being tuned.
 */
import type { TrackId } from '@raceoff/shared';

/** x, z, then optionally the road width and height there. */
export type ControlPoint = [x: number, z: number, width?: number, y?: number];

export type EdgeKind = 'wall' | 'open';

/** What the ground is made of under a cell. */
export const SURF = {
  /** Nothing there: you fall. */
  void: 0,
  road: 1,
  /** Off-road: tablecloth, grass, carpet. Slow unless boosting. */
  rough: 2,
  /** Spilt milk, soap, oil: very little grip. */
  slick: 3,
  /** Syrup, mud: heavy drag. */
  sticky: 4,
  boost: 5,
  /** Deep water: you are fished out and put back. */
  water: 6,
  /** Sand: like rough but kinder. */
  sand: 7,
} as const;
export type Surface = (typeof SURF)[keyof typeof SURF];
export type SurfaceName = keyof typeof SURF;

export interface EdgeRange {
  /** From and to, in u. `to` may be less than `from` to wrap past the start. */
  from: number;
  to: number;
  left?: EdgeKind;
  right?: EdgeKind;
}

export interface RampDef {
  /** Where the ramp starts climbing, in u. */
  u: number;
  /** Length of the climb in world units. */
  len: number;
  /** Height at the lip. */
  h: number;
  /** A drop after the lip, in world units: fall short and you are out. */
  gap?: number;
  /** Which path: 0 is the main road, 1 and up are shortcuts. */
  path?: number;
  /** What the gap is over: a drop into nothing, or water you are fished out of. */
  over?: 'void' | 'water';
  /** How the renderer dresses it. */
  look?: string;
}

export interface PadDef {
  u: number;
  /** Lateral position, -1 (left edge) to 1 (right edge). */
  off: number;
  path?: number;
}

export interface ZoneDef {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Rotation in radians. */
  rot?: number;
  surface: SurfaceName;
  /** How the renderer dresses it: milk, syrup, oil, puddle... */
  look?: string;
  /** Paint only beside the road, never on it: a sandpit the road runs through. */
  offRoad?: boolean;
}

export interface ShortcutDef {
  /** Starts on the main road and ends on it; the ends are matched to the road automatically. */
  points: ControlPoint[];
  width: number;
  surface: 'road' | 'rough' | 'sand';
  edge: EdgeKind;
  /** Item rows on the shortcut, in its own u. */
  boxes?: number[];
  /** Computer racers take it this often (0-1), and only with a boost if it is rough. */
  aiChance: number;
  /** Rough shortcuts are only worth it with a boost: computers take them only holding one. */
  needsBoost?: boolean;
}

export interface PropDef {
  /** Kind of prop, looked up in the footprint table and by the renderer. */
  k: string;
  x: number;
  z: number;
  /** Rotation about y, radians. */
  r?: number;
  /** Uniform scale. */
  s?: number;
  /** Ground height to stand it on. */
  y?: number;
  /** Override: false makes a normally solid prop decoration only. */
  solid?: boolean;
  /** Free-form tint or variant for the renderer. */
  v?: string | number;
}

export type HazardMotion =
  | { type: 'pingpong'; ax: number; az: number; bx: number; bz: number; period: number }
  /**
   * Back and forth across the road at u, compiled into a pingpong. It sweeps
   * `span` of the road's width (default 0.6) from one wall, leaving a lane
   * open on the other side: `side` -1 starts from the left wall, 1 the right.
   */
  | { type: 'across'; u: number; period: number; path?: number; span?: number; side?: -1 | 1 }
  | { type: 'circle'; cx: number; cz: number; radius: number; period: number }
  | { type: 'loop'; points: [number, number][]; speed: number };

export interface HazardDef {
  /** roller (a rolling thing), train (cars on a loop), stomper (slams down), top (a spinning top). */
  kind: 'roller' | 'train' | 'stomper' | 'top';
  motion?: HazardMotion;
  /** Collision radius. */
  r: number;
  /** For stompers: where it slams, and its cycle. */
  x?: number;
  z?: number;
  period?: number;
  /** Seconds offset into the cycle. */
  phase?: number;
  /** Train cars. */
  cars?: number;
  look?: string;
}

export interface TrackDef {
  id: TrackId;
  points: ControlPoint[];
  /** Default road width. */
  width: number;
  /** Height of the floor the track sits on. */
  floorY: number;
  /** What lies beyond the road and shoulders. */
  ground: SurfaceName;
  /** The solid floor ends here (a table top, a desk): beyond it is a drop. */
  floor?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Rough band beside open road edges. */
  shoulder: number;
  defaultEdge: EdgeKind;
  edges?: EdgeRange[];
  ramps?: RampDef[];
  pads?: PadDef[];
  /** Item box rows, in u. */
  boxes: number[];
  zones?: ZoneDef[];
  shortcuts?: ShortcutDef[];
  props?: PropDef[];
  /** Extra solid walls: x1, z1, x2, z2, and optional thickness. */
  walls?: [number, number, number, number, number?][];
  hazards?: HazardDef[];
  /** Laps are timed from here; computer racers' speed in corners is scaled by this. */
  aiCornerGrip?: number;
}

/**
 * Compiles a track definition into what the race reads every step:
 *
 * - **Paths**: the main loop and each shortcut, resampled every metre with
 *   heading, width, height and edge kind, plus a racing line for the computers.
 * - **The grid**: half-metre cells holding surface, ground height and race
 *   progress. Progress is the distance along the main road, painted onto the
 *   ground itself, so a shortcut carries its own progress and a kart's place
 *   in the race is one lookup away.
 * - **Colliders**: walls along road edges, solid props and extra walls, kept
 *   in a spatial hash.
 */
import { catmull, clamp, headingOf, lerp, rightX, rightZ, segmentT } from '../math';
import { footprintOf } from './props';
import { SURF, type ControlPoint, type EdgeKind, type HazardDef, type Surface, type TrackDef } from './types';

/** Resampling distance along paths. */
export const DS = 1;
const CELL = 0.5;
/** How far beyond the shoulder the road still paints progress, so a kart that runs wide is not lost. */
const PROGRESS_MARGIN = 10;
/** Depth of empty space below the floor. */
export const VOID_DEPTH = 60;
const WALL_OFFSET = 0.9;
const WALL_RADIUS = 0.5;
const WALL_STEP = 2;
const HASH_CELL = 8;

export interface PathSample {
  x: number;
  z: number;
  y: number;
  /** Road width here. */
  w: number;
  /** Heading of travel. */
  h: number;
  /** Progress value: distance along the main road (shortcuts map onto it). */
  s: number;
  /** Distance along this path. */
  d: number;
  left: EdgeKind;
  right: EdgeKind;
  /** Signed curvature, positive when the road bends right. */
  k: number;
}

export interface TrackPath {
  index: number;
  samples: PathSample[];
  length: number;
  closed: boolean;
  /** For shortcuts: where on the main road they leave and rejoin. */
  sFrom: number;
  sTo: number;
  surface: Surface;
  /** Lateral offset of the racing line from the centre, per sample. */
  line: Float32Array;
  /** Curvature of the racing line ahead of each sample: the tightest bend a computer must plan for. */
  lineK: Float32Array;
}

export type Collider =
  | { t: 'seg'; ax: number; az: number; bx: number; bz: number; r: number }
  | { t: 'circle'; x: number; z: number; r: number }
  | { t: 'box'; x: number; z: number; hw: number; hd: number; c: number; s: number };

export interface WallLine {
  /** Points along the wall, with the ground height under each. */
  pts: { x: number; z: number; y: number }[];
  path: number;
  side: 'left' | 'right' | 'extra';
}

export interface RampInfo {
  path: number;
  s0: number;
  s1: number;
  /** Distance along that path of the start and end of the climb. */
  d0: number;
  d1: number;
  h: number;
  gap: number;
  over: 'void' | 'water';
  look: string;
}

export interface BoxSpot {
  x: number;
  z: number;
  y: number;
}

export interface PadSpot {
  x: number;
  z: number;
  y: number;
  h: number;
  /** Half extents along and across the road. */
  hl: number;
  hw: number;
}

export interface GridSpot {
  x: number;
  z: number;
  y: number;
  h: number;
  s: number;
}

export class Grid {
  readonly nx: number;
  readonly nz: number;
  readonly surf: Uint8Array;
  readonly y: Float32Array;
  /** Progress, NaN where there is none. */
  readonly s: Float32Array;
  readonly path: Int8Array;
  /** Signed lateral offset from the owning path's centre, positive to the right. */
  readonly lat: Float32Array;
  /** 1 where a cell lies behind a wall: no kart should ever be there. */
  readonly outside: Uint8Array;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    maxX: number,
    maxZ: number,
    readonly cell = CELL,
  ) {
    this.nx = Math.ceil((maxX - minX) / cell);
    this.nz = Math.ceil((maxZ - minZ) / cell);
    const n = this.nx * this.nz;
    this.surf = new Uint8Array(n);
    this.y = new Float32Array(n);
    this.s = new Float32Array(n).fill(NaN);
    this.path = new Int8Array(n).fill(-1);
    this.lat = new Float32Array(n);
    this.outside = new Uint8Array(n);
  }

  index(x: number, z: number): number {
    const ix = Math.floor((x - this.minX) / this.cell);
    const iz = Math.floor((z - this.minZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }

  surfaceAt(x: number, z: number): Surface {
    const i = this.index(x, z);
    return (i < 0 ? SURF.void : this.surf[i]) as Surface;
  }

  progressAt(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? NaN : this.s[i];
  }

  private yAtCell(ix: number, iz: number, outside: number) {
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return outside;
    return this.y[iz * this.nx + ix];
  }

  /** Ground height, bilinear between cell centres. */
  heightAt(x: number, z: number, outside: number): number {
    const fx = (x - this.minX) / this.cell - 0.5;
    const fz = (z - this.minZ) / this.cell - 0.5;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = this.yAtCell(ix, iz, outside);
    const b = this.yAtCell(ix + 1, iz, outside);
    const c = this.yAtCell(ix, iz + 1, outside);
    const d = this.yAtCell(ix + 1, iz + 1, outside);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }
}

export interface Track {
  def: TrackDef;
  /** Length of one lap. */
  length: number;
  paths: TrackPath[];
  grid: Grid;
  colliders: Collider[];
  walls: WallLine[];
  ramps: RampInfo[];
  boxes: BoxSpot[];
  pads: PadSpot[];
  /** Height of the void, below which a kart has fallen. */
  voidY: number;
  /** Moving hazards, with 'across' motions resolved to coordinates. */
  hazards: HazardDef[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Grid slot n, front of the grid first. */
  slot(n: number): GridSpot;
  /** A spot on the main road at progress s, `off` from -1 (left) to 1 (right). */
  pointAt(s: number, off?: number): GridSpot;
  /** The main-road sample nearest progress s. */
  sampleAt(s: number): PathSample;
  /** Colliders near a point. The array is reused: copy it to keep it. */
  query(x: number, z: number, r: number, out: Collider[]): Collider[];
  /** Is there a wall or prop on the straight line between two points? */
  blocked(x0: number, z0: number, x1: number, z1: number, pad?: number): boolean;
}

/** Distance from a point to a collider's surface (negative inside). */
export function colliderDistance(c: Collider, x: number, z: number): number {
  if (c.t === 'seg') {
    const dx = c.bx - c.ax;
    const dz = c.bz - c.az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? clamp(((x - c.ax) * dx + (z - c.az) * dz) / len2, 0, 1) : 0;
    return Math.hypot(x - (c.ax + dx * t), z - (c.az + dz * t)) - c.r;
  }
  if (c.t === 'circle') return Math.hypot(x - c.x, z - c.z) - c.r;
  const lx = (x - c.x) * c.c - (z - c.z) * c.s;
  const lz = (x - c.x) * c.s + (z - c.z) * c.c;
  const ox = Math.abs(lx) - c.hw;
  const oz = Math.abs(lz) - c.hd;
  return ox > 0 || oz > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) : Math.max(ox, oz);
}

// ---------------------------------------------------------------- sampling

interface FineSample {
  x: number;
  z: number;
  y: number;
  w: number;
  u: number;
  d: number;
}

function fineSamples(points: ControlPoint[], closed: boolean, defWidth: number, floorY: number): FineSample[] {
  const n = points.length;
  const get = (i: number) => {
    const j = closed ? ((i % n) + n) % n : clamp(i, 0, n - 1);
    const p = points[j];
    return { x: p[0], z: p[1], w: p[2] ?? defWidth, y: p[3] ?? floorY };
  };
  const out: FineSample[] = [];
  const segs = closed ? n : n - 1;
  const STEPS = 48;
  let d = 0;
  let px = NaN;
  let pz = NaN;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let k = 0; k < STEPS; k++) {
      const t = k / STEPS;
      const x = catmull(p0.x, p1.x, p2.x, p3.x, t);
      const z = catmull(p0.z, p1.z, p2.z, p3.z, t);
      // Width and height ease between control points rather than overshooting.
      const e = t * t * (3 - 2 * t);
      if (!Number.isNaN(px)) d += Math.hypot(x - px, z - pz);
      out.push({ x, z, y: lerp(p1.y, p2.y, e), w: lerp(p1.w, p2.w, e), u: i + t, d });
      px = x;
      pz = z;
    }
  }
  const last = closed ? get(0) : get(n - 1);
  d += Math.hypot(last.x - px, last.z - pz);
  out.push({ x: last.x, z: last.z, y: last.y, w: last.w, u: segs, d });
  return out;
}

function fineIndex(fine: FineSample[], key: 'u' | 'd', v: number) {
  let lo = 0;
  let hi = fine.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fine[mid][key] <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Arc length at control-point position u. */
function dAtU(fine: FineSample[], u: number): number {
  u = clamp(u, 0, fine[fine.length - 1].u);
  const i = fineIndex(fine, 'u', u);
  const a = fine[i];
  const b = fine[i + 1];
  return lerp(a.d, b.d, b.u > a.u ? (u - a.u) / (b.u - a.u) : 0);
}

/** Control-point position at arc length d. */
function uAtD(fine: FineSample[], d: number): number {
  const i = fineIndex(fine, 'd', d);
  const a = fine[i];
  const b = fine[i + 1];
  return lerp(a.u, b.u, b.d > a.d ? (d - a.d) / (b.d - a.d) : 0);
}

type RawSample = Omit<PathSample, 's' | 'left' | 'right'>;

function resample(fine: FineSample[], closed: boolean): RawSample[] {
  const length = fine[fine.length - 1].d;
  const count = closed ? Math.round(length / DS) : Math.round(length / DS) + 1;
  const step = closed ? length / count : length / (count - 1);
  const out: RawSample[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const d = i * step;
    while (j < fine.length - 2 && fine[j + 1].d < d) j++;
    const a = fine[j];
    const b = fine[j + 1];
    const t = b.d > a.d ? clamp((d - a.d) / (b.d - a.d), 0, 1) : 0;
    out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: 0, d, k: 0 });
  }
  const at = (i: number) => (closed ? out[(i + count) % count] : out[clamp(i, 0, count - 1)]);
  for (let i = 0; i < count; i++) {
    const a = at(i - 1);
    const b = at(i + 1);
    out[i].h = headingOf(b.x - a.x, b.z - a.z);
  }
  // Curvature from the heading change over a few metres, smooth enough to plan on.
  const SPAN = 3;
  for (let i = 0; i < count; i++) {
    let dh = at(i + SPAN).h - at(i - SPAN).h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    // Turning right lowers the heading, so right bends come out positive.
    out[i].k = -dh / (2 * SPAN * step);
  }
  return out;
}

/** Is u within [from, to)? A range with to < from wraps past the start line. */
function inRange(u: number, from: number, to: number) {
  return from <= to ? u >= from && u < to : u >= from || u < to;
}

/** The sample at distance d along a path. */
function sampleAtD(p: TrackPath, d: number): PathSample {
  const S = p.samples;
  const step = p.length / (p.closed ? S.length : S.length - 1);
  const i = Math.round(d / step);
  return p.closed ? S[((i % S.length) + S.length) % S.length] : S[clamp(i, 0, S.length - 1)];
}

// ---------------------------------------------------------------- racing line

/**
 * A smooth line through the corners: the centreline relaxed toward its
 * neighbours many times over, held inside the road. It approximates the line of
 * least curvature, which is the fastest line for a kart that cannot brake late.
 */
function racingLine(samples: PathSample[], closed: boolean, margin: number): Float32Array {
  const n = samples.length;
  const off = new Float32Array(n);
  const px = new Float64Array(n);
  const pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = samples[i].x;
    pz[i] = samples[i].z;
  }
  const STRIDE = 4;
  for (let iter = 0; iter < 160; iter++) {
    for (let i = 0; i < n; i++) {
      if (!closed && (i < STRIDE || i >= n - STRIDE)) continue;
      const a = closed ? (i - STRIDE + n) % n : i - STRIDE;
      const b = closed ? (i + STRIDE) % n : i + STRIDE;
      const mx = (px[a] + px[b]) / 2;
      const mz = (pz[a] + pz[b]) / 2;
      const s = samples[i];
      const rx = rightX(s.h);
      const rz = rightZ(s.h);
      // Project the midpoint onto this sample's cross-section and keep it inside the road.
      const lim = Math.max(0, s.w / 2 - margin);
      const o = clamp((mx - s.x) * rx + (mz - s.z) * rz, -lim, lim);
      off[i] = lerp(off[i], o, 0.5);
      px[i] = s.x + rx * off[i];
      pz[i] = s.z + rz * off[i];
    }
  }
  return off;
}

/** Curvature along the racing line, taken as the tightest bend in the next stretch so a computer slows before a corner, not in it. */
function lineCurvature(samples: PathSample[], line: Float32Array, closed: boolean): Float32Array {
  const n = samples.length;
  const curv = new Float32Array(n);
  const SPAN = 4;
  const at = (i: number) => (closed ? (i + n) % n : clamp(i, 0, n - 1));
  const lx = (i: number) => samples[at(i)].x + rightX(samples[at(i)].h) * line[at(i)];
  const lz = (i: number) => samples[at(i)].z + rightZ(samples[at(i)].h) * line[at(i)];
  for (let i = 0; i < n; i++) {
    const ax = lx(i - SPAN), az = lz(i - SPAN);
    const bx = lx(i), bz = lz(i);
    const cx = lx(i + SPAN), cz = lz(i + SPAN);
    // Curvature of the circle through three points.
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const ab = Math.hypot(bx - ax, bz - az);
    const bc = Math.hypot(cx - bx, cz - bz);
    const ca = Math.hypot(ax - cx, az - cz);
    curv[i] = ab * bc * ca > 1e-6 ? Math.abs(2 * area) / (ab * bc * ca) : 0;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let j = 0; j < 14; j++) k = Math.max(k, curv[at(i + j)] * (1 - j / 28));
    out[i] = k;
  }
  return out;
}

// ---------------------------------------------------------------- build

export function buildTrack(def: TrackDef): Track {
  const paths: TrackPath[] = [];

  // The main loop.
  const mainFine = fineSamples(def.points, true, def.width, def.floorY);
  const length = mainFine[mainFine.length - 1].d;
  const edgeAt = (u: number, side: 'left' | 'right'): EdgeKind => {
    let kind = def.defaultEdge;
    for (const e of def.edges ?? []) if (inRange(u, e.from, e.to) && e[side]) kind = e[side]!;
    return kind;
  };
  const mainSamples: PathSample[] = resample(mainFine, true).map((p) => {
    const u = uAtD(mainFine, p.d);
    return { ...p, s: p.d, left: edgeAt(u, 'left'), right: edgeAt(u, 'right') };
  });
  paths.push({
    index: 0, samples: mainSamples, length, closed: true, sFrom: 0, sTo: length,
    surface: SURF.road, line: new Float32Array(), lineK: new Float32Array(),
  });

  const nearestMainS = (x: number, z: number) => {
    let best = Infinity;
    let s = 0;
    for (const m of mainSamples) {
      const d = (m.x - x) ** 2 + (m.z - z) ** 2;
      if (d < best) {
        best = d;
        s = m.s;
      }
    }
    return s;
  };

  // Shortcuts: their progress runs evenly from where they leave the road to where they rejoin it.
  const shortcutFine = (def.shortcuts ?? []).map((sc) => fineSamples(sc.points, false, sc.width, def.floorY));
  const fineOf = (pi: number) => (pi === 0 ? mainFine : shortcutFine[pi - 1]);
  for (const [i, sc] of (def.shortcuts ?? []).entries()) {
    const fine = shortcutFine[i];
    const len = fine[fine.length - 1].d;
    const first = sc.points[0];
    const last = sc.points[sc.points.length - 1];
    const sFrom = nearestMainS(first[0], first[1]);
    let sTo = nearestMainS(last[0], last[1]);
    if (sTo < sFrom) sTo += length;
    const samples: PathSample[] = resample(fine, false).map((p) => {
      let s = lerp(sFrom, sTo, p.d / len);
      if (s >= length) s -= length;
      return { ...p, s, left: sc.edge, right: sc.edge };
    });
    const surface = sc.surface === 'road' ? SURF.road : sc.surface === 'sand' ? SURF.sand : SURF.rough;
    paths.push({ index: i + 1, samples, length: len, closed: false, sFrom, sTo, surface, line: new Float32Array(), lineK: new Float32Array() });
  }

  for (const p of paths) {
    p.line = racingLine(p.samples, p.closed, 3.2);
    p.lineK = lineCurvature(p.samples, p.line, p.closed);
  }

  // Bounds: every sample with its road and margin, and the floor.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const grow = (x: number, z: number, r: number) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r);
    maxZ = Math.max(maxZ, z + r);
  };
  for (const p of paths) for (const s of p.samples) grow(s.x, s.z, s.w / 2 + def.shoulder + PROGRESS_MARGIN + 4);
  if (def.floor) {
    grow(def.floor.minX, def.floor.minZ, 2);
    grow(def.floor.maxX, def.floor.maxZ, 2);
  }
  const grid = new Grid(Math.floor(minX), Math.floor(minZ), Math.ceil(maxX), Math.ceil(maxZ));
  const voidY = def.floorY - VOID_DEPTH;
  const n = grid.nx * grid.nz;

  // Ground first: the floor everywhere it exists, the void beyond it.
  const groundSurf = SURF[def.ground];
  for (let iz = 0; iz < grid.nz; iz++) {
    for (let ix = 0; ix < grid.nx; ix++) {
      const i = iz * grid.nx + ix;
      const x = grid.minX + (ix + 0.5) * CELL;
      const z = grid.minZ + (iz + 0.5) * CELL;
      const f = def.floor;
      const onFloor = !f || (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ);
      grid.surf[i] = onFloor ? groundSurf : SURF.void;
      grid.y[i] = onFloor ? def.floorY : voidY;
    }
  }

  // Roads. Each cell keeps the best claim on it: road beats shoulder beats margin, then the nearest wins.
  const rank = new Int8Array(n).fill(-1);
  const dist = new Float32Array(n).fill(Infinity);
  for (const p of paths) {
    const S = p.samples;
    const segs = p.closed ? S.length : S.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = S[i];
      const b = S[(i + 1) % S.length];
      const reach = Math.max(a.w, b.w) / 2 + def.shoulder + PROGRESS_MARGIN + DS;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const ix0 = Math.max(0, Math.floor((mx - reach - grid.minX) / CELL));
      const ix1 = Math.min(grid.nx - 1, Math.floor((mx + reach - grid.minX) / CELL));
      const iz0 = Math.max(0, Math.floor((mz - reach - grid.minZ) / CELL));
      const iz1 = Math.min(grid.nz - 1, Math.floor((mz + reach - grid.minZ) / CELL));
      let sb = b.s;
      if (sb < a.s - length / 2) sb += length;
      for (let iz = iz0; iz <= iz1; iz++) {
        const z = grid.minZ + (iz + 0.5) * CELL;
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = grid.minX + (ix + 0.5) * CELL;
          const t = segmentT(x, z, a.x, a.z, b.x, b.z);
          const cx = lerp(a.x, b.x, t);
          const cz = lerp(a.z, b.z, t);
          const d = Math.hypot(x - cx, z - cz);
          const hw = lerp(a.w, b.w, t) / 2;
          const r = d <= hw ? 2 : d <= hw + def.shoulder ? 1 : d <= hw + def.shoulder + PROGRESS_MARGIN ? 0 : -1;
          if (r < 0) continue;
          const c = iz * grid.nx + ix;
          if (r < rank[c] || (r === rank[c] && d >= dist[c])) continue;
          rank[c] = r;
          dist[c] = d;
          let s = lerp(a.s, sb, t);
          if (s >= length) s -= length;
          grid.s[c] = s;
          grid.path[c] = p.index;
          const lat = (x - cx) * rightX(a.h) + (z - cz) * rightZ(a.h);
          grid.lat[c] = lat;
          const side = lat >= 0 ? (t < 0.5 ? a.right : b.right) : t < 0.5 ? a.left : b.left;
          grid.outside[c] = side === 'wall' && d > hw + WALL_OFFSET + 0.6 ? 1 : 0;
          if (r === 0) continue;
          // A shoulder exists only where the edge is open; behind a wall the ground keeps its own surface.
          if (r === 2) grid.surf[c] = p.surface;
          else if (side === 'open' || grid.surf[c] === SURF.void) grid.surf[c] = p.surface === SURF.road ? SURF.rough : p.surface;
          grid.y[c] = lerp(a.y, b.y, t);
        }
      }
    }
  }

  // Ramps: a climb, a lip, and sometimes a gap. Cells are found by their progress, so a ramp follows the road's bends.
  /** Progress units per metre of path: 1 on the main road, stretched or squeezed on a shortcut. */
  const sPerD = (p: TrackPath) => (p.index === 0 ? 1 : (p.sTo - p.sFrom) / p.length);
  const wrapS = (s: number) => ((s % length) + length) % length;
  const ramps: RampInfo[] = [];
  for (const r of def.ramps ?? []) {
    const pi = r.path ?? 0;
    const p = paths[pi];
    const d0 = dAtU(fineOf(pi), r.u);
    const d1 = d0 + r.len;
    const sOf = (d: number) => wrapS(pi === 0 ? d : p.sFrom + d * sPerD(p));
    ramps.push({ path: pi, s0: sOf(d0), s1: sOf(d1), d0, d1, h: r.h, gap: r.gap ?? 0, over: r.over ?? 'void', look: r.look ?? 'ramp' });
  }
  for (const r of ramps) {
    const k = sPerD(paths[r.path]);
    const climb = (r.d1 - r.d0) * k;
    const gap = r.gap * k;
    for (let c = 0; c < n; c++) {
      if (grid.path[c] !== r.path || rank[c] < 1) continue;
      let x = grid.s[c] - r.s0;
      if (x < -length / 2) x += length;
      if (x > length / 2) x -= length;
      if (x >= 0 && x <= climb) {
        grid.y[c] += r.h * (x / climb);
        if (rank[c] === 1 && grid.surf[c] !== SURF.void) grid.surf[c] = SURF.road;
      } else if (gap > 0 && x > climb && x <= climb + gap) {
        grid.surf[c] = r.over === 'water' ? SURF.water : SURF.void;
        grid.y[c] = r.over === 'water' ? def.floorY - 2 : voidY;
      }
    }
  }

  // Zones: puddles, patches and pools painted over everything.
  for (const zd of def.zones ?? []) {
    const surf = SURF[zd.surface];
    const cr = Math.cos(zd.rot ?? 0);
    const sr = Math.sin(zd.rot ?? 0);
    const reach = Math.max(zd.rx, zd.rz);
    const ix0 = Math.max(0, Math.floor((zd.x - reach - grid.minX) / CELL));
    const ix1 = Math.min(grid.nx - 1, Math.floor((zd.x + reach - grid.minX) / CELL));
    const iz0 = Math.max(0, Math.floor((zd.z - reach - grid.minZ) / CELL));
    const iz1 = Math.min(grid.nz - 1, Math.floor((zd.z + reach - grid.minZ) / CELL));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = grid.minX + (ix + 0.5) * CELL - zd.x;
        const z = grid.minZ + (iz + 0.5) * CELL - zd.z;
        const lx = x * cr - z * sr;
        const lz = x * sr + z * cr;
        if ((lx / zd.rx) ** 2 + (lz / zd.rz) ** 2 > 1) continue;
        const c = iz * grid.nx + ix;
        if (zd.offRoad && rank[c] === 2) continue;
        grid.surf[c] = surf;
        if (surf === SURF.water) grid.y[c] = def.floorY - 2;
        if (surf === SURF.void) grid.y[c] = voidY;
      }
    }
  }

  // Boost pads.
  const pads: PadSpot[] = [];
  for (const pd of def.pads ?? []) {
    const pi = pd.path ?? 0;
    const smp = sampleAtD(paths[pi], dAtU(fineOf(pi), pd.u));
    const off = pd.off * (smp.w / 2 - 2.6);
    const px = smp.x + rightX(smp.h) * off;
    const pz = smp.z + rightZ(smp.h) * off;
    const pad: PadSpot = { x: px, z: pz, y: grid.heightAt(px, pz, def.floorY), h: smp.h, hl: 2.6, hw: 2.4 };
    pads.push(pad);
    const reach = 4;
    const c0 = Math.cos(pad.h);
    const s0 = Math.sin(pad.h);
    for (let iz = Math.floor((pad.z - reach - grid.minZ) / CELL); iz <= Math.floor((pad.z + reach - grid.minZ) / CELL); iz++) {
      for (let ix = Math.floor((pad.x - reach - grid.minX) / CELL); ix <= Math.floor((pad.x + reach - grid.minX) / CELL); ix++) {
        if (ix < 0 || iz < 0 || ix >= grid.nx || iz >= grid.nz) continue;
        const x = grid.minX + (ix + 0.5) * CELL - pad.x;
        const z = grid.minZ + (iz + 0.5) * CELL - pad.z;
        const along = x * s0 + z * c0;
        const across = x * -c0 + z * s0;
        if (Math.abs(along) <= pad.hl && Math.abs(across) <= pad.hw) grid.surf[iz * grid.nx + ix] = SURF.boost;
      }
    }
  }

  // Walls along road edges, broken wherever another stretch of road runs into them.
  const walls: WallLine[] = [];
  const colliders: Collider[] = [];
  const blockedBy = (x: number, z: number, self: TrackPath, selfIndex: number) => {
    for (const p of paths) {
      for (let j = 0; j < p.samples.length; j++) {
        const q = p.samples[j];
        if (p === self) {
          // A path's own nearby samples are where the wall belongs; only far-off stretches can block it.
          let gap = Math.abs(j - selfIndex);
          if (p.closed) gap = Math.min(gap, p.samples.length - gap);
          if (gap < 40) continue;
        }
        const lim = q.w / 2 + 0.3;
        const dx = q.x - x;
        const dz = q.z - z;
        if (dx * dx + dz * dz < lim * lim) return true;
      }
    }
    return false;
  };
  for (const p of paths) {
    const S = p.samples;
    const idxs: number[] = [];
    for (let i = 0; i < S.length; i += WALL_STEP) idxs.push(i);
    if (p.closed) idxs.push(0);
    else if (idxs[idxs.length - 1] !== S.length - 1) idxs.push(S.length - 1);
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'right' ? 1 : -1;
      let line: WallLine | null = null;
      for (const idx of idxs) {
        const smp = S[idx];
        const off = sign * (smp.w / 2 + WALL_OFFSET);
        const x = smp.x + rightX(smp.h) * off;
        const z = smp.z + rightZ(smp.h) * off;
        if (smp[side] !== 'wall' || blockedBy(x, z, p, idx)) {
          line = null;
          continue;
        }
        // Stand the wall on the road just inside it, so it rises with a ramp.
        const ci = grid.index(x - rightX(smp.h) * sign * 1.2, z - rightZ(smp.h) * sign * 1.2);
        const y = ci >= 0 ? Math.max(grid.y[ci], smp.y) : smp.y;
        if (!line) {
          line = { pts: [], path: p.index, side };
          walls.push(line);
        }
        line.pts.push({ x, z, y });
      }
    }
  }
  for (const w of walls) {
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const a = w.pts[i];
      const b = w.pts[i + 1];
      colliders.push({ t: 'seg', ax: a.x, az: a.z, bx: b.x, bz: b.z, r: WALL_RADIUS });
    }
  }
  for (const [x1, z1, x2, z2, th] of def.walls ?? []) {
    colliders.push({ t: 'seg', ax: x1, az: z1, bx: x2, bz: z2, r: th ?? 1 });
    walls.push({ pts: [{ x: x1, z: z1, y: def.floorY }, { x: x2, z: z2, y: def.floorY }], path: -1, side: 'extra' });
  }
  for (const prop of def.props ?? []) {
    if (prop.solid === false) continue;
    const fp = footprintOf(prop.k);
    if (!fp) continue;
    const sc = prop.s ?? 1;
    if ('c' in fp) colliders.push({ t: 'circle', x: prop.x, z: prop.z, r: fp.c * sc });
    else colliders.push({ t: 'box', x: prop.x, z: prop.z, hw: fp.b[0] * sc, hd: fp.b[1] * sc, c: Math.cos(prop.r ?? 0), s: Math.sin(prop.r ?? 0) });
  }

  // Spatial hash over colliders.
  const hx = Math.ceil((grid.nx * CELL) / HASH_CELL) + 1;
  const hz = Math.ceil((grid.nz * CELL) / HASH_CELL) + 1;
  const buckets: number[][] = Array.from({ length: hx * hz }, () => []);
  const addTo = (c: number, x0: number, z0: number, x1: number, z1: number) => {
    const a = Math.max(0, Math.floor((x0 - grid.minX) / HASH_CELL));
    const b = Math.min(hx - 1, Math.floor((x1 - grid.minX) / HASH_CELL));
    const e = Math.max(0, Math.floor((z0 - grid.minZ) / HASH_CELL));
    const f = Math.min(hz - 1, Math.floor((z1 - grid.minZ) / HASH_CELL));
    for (let j = e; j <= f; j++) for (let i = a; i <= b; i++) buckets[j * hx + i].push(c);
  };
  colliders.forEach((c, i) => {
    if (c.t === 'seg') addTo(i, Math.min(c.ax, c.bx) - c.r, Math.min(c.az, c.bz) - c.r, Math.max(c.ax, c.bx) + c.r, Math.max(c.az, c.bz) + c.r);
    else if (c.t === 'circle') addTo(i, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r);
    else {
      const r = Math.hypot(c.hw, c.hd);
      addTo(i, c.x - r, c.z - r, c.x + r, c.z + r);
    }
  });
  const seen = new Uint32Array(colliders.length);
  let stamp = 0;
  const query = (x: number, z: number, r: number, out: Collider[]) => {
    out.length = 0;
    stamp++;
    const a = Math.max(0, Math.floor((x - r - grid.minX) / HASH_CELL));
    const b = Math.min(hx - 1, Math.floor((x + r - grid.minX) / HASH_CELL));
    const e = Math.max(0, Math.floor((z - r - grid.minZ) / HASH_CELL));
    const f = Math.min(hz - 1, Math.floor((z + r - grid.minZ) / HASH_CELL));
    for (let j = e; j <= f; j++) {
      for (let i = a; i <= b; i++) {
        for (const c of buckets[j * hx + i]) {
          if (seen[c] === stamp) continue;
          seen[c] = stamp;
          out.push(colliders[c]);
        }
      }
    }
    return out;
  };

  const sight: Collider[] = [];
  const blocked = (x0: number, z0: number, x1: number, z1: number, pad = 0.6) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      for (const c of query(x, z, pad + 1, sight)) if (colliderDistance(c, x, z) < pad) return true;
    }
    return false;
  };

  // Item boxes: rows across the road.
  const boxes: BoxSpot[] = [];
  const addRow = (p: TrackPath, d: number) => {
    const smp = sampleAtD(p, d);
    const count = smp.w >= 15 ? 4 : smp.w >= 10 ? 3 : 2;
    for (let k = 0; k < count; k++) {
      const off = ((k + 0.5) / count - 0.5) * (smp.w - 4);
      const x = smp.x + rightX(smp.h) * off;
      const z = smp.z + rightZ(smp.h) * off;
      boxes.push({ x, z, y: grid.heightAt(x, z, smp.y) });
    }
  };
  for (const u of def.boxes) addRow(paths[0], dAtU(mainFine, u));
  for (const [i, sc] of (def.shortcuts ?? []).entries()) for (const u of sc.boxes ?? []) addRow(paths[i + 1], dAtU(shortcutFine[i], u));

  // Hazards that roll across the road go from wall to wall at their spot.
  const hazards: HazardDef[] = (def.hazards ?? []).map((h) => {
    const m = h.motion;
    if (m?.type !== 'across') return h;
    const pi = m.path ?? 0;
    const smp = sampleAtD(paths[pi], dAtU(fineOf(pi), m.u));
    const reach = smp.w / 2 + WALL_OFFSET - WALL_RADIUS - h.r - 0.3;
    const side = m.side ?? -1;
    const a = side * reach;
    const b = a - side * (smp.w + 2 * WALL_OFFSET) * (m.span ?? 0.6);
    return {
      ...h,
      motion: {
        type: 'pingpong', period: m.period,
        ax: smp.x + rightX(smp.h) * a, az: smp.z + rightZ(smp.h) * a,
        bx: smp.x + rightX(smp.h) * b, bz: smp.z + rightZ(smp.h) * b,
      },
    };
  });

  const step = length / mainSamples.length;
  const sampleAt = (s: number) => mainSamples[Math.round(wrapS(s) / step) % mainSamples.length];
  const pointAt = (s: number, off = 0): GridSpot => {
    s = wrapS(s);
    const i = Math.floor(s / step);
    const a = mainSamples[i % mainSamples.length];
    const b = mainSamples[(i + 1) % mainSamples.length];
    const t = clamp((s - i * step) / step, 0, 1);
    const w = lerp(a.w, b.w, t);
    const lat = off * (w / 2 - 2);
    const x = lerp(a.x, b.x, t) + rightX(a.h) * lat;
    const z = lerp(a.z, b.z, t) + rightZ(a.h) * lat;
    return { x, z, y: grid.heightAt(x, z, voidY), h: a.h, s };
  };

  const slot = (k: number): GridSpot => {
    const row = Math.floor(k / 2);
    const side = k % 2 === 0 ? -1 : 1;
    return pointAt(-5 - row * 5.5 - (side > 0 ? 2.75 : 0), side * 0.42);
  };

  return {
    def, length, paths, grid, colliders, walls, ramps, boxes, pads, voidY, hazards,
    bounds: { minX: grid.minX, maxX: grid.minX + grid.nx * CELL, minZ: grid.minZ, maxZ: grid.minZ + grid.nz * CELL },
    slot, pointAt, sampleAt, query, blocked,
  };
}

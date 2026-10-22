/**
 * Track thumbnails for the lobby: the road's outline as an SVG path, drawn
 * straight from the track's control points (a smooth loop through them), so
 * it follows any change to a layout without a picture to keep up to date.
 * Same orientation as the in-race minimap: x to the right, z down.
 */
import { TRACK_DEFS } from '@raceoff/game';

const W = 100;
const H = 64;
const PAD = 7;
const cache = new Map<string, string>();

/** The loop as an SVG path in a 100 × 64 box. */
export function trackOutline(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = TRACK_DEFS[id as keyof typeof TRACK_DEFS];
  if (!def) return '';
  const pts = def.points.map(([x, z]) => [x, z]);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const s = Math.min((W - PAD * 2) / (Math.max(...xs) - minX), (H - PAD * 2) / (Math.max(...zs) - minZ));
  const ox = (W - (Math.max(...xs) - minX) * s) / 2;
  const oy = (H - (Math.max(...zs) - minZ) * s) / 2;
  const P = pts.map(([x, z]) => [(x - minX) * s + ox, (z - minZ) * s + oy]);
  const n = P.length;
  const at = (i: number) => P[((i % n) + n) % n];
  const f = (v: number) => v.toFixed(1);
  // Catmull-Rom through every point, as cubic Béziers.
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  d += 'Z';
  cache.set(id, d);
  return d;
}

/** Where the start line is in the thumbnail: the first control point. */
export function trackStart(id: string): [number, number] | null {
  const d = trackOutline(id);
  const m = /^M([\d.]+) ([\d.]+)/.exec(d);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

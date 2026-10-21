/** Small numeric helpers shared by the simulation. The world is x/z on the ground with y up. */

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Angle wrapped into (-PI, PI]. */
export function wrapAngle(a: number) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/** Move `v` toward `target` by at most `step`. */
export function approach(v: number, target: number, step: number) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** Exponential smoothing that behaves the same at any frame rate: `rate` is per second. */
export const damp = (v: number, target: number, rate: number, dt: number) => lerp(v, target, 1 - Math.exp(-rate * dt));

/** Forward vector for a heading. Heading 0 faces +z; turning right lowers it. */
export const fwdX = (h: number) => Math.sin(h);
export const fwdZ = (h: number) => Math.cos(h);
/** Right-hand vector for a heading. */
export const rightX = (h: number) => -Math.cos(h);
export const rightZ = (h: number) => Math.sin(h);

export const headingOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** A small fast seeded generator (mulberry32), so a race can be replayed in tests. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;

/** Closest point on segment AB to P, as the parameter t in [0, 1]. */
export function segmentT(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return 0;
  return clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
}

/** Centripetal-free uniform Catmull-Rom on a closed or open list of points. */
export function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

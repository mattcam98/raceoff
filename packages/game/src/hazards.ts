/**
 * Moving obstacles. Each one's position is a pure function of race time, so
 * the renderer and the physics always agree and nothing needs saving.
 */
import { clamp, headingOf, lerp, TAU } from './math';
import type { HazardDef } from './track/types';

export interface HazardBody {
  x: number;
  z: number;
  r: number;
  h: number;
  /** Can it hurt right now? A raised stomper cannot. */
  live: boolean;
}

export interface HazardState {
  def: HazardDef;
  bodies: HazardBody[];
  /** 0-1 position in a stomper's cycle; how far it has rolled, for a roller. */
  phase: number;
  /** Stompers: 0 up, 1 slammed down. */
  drop: number;
  /** Stompers about to come down shake first. */
  warning: boolean;
}

interface LoopPath {
  pts: [number, number][];
  cum: number[];
  length: number;
}
const loops = new WeakMap<HazardDef, LoopPath>();

function loopOf(def: HazardDef): LoopPath {
  let l = loops.get(def);
  if (l) return l;
  const pts = def.motion?.type === 'loop' ? def.motion.points : [];
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  l = { pts, cum, length: cum[cum.length - 1] };
  loops.set(def, l);
  return l;
}

function onLoop(l: LoopPath, d: number): { x: number; z: number; h: number } {
  d = ((d % l.length) + l.length) % l.length;
  let i = 0;
  while (i < l.pts.length - 1 && l.cum[i + 1] < d) i++;
  const a = l.pts[i];
  const b = l.pts[(i + 1) % l.pts.length];
  const t = (d - l.cum[i]) / (l.cum[i + 1] - l.cum[i] || 1);
  return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), h: headingOf(b[0] - a[0], b[1] - a[1]) };
}

export const TRAIN_CAR_GAP = 7.5;

export function hazardAt(def: HazardDef, t: number, out?: HazardState): HazardState {
  const st: HazardState = out ?? { def, bodies: [], phase: 0, drop: 0, warning: false };
  const m = def.motion;
  if (def.kind === 'stomper') {
    const period = def.period ?? 4;
    const f = ((((t + (def.phase ?? 0)) % period) + period) % period) / period;
    st.phase = f;
    // Up, a shiver of warning, a slam, a pause on the ground, then back up.
    st.warning = f > 0.5 && f < 0.72;
    st.drop = f < 0.72 ? 0 : f < 0.78 ? (f - 0.72) / 0.06 : f < 0.9 ? 1 : 1 - (f - 0.9) / 0.1;
    st.bodies = [{ x: def.x ?? 0, z: def.z ?? 0, r: def.r, h: 0, live: st.drop > 0.8 }];
    return st;
  }
  if (m?.type === 'pingpong') {
    const f = (((t + (def.phase ?? 0)) / m.period) % 1 + 1) % 1;
    // Out and back, easing at each end like something rolling up a slope and back down.
    const tri = f < 0.5 ? f * 2 : 2 - f * 2;
    const e = tri * tri * (3 - 2 * tri);
    const x = lerp(m.ax, m.bx, e);
    const z = lerp(m.az, m.bz, e);
    st.phase = e * Math.hypot(m.bx - m.ax, m.bz - m.az);
    st.bodies = [{ x, z, r: def.r, h: headingOf(m.bx - m.ax, m.bz - m.az), live: true }];
    return st;
  }
  if (m?.type === 'circle') {
    const a = ((t + (def.phase ?? 0)) / m.period) * TAU;
    st.phase = a;
    st.bodies = [{ x: m.cx + Math.cos(a) * m.radius, z: m.cz + Math.sin(a) * m.radius, r: def.r, h: a, live: true }];
    return st;
  }
  if (m?.type === 'loop') {
    const l = loopOf(def);
    const head = (t + (def.phase ?? 0)) * m.speed;
    const cars = clamp(def.cars ?? 1, 1, 8);
    st.phase = head;
    st.bodies = [];
    for (let i = 0; i < cars; i++) {
      const p = onLoop(l, head - i * TRAIN_CAR_GAP);
      st.bodies.push({ x: p.x, z: p.z, r: def.r, h: p.h, live: true });
    }
    return st;
  }
  st.bodies = [];
  return st;
}

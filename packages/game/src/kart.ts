/**
 * One kart and the arcade physics that drive it.
 *
 * The model is deliberately simple and forgiving: a circle on a height field
 * with a forward speed and a sideways slip that grip pulls back toward zero.
 * Turning rotates the heading; with full grip the velocity follows it, and in
 * a drift grip is let go so the kart slides while the nose points inside the
 * corner. Everything is tuned for feel rather than realism.
 */
import { combinedStats, type ItemId } from '@raceoff/shared';
import { approach, clamp, damp, fwdX, fwdZ, headingOf, lerp, rightX, rightZ, wrapAngle } from './math';
import type { Collider, Track } from './track/build';
import { SURF, type Surface } from './track/types';

export const STEP = 1 / 60;
export const GRAVITY = 34;
export const KART_RADIUS = 1.3;

export interface KartInput {
  /** -1 full left to 1 full right. */
  steer: number;
  gas: boolean;
  brake: boolean;
  drift: boolean;
  /** Aim items backwards. */
  back: boolean;
  /** An item press happened since the last step. */
  item: boolean;
}

export const NO_INPUT: KartInput = { steer: 0, gas: false, brake: false, drift: false, back: false, item: false };

export type StunKind = 'spin' | 'tumble' | 'squash';

export interface KartParams {
  maxSpeed: number;
  /** Rate (per second) at which speed closes on its target. */
  accel: number;
  turn: number;
  grip: number;
  mass: number;
  /** Fraction of top speed kept off-road. */
  rough: number;
}

export function kartParams(character: string, body: string, ccScale: number): KartParams {
  const st = combinedStats(character, body);
  return {
    maxSpeed: (26.5 + st.speed * 1.5) * ccScale,
    accel: 0.95 + st.accel * 0.22,
    turn: 1.75 + st.handling * 0.13,
    grip: 9 + st.handling * 0.9,
    mass: 0.8 + st.weight * 0.22,
    rough: 0.48 + st.weight * 0.025,
  };
}

/** Drift charge needed for each spark colour. */
export const DRIFT_LEVELS = [0.7, 1.45, 2.35];
const DRIFT_BOOST = [0.55, 1.0, 1.5];

export class Kart {
  // identity
  readonly params: KartParams;
  name: string;
  /** Human player slot 0-3, or -1 for a computer. */
  slot: number;

  // motion
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  h = 0;
  /** Previous step, for the renderer to interpolate. */
  px = 0;
  py = 0;
  pz = 0;
  ph = 0;
  grounded = true;
  airTime = 0;
  /** Took off from a ramp: a trick is possible. */
  launched = false;
  trick = 0;
  trickDone = false;
  surface: Surface = SURF.road;
  groundY = 0;
  /** Ground slope under the kart (for the renderer's tilt). */
  pitch = 0;
  roll = 0;

  // control
  steer = 0;
  input: KartInput = NO_INPUT;
  lastDrift = false;
  /** -1 left, 1 right, 0 not drifting. */
  driftDir = 0;
  driftCharge = 0;
  hopping = false;
  /** A drift was asked for in this hop but no direction yet. */
  driftWanted = false;
  /** Seconds of boost left, and its strength. */
  boost = 0;
  boostMul = 1;
  /** Speed multiplier from computer rubber-banding or difficulty. */
  speedMul = 1;

  // states
  stun: StunKind | null = null;
  stunT = 0;
  stunDur = 0;
  invuln = 0;
  shield = 0;
  star = 0;
  rocket = 0;
  /** Seconds left being lifted back onto the track. */
  respawnT = 0;
  respawnFrom = { x: 0, y: 0, z: 0 };
  /** Seconds off course, before being put back. */
  lostT = 0;
  wrongWayT = 0;

  // items
  item: ItemId | null = null;
  itemCount = 0;
  rollT = 0;
  /** Seconds the current item has been held, for the computers. */
  heldT = 0;

  // race
  /** Last accepted progress along the lap. */
  s = 0;
  /** Progress unwrapped across laps: lap n starts at (n - 1) * length. */
  dist = 0;
  /** Highest lap index reached, so crossing the line backwards and forwards counts once. */
  lapIndex = -1;
  lapStartT = 0;
  bestLap: number | null = null;
  lapTimes: number[] = [];
  finished = false;
  finishTime: number | null = null;
  place = 1;
  /** Whether the last bump was hard enough to make a sound. */
  bumpT = 0;

  /** Wheel rotation and other cosmetic state the renderer reads. */
  wheel = 0;
  spinAngle = 0;
  /** Last surface where it was safe to put the kart back down. */
  safeS = 0;

  constructor(
    readonly index: number,
    readonly id: string,
    readonly character: string,
    readonly body: string,
    readonly cpu: boolean,
    ccScale: number,
  ) {
    this.params = kartParams(character, body, ccScale);
    this.name = id;
    this.slot = -1;
  }

  get speed() {
    return this.vx * fwdX(this.h) + this.vz * fwdZ(this.h);
  }

  get planarSpeed() {
    return Math.hypot(this.vx, this.vz);
  }

  get stunned() {
    return (this.stun !== null && this.stun !== 'squash') || this.respawnT > 0;
  }

  get driftLevel() {
    if (!this.driftDir) return 0;
    return this.driftCharge >= DRIFT_LEVELS[2] ? 3 : this.driftCharge >= DRIFT_LEVELS[1] ? 2 : this.driftCharge >= DRIFT_LEVELS[0] ? 1 : 0;
  }

  place3(x: number, y: number, z: number, h: number) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.z = this.pz = z;
    this.h = this.ph = h;
    this.vx = this.vz = this.vy = 0;
    this.groundY = y;
    this.grounded = true;
  }

  giveBoost(seconds: number, mul: number) {
    this.boost = Math.max(this.boost, seconds);
    this.boostMul = Math.max(this.boostMul, mul);
  }

  stopDrift() {
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftWanted = false;
  }

  /** Knock the kart out of control. Returns false if it was protected. */
  stunWith(kind: StunKind) {
    this.stopDrift();
    this.boost = 0;
    this.stun = kind;
    this.stunT = 0;
    this.stunDur = kind === 'spin' ? 1.15 : kind === 'tumble' ? 1.5 : 1.8;
    if (kind === 'tumble') {
      this.vy = 13;
      this.grounded = false;
      this.vx *= 0.35;
      this.vz *= 0.35;
    }
    if (kind === 'squash') {
      this.vx *= 0.3;
      this.vz *= 0.3;
    }
  }
}

// ---------------------------------------------------------------- stepping

const scratch: Collider[] = [];

export interface StepEvents {
  wall: (k: Kart, strength: number) => void;
  boost: (k: Kart, kind: 'drift' | 'pad' | 'trick' | 'start', level: number) => void;
  land: (k: Kart, hard: boolean) => void;
  drift: (k: Kart, on: boolean) => void;
  fall: (k: Kart, water: boolean) => void;
}

/**
 * Advance one kart by one fixed step. Item effects, collisions with other
 * karts and race progress are the race's job; this is driving.
 */
export function stepKart(k: Kart, track: Track, dt: number, ev: StepEvents, autopilotHeading: number | null) {
  k.px = k.x;
  k.py = k.y;
  k.pz = k.z;
  k.ph = k.h;
  const p = k.params;
  const inp = k.input;

  if (k.respawnT > 0) return;

  // Timers.
  if (k.boost > 0) k.boost = Math.max(0, k.boost - dt);
  if (k.boost === 0) k.boostMul = 1;
  if (k.invuln > 0) k.invuln = Math.max(0, k.invuln - dt);
  if (k.shield > 0) k.shield = Math.max(0, k.shield - dt);
  if (k.star > 0) k.star = Math.max(0, k.star - dt);
  if (k.rocket > 0) k.rocket = Math.max(0, k.rocket - dt);
  if (k.bumpT > 0) k.bumpT = Math.max(0, k.bumpT - dt);
  if (k.stun) {
    k.stunT += dt;
    if (k.stunT >= k.stunDur) {
      k.stun = null;
      k.invuln = Math.max(k.invuln, 1.2);
    }
  }
  const controlled = !k.stun || k.stun === 'squash';

  // Surface under the kart.
  const surf = track.grid.surfaceAt(k.x, k.z);
  k.surface = surf;
  const protectedFromGround = k.boost > 0 || k.star > 0 || k.rocket > 0;

  // Steering input, smoothed so keyboards and phones feel the same.
  const wantSteer = controlled ? clamp(inp.steer, -1, 1) : 0;
  k.steer = approach(k.steer, wantSteer, dt * (Math.abs(wantSteer) > Math.abs(k.steer) ? 7 : 10));

  // ---- drift
  const driftPressed = inp.drift && !k.lastDrift;
  k.lastDrift = inp.drift;
  const fwdSpeed = k.speed;
  if (controlled && k.grounded && driftPressed && fwdSpeed > 9 && !k.driftDir && k.rocket === 0) {
    // A little hop; the direction is chosen by the steering during it.
    k.vy = 5.5;
    k.grounded = false;
    k.hopping = true;
    k.driftWanted = true;
  }
  if (!controlled || fwdSpeed < 6 || k.rocket > 0) {
    if (k.driftDir) ev.drift(k, false);
    k.stopDrift();
  }
  if (k.driftWanted && !inp.drift) k.driftWanted = false;
  if (k.driftWanted && Math.abs(k.steer) > 0.2) {
    k.driftDir = Math.sign(k.steer);
    k.driftCharge = 0;
    k.driftWanted = false;
    ev.drift(k, true);
  }
  if (k.driftDir && !inp.drift) {
    // Let go: cash in the sparks.
    const level = k.driftLevel;
    ev.drift(k, false);
    if (level > 0) {
      k.giveBoost(DRIFT_BOOST[level - 1], 1.28 + level * 0.03);
      ev.boost(k, 'drift', level);
    }
    k.stopDrift();
    // Straighten out: the slide hands its speed back to the nose.
    const sp = Math.max(0, k.speed);
    k.vx = lerp(k.vx, fwdX(k.h) * sp, 0.5);
    k.vz = lerp(k.vz, fwdZ(k.h) * sp, 0.5);
  }

  // ---- turning
  let turnInput = k.steer;
  if (k.driftDir) {
    // Always turning into the drift: steering tightens it or opens it out.
    turnInput = k.driftDir * lerp(0.3, 1.2, (k.steer * k.driftDir + 1) / 2);
    if (k.grounded) k.driftCharge += dt * (0.75 + 0.55 * Math.max(0, k.steer * k.driftDir));
  }
  const speedForTurn = Math.abs(fwdSpeed);
  // Turning needs speed, but a kart pressed against a wall can still nudge its nose round.
  const crawl = controlled && (inp.gas || inp.brake) ? 0.22 : 0;
  let turnRate = p.turn * Math.max(crawl, Math.min(1, speedForTurn / 7)) * (1 - 0.18 * clamp(speedForTurn / p.maxSpeed, 0, 1.4));
  if (k.driftDir) turnRate *= 1.12;
  if (!k.grounded) turnRate *= k.hopping ? 0.8 : 0.35;
  if (k.stun === 'squash') turnRate *= 0.7;
  const reversing = fwdSpeed < -0.5;
  if (autopilotHeading !== null) {
    k.h += clamp(wrapAngle(autopilotHeading - k.h), -3 * dt, 3 * dt);
  } else {
    k.h -= turnInput * turnRate * dt * (reversing ? -1 : 1);
  }
  k.h = wrapAngle(k.h);

  // Spinning out turns the body round and round without changing where it is going.
  if (k.stun === 'spin' || k.stun === 'tumble') k.spinAngle += dt * (Math.PI * 4 / k.stunDur) * 2;
  else k.spinAngle = damp(k.spinAngle % (Math.PI * 2), 0, 12, dt);

  // ---- engine
  const fx = fwdX(k.h);
  const fz = fwdZ(k.h);
  const rx = rightX(k.h);
  const rz = rightZ(k.h);
  let vf = k.vx * fx + k.vz * fz;
  let vr = k.vx * rx + k.vz * rz;

  let top = p.maxSpeed * k.speedMul;
  if (!protectedFromGround) {
    if (surf === SURF.rough) top *= p.rough;
    else if (surf === SURF.sand) top *= 0.72;
    else if (surf === SURF.sticky) top *= 0.5;
  }
  if (k.stun === 'squash') top *= 0.5;
  if (k.boost > 0) top = Math.max(top, p.maxSpeed * k.speedMul * k.boostMul);
  if (k.star > 0) top = Math.max(top, p.maxSpeed * 1.22);
  if (k.rocket > 0) top = p.maxSpeed * 1.75;

  const gas = autopilotHeading !== null || (controlled && inp.gas);
  const brake = autopilotHeading === null && controlled && inp.brake;
  if (k.grounded) {
    if (gas && !brake) {
      if (vf < top) {
        // Closes on top speed exponentially, with a floor so pulling away is brisk.
        const rate = k.boost > 0 || k.rocket > 0 ? 4 : p.accel;
        vf = Math.min(top, vf + Math.max((top - vf) * rate, 9) * dt);
      } else {
        // Going faster than allowed (after a boost, onto grass): bleed it off quickly but not instantly.
        vf = approach(vf, top, dt * (surf === SURF.rough || surf === SURF.sticky ? 55 : 18));
      }
    } else if (brake) {
      if (vf > 0.5) vf = approach(vf, 0, dt * 42);
      else vf = approach(vf, -p.maxSpeed * 0.35, dt * 14);
    } else {
      vf = approach(vf, 0, dt * (6 + Math.abs(vf) * 0.15));
      if (vf > top) vf = approach(vf, top, dt * 30);
    }
    if (!controlled && k.stun) vf = damp(vf, 0, k.stun === 'spin' ? 2.2 : 1.2, dt);
    if (surf === SURF.sticky && !protectedFromGround) vf = damp(vf, Math.min(vf, top), 3, dt);

    // Slope: climbing costs speed, descending gives it.
    const ahead = track.grid.heightAt(k.x + fx * 1.5, k.z + fz * 1.5, k.y);
    const behind = track.grid.heightAt(k.x - fx * 1.5, k.z - fz * 1.5, k.y);
    const slope = clamp((ahead - behind) / 3, -1, 1);
    vf -= slope * GRAVITY * 0.35 * dt;

    // Grip: how fast sideways slip is killed.
    let grip = p.grip;
    if (k.driftDir) grip = 2.2;
    if (surf === SURF.slick && !protectedFromGround) grip = Math.min(grip, 1.1);
    if (surf === SURF.sand && !k.driftDir) grip *= 0.7;
    if (!controlled) grip = 1.5;
    vr = damp(vr, 0, grip, dt);
    if (k.driftDir) {
      // A drift slides outward a little, then holds.
      vr = damp(vr, -k.driftDir * Math.abs(vf) * 0.18, 4, dt);
    }
  } else {
    // In the air: no engine, no grip. A little drag so jumps do not carry forever.
    vf *= 1 - 0.05 * dt;
  }
  k.vx = fx * vf + rx * vr;
  k.vz = fz * vf + rz * vr;

  // ---- move
  const nx = k.x + k.vx * dt;
  const nz = k.z + k.vz * dt;
  const ground = track.grid.heightAt(nx, nz, track.voidY);
  // A ledge too tall to drive up is a wall.
  if (k.grounded && ground > k.y + 1.1) {
    const back = 0.35;
    k.vx *= -back;
    k.vz *= -back;
    ev.wall(k, Math.abs(vf));
    k.stopDrift();
  } else {
    k.x = nx;
    k.z = nz;
  }

  // ---- vertical
  const g = track.grid.heightAt(k.x, k.z, track.voidY);
  k.groundY = g;
  if (k.grounded) {
    const vyNext = (g - k.y) / dt;
    const yFree = k.y + k.vy * dt - GRAVITY * dt * dt;
    // Stay on the ground only while gravity could hold us to it. At a ramp's lip the kart is still rising
    // and the ground drops away: that is a launch. Small crests are forgiven, so karts do not skip over them.
    if (g < yFree - 0.15) {
      // The ground fell away faster than gravity: we are airborne (a ramp lip, a ledge, a gap).
      k.grounded = false;
      k.launched = k.vy > 3.5;
      k.trick = 0;
      k.trickDone = false;
      k.airTime = 0;
      k.y = yFree;
    } else {
      k.vy = clamp(vyNext, -40, 40);
      k.y = g;
    }
  } else {
    k.airTime += dt;
    k.vy -= GRAVITY * dt;
    k.y += k.vy * dt;
    // A trick: press drift in the air after a launch, get a boost on landing.
    if (k.launched && driftPressed && !k.trickDone && k.airTime < 0.6 && controlled) {
      k.trick = 1;
      k.trickDone = true;
    }
    if (k.y <= g) {
      const hard = k.vy < -14;
      k.y = g;
      k.vy = 0;
      k.grounded = true;
      if (k.hopping) {
        k.hopping = false;
      } else {
        ev.land(k, hard);
        if (k.trick && controlled) {
          k.giveBoost(0.7, 1.3);
          ev.boost(k, 'trick', 1);
        }
      }
      k.trick = 0;
      k.launched = false;
    }
  }

  // Tilt to the ground's slope, for looks.
  if (k.grounded) {
    const ahead = track.grid.heightAt(k.x + fx * 1.2, k.z + fz * 1.2, k.y);
    const behind = track.grid.heightAt(k.x - fx * 1.2, k.z - fz * 1.2, k.y);
    const right = track.grid.heightAt(k.x + rx * 1, k.z + rz * 1, k.y);
    const left = track.grid.heightAt(k.x - rx * 1, k.z - rz * 1, k.y);
    k.pitch = damp(k.pitch, Math.atan2(ahead - behind, 2.4), 14, dt);
    k.roll = damp(k.roll, Math.atan2(right - left, 2), 14, dt);
  } else {
    k.pitch = damp(k.pitch, clamp(-k.vy * 0.02, -0.35, 0.35), 3, dt);
    k.roll = damp(k.roll, 0, 3, dt);
  }

  // ---- walls and props
  collideStatic(k, track, ev);

  // ---- falling out of the world
  const under = track.grid.surfaceAt(k.x, k.z);
  if (under === SURF.water && k.y <= g + 0.05) {
    ev.fall(k, true);
  } else if (k.y < track.def.floorY - 8) {
    ev.fall(k, false);
  } else if (under === SURF.boost && k.grounded && k.boost < 0.9) {
    k.giveBoost(1.1, 1.42);
    ev.boost(k, 'pad', 1);
  }

  k.wheel += vf * dt * 0.9;
}

/** Push the kart out of walls and props, bouncing off and losing a little speed. */
export function collideStatic(k: Kart, track: Track, ev: StepEvents) {
  const R = KART_RADIUS;
  for (let pass = 0; pass < 2; pass++) {
    const list = track.query(k.x, k.z, R + 1, scratch);
    for (const c of list) {
      let cx: number, cz: number, r: number;
      if (c.t === 'seg') {
        const dx = c.bx - c.ax;
        const dz = c.bz - c.az;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? clamp(((k.x - c.ax) * dx + (k.z - c.az) * dz) / len2, 0, 1) : 0;
        cx = c.ax + dx * t;
        cz = c.az + dz * t;
        r = c.r;
      } else if (c.t === 'circle') {
        cx = c.x;
        cz = c.z;
        r = c.r;
        const ddx = k.x - cx;
        const ddz = k.z - cz;
        const d = Math.hypot(ddx, ddz);
        if (d >= r + R) continue;
        // Nearest point on the circle's edge.
        const nd = d || 1;
        cx += (ddx / nd) * r;
        cz += (ddz / nd) * r;
        r = 0;
      } else {
        // Box: closest point in its local frame.
        const lx = (k.x - c.x) * c.c - (k.z - c.z) * c.s;
        const lz = (k.x - c.x) * c.s + (k.z - c.z) * c.c;
        const qx = clamp(lx, -c.hw, c.hw);
        const qz = clamp(lz, -c.hd, c.hd);
        if (qx === lx && qz === lz) {
          // Inside the box: push out through the nearest face.
          const ex = c.hw - Math.abs(lx);
          const ez = c.hd - Math.abs(lz);
          const ox = ex < ez ? Math.sign(lx || 1) * c.hw : lx;
          const oz = ex < ez ? lz : Math.sign(lz || 1) * c.hd;
          cx = c.x + ox * c.c + oz * c.s;
          cz = c.z - ox * c.s + oz * c.c;
          // Treat as deep penetration from that face.
          const nxw = ex < ez ? Math.sign(lx || 1) * c.c : Math.sign(lz || 1) * c.s;
          const nzw = ex < ez ? -Math.sign(lx || 1) * c.s : Math.sign(lz || 1) * c.c;
          k.x = cx + nxw * (R + 0.05);
          k.z = cz + nzw * (R + 0.05);
          bounce(k, nxw, nzw, ev);
          continue;
        }
        cx = c.x + qx * c.c + qz * c.s;
        cz = c.z - qx * c.s + qz * c.c;
        r = 0;
      }
      const dx = k.x - cx;
      const dz = k.z - cz;
      const d = Math.hypot(dx, dz);
      const min = R + r;
      if (d >= min || d < 1e-6) continue;
      const nx = dx / d;
      const nz = dz / d;
      k.x = cx + nx * min;
      k.z = cz + nz * min;
      bounce(k, nx, nz, ev);
    }
  }
}

function bounce(k: Kart, nx: number, nz: number, ev: StepEvents) {
  const vn = k.vx * nx + k.vz * nz;
  if (vn >= 0) return;
  const strength = -vn;
  // Bounce off the normal, scrub a little along the wall.
  const e = 0.35;
  k.vx -= (1 + e) * vn * nx;
  k.vz -= (1 + e) * vn * nz;
  const keep = strength > 10 ? 0.8 : 0.96;
  k.vx *= keep;
  k.vz *= keep;
  // A glancing hit turns the nose along the wall instead of sticking to it.
  const along = headingOf(k.vx, k.vz);
  if (k.planarSpeed > 4 && !k.stun) {
    const diff = wrapAngle(along - k.h);
    if (Math.abs(diff) < Math.PI / 2) k.h = wrapAngle(k.h + diff * 0.35);
  }
  if (strength > 8 && k.driftDir) k.stopDrift();
  if (strength > 4 && k.bumpT === 0) {
    k.bumpT = 0.25;
    ev.wall(k, strength);
  }
}

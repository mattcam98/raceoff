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
  /** Steering is all or nothing (keys, arrow buttons): ease it in, so a tap is not a jerk. */
  digital?: boolean;
  /** Assist: a held hard turn at speed drifts on its own, up to orange sparks. */
  autoDrift?: boolean;
  /** Assist: the race nudges the steering back when the kart is about to leave the road. Caps drifts at orange. */
  smart?: boolean;
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
  /** How fast drift sparks charge, 1 for an average kart. */
  charge: number;
}

export function kartParams(character: string, body: string, ccScale: number): KartParams {
  const st = combinedStats(character, body);
  return {
    // Top speed spreads only a little with the stat: at 1.5 a point it was the one stat that counted, the fastest
    // kart lapping 13% quicker than the nimblest whatever the handling, accel or driving. Now about 4%.
    maxSpeed: (31 + (st.speed - 3) * 0.6) * ccScale,
    accel: 0.95 + st.accel * 0.22,
    turn: 1.75 + st.handling * 0.13,
    grip: 9 + st.handling * 0.9,
    mass: 0.8 + st.weight * 0.22,
    rough: 0.48 + st.weight * 0.025,
    // Nimble karts charge their sparks quicker, so handling pays wherever there is a drift to be had.
    charge: 1 + (st.handling - 3) * 0.06,
  };
}

/** Drift charge needed for each spark colour. */
export const DRIFT_LEVELS = [0.75, 1.6, 2.7];
/**
 * Charge gained per second. Like Mario Kart it is a switch, not a slider: any real lean into the bend charges
 * at full rate, so a thumb or a tilted phone need not hold exact full lock, and the line can be widened a
 * little without losing charge. Steering out of the drift charges slowest.
 */
const DRIFT_CHARGE = { into: 1.3, hands: 0.75, out: 0.5 };
/** How far into the bend the steering must lean to charge at full rate. */
const DRIFT_CHARGE_LEAN = 0.3;
/** Boost seconds for blue, orange and purple sparks: purple is long, so holding out for it is a real gamble. */
const DRIFT_BOOST = [0.5, 1.1, 1.9];
/**
 * How hard a drift turns, as a share of full steering lock: steering fully out of it, hands off, and fully into
 * it. At 100cc top speed that is an arc of about 85 m, 43 m and 12 m across, which covers the bends the tracks
 * have (most are 35 to 120 m); hands off used to sit level with full lock (17 m), so most bends could not be
 * drifted at all without diving into the inside wall. As in Mario Kart, steering in still turns tighter than the
 * tyres can grip.
 */
export const DRIFT_TURN = { wide: 0.2, hands: 0.4, tight: 1.4 };
/**
 * The drift's arc for `inward` (0 steering out, 0.5 hands off, 1 steering in). Leaning in tightens gently at
 * first, so the light lean that charges sparks at full rate still holds a medium bend; only a hard lean gives a
 * hairpin.
 */
export function driftArc(inward: number) {
  if (inward <= 0.5) return lerp(DRIFT_TURN.wide, DRIFT_TURN.hands, inward * 2);
  const u = (inward - 0.5) * 2;
  return lerp(DRIFT_TURN.hands, DRIFT_TURN.tight, u * u);
}
/** The turn rate drifts are built on. Handling mostly changes ordinary steering; every kart drifts much alike. */
const DRIFT_BASE_TURN = 2.14;
const DRIFT_BASE_SHARE = 0.6;
/** How far the body swings into a drift, in radians: steering out of it, and steering into it. For looks only. */
const DRIFT_POSE = { wide: 0.36, tight: 0.62 };
/**
 * How much of its turn a kart keeps at full speed: ordinary steering softens a lot as speed builds, as in most
 * arcade racers. At top speed a typical bend needs only a quarter to a half of full lock; with the old, sharper
 * steering nearly all real driving happened in the first third of the thumb's travel, and with the phone's lag
 * on top it weaved. Drifts keep their bite, so a drift turns well past full lock: that is what it is for.
 */
export const STEER_FALLOFF = { grip: 0.38, drift: 0.18 };
export const turnFalloff = (speedShare: number, drifting: boolean) =>
  1 - (drifting ? STEER_FALLOFF.drift : STEER_FALLOFF.grip) * clamp(speedShare, 0, 1.4);
/** Share of a boost's extra speed that arrives the moment it fires (drifts, pads, tricks, items). */
export const BOOST_KICK = 0.45;
/** Automatic drift: how long a hard turn must be held, how hard, and the speed it needs (share of top). */
const AUTO_DRIFT = { hold: 0.2, steer: 0.7, speed: 0.5, keep: 0.2 };
/**
 * How quickly the drift's arc follows the steering, per second: changes of line are smooth, never a jerk, but
 * quick enough (wide to tight in a quarter of a second) that correcting a drift answers the thumb.
 */
const DRIFT_TURN_EASE = 5;
/** Rising faster than this (m/s) as the ground drops away is a launch: a trick is possible. */
const LAUNCH_VY = 3.5;
/** How long before the lip a DRIFT press still counts as a trick: about the phone's delay plus a few frames. */
const TRICK_EARLY = 0.15;
/** Sideways grip in a drift, and how much of the speed it lets slide outward. */
const DRIFT_GRIP = 13;
const DRIFT_SLIDE = 0.07;

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
  /** Seconds a DRIFT press made on a ramp's climb still counts as a trick, if the kart launches meanwhile. */
  trickT = 0;
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
  /** The drift's current turn, as a share of full lock: eases toward what the steering asks for. */
  driftTurn = 0;
  /**
   * How far the body is swung into the corner, in radians (signed like driftDir). For looks only: the kart
   * travels where it points, so a drift is predictable, and the body swings in and back out smoothly.
   */
  driftYaw = 0;
  hopping = false;
  /** A drift was asked for in this hop but no direction yet. */
  driftWanted = false;
  /** DRIFT was pressed when no hop could start (in the air, too slow): it hops as soon as it can, while held. */
  driftArmed = false;
  /** The drift was started by the automatic-drift assist: it ends when the turn eases, and stops at orange. */
  autoDrifting = false;
  /** Seconds a hard turn has been held, toward an automatic drift. */
  autoDriftT = 0;
  /** Seconds tucked in behind another kart, toward a slipstream boost. */
  draftT = 0;
  /** Seconds left showing that smart steering is helping. */
  assistT = 0;
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
  /** Seconds before another kart can bump this one again; meanwhile they only push like solid bodies. */
  bumpCool = 0;

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

  /**
   * Boost for `seconds` at `mul` times top speed. `kick` is the share of the extra speed handed over at once,
   * so letting go of a drift or hitting a pad is a shove you feel, not a slow swell; the rest builds up.
   */
  giveBoost(seconds: number, mul: number, kick = 0) {
    this.boost = Math.max(this.boost, seconds);
    this.boostMul = Math.max(this.boostMul, mul);
    if (kick > 0) {
      const fx = fwdX(this.h);
      const fz = fwdZ(this.h);
      const vf = this.vx * fx + this.vz * fz;
      const target = this.params.maxSpeed * this.speedMul * mul;
      if (vf > 1 && vf < target) {
        const dv = (target - vf) * kick;
        this.vx += fx * dv;
        this.vz += fz * dv;
      }
    }
  }

  stopDrift() {
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftWanted = false;
    this.autoDrifting = false;
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
  /** `lost`: a drift with sparks ended without cashing them in (knocked, hit, slowed right down). */
  drift: (k: Kart, on: boolean, lost?: boolean) => void;
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
  if (k.bumpCool > 0) k.bumpCool = Math.max(0, k.bumpCool - dt);
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

  if (k.assistT > 0) k.assistT = Math.max(0, k.assistT - dt);

  // Steering input. All-or-nothing keys are eased in so a tap is not a jerk; a thumb slide or a tilt is already
  // smooth, so it only gets a couple of frames to round off the phone's 30-a-second updates. The computers were
  // tuned with the gentle ramp and keep it.
  const wantSteer = controlled ? clamp(inp.steer, -1, 1) : 0;
  const easy = inp.digital || k.cpu;
  const outward = Math.abs(wantSteer) > Math.abs(k.steer);
  k.steer = approach(k.steer, wantSteer, dt * (easy ? (outward ? 7 : 10) : outward ? 16 : 22));

  // ---- drift
  const driftPressed = inp.drift && !k.lastDrift;
  k.lastDrift = inp.drift;
  // A press that cannot hop yet (in the air off a crest or a jump, still slow after a knock) is kept while the
  // button is held, so it hops on landing or once up to speed instead of silently doing nothing.
  if (driftPressed && !k.driftDir) k.driftArmed = true;
  if (!inp.drift) k.driftArmed = false;
  const fwdSpeed = k.speed;
  // On a ramp's climb (the ground rising as fast as a launch) a press does not hop: a hop there flattens the jump
  // to a hop's height and loses the trick. It is kept as a trick if the kart takes off soon, as a press a moment
  // before the lip is meant to be, and still hops into a drift on landing if held.
  if (k.trickT > 0) k.trickT = Math.max(0, k.trickT - dt);
  const climbing = k.grounded && k.vy > LAUNCH_VY;
  if (driftPressed && climbing) k.trickT = TRICK_EARLY;
  if (controlled && k.grounded && k.driftArmed && fwdSpeed > 9 && !k.driftDir && k.rocket === 0 && !climbing) {
    k.driftArmed = false;
    // A little hop; the direction is chosen by the steering during it.
    k.vy = 5.5;
    k.grounded = false;
    k.hopping = true;
    k.driftWanted = true;
  }
  if (!controlled || fwdSpeed < 6 || k.rocket > 0) {
    if (k.driftDir) ev.drift(k, false, k.driftLevel > 0);
    k.stopDrift();
  }
  if (k.driftWanted && !inp.drift) k.driftWanted = false;
  if (k.driftWanted && Math.abs(k.steer) > 0.2) {
    k.driftDir = Math.sign(k.steer);
    k.driftCharge = 0;
    k.driftWanted = false;
    // The drift turns as hard as the steering already was, then eases to its own arc: no snap on the way in.
    k.driftTurn = Math.abs(k.steer);
    ev.drift(k, true);
  }
  // Automatic drift: a hard turn held at speed slides on its own, no hop and no button.
  const autoReady = inp.autoDrift && controlled && k.grounded && !k.driftDir && !k.hopping && k.rocket === 0;
  if (autoReady && fwdSpeed > p.maxSpeed * AUTO_DRIFT.speed && Math.abs(k.steer) >= AUTO_DRIFT.steer) k.autoDriftT += dt;
  else k.autoDriftT = 0;
  if (k.autoDriftT >= AUTO_DRIFT.hold) {
    k.autoDriftT = 0;
    k.driftDir = Math.sign(k.steer);
    k.driftCharge = 0;
    k.driftTurn = Math.abs(k.steer);
    k.autoDrifting = true;
    ev.drift(k, true);
  }
  // Pressing DRIFT during an automatic drift takes it over: it is the player's now, sparks and all.
  if (k.autoDrifting && inp.drift) k.autoDrifting = false;
  const holdingDrift = inp.drift || (k.autoDrifting && k.steer * k.driftDir > AUTO_DRIFT.keep);
  if (k.driftDir && !holdingDrift) {
    // Let go: cash in the sparks. The kart already travels where it points, so it carries straight on.
    const level = k.driftLevel;
    ev.drift(k, false);
    if (level > 0) {
      k.giveBoost(DRIFT_BOOST[level - 1], 1.28 + level * 0.03, BOOST_KICK);
      ev.boost(k, 'drift', level);
    }
    k.stopDrift();
  }

  // ---- turning
  let turnInput = k.steer;
  // 0 steering out of the drift, 0.5 hands off, 1 steering into it.
  const inward = k.driftDir ? clamp((k.steer * k.driftDir + 1) / 2, 0, 1) : 0;
  if (k.driftDir) {
    // Always turning into the drift; the steering trims the arc between wide and tight.
    k.driftTurn = approach(k.driftTurn, driftArc(inward), dt * DRIFT_TURN_EASE);
    turnInput = k.driftDir * k.driftTurn;
    if (k.grounded) {
      const lean = k.steer * k.driftDir;
      const rate = lean >= DRIFT_CHARGE_LEAN ? DRIFT_CHARGE.into : lean <= -DRIFT_CHARGE_LEAN ? DRIFT_CHARGE.out : DRIFT_CHARGE.hands;
      // The assists stop at orange: purple sparks are for drifting by hand, as in Mario Kart.
      const cap = k.autoDrifting || inp.smart ? DRIFT_LEVELS[2] - 0.01 : Infinity;
      if (k.driftCharge < cap) k.driftCharge = Math.min(cap, k.driftCharge + dt * rate * p.charge);
    }
  }
  // The body swings into the corner as the drift builds (more when tightening) and back out after it. A drift
  // has to look like one: about 25 to 35 degrees off the line it travels, the classic kart-racer slide, or it
  // reads as ordinary steering.
  const yawTarget = k.driftDir && controlled ? k.driftDir * lerp(DRIFT_POSE.wide, DRIFT_POSE.tight, inward) : 0;
  k.driftYaw = damp(k.driftYaw, yawTarget, k.driftDir ? 6 : 8, dt);
  const speedForTurn = Math.abs(fwdSpeed);
  // Turning needs speed, but a kart pressed against a wall can still nudge its nose round.
  const crawl = controlled && (inp.gas || inp.brake) ? 0.22 : 0;
  const turnStat = k.driftDir ? lerp(p.turn, DRIFT_BASE_TURN, DRIFT_BASE_SHARE) : p.turn;
  let turnRate = turnStat * Math.max(crawl, Math.min(1, speedForTurn / 7)) * turnFalloff(speedForTurn / p.maxSpeed, k.driftDir !== 0);
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
    if (k.driftDir) grip = DRIFT_GRIP;
    if (surf === SURF.slick && !protectedFromGround) grip = Math.min(grip, 1.1);
    if (surf === SURF.sand && !k.driftDir) grip *= 0.7;
    if (!controlled) grip = 1.5;
    if (k.driftDir && controlled && vf > 0) {
      // A drift slides outward a touch and holds there. Its momentum is kept: whatever the tyres take out of
      // the sideways slide goes back into the nose, so a drift costs no speed.
      const slid = damp(vr, -k.driftDir * vf * DRIFT_SLIDE, grip, dt);
      vf = Math.sqrt(Math.max(0, vf * vf + vr * vr - slid * slid));
      vr = slid;
      // The engine drives the nose; the slide must not add to it, so a drift is never faster than top speed.
      const sp = Math.hypot(vf, vr);
      if (sp > top) {
        const keep = Math.max(top, sp - dt * 18) / sp;
        vf *= keep;
        vr *= keep;
      }
    } else {
      vr = damp(vr, 0, grip, dt);
    }
  } else {
    // In the air: no engine, no grip. A little drag so jumps do not carry forever.
    vf *= 1 - 0.05 * dt;
    if (k.hopping && controlled && vf > 0) {
      // A drift's hop is a bounce, not a jump: the kart keeps going where it points, at the same speed.
      const sp = Math.hypot(vf, vr);
      vr = damp(vr, 0, 10, dt);
      vf = Math.sqrt(Math.max(0, sp * sp - vr * vr));
    }
  }
  k.vx = fx * vf + rx * vr;
  k.vz = fz * vf + rz * vr;

  // ---- move
  const nx = k.x + k.vx * dt;
  const nz = k.z + k.vz * dt;
  // A ledge too tall to drive up is a wall, and is bounced off like one: a glancing scrape slides along its face
  // and keeps most of the speed; only driving straight at it stops the kart.
  const tooTall = (x: number, z: number) => track.grid.heightAt(x, z, track.voidY) > k.y + 1.1;
  // In the air too: coming down below the top of a step and crossing its edge is a hit on its face, not a lift up
  // it (a jump short of a gap's far bank used to be hoisted metres onto it). Steps under 1.1 m are still forgiven.
  if (tooTall(nx, nz)) {
    // The face's outward normal: downhill across the step.
    const e = 0.6;
    const gx = track.grid.heightAt(nx + e, nz, track.voidY) - track.grid.heightAt(nx - e, nz, track.voidY);
    const gz = track.grid.heightAt(nx, nz + e, track.voidY) - track.grid.heightAt(nx, nz - e, track.voidY);
    const g = Math.hypot(gx, gz);
    const sp = k.planarSpeed || 1;
    bounce(k, g > 1e-3 ? -gx / g : -k.vx / sp, g > 1e-3 ? -gz / g : -k.vz / sp, ev);
    // Carry on along the face if that way is clear.
    const sx = k.x + k.vx * dt;
    const sz = k.z + k.vz * dt;
    if (!tooTall(sx, sz)) {
      k.x = sx;
      k.z = sz;
    }
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
      k.launched = k.vy > LAUNCH_VY;
      // DRIFT pressed just before the lip: the trick is already in.
      k.trick = k.launched && k.trickT > 0 && controlled ? 1 : 0;
      k.trickDone = k.trick === 1;
      k.trickT = 0;
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
          k.giveBoost(0.7, 1.3, BOOST_KICK);
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
    k.giveBoost(1.1, 1.42, BOOST_KICK);
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
  // How square-on the hit was: 0 for a graze along the wall, 1 for straight into it.
  const headOn = clamp(strength / Math.max(1e-6, k.planarSpeed), 0, 1);
  // Bounce off the normal, and scrub speed along the wall in proportion to how square-on it was, so a graze
  // costs almost nothing and a head-on hit stops the kart. Nothing is taken for merely touching: a kart leaning
  // on a wall touches it every step, and a fixed toll per touch made sliding along one sticky.
  const e = 0.35;
  k.vx -= (1 + e) * vn * nx;
  k.vz -= (1 + e) * vn * nz;
  // Grinding along it with the steering pushed into it does cost, about a fifth of the speed at full lock.
  const into = clamp(-k.steer * (nx * rightX(k.h) + nz * rightZ(k.h)), 0, 1);
  const keep = 1 - 0.12 * headOn - 0.13 * headOn * headOn - 0.006 * into;
  k.vx *= keep;
  k.vz *= keep;
  // A glancing hit turns the nose along the wall instead of sticking to it.
  const along = headingOf(k.vx, k.vz);
  if (k.planarSpeed > 4 && !k.stun) {
    const diff = wrapAngle(along - k.h);
    if (Math.abs(diff) < Math.PI / 2) k.h = wrapAngle(k.h + diff * 0.35);
  }
  // A scrape keeps the drift going; only a real knock ends it.
  if (strength > 8 && headOn > 0.35 && k.driftDir) {
    ev.drift(k, false, k.driftLevel > 0);
    k.stopDrift();
  }
  if (strength > 4 && k.bumpT === 0) {
    k.bumpT = 0.25;
    ev.wall(k, strength);
  }
}

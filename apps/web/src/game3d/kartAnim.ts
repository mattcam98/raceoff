/**
 * Poses a kart rig from its Kart every frame: suspension on springs, wheels,
 * steering, and a driver with some life in them. Visual only: reads the Kart,
 * never writes to it.
 */
import * as THREE from 'three';
import { clamp, damp, wrapAngle, type Kart } from '@raceoff/game';
import type { KartRig } from './kartModel';

export interface KartAnim {
  init: boolean;
  lastSpeed: number;
  lastH: number;
  /** Smoothed forward acceleration and turn rate. */
  accel: number;
  yawRate: number;
  /** Chassis on its springs: heave, pitch and roll, with their velocities. */
  heave: number;
  heaveV: number;
  pitch: number;
  pitchV: number;
  roll: number;
  rollV: number;
  /** Last frame's state, to catch the moment something happens. */
  grounded: boolean;
  hopping: boolean;
  stunned: boolean;
  drifting: boolean;
  boost: number;
  /** Fastest fall since leaving the ground. */
  fallVy: number;
  /** Shake after a hit, fading from 1. */
  wobble: number;
  /** Delight after a drift boost, fading from 1. */
  happy: number;
  /** The driver's own bounce in the seat, a spring. */
  hop: number;
  hopV: number;
  lean: number;
  leanBack: number;
  look: number;
  cheer: number;
  finishT: number;
  blinkT: number;
}

export const newKartAnim = (): KartAnim => ({
  init: false, lastSpeed: 0, lastH: 0, accel: 0, yawRate: 0,
  heave: 0, heaveV: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0,
  grounded: true, hopping: false, stunned: false, drifting: false, boost: 0, fallVy: 0,
  wobble: 0, happy: 0, hop: 0, hopV: 0, lean: 0, leanBack: 0, look: 0, cheer: 0, finishT: 0,
  blinkT: 1 + Math.random() * 4,
});

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();

export function animateKart(rig: KartRig, k: Kart, p: THREE.Vector3, h: number, time: number, dt: number) {
  const a = rig.anim;
  rig.root.position.copy(p);
  rig.root.rotation.y = h;
  rig.tilt.rotation.x = -k.pitch;
  rig.tilt.rotation.z = -k.roll;
  const sp = clamp(Math.abs(k.speed) / k.params.maxSpeed, 0, 1.3);
  const stunned = k.stun === 'spin' || k.stun === 'tumble';
  const boosting = k.boost > 0 || k.rocket > 0;
  // A long frame (a hitch, a hidden tab) must not throw the springs.
  const step = Math.min(dt, 1 / 20);
  if (!a.init) {
    a.init = true;
    a.lastSpeed = k.speed;
    a.lastH = h;
    a.grounded = k.grounded;
  }

  // Body: drift angle, spins, flips and squash.
  let yaw = -k.driftYaw;
  let flip = 0;
  if (k.stun === 'spin') yaw += k.spinAngle;
  if (k.stun === 'tumble') flip = k.spinAngle * 0.5;
  rig.body.rotation.set(flip, yaw, 0);
  if (k.stun === 'squash') rig.body.scale.set(1.35, 0.35, 1.35);
  else rig.body.scale.set(1, 1, 1);

  if (step > 0) {
    a.accel = damp(a.accel, clamp((k.speed - a.lastSpeed) / step, -80, 80), 8, step);
    a.yawRate = damp(a.yawRate, clamp(wrapAngle(h - a.lastH) / step, -6, 6), 8, step);
    // Landing compresses the springs, harder from higher.
    if (!k.grounded) a.fallVy = Math.min(a.fallVy, k.vy);
    if (k.grounded && !a.grounded) {
      a.heaveV -= clamp(-a.fallVy * 0.1, 0.9, 3.5);
      a.hopV -= clamp(-a.fallVy * 0.08, 0.6, 2.5);
      a.fallVy = 0;
    }
    // The drift hop pushes off.
    if (k.hopping && !a.hopping) a.heaveV -= 1.4;
    if (stunned && !a.stunned) {
      a.wobble = 1;
      a.heaveV += 2;
    }
    // A drift that ends in a boost: a happy bounce.
    if (a.drifting && !k.driftDir && k.boost > a.boost + 0.05) {
      a.happy = 1;
      a.hopV += 3.2;
    }
    a.grounded = k.grounded;
    a.hopping = k.hopping;
    a.stunned = stunned;
    a.drifting = k.driftDir !== 0;
    a.boost = k.boost;
    a.lastSpeed = k.speed;
    a.lastH = h;

    // Squat on the throttle, dive on the brakes, roll out of the turn.
    const braking = k.input.brake && k.speed > 3;
    const pitchT = clamp(-a.accel * 0.005, -0.09, 0.09) + (braking ? 0.05 : 0) - (boosting ? 0.04 : 0);
    const rollT = clamp(k.speed * a.yawRate * 0.0045, -0.12, 0.12) + k.driftYaw * 0.14 * sp;
    a.heaveV += (-a.heave * 260 - a.heaveV * 13) * step;
    a.heave = clamp(a.heave + a.heaveV * step, -0.22, 0.22);
    a.pitchV += ((pitchT - a.pitch) * 200 - a.pitchV * 14) * step;
    a.pitch += a.pitchV * step;
    a.rollV += ((rollT - a.roll) * 200 - a.rollV * 14) * step;
    a.roll += a.rollV * step;
    a.wobble = Math.max(0, a.wobble - step * 1.4);
    a.happy = Math.max(0, a.happy - step * 1.3);
    // The driver's bounce in the seat.
    a.hopV += (-a.hop * 140 - a.hopV * 8) * step;
    a.hop += a.hopV * step;
  }

  // An engine idle shiver while standing still.
  const idle = Math.abs(k.speed) < 1 && !k.stun && !k.finished ? 1 : 0;
  const wob = Math.sin(time * 20) * 0.14 * a.wobble * a.wobble;
  rig.sprung.position.y = a.heave + idle * Math.sin(time * 42 + k.index * 1.7) * 0.012;
  rig.sprung.rotation.set(a.pitch + idle * Math.sin(time * 31 + k.index) * 0.005, 0, a.roll + wob + idle * Math.sin(time * 37 + k.index) * 0.006);

  // Wheels roll with the distance driven; the front ones steer.
  for (const w of rig.wheels) w.rotation.x = k.wheel / ((w.userData.r as number | undefined) ?? rig.wheelRadius);
  for (const f of rig.front) f.rotation.y = -k.steer * 0.45;
  rig.steering.rotation.z = clamp(k.steer + k.driftDir * 0.35, -1.3, 1.3) * 1.5;

  // Driver: leans into the turn and looks into the corner, sits back on a boost.
  if (k.finished) a.finishT += step;
  else a.finishT = 0;
  const cheering = k.finished && (a.finishT < 4 || Math.abs(k.speed) < 3);
  a.cheer = damp(a.cheer, cheering ? 1 : 0, 5, step);
  a.lean = damp(a.lean, clamp(k.steer * sp + k.driftDir * 0.6, -1.3, 1.3) * 0.13, 8, step);
  a.leanBack = damp(a.leanBack, boosting ? -0.26 : clamp(-a.accel * 0.004, -0.1, 0.08), boosting ? 10 : 5, step);
  a.look = damp(a.look, -(k.steer * 0.3 + k.driftDir * 0.3), 6, step);
  const cheer = a.cheer;
  const dizzy = stunned ? 1 : 0;
  const d = rig.driver;
  d.position.y = rig.seatY + Math.max(-0.12, a.hop * 0.25) + cheer * Math.abs(Math.sin(time * 7)) * 0.14;
  d.rotation.set(a.leanBack - cheer * 0.08, 0, a.lean + a.happy * Math.sin(time * 16) * 0.12);
  const stretch = clamp(a.hopV * 0.03, -0.12, 0.12);
  d.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
  rig.head.rotation.set(
    -cheer * 0.25 + dizzy * Math.cos(time * 13) * 0.22 + a.happy * Math.sin(time * 18) * 0.1,
    a.look * (1 - dizzy) + dizzy * Math.sin(time * 9) * 0.4,
    -a.lean * 0.3 + dizzy * Math.sin(time * 13) * 0.3 + a.happy * Math.sin(time * 12) * 0.15,
  );

  // Blinks now and then.
  if (step > 0) {
    a.blinkT -= step;
    if (a.blinkT < 0) a.blinkT = 2.5 + Math.random() * 3.5;
  }
  const closed = a.blinkT < 0.12;
  if (rig.eyes) rig.eyes.scale.y = closed ? 0.12 : 1;
  if (rig.catchlights) rig.catchlights.visible = !closed;
  if (rig.key) rig.key.rotation.z += step * (1.5 + sp * 8);

  // Arms: from the shoulders to the steering wheel, or up in the air to cheer.
  d.updateMatrix();
  const column = rig.steering.parent!;
  column.updateMatrix();
  rig.steering.updateMatrix();
  for (const arm of rig.arms) {
    // Shoulders lift a little to cheer, and the hands wave above the head.
    const shoulder = tmpA.copy(arm.shoulder).setY(arm.shoulder.y + cheer * 0.12).applyMatrix4(d.matrix);
    const hand = tmpB.copy(rig.grips[(arm.side + 1) / 2]).applyMatrix4(rig.steering.matrix).applyMatrix4(column.matrix);
    if (cheer > 0.001) {
      const up = tmpC.set(-arm.side * (0.6 + Math.sin(time * 9 + arm.side) * 0.12), 1.45, 0.12).applyMatrix4(d.matrix);
      hand.lerp(up, cheer);
    }
    hand.sub(shoulder);
    const len = hand.length();
    arm.mesh.position.copy(shoulder);
    arm.mesh.quaternion.setFromUnitVectors(UP, hand.divideScalar(len || 1));
    arm.mesh.scale.set(1, clamp(len / arm.length, 0.75, 1.3 + cheer * 0.3), 1);
  }
}

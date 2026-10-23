/**
 * What a kart throws off as it drives, and what race events look like.
 *
 *   drift      sparks from the rear wheels in the charge's colour (blue, orange, purple), denser and brighter
 *              per level, a pop as each level is reached, tyre smoke and rubber on the road
 *   boost      flame cones from the exhausts sized by the boost, a mini-turbo blast when it starts, speed
 *              lines streaming past
 *   ground     dust and bits off-road, sand spray, milk or oil droplets on slick ground, syrup blobs
 *   events     item box shatter, hits, landings, wall scrapes, bumps, splashes, shield pops, respawns
 */
import * as THREE from 'three';
import { clamp, fwdX, fwdZ, SURF, type Kart, type Race, type RaceEvent } from '@raceoff/game';
import { P, rate, type Fx } from './fx';
import type { KartRig } from './kartModel';
import type { Skids } from './skids';

const C = (hex: string) => new THREE.Color(hex);

/** Drift charge colours: none yet, then blue, orange, purple. */
export const DRIFT_COLORS = [C('#fff1d0'), C('#3fa9ff'), C('#ff8a1f'), C('#c45bff')];
const DRIFT_GLOW = [1.4, 6, 6.5, 7.5];
const DRIFT_RATE = [14, 70, 120, 180];
const FLAME = C('#ff7a1a');
const FLAME_HOT = C('#4d8dff');
const ROCKET = C('#ff9a2e');
const WHITE = C('#ffffff');
const TYRE_SMOKE = C('#e8e5df');
const ROCKET_SMOKE = C('#d9d6d0');
const SPEED = C('#e9f6ff');
const DRAFT = C('#bfe6ff');
const ASSIST = C('#7fe7ff');
const SHIELD = C('#9fe8ff');
const HIT = [C('#ffffff'), C('#ffd23f'), C('#fff1b8')];
const SCRAPE = [C('#fff1c9'), C('#ffb347'), C('#ff8a1f')];
const MILK = C('#f4f1ea');
const OIL = C('#24212b');
const SYRUP = C('#8a4b17');
const SAND = C('#e2c48a');
const GRASS = [C('#5fae3c'), C('#7cc94e'), C('#3f8a2c')];
const BUTTER = [C('#ffe27a'), C('#fff1b0'), C('#f5c938')];

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Matrix4();
const hue = new THREE.Color();
const tint = new THREE.Color();
const wheels = [new THREE.Vector3(), new THREE.Vector3()];

const rnd = (a: number) => (Math.random() * 2 - 1) * a;

/** Off-road colours by track: what the dust is, and what bits fly up with it. */
function ground(trackId: string, dust: string) {
  tint.set(dust);
  return trackId === 'sandbox' ? GRASS : null;
}

/**
 * Everything a kart gives off this frame. `levels` remembers each kart's drift level from the frame before,
 * so a new level pops. The rig's matrices must be up to date.
 */
export function emitKart(fx: Fx, skids: Skids, k: Kart, rig: KartRig, p: THREE.Vector3, h: number, sp: number, levels: number[], trackId: string, dust: string) {
  const dt = fx.dt;
  const fx_ = fwdX(h);
  const fz = fwdZ(h);
  const rx = -Math.cos(h);
  const rz = Math.sin(h);
  // How much of the kart's own velocity its sparks and smoke carry, so they trail close behind it.
  const ivx = k.vx * 0.75;
  const ivz = k.vz * 0.75;
  for (let w = 0; w < 2; w++) wheels[w].copy(rig.rearWheels[w] ?? rig.rearWheels[0]).applyMatrix4(rig.body.matrixWorld);
  const floor = k.groundY + 0.06;

  // Rubber on the road: drifting, hard braking or spinning. Off-road, a drift leaves a pale scuff.
  const onRoad = k.surface === SURF.road || k.surface === SURF.boost || k.surface === SURF.slick;
  const offRoad = k.surface === SURF.rough || k.surface === SURF.sand;
  const sliding = k.driftDir !== 0 || (k.input.brake && k.speed > 10) || (k.stun === 'spin' && Math.hypot(k.vx, k.vz) > 6);
  const skidding = k.grounded && sliding && (onRoad || (offRoad && k.driftDir !== 0));
  for (let w = 0; w < 2; w++) {
    skids.mark(k.index * 2 + w, wheels[w].x, k.groundY, wheels[w].z, skidding, onRoad ? (k.driftDir ? 0.42 + k.driftLevel * 0.06 : 0.5) : 0.3, onRoad ? 0 : 1);
  }

  // Drift: sparks in the charge's colour, a glow at each tyre, smoke off the road.
  const level = k.driftDir && k.grounded ? k.driftLevel : 0;
  if (k.driftDir && k.grounded) {
    const color = DRIFT_COLORS[level];
    const popped = level > (levels[k.index] ?? 0);
    for (let w = 0; w < 2; w++) {
      const wp = wheels[w];
      const side = w === 0 ? -1 : 1;
      const n = rate(DRIFT_RATE[level], dt);
      for (let i = 0; i < n; i++) {
        const back = 2 + Math.random() * 5;
        const out = (0.3 + Math.random() * 1.6) * side * (level ? 1 : 0.5);
        fx.emit(
          P.spark, wp.x + rnd(0.15), wp.y + 0.1, wp.z + rnd(0.15),
          ivx - fx_ * back + rx * out + rnd(1.5), 2 + Math.random() * (3 + level * 1.5), ivz - fz * back + rz * out + rnd(1.5),
          color, DRIFT_GLOW[level], level ? 1 + level * 0.12 : 0.7, level ? 1 : 0.6, floor,
        );
      }
      if (level > 0) {
        // A steady glow where the tyre bites, re-made every frame.
        fx.emit(P.flare, wp.x - fx_ * 0.2, wp.y + 0.45, wp.z - fz * 0.2, k.vx, 0, k.vz, color, 1.6 + level * 0.5, 0.7 + level * 0.15, Math.max(1, (dt * 1.6) / P.flare.life));
      }
      if (onRoad && rate(level ? 16 : 10, dt)) {
        fx.emit(P.smoke, wp.x + rnd(0.3), wp.y + 0.3, wp.z + rnd(0.3), k.vx * 0.35 + rnd(1), 0.8 + Math.random(), k.vz * 0.35 + rnd(1), TYRE_SMOKE, 1, 0.6, 0.7);
      }
      if (popped) {
        // The new colour pops, so it is caught from the corner of the eye: a crackle of sparks, a ring and a twinkle.
        for (let i = 0; i < 10 + level * 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 3 + Math.random() * (4 + level);
          fx.emit(P.spark, wp.x, wp.y + 0.3, wp.z, k.vx * 0.85 + Math.cos(a) * s, 2 + Math.random() * 5, k.vz * 0.85 + Math.sin(a) * s, color, DRIFT_GLOW[level], 1.1, 0.9, floor);
        }
        fx.emit(P.ring, wp.x, wp.y + 0.5, wp.z, k.vx * 0.9, 0, k.vz * 0.9, color, 2, 0.45, 0.9);
        fx.emit(P.flare, wp.x, wp.y + 0.4, wp.z, k.vx * 0.9, 0, k.vz * 0.9, color, 2.5, 1.6, 2.5);
        fx.emit(P.star, wp.x, wp.y + 0.8, wp.z, k.vx * 0.9, 1, k.vz * 0.9, WHITE, 2.5, 1.1);
      }
    }
  }
  levels[k.index] = k.driftDir ? k.driftLevel : 0;

  // Boost: flame cones from the exhausts, embers, and speed lines rushing past.
  const kick = fx.kickT[k.index] ?? 0;
  if (k.boost > 0 || k.rocket > 0) {
    const strength = k.rocket > 0 ? 1.1 : clamp((k.boostMul - 1.15) / 0.3, 0.35, 1.2);
    const hot = k.boostMul > 1.38 || kick > 0;
    const color = hot ? FLAME_HOT : FLAME;
    const flick = 0.85 + Math.random() * 0.3;
    const len = (0.9 + strength * 1.1) * flick * (1 + kick * 1.6);
    const r = 0.2 + strength * 0.1 + kick * 0.1;
    for (const ex of rig.exhausts) {
      tmpS.makeScale(r, r, len).setPosition(ex);
      tmpM.multiplyMatrices(rig.body.matrixWorld, tmpS);
      fx.flame(tmpM, color, 2.6 + strength);
      tmpV.copy(ex).applyMatrix4(rig.body.matrixWorld);
      if (rate(18 + strength * 20, dt)) fx.emit(P.ember, tmpV.x, tmpV.y, tmpV.z, k.vx * 0.6 - fx_ * 6 + rnd(1.5), 0.5 + Math.random(), k.vz * 0.6 - fz * 6 + rnd(1.5), color, 4);
    }
    if (k.rocket > 0) {
      tmpS.makeScale(0.42, 0.42, 2.6 * flick).setPosition(rig.nozzle);
      tmpM.multiplyMatrices(rig.body.matrixWorld, tmpS);
      fx.flame(tmpM, ROCKET, 3.4);
      tmpV.copy(rig.nozzle).setZ(rig.nozzle.z - 0.9).applyMatrix4(rig.body.matrixWorld);
      const n = rate(26, dt);
      for (let i = 0; i < n; i++) fx.emit(P.smoke, tmpV.x + rnd(0.3), tmpV.y + rnd(0.3), tmpV.z + rnd(0.3), rnd(1), 0.6 + Math.random(), rnd(1), ROCKET_SMOKE, 1.1, 0.8, 1);
    }
    if (sp > 0.4) {
      const n = rate(k.rocket > 0 ? 70 : 45, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI;
        const d = 1.7 + Math.random() * 1.6;
        const ox = Math.cos(a) * d;
        const oy = 0.2 + Math.sin(a) * d * 0.9;
        const along = -2 + Math.random() * 5;
        fx.emit(P.streak, p.x + rx * ox + fx_ * along, p.y + oy, p.z + rz * ox + fz * along, k.vx * 0.55, 0, k.vz * 0.55, SPEED, 1.4);
      }
    }
  }

  // Slipstream building: air streams back past the kart, thicker as the boost nears.
  if (k.draftT > 0.15) {
    const n = rate(20 + k.draftT * 30, dt);
    for (let i = 0; i < n; i++) {
      const off = (Math.random() < 0.5 ? -1 : 1) * (1.1 + Math.random() * 0.7);
      fx.emit(P.streak, p.x + rx * off + fx_ * 1.5, p.y + 0.5 + Math.random() * 1.4, p.z + rz * off + fz * 1.5, k.vx * 0.45, 0, k.vz * 0.45, DRAFT, 2, 1.8);
    }
  }

  // Smart steering helping: a glint off the nose, so it is clear the kart was steered for you.
  if (k.assistT > 0 && rate(14, dt)) fx.emit(P.star, p.x + fx_ * 1.7, p.y + 1.1, p.z + fz * 1.7, k.vx, 0.5, k.vz, ASSIST, 2.2, 0.5);

  // The ground: dust, bits and droplets from the rear wheels, more the faster it goes.
  if (k.grounded && sp > 0.25) {
    const w = wheels[Math.random() < 0.5 ? 0 : 1];
    const bx = k.vx * 0.3 - fx_ * 2;
    const bz = k.vz * 0.3 - fz * 2;
    if (k.surface === SURF.rough) {
      const bits = ground(trackId, dust);
      for (let i = rate(40 * sp, dt); i > 0; i--) fx.emit(P.dust, w.x + rnd(0.4), w.y + 0.3, w.z + rnd(0.4), bx + rnd(1.5), 1 + Math.random() * 1.5, bz + rnd(1.5), tint, 1, 1.1);
      const n = rate(30 * sp, dt);
      for (let i = 0; i < n; i++) fx.emit(P.bit, w.x, w.y + 0.2, w.z, bx * 1.5 + rnd(3), 3 + Math.random() * 5, bz * 1.5 + rnd(3), bits ? bits[i % 3] : tint, bits ? 1 : 0.8, 1, 1, floor);
    } else if (k.surface === SURF.sand) {
      for (let i = rate(40 * sp, dt); i > 0; i--) fx.emit(P.dust, w.x + rnd(0.4), w.y + 0.3, w.z + rnd(0.4), bx + rnd(1.5), 1 + Math.random() * 1.5, bz + rnd(1.5), SAND, 1.05, 1.2);
      const n = rate(70 * sp, dt);
      for (let i = 0; i < n; i++) fx.emit(P.bit, w.x, w.y + 0.2, w.z, bx * 2 + rnd(2.5), 4 + Math.random() * 6, bz * 2 + rnd(2.5), SAND, 0.9, 0.55, 0.8, floor);
    } else if (k.surface === SURF.slick) {
      const n = rate(40 * sp, dt);
      const c = trackId === 'garage' ? OIL : MILK;
      for (let i = 0; i < n; i++) fx.emit(P.drop, w.x, w.y + 0.15, w.z, bx * 1.4 + rnd(2.5), 2.5 + Math.random() * 4, bz * 1.4 + rnd(2.5), c, 1, 0.8, 0.6);
    } else if (k.surface === SURF.sticky) {
      if (rate(14 * sp, dt)) fx.emit(P.drop, w.x, w.y + 0.15, w.z, bx + rnd(1.5), 2 + Math.random() * 2, bz + rnd(1.5), SYRUP, 1, 1.5, 0.8);
    }
  }

  // Sugar Rush: rainbow sparkles and a candy-coloured trail.
  if (k.star > 0) {
    const n = rate(36, dt);
    for (let i = 0; i < n; i++) {
      hue.setHSL(Math.random(), 1, 0.6);
      fx.emit(P.star, p.x + rnd(1.6), p.y + 0.6 + Math.random() * 1.8, p.z + rnd(1.6), k.vx * 0.5, 1.5, k.vz * 0.5, hue, 3.5, 0.7);
    }
    hue.setHSL((performance.now() / 600) % 1, 1, 0.6);
    for (let w = 0; w < 2; w++) fx.emit(P.trail, wheels[w].x, wheels[w].y + 0.4, wheels[w].z, 0, 0, 0, hue, 2.2, 1.1);
  }
  // Bubble shield: now and then a glint runs over it.
  if (k.shield > 0 && rate(5, dt)) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * 1.2;
    fx.emit(P.star, p.x + Math.cos(a) * Math.cos(e) * 2.1, p.y + 1 + Math.sin(e) * 2.1, p.z + Math.sin(a) * Math.cos(e) * 2.1, k.vx, 0, k.vz, SHIELD, 2.5, 0.6);
  }
}

/** Effects for a race event. Camera shake stays with the view. */
export function emitEvent(fx: Fx, e: RaceEvent, race: Race, rigs: KartRig[], dust: string) {
  switch (e.t) {
    case 'box': {
      // The box shatters into rainbow glass with a pop of light.
      fx.emit(P.flare, e.x, e.y + 0.4, e.z, 0, 0, 0, WHITE, 4, 6, 2.5);
      fx.emit(P.ring, e.x, e.y + 0.4, e.z, 0, 0, 0, WHITE, 2.5, 2.2, 1.2);
      for (let i = 0; i < 26; i++) {
        hue.setHSL(i / 26, 0.9, 0.65);
        const a = Math.random() * Math.PI * 2;
        const s = 5 + Math.random() * 9;
        fx.emit(P.shard, e.x + rnd(0.8), e.y + 0.4 + rnd(0.8), e.z + rnd(0.8), Math.cos(a) * s, 3 + Math.random() * 8, Math.sin(a) * s, hue, 2.6, 1, 1, e.y - 1.5);
      }
      const k = race.karts[e.k];
      for (let i = 0; i < 10; i++) {
        hue.setHSL(Math.random(), 1, 0.7);
        fx.emit(P.star, e.x + rnd(1.2), e.y + rnd(1.2), e.z + rnd(1.2), k.vx * 0.6 + rnd(3), 2 + Math.random() * 3, k.vz * 0.6 + rnd(3), hue, 3, 0.9);
      }
      break;
    }
    case 'hit': {
      const k = race.karts[e.k];
      fx.emit(P.flare, k.x, k.y + 1.5, k.z, k.vx, 0, k.vz, WHITE, 3, 5, 2);
      fx.emit(P.ring, k.x, k.y + 1.5, k.z, k.vx * 0.5, 0, k.vz * 0.5, HIT[1], 2.5, 1.6);
      fx.burst(P.star, k.x, k.y + 2, k.z, 12, 9, HIT, 3.5, 1.2);
      fx.burst(P.spark, k.x, k.y + 1.2, k.z, 20, 12, HIT, 5, 1.2, 0.4, k.groundY + 0.05);
      for (let i = 0; i < 5; i++) fx.emit(P.smoke, k.x + rnd(1), k.y + 0.8, k.z + rnd(1), rnd(2), 1.5, rnd(2), TYRE_SMOKE, 0.9, 1.2);
      break;
    }
    case 'blast':
      fx.explosion(e.x, e.y, e.z);
      break;
    case 'fall': {
      const k = race.karts[e.k];
      if (e.water) fx.splash(k.x, k.y + 0.5, k.z);
      break;
    }
    case 'land': {
      // A ring of dust pushed out from under the wheels.
      const k = race.karts[e.k];
      tint.set(dust);
      const n = e.hard ? 16 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
        const s = (e.hard ? 5 : 3) + Math.random() * 2;
        fx.emit(P.dust, k.x + Math.cos(a) * 1.2, k.groundY + 0.4, k.z + Math.sin(a) * 1.2, Math.cos(a) * s + k.vx * 0.4, 0.6, Math.sin(a) * s + k.vz * 0.4, tint, 1.05, e.hard ? 1.3 : 1);
      }
      if (e.hard) fx.burst(P.bit, k.x, k.groundY + 0.3, k.z, 10, 7, [tint], 0.8, 1, 0.6, k.groundY + 0.05);
      break;
    }
    case 'wall': {
      if (e.strength < 4) break;
      // Sparks off both front corners: the wall is on one of them.
      const k = race.karts[e.k];
      const h = k.h;
      const n = Math.min(40, Math.round(e.strength * 1.6));
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const x = k.x + Math.sin(h) * 1.6 - Math.cos(h) * side * 1.1;
        const z = k.z + Math.cos(h) * 1.6 + Math.sin(h) * side * 1.1;
        fx.emit(P.spark, x, k.y + 0.6, z, k.vx * 0.3 - Math.cos(h) * side * (2 + Math.random() * 5) + rnd(3), 2 + Math.random() * 6, k.vz * 0.3 + Math.sin(h) * side * (2 + Math.random() * 5) + rnd(3), SCRAPE[i % 3], 6, 1.2, 1, k.groundY + 0.05);
      }
      break;
    }
    case 'bump': {
      if (e.strength < 3) break;
      const a = race.karts[e.a];
      const b = race.karts[e.b];
      const x = (a.x + b.x) / 2;
      const z = (a.z + b.z) / 2;
      fx.emit(P.flare, x, a.y + 1, z, (a.vx + b.vx) / 2, 0, (a.vz + b.vz) / 2, WHITE, 2.5, 2.5);
      fx.burst(P.spark, x, a.y + 1, z, Math.min(20, Math.round(e.strength)), 8, SCRAPE, 5, 1, 0.4, a.groundY + 0.05);
      fx.burst(P.star, x, a.y + 1.4, z, 4, 5, HIT, 3, 0.9);
      break;
    }
    case 'boost': {
      // The mini-turbo: the flames lick out long for a moment, with a blast of sparks and a shock ring.
      const k = race.karts[e.k];
      const rig = rigs[e.k];
      if (!rig) break;
      fx.kickT[e.k] = e.kind === 'draft' ? 0.15 : 0.35;
      const color = e.kind === 'drift' || e.kind === 'start' ? DRIFT_COLORS[clamp(e.level, 1, 3)] : e.kind === 'nitro' || e.kind === 'pad' ? FLAME_HOT : FLAME;
      for (const ex of rig.exhausts) {
        tmpV.copy(ex).applyMatrix4(rig.body.matrixWorld);
        fx.emit(P.ring, tmpV.x, tmpV.y, tmpV.z, k.vx * 0.8, 0, k.vz * 0.8, color, 3, 0.8);
        fx.emit(P.flare, tmpV.x, tmpV.y, tmpV.z, k.vx * 0.9, 0, k.vz * 0.9, color, 4, 2.5, 2.5);
        for (let i = 0; i < 10; i++) {
          fx.emit(P.spark, tmpV.x, tmpV.y, tmpV.z, k.vx * 0.5 - Math.sin(k.h) * (8 + Math.random() * 8) + rnd(3), 1 + Math.random() * 4, k.vz * 0.5 - Math.cos(k.h) * (8 + Math.random() * 8) + rnd(3), color, 6, 1.2, 1, k.groundY + 0.05);
        }
        for (let i = 0; i < 4; i++) fx.emit(P.fire, tmpV.x, tmpV.y, tmpV.z, k.vx * 0.5 - Math.sin(k.h) * 6 + rnd(2), rnd(1), k.vz * 0.5 - Math.cos(k.h) * 6 + rnd(2), FLAME, 3, 0.45, 0.6);
      }
      break;
    }
    case 'pop':
    case 'shield': {
      // A bubble or a ball popping: a ring and a spray of droplets.
      const at = e.t === 'pop' ? e : { x: race.karts[e.k].x, y: race.karts[e.k].y + 1, z: race.karts[e.k].z };
      fx.emit(P.ring, at.x, at.y, at.z, 0, 0, 0, SHIELD, 2.5, 2);
      fx.burst(P.drop, at.x, at.y, at.z, 18, 8, [SHIELD, WHITE], 1.2, 0.8);
      fx.burst(P.star, at.x, at.y, at.z, 6, 5, [WHITE], 3, 0.8);
      break;
    }
    case 'giantLand':
      if (e.kind === 'butter') {
        fx.burst(P.drop, e.x, e.y + 0.6, e.z, 30, 9, BUTTER, 1, 1.6, 0.6);
        tint.set(dust);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          fx.emit(P.dust, e.x + Math.cos(a) * 2, e.y + 0.4, e.z + Math.sin(a) * 2, Math.cos(a) * 6, 0.6, Math.sin(a) * 6, tint, 1, 1.6);
        }
      }
      break;
    case 'finish': {
      const k = race.karts[e.k];
      if (!k.cpu) fx.confetti(k.x, k.y + 3, k.z, 120);
      break;
    }
    case 'respawn': {
      const k = race.karts[e.k];
      fx.emit(P.ring, k.x, k.y + 1, k.z, 0, 0, 0, SHIELD, 2.5, 2);
      fx.burst(P.star, k.x, k.y + 1, k.z, 14, 6, [WHITE, SHIELD], 3, 1);
      break;
    }
  }
}

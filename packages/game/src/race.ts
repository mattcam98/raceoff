/**
 * One race: karts on a track, the items they throw, the order they are in.
 *
 * `step` advances everything by one fixed tick. The race knows nothing about
 * screens or networks: inputs arrive as plain objects, and everything worth
 * a sound or an effect is pushed onto `events` for whoever is watching.
 */
import type { ItemId } from '@raceoff/shared';
import { AiDriver, type Difficulty } from './ai';
import { hazardAt, type HazardState } from './hazards';
import {
  BALL_RADIUS, BLAST_RADIUS, drawItem, OIL_RADIUS, ORBIT_RADIUS, usesOf,
  type Blast, type Drop, type ItemMode, type Projectile,
} from './items';
import { collideStatic, GRAVITY, Kart, KART_RADIUS, NO_INPUT, STEP, stepKart, type KartInput, type StepEvents, type StunKind } from './kart';
import { clamp, fwdX, fwdZ, headingOf, lerp, rng, wrapAngle, type Rng } from './math';
import type { Collider, Track } from './track/build';
import { SURF } from './track/types';

export interface RacerSpec {
  id: string;
  name: string;
  character: string;
  body: string;
  cpu: boolean;
  /** Player slot 0-3, or -1 for a computer. */
  slot: number;
}

export interface RaceConfig {
  track: Track;
  /** In grid order: the first starts at the front. */
  racers: RacerSpec[];
  laps: number;
  cc: 50 | 100 | 150;
  items: ItemMode;
  difficulty: Difficulty;
  seed: number;
}

export type HitHow = 'ball' | 'seeker' | 'oil' | 'blast' | 'hazard' | 'star' | 'orbit' | 'squash' | 'rocket';

export type RaceEvent =
  | { t: 'countdown'; n: number }
  | { t: 'go' }
  | { t: 'start'; k: number; good: boolean }
  | { t: 'box'; k: number; x: number; y: number; z: number }
  | { t: 'got'; k: number; item: ItemId }
  | { t: 'use'; k: number; item: ItemId }
  | { t: 'hit'; k: number; by: number; how: HitHow }
  | { t: 'shield'; k: number }
  | { t: 'blast'; x: number; y: number; z: number }
  | { t: 'boost'; k: number; kind: 'drift' | 'pad' | 'trick' | 'start' | 'nitro'; level: number }
  | { t: 'drift'; k: number; on: boolean }
  | { t: 'wall'; k: number; strength: number }
  | { t: 'bump'; a: number; b: number; strength: number }
  | { t: 'land'; k: number; hard: boolean }
  | { t: 'fall'; k: number; water: boolean }
  | { t: 'respawn'; k: number }
  | { t: 'lap'; k: number; lap: number; time: number }
  | { t: 'finish'; k: number; place: number; time: number }
  | { t: 'pop'; x: number; y: number; z: number };

export const CC_SCALE = { 50: 0.8, 100: 1, 150: 1.17 } as const;
export const COUNTDOWN = 3;
const BOX_RESPAWN = 1.6;
const ROLL_TIME = 1.3;
const RESPAWN_TIME = 1.9;
/** After the first human finishes, the rest have this long. */
const FINISH_GRACE = 45;
/** After everyone who matters has finished, keep the race going this long before calling it. */
const END_DELAY = 3.5;

export interface ItemBox {
  x: number;
  y: number;
  z: number;
  /** Seconds until it is back, 0 when present. */
  respawn: number;
}

export class Race {
  readonly track: Track;
  readonly karts: Kart[];
  readonly laps: number;
  readonly itemMode: ItemMode;
  readonly rand: Rng;
  /** Race clock; negative during the countdown. */
  time = -COUNTDOWN;
  /** Steps taken, for things that only need to happen now and then. */
  ticks = 0;
  events: RaceEvent[] = [];
  boxes: ItemBox[];
  projectiles: Projectile[] = [];
  drops: Drop[] = [];
  blasts: Blast[] = [];
  hazards: HazardState[];
  /** Set when the race is over and results can be shown. */
  over = false;
  private firstHumanFinish: number | null = null;
  private endAt: number | null = null;
  private nextId = 1;
  private finishedCount = 0;
  private ai: (AiDriver | null)[];
  private startPress: number[];
  private respawnTo: ({ x: number; y: number; z: number; h: number; s: number } | null)[];
  private stall: number[];
  private ev: StepEvents;
  private scratch: Collider[] = [];

  constructor(readonly config: RaceConfig) {
    this.track = config.track;
    this.laps = config.laps;
    this.itemMode = config.items;
    this.rand = rng(config.seed);
    const scale = CC_SCALE[config.cc];
    this.karts = config.racers.map((r, i) => {
      const k = new Kart(i, r.id, r.character, r.body, r.cpu, scale);
      k.name = r.name;
      k.slot = r.slot;
      const spot = this.track.slot(i);
      k.place3(spot.x, spot.y, spot.z, spot.h);
      k.s = spot.s;
      k.safeS = spot.s;
      // Behind the line: progress is just short of a full lap, so unwrapped distance starts negative.
      k.dist = spot.s - this.track.length;
      k.place = i + 1;
      return k;
    });
    this.ai = this.karts.map((k) => (k.cpu ? new AiDriver(this, k, config.difficulty, this.rand) : null));
    this.startPress = this.karts.map(() => NaN);
    this.respawnTo = this.karts.map(() => null);
    this.stall = this.karts.map(() => 0);
    this.boxes = this.track.boxes.map((b) => ({ x: b.x, y: b.y, z: b.z, respawn: 0 }));
    this.hazards = this.track.hazards.map((h) => hazardAt(h, 0));
    this.ev = {
      wall: (k, strength) => this.events.push({ t: 'wall', k: k.index, strength }),
      boost: (k, kind, level) => this.events.push({ t: 'boost', k: k.index, kind, level }),
      land: (k, hard) => this.events.push({ t: 'land', k: k.index, hard }),
      drift: (k, on) => this.events.push({ t: 'drift', k: k.index, on }),
      fall: (k, water) => this.fall(k, water),
    };
  }

  get racing() {
    return this.time >= 0 && !this.over;
  }

  get humans() {
    return this.karts.filter((k) => !k.cpu);
  }

  private id() {
    return this.nextId++;
  }

  /** Advance one fixed step. `inputs[i]` is kart i's input; computers ignore theirs. */
  step(inputs: (KartInput | undefined)[]) {
    const dt = STEP;
    const before = this.time;
    this.time += dt;
    this.ticks++;

    // Countdown beeps on each whole second, then GO.
    if (before < 0) {
      for (const n of [3, 2, 1]) if (before < -n && this.time >= -n) this.events.push({ t: 'countdown', n });
      if (this.time >= 0) this.events.push({ t: 'go' });
    }

    for (const h of this.hazards) hazardAt(h.def, Math.max(0, this.time), h);

    for (const k of this.karts) {
      const ai = this.ai[k.index];
      k.input = ai ? ai.decide(dt) : (inputs[k.index] ?? NO_INPUT);
      if (k.finished && !k.cpu) {
        // Finished humans are driven home by the computer so they do not block the track.
        k.input = { ...NO_INPUT, gas: k.speed < 12 };
      }
    }

    if (this.time < 0) {
      this.countdownStep();
      return;
    }
    if (before < 0) this.launch();

    for (const k of this.karts) {
      if (this.stall[k.index] > 0) {
        this.stall[k.index] -= dt;
        k.input = { ...k.input, gas: false };
      }
      if (k.respawnT > 0) {
        this.respawnStep(k, dt);
        continue;
      }
      const auto = k.rocket > 0 ? this.autopilotHeading(k) : null;
      stepKart(k, this.track, dt, this.ev, auto);
      if (k.respawnT > 0) continue;
      this.progress(k, dt);
      if (k.input.item) this.useItem(k);
      if (k.item) k.heldT += dt;
      if (k.rollT > 0) {
        k.rollT -= dt;
        if (k.rollT <= 0) this.finishRoll(k);
      }
    }

    this.collideKarts();
    this.boxesStep(dt);
    this.projectilesStep(dt);
    this.dropsStep(dt);
    this.hazardsStep();
    // Bumps and hazards push karts about; walls get the last word, so nothing is ever shoved through one.
    for (const k of this.karts) if (k.respawnT === 0) collideStatic(k, this.track, this.ev);
    this.blasts = this.blasts.filter((b) => (b.age += dt) < 0.8);
    this.rubberBand();
    if (this.ticks % 6 === 0) this.rank();
    this.checkEnd();
  }

  // ---------------------------------------------------------------- start

  private countdownStep() {
    for (const k of this.karts) {
      k.px = k.x;
      k.py = k.y;
      k.pz = k.z;
      k.ph = k.h;
      const pressed = k.input.drift && !k.lastDrift;
      k.lastDrift = k.input.drift;
      // Only the first press after "2" counts: pressing too soon stalls the engine.
      if (pressed && this.time > -1.6 && Number.isNaN(this.startPress[k.index])) this.startPress[k.index] = this.time;
    }
  }

  private launch() {
    for (const k of this.karts) {
      let at = this.startPress[k.index];
      const ai = this.ai[k.index];
      if (ai) at = ai.startTiming();
      if (Number.isNaN(at)) continue;
      if (at >= -0.45) {
        k.giveBoost(1.1, 1.45);
        this.events.push({ t: 'start', k: k.index, good: true });
        this.events.push({ t: 'boost', k: k.index, kind: 'start', level: 2 });
      } else {
        this.stall[k.index] = 0.7;
        this.events.push({ t: 'start', k: k.index, good: false });
      }
    }
    for (const k of this.karts) k.lapStartT = 0;
  }

  /** A start-boost press can land just after GO too. */
  pressedAtGo(k: Kart) {
    return !Number.isNaN(this.startPress[k.index]);
  }

  // ---------------------------------------------------------------- progress

  private progress(k: Kart, dt: number) {
    const L = this.track.length;
    const cell = this.track.grid.index(k.x, k.z);
    const s = cell >= 0 && !this.track.grid.outside[cell] ? this.track.grid.s[cell] : NaN;
    if (cell >= 0 && this.track.grid.outside[cell]) k.lostT += dt * 2;
    if (!Number.isNaN(s)) {
      let d = s - k.s;
      if (d > L / 2) d -= L;
      if (d < -L / 2) d += L;
      if (Math.abs(d) < 14) {
        k.s = s;
        k.dist += d;
        k.lostT = 0;
        const surf = k.surface;
        if (k.grounded && (surf === SURF.road || surf === SURF.boost) && !this.nearRamp(s)) k.safeS = s;
      } else {
        // Progress jumped: driven across to another stretch of road. Not allowed to count.
        k.lostT += dt;
      }
    } else {
      k.lostT += dt;
    }
    if (k.lostT > 2.6) {
      this.fall(k, false);
      return;
    }

    // Wrong way: moving against the road.
    const smp = this.track.sampleAt(k.s);
    const along = k.vx * fwdX(smp.h) + k.vz * fwdZ(smp.h);
    k.wrongWayT = along < -4 && !k.stun ? k.wrongWayT + dt : 0;

    if (k.finished) return;
    const lapIndex = Math.floor(k.dist / L);
    if (lapIndex > k.lapIndex) {
      // Crossing the line the first time starts lap 1; every later crossing completes one.
      if (k.lapIndex >= 0) {
        const lapTime = this.time - k.lapStartT;
        k.lapTimes.push(lapTime);
        if (k.bestLap === null || lapTime < k.bestLap) k.bestLap = lapTime;
      }
      k.lapIndex = lapIndex;
      k.lapStartT = this.time;
      if (lapIndex >= this.laps) {
        k.finished = true;
        k.finishTime = this.time;
        this.finishedCount++;
        k.place = this.finishedCount;
        this.events.push({ t: 'finish', k: k.index, place: k.place, time: this.time });
        if (!k.cpu && this.firstHumanFinish === null) this.firstHumanFinish = this.time;
        if (k.item) k.item = null;
      } else if (lapIndex > 0) {
        this.events.push({ t: 'lap', k: k.index, lap: lapIndex + 1, time: this.time });
      }
    }
  }

  /** Is progress s on, or just before, a ramp or its gap? Respawning there would leave a kart unable to clear it. */
  private nearRamp(s: number) {
    const L = this.track.length;
    for (const r of this.track.ramps) {
      if (r.path !== 0 && r.gap === 0) continue;
      let x = s - r.s0;
      if (x < -L / 2) x += L;
      if (x > L / 2) x -= L;
      if (x > -22 && x < r.d1 - r.d0 + r.gap + 3) return true;
    }
    return false;
  }

  /** Current lap for display, 1 to laps. */
  lapOf(k: Kart) {
    return clamp(k.lapIndex + 1, 1, this.laps);
  }

  private rank() {
    const order = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    order.forEach((k, i) => (k.place = i + 1));
  }

  // ---------------------------------------------------------------- falls

  private fall(k: Kart, water: boolean) {
    if (k.respawnT > 0) return;
    this.events.push({ t: 'fall', k: k.index, water });
    k.respawnT = RESPAWN_TIME;
    k.respawnFrom = { x: k.x, y: k.y, z: k.z };
    k.stopDrift();
    k.boost = 0;
    k.stun = null;
    k.rocket = 0;
    k.lostT = 0;
    let s = k.safeS - 2;
    // Never put a kart down on a ramp or in front of a gap: move it back before the run-up.
    for (let i = 0; i < 4 && this.nearRamp(s); i++) s -= 12;
    const spot = this.track.pointAt(s, 0);
    this.respawnTo[k.index] = { ...spot };
  }

  private respawnStep(k: Kart, dt: number) {
    k.px = k.x;
    k.py = k.y;
    k.pz = k.z;
    k.ph = k.h;
    const to = this.respawnTo[k.index]!;
    const before = k.respawnT;
    k.respawnT = Math.max(0, k.respawnT - dt);
    const half = RESPAWN_TIME / 2;
    if (before > half && k.respawnT <= half) {
      // Lifted out of sight; now carried over and lowered onto the road.
      k.x = k.px = to.x;
      k.z = k.pz = to.z;
      k.h = k.ph = to.h;
      k.y = k.py = to.y + 7;
    }
    if (k.respawnT > half) {
      // Being hauled up from wherever it went.
      k.y += dt * 8;
    } else {
      k.y = to.y + 7 * (k.respawnT / half);
    }
    if (k.respawnT === 0) {
      k.place3(to.x, to.y, to.z, to.h);
      k.s = to.s;
      // Distance is not refunded for the part of the lap thrown away, so a fall costs time, not laps.
      let d = to.s - k.s;
      if (d > this.track.length / 2) d -= this.track.length;
      if (d < -this.track.length / 2) d += this.track.length;
      k.dist += d;
      k.invuln = 2;
      k.lostT = 0;
      this.events.push({ t: 'respawn', k: k.index });
    }
  }

  // ---------------------------------------------------------------- items

  private finishRoll(k: Kart) {
    k.rollT = 0;
    const plane = this.projectiles.some((p) => p.kind === 'plane' && !p.dead);
    const item = drawItem(k.place, this.karts.length, this.itemMode, this.rand, plane);
    k.item = item;
    k.itemCount = usesOf(item);
    k.heldT = 0;
    this.events.push({ t: 'got', k: k.index, item });
  }

  private useItem(k: Kart) {
    if (!k.item || k.rollT > 0 || k.stunned || k.finished) return;
    const item = k.item;
    const back = k.input.back;
    this.events.push({ t: 'use', k: k.index, item });
    switch (item) {
      case 'ball':
      case 'ball3':
        this.fireBall(k, back);
        break;
      case 'seeker':
        this.fireSeeker(k);
        break;
      case 'oil':
        this.dropThing(k, 'oil');
        break;
      case 'bomb':
        if (back) this.dropThing(k, 'bomb');
        else this.throwBomb(k);
        break;
      case 'plane':
        this.firePlane(k);
        break;
      case 'shield':
        k.shield = 10;
        break;
      case 'nitro':
      case 'nitro3':
        k.giveBoost(1.35, 1.5);
        this.events.push({ t: 'boost', k: k.index, kind: 'nitro', level: 2 });
        break;
      case 'sugar':
        k.star = 7.5;
        break;
      case 'rocket':
        k.rocket = 4.2;
        k.stopDrift();
        k.stun = null;
        break;
    }
    k.itemCount--;
    if (k.itemCount <= 0) {
      k.item = null;
      k.itemCount = 0;
    }
    k.heldT = 0;
  }

  private projectile(kind: Projectile['kind'], k: Kart, x: number, y: number, z: number, vx: number, vy: number, vz: number): Projectile {
    const p: Projectile = {
      id: this.id(), kind, owner: k.index, x, y, z, px: x, py: y, pz: z, vx, vy, vz,
      h: headingOf(vx, vz), age: 0, bounces: 0, target: -1, dist: k.dist, diving: 0, dead: false,
    };
    this.projectiles.push(p);
    return p;
  }

  private fireBall(k: Kart, back: boolean) {
    const dir = back ? -1 : 1;
    const h = k.h;
    const speed = 54 * (this.config.cc === 150 ? 1.1 : 1);
    const off = (KART_RADIUS + BALL_RADIUS + 0.6) * dir;
    const x = k.x + fwdX(h) * off;
    const z = k.z + fwdZ(h) * off;
    const base = back ? 0 : Math.max(0, k.speed);
    this.projectile('ball', k, x, k.y + 0.9, z, fwdX(h) * dir * (speed + base * 0.3), 0, fwdZ(h) * dir * (speed + base * 0.3));
  }

  /** The kart one place ahead, or -1. */
  private ahead(k: Kart) {
    return this.karts.find((o) => o.place === k.place - 1 && !o.finished)?.index ?? -1;
  }

  private fireSeeker(k: Kart) {
    const x = k.x + fwdX(k.h) * 2.4;
    const z = k.z + fwdZ(k.h) * 2.4;
    const speed = 60;
    const p = this.projectile('seeker', k, x, k.y + 1, z, fwdX(k.h) * speed, 0, fwdZ(k.h) * speed);
    p.target = this.ahead(k);
  }

  private firePlane(k: Kart) {
    const p = this.projectile('plane', k, k.x, k.y + 4, k.z, 0, 0, 0);
    p.dist = k.dist;
  }

  private throwBomb(k: Kart) {
    const sp = Math.max(0, k.speed) + 22;
    const p = this.projectile('bomb', k, k.x + fwdX(k.h) * 2, k.y + 1.6, k.z + fwdZ(k.h) * 2, fwdX(k.h) * sp, 12, fwdZ(k.h) * sp);
    p.age = 0;
  }

  private dropThing(k: Kart, kind: 'oil' | 'bomb') {
    const back = KART_RADIUS + (kind === 'oil' ? OIL_RADIUS : 1) + 0.6;
    const x = k.x - fwdX(k.h) * back;
    const z = k.z - fwdZ(k.h) * back;
    const y = this.track.grid.heightAt(x, z, k.y);
    this.drops.push({ id: this.id(), kind, owner: k.index, x, y, z, age: 0, fuse: kind === 'bomb' ? 3 : 0, dead: false });
  }

  /** Try to knock a kart out. Shields, stars and rockets protect; orbiting balls take projectile hits. */
  hit(k: Kart, kind: StunKind, how: HitHow, by: number): 'immune' | 'blocked' | 'hit' {
    if (k.respawnT > 0 || k.star > 0 || k.rocket > 0 || k.finished) return 'immune';
    // Already spinning or flattened: one knock at a time.
    if ((k.invuln > 0 || k.stun) && how !== 'blast') return 'immune';
    if (k.shield > 0) {
      k.shield = 0;
      k.invuln = Math.max(k.invuln, 0.6);
      this.events.push({ t: 'shield', k: k.index });
      return 'blocked';
    }
    if ((how === 'ball' || how === 'seeker') && k.item === 'ball3' && k.itemCount > 0) {
      k.itemCount--;
      if (k.itemCount === 0) k.item = null;
      this.events.push({ t: 'pop', x: k.x, y: k.y + 1, z: k.z });
      return 'blocked';
    }
    k.stunWith(kind);
    this.events.push({ t: 'hit', k: k.index, by, how });
    return 'hit';
  }

  /** Where the orbiting balls of a Triple Balls holder are. */
  orbitOf(k: Kart): { x: number; z: number }[] {
    if (k.item !== 'ball3' || k.rollT > 0) return [];
    const out = [];
    for (let i = 0; i < k.itemCount; i++) {
      const a = this.time * 5 + (i * Math.PI * 2) / 3;
      out.push({ x: k.x + Math.cos(a) * ORBIT_RADIUS, z: k.z + Math.sin(a) * ORBIT_RADIUS });
    }
    return out;
  }

  private explode(x: number, y: number, z: number, by: number) {
    this.blasts.push({ id: this.id(), x, y, z, r: BLAST_RADIUS, age: 0 });
    this.events.push({ t: 'blast', x, y, z });
    for (const k of this.karts) {
      if (Math.hypot(k.x - x, k.z - z) < BLAST_RADIUS && Math.abs(k.y - y) < 8) this.hit(k, 'tumble', 'blast', by);
    }
    for (const d of this.drops) if (!d.dead && Math.hypot(d.x - x, d.z - z) < BLAST_RADIUS) d.dead = true;
    for (const p of this.projectiles) {
      if (!p.dead && p.kind !== 'plane' && Math.hypot(p.x - x, p.z - z) < BLAST_RADIUS) p.dead = true;
    }
  }

  private projectilesStep(dt: number) {
    const grid = this.track.grid;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.age += dt;
      if (p.kind === 'ball' || p.kind === 'seeker') {
        if (p.kind === 'seeker') this.steerSeeker(p, dt);
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        const g = grid.heightAt(p.x, p.z, this.track.voidY);
        if (g < p.y - 4) {
          // Ran off the edge.
          p.vy -= GRAVITY * dt;
          p.y += p.vy * dt;
          if (p.y < this.track.def.floorY - 10) p.dead = true;
        } else {
          p.y = lerp(p.y, g + 0.9, 0.5);
          p.vy = 0;
        }
        if (this.bounceProjectile(p)) {
          p.bounces++;
          if (p.kind === 'ball' && p.bounces > 5) p.dead = true;
          if (p.kind === 'seeker' && p.bounces > 12) p.dead = true;
        }
        p.h = headingOf(p.vx, p.vz);
        if (p.age > (p.kind === 'ball' ? 9 : 14)) p.dead = true;
        if (grid.surfaceAt(p.x, p.z) === SURF.water && p.y < g + 1.2) p.dead = true;
        this.projectileHits(p);
      } else if (p.kind === 'plane') {
        this.stepPlane(p, dt);
      } else if (p.kind === 'bomb') {
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.y += p.vy * dt;
        this.bounceProjectile(p);
        const g = grid.heightAt(p.x, p.z, this.track.voidY);
        if (p.y <= g + 0.8) {
          p.dead = true;
          if (grid.surfaceAt(p.x, p.z) === SURF.void || grid.surfaceAt(p.x, p.z) === SURF.water) continue;
          this.drops.push({ id: this.id(), kind: 'bomb', owner: p.owner, x: p.x, y: g, z: p.z, age: 0.5, fuse: 0.9, dead: false });
        } else {
          for (const k of this.karts) {
            if (k.index !== p.owner && Math.hypot(k.x - p.x, k.z - p.z) < 2.5 && Math.abs(k.y + 0.8 - p.y) < 2.5) {
              p.dead = true;
              this.explode(p.x, p.y, p.z, p.owner);
              break;
            }
          }
        }
      }
    }
    // Balls that meet destroy each other.
    const live = this.projectiles.filter((p) => !p.dead && (p.kind === 'ball' || p.kind === 'seeker'));
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        if (a.dead || b.dead) continue;
        if (Math.hypot(a.x - b.x, a.z - b.z) < BALL_RADIUS * 2.2) {
          a.dead = b.dead = true;
          this.events.push({ t: 'pop', x: (a.x + b.x) / 2, y: a.y, z: (a.z + b.z) / 2 });
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  /** Reflect a projectile off any collider it touches. True if it bounced. */
  private bounceProjectile(p: Projectile): boolean {
    let bounced = false;
    for (const c of this.track.query(p.x, p.z, BALL_RADIUS + 1, this.scratch)) {
      let cx: number, cz: number, r: number;
      if (c.t === 'seg') {
        const dx = c.bx - c.ax;
        const dz = c.bz - c.az;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? clamp(((p.x - c.ax) * dx + (p.z - c.az) * dz) / len2, 0, 1) : 0;
        cx = c.ax + dx * t;
        cz = c.az + dz * t;
        r = c.r;
      } else if (c.t === 'circle') {
        cx = c.x;
        cz = c.z;
        r = c.r;
      } else {
        const lx = (p.x - c.x) * c.c - (p.z - c.z) * c.s;
        const lz = (p.x - c.x) * c.s + (p.z - c.z) * c.c;
        const qx = clamp(lx, -c.hw, c.hw);
        const qz = clamp(lz, -c.hd, c.hd);
        cx = c.x + qx * c.c + qz * c.s;
        cz = c.z - qx * c.s + qz * c.c;
        r = 0;
        if (qx === lx && qz === lz) {
          p.dead = true;
          return true;
        }
      }
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      const min = r + BALL_RADIUS;
      if (d >= min || d < 1e-6) continue;
      const nx = dx / d;
      const nz = dz / d;
      p.x = cx + nx * min;
      p.z = cz + nz * min;
      const vn = p.vx * nx + p.vz * nz;
      if (vn < 0) {
        p.vx -= 2 * vn * nx;
        p.vz -= 2 * vn * nz;
        bounced = true;
      }
    }
    return bounced;
  }

  private steerSeeker(p: Projectile, dt: number) {
    const speed = 62;
    const target = p.target >= 0 ? this.karts[p.target] : null;
    let tx: number, tz: number;
    const s = this.track.grid.progressAt(p.x, p.z);
    if (target && !target.finished && target.respawnT === 0 && Math.hypot(target.x - p.x, target.z - p.z) < 26) {
      tx = target.x;
      tz = target.z;
    } else {
      const ahead = this.track.pointAt((Number.isNaN(s) ? this.karts[p.owner].s : s) + 9, 0);
      tx = ahead.x;
      tz = ahead.z;
    }
    const want = headingOf(tx - p.x, tz - p.z);
    const turn = clamp(wrapAngle(want - p.h), -6 * dt, 6 * dt);
    const h = p.h + turn;
    p.vx = fwdX(h) * speed;
    p.vz = fwdZ(h) * speed;
  }

  private stepPlane(p: Projectile, dt: number) {
    const owner = this.karts[p.owner];
    // The leader, or second place if the thrower is leading.
    const leaders = this.karts.filter((k) => !k.finished && k.respawnT === 0).sort((a, b) => a.place - b.place);
    const target = leaders.find((k) => k.index !== owner.index) ?? null;
    if (!target) {
      p.dead = true;
      return;
    }
    p.target = target.index;
    if (!p.diving) {
      p.dist += 88 * dt;
      const spot = this.track.pointAt(p.dist, 0);
      p.vx = (spot.x - p.x) / dt;
      p.vz = (spot.z - p.z) / dt;
      p.x = spot.x;
      p.z = spot.z;
      p.y = lerp(p.y, spot.y + 9, 0.1);
      p.h = spot.h;
      if (p.dist >= target.dist - 14) p.diving = 0.001;
      if (p.age > 20) p.dead = true;
    } else {
      p.diving += dt;
      const f = clamp(p.diving / 0.55, 0, 1);
      p.x = lerp(p.x, target.x, 0.25);
      p.z = lerp(p.z, target.z, 0.25);
      p.y = lerp(p.y, target.y + 0.5, f * 0.3);
      p.h = headingOf(target.x - p.px, target.z - p.pz);
      if (f >= 1) {
        p.dead = true;
        this.explode(target.x, target.y, target.z, p.owner);
      }
    }
  }

  private projectileHits(p: Projectile) {
    for (const k of this.karts) {
      if (k.index === p.owner && p.age < 0.35) continue;
      if (k.respawnT > 0) continue;
      const r = KART_RADIUS + BALL_RADIUS;
      if (Math.hypot(k.x - p.x, k.z - p.z) < r && Math.abs(k.y + 0.8 - p.y) < 2.4) {
        p.dead = true;
        if (this.hit(k, 'spin', p.kind === 'seeker' ? 'seeker' : 'ball', p.owner) !== 'immune') return;
        // Bounced off an untouchable kart.
        this.events.push({ t: 'pop', x: p.x, y: p.y, z: p.z });
        return;
      }
      for (const o of this.orbitOf(k)) {
        if (Math.hypot(o.x - p.x, o.z - p.z) < BALL_RADIUS * 2.2) {
          p.dead = true;
          k.itemCount--;
          if (k.itemCount === 0) k.item = null;
          this.events.push({ t: 'pop', x: o.x, y: k.y + 1, z: o.z });
          return;
        }
      }
    }
    for (const d of this.drops) {
      if (!d.dead && d.kind === 'bomb' && Math.hypot(d.x - p.x, d.z - p.z) < 2) {
        p.dead = d.dead = true;
        this.explode(d.x, d.y, d.z, d.owner);
        return;
      }
    }
  }

  private dropsStep(dt: number) {
    for (const d of this.drops) {
      if (d.dead) continue;
      d.age += dt;
      if (d.kind === 'oil') {
        if (d.age > 30) d.dead = true;
        for (const k of this.karts) {
          if (k.index === d.owner && d.age < 0.8) continue;
          if (!k.grounded || k.respawnT > 0) continue;
          if (Math.hypot(k.x - d.x, k.z - d.z) < OIL_RADIUS + KART_RADIUS * 0.6) {
            const res = this.hit(k, 'spin', 'oil', d.owner);
            if (res !== 'immune') d.dead = true;
            if (res === 'immune' && (k.star > 0 || k.rocket > 0)) d.dead = true;
            break;
          }
        }
      } else {
        d.fuse -= dt;
        let boom = d.fuse <= 0;
        for (const k of this.karts) {
          if (k.index === d.owner && d.age < 1) continue;
          if (Math.hypot(k.x - d.x, k.z - d.z) < 2.6) boom = true;
        }
        if (boom) {
          d.dead = true;
          this.explode(d.x, d.y, d.z, d.owner);
        }
      }
    }
    this.drops = this.drops.filter((d) => !d.dead);
  }

  private boxesStep(dt: number) {
    for (const b of this.boxes) {
      if (b.respawn > 0) {
        b.respawn = Math.max(0, b.respawn - dt);
        continue;
      }
      for (const k of this.karts) {
        if (k.respawnT > 0) continue;
        const dy = k.y + 0.8 - (b.y + 1.6);
        if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 < 2.6 * 2.6 && Math.abs(dy) < 3) {
          b.respawn = BOX_RESPAWN;
          this.events.push({ t: 'box', k: k.index, x: b.x, y: b.y + 1.6, z: b.z });
          if (this.itemMode !== 'off' && !k.item && k.rollT === 0 && !k.finished) {
            k.rollT = k.cpu ? ROLL_TIME : ROLL_TIME;
          }
          break;
        }
      }
    }
  }

  private hazardsStep() {
    for (const h of this.hazards) {
      for (const b of h.bodies) {
        if (!b.live) continue;
        for (const k of this.karts) {
          if (k.respawnT > 0) continue;
          const dx = k.x - b.x;
          const dz = k.z - b.z;
          const d = Math.hypot(dx, dz);
          const min = b.r + KART_RADIUS;
          if (d >= min) continue;
          if (h.def.kind === 'stomper') {
            this.hit(k, 'squash', 'squash', -1);
            continue;
          }
          // Shoved aside, and spun unless protected.
          const nx = dx / (d || 1);
          const nz = dz / (d || 1);
          k.x = b.x + nx * min;
          k.z = b.z + nz * min;
          const vn = k.vx * nx + k.vz * nz;
          if (vn < 0) {
            k.vx -= 1.6 * vn * nx;
            k.vz -= 1.6 * vn * nz;
          }
          k.vx += nx * 8;
          k.vz += nz * 8;
          if (k.rocket > 0 || k.star > 0) continue;
          this.hit(k, 'spin', 'hazard', -1);
        }
      }
    }
  }

  // ---------------------------------------------------------------- karts together

  private collideKarts() {
    const ks = this.karts;
    const R = KART_RADIUS * 1.9;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i];
      if (a.respawnT > 0) continue;
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        if (b.respawnT > 0) continue;
        if (Math.abs(a.y - b.y) > 2.2) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const ma = a.params.mass * (a.star > 0 || a.rocket > 0 ? 6 : 1);
        const mb = b.params.mass * (b.star > 0 || b.rocket > 0 ? 6 : 1);
        const overlap = R - d;
        a.x -= nx * overlap * (mb / (ma + mb));
        a.z -= nz * overlap * (mb / (ma + mb));
        b.x += nx * overlap * (ma / (ma + mb));
        b.z += nz * overlap * (ma / (ma + mb));
        const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel < 0) {
          const e = 0.6;
          const j2 = (-(1 + e) * rel) / (1 / ma + 1 / mb);
          a.vx -= (j2 / ma) * nx;
          a.vz -= (j2 / ma) * nz;
          b.vx += (j2 / mb) * nx;
          b.vz += (j2 / mb) * nz;
        }
        // A shove apart even at a crawl, so karts never lock together.
        const push = 3;
        a.vx -= nx * push * (mb / (ma + mb));
        a.vz -= nz * push * (mb / (ma + mb));
        b.vx += nx * push * (ma / (ma + mb));
        b.vz += nz * push * (ma / (ma + mb));
        const strength = Math.max(0, -rel);
        const aBig = a.star > 0 || a.rocket > 0;
        const bBig = b.star > 0 || b.rocket > 0;
        if (aBig && !bBig) this.hit(b, 'spin', a.rocket > 0 ? 'rocket' : 'star', a.index);
        else if (bBig && !aBig) this.hit(a, 'spin', b.rocket > 0 ? 'rocket' : 'star', b.index);
        else if (strength > 3 && a.bumpT === 0 && b.bumpT === 0) {
          a.bumpT = b.bumpT = 0.3;
          this.events.push({ t: 'bump', a: a.index, b: b.index, strength });
        }
      }
      // Orbiting balls hit whoever they touch.
      for (const o of this.orbitOf(a)) {
        for (const b of ks) {
          if (b === a || b.respawnT > 0) continue;
          if (Math.hypot(b.x - o.x, b.z - o.z) < KART_RADIUS + BALL_RADIUS) {
            if (this.hit(b, 'spin', 'orbit', a.index) !== 'immune') {
              a.itemCount--;
              if (a.itemCount === 0) a.item = null;
            }
            break;
          }
        }
      }
    }
  }

  /** Heading that keeps a rocket on the racing line. */
  private autopilotHeading(k: Kart): number {
    const ahead = this.track.pointAt(k.s + 12 + k.planarSpeed * 0.25, 0);
    const smp = this.track.sampleAt(ahead.s);
    const off = this.track.paths[0].line[Math.round(ahead.s) % this.track.paths[0].line.length] ?? 0;
    const x = ahead.x + -Math.cos(smp.h) * off;
    const z = ahead.z + Math.sin(smp.h) * off;
    return headingOf(x - k.x, z - k.z);
  }

  /**
   * Computers near the humans race them; computers far ahead ease off and
   * computers far behind find a little extra, so the pack stays together.
   */
  private rubberBand() {
    const humans = this.karts.filter((k) => !k.cpu);
    for (const k of this.karts) {
      if (!k.cpu) {
        k.speedMul = 1;
        continue;
      }
      const ai = this.ai[k.index]!;
      let mul = ai.skill.speed;
      if (humans.length) {
        const best = Math.max(...humans.map((h) => h.dist));
        const worst = Math.min(...humans.map((h) => h.dist));
        if (k.dist > best) mul *= 1 - clamp((k.dist - best) / 220, 0, 1) * ai.skill.bandDown;
        else if (k.dist < worst) mul *= 1 + clamp((worst - k.dist) / 160, 0, 1) * ai.skill.bandUp;
      }
      k.speedMul = mul;
    }
  }

  private checkEnd() {
    if (this.over) return;
    const humans = this.humans;
    const allHumansDone = humans.length > 0 && humans.every((k) => k.finished);
    const everyoneDone = this.karts.every((k) => k.finished);
    if (this.endAt === null && (allHumansDone || everyoneDone)) this.endAt = this.time + END_DELAY;
    if (this.endAt === null && this.firstHumanFinish !== null && this.time > this.firstHumanFinish + FINISH_GRACE) this.endAt = this.time;
    // A race with nobody finishing (everyone driving backwards, a computer-only test) is called eventually.
    if (this.endAt === null && this.time > 60 * 8) this.endAt = this.time;
    if (this.endAt !== null && this.time >= this.endAt) {
      this.over = true;
      this.rank();
    }
  }

  /** Seconds left before an unfinished race is called, if a countdown is running. */
  get closingIn(): number | null {
    if (this.over || this.firstHumanFinish === null) return null;
    if (this.humans.every((k) => k.finished)) return null;
    return Math.max(0, this.firstHumanFinish + FINISH_GRACE - this.time);
  }
}

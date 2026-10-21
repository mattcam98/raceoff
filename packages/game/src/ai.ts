/**
 * Computer drivers. Each follows the racing line with a lane offset of its
 * own that wanders, eases off for corners it cannot take flat, drifts the long
 * bends, steers around danger and toward item boxes, takes shortcuts when it
 * fancies them, and uses items the way a person would: at someone, not at
 * random.
 */
import type { ItemId } from '@raceoff/shared';
import { hazardAt } from './hazards';
import { GIANT_BLAST_RADIUS, OIL_RADIUS } from './items';
import { DRIFT_LEVELS, DRIFT_TURN, KART_RADIUS, NO_INPUT, type Kart, type KartInput } from './kart';
import { clamp, damp, fwdX, fwdZ, headingOf, rightX, rightZ, wrapAngle, type Rng } from './math';
import type { Race } from './race';
import type { TrackPath } from './track/build';
import { SURF } from './track/types';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Skill {
  /** Top-speed multiplier. */
  speed: number;
  /** How much faster than its own safe corner speed it dares to go. */
  bravery: number;
  /** Random steering wobble. */
  wobble: number;
  /** Chance of drifting a corner it could drift, and the spark level it holds for. */
  drift: number;
  driftLevel: number;
  /** Seconds to react before using a fresh item. */
  react: number;
  /** Chance of a good start. */
  start: number;
  /** Rubber-band strength, down when ahead and up when behind. */
  bandDown: number;
  bandUp: number;
  /** How well it spots and avoids danger ahead. */
  awareness: number;
}

export const SKILLS: Record<Difficulty, Skill> = {
  easy: { speed: 0.84, bravery: 0.92, wobble: 0.16, drift: 0.25, driftLevel: 1, react: 1.6, start: 0.15, bandDown: 0.18, bandUp: 0.08, awareness: 0.35 },
  normal: { speed: 0.93, bravery: 1.0, wobble: 0.08, drift: 0.65, driftLevel: 2, react: 0.9, start: 0.45, bandDown: 0.13, bandUp: 0.12, awareness: 0.7 },
  hard: { speed: 0.995, bravery: 1.06, wobble: 0.03, drift: 0.95, driftLevel: 2, react: 0.45, start: 0.75, bandDown: 0.08, bandUp: 0.16, awareness: 0.95 },
};

export class AiDriver {
  readonly skill: Skill;
  private path: TrackPath;
  private idx = 0;
  /** Lane: an offset from the racing line, wandering slowly. */
  private lane = 0;
  private laneGoal = 0;
  private laneTimer = 0;
  private dodge = 0;
  private stuckT = 0;
  private reverseT = 0;
  private reverseSteer = 0;
  private wobblePhase: number;
  /** Shortcuts already decided for this lap, by path index. */
  private decided = new Map<number, boolean>();
  private itemDelay = 0;
  private driftHold = 0;
  /** How long a drift has been turning the kart further than it wants to go. */
  private overT = 0;
  /** Heading for a shortcut's entrance: no drifting, the lane is set by the entrance. */
  private liningUp = false;
  private sightT = 0;
  private lastLap = -1;
  private personality: number;

  constructor(
    private race: Race,
    private kart: Kart,
    difficulty: Difficulty,
    private rand: Rng,
  ) {
    this.skill = SKILLS[difficulty];
    this.path = race.track.paths[0];
    this.wobblePhase = rand() * 100;
    this.personality = rand();
    this.idx = this.nearestIndex(this.path, 0, true);
  }

  /** When this computer pressed for a start boost, or NaN for not at all. */
  startTiming(): number {
    if (this.rand() < this.skill.start) return -0.3 + this.rand() * 0.25;
    return this.rand() < 0.15 ? -1 : NaN;
  }

  /**
   * Where along its road the kart is. On the main road the progress painted on
   * the ground says exactly, so only a few metres either side are searched: a
   * wider search could latch onto the other leg of a hairpin. Whichever road
   * the kart is physically on wins, so a kart knocked onto or off a shortcut
   * follows the road it is on.
   */
  private locate() {
    const race = this.race;
    const k = this.kart;
    const ci = race.track.grid.index(k.x, k.z);
    const on = ci >= 0 ? race.track.grid.path[ci] : -1;
    const main = race.track.paths[0];
    // Where a shortcut leaves, its road overlaps the main road: only count it once the kart is clear of the main road.
    const ms = race.track.sampleAt(k.s);
    const offMain = Math.abs((k.x - ms.x) * rightX(ms.h) + (k.z - ms.z) * rightZ(ms.h)) > ms.w / 2 + 1 || Math.hypot(k.x - ms.x, k.z - ms.z) > ms.w;
    if (on > 0 && on !== this.path.index && offMain) {
      this.path = race.track.paths[on];
      this.idx = this.nearestIndex(this.path, 0, true);
    }
    if (this.path.index === 0) {
      this.idx = this.nearestIndex(main, Math.round(k.s / (race.track.length / main.samples.length)), 6);
      return;
    }
    this.idx = this.nearestIndex(this.path, this.idx, 10);
    const s = this.path.samples[this.idx];
    const away = Math.hypot(s.x - k.x, s.z - k.z) > s.w / 2 + 8;
    if (this.idx >= this.path.samples.length - 3 || (away && on === 0)) {
      this.path = main;
      this.idx = this.nearestIndex(main, Math.round(k.s / (race.track.length / main.samples.length)), 6);
    }
  }

  private nearestIndex(p: TrackPath, around: number, window: number | true): number {
    const S = p.samples;
    const k = this.kart;
    let best = Infinity;
    let bi = around;
    const full = window === true;
    const span = full ? S.length : window;
    for (let o = -span; o <= span; o++) {
      let i = around + o;
      if (p.closed) i = ((i % S.length) + S.length) % S.length;
      else if (i < 0 || i >= S.length) continue;
      const d = (S[i].x - k.x) ** 2 + (S[i].z - k.z) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
      if (full && o > S.length / 2) break;
    }
    return bi;
  }

  private sample(i: number) {
    const S = this.path.samples;
    if (this.path.closed) return S[((i % S.length) + S.length) % S.length];
    return S[clamp(i, 0, S.length - 1)];
  }

  private lineAt(i: number) {
    const L = this.path.line;
    if (this.path.closed) return L[((i % L.length) + L.length) % L.length];
    return L[clamp(i, 0, L.length - 1)];
  }

  private curvatureAt(i: number) {
    const K = this.path.lineK;
    if (this.path.closed) return K[((i % K.length) + K.length) % K.length];
    return K[clamp(i, 0, K.length - 1)];
  }

  decide(dt: number): KartInput {
    const race = this.race;
    const k = this.kart;
    if (!race.racing && race.time < 0) return { ...NO_INPUT, gas: true };
    if (k.stunned) return NO_INPUT;

    this.choosePath();
    this.locate();

    const speed = Math.max(0, k.speed);
    const here = this.sample(this.idx);

    // Wander between lanes now and then, so the field spreads out.
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2 + this.rand() * 4;
      this.laneGoal = (this.rand() * 2 - 1) * Math.max(0, here.w / 2 - 4) * 0.55;
    }
    this.lane = damp(this.lane, this.laneGoal, this.liningUp ? 4 : 0.8, dt);
    this.dodge = damp(this.dodge, this.avoid(), 4, dt);

    // Aim at a point ahead on the line.
    const look = Math.round(6 + speed * 0.42);
    const t = this.sample(this.idx + look);
    const halfRoom = Math.max(0, t.w / 2 - KART_RADIUS - 1.2);
    let off = clamp(this.lineAt(this.idx + look) + this.lane + this.dodge, -halfRoom, halfRoom);
    let tx = t.x + rightX(t.h) * off;
    let tz = t.z + rightZ(t.h) * off;
    // Never aim at water or a drop: fall back to the racing line itself.
    const under = race.track.grid.surfaceAt((tx + k.x) / 2, (tz + k.z) / 2);
    const there = race.track.grid.surfaceAt(tx, tz);
    if (under === SURF.water || under === SURF.void || there === SURF.water || there === SURF.void) {
      off = clamp(this.lineAt(this.idx + look), -halfRoom, halfRoom);
      tx = t.x + rightX(t.h) * off;
      tz = t.z + rightZ(t.h) * off;
      this.laneGoal *= 0.3;
    }
    if (this.path.index !== 0) {
      this.sightT -= dt;
      if (this.sightT <= 0) {
        this.sightT = 0.25;
        if (race.track.blocked(k.x, k.z, tx, tz, 1.0)) {
          // A wall between us and the shortcut: we missed the way in. Back to the main road.
          this.path = race.track.paths[0];
          this.locate();
          const t2 = this.sample(this.idx + look);
          off = clamp(this.lineAt(this.idx + look), -halfRoom, halfRoom);
          tx = t2.x + rightX(t2.h) * off;
          tz = t2.z + rightZ(t2.h) * off;
        }
      }
    }
    const aim = headingOf(tx - k.x, tz - k.z);
    const err = wrapAngle(aim - k.h);
    this.wobblePhase += dt * 1.7;
    const wobble = Math.sin(this.wobblePhase) * Math.sin(this.wobblePhase * 0.37) * this.skill.wobble;
    let steer = clamp(-err * 2.6 + wobble, -1, 1);

    // Corner speed: the turn rate this kart has over the bend ahead.
    let kAhead = 0;
    for (let j = 0; j < Math.max(8, speed * 0.6); j += 2) kAhead = Math.max(kAhead, this.curvatureAt(this.idx + j));
    // A drift can turn a little tighter than full lock (DRIFT_TURN.tight), and keeps its speed doing it.
    const turn = k.params.turn * 0.92 * (k.driftDir ? DRIFT_TURN.tight : 1);
    const corner = kAhead > 1e-4 ? (turn / kAhead) * this.skill.bravery * (race.track.def.aiCornerGrip ?? 1) : Infinity;
    let gas = true;
    let brake = false;
    if (speed > corner * 1.06) gas = false;
    if (speed > corner * 1.32 && speed > 14) brake = true;
    // Pointing well away from where it wants to go: slow down to come round.
    if (Math.abs(err) > 1.1 && speed > 12) gas = false;
    // Moving hazards ahead: where will they be when we get there? Ease off and let them pass.
    if (this.rand() < this.skill.awareness + 0.2 && this.hazardAhead(speed)) {
      gas = false;
      if (speed > 14) brake = true;
    }

    // Drift long, tight bends.
    let drift = false;
    const signed = this.sample(this.idx + 10).k;
    const bendDir = Math.sign(signed);
    const want = clamp(-err * 2.6, -1, 1);
    if (k.driftDir) {
      // Hold until the bend opens out, ideally having reached the spark level it was going for.
      this.driftHold += dt;
      const level = k.driftLevel;
      const opening = Math.abs(this.sample(this.idx + 6).k) < 0.012;
      const wrongWay = bendDir !== 0 && bendDir !== k.driftDir && Math.abs(signed) > 0.02;
      // A drift always turns into the bend: turned in too far, the only way to straighten is to let go.
      this.overT = want * k.driftDir < -0.35 ? this.overT + dt : 0;
      drift = !(opening && (level >= this.skill.driftLevel || this.driftHold > 1.6)) && !wrongWay && this.driftHold < 3.5 && this.overT < 0.12;
      if (k.driftCharge > DRIFT_LEVELS[Math.min(2, this.skill.driftLevel)] + 0.1 && opening) drift = false;
      // In a drift the steering trims the line: into the drift tightens it.
      steer = clamp(-err * 3, -1, 1);
    } else {
      this.driftHold = 0;
      const bendLength = this.bendLength(bendDir);
      if (!this.liningUp && speed > 17 && Math.abs(signed) > 0.03 && bendLength > 22 && want * bendDir > 0.15 && this.rand() < this.skill.drift * dt * 6 && k.grounded) {
        drift = true;
        steer = bendDir * Math.max(0.4, want * bendDir);
      }
    }
    if (k.hopping) {
      // The hop picks the drift's direction: lean into the bend, but only as far as the line wants.
      drift = true;
      steer = bendDir ? bendDir * Math.max(0.35, Math.min(1, want * bendDir)) : Math.sign(want);
    }

    // Stuck against something: back out.
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      return { steer: this.reverseSteer, gas: false, brake: true, drift: false, back: false, item: false };
    }
    if (race.racing && speed < 2.5 && !k.stun) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 1.0) {
      this.stuckT = 0;
      if (this.path.index !== 0 && race.track.grid.path[race.track.grid.index(k.x, k.z)] === 0) this.path = race.track.paths[0];
      // Backing up turns the other way, so steer toward the target to swing the nose round to it.
      this.reverseT = 0.6 + Math.min(0.8, Math.abs(err) * 0.45);
      this.reverseSteer = Math.sign(err || 1);
    }

    const { item, back } = this.thinkItem(dt);
    return { steer, gas: gas || speed < 8, brake, drift, back, item };
  }

  /** Will a moving hazard be in our way when we reach it? */
  private hazardAhead(speed: number): boolean {
    const race = this.race;
    const k = this.kart;
    const fx = fwdX(k.h);
    const fz = fwdZ(k.h);
    for (const h of race.hazards) {
      if (h.def.kind === 'stomper') {
        const b = h.bodies[0];
        const ahead = (b.x - k.x) * fx + (b.z - k.z) * fz;
        const side = Math.abs((b.x - k.x) * rightX(k.h) + (b.z - k.z) * rightZ(k.h));
        if (ahead > 0 && ahead < 30 && side < b.r + 3) {
          // Slams due while we would be underneath it.
          const eta = ahead / Math.max(speed, 5);
          const future = hazardAt(h.def, race.time + eta);
          if (future.drop > 0.5 || future.warning) return true;
        }
        continue;
      }
    }
    return false;
  }

  /** How many metres the bend ahead keeps turning the same way. */
  private bendLength(dir: number) {
    if (!dir) return 0;
    let n = 0;
    for (let j = 4; j < 60; j += 2) {
      const k = this.sample(this.idx + j).k;
      if (Math.sign(k) !== dir || Math.abs(k) < 0.01) break;
      n += 2;
    }
    return n;
  }

  /** Decide on shortcuts as they come up. */
  private choosePath() {
    const race = this.race;
    this.liningUp = false;
    if (this.path.index !== 0) return;
    const k = this.kart;
    if (k.lapIndex !== this.lastLap) {
      this.lastLap = k.lapIndex;
      this.decided.clear();
    }
    const L = race.track.length;
    for (const p of race.track.paths) {
      if (p.index === 0) continue;
      let d = p.sFrom - k.s;
      if (d < -L / 2) d += L;
      if (d > L / 2) d -= L;
      if (d > 26 || d < -4) continue;
      const def = race.track.def.shortcuts![p.index - 1];
      if (!this.decided.has(p.index)) {
        const boosted = k.boost > 0.5 || k.star > 0 || k.item === 'nitro' || k.item === 'nitro3' || k.item === 'sugar';
        const ok = def.needsBoost ? boosted : true;
        this.decided.set(p.index, ok && this.rand() < def.aiChance * (0.6 + this.personality * 0.6));
      }
      if (!this.decided.get(p.index)) continue;
      // Line up with the entrance on the way to it.
      const entry = p.samples[Math.min(8, p.samples.length - 1)];
      const here = race.track.sampleAt(k.s);
      this.laneGoal = clamp((entry.x - here.x) * rightX(here.h) + (entry.z - here.z) * rightZ(here.h), -here.w / 2 + 3, here.w / 2 - 3);
      this.liningUp = true;
      if (d < 12) {
        // Only turn in if the way in is clear: once past the entrance, the shortcut's walls are in the way.
        const idx = this.nearestIndex(p, 0, 24);
        const ahead = p.samples[Math.min(idx + 8, p.samples.length - 1)];
        if (idx < 16 && !race.track.blocked(k.x, k.z, ahead.x, ahead.z, 1.2)) {
          this.path = p;
          this.idx = idx;
        } else {
          this.decided.set(p.index, false);
        }
        return;
      }
    }
  }

  /** A lateral nudge away from danger ahead and toward a box when empty-handed. */
  private avoid(): number {
    const race = this.race;
    const k = this.kart;
    const fx = fwdX(k.h);
    const fz = fwdZ(k.h);
    const rx = rightX(k.h);
    const rz = rightZ(k.h);
    let push = 0;
    const consider = (x: number, z: number, r: number, weight: number) => {
      const dx = x - k.x;
      const dz = z - k.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 2 || ahead > 26) return;
      const side = dx * rx + dz * rz;
      const clear = r + KART_RADIUS + 1.6;
      if (Math.abs(side) > clear) return;
      // Steer to whichever side is nearer to clear, harder the closer it is.
      const amount = (clear - Math.abs(side)) * (1 - ahead / 30) * weight;
      push += side > 0 ? -amount : amount;
    };
    if (this.rand() < this.skill.awareness || this.dodge !== 0) {
      for (const d of race.drops) consider(d.x, d.z, d.kind === 'bomb' ? 1.5 : OIL_RADIUS, 1.6);
      // A giant's target ring: steer out of where it will land.
      for (const g of race.giants) consider(g.x, g.z, g.kind === 'bomb' ? GIANT_BLAST_RADIUS * 0.8 : OIL_RADIUS, 1.5);
      // Steer for where a moving hazard will be when we get there, not where it is now.
      const speed = Math.max(8, k.speed);
      for (const h of race.hazards) {
        if (h.def.kind === 'stomper') {
          for (const b of h.bodies) consider(b.x, b.z, b.r, 1.2);
          continue;
        }
        for (const b of h.bodies) {
          const eta = Math.max(0, (b.x - k.x) * fx + (b.z - k.z) * fz) / speed;
          const f = hazardAt(h.def, race.time + eta).bodies;
          for (const fb of f) consider(fb.x, fb.z, fb.r, 1.4);
        }
      }
      for (const p of race.projectiles) if (p.kind === 'ball' && p.owner !== k.index) consider(p.x, p.z, 1, 0.8);
      for (const o of race.karts) if (o !== k && o.planarSpeed < k.planarSpeed - 4) consider(o.x, o.z, KART_RADIUS, 0.6);
    }
    if (push === 0 && !k.item && k.rollT === 0) {
      // Head for the nearest box ahead.
      let best = Infinity;
      for (const b of race.boxes) {
        if (b.respawn > 0) continue;
        const dx = b.x - k.x;
        const dz = b.z - k.z;
        const ahead = dx * fx + dz * fz;
        if (ahead < 6 || ahead > 34) continue;
        const side = dx * rx + dz * rz;
        if (Math.abs(side) < Math.abs(best)) best = side;
      }
      if (Number.isFinite(best)) push = clamp(best - this.lane, -6, 6) * 0.8;
    }
    return clamp(push, -8, 8);
  }

  // ---------------------------------------------------------------- items

  private thinkItem(dt: number): { item: boolean; back: boolean } {
    const k = this.kart;
    const race = this.race;
    const item = k.item;
    if (!item || k.rollT > 0) {
      this.itemDelay = this.skill.react * (0.6 + this.rand() * 0.8);
      return { item: false, back: false };
    }
    if (this.itemDelay > 0) {
      this.itemDelay -= dt;
      return { item: false, back: false };
    }
    const use = (back = false) => {
      this.itemDelay = 0.35 + this.rand() * 0.4;
      return { item: true, back };
    };
    const held = k.heldT;
    const ahead = this.target(28, 0.16);
    const behind = this.behind(16);
    const straight = this.straightAhead();
    const threatened = race.projectiles.some(
      (p) => p.owner !== k.index && (p.target === k.index || (p.kind === 'ball' && Math.hypot(p.x - k.x, p.z - k.z) < 22)),
    );
    switch (item as ItemId) {
      case 'ball':
      case 'ball3':
        if (ahead) return use(false);
        if (behind && behind < 10) return use(true);
        if (held > 9) return use(false);
        break;
      case 'seeker':
        if (k.place > 1 || held > 5) return use(false);
        break;
      case 'bomb':
        if (this.target(34, 0.3)) return use(false);
        if (behind && behind < 9) return use(true);
        if (held > 8) return use(false);
        break;
      case 'oil':
        if (behind && behind < 14) return use(true);
        if (held > 7 + this.personality * 6) return use(true);
        break;
      case 'plane':
        if (k.place > 1 || held > 4) return use(false);
        break;
      case 'shield':
        if (threatened || held > 6 + this.personality * 8) return use(false);
        break;
      case 'nitro':
      case 'nitro3':
        if (this.path.index !== 0 && race.track.def.shortcuts![this.path.index - 1].needsBoost) return use(false);
        if (straight || held > 6 || k.surface === SURF.rough) return use(false);
        break;
      case 'sugar':
      case 'rocket':
        return use(false);
    }
    return { item: false, back: false };
  }

  /** Distance to a kart in a cone ahead, or 0. */
  private target(range: number, cone: number): number {
    const k = this.kart;
    let best = 0;
    for (const o of this.race.karts) {
      if (o === k || o.respawnT > 0 || o.finished) continue;
      const dx = o.x - k.x;
      const dz = o.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 3) continue;
      const a = Math.abs(wrapAngle(headingOf(dx, dz) - k.h));
      if (a < cone + 2 / d && (!best || d < best)) best = d;
    }
    return best;
  }

  private behind(range: number): number {
    const k = this.kart;
    let best = 0;
    for (const o of this.race.karts) {
      if (o === k || o.respawnT > 0) continue;
      const dx = o.x - k.x;
      const dz = o.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const a = Math.abs(wrapAngle(headingOf(dx, dz) - k.h));
      if (a > Math.PI * 0.75 && (!best || d < best)) best = d;
    }
    return best;
  }

  private straightAhead() {
    for (let j = 0; j < 50; j += 4) if (this.curvatureAt(this.idx + j) > 0.012) return false;
    return true;
  }
}


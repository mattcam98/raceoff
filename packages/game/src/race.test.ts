import { BODIES, CHARACTERS, TRACKS } from '@raceoff/shared';
import { describe, expect, it } from 'vitest';
import { drawItem, GIANT_BLAST_RADIUS, GIANT_PROTECT, itemRank } from './items';
import { hazardAt } from './hazards';
import { collideStatic, DRIFT_LEVELS, Kart, KART_RADIUS, kartParams, NO_INPUT, STEP, stepKart, type KartInput } from './kart';
import { rightX, rightZ, rng, wrapAngle } from './math';
import { Race, type RacerSpec } from './race';
import { colliderDistance, type Collider } from './track/build';
import { SURF } from './track/types';
import { getTrack } from './tracks';

const cpus = (n = 8): RacerSpec[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `cpu:${i}`, name: CHARACTERS[i].name, character: CHARACTERS[i].id, body: BODIES[i % BODIES.length].id, cpu: true, slot: -1,
  }));

describe('tracks', () => {
  for (const t of TRACKS) {
    describe(t.name, () => {
      const track = getTrack(t.id);

      it('has a lap of a sensible length', () => {
        // Three laps should take a good computer roughly 1:45 to 2:30 at 100cc.
        expect(track.length).toBeGreaterThan(950);
        expect(track.length).toBeLessThan(1350);
      });

      it('puts every grid slot and item box on the road', () => {
        for (let i = 0; i < 8; i++) {
          const s = track.slot(i);
          expect(track.grid.surfaceAt(s.x, s.z), `slot ${i}`).toBe(SURF.road);
        }
        // Shortcut boxes may sit on sand or paper; never in water or over a drop.
        for (const b of track.boxes) expect([SURF.void, SURF.water]).not.toContain(track.grid.surfaceAt(b.x, b.z));
      });

      it('keeps walls and props off the racing line', () => {
        const scratch: Collider[] = [];
        for (const p of track.paths) {
          p.samples.forEach((s, i) => {
            const x = s.x + rightX(s.h) * p.line[i];
            const z = s.z + rightZ(s.h) * p.line[i];
            for (const c of track.query(x, z, 4, scratch)) {
              expect(colliderDistance(c, x, z), `${t.id} path ${p.index} sample ${i}`).toBeGreaterThan(KART_RADIUS);
            }
          });
        }
      });

      it('paints progress along the whole lap with no seams', () => {
        const S = track.paths[0].samples;
        for (let i = 1; i < S.length; i++) {
          const a = track.grid.progressAt(S[i - 1].x, S[i - 1].z);
          const b = track.grid.progressAt(S[i].x, S[i].z);
          let d = b - a;
          if (d < -track.length / 2) d += track.length;
          // Where a shortcut forks off, its progress meets the main road's with a small step: the race allows 14.
          expect(Math.abs(d), `sample ${i}`).toBeLessThan(8);
        }
      });
    });
  }
});

describe('computer races', () => {
  for (const t of TRACKS) {
    it(`everyone finishes three laps of ${t.name}`, () => {
      for (const seed of [11, 12]) {
        const race = new Race({ track: getTrack(t.id), racers: cpus(), laps: 3, cc: 100, items: 'normal', difficulty: 'normal', seed });
        let outside = 0;
        while (!race.over && race.time < 300) {
          race.step([]);
          race.events.length = 0;
          for (const k of race.karts) {
            const c = race.track.grid.index(k.x, k.z);
            if (c >= 0 && race.track.grid.outside[c] && k.respawnT === 0) outside++;
          }
        }
        expect(race.karts.every((k) => k.finished), `${t.id} seed ${seed}`).toBe(true);
        // A kart can be shoved behind a wall for a moment, never for long.
        expect(outside / 60, `${t.id} seconds behind walls`).toBeLessThan(3);
        const winner = Math.min(...race.karts.map((k) => k.finishTime!));
        const last = Math.max(...race.karts.map((k) => k.finishTime!));
        expect(winner).toBeLessThan(160);
        expect(last - winner, `${t.id} spread`).toBeLessThan(60);
      }
    });
  }
});

describe('laps', () => {
  it('counts a lap only when the line is crossed going forwards', () => {
    const track = getTrack('breakfast');
    const race = new Race({ track, racers: cpus(1).map((r) => ({ ...r, cpu: false, slot: 0 })), laps: 2, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
    while (race.time < 0) race.step([NO_INPUT]);
    const k = race.karts[0];
    // Carry the kart round the lap by hand, a metre at a time.
    const drive = (from: number, to: number, step: number) => {
      for (let s = from; step > 0 ? s < to : s > to; s += step) {
        const p = track.pointAt(s, 0);
        k.x = p.x;
        k.z = p.z;
        k.y = p.y;
        k.h = p.h;
        k.vx = k.vz = 0;
        race.step([NO_INPUT]);
      }
    };
    expect(race.lapOf(k)).toBe(1);
    drive(k.s - track.length, 5, 1);
    expect(k.lapIndex).toBe(0);
    drive(5, -10, -1);
    drive(-10, 5, 1);
    // Back over the line and forward again is still lap 1.
    expect(k.lapIndex).toBe(0);
    drive(5, track.length + 5, 1);
    expect(k.lapIndex).toBe(1);
    expect(k.lapTimes).toHaveLength(1);
    drive(track.length + 5, track.length * 2 + 5, 1);
    expect(k.finished).toBe(true);
    expect(k.place).toBe(1);
  });
});

describe('items', () => {
  it('never hands the leader the catch-up items', () => {
    const r = rng(5);
    for (let i = 0; i < 2000; i++) {
      const item = drawItem(itemRank(1, 8, 0, 800), 'normal', r, false);
      expect(['plane', 'rocket', 'sugar', 'nitro3', 'seeker', 'bomb']).not.toContain(item);
    }
  });

  it('gives a kart far behind the big items and no oil', () => {
    const r = rng(6);
    const got = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const item = drawItem(itemRank(8, 8, 400, 800), 'normal', r, false);
      got.add(item);
      expect(item).not.toBe('oil');
    }
    for (const big of ['rocket', 'sugar', 'plane', 'nitro3']) expect(got.has(big)).toBe(true);
  });

  it('ranks by the gap to the leader more than by place', () => {
    // Last, but in a tight pack: not treated as far behind.
    expect(itemRank(8, 8, 10, 800)).toBeLessThan(0.4);
    // Second, but a long way back: treated as well behind.
    expect(itemRank(2, 8, 200, 800)).toBeGreaterThan(0.55);
    expect(itemRank(1, 8, 0, 800)).toBe(0);
    expect(itemRank(8, 8, 1000, 800)).toBe(1);
  });

  it('allows only one paper jet in the air', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) expect(drawItem(1, 'frantic', r, true)).not.toBe('plane');
  });
});

describe('driving', () => {
  it('turns a held drift into a boost when let go', () => {
    const track = getTrack('breakfast');
    const race = new Race({ track, racers: cpus(1).map((r) => ({ ...r, cpu: false, slot: 0 })), laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
    while (race.time < 0) race.step([NO_INPUT]);
    const k = race.karts[0];
    for (let i = 0; i < 90; i++) race.step([{ ...NO_INPUT, gas: true }]);
    for (let i = 0; i < 100; i++) race.step([{ ...NO_INPUT, gas: true, drift: true, steer: 1 }]);
    expect(k.driftDir).toBe(1);
    expect(k.driftLevel).toBeGreaterThanOrEqual(1);
    race.step([{ ...NO_INPUT, gas: true }]);
    expect(k.boost).toBeGreaterThan(0);
  });

  it('launches off a ramp and lands beyond the gap', () => {
    const track = getTrack('garage');
    const ramp = track.ramps.find((r) => r.gap > 0)!;
    const race = new Race({ track, racers: cpus(1).map((r) => ({ ...r, cpu: false, slot: 0 })), laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
    while (race.time < 0) race.step([NO_INPUT]);
    const k = race.karts[0];
    const p = track.pointAt(ramp.s0 - 30, 0);
    k.place3(p.x, p.y, p.z, p.h);
    k.s = p.s;
    k.dist = p.s;
    let flew = 0;
    let fell = false;
    for (let i = 0; i < 180; i++) {
      race.step([{ ...NO_INPUT, gas: true }]);
      if (!k.grounded) flew += STEP;
      if (race.events.some((e) => e.t === 'fall')) fell = true;
      race.events.length = 0;
    }
    expect(fell).toBe(false);
    expect(flew).toBeGreaterThan(0.4);
  });
});

describe('falls', () => {
  // A fall puts the kart back where it went off; its distance has to go back with it, or laps, the finish and
  // places all count from where it fell.
  it('never counts a lap or the finish before the line, however often karts fall', () => {
    const wrap = (d: number, L: number) => {
      d = ((d % L) + L) % L;
      return d > L / 2 ? d - L : d;
    };
    let falls = 0;
    // Falls are rare by design, so race seeds until a few have happened rather than counting on particular ones.
    for (let seed = 2; seed < 14 && falls < 3; seed++) {
      const track = getTrack('bath');
      const race = new Race({ track, racers: cpus(), laps: 3, cc: 150, items: 'normal', difficulty: 'hard', seed });
      while (!race.over && race.time < 400) {
        race.step([]);
        for (const e of race.events) {
          if (e.t === 'respawn') falls++;
          if (e.t === 'lap' || e.t === 'finish') expect(wrap(race.karts[e.k].s, track.length), `${e.t} of kart ${e.k}`).toBeGreaterThan(-3);
        }
        race.events = [];
        for (const k of race.karts) expect(Math.abs(wrap(k.dist - k.s, track.length))).toBeLessThan(15);
      }
    }
    expect(falls).toBeGreaterThan(0);
  });
});

describe('drifting', () => {
  // An endless flat road, so only the driving is measured.
  const flat = {
    grid: { surfaceAt: () => SURF.road, heightAt: () => 0 },
    voidY: -50,
    def: { floorY: 0 },
    query: (_x: number, _z: number, _r: number, out: Collider[]) => ((out.length = 0), out),
  } as unknown as Parameters<typeof stepKart>[1];
  const events = { wall() {}, boost() {}, land() {}, drift() {}, fall() {} };

  /** Up to speed, then hop into a drift to the right and hold it with `steer`. Returns speeds and the turn rate. */
  function drift(steer: number) {
    const k = new Kart(0, 'p', CHARACTERS[0].id, BODIES[0].id, false, 1);
    k.place3(0, 0, 0, 0);
    for (let i = 0; i < 300; i++) ((k.input = { ...NO_INPUT, gas: true }), stepKart(k, flat, STEP, events, null));
    const top = k.planarSpeed;
    let low = top;
    let travel0 = 0;
    for (let i = 0; i < 150; i++) {
      k.input = { ...NO_INPUT, gas: true, drift: true, steer: i < 9 ? 0.6 : steer };
      stepKart(k, flat, STEP, events, null);
      low = Math.min(low, k.planarSpeed);
      if (i === 89) travel0 = Math.atan2(k.vx, k.vz);
    }
    // Degrees a second the direction of travel turns, once the drift has settled.
    const turned = Math.abs(((Math.atan2(k.vx, k.vz) - travel0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    // The arc's radius in metres: the size of bend this drift follows.
    const radius = k.planarSpeed / (turned / (60 * STEP));
    return { top, low, held: k.planarSpeed, rate: (turned * 180) / Math.PI, radius, dir: k.driftDir, yaw: k.driftYaw };
  }

  it('keeps its speed: a drift is not a brake', () => {
    for (const steer of [-1, 0, 1]) {
      const d = drift(steer);
      expect(d.dir).toBe(1);
      expect(d.low / d.top, `steer ${steer}`).toBeGreaterThan(0.95);
      expect(d.held / d.top, `steer ${steer}`).toBeLessThanOrEqual(1.01);
    }
  });

  it('turns progressively: steering out widens the arc, into it tightens it well past full lock', () => {
    const out = drift(-1);
    const hands = drift(0);
    const light = drift(0.3);
    const into = drift(1);
    expect(out.rate).toBeLessThan(hands.rate);
    expect(hands.rate).toBeLessThan(light.rate);
    expect(light.rate).toBeLessThan(into.rate);
    // The arcs cover the bends the tracks have, most of them 35 to 120 m across: steering out follows a long
    // sweeper, hands off or a light lean (which charges at full rate) a medium bend, and steering in a hairpin,
    // far tighter than full lock (about 24 m at this speed). With hands off at full lock, as it used to be,
    // most bends could not be drifted without diving into the inside wall.
    expect(out.radius).toBeGreaterThan(70);
    expect(hands.radius).toBeGreaterThan(35);
    expect(hands.radius).toBeLessThan(55);
    expect(light.radius).toBeGreaterThan(30);
    expect(into.radius).toBeLessThan(16);
    // The body swings into the corner, more when tightening.
    expect(into.yaw).toBeGreaterThan(hands.yaw);
    expect(hands.yaw).toBeGreaterThan(0.1);
  });

  /** Up to speed on the flat, then drive with `input(i)` for `n` steps. */
  function drive(n: number, input: (i: number, k: Kart) => KartInput) {
    const k = new Kart(0, 'p', CHARACTERS[0].id, BODIES[0].id, false, 1);
    k.place3(0, 0, 0, 0);
    for (let i = 0; i < 300; i++) ((k.input = { ...NO_INPUT, gas: true }), stepKart(k, flat, STEP, events, null));
    for (let i = 0; i < n; i++) ((k.input = input(i, k)), stepKart(k, flat, STEP, events, null));
    return k;
  }

  it('charges at full rate for any real lean into the bend, not only full lock', () => {
    const soft = drive(60, (i) => ({ ...NO_INPUT, gas: true, drift: true, steer: i < 9 ? 1 : 0.4 }));
    const hard = drive(60, (i) => ({ ...NO_INPUT, gas: true, drift: true, steer: 1 }));
    const out = drive(60, (i) => ({ ...NO_INPUT, gas: true, drift: true, steer: i < 9 ? 1 : -1 }));
    expect(Math.abs(soft.driftCharge - hard.driftCharge)).toBeLessThan(0.05);
    expect(out.driftCharge).toBeLessThan(hard.driftCharge * 0.6);
  });

  it('drifts on its own with the assist: a held hard turn slides, easing off cashes it in', () => {
    const k = drive(30, () => ({ ...NO_INPUT, gas: true, steer: 1, autoDrift: true }));
    expect(k.driftDir).toBe(1);
    expect(k.autoDrifting).toBe(true);
    // Held long, it stops at orange: purple is for drifting by hand.
    for (let i = 0; i < 400; i++) ((k.input = { ...NO_INPUT, gas: true, steer: 1, autoDrift: true }), stepKart(k, flat, STEP, events, null));
    expect(k.driftLevel).toBe(2);
    expect(k.driftCharge).toBeLessThan(DRIFT_LEVELS[2]);
    k.input = { ...NO_INPUT, gas: true, steer: 0, autoDrift: true };
    for (let i = 0; i < 10; i++) stepKart(k, flat, STEP, events, null);
    expect(k.driftDir).toBe(0);
    expect(k.boost).toBeGreaterThan(0);
  });

  it('kicks on release: part of the boost arrives at once', () => {
    const k = drive(80, () => ({ ...NO_INPUT, gas: true, drift: true, steer: 1 }));
    expect(k.driftLevel).toBeGreaterThanOrEqual(1);
    const before = k.planarSpeed;
    k.input = { ...NO_INPUT, gas: true };
    stepKart(k, flat, STEP, events, null);
    expect(k.boost).toBeGreaterThan(0);
    expect(k.planarSpeed).toBeGreaterThan(before * 1.1);
  });

  it('keeps a DRIFT press made in the air or below drifting speed, and hops as soon as it can', () => {
    // Pressed while airborne off a crest: it hops on landing, and the steering picks the side as usual.
    const k = drive(1, () => ({ ...NO_INPUT, gas: true }));
    k.grounded = false;
    k.y = 1.2;
    k.vy = 0;
    let drifted = false;
    for (let i = 0; i < 60; i++) {
      k.input = { ...NO_INPUT, gas: true, drift: true, steer: 0.6 };
      stepKart(k, flat, STEP, events, null);
      drifted ||= k.driftDir === 1;
    }
    expect(drifted).toBe(true);
    // Pressed while still slow after a knock, and held: it hops once the kart is up to speed.
    const slow = new Kart(0, 'p', CHARACTERS[0].id, BODIES[0].id, false, 1);
    slow.place3(0, 0, 0, 0);
    slow.vz = 6;
    for (let i = 0; i < 60; i++) ((slow.input = { ...NO_INPUT, gas: true, drift: true, steer: 0.7 }), stepKart(slow, flat, STEP, events, null));
    expect(slow.driftDir).toBe(1);
    // Let go before it could hop: nothing happens later.
    const tap = new Kart(0, 'p', CHARACTERS[0].id, BODIES[0].id, false, 1);
    tap.place3(0, 0, 0, 0);
    tap.vz = 6;
    for (let i = 0; i < 60; i++) ((tap.input = { ...NO_INPUT, gas: true, drift: i < 3, steer: 0.7 }), stepKart(tap, flat, STEP, events, null));
    expect(tap.driftDir).toBe(0);
    expect(tap.hopping).toBe(false);
  });

  it('never drifts on its own without the assist', () => {
    const k = drive(120, () => ({ ...NO_INPUT, gas: true, steer: 1 }));
    expect(k.driftDir).toBe(0);
  });
});

describe('computers', () => {
  it('wait for a roller crossing the road, or beat it, rather than driving into it', () => {
    let hits = 0;
    // Easy computers too: a lapse of attention mid-wait used to floor it into the roller's path.
    for (const difficulty of ['normal', 'easy'] as const) {
      for (const seed of [1, 2, 3, 4]) {
        const track = getTrack('breakfast');
        const race = new Race({ track, racers: cpus(1), laps: 3, cc: 100, items: 'off', difficulty, seed });
        // A ball rolling from wall to wall across the start straight, every 3 s.
        const a = track.pointAt(70, -1.1);
        const b = track.pointAt(70, 1.1);
        const def = { kind: 'roller' as const, r: 3.5, phase: seed * 0.7, motion: { type: 'pingpong' as const, ax: a.x, az: a.z, bx: b.x, bz: b.z, period: 3 } };
        race.hazards.push(hazardAt(def, 0));
        while (race.time < 8) {
          race.step([]);
          hits += race.events.filter((e) => e.t === 'hit' && e.how === 'hazard').length;
          race.events.length = 0;
        }
        expect(race.karts[0].s, `${difficulty} seed ${seed} got past`).toBeGreaterThan(90);
      }
    }
    expect(hits).toBe(0);
  });

  it("wait out Sandbox's slow football instead of giving up while it still sits in their lane", () => {
    let hits = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const race = new Race({ track: getTrack('sandbox'), racers: cpus(1), laps: 1, cc: 100, items: 'off', difficulty: 'normal', seed });
      while (race.time < 60 && race.karts[0].dist < 880) {
        race.step([]);
        hits += race.events.filter((e) => e.t === 'hit' && e.how === 'hazard').length;
        race.events.length = 0;
      }
      expect(race.karts[0].dist, `seed ${seed} got past`).toBeGreaterThan(880);
    }
    expect(hits).toBe(0);
  });
});

describe('kart stats', () => {
  it('do not let top speed decide everything: a nimble kart charges its sparks quicker', () => {
    const fast = kartParams('zip', 'racer', 1);
    const nimble = kartParams('mochi', 'buggy', 1);
    // Speed 5 against speed 2: 15% faster before, which no handling or acceleration could make up; a time trial
    // came out 13% apart. Now about 6% faster, and the nimble kart's quicker sparks claw some of it back.
    expect(fast.maxSpeed / nimble.maxSpeed).toBeLessThan(1.07);
    expect(nimble.charge).toBeGreaterThan(fast.charge * 1.1);
  });
});

describe('assists and catch-up', () => {
  const human = (): RacerSpec[] => [{ id: 'p', name: 'P', character: CHARACTERS[0].id, body: BODIES[0].id, cpu: false, slot: 0 }];

  it('smart steering keeps a kart that is steered off the road on it', () => {
    const track = getTrack('sandbox');
    let plain = 0;
    let smart = 0;
    for (const assist of [false, true]) {
      for (let s0 = 20; s0 < track.length; s0 += track.length / 12) {
        for (const steer of [1, -1]) {
          const race = new Race({ track, racers: human(), laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
          while (race.time < 0) race.step([NO_INPUT]);
          const k = race.karts[0];
          const p = track.pointAt(s0, 0);
          k.place3(p.x, p.y, p.z, p.h);
          k.s = k.dist = p.s;
          k.vx = Math.sin(p.h) * 28;
          k.vz = Math.cos(p.h) * 28;
          for (let i = 0; i < 90; i++) {
            race.step([{ ...NO_INPUT, gas: true, steer, smart: assist }]);
            if (k.surface === SURF.rough || k.surface === SURF.void || k.surface === SURF.water) assist ? smart++ : plain++;
          }
        }
      }
    }
    expect(plain).toBeGreaterThan(300);
    expect(smart).toBeLessThan(plain * 0.25);
  });

  it('a kart tucked in behind another gets a slipstream boost', () => {
    const track = getTrack('breakfast');
    const two = [...human(), { ...human()[0], id: 'q', slot: 1 }];
    const race = new Race({ track, racers: two, laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
    while (race.time < 0) race.step([NO_INPUT, NO_INPUT]);
    const [front, back] = race.karts;
    // Hold them nose to tail down the start straight, at the same speed.
    let drafted = false;
    for (let i = 0; i < 150 && !drafted; i++) {
      const s = 30 + i * 0.45;
      for (const [k, off] of [[front, 6], [back, 0]] as const) {
        const p = track.pointAt(s + off, 0);
        k.place3(p.x, p.y, p.z, p.h);
        k.s = k.dist = p.s;
        k.vx = Math.sin(p.h) * 27;
        k.vz = Math.cos(p.h) * 27;
      }
      race.step([{ ...NO_INPUT, gas: true }, { ...NO_INPUT, gas: true }]);
      drafted = race.events.some((e) => e.t === 'boost' && e.kind === 'draft' && e.k === back.index);
      race.events.length = 0;
    }
    expect(drafted).toBe(true);
    expect(front.boost).toBe(0);
  });

  it('grades the rocket start: a press nearer GO boosts for longer, too early stalls', () => {
    const boostFor = (pressAt: number) => {
      const race = new Race({ track: getTrack('breakfast'), racers: human(), laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
      while (race.time < 0) race.step([{ ...NO_INPUT, drift: race.time + STEP >= pressAt }]);
      return race.karts[0].boost;
    };
    expect(boostFor(-0.08)).toBeGreaterThan(boostFor(-0.35) + 0.4);
    expect(boostFor(-0.35)).toBeGreaterThan(0);
    expect(boostFor(-1.0)).toBe(0);
  });

  it('spends a slightly late start press on the start: held on, it does not hop into a drift', () => {
    const race = new Race({ track: getTrack('breakfast'), racers: human(), laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
    let hopped = false;
    while (race.time < 1) {
      race.step([{ ...NO_INPUT, gas: true, steer: 0.5, drift: race.time >= 0.05 && race.time < 0.6 }]);
      hopped ||= race.karts[0].hopping || race.karts[0].driftDir !== 0;
    }
    expect(race.karts[0].boost).toBeGreaterThan(0);
    expect(hopped).toBe(false);
  });
});

describe('bumps', () => {
  const two = (): RacerSpec[] =>
    [0, 1].map((slot) => ({ id: `p${slot}`, name: 'P', character: CHARACTERS[2].id, body: BODIES[0].id, cpu: false, slot }));

  /** Two karts on the start straight, `gap` apart side by side, driving at `speed`; b angled `toward` a. */
  function pair(gap: number, speed: number, toward: number) {
    const track = getTrack('breakfast');
    const race = new Race({ track, racers: two(), laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
    while (race.time < 0) race.step([NO_INPUT, NO_INPUT]);
    const [a, b] = race.karts;
    const p = track.pointAt(40, 0);
    const rx = rightX(p.h);
    const rz = rightZ(p.h);
    a.place3(p.x - rx * gap * 0.5, p.y, p.z - rz * gap * 0.5, p.h);
    b.place3(p.x + rx * gap * 0.5, p.y, p.z + rz * gap * 0.5, p.h + toward);
    for (const k of [a, b]) {
      k.s = k.dist = p.s;
      k.vx = Math.sin(k.h) * speed;
      k.vz = Math.cos(k.h) * speed;
    }
    return { race, a, b };
  }

  it('karts side by side only rub: no bump every frame', () => {
    const { race } = pair(KART_RADIUS * 1.85, 25, 0);
    let bumps = 0;
    for (let i = 0; i < 60; i++) {
      race.step([{ ...NO_INPUT, gas: true }, { ...NO_INPUT, gas: true }]);
      bumps += race.events.filter((e) => e.t === 'bump').length;
      race.events.length = 0;
    }
    expect(bumps).toBe(0);
  });

  it('a real bump shoves apart, costs a little speed and turns a glancing hit away', () => {
    // b swerves into a from its right at speed.
    const { race, a, b } = pair(KART_RADIUS * 2.2, 25, 0.5);
    const h0 = a.h;
    let bumped = false;
    for (let i = 0; i < 20 && !bumped; i++) {
      race.step([{ ...NO_INPUT, gas: true }, { ...NO_INPUT, gas: true }]);
      bumped = race.events.some((e) => e.t === 'bump');
      race.events.length = 0;
    }
    expect(bumped).toBe(true);
    expect(a.bumpCool).toBeGreaterThan(0);
    // b came in on a's right, so a's nose turned left (its heading went up), away from b.
    expect(wrapAngle(a.h - h0)).toBeGreaterThan(0.02);
    expect(a.stun).toBe(null);
    // Pushed apart: a now moves away from b.
    const away = (a.vx * (a.x - b.x) + a.vz * (a.z - b.z)) / Math.hypot(a.x - b.x, a.z - b.z);
    expect(away).toBeGreaterThan(0);
  });
});

describe('walls', () => {
  const wallTrack = (collider: Collider) =>
    ({
      grid: { surfaceAt: () => SURF.road, heightAt: () => 0 },
      voidY: -50,
      def: { floorY: 0 },
      query: (_x: number, _z: number, _r: number, out: Collider[]) => ((out.length = 1), (out[0] = collider), out),
    }) as unknown as Parameters<typeof stepKart>[1];
  const events = { wall() {}, boost() {}, land() {}, drift() {}, fall() {} };

  /** A kart at 30 heading `angle` radians into a wall along the z axis at x = 0. */
  function hit(angle: number) {
    const track = wallTrack({ t: 'seg', ax: 0, az: -100, bx: 0, bz: 100, r: 0 });
    const k = new Kart(0, 'p', CHARACTERS[0].id, BODIES[0].id, false, 1);
    k.place3(-KART_RADIUS + 0.2, 0, 0, angle);
    k.vx = Math.sin(angle) * 30;
    k.vz = Math.cos(angle) * 30;
    collideStatic(k, track, events);
    return k.planarSpeed / 30;
  }

  it('a graze keeps nearly all the speed; only a square hit stops the kart', () => {
    expect(hit(0.15)).toBeGreaterThan(0.93);
    expect(hit(Math.PI / 4)).toBeGreaterThan(0.6);
    expect(hit(Math.PI / 2)).toBeLessThan(0.4);
  });

  /** Speed share left after driving along a wall on the right for 3 s with the steering leaning `lean` into it. */
  function slide(lean: number) {
    const track = wallTrack({ t: 'seg', ax: 3, az: -1000, bx: 3, bz: 1000, r: 0 });
    const k = new Kart(0, 'p', CHARACTERS[0].id, BODIES[0].id, false, 1);
    k.place3(0, 0, -500, 0);
    for (let i = 0; i < 300; i++) ((k.input = { ...NO_INPUT, gas: true }), stepKart(k, track, STEP, events, null));
    const top = k.planarSpeed;
    let low = top;
    for (let i = 0; i < 180; i++) {
      k.input = { ...NO_INPUT, gas: true, steer: -lean };
      stepKart(k, track, STEP, events, null);
      if (i > 60) low = Math.min(low, k.planarSpeed);
    }
    return low / top;
  }

  it('slides along a wall it leans on instead of sticking to it; grinding at full lock still costs', () => {
    // A light lean is a thumb resting a little off centre beside a wall: it used to hold the kart at 73% speed.
    expect(slide(0.1)).toBeGreaterThan(0.97);
    expect(slide(0.3)).toBeGreaterThan(0.95);
    // Pushing hard into it grinds: about a fifth of the speed, so riding the wall is no shortcut.
    expect(slide(1)).toBeLessThan(0.85);
    expect(slide(1)).toBeGreaterThan(0.6);
  });
});

describe("the Giant's Hand", () => {
  /** One human on Breakfast, past the countdown and rolling. */
  function rolling(steps = 150) {
    const race = new Race({ track: getTrack('breakfast'), racers: [{ ...cpus(1)[0], id: 'p1', cpu: false, slot: 0 }], laps: 3, cc: 100, items: 'normal', difficulty: 'normal', seed: 1 });
    const gas = { ...NO_INPUT, gas: true };
    while (race.time < 0) race.step([gas]);
    for (let i = 0; i < steps; i++) race.step([gas]);
    return race;
  }
  const settle = (race: Race, seconds: number, input = NO_INPUT) => {
    for (let i = 0; i < seconds / STEP; i++) race.step([input]);
  };

  it('cannot reach into the race before it starts', () => {
    const race = new Race({ track: getTrack('breakfast'), racers: cpus(2), laps: 1, cc: 100, items: 'normal', difficulty: 'normal', seed: 1 });
    expect(race.giant('butter', 0, 1)).toBe(false);
  });

  it('drops butter on the road ahead, in the racer’s lane, and it spins whoever drives into it', () => {
    const race = rolling();
    const k = race.karts[0];
    expect(race.giant('butter', 0, 1)).toBe(true);
    const g = race.giants[0];
    const ahead = (g.x - k.x) * Math.sin(k.h) + (g.z - k.z) * Math.cos(k.h);
    expect(ahead).toBeGreaterThan(8);
    expect([SURF.road, SURF.boost]).toContain(race.track.grid.surfaceAt(g.x, g.z));
    settle(race, 1.2);
    expect(race.giants.length).toBe(0);
    const butter = race.drops.find((d) => d.kind === 'butter')!;
    expect(butter).toBeDefined();
    // Put the kart onto it.
    k.place3(butter.x, butter.y, butter.z, k.h);
    settle(race, 0.1);
    expect(k.stun).toBe('spin');
  });

  it('marks where a gobstopper will land, so a racer who is not there escapes it', () => {
    const race = rolling();
    const k = race.karts[0];
    expect(race.giant('bomb', 0, 1)).toBe(true);
    const ring = { ...race.giants[0] };
    // Brake hard: the ring was aimed at where the kart would have been.
    settle(race, 1.5, { ...NO_INPUT, brake: true });
    expect(Math.hypot(k.x - ring.x, k.z - ring.z)).toBeGreaterThan(GIANT_BLAST_RADIUS);
    expect(k.stun).toBeNull();
    expect(race.blasts.length).toBeGreaterThan(0);
  });

  it('bursts a gobstopper on a racer who is under it', () => {
    const race = rolling();
    const k = race.karts[0];
    race.giant('bomb', 0, 1);
    const ring = race.giants[0];
    settle(race, 1.2, NO_INPUT);
    k.place3(ring.x, ring.y, ring.z, k.h);
    settle(race, 0.4, NO_INPUT);
    expect(k.stun).toBe('tumble');
  });

  it('flicks a racer forward, and gives each racer a breather before the next pick', () => {
    const race = rolling();
    const k = race.karts[0];
    expect(race.giant('flick', 0, 1)).toBe(true);
    expect(k.boost).toBeGreaterThan(0.5);
    // Picked a moment ago: protected.
    expect(race.giant('bomb', 0, 2)).toBe(false);
    settle(race, GIANT_PROTECT + 0.1, { ...NO_INPUT, gas: true });
    expect(race.giant('butter', 0, 2)).toBe(true);
  });

  it('leaves finished racers alone', () => {
    const race = rolling();
    race.karts[0].finished = true;
    expect(race.giant('flick', 0, 1)).toBe(false);
  });
});

describe('the race end, with giants', () => {
  /** One human and three computers; the human is put over the line at once. */
  function humanHome(giantTime: number) {
    const racers = [{ ...cpus(1)[0], id: 'p1', cpu: false, slot: 0 }, ...cpus(4).slice(1)];
    const race = new Race({ track: getTrack('breakfast'), racers, laps: 3, cc: 100, items: 'normal', difficulty: 'normal', seed: 3, giantTime });
    while (race.time < 1) race.step([NO_INPUT]);
    race.karts[0].finished = true;
    race.karts[0].finishTime = race.time;
    return race;
  }
  const run = (race: Race, seconds: number) => {
    for (let i = 0; i < seconds / STEP && !race.over; i++) race.step([NO_INPUT]);
  };

  it('ends soon after the humans are home when there are no giants', () => {
    const race = humanHome(0);
    run(race, 4);
    expect(race.over).toBe(true);
  });

  it('runs on for the giants while the computers race, counting down', () => {
    const race = humanHome(30);
    run(race, 10);
    expect(race.over).toBe(false);
    expect(race.closingIn).toBeGreaterThan(19);
    expect(race.closingIn).toBeLessThan(21);
    run(race, 21);
    expect(race.over).toBe(true);
  });

  it('can be called early by the host', () => {
    const race = humanHome(30);
    run(race, 2);
    race.endNow();
    run(race, 0.1);
    expect(race.over).toBe(true);
  });
});

describe('ramps', () => {
  const human = (): RacerSpec[] => [{ id: 'p', name: 'P', character: CHARACTERS[0].id, body: BODIES[0].id, cpu: false, slot: 0 }];

  /**
   * Drive at a main-road ramp at `share` of top speed, holding it, tapping DRIFT for 4 steps from step `tapAt`.
   * Returns the step it left the lip on, its time in the air, whether it tricked or fell, and the biggest lift
   * onto the ground at a landing.
   */
  function jump(trackId: string, ramp: number, share: number, tapAt: number | null) {
    const track = getTrack(trackId);
    const r = track.ramps[ramp];
    const race = new Race({ track, racers: human(), laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
    while (race.time < 0) race.step([NO_INPUT]);
    const k = race.karts[0];
    const p = track.pointAt(r.s0 - 25, 0);
    k.place3(p.x, p.y, p.z, p.h);
    k.s = k.dist = p.s;
    const v = k.params.maxSpeed * share;
    k.vx = Math.sin(p.h) * v;
    k.vz = Math.cos(p.h) * v;
    let launch = -1, air = 0, trick = false, fell = false, lift = 0;
    for (let i = 0; i < 200 && !fell; i++) {
      const wasGrounded = k.grounded;
      const y0 = k.y;
      race.step([{ ...NO_INPUT, gas: k.speed < v, drift: tapAt !== null && i >= tapAt && i < tapAt + 4 }]);
      if (wasGrounded && !k.grounded && !k.hopping && launch < 0) launch = i;
      if (!k.grounded) air += STEP;
      if (!wasGrounded && k.grounded) lift = Math.max(lift, k.y - y0);
      for (const e of race.events) {
        if (e.t === 'boost' && e.kind === 'trick') trick = true;
        if (e.t === 'fall') fell = true;
      }
      race.events.length = 0;
    }
    return { launch, air, trick, fell, lift };
  }

  const mainRamps = TRACKS.flatMap((t) => getTrack(t.id).ramps.map((r, i) => ({ id: t.id, i, r })).filter((x) => x.r.path === 0));

  it('counts a DRIFT press a moment before the lip as a trick, without flattening the jump', () => {
    expect(mainRamps.length).toBeGreaterThan(0);
    for (const { id, i } of mainRamps) {
      const flat = jump(id, i, 1, null);
      expect(flat.launch, `${id} launches`).toBeGreaterThan(0);
      // With the phone's delay, a press "at the lip" lands a few steps either side of it.
      for (const early of [6, 3, 1]) {
        const j = jump(id, i, 1, flat.launch - early);
        expect(j.trick, `${id} tap ${early} steps early`).toBe(true);
        expect(Math.abs(j.air - flat.air), `${id} tap ${early} steps early: air time`).toBeLessThan(0.05);
      }
      expect(jump(id, i, 1, flat.launch + 5).trick, `${id} tap in the air`).toBe(true);
    }
  });

  it('never lifts a kart up a face it comes down beside: a jump too slow for the gap falls in', () => {
    const gaps = mainRamps.filter((x) => x.r.gap > 0);
    expect(gaps.length).toBeGreaterThan(0);
    let shortFalls = 0;
    for (const { id, i } of gaps) {
      expect(jump(id, i, 1, null).fell, `${id} flat out clears`).toBe(false);
      for (const share of [0.7, 0.55, 0.4]) {
        const j = jump(id, i, share, null);
        expect(j.lift, `${id} at ${share} of top speed`).toBeLessThan(1.1);
        if (j.fell) shortFalls++;
      }
    }
    expect(shortFalls).toBeGreaterThan(0);
  });
});

describe('finished racers', () => {
  it('cruise home along the road: no falls, no grass, no item boxes taken from those still racing', () => {
    for (const t of TRACKS) {
      const racers: RacerSpec[] = [{ ...cpus(1)[0], id: 'p1', cpu: false, slot: 0 }, ...cpus(4).slice(1)];
      const race = new Race({ track: getTrack(t.id), racers, laps: 3, cc: 100, items: 'normal', difficulty: 'normal', seed: 3, giantTime: 30 });
      while (race.time < 1) race.step([NO_INPUT]);
      const k = race.karts[0];
      k.finished = true;
      k.finishTime = race.time;
      let off = 0;
      for (let i = 0; i < 15 / STEP; i++) {
        race.step([NO_INPUT]);
        for (const e of race.events) {
          expect(e.t === 'fall' && e.k === 0, `${t.id} fell`).toBe(false);
          expect(e.t === 'box' && e.k === 0, `${t.id} took a box`).toBe(false);
        }
        race.events.length = 0;
        // On the ground: flying a ramp's gap is over the void, and fine.
        if (k.grounded && (k.surface === SURF.rough || k.surface === SURF.void || k.surface === SURF.water)) off++;
      }
      expect(off * STEP, `${t.id} seconds off the road`).toBeLessThan(0.5);
      // Driven home, not parked: it covered a good part of the lap.
      expect(k.dist, t.id).toBeGreaterThan(150);
    }
  });
});

describe('a lost drift', () => {
  /** One human on Breakfast's start straight, holding a drift until it has sparks. */
  function sparking() {
    const race = new Race({ track: getTrack('breakfast'), racers: cpus(1).map((r) => ({ ...r, cpu: false, slot: 0 })), laps: 3, cc: 100, items: 'off', difficulty: 'normal', seed: 1 });
    while (race.time < 0) race.step([NO_INPUT]);
    for (let i = 0; i < 90; i++) race.step([{ ...NO_INPUT, gas: true }]);
    for (let i = 0; i < 80; i++) race.step([{ ...NO_INPUT, gas: true, drift: true, steer: 1 }]);
    expect(race.karts[0].driftLevel).toBeGreaterThanOrEqual(1);
    race.events.length = 0;
    return race;
  }

  it('says so when a hit throws its sparks away', () => {
    const race = sparking();
    expect(race.hit(race.karts[0], 'spin', 'ball', -1)).toBe('hit');
    expect(race.events).toContainEqual({ t: 'drift', k: 0, on: false, lost: true });
  });

  it('does not call cashing it in a loss', () => {
    const race = sparking();
    race.step([{ ...NO_INPUT, gas: true }]);
    const off = race.events.find((e) => e.t === 'drift');
    expect(off).toEqual({ t: 'drift', k: 0, on: false });
    expect(race.events.some((e) => e.t === 'boost' && e.kind === 'drift')).toBe(true);
  });

  it('says so when a wall knock ends it', () => {
    const k = new Kart(0, 'p', CHARACTERS[0].id, BODIES[0].id, false, 1);
    k.place3(-KART_RADIUS + 0.2, 0, 0, 0.8);
    k.vx = Math.sin(0.8) * 30;
    k.vz = Math.cos(0.8) * 30;
    k.driftDir = 1;
    k.driftCharge = DRIFT_LEVELS[1];
    const got: [boolean, boolean | undefined][] = [];
    const wall = { t: 'seg', ax: 0, az: -100, bx: 0, bz: 100, r: 0 } as Collider;
    const track = { query: (_x: number, _z: number, _r: number, out: Collider[]) => ((out.length = 1), (out[0] = wall), out) } as unknown as Parameters<typeof collideStatic>[1];
    collideStatic(k, track, { wall() {}, boost() {}, land() {}, drift: (_k, on, lost) => got.push([on, lost]), fall() {} });
    expect(k.driftDir).toBe(0);
    expect(got).toEqual([[false, true]]);
  });
});

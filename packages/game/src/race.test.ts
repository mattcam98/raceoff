import { BODIES, CHARACTERS, TRACKS } from '@raceoff/shared';
import { describe, expect, it } from 'vitest';
import { drawItem } from './items';
import { Kart, KART_RADIUS, NO_INPUT, STEP, stepKart } from './kart';
import { rightX, rightZ, rng } from './math';
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
        expect(track.length).toBeGreaterThan(600);
        expect(track.length).toBeLessThan(1300);
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
        expect(winner).toBeLessThan(130);
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
      const item = drawItem(1, 8, 'normal', r, false);
      expect(['plane', 'rocket', 'sugar', 'nitro3', 'seeker', 'bomb']).not.toContain(item);
    }
  });

  it('gives last place the big items and no oil', () => {
    const r = rng(6);
    const got = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const item = drawItem(8, 8, 'normal', r, false);
      got.add(item);
      expect(item).not.toBe('oil');
    }
    for (const big of ['rocket', 'sugar', 'plane', 'nitro3']) expect(got.has(big)).toBe(true);
  });

  it('allows only one paper jet in the air', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) expect(drawItem(8, 8, 'frantic', r, true)).not.toBe('plane');
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
    for (const seed of [2, 3]) {
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
    return { top, low, held: k.planarSpeed, rate: (turned * 180) / Math.PI, dir: k.driftDir, yaw: k.driftYaw };
  }

  it('keeps its speed: a drift is not a brake', () => {
    for (const steer of [-1, 0, 1]) {
      const d = drift(steer);
      expect(d.dir).toBe(1);
      expect(d.low / d.top, `steer ${steer}`).toBeGreaterThan(0.95);
      expect(d.held / d.top, `steer ${steer}`).toBeLessThanOrEqual(1.01);
    }
  });

  it('turns progressively: steering out widens the arc, into it tightens it, never far past full lock', () => {
    const out = drift(-1);
    const hands = drift(0);
    const into = drift(1);
    expect(out.rate).toBeLessThan(hands.rate);
    expect(hands.rate).toBeLessThan(into.rate);
    // Full lock at this speed turns about 95 degrees a second.
    expect(into.rate).toBeLessThan(125);
    expect(out.rate).toBeGreaterThan(30);
    // The body swings into the corner, more when tightening.
    expect(into.yaw).toBeGreaterThan(hands.yaw);
    expect(hands.yaw).toBeGreaterThan(0.1);
  });
});

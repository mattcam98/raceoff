# Handling: what makes kart driving feel good, and how RaceOff does it

This document covers the research behind RaceOff's driving and the choices it led to. It compares Mario Kart and other arcade racers with RaceOff's own measured numbers.

The code lives in three places:
- the driving model: `packages/game/src/kart.ts`;
- race-level systems: `packages/game/src/race.ts`;
- the phone controller: `apps/web/src/phone/Controller.tsx`.

**Where the numbers come from:**
- **Mario Kart figures** come from public community datamining:
  - the Mario Kart Wii (MKWii) TAS wiki;
  - mkwiiki's notes on `kartParam.bin`;
  - Super Mario Wiki's datamined stat pages for MK7, MK8 Deluxe and Tour;
  - Nintendo's rubber-banding patent (US7278913B2);
  - reviews of Mario Kart Tour and other mobile racers.
  
  No Nintendo code or game files were analysed.
- **RaceOff figures** come from stepping `stepKart` on a flat test track (Volt in the Racer at 100cc unless stated). The scripts are in `.scratch/`, which git ignores.

## Drifting: the core loop

Mario Kart's basic skill loop is: drift, keep your speed, take a tighter line, cash in a boost. Every part of that has to pay off.

**What Mario Kart does:**
- **A drift holds speed.** MKWii's drift acceleration keeps pushing to 96.5% of top speed.
- **A drift turns sharper than grip steering.** In MK8 Deluxe it turns about 1.6–2.2× as fast; in MK7 about 2–4×.
- **Vehicle stats mostly affect grip steering.** The drift turn is nearly the same for every vehicle.
- **The stick only reshapes the drift's line.** In Tour, steering into the drift adds about 55% to the turn rate and steering out of it takes away about 40%.

**What RaceOff does:**
- **A drift holds 100% of speed.** Grip turns the sideways slide back into forward speed rather than scrubbing it off.
- **The drift turn depends on steering.** It is **0.2×** full lock when steering fully out of the bend, **0.4×** with hands off and **1.4×** when steering fully into it. Leaning in tightens gently at first (the inner half is a curve, not a straight line), so the light lean that charges sparks at full rate still holds a medium bend. At 100cc top speed the arcs are about 83 m, 42 m and 12 m across; a light lean (0.3) holds about 34 m. "October 2026" below explains why.
- **Drift turning is mostly shared.** It is built 60% on a common turn rate and 40% on the kart's handling stat, so every kart drifts much alike.

| | Before | Now |
|---|---|---|
| Speed held while drifting into a bend | 61% | 100% |
| Drift turn, as a share of full lock (out / hands off / in) | 0.34 / 0.84 / 1.48 at 61–80% speed | 0.2 / 0.4 / 1.4 at full speed (0.55 / 1.0 / 1.4 until October 2026) |
| Time gained by drifting to blue / orange / purple, then letting go | 0.00 / −0.01 / −0.15 s | +0.16 / +0.39 / +0.74 s |

The time gained is measured against driving straight over 5 s, with the steering leaning into the bend.

## Spark charge: a switch, not a slider

**In Mario Kart**, the charge rate depends only on which way the stick points:
- +5 a frame when the stick leans at least halfway into the turn;
- +2 a frame otherwise.

A light lean and full lock therefore charge at exactly the same rate, so players can widen their line without losing charge (known as the "soft drift"). This matters even more with a thumb on glass or a tilted phone, where holding exact full lock is hard.

RaceOff now uses the same kind of switch. The charge rate per second depends on how far the steering leans into the bend, then on the kart's handling (×0.88 at handling 1, ×1 at 3, ×1.12 at 5, a little like Mario Kart 8's mini-turbo stat):

| Lean into the bend | Charge rate per second |
|---|---|
| 0.3 or more | 1.3 |
| Hands off | 0.75 |
| 0.3 or more the other way (steering out) | 0.5 |

**When each spark colour arrives** (seconds from pressing DRIFT, hop included):

| Steering | Blue | Orange | Purple |
|---|---|---|---|
| Leaning into the bend | 0.88 | 1.53 | 2.38 |
| Hands off | 1.32 | 2.45 | 3.90 |
| MK8DX, stick fully in | ~0.9 | ~1.9 | ~3.0 |

RaceOff's times run a little shorter than Mario Kart's because its tracks are miniature.

**Drift boost durations:**

| | Blue | Orange | Purple |
|---|---|---|---|
| RaceOff (seconds, at ×1.31–1.37) | 0.5 | 1.1 | 1.9 |
| Before | 0.55 | 1.0 | 1.5 |
| MK8DX (seconds, at ×1.055–1.15) | 0.35–0.67 | 1.2–1.8 | 2.0–3.0 |

Purple is now worth holding out for. Boosts still don't stack: a new boost refreshes the timer and keeps the strongest multiplier, as in MKWii. Speed eases back down over about 0.6 s when a boost ends.

## Steering response

- **Keys and the phone's arrow buttons** (`digital` input) are eased in over about 0.14 s, so a tap is not a jerk.
- **The phone's slide stick and tilt** are already analog. They now reach full lock in about 0.06 s, which rounds off the phone's 30-a-second updates and nothing more. Before, they had the same 0.15 s ramp as keys, on top of network lag.
- **Computer karts** keep the gentle ramp they were tuned with.

## Controllability: twitchy, too fast, laggy

Playtesting on a phone with the slide stick, steering felt twitchy, too fast and laggy. The measurements below show why.

**Steering was far stronger than any corner needs.** At top speed, full lock turned the kart 101°/s. But each track's racing line needs much less:

| Track | Turn needed at top speed: half the lap | 90% of the lap |
|---|---|---|
| Breakfast | 25°/s | 68°/s |
| Desk | 24°/s | 46°/s |
| Bath | 15°/s | 36°/s |
| Sandbox | 20°/s | 40°/s |
| Toybox | 20°/s | 39°/s |
| Garage | 16°/s | 52°/s |

So nearly all real driving happened in the first third of the thumb's travel. A tremble of a few pixels swung the kart, and the phone-to-TV delay turned corrections into weaving.

**How it was measured: a "habit thumb" test driver** (`.scratch/thumb.ts`).
- The driver moves its thumb in proportion to how far off the racing line the kart looks, the same whatever the game does with the movement.
- Its thumb trembles by 2.5 px.
- The TV sees each movement 0.25 s later (reaction plus phone plus network).
- It drives one lap of every track. "Steady thumb" is a habit of 250 px per radian off line; "eager thumb" is 400 px per radian.

| | Steady thumb: wall hits | Steady thumb: weave | Eager thumb: wall hits | Eager thumb: weave | Total lap time |
|---|---|---|---|---|---|
| Before | 16 | 0.87/s | 64 | 1.21/s | 160–193 s |
| Softer steering at speed | 5 | 0.48/s | 11 | 1.19/s | 160–162 s |
| + longer thumb travel, 100cc at 92% speed | 3 | 0.29/s | 5 | 1.20/s | 172–173 s |

**What changed:**
- **Steering softens with speed** (`STEER_FALLOFF`). At top speed, ordinary steering now keeps 62% of its turn (it kept 82%): full lock is 76°/s instead of 101°/s. Drifts still keep 82%, so a drift steered into the bend turns about 1.9× as sharp as full-lock grip steering, which matches Mario Kart's 1.6–2.2×. (Hands off was 1.3×; since October 2026 it is about 0.5×.) Low-speed manoeuvring is unchanged.
- **The engine classes are a little slower:** 50cc ×0.76, 100cc ×0.92, 150cc ×1.1 (they were 0.8 / 1 / 1.17).
- **Longer slide-stick travel:** full lock now takes 22% of the steering side, between 56 and 108 px (it was 20%, 48–96 px), so a tremble is a smaller share of it.
- **The phone sends sooner.** It sends input the moment the thumb moves, a button changes or the tilt updates, at most one early send per 15 ms. Before, input waited for the next 33 ms tick (about 16 ms on average, up to 33 ms). The 33 ms beat remains as a heartbeat.
- **The computer drivers know about the softer steering.** They work out corner speeds from `v × curvature = turn × (1 − falloff × v / top)`.
- **Smart steering starts correcting earlier at speed.**

**Results in eight-computer races:** wall hits fell on most tracks (Breakfast 68→40, Sandbox 29→18, Toybox 31→18, Bath 10→5). Races at 100cc take 7–12% longer.

## Phone controls

Players watch the TV, not the phone, so feedback through the hands and forgiving input matter more than they would on a console.

- **The slide stick floats.** It appears where the thumb lands, has a dead zone and a gentle centre, and the anchor follows the thumb past full lock. Turning back therefore answers at once.
- **Tilt is filtered.** It now has a light low-pass filter (35% of each new reading), plus the same dead zone and response curve as the stick. This takes out hand shake and sensor noise.
- **One, two, three buzzes** as the sparks turn blue, orange, purple. With up to four people sharing one TV, the chime doesn't say whose sparks they are; a buzz in the hand does.
  - This works on Android only. iPhone browsers can't vibrate, so those players have the coloured DRIFT button and the chime.
- **Two assists, set per player under ⚙.** Each is sent as a button bit (`BTN.autoDrift`, `BTN.smart`). Both cap drift sparks at orange: purple stays a reward for drifting by hand. Mario Kart's smart steering likewise locks out its top boost.
  - **Drift by itself** works like MKWii's automatic drift and Tour's default mode. Holding a hard turn (|steer| ≥ 0.7) for 0.2 s at more than half of top speed starts a drift, with no hop and no button. Easing the turn below 0.2 cashes it in. Pressing DRIFT during an automatic drift hands it to the player, and purple sparks become possible again.
  - **Smart steering** looks about 0.3–0.55 s ahead along the kart's path. If that path leaves the road (a drop, water, grass, or behind a wall), it steers toward the racing line. When the edge is very close it takes the wheel completely; further off, it does 85% of the steering. It keeps helping for a moment after the danger clears so it doesn't flicker, and a cyan glint on the kart's nose shows when it acts.
  - Holding full lock off the road for 1.5 s from 24 spots on each track: without the assist, karts spent 613–2386 frames off the road per track. With it, 0–211 frames, and no real falls.

## Walls, bumps and off-road

- **Speed lost on a wall depends on the angle.** The kart keeps `1 − 0.12 × head-on − 0.13 × head-on²` of its speed, after bouncing off the wall's face, less 0.6% for each step it grinds along it with the steering pushed into it. A 15° graze costs about 4%, a 45° hit about 15%, and a head-on hit stops the kart. MKWii scales its loss from about 35% up to 100% by angle. A scrape no longer ends a drift either. (Until October 2026 it was `0.99 − 0.24 × head-on²`, which took 1% for merely touching.)
- **Ledges are now walls.** A ledge too tall to drive up used to throw the kart backwards at 35% speed, even on a glancing scrape. It now bounces like any other wall: the face's direction comes from the height field, and the kart slides along it.
- **Speed and boosting make a kart heavier in bumps.** A kart's weight in a bump is now its mass × (0.6 + 0.4 × its share of top speed), doubled while boosting; Sugar Rush and the rocket are still ×6. MK7 and MK8DX likewise make mass grow with speed and give boosting karts a high "dash mass".
- **Off-road needed no change.** RaceOff already keeps 48–60% of top speed on rough ground and slows down over about 0.3 s. MKWii keeps 45–67% and also ramps down rather than snapping.

## Race-level systems

- **The rocket start is graded.**
  - A DRIFT press within 0.45 s before GO earns a boost. The boost runs from 0.6 s for a press early in the window up to 1.5 s for one in the last 0.05 s.
  - A press up to 0.15 s *after* GO still counts as a slightly late one, to allow for the trip from phone to TV.
  - Pressing too early still stalls the engine.
  - Before, any press in the window gave a flat 1.1 s.
- **Slipstream.** Tucking in close behind a moving kart builds a slipstream boost of 1.2 s at ×1.15, followed by a 4 s wait before the next.
  - "Close" means 2.5–10 m behind it, within 1.4 m to either side, pointing within 0.3 rad of the same way, both karts above 70% of top speed, for 1.6 s.
  - Wind streaks show it building, and a whoosh, a buzz and a "SLIPSTREAM!" banner mark the boost.
  - In eight-computer races it fires about three times per kart per race.
- **Items are drawn by gap, not just place.** The item rank is `0.3 × place share + 0.7 × gap share`, where the gap share reaches 1 at 30% of a lap behind the leader. The leader always draws from the leader's table. As in MK8, last place in a tight pack isn't treated as far behind, so hanging back to farm the big items doesn't pay.

## Lessons from a dedicated kart-physics plugin

**Kart Racing Drifting Physics** is a paid Unreal Engine 5 plugin by Julien Schweter. Its public docs and blog at kartphysics.com explain its design and default values. Only those public pages were read. The plugin and its demo build were not downloaded or decompiled.

**What it does that RaceOff already does:**
- a fixed 60 Hz simulation that is smoothed between frames when drawn;
- a drift that keeps its speed;
- a drift turn rate of about ×0.45 steering out, ×0.75 hands off and ×1.35 steering in (RaceOff: 0.2 / 0.4 / 1.4, wider than the plugin's because RaceOff's bends are long and its steering at speed is soft);
- three spark stages;
- boosts that refresh rather than add up;
- a wider field of view while boosting.

**Where RaceOff stays kinder, on purpose:**
- **Walls:** the plugin keeps 20% of speed on any wall hit. RaceOff's loss depends on the angle, as in Mario Kart.
- **Starting a drift:** RaceOff starts drifts at a lower speed and lets the steering choose the side after the press.

**What RaceOff took from it:**
- **A drift that looks like one.** The plugin slides the kart about 45–48° off its line, "the classic kart racing look". Its troubleshooting warns that a small slide "looks like normal steering". RaceOff's body pose went from 5–20° to 21–36° (`DRIFT_POSE`, 0.36–0.62 rad); this is a pose only, and the path is unchanged.
- **A boost you feel the moment it fires.** The plugin's boost takes the kart straight to its boosted top speed. RaceOff now hands over 45% of a boost's extra speed at once (`BOOST_KICK`) for drift releases, pads, tricks and Nitro, and 27% for a slipstream. The rest builds as before. A rocket start from a standstill gets no kick.
- **A trick pressed at the lip counts.** A DRIFT press while the ramp is still lifting the kart no longer hops (a hop replaced the ramp's climb and could halve the jump); it counts as a trick if the kart leaves the ground within 0.15 s. Taps from 8 frames before the lip to well into the air now trick, with air time unchanged on every ramp.
- **No lifting up cliffs from the air.** A kart that comes down against a face more than 1.1 m above it bounces off it, airborne or not: a jump taken too slowly falls into the gap instead of being snapped up onto the far bank.
- **Every spark stage made obvious.** The plugin fires a burst particle when a new stage is reached. RaceOff now bursts sparks in the new colour from both rear wheels, on top of the chime and the phone buzz.
- **A steady camera through the hop.** The plugin's camera holds its height through a hop. RaceOff's chase camera now holds the ground's height while a drift hop is in the air. In testing the kart rose 0.40 units and the camera moved 0.05. Real jumps are followed as before.
- **Bumps that feel designed** (`BUMP` in `race.ts`):
  - **Rubbing:** karts closing in slower than 1.2 units/s only rub. They stop closing in and get a slight shove apart, so racing side by side is no longer a bump every frame.
  - **A real bump:**
    - returns 45% of the closing speed;
    - adds a set push of 3.5, which a lighter kart takes more of;
    - costs 6% of speed for equal weights;
    - turns a glancing hit's noses away from each other by up to 0.09 rad.
    
    A bump never spins a kart.
  - **Cooldown:** a kart that was just bumped can't be bumped again for 0.35 s.

  With softer bumps, fewer computer karts get shoved into Bath's water. The falls test now races seeds until it has seen falls, instead of relying on two fixed seeds.

## October 2026: what a phone player actually gets

The numbers above were tuned one mechanic at a time. This pass drove the karts the way people on phones do and looked for whatever felt mushy, sticky or unfair. The scripts are in `.scratch/` (`feel.ts`, `thumb.ts`, `bends.ts`, `races.ts`, `vs.ts`, `combos.ts`).

**How it was measured.**
- **The habit thumb**, extended (`thumb.ts`). The phone is sampled 30 times a second and the TV acts 0.25 s after the driver sees (0.1 s for a quick one). The thumb trembles, and follows a shortcut's road when it is on one. Styles:
  - *steady* and *eager*, which never drift;
  - *sloppy*: a big gain, more tremble, and the thumb slipping off the glass now and then;
  - three *drifters*: they press DRIFT a little late for bends tighter than 45 m (60 m for one), trim with the thumb, and let go after steering hard out of the drift for 0.3 s.

  Two seeds each, two laps of every track, one kart, items off.
- **The bends themselves** (`bends.ts`): the share of each lap's racing line in each band of radius.
- **Eight-computer races** with items (`races.ts`): 18 for each setting, and 48 with the line-up rotated so every kart starts from every grid slot.

**What was wrong, worst first.**

1. **Most bends could not be drifted.** The racing lines are mostly gentle: 15–42% of each lap is 35–75 m across, and only 3–9% is tighter than 25 m. A drift held hands off followed a 17 m arc, and even steering fully out only opened it to 31 m (a light lean in: 15 m). So a drift in an ordinary bend dived into the inside wall whatever the thumb did. The drifting thumbs got a boost from 9–22% of their drifts and hit a wall every few seconds; the quick one turned 72 drifts into 6 boosts. The computers never noticed because they only drift bends tighter than 33 m.
   - *Change:* the drift's arc is now 0.2× full lock steering out, 0.4× hands off and 1.4× steering in (`DRIFT_TURN`, `driftArc`): about 83 m to 12 m across at 100cc. The arc also follows the thumb twice as fast (`DRIFT_TURN_EASE` 2.6 → 5 a second): a drift you cannot correct in time is a drift into a wall.
2. **Leaning on a wall was sticky.** Every step touching a wall cost 1% of the speed, however gently. Sixty touches a second is more than the engine makes back, so a kart sliding along a wall with the thumb resting a little toward it sat at 73% of top speed until the player noticed and steered away.
   - *Change:* the loss now comes only from how hard the kart hits (linear and squared in how square-on), plus a grind of 0.6% a step scaled by how far the steering pushes into the wall. Sliding along with a light lean costs nothing; grinding at full lock still holds the kart at 77%, so riding the wall is no shortcut.
3. **A DRIFT press could silently do nothing.** A press while the kart was in the air (a crest, a jump, the end of another hop) or below 9 m/s (getting going after a knock) was dropped. Holding the button did nothing until it was let go and pressed again. The drifting thumbs ran into this off the jumps.
   - *Change:* such a press is kept while the button is held (`driftArmed`): the kart hops on landing, or as soon as it is up to speed. Letting go first cancels it. A drift that a hard knock ends is not restarted, and a rocket-start press made a moment after GO is spent on the start, not kept for a drift.
4. **The computers drove into rollers.** Garage's paint cans and Sandbox's football hit 3–4 computers a lap: 7.7 hazard hits a race at normal and 8.5 at hard; 28.7 on Garage, 5.7 of them a second hit within 3 s. The computers only timed stompers. For anything else they steered a little, often into the path.
   - *Change:* a computer checks whether holding its speed, or flooring it, meets a moving hazard within the next 0.9 s. It floors it if that gets through first, holds its speed if that does, and otherwise stops short and waits, never creeping into the path. After about 4 s of waiting it commits, so a roller that sweeps right up to where it stopped cannot hold it for ever. (It was 2 s, which gave up while a slow roller such as Sandbox's football still sat in its lane. Once a computer starts waiting it also keeps watching: before, every frame was a fresh roll against its awareness, and a miss floored it into the path, so easy computers hit hazards 7–17 times a race.) (Looking 1.2 s ahead with a wider margin stopped them too often: waiting cost more than the hits had. Swerving into the roller's open lane was tried too, and hit more.)
5. **Top speed decided everything.** Each speed point was 1.5 m/s, 5% of top speed; handling, acceleration and weight together were worth about 1% in a time trial. Zip in the Racer won 30 of 48 rotated races (average place 1.7) and Mochi in the Buggy averaged 6.5. The steady thumb lapped 13% slower in the Mochi.
   - *Change:* a speed point is now 0.6 m/s (the middle kart is unchanged), and handling scales how fast sparks charge. The steady thumb's spread across the eight line-up karts is now 3.9%, and rotated races average from 2.9 (Zip) to 5.9 (Mochi). Speed is still the strongest stat, as in Mario Kart, but no longer the only one.

**Before and after.**

| | Before | After |
|---|---|---|
| Drift arc at 100cc top speed: out / hands off / light lean / in | 31 / 17 / 15 / 12 m | 83 / 42 / 34 / 12 m |
| Quick drifting thumb, six tracks: total, walls, boosts from drifts | 397 s, 70, 6 of 72 | 378 s, 40, 22 of 62 |
| Drifting thumb: total, walls, falls | 486 s, 88, 10 | 430 s, 76, 3.5 |
| Sloppy thumb: walls, seconds scraping | 109, 14.0 | 100, 9.7 |
| Sliding along a wall for 3 s, steering 0.1 / 0.3 / 1 into it: speed kept | 73 / 73 / 71% | 100 / 100 / 77% |
| Time lost to a 15° / 45° / 90° wall hit | 0.16 / 0.47 / 2.4 s | 0.01 / 0.24 / 2.4 s |
| DRIFT pressed in the air, or at 7 m/s, and held | never drifts | hops on landing, or at 9 m/s |
| Hazard hits a race, eight computers, normal / hard 150cc | 7.7 / 8.5 | 1.2 / 1.9 |
| Walls a race, eight computers, normal / hard 150cc | 15.3 / 23.3 | 5.2 / 9.8 |
| Time-trial spread across the line-up (steady thumb) | 12.8% | 3.9% |

A second pass re-measured hazard hits (`.scratch/hz.ts`: six seeds, items on, averaged over all six tracks). This code gave 2.0 / 2.6 a race at normal / hard 150cc rather than 1.2 / 1.9, and 1.6 / 2.4 after the waiting fixes in item 4. Easy computers at 100cc, on the four tracks with hazards, went from 8.7 hits a race to 1.6.

The steady thumb, which never drifts, laps about 2% slower than before because its Volt in the Racer (speed 4) lost a little top speed. The drifting thumbs are still slower than the steady one: they are crude drivers that drift every bend over 45 m. The computers, which plan their drifts, gain from them. Winners of eight-computer races are within 1–3 s of before; on Sandbox and Garage about 3 s slower, the time spent letting the roller pass. Against seven computers the steady thumb's average place is unchanged at normal (2.3) and a little better at hard (5.1 → 4.6).

**Looked at and left alone.**
- **Steering response.** With 65 ms of phone delay and 30 samples a second, the nose has turned 2° 0.12–0.25 s after the thumb moves, and the turn rate reaches 90% within 0.1 s of the TV seeing the change. Nothing to gain.
- **Acceleration.** 90% of top speed in 1.3 s from a standstill (1.05–1.7 s across the karts). Brisk and forgiving.
- **Spin-outs.** A ball costs 1.4 s, a blast 1.7 s and a squash 1.2 s, and 1.2 s of protection follows. A second hit within 3 s on the same kart happens 0.2–0.4 times a race, mostly blasts, which ignore protection on purpose.
- **Off-road.** A second on the grass costs 0.6 s.
- **Items.** Balls hit about 40% of the time, the Seeker about 70%, oil 90% (someone eventually drives through it). The leader draws ball, oil and shield; the back draws the big items. Nothing stood out.
- **Rubber-banding.** Against a steady thumb, computers ahead average 0.91 of top speed and those behind 0.97 (normal). The band fades with the gap, so a kart you catch is no longer held back.

## Checks

- **`race.test.ts`** covers:
  - drift speed and turn range, the full-rate charge for a partial lean, and slower charge steering out;
  - automatic drift and its orange cap, and that there is no automatic drift without the assist;
  - smart steering keeping karts on the road;
  - the slipstream boost and the graded rocket start, and a late start press held on not hopping into a drift;
  - wall grazes vs square hits, sliding along a wall without sticking, and item rank by gap;
  - the drift's arcs covering the tracks' bends, and a DRIFT press kept through the air and up to speed;
  - computers, easy ones too, waiting for a roller instead of driving into it, including Sandbox's slow football, and top speed not deciding everything;
  - full eight-computer races on every track.
- **Old vs new code** (`.scratch/compare.ts`): eight-computer races on the same seeds give winning times within about 3 s and similar spreads. Wall hits stay within seed-to-seed noise once the slipstream was tightened; an early, looser version boosted computer karts into corners.

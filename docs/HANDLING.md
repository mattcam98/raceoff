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
- **The drift turn depends on steering.** It is **0.55×** full lock when steering out of the bend, **1.0×** with hands off and **1.4×** when steering into it.
- **Drift turning is mostly shared.** It is built 60% on a common turn rate and 40% on the kart's handling stat, so every kart drifts much alike.

| | Before | Now |
|---|---|---|
| Speed held while drifting into a bend | 61% | 100% |
| Drift turn, as a share of full-lock grip turning (out / hands off / in) | 0.34 / 0.84 / 1.48 at 61–80% speed | 0.55 / 1.0 / 1.4 at full speed |
| Time gained by drifting to blue / orange / purple, then letting go | 0.00 / −0.01 / −0.15 s | +0.16 / +0.39 / +0.74 s |

The time gained is measured against driving straight over 5 s, with the steering leaning into the bend.

## Spark charge: a switch, not a slider

**In Mario Kart**, the charge rate depends only on which way the stick points:
- +5 a frame when the stick leans at least halfway into the turn;
- +2 a frame otherwise.

A light lean and full lock therefore charge at exactly the same rate, so players can widen their line without losing charge (known as the "soft drift"). This matters even more with a thumb on glass or a tilted phone, where holding exact full lock is hard.

RaceOff now uses the same kind of switch. The charge rate per second depends on how far the steering leans into the bend:

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

- **Speed lost on a wall depends on the angle.** The kart keeps `0.99 − 0.24 × head-on²` of its speed, after bouncing off the wall's face. A graze costs about 1%, a 45° hit about 12%, and a head-on hit stops the kart. MKWii scales its loss from about 35% up to 100% by angle. A scrape no longer ends a drift either.
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
- a drift turn rate of about ×0.45 steering out, ×0.75 hands off and ×1.35 steering in (RaceOff: 0.55 / 1.0 / 1.4);
- three spark stages;
- boosts that refresh rather than add up;
- a wider field of view while boosting.

**Where RaceOff stays kinder, on purpose:**
- **Walls:** the plugin keeps 20% of speed on any wall hit. RaceOff's loss depends on the angle, as in Mario Kart.
- **Starting a drift:** RaceOff starts drifts at a lower speed and lets the steering choose the side after the press.

**What RaceOff took from it:**
- **A drift that looks like one.** The plugin slides the kart about 45–48° off its line, "the classic kart racing look". Its troubleshooting warns that a small slide "looks like normal steering". RaceOff's body pose went from 5–20° to 21–36° (`DRIFT_POSE`, 0.36–0.62 rad); this is a pose only, and the path is unchanged.
- **A boost you feel the moment it fires.** The plugin's boost takes the kart straight to its boosted top speed. RaceOff now hands over 45% of a boost's extra speed at once (`BOOST_KICK`) for drift releases, pads, tricks and Nitro, and 27% for a slipstream. The rest builds as before. A rocket start from a standstill gets no kick.
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

## Checks

- **`race.test.ts`** covers:
  - drift speed and turn range, the full-rate charge for a partial lean, and slower charge steering out;
  - automatic drift and its orange cap, and that there is no automatic drift without the assist;
  - smart steering keeping karts on the road;
  - the slipstream boost and the graded rocket start;
  - wall grazes vs square hits, and item rank by gap;
  - full eight-computer races on every track.
- **Old vs new code** (`.scratch/compare.ts`): eight-computer races on the same seeds give winning times within about 3 s and similar spreads. Wall hits stay within seed-to-seed noise once the slipstream was tightened; an early, looser version boosted computer karts into corners.

# Architecture

```
 phones ──┐  inputs (30/s)                      ┌── packages/game ─────────────┐
          ├── WebSocket ── server ── WebSocket ─┤ the race: tracks, karts,     │
 TV ──────┘  status, dashboards     (relay +    │ items, AI. Pure, fixed-step,  │
                                     rooms +    │ no DOM: runs on the TV and in │
                                     records)   │ the tests.                    │
                                                └───────────────────────────────┘
```

## Who runs what

The **TV runs the race.** Rendering a 3D race for four players is the TV's job
anyway, so it also owns the simulation: inputs arrive, the race steps, the
screen draws. Nothing about the race is streamed back and forth, which keeps
it smooth even on a busy network.

The **server is a switchboard** (`apps/server`). It keeps each room's roster
(names, picked characters and karts, ready flags), the race settings and who
the host phone is; it relays phone inputs to the TV as they arrive, and passes
the TV's race status and per-player dashboards back out. It also keeps the
records file and the server's own settings (`admin.ts`): there is no config
file, everything is changed on the `/settings` page and read live. A room
expires a while after its TV leaves (30 minutes unless changed in Settings).

**Phones** (`apps/web/src/phone`) show the kart picker, the controller and the
results. The controller keeps its state in refs and sends the steering angle,
a button bitmask and an item-press counter 30 times a second (and on every
change). An item press is any increase of the counter, so a dropped packet can
never eat one.

## The simulation (`packages/game`)

- **Tracks** (`track/types.ts`, `tracks/*.ts`) are written as a closed loop of
  control points plus shortcuts, ramps, pads, zones, props and hazards, with
  positions along the road given in control-point units. `track/build.ts`
  compiles a track into:
  - paths resampled every metre, with a racing line relaxed toward minimum
    curvature for the computers;
  - a half-metre **grid** of surface, ground height, and *progress*: the
    distance along the main road, painted onto the ground. Shortcuts carry their
    own progress mapped onto the main road's, so a kart's place in the race is
    one lookup, wherever it is. Cells behind a wall are flagged, so a kart
    shoved through one is caught;
  - **colliders** (wall capsules along road edges, prop circles and boxes) in a
    spatial hash. Walls open automatically where another road meets them.
- **Karts** (`kart.ts`) are arcade physics on that grid: a heading, a forward
  speed that closes on top speed, and sideways slip that grip removes. Ordinary
  steering softens as speed builds, so the stick's travel covers the bends
  a track actually has instead of a few pixels of it. A drift
  always turns into the bend, on an arc the steering trims between wide and
  well past full lock, eased so it never jerks; every kart drifts much alike,
  handling mostly changes ordinary steering. It keeps its momentum (grip
  redirects the slide into the nose rather than scrubbing it off) and the
  body's swing into the corner is a pose that eases in and out, so the kart goes
  where it points. Charge builds at full rate for any real lean into the bend
  (a switch, not a slider, as in Mario Kart) into a boost. Steering from keys
  and arrow buttons is eased in; analog steering is passed through almost as
  is. Walls and ledges scrub speed by how square-on the hit was, so a graze
  costs almost nothing. The optional automatic drift lives here too. The
  kart leaves the ground only when gravity could not hold it there, which is
  what makes a ramp's lip a launch. `docs/HANDLING.md` has the research and
  measurements behind these numbers.
- **The race** (`race.ts`) steps everything: inputs, karts, items in flight,
  drops, hazards, kart-against-kart bumps (karts closing in slowly only rub; a
  real bump shoves apart, costs a little speed and turns glancing noses away,
  then a short cooldown; a moving or boosting kart is heavier), slipstreams, the graded rocket start, smart steering, item boxes
  (drawn by the gap to the leader more than by place), progress, laps and
  places, falls and the lift back onto the track. Its unwrapped distance is the
  ranking. Everything worth a sound or an effect goes onto `events`.
- **Computers** (`ai.ts`) follow the racing line with their own wandering lane,
  slow for bends they cannot take flat, drift long bends (letting go when the
  drift would carry them off the inside), steer around danger and toward item
  boxes, take shortcuts only if the way in is clear, time stompers, back out of
  trouble, and use items at someone. Rubber-banding keeps the pack near the
  players.

The race is deterministic for a given seed. `race.test.ts` runs full
eight-computer races on every track and checks they all finish, close together,
without anyone spending long behind a wall.

## The TV (`apps/web/src/tv`, `apps/web/src/game3d`)

- `director.ts` runs the show: the game loop (fixed 60 Hz steps, rendering
  interpolated between them), the order of races in a cup, who drives which
  kart, and turning race events into sounds, particle effects, phone buzzes and
  dashboards. React draws the menus around it.
- `view.ts` owns one WebGL renderer for the whole session and draws one camera
  or up to four viewports with scissoring; the sun's shadow map is drawn once a
  frame and shared. Cameras: chase (one per player), shared table-top, intro
  flyover, and a cinematic orbit for the lobby's demo race, results and podium.
  It lowers its resolution if frames get slow.
- `world.ts` builds a track's scenery from its compiled form: road ribbons,
  curbs, instanced walls, ramps, puddles, props and hazards. Everything static
  is merged by `kit.bake`, plain colours sharing meshes through vertex colours,
  so a whole room draws in a few dozen calls.
- Every model (`props.ts`, `kartModel.ts`), texture (`textures.ts`), sound
  effect and engine note (`audio/sound.ts`) and tune (`audio/music.ts`, nine of
  them written as chord charts and melodies) is generated in code.

## The Giant's Hand

Players who are not racing (finished, or joined late) reach into the race from
their phones. The phone sends a move (`p:giant`: a kind and a kart index); the
server checks its shape and passes it to the TV stamped with the sender. The
director decides whether that player is a giant now and has the charges, and
`Race.giant` whether the target can be picked (racing, on the track, not picked
in the last few seconds). Butter and gobstoppers become `race.giants`: a spot on
the road ahead of the target, in their lane, that lands after a fixed fall, so
the ring on the road is fair warning; a flick is a boost at once. Charges and
the list of targets reach the giant's phone in its dashboard (`Hud.giant`), and
a racer's dashboard carries `incoming` while something is falling for them.

## Security

| Who | Proves it with | Can do |
|---|---|---|
| TV | A 256-bit key returned when the room is made, kept in that browser | Everything in its room |
| Player | A token issued on joining, kept on that phone | Drive and pick for that one player; the host phone also changes settings and moves between races |
| Administrator | A session from signing in to `/settings` with the password (scrypt-hashed); the very first password needs the one-time setup code from the server log | Change settings, close rooms, edit the Hall of Fame |
| Anyone | Nothing | Make a room, join one with its code, read the records |

Keys and tokens are stored hashed. Every message from a phone is parsed with a
zod schema before it is used; each socket has a message budget; making rooms,
joining, connecting and password guesses are rate-limited per address.

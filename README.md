# RaceOff

Tiny karts, giant kitchen. A party kart racer for the living room: the race
runs on the TV, and up to four players drive with their phones. Computer
racers fill the grid to eight. No app, no accounts: scan the QR code on the
TV or type the four-letter room code.

Six tracks across two cups, each a household surface at kart scale: a kitchen
table, a study desk, a bathroom floor round a full tub, the garden sandpit, the
playroom carpet and the garage at night. Drifting with spark boosts, item
boxes, shortcuts, ramps and jumps, moving hazards, split screen or a shared
table-top camera, Grand Prix points, a podium, and a Hall of Fame of track
records.

## Run it

```sh
docker compose up -d --build
```

Open `http://<server>:3300` on the TV (a laptop plugged into one works well),
press **Start a room**, then **Click for sound** and **Full screen** (or F).
Players open the address shown in the lobby on their phones, or scan the QR
code, pick a name, a character and a kart, and press **Ready**. The first
player to join is the host: their phone also has the race settings and the
**Start** button. The TV can do all of that with a mouse too.

Without Docker (Node 22 or later):

```sh
npm install
npm run build
npm start          # http://localhost:3300
```

For development, `npm run dev` runs the server on 3300 and the web app with hot
reload on 5174. Open the TV at `http://localhost:5174/tv`; phones on the same
network use the address the lobby shows (the machine's network address, not
localhost).

### Settings

All optional, as environment variables (or in `.env` for Compose, see
`.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `RACEOFF_PORT` | `3300` | Port published on the Docker host. |
| `PUBLIC_URL` | empty | The address phones should open, e.g. `https://race.example.com`. Shown in the lobby and the QR code. Empty: the address the TV was opened with, or this machine's network address when the TV is on localhost. |
| `TRUST_PROXY` | `0` | Reverse proxies in front of the app: `0` if exposed directly, `1` behind one. Rate limits are per client address. |
| `DATA_DIR` | `/data` | Where the records file lives (a Docker volume). |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |

Behind a reverse proxy, forward to port 3300 with WebSocket support enabled:
RaceOff uses WebSockets only, never long-polling, to keep steering latency low.

## Playing

**On the phone.** Hold it sideways. The left half steers: put your thumb down
anywhere and slide left or right (or switch to tilt, or to two buttons, under
⚙). The right half has:

- **DRIFT**: hold it while turning to hop into a power slide. Sparks build
  from blue to orange to purple; let go for a speed boost that grows with them.
  Tap it in mid-air off a ramp for a trick and a boost on landing.
- **ITEM**: use what you are holding. Hold **BRAKE** at the same time to throw
  it backwards.
- **BRAKE**: slow down, and reverse when stopped.

The kart accelerates on its own; turn that off under ⚙ for a GAS button.
Tap DRIFT just as GO appears for a rocket start (too early and you stall).
Android phones buzz on hits, items and laps.

**On the keyboard.** For a quick game without phones, add up to two keyboard
players in the lobby: W A S D, Space to drift, E for items; and the arrow
keys, Right Shift to drift, Enter for items. On the TV, Esc or P pauses.

### Items

| Item | What it does |
|---|---|
| Bouncy Ball | Fires straight and bounces off walls up to five times. |
| Triple Balls | Three balls circle you, blocking hits, until fired one by one. |
| Seeker Bee | Follows the track and homes in on the racer one place ahead. |
| Oil Slick | Dropped behind: whoever drives through it spins. |
| Pop Bomb | Lobbed ahead (or dropped behind); bursts and flips everyone nearby. |
| Paper Jet | Flies to the leader and explodes on them. |
| Bubble | Absorbs one hit; lasts ten seconds. |
| Nitro / Triple Nitro | A burst of speed that also cuts through rough ground. |
| Sugar Rush | Faster and untouchable for a few seconds; bump others aside. |
| Toy Rocket | Takes the wheel and blasts you up the track. |

What a box gives depends on your place: the leader mostly gets defence, the
back of the field the big catch-up items. **Frantic** gives everyone the
back-of-the-field odds; **Off** removes items.

### Modes and options

- **Grand Prix**: a cup of three tracks. Points per place are 15, 12, 10, 8,
  6, 4, 2, 1; the cup leader starts each race at the back. Top three get the
  podium.
- **Single race**: any track, or a surprise.
- **Speed** 50cc, 100cc or 150cc; **Computers** easy, normal or hard (they ease
  off when far ahead of the players and push when far behind); **Racers**
  1 to 8; **Laps** 1 to 5.
- **Screen**: *Split* gives each player their own chase camera (side by side
  for two, quarters for three or four, with a live overview in the spare
  quarter). *Shared* is one table-top camera that keeps everyone in shot,
  like the old miniature racers.

### Records

Every race reports the players' times to the server. Track records (fastest
three-lap race at 100cc or faster, and best lap at any length) and a table of
cups, wins and podiums by name are kept in `DATA_DIR/records.json` and shown in
the lobby's **Hall of Fame** tab and at `/records`.

## How it is built

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short: TypeScript
throughout, npm workspaces, a small Express + Socket.IO server that keeps rooms
and relays messages, and a React + three.js web app. The race itself is a pure
simulation in `packages/game` that runs on the TV at a fixed 60 steps a second.
Every model, texture, sound and tune is generated in code: there are no asset
files.

```sh
npm test              # simulation and server tests, including full computer races on every track
npm run typecheck
npx tsx scripts/trackmap.ts garage out.png   # a track's compiled map with a computer race traced over it
```

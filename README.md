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

There is nothing to configure first: no `.env`, no environment variables.
Everything is set from RaceOff's own **Settings** page (below).

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

Open **Settings** from the home page (`/settings`). The first time, it asks for
a one-time setup code, which proves the server is yours before anyone can set
the password. The code is printed in the server's log on every start until a
password is set:

```sh
docker logs raceoff 2>&1 | grep setup
```

After that the page is behind the password, and every change applies the moment
it is saved, with no restart:

| Setting | Default | What it does |
|---|---|---|
| Phones join at | wherever the TV is | The address in the lobby and its QR code, e.g. `https://race.example.com`. By default, the address the TV was opened with. |
| Network | none | Reverse proxies in front of RaceOff: none, one (Nginx Proxy Manager, Caddy, Traefik), or Cloudflare in front of one. Rate limits are per phone, so this must match; the page says how your own request arrived. |
| New rooms start with | Grand Prix, 100cc, 8 racers, 3 laps | The race setup a new lobby opens on. |
| Rooms | close 30 min after the TV leaves | Also lists the rooms open now, with who is in them, and can close one. |
| Hall of Fame | | Take a name off the board, or wipe it. |
| Password and devices | | Change the password (signs every other device out), how long a sign-in lasts, and the devices signed in. |
| Activity | | Sign-ins, failed attempts and changes. |

Settings, records and open rooms are kept in `/data` (the `raceoff-data`
volume): `admin.json` (settings, the password's scrypt hash, sign-ins),
`records.json` and `rooms.json`.

**Lost the password?** Run
`docker compose exec raceoff node apps/server/dist/index.js reset-admin-password`,
then `docker compose restart raceoff`, and set a new one with the setup code the
restart prints.

The port is set in `docker-compose.yml` (`3300:3300`); change the left number to
publish it elsewhere.

**Behind a reverse proxy**, forward to port 3300 with WebSocket support enabled:
RaceOff uses WebSockets only, never long-polling, to keep steering latency low.
Then set **Network** in Settings to match.

Phones work over plain `http://` on the local network, but browsers only allow
tilt steering and keeping the screen awake on a secure (`https://`) address.
Serve RaceOff over HTTPS (a reverse proxy with a certificate) to have those.

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

/**
 * Who can race and in what. Everything here is plain data shared by the TV,
 * the phones and the simulation: names and colours for the screens, stats for
 * the physics.
 *
 * Stats run from 1 to 5. A character's stats and a body's adjustments are
 * added together and clamped, so every combination stays inside the same range
 * and no pairing is strictly better than another.
 */

export interface Stats {
  /** Top speed. */
  speed: number;
  /** How quickly top speed is reached, and recovered after a hit. */
  accel: number;
  /** How sharply the kart turns and how much it grips. */
  handling: number;
  /** Who wins a shove. Heavy karts also lose less speed off-road. */
  weight: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** One line for the selection screen. */
  tagline: string;
  /** Main body colour, as a CSS hex string. */
  color: string;
  /** Second colour, for trim and details. */
  accent: string;
  stats: Stats;
}

export const CHARACTERS = [
  { id: 'zip', name: 'Zip', tagline: 'A fox who never brakes', color: '#ff7a1a', accent: '#fff3e0', stats: { speed: 4, accel: 3, handling: 3, weight: 2 } },
  { id: 'bonk', name: 'Bonk', tagline: 'Big bear, bigger bumper', color: '#8a5a3c', accent: '#f2c28b', stats: { speed: 5, accel: 2, handling: 2, weight: 5 } },
  { id: 'volt', name: 'Volt', tagline: 'Wind-up robot, fully charged', color: '#2ec4f0', accent: '#d6e4ee', stats: { speed: 3, accel: 3, handling: 3, weight: 3 } },
  { id: 'duckie', name: 'Duckie', tagline: 'Fresh out of the bathtub', color: '#ffd23f', accent: '#ff8a1f', stats: { speed: 2, accel: 5, handling: 4, weight: 1 } },
  { id: 'mochi', name: 'Mochi', tagline: 'Lands on four wheels', color: '#ff7eb6', accent: '#ffffff', stats: { speed: 3, accel: 4, handling: 5, weight: 2 } },
  { id: 'hopper', name: 'Hopper', tagline: 'Frog with a turbo croak', color: '#4cd964', accent: '#e8ffd9', stats: { speed: 4, accel: 3, handling: 2, weight: 4 } },
  { id: 'pebble', name: 'Pebble', tagline: 'Penguin on thin ice', color: '#3b4a6b', accent: '#ffffff', stats: { speed: 3, accel: 4, handling: 4, weight: 2 } },
  { id: 'ember', name: 'Ember', tagline: 'Tiny dragon, huge drifts', color: '#e8384f', accent: '#ffd166', stats: { speed: 4, accel: 2, handling: 4, weight: 3 } },
] as const satisfies readonly CharacterDef[];

export type CharacterId = (typeof CHARACTERS)[number]['id'];

export interface BodyDef {
  id: string;
  name: string;
  tagline: string;
  /** Added to the character's stats. */
  mod: Stats;
}

export const BODIES = [
  { id: 'racer', name: 'Racer', tagline: 'Low, light and quick', mod: { speed: 1, accel: 0, handling: 0, weight: -1 } },
  { id: 'buggy', name: 'Buggy', tagline: 'Springy and nimble', mod: { speed: -1, accel: 1, handling: 1, weight: -1 } },
  { id: 'truck', name: 'Monster', tagline: 'Heavy and unstoppable', mod: { speed: 0, accel: -1, handling: -1, weight: 2 } },
] as const satisfies readonly BodyDef[];

export type BodyId = (typeof BODIES)[number]['id'];

export const characterById = (id: string): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
export const bodyById = (id: string): BodyDef => BODIES.find((b) => b.id === id) ?? BODIES[0];

const clampStat = (n: number) => Math.max(1, Math.min(5, n));

export function combinedStats(character: string, body: string): Stats {
  const c = characterById(character).stats;
  const m = bodyById(body).mod;
  return {
    speed: clampStat(c.speed + m.speed),
    accel: clampStat(c.accel + m.accel),
    handling: clampStat(c.handling + m.handling),
    weight: clampStat(c.weight + m.weight),
  };
}

// ---------------------------------------------------------------- items

export const ITEMS = [
  { id: 'ball', name: 'Bouncy Ball', kind: 'attack', hint: 'Fires straight ahead and bounces off walls. Hold brake to throw it backwards.' },
  { id: 'ball3', name: 'Triple Balls', kind: 'attack', hint: 'Three balls circle you as a shield. Fire them one at a time.' },
  { id: 'seeker', name: 'Seeker Bee', kind: 'attack', hint: 'Chases down the racer in front of you.' },
  { id: 'oil', name: 'Oil Slick', kind: 'defend', hint: 'Dropped behind you. Anyone who drives through it spins.' },
  { id: 'bomb', name: 'Pop Bomb', kind: 'attack', hint: 'Lobbed ahead, it bursts and sends nearby racers flying.' },
  { id: 'plane', name: 'Paper Jet', kind: 'attack', hint: 'Flies straight to the leader and blows up on them.' },
  { id: 'shield', name: 'Bubble', kind: 'defend', hint: 'Soaks up one hit. Lasts ten seconds.' },
  { id: 'nitro', name: 'Nitro', kind: 'speed', hint: 'One big burst of speed. Cuts through rough ground.' },
  { id: 'nitro3', name: 'Triple Nitro', kind: 'speed', hint: 'Three bursts of speed.' },
  { id: 'sugar', name: 'Sugar Rush', kind: 'speed', hint: 'Faster and untouchable for a few seconds. Bump others aside.' },
  { id: 'rocket', name: 'Toy Rocket', kind: 'speed', hint: 'Takes the wheel and blasts you up the field.' },
] as const;

export type ItemId = (typeof ITEMS)[number]['id'];
export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

// ---------------------------------------------------------------- tracks

export interface TrackMeta {
  id: string;
  name: string;
  /** Where it is, in the house. */
  place: string;
  cup: CupId;
  /** A colour that stands for the track in menus. */
  color: string;
  blurb: string;
}

export const CUPS = [
  { id: 'home', name: 'Kitchen Cup', blurb: 'Three laps around the house' },
  { id: 'wild', name: 'Backyard Cup', blurb: 'Outside, and out of control' },
] as const;
export type CupId = (typeof CUPS)[number]['id'];

export const TRACKS = [
  { id: 'breakfast', name: 'Breakfast Bend', place: 'The kitchen table', cup: 'home', color: '#ff5d5d', blurb: 'Round the cereal bowl, through the milk, off the toast.' },
  { id: 'desk', name: 'Office Overdrive', place: 'The study desk', cup: 'home', color: '#5d8bff', blurb: 'Pencil barriers, a book jump and a stapler that bites.' },
  { id: 'bath', name: 'Bubble Bath Bay', place: 'The bathroom', cup: 'home', color: '#3ad1c5', blurb: 'Slippery soap, a sponge ramp and a leap over the tub.' },
  { id: 'sandbox', name: 'Sandcastle Circuit', place: 'The garden', cup: 'wild', color: '#f2b64a', blurb: 'Sand, sprinklers and a moat jump by the castle.' },
  { id: 'toybox', name: 'Toybox Tangle', place: 'The playroom floor', cup: 'wild', color: '#b07cff', blurb: 'Dodge the toy train and the spinning top.' },
  { id: 'garage', name: 'Grease Lightning', place: 'The garage at night', cup: 'wild', color: '#ff9f1c', blurb: 'Oil slicks, rolling paint cans and a big ramp jump.' },
] as const satisfies readonly TrackMeta[];

export type TrackId = (typeof TRACKS)[number]['id'];
export const trackById = (id: string): TrackMeta => TRACKS.find((t) => t.id === id) ?? TRACKS[0];
export const cupTracks = (cup: string) => TRACKS.filter((t) => t.cup === cup);

/** Grand Prix points for each finishing place, best first. */
export const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

export const MAX_PLAYERS = 4;
export const MAX_RACERS = 8;

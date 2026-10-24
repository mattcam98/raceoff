/**
 * Runs the show on the TV: the game loop, the order of races in a cup, who
 * drives which kart, and turning race events into sound, effects, phone
 * buzzes and dashboards. React draws the menus around it and reads its state
 * through `subscribe` / `getState`.
 */
import {
  BODIES, BTN, CHARACTERS, characterById, cupTracks, GIANT_COST, GIANT_MAX_CHARGE, GIANT_RECHARGE, GP_POINTS, TRACKS, trackById,
  type GameStatus, type GiantHud, type GiantMove, type HapticKind, type Hud as PhoneHud, type MenuCommand, type PlayerInfo, type RecordNews, type RoomSettings,
  type RoomView, type Standing,
} from '@raceoff/shared';
import { AiDriver, getTrack, NO_INPUT, Race, rng, STEP, type KartInput, type RaceEvent, type RacerSpec } from '@raceoff/game';
import { music, songFor } from '../audio/music';
import { audioReady, EngineVoice, play, type SoundName } from '../audio/sound';
import type { GameView } from '../game3d/view';
import type { TvLink } from '../lib/net';
import { ordinal } from '../ui/art';
import { escapeHtml, type Hud } from './hud';
import { KeyboardPads } from './keyboard';

export type TvPhase = 'lobby' | 'intro' | 'race' | 'results' | 'standings' | 'podium';

export interface SeriesRacer extends RacerSpec {
  points: number;
  lastPlace: number;
}

export interface DirectorState {
  phase: TvPhase;
  track: string;
  raceIndex: number;
  raceCount: number;
  /** The race just run, best first. */
  results: Standing[];
  /** The cup so far, best first. */
  standings: Standing[];
  records: RecordNews[];
  paused: boolean;
  /** Seconds until results move on by themselves. */
  autoIn: number | null;
}

interface PadState {
  steer: number;
  b: number;
  /** Buttons pressed since the last step: a tap whose press and release land in one frame still counts once. */
  pressed: number;
  itemSeen: number;
  pendingItem: boolean;
  at: number;
}

const INTRO_SECONDS = 4.4;
/** How long the race runs on for the giants once every human is home, unless the computers finish first. */
const GIANT_TIME = 30;
const RESULTS_AUTO = 18;
const ITEM_SOUNDS: Record<string, SoundName> = {
  ball: 'throw', ball3: 'throw', seeker: 'bee', oil: 'oil', bomb: 'bombThrow', plane: 'jet', shield: 'shield',
  nitro: 'nitro', nitro3: 'nitro', sugar: 'sugar', rocket: 'rocket',
};

export class Director {
  private state: DirectorState = {
    phase: 'lobby', track: 'breakfast', raceIndex: 0, raceCount: 1, results: [], standings: [], records: [], paused: false, autoIn: null,
  };
  private listeners = new Set<() => void>();
  private room: RoomView | null = null;
  private race: Race | null = null;
  private attract = true;
  private series: SeriesRacer[] = [];
  private tracks: string[] = [];
  private settings: RoomSettings | null = null;
  private kartPid: (string | null)[] = [];
  private pads = new Map<string, PadState>();
  private keyboard = new KeyboardPads();
  private engines: (EngineVoice | null)[] = [];
  private driftLevels: number[] = [];
  private finalLapPlayed = false;
  private phaseT = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private hudSent = new Map<string, string>();
  private hudTimer = 0;
  private autoT = 0;
  private attractTrack = '';
  private running = false;
  /** Development aid: computers drive the humans' karts too. */
  autopilot = false;
  private autoDrivers: (AiDriver | null)[] = [];
  /** The Giant's Hand: each giant's charges, by player id. */
  private giantCharge = new Map<string, number>();
  /** Race time until which a flicked racer's phone shows the flick. */
  private flickedUntil: number[] = [];
  /** For a giant with a kart in the race: the racer they last picked, whom their TV camera follows. */
  private giantPicked = new Map<number, number>();

  constructor(
    private link: TvLink,
    private view: GameView,
    private hud: Hud,
  ) {
    link.onInput = (i) => {
      let p = this.pads.get(i.pid);
      if (!p) {
        p = { steer: 0, b: 0, pressed: 0, itemSeen: i.i, pendingItem: false, at: 0 };
        this.pads.set(i.pid, p);
      }
      p.steer = i.s / 100;
      p.pressed |= i.b & ~p.b;
      p.b = i.b;
      if (i.i > p.itemSeen) p.pendingItem = true;
      p.itemSeen = i.i;
      p.at = performance.now();
    };
    link.onCommand = ({ cmd }) => this.command(cmd);
    link.onGiant = (move) => this.giantMove(move);
    view.onLayout = (rects) => this.hud.layout(rects);
  }

  // ---------------------------------------------------------------- React

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<DirectorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  // ---------------------------------------------------------------- lifecycle

  begin() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.keyboard.attach();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
    this.startAttract();
    // A TV that reloads mid-race starts again in the lobby: tell the phones so.
    this.publish();
    // After a blip or a server restart the server may hold an old status, and phones an old dashboard.
    this.link.onConnect = () => {
      this.hudSent.clear();
      this.publish();
    };
  }

  end() {
    this.link.onConnect = () => {};
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.keyboard.detach();
    this.stopEngines();
    music.stop();
  }

  setRoom(room: RoomView) {
    const prev = this.room;
    this.room = room;
    this.settings = room.settings;
    // A phone that has just come back needs its whole dashboard, not only what changes from now on.
    for (const p of room.players) {
      if (p.connected && !prev?.players.find((q) => q.id === p.id)?.connected) this.hudSent.delete(p.id);
    }
    this.keyboard.setPlayers(room.players.filter((p) => p.local).map((p) => p.id));
    this.markAway();
    // New arrivals get a little pop.
    if (prev && room.players.length > prev.players.length && this.state.phase === 'lobby') play('join');
    if (this.state.phase === 'lobby' && this.attract) {
      const want = this.lobbyTrack();
      if (want !== this.attractTrack) this.startAttract();
    }
  }

  /** A racer whose phone has dropped mid-race gets a sign on their view, so the room knows why they stopped. */
  private markAway() {
    const race = this.race;
    if (!race || this.attract || !this.room) return;
    race.karts.forEach((k, i) => {
      const pid = this.kartPid[i];
      if (!pid || k.cpu) return;
      const p = this.room!.players.find((q) => q.id === pid);
      this.hud.setAway(i, !!p && !p.local && !p.connected);
    });
  }

  private lobbyTrack() {
    const s = this.settings;
    if (!s) return 'breakfast';
    if (s.mode === 'gp') return cupTracks(s.cup)[0]?.id ?? 'breakfast';
    return s.track === 'random' ? (this.attractTrack || TRACKS[0].id) : s.track;
  }

  // ---------------------------------------------------------------- commands

  command(cmd: MenuCommand) {
    const phase = this.state.phase;
    if (cmd === 'pause' && (phase === 'race' || phase === 'intro')) return this.setPaused(true);
    if (cmd === 'resume') return this.setPaused(false);
    if (this.state.paused && cmd === 'lobby') {
      this.setPaused(false);
      return this.toLobby();
    }
    if (this.state.paused && cmd === 'again') {
      this.setPaused(false);
      return this.restartRace();
    }
    switch (phase) {
      case 'lobby':
        if (cmd === 'start') this.startSeries();
        break;
      case 'intro':
        if (cmd === 'skip' || cmd === 'next') this.phaseT = INTRO_SECONDS;
        break;
      case 'race':
        // Everyone is home and the giants are playing: the host can call it.
        if (cmd === 'skip') this.race?.endNow();
        break;
      case 'results':
        if (cmd === 'next' || cmd === 'start' || cmd === 'skip') this.afterResults();
        else if (cmd === 'again' && this.tracks.length === 1) this.restartRace();
        else if (cmd === 'lobby') this.toLobby();
        break;
      case 'standings':
        if (cmd === 'next' || cmd === 'start' || cmd === 'skip') this.nextRace();
        else if (cmd === 'lobby') this.toLobby();
        break;
      case 'podium':
        if (cmd === 'next' || cmd === 'lobby' || cmd === 'start' || cmd === 'skip') this.toLobby();
        else if (cmd === 'again') this.startSeries();
        break;
    }
  }

  setPaused(paused: boolean) {
    if (paused === this.state.paused) return;
    this.set({ paused });
    play(paused ? 'back' : 'select');
    if (paused) this.stopEngines();
    this.publish();
  }

  /** Can the race start? At least one player, everyone on a phone connected. */
  canStart(): boolean {
    return !!this.room && this.room.players.length > 0;
  }

  // ---------------------------------------------------------------- the lobby's demo race

  private startAttract() {
    const id = this.lobbyTrack();
    this.attractTrack = id;
    this.attract = true;
    const track = getTrack(id);
    const used = new Set<string>();
    const racers: RacerSpec[] = CHARACTERS.map((c, i) => {
      used.add(c.id);
      return { id: `demo:${i}`, name: c.name, character: c.id, body: BODIES[i % BODIES.length].id, cpu: true, slot: -1 };
    });
    this.race = new Race({ track, racers: shuffle(racers), laps: 99, cc: 100, items: 'normal', difficulty: 'hard', seed: (Math.random() * 1e9) | 0 });
    // Skip the countdown: the demo is already under way when you walk in.
    for (let i = 0; i < 200; i++) this.race.step([]);
    this.race.events.length = 0;
    this.view.setRace(this.race, [], 'cinema');
    this.view.setCamera('cinema');
    this.hud.setVisible(false);
    this.stopEngines();
    if (audioReady()) music.play('menu');
  }

  // ---------------------------------------------------------------- series

  private startSeries() {
    if (!this.canStart() || !this.room) return;
    const s = this.room.settings;
    this.settings = s;
    this.tracks = s.mode === 'gp' ? cupTracks(s.cup).map((t) => t.id) : [s.track === 'random' ? TRACKS[Math.floor(Math.random() * TRACKS.length)].id : s.track];
    this.series = [];
    this.set({ raceIndex: 0, raceCount: this.tracks.length, results: [], standings: [], records: [] });
    play('start');
    this.beginRace();
  }

  /** Humans from the room, then computers to fill the grid, each with their running points. */
  private lineup(): SeriesRacer[] {
    const room = this.room!;
    const s = this.settings!;
    const humans = room.players.slice().sort((a, b) => a.slot - b.slot);
    const keep = new Map(this.series.map((r) => [r.id, r]));
    const out: SeriesRacer[] = humans.map((p: PlayerInfo) => ({
      id: p.id, name: p.name, character: p.character, body: p.body, cpu: false, slot: p.slot,
      points: keep.get(p.id)?.points ?? 0, lastPlace: keep.get(p.id)?.lastPlace ?? 99,
    }));
    const taken = new Set(out.map((r) => r.character));
    const cpus = Math.max(0, s.racers - out.length);
    const pool = shuffle(CHARACTERS.filter((c) => !taken.has(c.id)).map((c) => c.id));
    // Keep the same computer racers from race to race in a cup.
    const oldCpus = this.series.filter((r) => r.cpu && !taken.has(r.character));
    for (let i = 0; i < cpus; i++) {
      const old = oldCpus[i];
      if (old) {
        out.push({ ...old });
        continue;
      }
      const ch = pool[i % pool.length] ?? CHARACTERS[i % CHARACTERS.length].id;
      out.push({ id: `cpu:${i}`, name: characterById(ch).name, character: ch, body: BODIES[(i * 7 + 1) % BODIES.length].id, cpu: true, slot: -1, points: 0, lastPlace: 99 });
    }
    return out;
  }

  private beginRace() {
    const s = this.settings!;
    const trackId = this.tracks[this.state.raceIndex];
    const lineup = this.lineup();
    // First race: computers ahead, players at the back. After that, the cup leader starts last.
    const grid = this.state.raceIndex === 0
      ? [...shuffle(lineup.filter((r) => r.cpu)), ...shuffle(lineup.filter((r) => !r.cpu))]
      : [...lineup].sort((a, b) => a.points - b.points || b.lastPlace - a.lastPlace);
    this.series = lineup;
    this.attract = false;
    const track = getTrack(trackId);
    // With the Giant's Hand on and phones in the room, the race runs on after the humans are home, for the giants.
    const giantTime = s.giants && this.room?.players.some((p) => !p.local) ? GIANT_TIME : 0;
    this.race = new Race({ track, racers: grid, laps: s.laps, cc: s.cc, items: s.items, difficulty: s.difficulty, seed: (Math.random() * 1e9) | 0, giantTime });
    this.kartPid = this.race.karts.map((k) => (k.cpu ? null : k.id));
    const race = this.race;
    this.autoDrivers = race.karts.map((k) => (k.cpu ? null : new AiDriver(race, k, 'hard', rng(k.index + 1))));
    for (const p of this.pads.values()) p.pendingItem = false;
    const humans = this.race.karts.filter((k) => !k.cpu).sort((a, b) => a.slot - b.slot).map((k) => k.index);
    this.view.setRace(this.race, humans, s.camera === 'shared' || humans.length === 0 ? 'shared' : 'split');
    this.view.setCamera('intro');
    this.hud.setRace(this.race);
    this.markAway();
    this.hud.setVisible(false);
    this.finalLapPlayed = false;
    this.driftLevels = this.race.karts.map(() => 0);
    this.giantCharge.clear();
    this.giantPicked.clear();
    this.flickedUntil = this.race.karts.map(() => -Infinity);
    this.hudSent.clear();
    this.phaseT = 0;
    this.set({ phase: 'intro', track: trackId, records: [], paused: false, autoIn: null });
    this.publish();
    if (audioReady()) music.play(songFor(trackId));
    play('whoosh');
  }

  private restartRace() {
    if (!this.settings || !this.tracks.length) return;
    // Points from a race thrown away are not kept.
    this.beginRace();
  }

  private toRace() {
    this.view.setCamera('chase');
    this.hud.setVisible(true);
    this.startEngines();
    this.set({ phase: 'race' });
    this.publish();
  }

  private finishRace() {
    const race = this.race!;
    this.stopEngines();
    const byPlace = [...race.karts].sort((a, b) => a.place - b.place);
    const results: Standing[] = byPlace.map((k) => {
      const r = this.series.find((x) => x.id === k.id)!;
      const pts = GP_POINTS[k.place - 1] ?? 0;
      r.points += pts;
      r.lastPlace = k.place;
      return {
        id: k.id, name: k.name, character: k.character, cpu: k.cpu, place: k.place,
        time: k.finishTime !== null ? k.finishTime * 1000 : null, bestLap: k.bestLap !== null ? k.bestLap * 1000 : null,
        points: pts, total: r.points,
      };
    });
    this.set({ phase: 'results', results, standings: this.standings(), autoIn: RESULTS_AUTO });
    this.autoT = RESULTS_AUTO;
    this.hud.setVisible(false);
    this.view.focus(byPlace[0].index);
    this.view.setCamera('cinema');
    const bestHuman = byPlace.find((k) => !k.cpu);
    if (audioReady()) {
      // A slow fade-in, so the win or lose jingle is heard on its own first.
      music.play('results', 1.5);
      play(bestHuman && bestHuman.place <= 3 ? 'win' : 'lose');
    }
    this.publish();
    // Report the humans' race for the records; the server says what was broken.
    const s = this.settings!;
    const last = this.state.raceIndex === this.tracks.length - 1;
    const cupWinner = last && s.mode === 'gp' ? this.standings()[0] : null;
    void this.link
      .report({
        track: this.state.track as never,
        // The race's own: the host may have changed the setting since it started.
        laps: race.laps,
        cc: s.cc,
        results: results.filter((r) => !r.cpu).map((r) => ({ name: r.name, character: r.character as never, place: r.place, time: r.time, bestLap: r.bestLap })),
        cupWinner: cupWinner && !cupWinner.cpu ? cupWinner.name : null,
      })
      .then((records) => {
        if (!records.length || this.state.phase !== 'results') return;
        this.set({ records });
        play('record');
        this.publish();
      });
  }

  private standings(): Standing[] {
    return [...this.series]
      .sort((a, b) => b.points - a.points || a.lastPlace - b.lastPlace)
      .map((r, i) => ({ id: r.id, name: r.name, character: r.character, cpu: r.cpu, place: i + 1, time: null, bestLap: null, points: 0, total: r.points }));
  }

  private afterResults() {
    if (this.state.phase !== 'results') return;
    if (this.tracks.length > 1) {
      this.set({ phase: 'standings', standings: this.standings(), autoIn: RESULTS_AUTO });
      this.autoT = RESULTS_AUTO;
      play('select');
      this.publish();
    } else {
      this.toLobby();
    }
  }

  private nextRace() {
    if (this.state.raceIndex + 1 < this.tracks.length) {
      this.set({ raceIndex: this.state.raceIndex + 1 });
      this.beginRace();
    } else {
      this.toPodium();
    }
  }

  private toPodium() {
    const top = this.standings().slice(0, 3);
    if (this.race) {
      const idx = top.map((s) => this.race!.karts.find((k) => k.id === s.id)?.index ?? 0);
      this.view.showPodium(idx);
    }
    this.view.setCamera('podium');
    this.set({ phase: 'podium', standings: this.standings(), autoIn: null });
    if (audioReady()) music.play('podium', 1.5);
    play('win');
    this.publish();
  }

  toLobby() {
    this.stopEngines();
    this.series = [];
    this.set({ phase: 'lobby', raceIndex: 0, results: [], standings: [], records: [], paused: false, autoIn: null });
    this.startAttract();
    this.publish();
  }

  /** Tell the phones where we are. */
  private publish() {
    const st = this.state;
    const status: GameStatus = {
      phase: st.phase, track: st.phase === 'lobby' ? null : st.track, raceIndex: st.raceIndex, raceCount: st.raceCount,
      standings: st.phase === 'results' ? st.results : st.standings, records: st.records, paused: st.paused,
      racers: st.phase === 'lobby' ? [] : this.series.filter((r) => !r.cpu).map((r) => r.id),
    };
    this.link.status(status);
  }

  // ---------------------------------------------------------------- the loop

  private frame(now: number) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.max(0, Math.min(dt, 0.1));
    const race = this.race;
    const phase = this.state.phase;
    const paused = this.state.paused;

    if (race && !paused) {
      if (phase === 'intro') {
        this.phaseT += dt;
        if (this.phaseT >= INTRO_SECONDS) this.toRace();
      }
      const stepping = phase === 'lobby' || phase === 'race' || phase === 'results' || phase === 'standings';
      if (stepping) {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < 6) {
          race.step(this.collectInputs(race));
          this.acc -= STEP;
          steps++;
          if (phase === 'race') this.chargeGiants(race);
          this.handleEvents(race);
        }
        if (steps === 6) this.acc = 0;
        if (phase === 'race' && race.over) this.finishRace();
        if (this.attract && race.over) this.startAttract();
      } else {
        this.acc = 0;
      }
      if ((phase === 'results' || phase === 'standings') && this.state.autoIn !== null) {
        this.autoT -= dt;
        const whole = Math.max(0, Math.ceil(this.autoT));
        if (whole !== this.state.autoIn) this.set({ autoIn: whole });
        if (this.autoT <= 0) {
          if (phase === 'results') this.afterResults();
          else this.nextRace();
        }
      }
    }
    const alpha = phase === 'intro' ? 1 : this.acc / STEP;
    this.view.render(alpha, paused ? 0 : dt);
    if (phase === 'race' && race) {
      this.followForGiants(race);
      this.hud.update();
      this.updateEngines(race);
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.hudTimer = 0.1;
        this.sendHuds(race);
      }
    }
  }

  private collectInputs(race: Race): (KartInput | undefined)[] {
    const now = performance.now();
    return race.karts.map((_k, i) => {
      const pid = this.kartPid[i];
      if (!pid) return undefined;
      if (this.autopilot && this.autoDrivers[i]) return this.autoDrivers[i]!.decide(STEP);
      const kb = this.keyboard.input(pid);
      if (kb) return kb;
      const p = this.pads.get(pid);
      // A phone that has gone quiet stops steering rather than holding its last input forever.
      if (!p || now - p.at > 1500) return NO_INPUT;
      const item = p.pendingItem;
      p.pendingItem = false;
      const b = p.b | p.pressed;
      p.pressed = 0;
      return {
        steer: p.steer,
        gas: (b & BTN.gas) !== 0,
        brake: (b & BTN.brake) !== 0,
        drift: (b & BTN.drift) !== 0,
        back: (b & BTN.back) !== 0 || (b & BTN.brake) !== 0,
        item,
        digital: (b & BTN.digital) !== 0,
        autoDrift: (b & BTN.autoDrift) !== 0,
        smart: (b & BTN.smart) !== 0,
      };
    });
  }

  // ---------------------------------------------------------------- events

  private panOf(kart: number): number {
    const rects = this.view.viewports;
    const r = rects.find((x) => x.kart === kart);
    if (!r || rects.length === 1) return 0;
    const W = rects.reduce((m, x) => Math.max(m, x.x + x.w), 1);
    return ((r.x + r.w / 2) / W - 0.5) * 1.2;
  }

  /** How loud something happening at (x, z) should be: full near a human, silent far away. */
  private nearness(x: number, z: number) {
    const race = this.race!;
    let d = Infinity;
    for (const k of race.karts) if (!k.cpu) d = Math.min(d, Math.hypot(k.x - x, k.z - z));
    if (!Number.isFinite(d)) return this.attract ? 0.25 : 0.6;
    return Math.max(0, 1 - d / 90);
  }

  private haptic(kart: number, kind: HapticKind) {
    const pid = this.kartPid[kart];
    if (pid && !pid.startsWith('cpu:')) this.link.haptic(pid, kind);
  }

  private handleEvents(race: Race) {
    const events = race.events;
    race.events = [];
    for (const e of events) {
      this.view.event(e);
      this.sound(race, e);
    }
    // Spark colour changes in a drift get a chime.
    if (!this.attract) {
      for (const k of race.karts) {
        if (k.cpu) continue;
        const level = k.driftLevel;
        if (level > this.driftLevels[k.index]) {
          play(`spark${level}` as SoundName, this.panOf(k.index), 0.8);
          // With several players on one TV the chime does not say whose sparks they are; a buzz in the hand does.
          this.haptic(k.index, `spark${level}` as HapticKind);
        }
        this.driftLevels[k.index] = level;
      }
    }
  }

  private sound(race: Race, e: RaceEvent) {
    const attract = this.attract;
    const human = (k: number) => !race.karts[k].cpu && !attract;
    const at = (k: number) => this.nearness(race.karts[k].x, race.karts[k].z);
    switch (e.t) {
      case 'countdown':
        if (attract) return;
        play('count');
        this.hud.count(String(e.n));
        race.karts.forEach((k) => !k.cpu && this.haptic(k.index, 'tick'));
        break;
      case 'go':
        if (attract) return;
        play('go');
        this.hud.count('GO!', 800);
        race.karts.forEach((k) => !k.cpu && this.haptic(k.index, 'go'));
        break;
      case 'start':
        if (!human(e.k)) return;
        if (e.good) {
          play('turbo', this.panOf(e.k));
          this.hud.banner(e.k, 'ROCKET START!', 'good', 1400);
        } else {
          play('stall', this.panOf(e.k));
          this.hud.banner(e.k, 'Stalled!', 'warn', 1200);
        }
        break;
      case 'box':
        if (human(e.k)) {
          play('box', this.panOf(e.k), 0.9);
          if (race.karts[e.k].rollT > 0) play('roll', this.panOf(e.k), 0.7);
        }
        break;
      case 'got':
        if (human(e.k)) {
          play('got', this.panOf(e.k), 0.8);
          this.haptic(e.k, 'item');
        }
        break;
      case 'use': {
        const g = human(e.k) ? 1 : at(e.k) * 0.6;
        if (g > 0.05) play(ITEM_SOUNDS[e.item] ?? 'throw', this.panOf(e.k), g);
        if (human(e.k) && (e.item === 'nitro' || e.item === 'nitro3' || e.item === 'rocket' || e.item === 'sugar')) this.haptic(e.k, 'boost');
        break;
      }
      case 'hit': {
        const g = human(e.k) ? 1 : at(e.k) * 0.6;
        if (g > 0.05) play(e.how === 'squash' ? 'squash' : 'hit', this.panOf(e.k), g);
        if (human(e.k)) this.haptic(e.k, 'hit');
        if (e.by >= 0 && human(e.by) && e.by !== e.k) {
          this.hud.banner(e.by, `Got ${race.karts[e.k].name}!`, 'good', 1200);
          // Landing a shot should feel as big as taking one: loud on the attacker's side, and in their hand.
          if (!human(e.k)) play(e.how === 'squash' ? 'squash' : 'hit', this.panOf(e.by), 0.8);
          this.haptic(e.by, 'item');
        }
        break;
      }
      case 'shield': {
        const g = human(e.k) ? 1 : at(e.k) * 0.6;
        if (g > 0.05) play('shieldPop', this.panOf(e.k), g);
        break;
      }
      case 'blast': {
        const g = attract ? 0.15 : this.nearness(e.x, e.z);
        if (g > 0.05) play('blast', 0, g);
        break;
      }
      case 'boost':
        if (!human(e.k)) return;
        if (e.kind === 'drift') {
          play('turbo', this.panOf(e.k), 0.5 + e.level * 0.2);
          this.haptic(e.k, 'boost');
        } else if (e.kind === 'pad') {
          play('pad', this.panOf(e.k));
          this.haptic(e.k, 'boost');
        } else if (e.kind === 'trick') {
          play('trick', this.panOf(e.k));
          this.hud.banner(e.k, 'TRICK!', 'good', 900);
        } else if (e.kind === 'draft') {
          play('whoosh', this.panOf(e.k), 0.7);
          this.haptic(e.k, 'boost');
          this.hud.banner(e.k, 'SLIPSTREAM!', 'good', 800);
        }
        break;
      case 'drift':
        if (e.on && human(e.k)) play('drift', this.panOf(e.k), 0.6);
        // Charged sparks thrown away (a wall, a hit, too slow): a fizzle, so the loss is heard, not just missed.
        else if (e.lost && human(e.k)) play('stall', this.panOf(e.k), 0.5);
        break;
      case 'wall':
        if (human(e.k) && e.strength > 6) {
          play('wall', this.panOf(e.k), Math.min(1, e.strength / 25));
          if (e.strength > 12) this.haptic(e.k, 'bump');
        }
        break;
      case 'bump':
        if (human(e.a) || human(e.b)) {
          play('bump', this.panOf(human(e.a) ? e.a : e.b), Math.min(1, e.strength / 15));
          if (human(e.a)) this.haptic(e.a, 'bump');
          if (human(e.b)) this.haptic(e.b, 'bump');
        }
        break;
      case 'land':
        if (human(e.k) && e.hard) {
          play('land', this.panOf(e.k));
          this.haptic(e.k, 'bump');
        }
        break;
      case 'fall':
        if (human(e.k)) {
          play(e.water ? 'splash' : 'fall', this.panOf(e.k));
          this.haptic(e.k, 'hit');
        } else if (!attract && at(e.k) > 0.3 && e.water) play('splash', 0, at(e.k) * 0.5);
        break;
      case 'respawn':
        if (human(e.k)) play('respawn', this.panOf(e.k), 0.7);
        break;
      case 'lap':
        if (!human(e.k)) return;
        this.haptic(e.k, 'lap');
        if (e.lap === race.laps) {
          this.hud.banner(e.k, 'FINAL LAP!', 'final', 2200);
          if (!this.finalLapPlayed) {
            this.finalLapPlayed = true;
            play('finalLap');
            music.setTempo(1.12);
          }
        } else {
          play('lap', this.panOf(e.k));
          this.hud.banner(e.k, `LAP ${e.lap}`, 'info', 1400);
        }
        break;
      case 'finish':
        if (!human(e.k)) return;
        play('finish', this.panOf(e.k));
        this.haptic(e.k, 'finish');
        this.hud.banner(e.k, `${ordinal(e.place)}!`, e.place <= 3 ? 'finish' : 'info', 60_000);
        break;
      case 'pop':
        if (!attract && this.nearness(e.x, e.z) > 0.3) play('pop', 0, 0.5);
        break;
      case 'giant': {
        if (attract) return;
        const giant = this.room?.players.find((p) => p.slot === e.slot)?.name ?? 'A giant';
        const target = race.karts[e.k];
        const who = `<b>${escapeHtml(target.name)}</b>`;
        if (e.kind === 'flick') {
          play('pad', this.panOf(e.k));
          this.flickedUntil[e.k] = race.time + 1.4;
          this.hud.feed(`<b>${escapeHtml(giant)}</b> flicked ${who} forward`, e.slot, 'flick');
          if (human(e.k)) {
            this.hud.banner(e.k, `FLICKED BY ${giant.toUpperCase()}!`, 'good', 1300);
            this.haptic(e.k, 'boost');
          }
        } else {
          play(e.kind === 'bomb' ? 'bombThrow' : 'whoosh', this.panOf(e.k), 0.9);
          this.hud.feed(e.kind === 'bomb' ? `<b>${escapeHtml(giant)}</b> dropped a gobstopper on ${who}` : `<b>${escapeHtml(giant)}</b> buttered the road for ${who}`, e.slot, e.kind);
          if (human(e.k)) {
            this.hud.banner(e.k, e.kind === 'bomb' ? 'GIANT! DODGE THE RING!' : 'GIANT! BUTTER AHEAD!', 'warn', 1400);
            this.haptic(e.k, 'bump');
          }
        }
        // The giant feels it land too.
        const pid = this.room?.players.find((p) => p.slot === e.slot)?.id;
        if (pid) this.link.haptic(pid, 'item');
        break;
      }
      case 'giantLand':
        if (!attract && e.kind === 'butter' && this.nearness(e.x, e.z) > 0.2) play('squash', 0, 0.6);
        break;
    }
  }

  // ---------------------------------------------------------------- the Giant's Hand

  /** Players who are the giant now: in the room with a phone, and not racing (finished, or not in this race). */
  private giantIds(race: Race): string[] {
    if (this.attract || !this.settings?.giants || this.state.phase !== 'race' || !this.room) return [];
    return this.room.players
      .filter((p) => !p.local && p.connected)
      .filter((p) => {
        const i = this.kartPid.indexOf(p.id);
        return i < 0 || race.karts[i].finished;
      })
      .map((p) => p.id);
  }

  /** Giants' charges refill as the race runs. A new giant starts with two, so they can act straight away. */
  private chargeGiants(race: Race) {
    if (race.time < 0) return;
    for (const id of this.giantIds(race)) {
      const c = this.giantCharge.get(id) ?? 2;
      this.giantCharge.set(id, Math.min(GIANT_MAX_CHARGE, c + STEP / GIANT_RECHARGE));
    }
  }

  private giantMove({ pid, kind, target }: GiantMove & { pid: string }) {
    const race = this.race;
    if (!race || this.state.paused || !this.giantIds(race).includes(pid)) return;
    const charge = this.giantCharge.get(pid) ?? 0;
    if (charge < GIANT_COST[kind]) return;
    const slot = this.room?.players.find((p) => p.id === pid)?.slot ?? 0;
    if (!race.giant(kind, target, slot)) return;
    this.giantCharge.set(pid, charge - GIANT_COST[kind]);
    const own = this.kartPid.indexOf(pid);
    if (own >= 0) this.giantPicked.set(own, target);
    // Show the new charge at once rather than on the next dashboard beat.
    this.hudSent.delete(pid);
  }

  /**
   * A finished player's view on the TV stops following their own kart crawling home and follows the action
   * instead: the racer they last picked, or else the nearest one still going.
   */
  private followForGiants(race: Race) {
    const giants = new Set(this.giantIds(race));
    for (const k of race.karts) {
      if (k.cpu) continue;
      const pid = this.kartPid[k.index];
      let follow = k.index;
      if (pid && giants.has(pid)) {
        const picked = this.giantPicked.get(k.index);
        const going = race.karts.filter((o) => !o.finished);
        if (picked !== undefined && !race.karts[picked].finished) follow = picked;
        else if (going.length) follow = going.reduce((a, b) => (Math.abs(b.dist - k.dist) < Math.abs(a.dist - k.dist) ? b : a)).index;
      }
      this.view.follow(k.index, follow);
    }
  }

  private giantHud(race: Race, id: string): GiantHud {
    const endsIn = race.closingIn;
    return {
      charge: Math.floor((this.giantCharge.get(id) ?? 2) * 20) / 20,
      endsIn: endsIn === null ? null : Math.ceil(endsIn),
      targets: race.karts
        .filter((k) => !k.finished)
        .sort((a, b) => a.place - b.place)
        .map((k) => ({ k: k.index, name: k.name, character: k.character, place: k.place, cpu: k.cpu, slot: k.slot, safe: !race.giantCanTarget(k) })),
    };
  }

  // ---------------------------------------------------------------- engines and phones

  private startEngines() {
    this.stopEngines();
    if (!audioReady() || !this.race) return;
    const humans = this.race.karts.filter((k) => !k.cpu).length;
    this.engines = this.race.karts.map((k) => (k.cpu ? null : new EngineVoice(this.panOf(k.index), humans > 2 ? 0.6 : 0.85)));
  }

  private stopEngines() {
    for (const e of this.engines) e?.stop();
    this.engines = [];
  }

  private updateEngines(race: Race) {
    if (this.state.paused) return;
    if (!this.engines.length && audioReady()) this.startEngines();
    race.karts.forEach((k, i) => {
      const e = this.engines[i];
      if (!e) return;
      // Holding DRIFT on the grid revs the engine, so the rocket start's timing can be heard.
      const sp = race.time < 0 && k.input.drift ? 0.75 : Math.abs(k.speed) / k.params.maxSpeed;
      e.update(sp, !!k.driftDir && k.grounded, k.driftLevel, k.surface === 2 || k.surface === 7, k.boost > 0 || k.rocket > 0, k.respawnT === 0 && race.time > -3);
    });
  }

  private sendHuds(race: Race) {
    const out: Record<string, PhoneHud> = {};
    const giants = new Set(this.giantIds(race));
    const send = (pid: string, hud: PhoneHud) => {
      const key = JSON.stringify(hud);
      if (this.hudSent.get(pid) === key) return;
      this.hudSent.set(pid, key);
      out[pid] = hud;
    };
    for (const k of race.karts) {
      const pid = this.kartPid[k.index];
      if (!pid || this.room?.players.find((p) => p.id === pid)?.local) continue;
      // Warn a racer about what a giant has aimed at them, and show a flick while it lasts.
      const falling = race.giants.find((g) => g.target === k.index);
      send(pid, {
        place: k.place, racers: race.karts.length, lap: race.lapOf(k), laps: race.laps, item: k.rollT > 0 ? null : k.item,
        count: k.itemCount, rolling: k.rollT > 0, finished: k.finished, time: k.finishTime !== null ? k.finishTime * 1000 : null,
        charge: k.driftLevel, stage: race.time < 0 ? 'countdown' : k.finished ? 'done' : 'go', stunned: k.stunned, wrongWay: k.wrongWayT > 1,
        incoming: falling ? falling.kind : race.time < this.flickedUntil[k.index] ? 'flick' : null,
        giant: giants.has(pid) ? this.giantHud(race, pid) : null,
      });
    }
    // Giants without a kart in this race (they joined late) get a dashboard of their own.
    for (const pid of giants) {
      if (this.kartPid.includes(pid)) continue;
      send(pid, {
        place: 0, racers: race.karts.length, lap: 0, laps: race.laps, item: null, count: 0, rolling: false, finished: false, time: null,
        charge: 0, stage: race.time < 0 ? 'countdown' : 'go', stunned: false, wrongWay: false, giant: this.giantHud(race, pid),
      });
    }
    if (Object.keys(out).length) this.link.huds(out);
  }

  // ---------------------------------------------------------------- helpers for the screens

  get currentRace() {
    return this.race;
  }

  /** The human karts as the race sees them, for measuring in a browser (window.__RACEOFF_DIAG__). */
  diag() {
    const r = this.race;
    return r?.karts.filter((k) => !k.cpu).map((k) => ({
      x: +k.x.toFixed(1), y: +k.y.toFixed(1), z: +k.z.toFixed(1), speed: +k.speed.toFixed(1), place: k.place, laps: k.lapTimes.length,
      respawn: +k.respawnT.toFixed(2), grounded: k.grounded, surface: k.surface,
    }));
  }

  trackName() {
    return trackById(this.state.track).name;
  }
}

function shuffle<T>(a: T[]): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}


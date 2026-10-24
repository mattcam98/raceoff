/**
 * Every sound in RaceOff is synthesised with the Web Audio API: no files to
 * download, nothing to license. One context, a master compressor, and
 * separate levels for music and effects.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export const levels = { master: 0.8, music: 0.55, sfx: 0.9 };

/** Browsers only start audio after a gesture: call this from a click or tap. */
export function unlockAudio(): Promise<void> {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return Promise.resolve();
    ctx = new Ctor({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = levels.master;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = levels.sfx;
    musicBus = ctx.createGain();
    musicBus.gain.value = levels.music;
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => undefined);
}

export const audioReady = () => ctx?.state === 'running';
export const audio = () => (ctx && musicBus && sfxBus && noiseBuf ? { ctx, music: musicBus, sfx: sfxBus, noise: noiseBuf } : null);

export function setLevels(next: Partial<typeof levels>) {
  Object.assign(levels, next);
  if (!ctx) return;
  master!.gain.setTargetAtTime(levels.master, ctx.currentTime, 0.05);
  musicBus!.gain.setTargetAtTime(levels.music, ctx.currentTime, 0.05);
  sfxBus!.gain.setTargetAtTime(levels.sfx, ctx.currentTime, 0.05);
}

// ---------------------------------------------------------------- building blocks

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  to?: number;
  at?: number;
  dur: number;
  gain?: number;
  attack?: number;
  /** Hold full level until the end rather than decaying from the start. */
  hold?: boolean;
  /** Vibrato depth in Hz and rate. */
  vib?: [number, number];
  cutoff?: number;
}

function out(pan: number, gain = 1) {
  const a = audio()!;
  const g = a.ctx.createGain();
  g.gain.value = gain;
  if (pan && a.ctx.createStereoPanner) {
    const p = a.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(a.sfx);
  } else g.connect(a.sfx);
  return g;
}

/** Pitch multiplier for the sound being played: noises that repeat a lot vary a little, so they never machine-gun. */
let pitch = 1;

function tone(dest: AudioNode, t0: number, o: ToneOpts) {
  const { ctx } = audio()!;
  const start = t0 + (o.at ?? 0);
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq * pitch, start);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to * pitch, start + o.dur);
  if (o.vib) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = o.vib[1];
    lg.gain.value = o.vib[0];
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + o.dur + 0.05);
  }
  const peak = o.gain ?? 0.3;
  const atk = o.attack ?? 0.008;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + atk);
  if (o.hold) env.gain.setValueAtTime(peak, Math.max(start + atk, start + o.dur - Math.min(0.12, o.dur / 3)));
  env.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
  let node: AudioNode = osc;
  if (o.cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.cutoff;
    node = osc.connect(f);
  }
  node.connect(env).connect(dest);
  osc.start(start);
  osc.stop(start + o.dur + 0.05);
}

interface NoiseOpts {
  at?: number;
  dur: number;
  gain?: number;
  type?: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  attack?: number;
}

function noise(dest: AudioNode, t0: number, o: NoiseOpts) {
  const { ctx, noise: buf } = audio()!;
  const start = t0 + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq * pitch, start);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to * pitch, start + o.dur);
  f.Q.value = o.q ?? 1;
  const env = ctx.createGain();
  const peak = o.gain ?? 0.3;
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + (o.attack ?? 0.005));
  env.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
  src.connect(f).connect(env).connect(dest);
  src.start(start, Math.random() * 0.5);
  src.stop(start + o.dur + 0.05);
}

const N = (name: string) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name)!;
  const semis: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = semis[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
};

// ---------------------------------------------------------------- the effects

export type SoundName =
  | 'count' | 'go' | 'box' | 'roll' | 'got' | 'throw' | 'bee' | 'oil' | 'bombThrow' | 'blast' | 'jet' | 'shield' | 'shieldPop'
  | 'nitro' | 'sugar' | 'rocket' | 'hit' | 'bump' | 'wall' | 'drift' | 'spark1' | 'spark2' | 'spark3' | 'turbo' | 'pad'
  | 'land' | 'trick' | 'fall' | 'splash' | 'respawn' | 'lap' | 'finalLap' | 'finish' | 'win' | 'lose' | 'join' | 'ready'
  | 'select' | 'back' | 'start' | 'record' | 'stall' | 'pop' | 'squash' | 'whoosh';

type Recipe = (d: AudioNode, t: number) => void;

const RECIPES: Record<SoundName, Recipe> = {
  count: (d, t) => tone(d, t, { type: 'square', freq: 660, dur: 0.22, gain: 0.18, hold: true, cutoff: 3000 }),
  go: (d, t) => {
    tone(d, t, { type: 'square', freq: 1320, dur: 0.6, gain: 0.16, hold: true, cutoff: 4000 });
    tone(d, t, { type: 'square', freq: 990, dur: 0.6, gain: 0.12, hold: true, cutoff: 4000 });
  },
  box: (d, t) => {
    [1568, 2093, 2637, 3136].forEach((f, i) => tone(d, t, { freq: f, at: i * 0.035, dur: 0.18, gain: 0.12 }));
    noise(d, t, { dur: 0.25, freq: 6000, type: 'highpass', gain: 0.08 });
  },
  roll: (d, t) => {
    for (let i = 0; i < 12; i++) tone(d, t, { type: 'square', freq: 1800 + (i % 2) * 400, at: i * (0.05 + i * 0.006), dur: 0.03, gain: 0.05, cutoff: 5000 });
  },
  got: (d, t) => {
    tone(d, t, { type: 'triangle', freq: N('C6'), dur: 0.12, gain: 0.2 });
    tone(d, t, { type: 'triangle', freq: N('G6'), at: 0.08, dur: 0.3, gain: 0.2 });
  },
  throw: (d, t) => tone(d, t, { freq: 260, to: 900, dur: 0.18, gain: 0.25, type: 'sine' }),
  bee: (d, t) => tone(d, t, { type: 'sawtooth', freq: 190, dur: 0.7, gain: 0.08, vib: [25, 30], cutoff: 1400, hold: true }),
  oil: (d, t) => {
    noise(d, t, { dur: 0.25, freq: 500, to: 150, type: 'lowpass', gain: 0.35 });
    tone(d, t, { freq: 140, to: 60, dur: 0.2, gain: 0.25 });
  },
  bombThrow: (d, t) => tone(d, t, { freq: 1500, to: 500, dur: 0.6, gain: 0.12 }),
  blast: (d, t) => {
    noise(d, t, { dur: 1.1, freq: 1800, to: 120, type: 'lowpass', gain: 0.6, attack: 0.003 });
    tone(d, t, { freq: 90, to: 35, dur: 0.6, gain: 0.5 });
  },
  jet: (d, t) => noise(d, t, { dur: 1.2, freq: 400, to: 3200, type: 'bandpass', q: 3, gain: 0.3, attack: 0.3 }),
  shield: (d, t) => {
    [N('E5'), N('G#5'), N('B5'), N('E6')].forEach((f, i) => tone(d, t, { freq: f, at: i * 0.04, dur: 0.5, gain: 0.08, vib: [6, 9] }));
  },
  shieldPop: (d, t) => {
    tone(d, t, { freq: 1200, to: 300, dur: 0.12, gain: 0.25 });
    noise(d, t, { dur: 0.08, freq: 3000, gain: 0.2 });
  },
  nitro: (d, t) => {
    noise(d, t, { dur: 0.9, freq: 600, to: 4000, type: 'bandpass', q: 1.5, gain: 0.32, attack: 0.02 });
    tone(d, t, { type: 'sawtooth', freq: 80, to: 160, dur: 0.6, gain: 0.12, cutoff: 600 });
  },
  sugar: (d, t) => {
    [N('C6'), N('E6'), N('G6'), N('B6'), N('D7'), N('G7')].forEach((f, i) => tone(d, t, { type: 'triangle', freq: f, at: i * 0.05, dur: 0.3, gain: 0.1 }));
  },
  rocket: (d, t) => {
    noise(d, t, { dur: 1.6, freq: 300, to: 1200, type: 'lowpass', gain: 0.45, attack: 0.1 });
    tone(d, t, { type: 'sawtooth', freq: 60, to: 140, dur: 1.4, gain: 0.12, cutoff: 500 });
  },
  hit: (d, t) => {
    tone(d, t, { type: 'square', freq: 900, to: 160, dur: 0.6, gain: 0.12, vib: [40, 18], cutoff: 2400 });
    noise(d, t, { dur: 0.12, freq: 900, gain: 0.25 });
  },
  bump: (d, t) => {
    tone(d, t, { freq: 160, to: 60, dur: 0.14, gain: 0.35 });
    noise(d, t, { dur: 0.06, freq: 1200, gain: 0.12 });
  },
  wall: (d, t) => {
    noise(d, t, { dur: 0.12, freq: 600, q: 2, gain: 0.3 });
    tone(d, t, { freq: 110, to: 55, dur: 0.15, gain: 0.3 });
  },
  drift: (d, t) => noise(d, t, { dur: 0.22, freq: 2600, q: 6, gain: 0.12 }),
  spark1: (d, t) => tone(d, t, { type: 'triangle', freq: N('E6'), dur: 0.12, gain: 0.1 }),
  spark2: (d, t) => tone(d, t, { type: 'triangle', freq: N('G6'), dur: 0.14, gain: 0.12 }),
  spark3: (d, t) => {
    tone(d, t, { type: 'triangle', freq: N('B6'), dur: 0.16, gain: 0.12 });
    tone(d, t, { type: 'triangle', freq: N('E7'), at: 0.05, dur: 0.16, gain: 0.08 });
  },
  turbo: (d, t) => {
    noise(d, t, { dur: 0.5, freq: 900, to: 5000, type: 'bandpass', q: 1.2, gain: 0.25 });
    tone(d, t, { freq: 300, to: 700, dur: 0.15, gain: 0.12 });
  },
  pad: (d, t) => {
    tone(d, t, { freq: 500, to: 1600, dur: 0.25, gain: 0.15, type: 'triangle' });
    noise(d, t, { dur: 0.4, freq: 1500, to: 5000, gain: 0.15 });
  },
  land: (d, t) => tone(d, t, { freq: 120, to: 50, dur: 0.16, gain: 0.3 }),
  trick: (d, t) => {
    tone(d, t, { type: 'triangle', freq: N('A5'), dur: 0.1, gain: 0.15 });
    tone(d, t, { type: 'triangle', freq: N('E6'), at: 0.08, dur: 0.18, gain: 0.15 });
  },
  fall: (d, t) => tone(d, t, { freq: 1400, to: 180, dur: 1.0, gain: 0.12, vib: [12, 7] }),
  splash: (d, t) => {
    noise(d, t, { dur: 0.6, freq: 1200, to: 300, q: 0.8, gain: 0.4 });
    for (let i = 0; i < 6; i++) tone(d, t, { freq: 500 + Math.random() * 800, to: 1400 + Math.random() * 600, at: 0.15 + i * 0.06, dur: 0.06, gain: 0.06 });
  },
  respawn: (d, t) => {
    [N('C5'), N('E5'), N('G5'), N('C6')].forEach((f, i) => tone(d, t, { type: 'square', freq: f, at: i * 0.07, dur: 0.1, gain: 0.06, cutoff: 3000 }));
  },
  lap: (d, t) => {
    [N('C5'), N('E5'), N('G5')].forEach((f, i) => tone(d, t, { type: 'triangle', freq: f, at: i * 0.08, dur: 0.25, gain: 0.18 }));
  },
  finalLap: (d, t) => {
    const notes: [string, number, number][] = [['G4', 0, 0.12], ['G4', 0.14, 0.12], ['G4', 0.28, 0.12], ['C5', 0.42, 0.5], ['E5', 0.42, 0.5], ['G5', 0.42, 0.5]];
    for (const [n, at, dur] of notes) tone(d, t, { type: 'sawtooth', freq: N(n), at, dur, gain: 0.09, cutoff: 2600, hold: true });
  },
  finish: (d, t) => {
    const notes: [string, number, number][] = [['C5', 0, 0.15], ['E5', 0.15, 0.15], ['G5', 0.3, 0.15], ['C6', 0.45, 0.6], ['E5', 0.45, 0.6], ['G5', 0.45, 0.6]];
    for (const [n, at, dur] of notes) tone(d, t, { type: 'square', freq: N(n), at, dur, gain: 0.08, cutoff: 3000, hold: true });
  },
  win: (d, t) => {
    const seq = ['C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6'];
    seq.forEach((n, i) => tone(d, t, { type: 'square', freq: N(n), at: i * 0.11, dur: i === seq.length - 1 ? 0.8 : 0.12, gain: 0.08, cutoff: 3200, hold: true }));
  },
  lose: (d, t) => {
    ['G4', 'F#4', 'F4', 'E4'].forEach((n, i) => tone(d, t, { type: 'triangle', freq: N(n), at: i * 0.22, dur: i === 3 ? 0.6 : 0.2, gain: 0.15 }));
  },
  join: (d, t) => tone(d, t, { freq: 400, to: 1200, dur: 0.12, gain: 0.2 }),
  ready: (d, t) => {
    tone(d, t, { type: 'triangle', freq: N('E5'), dur: 0.1, gain: 0.18 });
    tone(d, t, { type: 'triangle', freq: N('A5'), at: 0.09, dur: 0.2, gain: 0.18 });
  },
  select: (d, t) => tone(d, t, { type: 'triangle', freq: 1100, dur: 0.05, gain: 0.12 }),
  back: (d, t) => tone(d, t, { type: 'triangle', freq: 700, dur: 0.06, gain: 0.12 }),
  start: (d, t) => noise(d, t, { dur: 0.7, freq: 300, to: 4000, gain: 0.25, attack: 0.2 }),
  record: (d, t) => {
    ['G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) => tone(d, t, { type: 'triangle', freq: N(n), at: i * 0.07, dur: 0.4, gain: 0.12 }));
  },
  stall: (d, t) => {
    for (let i = 0; i < 4; i++) noise(d, t, { at: i * 0.11, dur: 0.08, freq: 200, type: 'lowpass', gain: 0.3 });
  },
  pop: (d, t) => tone(d, t, { freq: 700, to: 200, dur: 0.08, gain: 0.2 }),
  squash: (d, t) => {
    tone(d, t, { freq: 300, to: 80, dur: 0.25, gain: 0.3, type: 'square', cutoff: 800 });
    noise(d, t, { dur: 0.15, freq: 400, gain: 0.3 });
  },
  whoosh: (d, t) => noise(d, t, { dur: 0.5, freq: 500, to: 2500, gain: 0.18, attack: 0.15 }),
};

/** Play an effect. `pan` places it left (-1) to right (1); `gain` scales it. */
/** Noises, not notes: tuned sounds (countdown, chimes, jingles) always play at their pitch. */
const VARIED = new Set<SoundName>(['box', 'roll', 'throw', 'hit', 'bump', 'wall', 'drift', 'land', 'splash', 'pop', 'squash', 'whoosh', 'blast', 'shieldPop']);

export function play(name: SoundName, pan = 0, gain = 1) {
  const a = audio();
  if (!a || a.ctx.state !== 'running') return;
  pitch = VARIED.has(name) ? 0.94 + Math.random() * 0.12 : 1;
  RECIPES[name](out(pan, gain), a.ctx.currentTime + 0.005);
  pitch = 1;
}

// ---------------------------------------------------------------- engines

/**
 * A continuous engine note for one kart, plus tyre squeal for drifts and a
 * rumble for rough ground. Only human karts get one: eight would be a drone.
 */
export class EngineVoice {
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private filter: BiquadFilterNode;
  private gain: GainNode;
  private squeal: GainNode;
  private squealFilter: BiquadFilterNode;
  private rumble: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];
  private panner: StereoPannerNode | null = null;

  constructor(pan: number, private level: number) {
    const { ctx, sfx, noise: buf } = audio()!;
    const outNode = ctx.createGain();
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.panner.pan.value = pan;
      outNode.connect(this.panner).connect(sfx);
    } else outNode.connect(sfx);
    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB.type = 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.filter.Q.value = 3;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    const mixB = ctx.createGain();
    mixB.gain.value = 0.35;
    this.oscA.connect(this.filter);
    this.oscB.connect(mixB).connect(this.filter);
    this.filter.connect(this.gain).connect(outNode);

    const sq = ctx.createBufferSource();
    sq.buffer = buf;
    sq.loop = true;
    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 2400;
    this.squealFilter.Q.value = 8;
    this.squeal = ctx.createGain();
    this.squeal.gain.value = 0;
    sq.connect(this.squealFilter).connect(this.squeal).connect(outNode);

    const rb = ctx.createBufferSource();
    rb.buffer = buf;
    rb.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 220;
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    rb.connect(rf).connect(this.rumble).connect(outNode);

    for (const n of [this.oscA, this.oscB, sq, rb]) {
      n.start();
      this.nodes.push(n);
    }
  }

  /** speed 0-1+, drifting, drift spark level, rough ground, boosting. */
  update(speed: number, drifting: boolean, level: number, rough: boolean, boost: boolean, active: boolean) {
    const a = audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const s = Math.max(0, speed);
    // Two gears' worth of pitch: it climbs, dips a little, climbs again.
    const gear = s < 0.55 ? s / 0.55 : 0.6 + ((s - 0.55) / 0.45) * 0.4;
    const f = 48 + gear * 95 + (boost ? 25 : 0);
    this.oscA.frequency.setTargetAtTime(f, t, 0.05);
    this.oscB.frequency.setTargetAtTime(f * 1.5, t, 0.05);
    this.filter.frequency.setTargetAtTime(350 + s * 1400 + (boost ? 800 : 0), t, 0.08);
    this.gain.gain.setTargetAtTime(active ? (0.045 + s * 0.04) * this.level : 0, t, 0.1);
    this.squeal.gain.setTargetAtTime(active && drifting ? (0.03 + level * 0.012) * this.level : 0, t, 0.05);
    this.squealFilter.frequency.setTargetAtTime(2000 + level * 500, t, 0.1);
    this.rumble.gain.setTargetAtTime(active && rough && s > 0.15 ? 0.12 * this.level : 0, t, 0.08);
  }

  stop() {
    const a = audio();
    if (!a) return;
    this.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
    this.squeal.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
    this.rumble.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
    const nodes = this.nodes;
    window.setTimeout(() => nodes.forEach((n) => n.stop()), 300);
  }
}

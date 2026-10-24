/**
 * RaceOff's music: one tune per track plus menu, results and podium themes,
 * written out as chord charts, drum patterns and melodies, and played by a
 * small sequencer against the Web Audio clock. On the final lap the tune
 * speeds up, as it should.
 */
import { audio } from './sound';

// ---------------------------------------------------------------- notation

const SEMIS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" or "Bb5" as a MIDI number. */
function midi(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`Not a note: ${name}`);
  return SEMIS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  '6': [0, 4, 7, 9],
};

/** A chord symbol as MIDI notes with the root in octave 3. */
function chord(sym: string): number[] {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym)!;
  const root = midi(`${m[1]}3`);
  return (QUALITY[m[2]] ?? QUALITY['']).map((i) => root + i);
}

interface Note {
  step: number;
  len: number;
  midi: number;
}

/** "E5:2 G5:2 -:4": notes and rests on a sixteenth-note grid. */
function melody(src: string): Note[] {
  const out: Note[] = [];
  let step = 0;
  for (const tok of src.trim().split(/\s+/)) {
    const [p, l = '1'] = tok.split(':');
    const len = Number(l);
    if (p !== '-') out.push({ step, len, midi: midi(p) });
    step += len;
  }
  return out;
}

type LeadVoice = 'square' | 'saw' | 'bell' | 'triangle' | 'organ';

interface Song {
  bpm: number;
  swing?: number;
  chords: string[];
  /** 16 steps a bar: R root, O octave, F fifth, T third, . rest. */
  bass: string;
  bassVoice?: 'tri' | 'saw' | 'square';
  kick: string;
  snare: string;
  hat: string;
  /** Chord tones by index (0-3), 16 steps a bar. */
  arp?: string;
  lead: string;
  leadVoice: LeadVoice;
  pad?: boolean;
  /** Overall level of the lead, 0-1. */
  leadLevel?: number;
}

const SONGS: Record<string, Song> = {
  menu: {
    bpm: 124,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm7', 'G7'],
    bass: 'R..R..O.R.F.R..O',
    kick: 'x...x...x...x...',
    snare: '....x.......x..x',
    hat: 'x.x.x.x.x.x.x.xx',
    arp: '0.1.2.1.0.1.2.3.',
    lead: `E5:2 G5:2 C6:4 B5:2 G5:2 E5:4
           A5:3 G5:1 E5:4 -:4 C5:2 D5:2
           F5:2 A5:2 C6:4 A5:2 F5:2 C5:2 F5:2
           G5:6 F5:2 E5:2 D5:2 B4:4
           E5:2 G5:2 C6:4 D6:2 C6:2 G5:4
           A5:2 C6:2 E6:4 D6:2 C6:2 A5:4
           F5:2 E5:2 D5:2 F5:2 A5:4 G5:4
           G5:4 B5:4 D6:4 -:4`,
    leadVoice: 'square',
    pad: true,
  },
  breakfast: {
    bpm: 140,
    chords: ['F', 'Bb', 'C', 'F', 'Dm', 'Bb', 'C', 'C7'],
    bass: 'R...F...R...F.T.',
    kick: 'x.....x.x.......',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    arp: '0.2.1.2.0.2.1.2.',
    lead: `A5:2 -:1 A5:1 C6:2 A5:2 F5:2 -:2 G5:2 A5:2
           Bb5:2 -:2 D6:2 Bb5:2 F5:4 -:4
           G5:2 -:1 G5:1 C6:2 G5:2 E5:2 -:2 F5:2 G5:2
           A5:4 F5:4 C5:4 -:4
           D6:2 C6:2 A5:2 F5:2 D5:4 F5:4
           D5:2 F5:2 Bb5:4 A5:2 G5:2 F5:4
           E5:2 G5:2 C6:4 Bb5:2 A5:2 G5:4
           C6:2 -:2 C6:2 -:2 Bb5:2 G5:2 E5:4`,
    leadVoice: 'triangle',
    leadLevel: 1.2,
  },
  desk: {
    bpm: 132,
    swing: 0.22,
    chords: ['Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7', 'A7'],
    bass: 'R...T...F...O...',
    bassVoice: 'tri',
    kick: 'x.......x.......',
    snare: '....x.......x...',
    hat: 'x..xx..xx..xx..x',
    lead: `F5:3 A5:1 C6:4 A5:2 F5:2 E5:4
           D5:4 F5:2 B5:2 A5:4 G5:4
           E5:6 G5:2 B5:4 -:4
           A5:3 C6:1 E6:4 D6:2 C6:2 A5:4
           F5:3 A5:1 C6:4 D6:2 C6:2 A5:4
           B5:4 D6:4 F6:2 E6:2 D6:4
           C6:8 G5:4 E5:4
           C#6:4 E6:4 G6:4 -:4`,
    leadVoice: 'bell',
    pad: true,
  },
  bath: {
    bpm: 112,
    chords: ['G', 'C', 'D', 'G', 'Em', 'C', 'D', 'D7'],
    bass: 'R.....R.F...R...',
    kick: 'x.......x.......',
    snare: '........x.......',
    hat: '..x...x...x...x.',
    arp: '..012...012..012',
    lead: `B5:2 D6:2 B5:2 G5:2 A5:2 B5:2 -:4
           C6:2 E6:2 C6:2 G5:2 E5:4 -:4
           D6:2 F#6:2 D6:2 A5:2 F#5:4 A5:4
           G5:8 -:4 D5:2 E5:2
           G5:2 B5:2 E6:4 D6:2 B5:2 G5:4
           E5:2 G5:2 C6:4 B5:2 A5:2 G5:4
           F#5:2 A5:2 D6:4 C6:2 A5:2 F#5:4
           A5:4 C6:4 D6:4 -:4`,
    leadVoice: 'bell',
    leadLevel: 1.1,
  },
  sandbox: {
    bpm: 164,
    chords: ['E', 'E', 'A', 'A', 'B', 'A', 'E', 'B7'],
    bass: 'R.R.O.R.R.R.F.R.',
    bassVoice: 'saw',
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: 'xxxxxxxxxxxxxxxx',
    lead: `E5:2 G#5:2 B5:2 E6:2 B5:2 G#5:2 E5:4
           F#5:2 G#5:2 A5:2 B5:6 -:4
           A5:2 C#6:2 E6:2 A6:2 E6:2 C#6:2 A5:4
           B5:2 C#6:2 D6:2 E6:6 -:4
           F#6:4 E6:2 D#6:2 B5:4 F#5:4
           E6:4 C#6:2 B5:2 A5:4 E5:4
           G#5:2 B5:2 E6:4 D#6:2 E6:2 G#6:4
           F#6:2 E6:2 D#6:2 C#6:2 B5:8`,
    leadVoice: 'saw',
  },
  toybox: {
    bpm: 150,
    chords: ['A', 'F#m', 'D', 'E', 'A', 'F#m', 'Bm7', 'E7'],
    bass: 'R...R...R...R.O.',
    bassVoice: 'square',
    kick: 'x.......x.......',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    arp: '0120012001200120',
    lead: `C#6:2 E6:2 A6:2 E6:2 C#6:2 E6:2 A5:4
           C#6:2 F#6:2 A6:2 F#6:2 C#6:4 -:4
           D6:2 F#6:2 A6:4 B6:2 A6:2 F#6:4
           E6:4 G#6:4 B6:4 -:4
           A6:2 G#6:2 E6:2 C#6:2 A5:4 C#6:4
           F#6:2 E6:2 C#6:2 A5:2 F#5:8
           D6:2 F#6:2 B6:4 A6:2 F#6:2 D6:4
           E6:2 -:2 E6:2 -:2 G#6:4 B6:4`,
    leadVoice: 'square',
    leadLevel: 0.8,
  },
  garage: {
    bpm: 150,
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'],
    bass: 'R.O.R.O.R.O.R.O.',
    bassVoice: 'saw',
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    lead: `A5:4 C6:4 E6:4 D6:2 C6:2
           A5:4 F5:4 C6:6 -:2
           G5:2 C6:2 E6:4 G6:4 E6:4
           D6:6 B5:2 G5:4 -:4
           E6:2 A6:2 E6:2 C6:2 A5:4 C6:4
           F6:2 E6:2 C6:2 A5:2 F5:4 A5:4
           G5:2 B5:2 D6:2 G6:2 F6:4 D6:4
           E6:4 G#6:4 B6:4 E6:4`,
    leadVoice: 'saw',
    pad: true,
  },
  results: {
    bpm: 96,
    chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
    bass: 'R.......F.....R.',
    bassVoice: 'tri',
    kick: 'x.........x.....',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    arp: '0.1.2.3.2.1.0.1.',
    lead: `A5:4 C6:4 E6:8
           D6:4 B5:4 G5:8
           C6:4 A5:4 F5:6 -:2
           E5:4 G5:4 B5:8`,
    leadVoice: 'bell',
    pad: true,
    leadLevel: 0.8,
  },
  podium: {
    bpm: 120,
    chords: ['C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C'],
    bass: 'R...R.F.R...R.O.',
    kick: 'x...x...x...x...',
    snare: '....x.......x.x.',
    hat: 'x.x.x.x.x.x.x.x.',
    lead: `G5:3 G5:1 C6:4 E6:4 D6:2 C6:2
           A5:4 C6:4 F6:6 -:2
           G5:2 B5:2 D6:4 G6:4 F6:2 D6:2
           E6:8 C6:4 -:4
           E6:3 E6:1 A6:4 G6:4 E6:2 C6:2
           F6:4 E6:2 D6:2 C6:4 A5:4
           G5:2 B5:2 D6:2 G6:2 F6:2 D6:2 B5:4
           C6:8 G5:2 E5:2 C5:4`,
    leadVoice: 'saw',
    pad: true,
  },
};

export type SongId = keyof typeof SONGS;
export const songFor = (track: string): SongId => (track in SONGS ? (track as SongId) : 'menu');

// ---------------------------------------------------------------- voices

function env(c: AudioContext, t: number, dur: number, peak: number, attack = 0.005, release = 0.08) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, Math.max(t + attack, t + dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function osc(c: AudioContext, out: AudioNode, t: number, dur: number, f: number, type: OscillatorType, peak: number, cutoff?: number, attack?: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const e = env(c, t, dur, peak, attack);
  let n: AudioNode = o;
  if (cutoff) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    n = o.connect(lp);
  }
  n.connect(e).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function drum(c: AudioContext, out: AudioNode, noiseBuf: AudioBuffer, t: number, kind: 'k' | 's' | 'h') {
  if (kind === 'k') {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.25);
    return;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = kind === 'h' ? 'highpass' : 'bandpass';
  f.frequency.value = kind === 'h' ? 7500 : 1800;
  const g = c.createGain();
  const dur = kind === 'h' ? 0.045 : 0.16;
  g.gain.setValueAtTime(kind === 'h' ? 0.07 : 0.28, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
  if (kind === 's') osc(c, out, t, 0.1, 190, 'triangle', 0.18);
}

function lead(c: AudioContext, out: AudioNode, t: number, dur: number, f: number, voice: LeadVoice, level: number) {
  const L = 0.07 * level;
  switch (voice) {
    case 'square':
      osc(c, out, t, dur, f, 'square', L * 0.8, 3200);
      break;
    case 'saw':
      osc(c, out, t, dur, f, 'sawtooth', L * 0.75, 2600);
      osc(c, out, t, dur, f * 1.005, 'sawtooth', L * 0.4, 2000);
      break;
    case 'triangle':
      osc(c, out, t, dur, f, 'triangle', L * 1.5);
      osc(c, out, t, dur * 0.6, f * 2, 'sine', L * 0.3);
      break;
    case 'organ':
      osc(c, out, t, dur, f, 'sine', L);
      osc(c, out, t, dur, f * 2, 'sine', L * 0.5);
      osc(c, out, t, dur, f * 3, 'sine', L * 0.25);
      break;
    case 'bell': {
      // Struck: a fundamental and an inharmonic partial that dies away first.
      const ring = Math.max(dur, 0.5);
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(L * 1.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + ring + 0.05);
      const p = c.createOscillator();
      p.frequency.value = f * 2.76;
      const pg = c.createGain();
      pg.gain.setValueAtTime(L * 0.5, t);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + ring * 0.4);
      p.connect(pg).connect(out);
      p.start(t);
      p.stop(t + ring + 0.05);
      break;
    }
  }
}

// ---------------------------------------------------------------- sequencer

class Sequencer {
  private song: Song | null = null;
  private id: SongId | null = null;
  private bus: GainNode | null = null;
  private timer: number | undefined;
  private nextTime = 0;
  private step = 0;
  private leadNotes: Note[] = [];
  private tempo = 1;
  private bars = 1;

  get playing() {
    return this.id;
  }

  play(id: SongId, fadeIn = 0.4) {
    const a = audio();
    if (!a) return;
    if (this.id === id && this.song) {
      // Already playing (a race run again on the same track): just back to normal speed.
      this.tempo = 1;
      return;
    }
    this.stop(0.35);
    const { ctx } = a;
    this.id = id;
    this.song = SONGS[id];
    this.leadNotes = melody(this.song.lead);
    this.bars = this.song.chords.length;
    this.tempo = 1;
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fadeIn);
    this.bus.connect(a.music);
    this.nextTime = ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  /** Speed the tune up, for the final lap. */
  setTempo(scale: number) {
    this.tempo = scale;
  }

  stop(fade = 0.5) {
    const a = audio();
    window.clearInterval(this.timer);
    this.timer = undefined;
    if (a && this.bus) {
      const bus = this.bus;
      bus.gain.cancelScheduledValues(a.ctx.currentTime);
      bus.gain.setTargetAtTime(0.0001, a.ctx.currentTime, fade / 3);
      window.setTimeout(() => bus.disconnect(), fade * 1000 + 200);
    }
    this.bus = null;
    this.song = null;
    this.id = null;
  }

  private schedule() {
    const a = audio();
    const s = this.song;
    if (!a || !s || !this.bus) return;
    const c = a.ctx;
    const stepDur = 60 / (s.bpm * this.tempo) / 4;
    // After a stall (a track being built, a throttled tab), skip the steps that were missed rather than play
    // them all at once.
    if (this.nextTime < c.currentTime) {
      const missed = Math.ceil((c.currentTime - this.nextTime) / stepDur);
      this.step += missed;
      this.nextTime += missed * stepDur;
    }
    while (this.nextTime < c.currentTime + 0.3) {
      const total = this.bars * 16;
      const i = this.step % total;
      const inBar = i % 16;
      const bar = Math.floor(i / 16);
      let t = this.nextTime;
      if (s.swing && inBar % 2 === 1) t += s.swing * stepDur;
      this.playStep(c, a.noise, t, stepDur, bar, inBar, i);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private playStep(c: AudioContext, noiseBuf: AudioBuffer, t: number, sd: number, bar: number, inBar: number, i: number) {
    const s = this.song!;
    const out = this.bus!;
    const ch = chord(s.chords[bar]);
    const at = (p: string) => p[inBar % p.length];
    if (at(s.kick) === 'x') drum(c, out, noiseBuf, t, 'k');
    if (at(s.snare) === 'x') drum(c, out, noiseBuf, t, 's');
    if (at(s.hat) === 'x') drum(c, out, noiseBuf, t, 'h');

    const b = at(s.bass);
    if (b !== '.') {
      const root = ch[0] - 12;
      const m = b === 'O' ? root + 12 : b === 'F' ? root + 7 : b === 'T' ? root + (ch[1] - ch[0]) : root;
      // Hold until the next bass note.
      let len = 1;
      while (len < 4 && s.bass[(inBar + len) % s.bass.length] === '.') len++;
      const voice = s.bassVoice ?? 'tri';
      osc(c, out, t, len * sd * 0.95, hz(m), voice === 'tri' ? 'triangle' : voice === 'saw' ? 'sawtooth' : 'square', voice === 'tri' ? 0.2 : 0.09, voice === 'tri' ? undefined : 700);
    }
    if (s.arp) {
      const a = at(s.arp);
      if (a !== '.') {
        const k = Number(a);
        const m = k >= ch.length ? ch[0] + 12 : ch[k];
        osc(c, out, t, sd * 0.9, hz(m + 12), 'triangle', 0.045);
      }
    }
    if (s.pad && inBar === 0) {
      for (const m of ch) osc(c, out, t, sd * 16, hz(m + 12), 'sawtooth', 0.012, 1100, 0.25);
    }
    for (const n of this.leadNotes) if (n.step === i) lead(c, out, t, n.len * sd * 0.92, hz(n.midi), s.leadVoice, s.leadLevel ?? 1);
  }
}

export const music = new Sequencer();

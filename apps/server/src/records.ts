/**
 * Track records and the all-time player table, kept in one JSON file.
 *
 * Only the standard race counts for track records: three laps at 100cc or
 * faster, so a one-lap sprint cannot hold the fastest race. Best laps count at
 * any length. Names are how players are told apart: the same name on another
 * night is the same person, which is what a living room expects.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlayerTally, RaceReport, RecordEntry, RecordNews, RecordsView, TrackRecords } from '@raceoff/shared';
import { z } from 'zod';
import { log, readJsonFile, writeAtomic } from './util';

const MAX_RACES = 10;
const MAX_TALLY = 200;
const SAVE_DELAY_MS = 500;

const EntrySchema = z.object({ name: z.string(), character: z.string(), time: z.number(), at: z.number() });
/** The whole file is checked on loading, so a mangled entry can never throw later, in the middle of a race. */
const RecordsFileSchema: z.ZodType<RecordsView> = z.object({
  tracks: z.record(z.string(), z.object({ bestLap: EntrySchema.nullable(), races: z.array(EntrySchema) })),
  players: z.array(z.object({ name: z.string(), races: z.number(), wins: z.number(), podiums: z.number(), cups: z.number() })),
});

export class Records {
  private data: RecordsView = { tracks: {}, players: [] };
  private saveTimer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();

  private constructor(private file: string | null) {}

  /** Load from `dir`, or keep everything in memory when dir is null. */
  static async load(dir: string | null): Promise<Records> {
    if (!dir) return new Records(null);
    await mkdir(dir, { recursive: true });
    const r = new Records(join(dir, 'records.json'));
    r.data = (await readJsonFile(r.file!, RecordsFileSchema)) ?? r.data;
    return r;
  }

  get view(): RecordsView {
    return this.data;
  }

  private track(id: string): TrackRecords {
    return (this.data.tracks[id] ??= { bestLap: null, races: [] });
  }

  private tally(name: string): PlayerTally {
    const key = name.trim().toLowerCase();
    let t = this.data.players.find((p) => p.name.toLowerCase() === key);
    if (!t) {
      t = { name: name.trim(), races: 0, wins: 0, podiums: 0, cups: 0 };
      this.data.players.push(t);
    }
    return t;
  }

  /** Add a finished race. Returns the records it broke. */
  report(r: RaceReport): RecordNews[] {
    const news: RecordNews[] = [];
    const track = this.track(r.track);
    const now = Date.now();
    const counts = r.laps === 3 && r.cc >= 100;
    for (const res of r.results) {
      const t = this.tally(res.name);
      t.races++;
      if (res.place === 1) t.wins++;
      if (res.place <= 3) t.podiums++;
      if (res.bestLap !== null && (!track.bestLap || res.bestLap < track.bestLap.time)) {
        track.bestLap = { name: res.name, character: res.character, time: res.bestLap, at: now };
        news.push({ kind: 'lap', track: r.track, name: res.name, time: res.bestLap });
      }
      if (counts && res.time !== null) {
        const entry: RecordEntry = { name: res.name, character: res.character, time: res.time, at: now };
        const wasBest = !track.races.length || res.time < track.races[0].time;
        track.races.push(entry);
        track.races.sort((a, b) => a.time - b.time);
        track.races.length = Math.min(track.races.length, MAX_RACES);
        if (wasBest) news.push({ kind: 'race', track: r.track, name: res.name, time: res.time });
      }
    }
    if (r.cupWinner) this.tally(r.cupWinner).cups++;
    this.data.players.sort((a, b) => b.cups - a.cups || b.wins - a.wins || b.podiums - a.podiums || a.name.localeCompare(b.name));
    this.data.players.length = Math.min(this.data.players.length, MAX_TALLY);
    // A lap record set twice in one race (two players) only announces the one that stands.
    const finalLap = news.filter((n) => n.kind === 'lap').pop();
    const result = news.filter((n) => n.kind !== 'lap').concat(finalLap ? [finalLap] : []);
    this.scheduleSave();
    return result;
  }

  /** Start the Hall of Fame afresh. */
  clear() {
    this.data = { tracks: {}, players: [] };
    this.scheduleSave();
  }

  /**
   * Take a name off the Hall of Fame: its tally and its race times. A lap record it held is cleared, since
   * only the best lap is kept and the one before it is not known.
   */
  remove(name: string): boolean {
    const key = name.trim().toLowerCase();
    const is = (n: string) => n.toLowerCase() === key;
    let found = false;
    const before = this.data.players.length;
    this.data.players = this.data.players.filter((p) => !is(p.name));
    found ||= this.data.players.length !== before;
    for (const track of Object.values(this.data.tracks)) {
      const n = track.races.length;
      track.races = track.races.filter((r) => !is(r.name));
      found ||= track.races.length !== n;
      if (track.bestLap && is(track.bestLap.name)) {
        track.bestLap = null;
        found = true;
      }
    }
    if (found) this.scheduleSave();
    return found;
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, SAVE_DELAY_MS);
  }

  async save() {
    if (!this.file) return;
    const file = this.file;
    const body = JSON.stringify(this.data);
    this.saving = this.saving.then(() => writeAtomic(file, body)).catch((err) => log.error('could not save records', { err }));
    return this.saving;
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.save();
    }
    await this.saving;
  }
}

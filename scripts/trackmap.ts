/**
 * Draws a track's compiled grid, walls, props and boxes to a PNG, and runs a
 * computer-only race on it, drawing each kart's line and reporting how it went.
 *
 *   npx tsx scripts/trackmap.ts breakfast [out.png] [--laps 3] [--difficulty hard]
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { CHARACTERS, BODIES } from '@raceoff/shared';
import { getTrack, Race, SURF, STEP, type RaceEvent } from '@raceoff/game';

const args = process.argv.slice(2);
const id = args[0] ?? 'breakfast';
const out = args[1] && !args[1].startsWith('--') ? args[1] : `${id}.png`;
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const laps = Number(opt('laps', '3'));
const difficulty = opt('difficulty', 'normal') as 'easy' | 'normal' | 'hard';
const seed = Number(opt('seed', '7'));

const t0 = performance.now();
const track = getTrack(id);
const buildMs = performance.now() - t0;
const { grid } = track;
const PX = 3;
const W = Math.ceil((grid.nx * grid.cell) * PX);
const H = Math.ceil((grid.nz * grid.cell) * PX);
const img = new Uint8Array(W * H * 3);

const COLORS: Record<number, [number, number, number]> = {
  [SURF.void]: [12, 12, 20],
  [SURF.road]: [110, 110, 120],
  [SURF.rough]: [70, 110, 60],
  [SURF.slick]: [235, 235, 250],
  [SURF.sticky]: [150, 40, 120],
  [SURF.boost]: [255, 150, 0],
  [SURF.water]: [40, 110, 220],
  [SURF.sand]: [210, 180, 110],
};

const toPx = (x: number, z: number): [number, number] => [Math.round((x - grid.minX) * PX), Math.round((z - grid.minZ) * PX)];
function put(px: number, py: number, c: [number, number, number], a = 1) {
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  const i = (py * W + px) * 3;
  img[i] = img[i] * (1 - a) + c[0] * a;
  img[i + 1] = img[i + 1] * (1 - a) + c[1] * a;
  img[i + 2] = img[i + 2] * (1 - a) + c[2] * a;
}
function dot(x: number, z: number, r: number, c: [number, number, number], a = 1) {
  const [cx, cy] = toPx(x, z);
  const rp = Math.max(1, r * PX);
  for (let dy = -rp; dy <= rp; dy++) for (let dx = -rp; dx <= rp; dx++) if (dx * dx + dy * dy <= rp * rp) put(cx + dx, cy + dy, c, a);
}
function line(x1: number, z1: number, x2: number, z2: number, c: [number, number, number], a = 1) {
  const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) * PX) + 1;
  for (let i = 0; i <= n; i++) {
    const [px, py] = toPx(x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n);
    put(px, py, c, a);
  }
}

for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const x = grid.minX + px / PX;
    const z = grid.minZ + py / PX;
    const i = grid.index(x, z);
    if (i < 0) continue;
    const base = COLORS[grid.surf[i]] ?? [255, 0, 255];
    // Shade the road by progress so a jump in it shows up as a seam, and by height.
    const s = grid.s[i];
    const shade = Number.isNaN(s) ? 0.85 : 0.8 + 0.2 * Math.sin((s / track.length) * Math.PI * 2 * 6);
    const h = 1 + Math.max(-0.5, Math.min(0.5, (grid.y[i] - track.def.floorY) / 12));
    put(px, py, [base[0] * shade * h, base[1] * shade * h, base[2] * shade * h]);
  }
}
// Coordinate grid: a line every 50 units, brighter through the origin.
for (let x = Math.ceil(grid.minX / 50) * 50; x < grid.minX + grid.nx * grid.cell; x += 50) {
  line(x, grid.minZ, x, grid.minZ + grid.nz * grid.cell, x === 0 ? [255, 255, 255] : [150, 150, 170], x === 0 ? 0.5 : 0.25);
}
for (let z = Math.ceil(grid.minZ / 50) * 50; z < grid.minZ + grid.nz * grid.cell; z += 50) {
  line(grid.minX, z, grid.minX + grid.nx * grid.cell, z, z === 0 ? [255, 255, 255] : [150, 150, 170], z === 0 ? 0.5 : 0.25);
}
// Control points, numbered by size: a dot grows with its index so the order can be read off.
track.def.points.forEach((p, i) => dot(p[0], p[1], 0.6 + i * 0.12, [255, 80, 200]));
for (const p of track.paths) {
  for (let i = 0; i < p.samples.length; i++) {
    const a = p.samples[i];
    const off = p.line[i];
    dot(a.x + -Math.cos(a.h) * off, a.z + Math.sin(a.h) * off, 0.2, [0, 230, 255], 0.8);
  }
}
for (const c of track.colliders) {
  if (c.t === 'seg') line(c.ax, c.az, c.bx, c.bz, [255, 60, 60]);
  else if (c.t === 'circle') {
    for (let a = 0; a < 64; a++) line(c.x + Math.cos((a / 64) * 6.283) * c.r, c.z + Math.sin((a / 64) * 6.283) * c.r, c.x + Math.cos(((a + 1) / 64) * 6.283) * c.r, c.z + Math.sin(((a + 1) / 64) * 6.283) * c.r, [255, 200, 120]);
  } else {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const lx = sx * c.hw;
      const lz = sz * c.hd;
      return [c.x + lx * c.c + lz * c.s, c.z - lx * c.s + lz * c.c];
    });
    for (let k = 0; k < 4; k++) line(corners[k][0], corners[k][1], corners[(k + 1) % 4][0], corners[(k + 1) % 4][1], [255, 200, 120]);
  }
}
for (const b of track.boxes) dot(b.x, b.z, 1.2, [255, 230, 0]);
for (let k = 0; k < 8; k++) {
  const s = track.slot(k);
  dot(s.x, s.z, 1, [255, 255, 255]);
}
const start = track.pointAt(0, 0);
line(start.x - Math.cos(start.h) * 10, start.z + Math.sin(start.h) * 10, start.x + Math.cos(start.h) * 10, start.z - Math.sin(start.h) * 10, [255, 255, 255]);

// A computer-only race.
const racers = Array.from({ length: 8 }, (_, i) => ({
  id: `cpu:${i}`, name: CHARACTERS[i].name, character: CHARACTERS[i].id, body: BODIES[i % 3].id, cpu: true, slot: -1,
}));
const race = new Race({ track, racers, laps, cc: 100, items: 'normal', difficulty, seed });
const tally: Record<string, number> = {};
const trails = race.karts.map(() => [] as [number, number][]);
const t1 = performance.now();
while (!race.over) {
  race.step([]);
  for (const e of race.events as RaceEvent[]) {
    const key = e.t === 'hit' ? `hit:${e.how}` : e.t === 'boost' ? `boost:${e.kind}` : e.t;
    tally[key] = (tally[key] ?? 0) + 1;
    if (e.t === 'fall') {
      const k = race.karts[e.k];
      dot(k.x, k.z, 1.5, [255, 0, 255]);
    }
  }
  race.events.length = 0;
  if (race.ticks % 4 === 0) race.karts.forEach((k, i) => trails[i].push([k.x, k.z]));
}
const simMs = performance.now() - t1;
const palette: [number, number, number][] = [[255, 80, 80], [80, 160, 255], [255, 210, 60], [80, 230, 120], [255, 120, 220], [180, 120, 255], [255, 255, 255], [255, 150, 60]];
trails.forEach((tr, i) => tr.forEach(([x, z]) => dot(x, z, 0.25, palette[i], 0.6)));

// PNG out.
function crc32(buf: Uint8Array) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));

const fmt = (t: number | null) => (t === null ? '  --  ' : t.toFixed(2).padStart(6));
console.log(`${id}: length ${track.length.toFixed(0)}, grid ${grid.nx}x${grid.nz}, ${track.colliders.length} colliders, built in ${buildMs.toFixed(0)} ms`);
console.log(`race: ${race.time.toFixed(1)} s simulated in ${simMs.toFixed(0)} ms`);
for (const k of [...race.karts].sort((a, b) => a.place - b.place)) {
  console.log(`  ${k.place}. ${k.name.padEnd(8)} ${fmt(k.finishTime)}  best lap ${fmt(k.bestLap)}  laps ${k.lapTimes.map((t) => t.toFixed(1)).join(' ')}`);
}
console.log('events:', Object.entries(tally).sort().map(([k, v]) => `${k}=${v}`).join(' '));
console.log(`wrote ${out}`);

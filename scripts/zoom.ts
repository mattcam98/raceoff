/**
 * A close-up of one part of a track's compiled grid: surfaces, walls, props,
 * paths and racing lines, at 8 pixels a unit.
 *
 *   npx tsx scripts/zoom.ts garage -130 -66 30 out.png
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { getTrack, SURF } from '@raceoff/game';

const [id = 'garage', cxs = '0', czs = '0', rs = '30', out = 'zoom.png'] = process.argv.slice(2);
const cx = Number(cxs);
const cz = Number(czs);
const R = Number(rs);
const PX = 8;
const track = getTrack(id);
const { grid } = track;
const W = Math.round(R * 2 * PX);
const H = W;
const img = new Uint8Array(W * H * 3);
const COLORS: Record<number, [number, number, number]> = {
  [SURF.void]: [12, 12, 20], [SURF.road]: [110, 110, 120], [SURF.rough]: [70, 110, 60], [SURF.slick]: [235, 235, 250],
  [SURF.sticky]: [150, 40, 120], [SURF.boost]: [255, 150, 0], [SURF.water]: [40, 110, 220], [SURF.sand]: [210, 180, 110],
};
const toPx = (x: number, z: number): [number, number] => [Math.round((x - cx + R) * PX), Math.round((z - cz + R) * PX)];
function put(px: number, py: number, c: [number, number, number]) {
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  const i = (py * W + px) * 3;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}
function line(x1: number, z1: number, x2: number, z2: number, c: [number, number, number]) {
  const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) * PX) + 1;
  for (let i = 0; i <= n; i++) {
    const [px, py] = toPx(x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n);
    put(px, py, c);
  }
}
function circle(x: number, z: number, r: number, c: [number, number, number]) {
  for (let a = 0; a < 48; a++) line(x + Math.cos((a / 48) * 6.283) * r, z + Math.sin((a / 48) * 6.283) * r, x + Math.cos(((a + 1) / 48) * 6.283) * r, z + Math.sin(((a + 1) / 48) * 6.283) * r, c);
}
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const x = cx - R + px / PX;
    const z = cz - R + py / PX;
    const i = grid.index(x, z);
    const c = i < 0 ? [0, 0, 0] : (COLORS[grid.surf[i]] ?? [255, 0, 255]);
    const p = i < 0 ? -1 : grid.path[i];
    const tint = p > 0 ? 1.15 : 1;
    put(px, py, [c[0] * tint, c[1], c[2] * tint] as [number, number, number]);
  }
}
for (let v = Math.ceil((cx - R) / 10) * 10; v < cx + R; v += 10) line(v, cz - R, v, cz + R, [90, 90, 110]);
for (let v = Math.ceil((cz - R) / 10) * 10; v < cz + R; v += 10) line(cx - R, v, cx + R, v, [90, 90, 110]);
for (const p of track.paths) {
  const col: [number, number, number] = p.index === 0 ? [255, 255, 255] : [255, 230, 0];
  for (let i = 0; i + 1 < p.samples.length; i++) {
    const a = p.samples[i];
    const b = p.samples[i + 1];
    line(a.x, a.z, b.x, b.z, col);
    const oa = p.line[i];
    const ob = p.line[i + 1];
    line(a.x - Math.cos(a.h) * oa, a.z + Math.sin(a.h) * oa, b.x - Math.cos(b.h) * ob, b.z + Math.sin(b.h) * ob, [0, 230, 255]);
  }
}
for (const c of track.colliders) {
  if (c.t === 'seg') {
    line(c.ax, c.az, c.bx, c.bz, [255, 50, 50]);
    circle(c.ax, c.az, c.r, [255, 120, 120]);
  } else if (c.t === 'circle') circle(c.x, c.z, c.r, [255, 200, 120]);
  else {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [c.x + sx * c.hw * c.c + sz * c.hd * c.s, c.z - sx * c.hw * c.s + sz * c.hd * c.c]);
    for (let k = 0; k < 4; k++) line(corners[k][0], corners[k][1], corners[(k + 1) % 4][0], corners[(k + 1) % 4][1], [255, 200, 120]);
  }
}
for (const b of track.boxes) circle(b.x, b.z, 1.2, [255, 230, 0]);
for (const h of track.def.hazards ?? []) if (h.x !== undefined) circle(h.x, h.z!, h.r, [255, 0, 255]);

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
for (let y = 0; y < H; y++) Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${out}`);

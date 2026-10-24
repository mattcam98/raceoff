/**
 * Canvas textures for effects and items: the particle atlas (soft glow, hot
 * spark, smoke puff, shock ring, sparkle star, chip, droplet, glass shard),
 * the item box's question mark and the bouncy ball's print. Painted once.
 */
import * as THREE from 'three';
import { shareResource } from './kit';

/** Cells of the particle atlas, four across and two down. */
export const TILE = { glow: 0, spark: 1, smoke: 2, ring: 3, star: 4, chip: 5, drop: 6, shard: 7 } as const;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;
const CELL = 128;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function radial(g: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) grd.addColorStop(o, c);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function finish(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return shareResource(t);
}

let atlas: THREE.Texture | null = null;

/** White shapes on transparent: particles tint them. */
export function fxAtlas(): THREE.Texture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CELL * ATLAS_COLS;
  c.height = CELL * ATLAS_ROWS;
  const g = c.getContext('2d')!;
  const cell = (i: number, draw: (cx: number, cy: number) => void) => {
    g.save();
    const x = (i % ATLAS_COLS) * CELL;
    const y = Math.floor(i / ATLAS_COLS) * CELL;
    g.beginPath();
    g.rect(x + 2, y + 2, CELL - 4, CELL - 4);
    g.clip();
    draw(x + CELL / 2, y + CELL / 2);
    g.restore();
  };
  const W = (a: number) => `rgba(255,255,255,${a})`;
  // Soft glow: a smooth falloff with no hard edge.
  cell(TILE.glow, (x, y) => radial(g, x, y, 60, [[0, W(1)], [0.15, W(0.75)], [0.4, W(0.28)], [0.7, W(0.07)], [1, W(0)]]));
  // Spark: a hot, tight core with a faint halo; stretched along its velocity it becomes a streak.
  cell(TILE.spark, (x, y) => radial(g, x, y, 60, [[0, W(1)], [0.2, W(0.95)], [0.38, W(0.35)], [0.65, W(0.06)], [1, W(0)]]));
  // Smoke puff: lumps of soft cloud, denser in the middle.
  cell(TILE.smoke, (x, y) => {
    const r = seeded(11);
    radial(g, x, y, 54, [[0, W(0.55)], [0.6, W(0.3)], [1, W(0)]]);
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 26;
      radial(g, x + Math.cos(a) * d, y + Math.sin(a) * d, 18 + r() * 18, [[0, W(0.42)], [0.55, W(0.22)], [1, W(0)]]);
    }
  });
  // Shock ring.
  cell(TILE.ring, (x, y) => {
    radial(g, x, y, 60, [[0, W(0)], [0.62, W(0)], [0.8, W(1)], [0.88, W(0.55)], [1, W(0)]]);
  });
  // Sparkle: a four-pointed star around a bright core.
  cell(TILE.star, (x, y) => {
    radial(g, x, y, 22, [[0, W(1)], [0.4, W(0.6)], [1, W(0)]]);
    for (const [sx, sy] of [[1, 0.09], [0.09, 1]]) {
      g.save();
      g.translate(x, y);
      g.scale(sx, sy);
      radial(g, 0, 0, 60, [[0, W(1)], [0.3, W(0.55)], [1, W(0)]]);
      g.restore();
    }
  });
  // Chip: a rounded little slab, for confetti, crumbs and debris. Shaded so it reads as a solid bit.
  cell(TILE.chip, (x, y) => {
    const grd = g.createLinearGradient(x, y - 30, x, y + 30);
    grd.addColorStop(0, W(1));
    grd.addColorStop(1, 'rgba(170,170,170,1)');
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(x - 40, y - 26, 80, 52, 14);
    g.fill();
  });
  // Droplet: a bead of liquid with a highlight.
  cell(TILE.drop, (x, y) => {
    radial(g, x, y, 46, [[0, 'rgba(225,235,245,0.95)'], [0.75, 'rgba(240,248,255,0.9)'], [0.9, W(0.5)], [1, W(0)]]);
    radial(g, x - 14, y - 16, 14, [[0, W(1)], [1, W(0)]]);
  });
  // Glass shard: a sliver with bright edges.
  cell(TILE.shard, (x, y) => {
    g.beginPath();
    g.moveTo(x - 10, y - 52);
    g.lineTo(x + 38, y + 30);
    g.lineTo(x - 30, y + 44);
    g.closePath();
    g.fillStyle = W(0.45);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = W(1);
    g.stroke();
  });
  atlas = finish(c, false);
  return atlas;
}

let question: THREE.Texture | null = null;

/** The item box's question mark: white, with a soft glow round it. */
export function questionTexture(): THREE.Texture {
  if (question) return question;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 108px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 16;
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(120,80,255,0.85)';
  g.strokeText('?', 64, 70);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText('?', 64, 70);
  question = finish(c, true);
  return question;
}

const balls = new Map<string, THREE.Texture>();

/** A bouncy ball's print: a bold colour with a white wave round its middle and a thin pinstripe. */
export function ballTexture(base: string, band = '#ffffff', pin = '#ffd23f'): THREE.Texture {
  const key = base + band + pin;
  let t = balls.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  const wave = (y: number, amp: number, w: number, color: string) => {
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) g.lineTo(x, y + Math.sin((x / 256) * Math.PI * 6) * amp);
    g.lineWidth = w;
    g.strokeStyle = color;
    g.stroke();
  };
  wave(64, 12, 22, band);
  wave(40, 9, 5, pin);
  wave(88, 9, 5, pin);
  t = finish(c, true);
  balls.set(key, t);
  return t;
}

let beam: THREE.Texture | null = null;

/**
 * The pool of light a kart's headlights throw on the road: narrow at the kart (the top of the picture) and
 * spreading ahead, brightest a little way out, fading to nothing. White on transparent, drawn added on top.
 */
export function headlightTexture(): THREE.Texture {
  if (beam) return beam;
  const W = 64;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const half = 0.28 + 0.7 * v;
    const along = smooth(0, 0.18, v) * (1 - smooth(0.45, 1, v));
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x / (W - 1) - 0.5) * 2;
      const a = along * (1 - smooth(half * 0.55, half, u));
      const o = (y * W + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  beam = finish(c, false);
  return beam;
}

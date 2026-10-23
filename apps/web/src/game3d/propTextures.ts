/**
 * Canvas textures for the props: printed packaging, labels, food, fabric and the normal maps that give
 * peel, crumb and weave their texture. Painted once on first use and cached; every brand is made up.
 */
import * as THREE from 'three';
import { shareResource } from './kit';

const cache = new Map<string, THREE.Texture>();

export type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export const FONT = '"Bricolage Grotesque Variable", "Figtree Variable", system-ui, sans-serif';
export const BODY = '"Figtree Variable", system-ui, sans-serif';

/** `read`: the canvas is read back, so keep it in memory: reading a GPU canvas stalls on everything the GPU is doing. */
function canvas(w: number, h: number, read = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d', { willReadFrequently: read })! };
}

function finish(c: HTMLCanvasElement, o: { repeat?: boolean; srgb?: boolean }) {
  const t = new THREE.CanvasTexture(c);
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A painted colour texture, made once per key. */
export function painted(key: string, w: number, h: number, paint: Paint, repeat = false): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    const { c, g } = canvas(w, h);
    paint(g, w, h);
    t = shareResource(finish(c, { repeat }));
    t.name = key;
    cache.set(key, t);
  }
  return t;
}

/**
 * A tangent-space normal map from a painted height field (white is high), made once per key. `strength`
 * is how steep a full black-to-white step is.
 */
export function bumps(key: string, w: number, h: number, paint: Paint, strength = 2, repeat = true): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    const { c, g } = canvas(w, h, true);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    paint(g, w, h);
    const src = g.getImageData(0, 0, w, h).data;
    const out = g.createImageData(w, h);
    const H = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
        const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * w + x) * 4;
        out.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
        // Canvas rows run down, texture v runs up.
        out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
        out.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
        out.data[i + 3] = 255;
      }
    g.putImageData(out, 0, 0);
    t = shareResource(finish(c, { repeat, srgb: false }));
    t.name = key;
    cache.set(key, t);
  }
  return t;
}

/** A seeded generator so every texture paints the same each time. */
export function rand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scatter soft dots: grain, speckle, pores. */
export function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], size: [number, number], alpha: [number, number] = [0.2, 0.7], seed = 1) {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha[0] + r() * (alpha[1] - alpha[0]);
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    g.beginPath();
    g.arc(r() * w, r() * h, s / 2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Text squeezed to fit a width, centred on x. */
export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, maxW: number, color: string, weight = 800, family = FONT) {
  g.font = `${weight} ${size}px ${family}`;
  const m = g.measureText(s).width;
  g.save();
  g.translate(x, y);
  if (m > maxW) g.scale(maxW / m, 1);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s, 0, 0);
  g.restore();
}

/** A filled rounded rectangle. */
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
}

/** Lines of grey "small print": ingredients, instructions, barcodes from a distance. */
export function smallPrint(g: CanvasRenderingContext2D, x: number, y: number, w: number, lines: number, lh: number, color = '#555', seed = 3) {
  const r = rand(seed);
  g.fillStyle = color;
  for (let i = 0; i < lines; i++) {
    let cx = x;
    const end = x + w * (i === lines - 1 ? 0.5 + r() * 0.3 : 1);
    while (cx < end) {
      const ww = Math.min(end - cx, 6 + r() * 26);
      g.globalAlpha = 0.55;
      g.fillRect(cx, y + i * lh, ww, lh * 0.45);
      cx += ww + lh * 0.4;
    }
  }
  g.globalAlpha = 1;
}

/** A barcode block. */
export function barcode(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed = 5) {
  const r = rand(seed);
  g.fillStyle = '#fff';
  g.fillRect(x - 4, y - 4, w + 8, h + 8);
  g.fillStyle = '#111';
  for (let cx = x; cx < x + w; ) {
    const bw = 1 + Math.floor(r() * 3);
    if (r() > 0.4) g.fillRect(cx, y, bw, h * 0.85);
    cx += bw + 1;
  }
}

/** Wood grain running along x, in a board's colours, to fill a rectangle. */
export function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, dark: string, seed = 7, lines = 30) {
  const r = rand(seed);
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let i = 0; i < lines; i++) {
    g.strokeStyle = dark;
    g.globalAlpha = 0.08 + r() * 0.22;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    const y0 = y + r() * h;
    const amp = 1 + r() * 4;
    const f = 40 + r() * 80;
    const ph = r() * 6;
    for (let cx = x; cx <= x + w + 8; cx += 8) g.lineTo(cx, y0 + Math.sin(cx / f + ph) * amp + Math.sin(cx / (f * 0.3)) * amp * 0.2);
    g.stroke();
  }
  // A knot or two.
  for (let k = 0; k < Math.round(w / 400 + r()); k++) {
    const kx = x + r() * w;
    const ky = y + r() * h;
    for (let i = 5; i > 0; i--) {
      g.globalAlpha = 0.12;
      g.strokeStyle = dark;
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(kx, ky, i * 5, i * 2, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

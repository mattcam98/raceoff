/**
 * Every texture in RaceOff is painted at startup on a canvas: gingham, wood,
 * tiles, grass, road markings, item boxes. Nothing to download, and each one
 * is made once and cached.
 */
import * as THREE from 'three';
import { shareResource } from './kit';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function finish(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = shareResource(make());
    cache.set(key, t);
  }
  return t;
}

/** A seeded generator so textures look the same every time. */
function rand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, count: number, colors: string[], size: [number, number], seed = 1) {
  const r = rand(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    g.globalAlpha = 0.25 + r() * 0.5;
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

export const tex = {
  gingham: (a = '#e8414b', b = '#ffffff') =>
    cached(`gingham${a}${b}`, () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = b;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = a;
      g.globalAlpha = 0.55;
      for (let i = 0; i < 4; i++) g.fillRect(i * 64, 0, 32, 256);
      for (let i = 0; i < 4; i++) g.fillRect(0, i * 64, 256, 32);
      g.globalAlpha = 1;
      // Woven threads.
      g.strokeStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 256; i += 3) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 256);
        g.stroke();
      }
      return finish(c);
    }),

  wood: (base = '#b07a47', dark = '#8a5a2e', planks = 4) =>
    cached(`wood${base}${dark}${planks}`, () => {
      const { c, g } = canvas(512, 512);
      const r = rand(7);
      g.fillStyle = base;
      g.fillRect(0, 0, 512, 512);
      const ph = 512 / planks;
      for (let p = 0; p < planks; p++) {
        g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`;
        g.fillRect(0, p * ph, 512, ph);
        for (let i = 0; i < 26; i++) {
          g.strokeStyle = dark;
          g.globalAlpha = 0.12 + r() * 0.2;
          g.lineWidth = 1 + r() * 2;
          g.beginPath();
          const y0 = p * ph + r() * ph;
          g.moveTo(0, y0);
          for (let x = 0; x <= 512; x += 32) g.lineTo(x, y0 + Math.sin(x / 60 + r() * 2) * 3);
          g.stroke();
        }
        g.globalAlpha = 0.5;
        g.fillStyle = dark;
        g.fillRect(0, p * ph, 512, 2);
      }
      g.globalAlpha = 1;
      return finish(c);
    }),

  tiles: (base = '#e9f3f6', grout = '#a9c0c8', n = 4) =>
    cached(`tiles${base}${grout}${n}`, () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = grout;
      g.fillRect(0, 0, 256, 256);
      const s = 256 / n;
      const r = rand(3);
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = base;
          g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
          g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.2})`;
          g.fillRect(x * s + 6, y * s + 6, s * 0.4, s * 0.12);
        }
      return finish(c);
    }),

  checkerFloor: (a = '#f2efe6', b = '#2b2f45') =>
    cached(`checkfloor${a}${b}`, () => {
      const { c, g } = canvas(128, 128);
      g.fillStyle = a;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = b;
      g.fillRect(0, 0, 64, 64);
      g.fillRect(64, 64, 64, 64);
      return finish(c);
    }),

  grass: () =>
    cached('grass', () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = '#5fae45';
      g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 2200, ['#4c9a37', '#72c257', '#3f8a2e', '#86d06a'], [1, 3], 11);
      const r = rand(12);
      g.strokeStyle = '#3b7d2a';
      for (let i = 0; i < 500; i++) {
        const x = r() * 256;
        const y = r() * 256;
        g.globalAlpha = 0.3;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4);
        g.stroke();
      }
      g.globalAlpha = 1;
      return finish(c);
    }),

  sand: () =>
    cached('sand', () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = '#e8cc8e';
      g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 3000, ['#d8b977', '#f3dca6', '#c9a866', '#fff1c9'], [1, 2], 21);
      return finish(c);
    }),

  carpet: (a = '#5d6fd6', b = '#7b8cf0') =>
    cached(`carpet${a}${b}`, () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = a;
      g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 4000, [b, '#4a5bc0', '#6a7ce6'], [1, 2], 31);
      return finish(c);
    }),

  rug: () =>
    cached('rug', () => {
      const { c, g } = canvas(512, 512);
      g.fillStyle = '#f2a541';
      g.fillRect(0, 0, 512, 512);
      const rings = ['#e5534b', '#f2a541', '#38b6c9', '#f7e7c6', '#7c5cc4'];
      for (let i = 0; i < 10; i++) {
        g.strokeStyle = rings[i % rings.length];
        g.lineWidth = 22;
        g.strokeRect(20 + i * 24, 20 + i * 24, 472 - i * 48, 472 - i * 48);
      }
      speckle(g, 512, 512, 6000, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.3)'], [1, 2], 33);
      return finish(c);
    }),

  concrete: () =>
    cached('concrete', () => {
      const { c, g } = canvas(512, 512);
      g.fillStyle = '#8d9097';
      g.fillRect(0, 0, 512, 512);
      speckle(g, 512, 512, 9000, ['#7f838a', '#9a9ea5', '#6f737a', '#a7aab0'], [1, 3], 41);
      g.strokeStyle = 'rgba(30,30,35,0.4)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, 512, 512);
      return finish(c);
    }),

  paper: () =>
    cached('paper', () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = '#fbfaf3';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#9cc3e8';
      g.lineWidth = 2;
      for (let y = 16; y < 256; y += 21) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(256, y);
        g.stroke();
      }
      g.strokeStyle = '#ef8a8a';
      g.beginPath();
      g.moveTo(40, 0);
      g.lineTo(40, 256);
      g.stroke();
      return finish(c);
    }),

  /** Road surface: u runs across the road, v along it. Asphalt with real aggregate, worn lanes and painted lines. */
  road: (base: string, line: string, dash: boolean, edge: string) =>
    cached(`road${base}${line}${dash}${edge}`, () => {
      const W = 512;
      const H = 1024;
      const { c, g } = canvas(W, H);
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      const r = rand(51);
      // Broad tonal patches, so the surface never looks like flat paint. Drawn wrapped, so it tiles.
      for (let i = 0; i < 40; i++) {
        const x = r() * W;
        const y = r() * H;
        const rad = 40 + r() * 120;
        for (const oy of [-H, 0, H]) {
          const grd = g.createRadialGradient(x, y + oy, 0, x, y + oy, rad);
          const dark = r() < 0.5;
          grd.addColorStop(0, dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grd;
          g.fillRect(0, 0, W, H);
        }
      }
      // The two worn lanes karts actually drive on are a little darker and smoother.
      for (const lx of [0.33, 0.67]) {
        const grd = g.createLinearGradient(W * (lx - 0.12), 0, W * (lx + 0.12), 0);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(0.5, 'rgba(0,0,0,0.1)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
      }
      // Aggregate: thousands of tiny stones, light and dark.
      speckle(g, W, H, 26000, ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.18)'], [1, 2.6], 52);
      // A few hairline cracks.
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        let x = r() * W;
        let y = r() * H;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 8; k++) {
          x += (r() - 0.5) * 30;
          y += (r() - 0.3) * 26;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      // Painted lines, worn through in places so the asphalt shows.
      const paint = (x: number, y: number, w: number, h: number, color: string) => {
        g.fillStyle = color;
        g.fillRect(x, y, w, h);
        const rr = rand(Math.round(x * 13 + y));
        g.fillStyle = base;
        for (let i = 0; i < (w * h) / 40; i++) {
          g.globalAlpha = 0.25 + rr() * 0.5;
          g.fillRect(x + rr() * w, y + rr() * h, 1 + rr() * 2, 1 + rr() * 2);
        }
        g.globalAlpha = 1;
      };
      paint(10, 0, 14, H, edge);
      paint(W - 24, 0, 14, H, edge);
      if (dash) {
        paint(W / 2 - 7, 40, 14, 300, line);
        paint(W / 2 - 7, 552, 14, 300, line);
      }
      return finish(c);
    }),

  curb: (a = '#e63946', b = '#ffffff') =>
    cached(`curb${a}${b}`, () => {
      const { c, g } = canvas(64, 128);
      g.fillStyle = a;
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = b;
      g.fillRect(0, 64, 64, 64);
      return finish(c);
    }),

  checker: (n = 8) =>
    cached(`checker${n}`, () => {
      const { c, g } = canvas(256, 64);
      const s = 256 / n;
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
          g.fillRect(x * s, y * 32, s, 32);
        }
      return finish(c);
    }),

  boostPad: () =>
    cached('boost', () => {
      const { c, g } = canvas(128, 256);
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#ff7a00');
      grd.addColorStop(1, '#ffd23f');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = '#fff7d6';
      for (let i = 0; i < 2; i++) {
        const y = i * 128 + 24;
        g.beginPath();
        g.moveTo(10, y + 70);
        g.lineTo(64, y + 10);
        g.lineTo(118, y + 70);
        g.lineTo(118, y + 100);
        g.lineTo(64, y + 40);
        g.lineTo(10, y + 100);
        g.closePath();
        g.fill();
      }
      return finish(c);
    }),

  itemBox: () =>
    cached('itembox', () => {
      const { c, g } = canvas(128, 128);
      const grd = g.createLinearGradient(0, 0, 128, 128);
      grd.addColorStop(0, '#ff5fa2');
      grd.addColorStop(0.35, '#ffd23f');
      grd.addColorStop(0.65, '#3ddc84');
      grd.addColorStop(1, '#3d9bff');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(6, 6, 116, 116);
      g.font = 'bold 92px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(40,20,80,0.6)';
      g.strokeText('?', 64, 70);
      g.fillStyle = '#fff';
      g.fillText('?', 64, 70);
      return finish(c, false);
    }),

  /** A soft round blob, for shadows and glows. */
  blob: () =>
    cached('blob', () => {
      const { c, g } = canvas(128, 128);
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(0,0,0,0.65)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.35)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      return finish(c, false, false);
    }),

  glow: () =>
    cached('glow', () => {
      const { c, g } = canvas(64, 64);
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.3, 'rgba(255,255,255,0.7)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      return finish(c, false, false);
    }),

  puddle: (color: string) =>
    cached(`puddle${color}`, () => {
      const { c, g } = canvas(256, 256);
      const r = rand(color.length * 7);
      g.fillStyle = color;
      g.beginPath();
      // A wobbly blob.
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = 96 + r() * 26;
        const x = 128 + Math.cos(a) * rr;
        const y = 128 + Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.quadraticCurveTo(128 + Math.cos(a - 0.2) * (rr + 14), 128 + Math.sin(a - 0.2) * (rr + 14), x, y);
      }
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(100, 90, 30, 12, -0.5, 0, Math.PI * 2);
      g.fill();
      return finish(c, false);
    }),

  label: (text: string, bg: string, fg: string, w = 256, h = 64) =>
    cached(`label${text}${bg}${fg}${w}${h}`, () => {
      const { c, g } = canvas(w, h);
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.font = `900 ${Math.round(h * 0.62)}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
      return finish(c, false);
    }),

  /** Little player tag that floats over a human's kart. */
  tag: (text: string, color: string) =>
    cached(`tag${text}${color}`, () => {
      const { c, g } = canvas(128, 96);
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(8, 6, 112, 58, 16);
      g.fill();
      g.beginPath();
      g.moveTo(48, 62);
      g.lineTo(64, 88);
      g.lineTo(80, 62);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '900 40px "Bricolage Grotesque Variable", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 64, 37);
      return finish(c, false);
    }),

  stripes: (a: string, b: string, n = 6) =>
    cached(`stripes${a}${b}${n}`, () => {
      const { c, g } = canvas(64, 256);
      const s = 256 / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = i % 2 ? a : b;
        g.fillRect(0, i * s, 64, s);
      }
      return finish(c);
    }),

  toast: () =>
    cached('toast', () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = '#c98a3e';
      g.fillRect(0, 0, 256, 256);
      const grd = g.createRadialGradient(128, 128, 30, 128, 128, 170);
      grd.addColorStop(0, '#e8b66a');
      grd.addColorStop(1, '#a8652a');
      g.fillStyle = grd;
      g.fillRect(14, 14, 228, 228);
      speckle(g, 256, 256, 1600, ['#8a4f1c', '#f2cd8a'], [1, 3], 61);
      return finish(c, false);
    }),

  book: (color: string) =>
    cached(`book${color}`, () => {
      const { c, g } = canvas(256, 64);
      g.fillStyle = '#f6f0e0';
      g.fillRect(0, 0, 256, 64);
      g.strokeStyle = '#d8cfb6';
      for (let y = 4; y < 64; y += 3) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(256, y);
        g.stroke();
      }
      g.fillStyle = color;
      g.fillRect(0, 0, 256, 6);
      g.fillRect(0, 58, 256, 6);
      return finish(c);
    }),

  starsWallpaper: () =>
    cached('starwall', () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = '#8ec5ff';
      g.fillRect(0, 0, 256, 256);
      const r = rand(77);
      g.fillStyle = '#fff6b0';
      for (let i = 0; i < 18; i++) {
        const x = r() * 256;
        const y = r() * 256;
        const s = 6 + r() * 8;
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? s * 0.45 : s;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      }
      return finish(c);
    }),

  sky: (top: string, bottom: string) =>
    cached(`sky${top}${bottom}`, () => {
      const { c, g } = canvas(4, 256);
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, top);
      grd.addColorStop(1, bottom);
      g.fillStyle = grd;
      g.fillRect(0, 0, 4, 256);
      const t = finish(c, false);
      t.wrapS = THREE.ClampToEdgeWrapping;
      return t;
    }),

  bubbles: () =>
    cached('bubbles', () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = 'rgba(160, 220, 255, 0.0)';
      g.fillRect(0, 0, 256, 256);
      const r = rand(91);
      for (let i = 0; i < 40; i++) {
        const x = r() * 256;
        const y = r() * 256;
        const s = 4 + r() * 16;
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fill();
      }
      return finish(c);
    }),

  /** Painted plaster: a flat colour with the faint unevenness of a real wall. */
  plaster: (color: string) =>
    cached(`plaster${color}`, () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = color;
      g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 5000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.06)'], [1, 3], 81);
      const r = rand(82);
      for (let i = 0; i < 30; i++) {
        const x = r() * 256;
        const y = r() * 256;
        const grd = g.createRadialGradient(x, y, 0, x, y, 20 + r() * 50);
        grd.addColorStop(0, r() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.035)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 256, 256);
      }
      return finish(c);
    }),

  /** Regency-stripe wallpaper: stripes run up the wall (u across, v up). */
  wallStripes: (a: string, b: string) =>
    cached(`wallstripes${a}${b}`, () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = a;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = b;
      g.fillRect(0, 0, 80, 256);
      g.fillRect(150, 0, 10, 256);
      g.fillRect(176, 0, 10, 256);
      speckle(g, 256, 256, 3000, ['rgba(0,0,0,0.04)', 'rgba(255,255,255,0.05)'], [1, 2], 83);
      return finish(c);
    }),

  /** Painted cinder blocks, for the garage. One texture is two courses of two blocks. */
  cinder: () =>
    cached('cinder', () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = '#5d6170';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#6b7080';
      for (let row = 0; row < 2; row++)
        for (let col = -1; col < 2; col++) {
          const x = col * 128 + (row % 2) * 64 + 3;
          g.fillRect(x, row * 128 + 3, 122, 122);
        }
      speckle(g, 256, 256, 9000, ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.08)'], [1, 3], 84);
      return finish(c);
    }),

  /** Tongue-and-groove wood panelling, boards running up the wall. */
  panelling: (color: string) =>
    cached(`panel${color}`, () => {
      const { c, g } = canvas(256, 256);
      g.fillStyle = color;
      g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 2000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], [1, 3], 85);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 256);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      for (let x = 3; x < 256; x += 32) g.fillRect(x, 0, 2, 256);
      return finish(c);
    }),
};

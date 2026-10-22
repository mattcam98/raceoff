/**
 * Printed and painted surfaces for the desk and the study: book covers and spines, key caps, the laptop's
 * keyboard and screen, a globe of made-up continents, paper, cork and the things pinned to it.
 */
import type * as THREE from 'three';
import { noise3, type Rect } from './propKit';
import { BODY, FONT, grain, painted, rand, rr, smallPrint, speckle, text } from './propTextures';

/** A rectangle of a W x H canvas as a uv rect (canvas y runs down, v runs up). */
export const cell = (x: number, y: number, w: number, h: number, W: number, H: number): Rect => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

// ---------------------------------------------------------------- books

interface BookLook {
  bg: string;
  fg: string;
  title: string;
  author: string;
  mark: 'star' | 'leaf' | 'wave' | 'wheel' | 'moon' | 'knot' | 'cup' | 'sigma';
}
export const BOOKS: BookLook[] = [
  { bg: '#1f3a5f', fg: '#e9c46a', title: 'THE TINY RACERS', author: 'M. Wheeler', mark: 'wheel' },
  { bg: '#9b2226', fg: '#f4e3c1', title: 'ATLAS OF TEA', author: 'P. Leaf', mark: 'cup' },
  { bg: '#2a9d8f', fg: '#ffffff', title: 'SEA STORIES', author: 'R. Tide', mark: 'wave' },
  { bg: '#e9c46a', fg: '#3b2a14', title: 'MOONLIGHT GARDEN', author: 'L. Bloom', mark: 'moon' },
  { bg: '#5e3c8a', fg: '#f1e3ff', title: 'ALGEBRA II', author: 'Prof. Sum', mark: 'sigma' },
  { bg: '#ee6c4d', fg: '#fff4e6', title: 'BIG BOOK OF KNOTS', author: 'S. Rope', mark: 'knot' },
  { bg: '#3a5a40', fg: '#e9d8a6', title: 'WILD FERNS', author: 'A. Moss', mark: 'leaf' },
  { bg: '#22223b', fg: '#c9ada7', title: 'STAR CHARTS', author: 'N. Orbit', mark: 'star' },
];
const BW = 1024;
const BH = 2048;
const band = (i: number) => (i % BOOKS.length) * 256;
/** Where a design's cover, spine and plain board colour sit on the books sheet. */
export const bookCells = (i: number) => ({
  cover: cell(4, band(i) + 2, 352, 252, BW, BH),
  spine: cell(372, band(i) + 4, 640, 80, BW, BH),
  board: cell(390, band(i) + 120, 600, 110, BW, BH),
});

function mark(g: CanvasRenderingContext2D, kind: BookLook['mark'], x: number, y: number, s: number, color: string) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = s * 0.12;
  g.beginPath();
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? s * 0.4 : s;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  } else if (kind === 'leaf') {
    g.moveTo(0, s);
    g.quadraticCurveTo(s, 0, 0, -s);
    g.quadraticCurveTo(-s, 0, 0, s);
    g.fill();
  } else if (kind === 'wave') {
    for (let k = 0; k < 3; k++) {
      g.moveTo(-s, k * s * 0.4 - s * 0.4);
      for (let x = -s; x <= s; x += 2) g.lineTo(x, k * s * 0.4 - s * 0.4 + Math.sin((x / s) * Math.PI * 2) * s * 0.15);
    }
    g.stroke();
  } else if (kind === 'wheel') {
    g.arc(0, 0, s, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 6; k++) {
      g.moveTo(0, 0);
      g.lineTo(Math.cos((k * Math.PI) / 3) * s, Math.sin((k * Math.PI) / 3) * s);
    }
    g.stroke();
  } else if (kind === 'moon') {
    g.arc(0, 0, s, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(s * 0.45, -s * 0.2, s * 0.85, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  } else if (kind === 'knot') {
    g.ellipse(-s * 0.3, 0, s * 0.6, s * 0.35, 0.6, 0, Math.PI * 2);
    g.moveTo(s * 0.9, 0);
    g.ellipse(s * 0.3, 0, s * 0.6, s * 0.35, -0.6, 0, Math.PI * 2);
    g.stroke();
  } else if (kind === 'cup') {
    g.moveTo(-s * 0.7, -s * 0.3);
    g.lineTo(s * 0.5, -s * 0.3);
    g.quadraticCurveTo(s * 0.5, s * 0.8, -s * 0.1, s * 0.8);
    g.quadraticCurveTo(-s * 0.7, s * 0.8, -s * 0.7, -s * 0.3);
    g.fill();
    g.beginPath();
    g.arc(s * 0.6, s * 0.15, s * 0.25, -Math.PI / 2, Math.PI / 2);
    g.stroke();
  } else {
    g.font = `900 ${s * 2}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Σ', 0, 0);
  }
  g.restore();
}

/** Every book's cover, spine and board colour on one sheet, so all books share one material. */
export const bookSheet = (): THREE.Texture =>
  painted('desk-books', BW, BH, (g) => {
    BOOKS.forEach((b, i) => {
      const y = band(i);
      g.fillStyle = b.bg;
      g.fillRect(0, y, BW, 256);
      // Bookcloth weave.
      g.save();
      g.translate(0, y);
      speckle(g, BW, 256, 3000, ['#000000', '#ffffff'], [1, 2.5], [0.03, 0.09], i + 40);
      g.restore();
      // Cover: a framed title and an emblem, turned so the spine (the top of the cell) is on its left.
      g.save();
      g.translate(180, y + 128);
      g.rotate(Math.PI / 2);
      g.strokeStyle = b.fg;
      g.lineWidth = 3;
      g.strokeRect(-112, -162, 224, 324);
      g.lineWidth = 1.5;
      g.strokeRect(-104, -154, 208, 308);
      const words = b.title.split(' ');
      const half = Math.ceil(words.length / 2);
      text(g, words.slice(0, half).join(' '), 0, -100, 34, 190, b.fg, 900);
      if (words.length > 1) text(g, words.slice(half).join(' '), 0, -62, 34, 190, b.fg, 900);
      mark(g, b.mark, 0, 20, 34, b.fg);
      text(g, b.author, 0, 120, 22, 180, b.fg, 600, BODY);
      g.restore();
      // Spine: gilt bands at both ends, title along it.
      const sy = y + 4;
      g.fillStyle = b.fg;
      for (const sx of [380, 396, 988, 1004]) g.fillRect(sx, sy + 6, 4, 68);
      text(g, b.title, 692, sy + 40, 40, 500, b.fg, 900);
      g.globalAlpha = 0.25;
      g.fillStyle = '#000';
      g.fillRect(372, sy, 640, 6);
      g.fillRect(372, sy + 74, 640, 6);
      g.globalAlpha = 1;
    });
    // Page edges: fine lines of paper.
    g.fillStyle = '#f4ecd8';
    g.fillRect(372, 88, 640, 28);
    const r = rand(2);
    for (let y = 89; y < 115; y += 2) {
      g.fillStyle = `rgba(150,130,90,${0.15 + r() * 0.3})`;
      g.fillRect(372, y, 640, 1);
    }
  });
/** The page edges on the books sheet. */
export const PAGES = cell(374, 90, 636, 24, BW, BH);

// ---------------------------------------------------------------- calculator

export const KEYS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '√', '='],
];
const keyColor = (k: string) => (k === 'C' ? '#e63946' : k === '=' ? '#ff9f1c' : '÷×−+'.includes(k) ? '#8d93a5' : '%±√'.includes(k) ? '#5c6378' : '#eef0f4');
/** Calculator keys, each a 128 x 100 cell of a 512 x 512 sheet. */
export const keyCaps = (): THREE.Texture =>
  painted('desk-keys', 512, 512, (g) => {
    KEYS.forEach((row, r) =>
      row.forEach((k, c) => {
        const x = c * 128;
        const y = r * 100;
        const col = keyColor(k);
        g.fillStyle = col;
        g.fillRect(x, y, 128, 100);
        const grd = g.createLinearGradient(0, y, 0, y + 100);
        grd.addColorStop(0, 'rgba(255,255,255,0.25)');
        grd.addColorStop(1, 'rgba(0,0,0,0.15)');
        g.fillStyle = grd;
        g.fillRect(x + 6, y + 6, 116, 88);
        text(g, k, x + 64, y + 52, 56, 100, col === '#eef0f4' ? '#2b2f3a' : '#ffffff', 800);
      }),
    );
  });
export const keyCell = (r: number, c: number) => ({ top: cell(c * 128 + 4, r * 100 + 4, 120, 92, 512, 512), side: cell(c * 128 + 2, r * 100 + 2, 6, 6, 512, 512) });

/** The calculator's face above the keys: brand, solar cells and the display. */
export const calcFace = (): THREE.Texture =>
  painted('desk-calcface', 512, 320, (g, w, h) => {
    g.fillStyle = '#2f3443';
    g.fillRect(0, 0, w, h);
    text(g, 'MATHLETE SX-8', 130, 40, 30, 220, '#c9cfdd', 800);
    for (let i = 0; i < 4; i++) rr(g, 300 + i * 50, 22, 46, 38, 3, '#3a2b2a');
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(300 + i * 50, 41);
      g.lineTo(346 + i * 50, 41);
      g.stroke();
    }
    rr(g, 24, 86, w - 48, h - 120, 14, '#15171d');
    const lcd = g.createLinearGradient(0, 100, 0, h - 50);
    lcd.addColorStop(0, '#b9cfa6');
    lcd.addColorStop(1, '#9fb98c');
    rr(g, 40, 102, w - 80, h - 152, 8, '');
    g.fillStyle = lcd;
    g.fill();
    g.font = `500 92px "Courier New", monospace`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillStyle = '#26301f';
    g.fillText('3.14159', w - 60, 190);
    text(g, 'DEG', 80, 125, 20, 60, '#26301f', 700, BODY);
  });

// ---------------------------------------------------------------- laptop

/** The keyboard deck, keys and trackpad seen from above: 1024 x 704 for a 58 x 40 deck. */
export const laptopDeck = (): THREE.Texture =>
  painted('desk-deck', 1024, 704, (g, w, h) => {
    g.fillStyle = '#c9ced6';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, ['#ffffff', '#9aa0aa'], [1, 2], [0.05, 0.15], 3);
    // Speaker grilles either side.
    g.fillStyle = '#7d838f';
    for (const sx of [24, w - 64]) for (let y = 30; y < 360; y += 12) for (let x = 0; x < 40; x += 12) g.fillRect(sx + x, y, 5, 5);
    const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM';
    const rows = [13, 13, 12, 11];
    let li = 0;
    const kw = 56;
    for (let r = 0; r < 5; r++) {
      const n = r < 4 ? rows[r] : 0;
      const off = 92 + [0, 14, 28, 50][r];
      if (r === 4) {
        // Space row.
        rr(g, 92, 30 + 4 * 66, 120, 56, 8, '#1d1f25');
        rr(g, 222, 30 + 4 * 66, 470, 56, 8, '#1d1f25');
        rr(g, 702, 30 + 4 * 66, 120, 56, 8, '#1d1f25');
        rr(g, 832, 30 + 4 * 66, 100, 56, 8, '#1d1f25');
        continue;
      }
      for (let k = 0; k < n; k++) {
        const x = off + k * (kw + 8);
        if (x + kw > w - 80) break;
        rr(g, x, 30 + r * 66, kw, 56, 8, '#1d1f25');
        const ch = r === 0 ? '1234567890-=⌫'[k] : letters[li++ % letters.length];
        if (ch) text(g, ch, x + kw / 2, 30 + r * 66 + 28, 24, kw - 8, '#e8eaee', 600, BODY);
      }
    }
    // Trackpad.
    rr(g, w / 2 - 190, 400, 380, 260, 20, '#bfc4cc');
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 3;
    g.stroke();
  });

/** The screen: a sunset wallpaper and a track editor window. */
export const laptopScreen = (): THREE.Texture =>
  painted('desk-screen', 1024, 704, (g, w, h) => {
    g.fillStyle = '#0b0c10';
    g.fillRect(0, 0, w, h);
    const x0 = 28;
    const y0 = 28;
    const sw = w - 56;
    const sh = h - 70;
    const sky = g.createLinearGradient(0, y0, 0, y0 + sh);
    sky.addColorStop(0, '#3b2c85');
    sky.addColorStop(0.55, '#e0607e');
    sky.addColorStop(1, '#ffb15e');
    g.fillStyle = sky;
    g.fillRect(x0, y0, sw, sh);
    g.fillStyle = '#ffe08a';
    g.beginPath();
    g.arc(x0 + sw * 0.75, y0 + sh * 0.7, 70, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1f55';
    g.beginPath();
    g.moveTo(x0, y0 + sh);
    for (let x = 0; x <= sw; x += 20) g.lineTo(x0 + x, y0 + sh * 0.78 - Math.sin(x / 90) * 30 - Math.sin(x / 37) * 10);
    g.lineTo(x0 + sw, y0 + sh);
    g.fill();
    // Menu bar and a window.
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(x0, y0, sw, 22);
    rr(g, x0 + 90, y0 + 70, 560, 400, 12, '#f4f5f8');
    g.fillStyle = '#dfe2ea';
    g.fillRect(x0 + 90, y0 + 70, 560, 34);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x0 + 112 + i * 22, y0 + 87, 7, 0, Math.PI * 2);
      g.fill();
    });
    text(g, 'track-editor', x0 + 370, y0 + 87, 18, 200, '#555', 600, BODY);
    g.strokeStyle = '#3c4152';
    g.lineWidth = 22;
    g.lineJoin = 'round';
    g.beginPath();
    g.ellipse(x0 + 370, y0 + 290, 200, 120, 0.2, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 3;
    g.setLineDash([12, 10]);
    g.stroke();
    g.setLineDash([]);
    ['#e63946', '#3d9bff', '#06d6a0'].forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(x0 + 520 - i * 30, y0 + 200 + i * 10, 14, 10);
    });
    // Dock.
    rr(g, x0 + sw / 2 - 180, y0 + sh - 54, 360, 46, 14, 'rgba(255,255,255,0.35)');
    ['#3d9bff', '#ff9f1c', '#06d6a0', '#ef476f', '#8d5bc1', '#ffd23f'].forEach((c, i) => rr(g, x0 + sw / 2 - 160 + i * 56, y0 + sh - 48, 36, 36, 9, c));
  });

// ---------------------------------------------------------------- globe

/** An equirectangular map of made-up continents, laid out for three's SphereGeometry uvs. */
export const globeMap = (): THREE.Texture =>
  painted('desk-globe', 1024, 512, (g, w, h) => {
    const n = noise3(11);
    const img = g.createImageData(w, h);
    const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
    for (let y = 0; y < h; y++) {
      const th = ((y + 0.5) / h) * Math.PI;
      for (let x = 0; x < w; x++) {
        const ph = ((x + 0.5) / w) * Math.PI * 2;
        const px = -Math.cos(ph) * Math.sin(th);
        const py = Math.cos(th);
        const pz = Math.sin(ph) * Math.sin(th);
        const e = n(px * 1.5, py * 1.5, pz * 1.5) + 0.5 * n(px * 3.4 + 9, py * 3.4, pz * 3.4) + 0.22 * n(px * 9, py * 9 + 3, pz * 9);
        let c: number[];
        if (Math.abs(py) > 0.93) c = [240, 244, 246];
        else if (e > 0.12) c = e > 0.55 ? mix([196, 168, 108], [150, 120, 80], Math.min(1, (e - 0.55) * 3)) : mix([132, 184, 96], [176, 190, 104], (e - 0.12) * 2);
        else c = mix([38, 92, 160], [96, 160, 214], Math.max(0, 1 + (e - 0.12) * 2.4));
        // Aged paper tint.
        c = mix(c, [236, 220, 180], 0.12);
        const i = (y * w + x) * 4;
        img.data[i] = c[0];
        img.data[i + 1] = c[1];
        img.data[i + 2] = c[2];
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 1;
    for (let k = 1; k < 12; k++) {
      g.beginPath();
      g.moveTo((k / 12) * w, 0);
      g.lineTo((k / 12) * w, h);
      g.stroke();
    }
    for (let k = 1; k < 6; k++) {
      g.beginPath();
      g.moveTo(0, (k / 6) * h);
      g.lineTo(w, (k / 6) * h);
      g.stroke();
    }
    g.strokeStyle = 'rgba(200,40,40,0.5)';
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    g.font = `italic 600 18px ${BODY}`;
    g.fillStyle = 'rgba(20,40,80,0.7)';
    g.fillText('MARE TINYUM', 180, 300);
    g.fillText('Kart Sea', 700, 200);
  });

// ---------------------------------------------------------------- paper

/** A lined page: margin, punched holes along the top, a doodle and some writing. 768 x 1024. */
export const notePage = (): THREE.Texture =>
  painted('desk-notepage', 768, 1024, (g, w, h) => {
    g.fillStyle = '#fdfcf6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a9c8ec';
    g.lineWidth = 2;
    for (let y = 130; y < h - 20; y += 34) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.strokeStyle = '#ef8a8a';
    g.beginPath();
    g.moveTo(90, 60);
    g.lineTo(90, h);
    g.stroke();
    // Holes for the spiral.
    g.fillStyle = '#c9c3b2';
    for (let x = 22; x < w; x += 32) {
      g.beginPath();
      g.arc(x, 22, 6, 0, Math.PI * 2);
      g.fill();
    }
    // Handwriting: wavy pencil lines.
    const r = rand(17);
    g.strokeStyle = '#3a3f6b';
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    for (let line = 0; line < 9; line++) {
      const y = 155 + line * 34;
      let x = 110;
      const end = 110 + (line === 8 ? 260 : 450 + r() * 160);
      g.beginPath();
      g.moveTo(x, y);
      while (x < end) {
        const wl = 14 + r() * 40;
        for (let t = 0; t < wl; t += 3) g.lineTo(x + t, y - 4 - Math.abs(Math.sin((x + t) * 0.45)) * (6 + r() * 6));
        x += wl + 12;
        g.moveTo(x, y);
      }
      g.stroke();
    }
    // A doodle of a kart and a race flag.
    g.strokeStyle = '#e63946';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(170, 620, 260, 90, 20);
    g.moveTo(250, 620);
    g.lineTo(290, 560);
    g.lineTo(350, 560);
    g.lineTo(370, 620);
    g.stroke();
    for (const cx of [220, 380]) {
      g.beginPath();
      g.arc(cx, 720, 34, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = '#222';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(520, 760);
    g.lineTo(520, 560);
    g.stroke();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) g.fillRect(522 + i * 24, 560 + j * 22, 24, 22);
    g.strokeRect(522, 560, 96, 66);
  });

/** A sticky-note pad, in grey so a tint colours it: the top note with writing (512 x 400) and the edges of the pad below. */
export const stickySheet = (): THREE.Texture =>
  painted('desk-sticky', 512, 512, (g, w) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, 512);
    const grd = g.createLinearGradient(0, 0, 0, 400);
    grd.addColorStop(0, 'rgba(0,0,0,0.08)');
    grd.addColorStop(0.2, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, 400);
    g.strokeStyle = '#1d2a6b';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const r = rand(29);
    for (let line = 0; line < 3; line++) {
      let x = 70;
      const y = 140 + line * 80;
      const end = line === 2 ? 260 : 440;
      g.beginPath();
      while (x < end) {
        const wl = 30 + r() * 60;
        g.moveTo(x, y);
        for (let t = 0; t < wl; t += 4) g.lineTo(x + t, y - Math.abs(Math.sin((x + t) * 0.3)) * 22);
        x += wl + 20;
      }
      g.stroke();
    }
    g.beginPath();
    g.moveTo(300, 300);
    g.quadraticCurveTo(360, 360, 430, 290);
    g.stroke();
    // Layers of the pad.
    for (let y = 400; y < 512; y += 4) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y, w, 1);
    }
  });
export const STICKY_TOP: Rect = cell(0, 0, 512, 400, 512, 512);
export const STICKY_EDGE: Rect = cell(0, 404, 512, 104, 512, 512);

/** A wooden ruler with centimetres, 1024 x 104 for a 60 x 6 rule. */
export const rulerFace = (): THREE.Texture =>
  painted('desk-ruler', 1024, 104, (g, w, h) => {
    grain(g, 0, 0, w, h, '#e3bd7c', '#a8763c', 5, 18);
    g.fillStyle = '#2b2116';
    for (let mm = 0; mm <= 290; mm++) {
      const x = 22 + mm * 3.36;
      const len = mm % 10 === 0 ? 34 : mm % 5 === 0 ? 24 : 14;
      g.fillRect(x, 0, 1.6, len);
      if (mm % 10 === 0) text(g, String(mm / 10), x + 1, 50, 20, 30, '#2b2116', 700, BODY);
    }
    text(g, 'WOODMARK 30 cm', w / 2, 84, 16, 200, '#5a4128', 600, BODY);
  });

/** The card sleeve round an eraser. */
export const eraserSleeve = (): THREE.Texture =>
  painted('desk-sleeve', 512, 256, (g, w, h) => {
    g.fillStyle = '#2f6fd6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(0, h * 0.18, w, 10);
    g.fillRect(0, h * 0.78, w, 10);
    text(g, 'ERASE-IT', w / 2, h / 2, 88, w - 60, '#ffffff', 900);
    text(g, 'dust-free · soft', w / 2, h * 0.68, 26, w - 100, '#cfe0ff', 600, BODY);
  });

/** Cork. */
export const cork = (): THREE.Texture =>
  painted(
    'desk-cork',
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#c49a64';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 9000, ['#8a6034', '#e0bb85', '#6e4a26', '#d6ab70'], [1, 4], [0.25, 0.75], 33);
    },
    true,
  );

// ---------------------------------------------------------------- pinboard

const PW = 1024;
const PH = 1024;
/** Everything pinned to the board, on one sheet. */
export const PINS = {
  calendar: cell(0, 0, 400, 520, PW, PH),
  photo1: cell(410, 0, 260, 300, PW, PH),
  photo2: cell(680, 0, 260, 300, PW, PH),
  note: cell(410, 310, 240, 240, PW, PH),
  todo: cell(660, 310, 200, 280, PW, PH),
  postcard: cell(0, 530, 420, 280, PW, PH),
  drawing: cell(430, 600, 400, 300, PW, PH),
  paper: cell(990, 990, 20, 20, PW, PH),
};
export const pinSheet = (): THREE.Texture =>
  painted('desk-pins', PW, PH, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, PW, PH);
    // Calendar.
    g.fillStyle = '#e63946';
    g.fillRect(0, 0, 400, 90);
    text(g, 'OCTOBER', 200, 48, 52, 340, '#fff', 900);
    const r = rand(8);
    for (let i = 0; i < 35; i++) {
      const x = 14 + (i % 7) * 53;
      const y = 110 + Math.floor(i / 7) * 80;
      g.strokeStyle = '#ccd';
      g.lineWidth = 1.5;
      g.strokeRect(x, y, 53, 80);
      if (i >= 2 && i < 33) text(g, String(i - 1), x + 14, y + 14, 16, 30, '#556', 700, BODY);
      if (r() < 0.12) {
        g.strokeStyle = '#3d5a80';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x + 26, y + 46, 18, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // Two instant photos: hills under a sun, and a kart on a track.
    const photo = (x: number, draw: (px: number, py: number) => void) => {
      g.fillStyle = '#fbfbf7';
      g.fillRect(x, 0, 260, 300);
      g.save();
      g.beginPath();
      g.rect(x + 16, 16, 228, 220);
      g.clip();
      draw(x + 16, 16);
      g.restore();
    };
    photo(410, (px, py) => {
      const s = g.createLinearGradient(0, py, 0, py + 220);
      s.addColorStop(0, '#6fb7ff');
      s.addColorStop(1, '#d6efff');
      g.fillStyle = s;
      g.fillRect(px, py, 228, 220);
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(px + 170, py + 60, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4caf50';
      g.beginPath();
      g.ellipse(px + 60, py + 230, 140, 90, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2e7d32';
      g.beginPath();
      g.ellipse(px + 200, py + 240, 120, 70, 0, 0, Math.PI * 2);
      g.fill();
    });
    photo(680, (px, py) => {
      g.fillStyle = '#7d8a96';
      g.fillRect(px, py, 228, 220);
      g.fillStyle = '#3c4152';
      g.fillRect(px, py + 90, 228, 90);
      g.fillStyle = '#fff';
      for (let x = 0; x < 228; x += 40) g.fillRect(px + x, py + 132, 22, 5);
      g.fillStyle = '#e63946';
      rr(g, px + 70, py + 100, 90, 34, 10, '#e63946');
      g.fillStyle = '#111';
      for (const cx of [90, 145]) {
        g.beginPath();
        g.arc(px + cx, py + 136, 12, 0, Math.PI * 2);
        g.fill();
      }
    });
    text(g, 'race day!', 540, 270, 30, 200, '#333', 500, BODY);
    text(g, 'me + gran', 810, 270, 30, 200, '#333', 500, BODY);
    // A sticky note and a to-do list.
    g.fillStyle = '#fff176';
    g.fillRect(410, 310, 240, 240);
    text(g, 'Buy milk!', 530, 400, 44, 200, '#283593', 700, BODY);
    text(g, '+ batteries', 530, 460, 30, 200, '#283593', 600, BODY);
    g.fillStyle = '#ffffff';
    g.fillRect(660, 310, 200, 280);
    text(g, 'TO DO', 760, 345, 32, 160, '#e63946', 900);
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = '#334';
      g.lineWidth = 2;
      g.strokeRect(676, 380 + i * 34, 16, 16);
      if (i < 3) {
        g.beginPath();
        g.moveTo(678, 388 + i * 34);
        g.lineTo(684, 394 + i * 34);
        g.lineTo(694, 378 + i * 34);
        g.stroke();
      }
      smallPrint(g, 702, 384 + i * 34, 140, 1, 14, '#334', i + 2);
    }
    // A postcard.
    const sea = g.createLinearGradient(0, 530, 0, 810);
    sea.addColorStop(0, '#5ec8f2');
    sea.addColorStop(0.55, '#a3e4ff');
    sea.addColorStop(0.56, '#1f8ac0');
    sea.addColorStop(1, '#f2d49b');
    g.fillStyle = sea;
    g.fillRect(0, 530, 420, 280);
    text(g, 'Greetings from', 210, 590, 34, 360, '#fff', 700, BODY);
    text(g, 'SEASIDE', 210, 650, 84, 380, '#ff7a1a', 900);
    // A child's crayon drawing: a house, a sun, a stick family.
    g.fillStyle = '#fffdf5';
    g.fillRect(430, 600, 400, 300);
    g.lineWidth = 6;
    g.strokeStyle = '#ef476f';
    g.strokeRect(500, 740, 120, 110);
    g.beginPath();
    g.moveTo(490, 745);
    g.lineTo(560, 670);
    g.lineTo(630, 745);
    g.stroke();
    g.strokeStyle = '#ffb703';
    g.beginPath();
    g.arc(760, 660, 30, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(760 + Math.cos(a) * 40, 660 + Math.sin(a) * 40);
      g.lineTo(760 + Math.cos(a) * 56, 660 + Math.sin(a) * 56);
      g.stroke();
    }
    g.strokeStyle = '#06a77d';
    g.beginPath();
    g.moveTo(430, 880);
    for (let x = 430; x < 830; x += 14) g.lineTo(x, 880 - (x % 28 ? 12 : 0));
    g.stroke();
    g.strokeStyle = '#3d5a80';
    for (const fx of [690, 740]) {
      g.beginPath();
      g.arc(fx, 770, 12, 0, Math.PI * 2);
      g.moveTo(fx, 782);
      g.lineTo(fx, 830);
      g.lineTo(fx - 14, 860);
      g.moveTo(fx, 830);
      g.lineTo(fx + 14, 860);
      g.moveTo(fx - 18, 800);
      g.lineTo(fx + 18, 800);
      g.stroke();
    }
  });

/** Leaf banding for the snake plant (repeats). */
export const snakeLeaf = (): THREE.Texture =>
  painted(
    'desk-snakeleaf',
    128,
    256,
    (g, w, h) => {
      g.fillStyle = '#2f6b33';
      g.fillRect(0, 0, w, h);
      const r = rand(12);
      for (let y = 0; y < h; y += 10 + r() * 12) {
        g.strokeStyle = r() > 0.5 ? 'rgba(170,210,140,0.55)' : 'rgba(20,50,20,0.5)';
        g.lineWidth = 2 + r() * 4;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 12 + y) * 4);
        g.stroke();
      }
    },
    true,
  );

/** Wood grain for furniture, along u (or along v when `vertical`). */
export const furnitureWood = (vertical = false): THREE.Texture =>
  painted(`desk-wood${vertical ? 'v' : 'h'}`, 512, 512, (g, w, h) => {
    if (vertical) {
      g.translate(w, 0);
      g.rotate(Math.PI / 2);
    }
    grain(g, 0, 0, w, h, '#9a6a3e', '#5e3a1c', 19, 60);
  });

/** Soil with crumbs. */
export const soil = (): THREE.Texture =>
  painted('desk-soil', 128, 128, (g, w, h) => {
    g.fillStyle = '#4a3222';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 600, ['#2a1a10', '#6b4a32', '#8a7a6a'], [1, 4], [0.4, 0.9], 4);
  });

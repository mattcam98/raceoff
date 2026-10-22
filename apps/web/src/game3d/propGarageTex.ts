/**
 * Printed and painted surfaces for the garage props: tyre rubber, tin labels, the drum's hazard sticker,
 * the battery wrapper, wood, stencils, the pegboard and a number plate. All brands are made up.
 */
import { bumps, FONT, grain, painted, rand, smallPrint, speckle, text } from './propTextures';

/** Tyre sheet, 1024 x 512: top half the sidewall (u runs round the tyre), bottom half the tread. */
export const TYRE_SIDE = [0, 0.5, 1, 1] as [number, number, number, number];
export const TYRE_TREAD = [0, 0, 1, 0.5] as [number, number, number, number];

const treadBlocks = (g: CanvasRenderingContext2D, w: number, top: number, h: number, color: string) => {
  // Blocks between a centre rib and two shoulder grooves, chevrons every 16px.
  g.fillStyle = color;
  for (let x = 0; x < w; x += 16) {
    for (const [y0, y1] of [[0.08, 0.36], [0.64, 0.92]]) g.fillRect(x + 3, top + h * y0, 9, h * (y1 - y0));
    g.save();
    g.translate(x + 8, top + h * 0.5);
    g.rotate(0.5);
    g.fillRect(-1.5, -h * 0.1, 3, h * 0.2);
    g.restore();
  }
};

export const tyreMap = () =>
  painted('g-tyre', 1024, 512, (g, w, h) => {
    g.fillStyle = '#26272c';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, ['#33343a', '#1c1d21'], [1, 3], [0.3, 0.7], 41);
    // Sidewall: raised lettering twice round, and a ring of small print.
    for (const x of [w * 0.25, w * 0.75]) {
      text(g, 'ROADGRIP', x - 60, h * 0.24, 70, 300, '#4a4c54', 900);
      text(g, '185/65 R14', x + 190, h * 0.24, 38, 200, '#44464d', 800);
    }
    g.fillStyle = '#3a3c43';
    g.fillRect(0, h * 0.41, w, 3);
    smallPrint(g, 0, h * 0.06, w, 1, 16, '#3c3e45', 9);
    treadBlocks(g, w, h / 2, h / 2, '#2f3036');
  });

export const tyreBumps = () =>
  bumps('g-tyreb', 1024, 512, (g, w, h) => {
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, 0, w, h / 2);
    for (const x of [w * 0.25, w * 0.75]) {
      text(g, 'ROADGRIP', x - 60, h * 0.24, 70, 300, '#d0d0d0', 900);
      text(g, '185/65 R14', x + 190, h * 0.24, 38, 200, '#c8c8c8', 800);
    }
    g.fillStyle = '#303030';
    g.fillRect(0, h / 2, w, h / 2);
    treadBlocks(g, w, h / 2, h / 2, '#e0e0e0');
  }, 3, false);

/** A paint tin's wrap-round label in its paint's colour. */
export const paintLabel = (color: string) =>
  painted(`g-paint${color}`, 1024, 256, (g, w, h) => {
    g.fillStyle = '#f7f4ee';
    g.fillRect(0, 0, w, h);
    for (const x0 of [0, w / 2]) {
      g.fillStyle = color;
      g.fillRect(x0, 0, w / 2, 46);
      g.fillRect(x0, h - 30, w / 2, 30);
      // A splash of the colour behind the brand.
      g.beginPath();
      const r = rand(x0 + 3);
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const rr = 62 + r() * 26;
        g.lineTo(x0 + 120 + Math.cos(a) * rr * 1.2, 140 + Math.sin(a) * rr * 0.8);
      }
      g.fill();
      text(g, 'BRIGHTWALL', x0 + 330, 108, 64, 300, '#1d2233', 900);
      text(g, 'Gloss Enamel  ·  Interior & Exterior', x0 + 330, 160, 24, 300, '#555', 700);
      text(g, '2.5 L', x0 + 120, 140, 40, 120, '#fff', 900);
      smallPrint(g, x0 + 200, 190, 260, 2, 14, '#777', x0 + 5);
    }
    // A run of dried paint down the label.
    g.fillStyle = color;
    g.fillRect(w * 0.62, 0, 10, 120);
    g.beginPath();
    g.arc(w * 0.62 + 5, 120, 7, 0, Math.PI * 2);
    g.fill();
  });

/** The oil drum's sticker: product name and a flammable diamond. */
export const drumLabel = () =>
  painted('g-drum', 512, 256, (g, w, h) => {
    g.fillStyle = '#f1efe6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d2233';
    g.fillRect(0, 0, w, 50);
    text(g, 'TORKMAX', w * 0.36, 26, 40, 300, '#ffd23f', 900);
    text(g, 'MOTOR OIL 10W-40', w * 0.36, 86, 34, 330, '#1d2233', 900);
    text(g, '205 L', w * 0.36, 128, 30, 200, '#e63946', 900);
    smallPrint(g, 24, 160, 330, 4, 18, '#666', 12);
    // Hazard diamond.
    g.save();
    g.translate(w - 76, h / 2 + 22);
    g.rotate(Math.PI / 4);
    g.fillStyle = '#e63946';
    g.fillRect(-52, -52, 104, 104);
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.strokeRect(-44, -44, 88, 88);
    g.restore();
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(w - 76, h / 2 - 8);
    g.bezierCurveTo(w - 56, h / 2 + 18, w - 60, h / 2 + 48, w - 76, h / 2 + 50);
    g.bezierCurveTo(w - 92, h / 2 + 48, w - 98, h / 2 + 22, w - 76, h / 2 - 8);
    g.fill();
    speckle(g, w, h, 300, ['#8a7a5a'], [2, 6], [0.05, 0.2], 13);
  });

/** The battery wrapper: black body, copper shoulder; u runs round, v up the battery. */
export const batteryLabel = () =>
  painted('g-batt', 1024, 512, (g, w, h) => {
    g.fillStyle = '#16171c';
    g.fillRect(0, 0, w, h);
    const cu = g.createLinearGradient(0, 0, 0, h * 0.34);
    cu.addColorStop(0, '#f0b064');
    cu.addColorStop(0.6, '#c87a35');
    cu.addColorStop(1, '#a25a22');
    g.fillStyle = cu;
    g.fillRect(0, 0, w, h * 0.32);
    g.fillStyle = '#1d1d22';
    g.fillRect(0, h * 0.32, w, 6);
    for (const x of [w * 0.25, w * 0.75]) {
      g.save();
      g.translate(x, h * 0.62);
      g.rotate(-Math.PI / 2);
      text(g, 'POWER+', 0, 0, 92, 300, '#f2f2f2', 900);
      g.restore();
      text(g, '+', x, h * 0.16, 110, 120, '#1d1d22', 900);
      text(g, 'AA  1.5V', x + 120, h * 0.6, 34, 200, '#c87a35', 800);
      text(g, 'ALKALINE', x + 120, h * 0.68, 24, 200, '#888', 700);
    }
  });

/** Pale timber, grain running along u. */
export const crateWood = () =>
  painted('g-wood', 512, 128, (g, w, h) => {
    grain(g, 0, 0, w, h, '#ddb072', '#8a5a2a', 17, 18);
    speckle(g, w, h, 160, ['#7a5428'], [1, 3], [0.1, 0.3], 18);
  }, true);

/** Butcher-block bench top: strips of oak. */
export const benchWood = () =>
  painted('g-bench', 1024, 256, (g, w, h) => {
    const r = rand(5);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const tone = ['#b98a55', '#a87643', '#c69a63', '#9e6d3c'][Math.floor(r() * 4)];
      grain(g, 0, (i * h) / n, w, h / n + 1, tone, '#6e4a26', 30 + i, 6);
      g.fillStyle = 'rgba(60,35,15,0.35)';
      g.fillRect(0, (i * h) / n, w, 1.5);
    }
    // Years of use: rings and scorch marks.
    speckle(g, w, h, 40, ['#4a3018'], [6, 16], [0.04, 0.12], 6);
    g.strokeStyle = 'rgba(70,40,20,0.18)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(w * 0.7, h * 0.4, 24, 0, Math.PI * 2);
    g.stroke();
  }, true);

/** A black stencil on a transparent sheet, for the crate's slats. */
export const stencil = (s: string) =>
  painted(`g-sten${s}`, 512, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = `900 72px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(25,22,20,0.92)';
    g.fillText(s, w / 2, h / 2 + 4);
    // Stencil bridges: thin gaps across the letters.
    g.globalCompositeOperation = 'destination-out';
    for (let x = 30; x < w; x += 44) g.fillRect(x, 0, 4, h);
    g.globalCompositeOperation = 'source-over';
  });

/** Kraft cardboard with a printed label and tape: all sides of a box. */
export const kraft = () =>
  painted('g-kraft', 512, 256, (g, w, h) => {
    g.fillStyle = '#c49a64';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#a87e4c', '#d8b07a'], [1, 3], [0.2, 0.5], 31);
    g.fillStyle = 'rgba(230,220,200,0.75)';
    g.fillRect(w / 2 - 30, 0, 60, h);
    g.fillStyle = '#fff';
    g.fillRect(70, 70, 150, 100);
    text(g, 'PARTS', 145, 100, 34, 130, '#1d2233', 900);
    smallPrint(g, 84, 128, 120, 2, 14, '#666', 2);
    text(g, '↑ THIS WAY UP', 400, 200, 22, 160, '#5a3a1a', 800);
  });

/** Pegboard: hardboard with a grid of holes and the outlines of the tools that hang on it. */
export const PEG_W = 768;
export const PEG_H = 512;
export const pegboard = (outlines: [x: number, y: number, w: number, h: number][]) =>
  painted('g-peg', PEG_W, PEG_H, (g, w, h) => {
    g.fillStyle = '#b48a5c';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, ['#a07648', '#c49c6c'], [1, 4], [0.2, 0.5], 51);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    for (const [x, y, ow, oh] of outlines) {
      g.beginPath();
      g.roundRect(x - 5, y - 5, ow + 10, oh + 10, 8);
      g.stroke();
    }
    g.fillStyle = '#2a1e14';
    for (let y = 12; y < h; y += 19.2) for (let x = 12; x < w; x += 19.2) {
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  });

/** A made-up number plate. */
export const plate = () =>
  painted('g-plate', 512, 112, (g, w, h) => {
    g.fillStyle = '#fbfbf6';
    g.beginPath();
    g.roundRect(0, 0, w, h, 12);
    g.fill();
    g.fillStyle = '#2a4fa8';
    g.fillRect(0, 0, 50, h);
    text(g, 'K4 RT', 25, h / 2, 20, 40, '#ffd23f', 900);
    text(g, 'KR4 0FF', w / 2 + 24, h / 2 + 3, 92, w - 90, '#111', 900);
  });

/** The toolbox's makers' badge. */
export const badge = () =>
  painted('g-badge', 256, 64, (g, w, h) => {
    g.fillStyle = '#1d1d22';
    g.beginPath();
    g.roundRect(0, 0, w, h, 10);
    g.fill();
    text(g, 'TORQUE PRO', w / 2, h / 2 + 2, 36, w - 24, '#e8e8ea', 900);
  });


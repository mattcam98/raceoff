/** Printed packaging, food and fabric for the kitchen props. Every brand is made up. */
import type { Rect } from './propKit';
import { barcode, BODY, bumps, FONT, grain, painted, rand, rr, smallPrint, speckle, text } from './propTextures';

/** A rectangle of a W x H canvas as a uv rect (canvas y runs down, v runs up). */
export const cell = (x: number, y: number, w: number, h: number, W: number, H: number): Rect => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

export const latte = () =>
  painted('latte', 256, 256, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 10, c, c, c);
    grd.addColorStop(0, '#c8915c');
    grd.addColorStop(0.75, '#a86b3c');
    grd.addColorStop(0.95, '#6b3c1c');
    grd.addColorStop(1, '#4a2812');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
    speckle(g, w, w, 500, ['#e9cfa8', '#7a4a24'], [1, 3], [0.1, 0.4], 9);
    // A heart poured in milk foam.
    g.fillStyle = '#f6e9d4';
    g.globalAlpha = 0.95;
    g.beginPath();
    g.moveTo(c, c + 52);
    g.bezierCurveTo(c - 90, c - 10, c - 40, c - 78, c, c - 30);
    g.bezierCurveTo(c + 40, c - 78, c + 90, c - 10, c, c + 52);
    g.fill();
    g.strokeStyle = '#c8915c';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(c, c - 40);
    g.lineTo(c, c + 60);
    g.stroke();
    g.globalAlpha = 1;
  });

/** Orange peel: dimpled, as a normal map. */
export const peelBumps = () => {
  const t = bumps('peel', 256, 256, (g, w, h) => {
    const r = rand(21);
    for (let i = 0; i < 3800; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 1.2 + r() * 1.8;
      const grd = g.createRadialGradient(x, y, 0, x, y, s);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  }, 2.5);
  t.repeat.set(3, 2);
  return t;
};

export const peel = () =>
  painted('peelc', 256, 128, (g, w, h) => {
    g.fillStyle = '#ff8a12';
    g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(120,150,20,0.35)');
    grd.addColorStop(0.12, 'rgba(255,170,40,0)');
    grd.addColorStop(0.9, 'rgba(230,100,0,0)');
    grd.addColorStop(1, 'rgba(160,80,0,0.4)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#ffb347', '#e86f00'], [1, 3], [0.15, 0.4], 22);
  });

export const appleSkin = () =>
  painted('apple', 256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#9fb83a');
    grd.addColorStop(0.1, '#d7402c');
    grd.addColorStop(0.5, '#cc2222');
    grd.addColorStop(1, '#a11616');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // Faint streaks running from stem to base, and a sun-blushed side.
    const r = rand(13);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = r() > 0.5 ? 'rgba(255,200,90,0.05)' : 'rgba(110,0,10,0.07)';
      g.lineWidth = 2 + r() * 5;
      const x = r() * w;
      g.beginPath();
      g.moveTo(x, h * 0.06);
      g.bezierCurveTo(x + (r() - 0.5) * 30, h * 0.4, x + (r() - 0.5) * 30, h * 0.7, x + (r() - 0.5) * 10, h);
      g.stroke();
    }
    const blush = g.createRadialGradient(w * 0.3, h * 0.55, 0, w * 0.3, h * 0.55, w * 0.35);
    blush.addColorStop(0, 'rgba(255,190,60,0.28)');
    blush.addColorStop(1, 'rgba(255,190,60,0)');
    g.fillStyle = blush;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 220, ['#ffe9a8'], [1, 2], [0.25, 0.5], 14);
  });

export const orangeSlice = () =>
  painted('oslice', 256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#ff8a12';
    g.fillRect(0, 0, w, w);
    g.fillStyle = '#fff1d0';
    g.beginPath();
    g.arc(c, c, c * 0.92, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2 + 0.04;
      const a1 = ((i + 1) / 10) * Math.PI * 2 - 0.04;
      g.fillStyle = i % 2 ? '#ffa62b' : '#ff9a1a';
      g.beginPath();
      g.moveTo(c + Math.cos((a0 + a1) / 2) * 8, c + Math.sin((a0 + a1) / 2) * 8);
      g.arc(c, c, c * 0.84, a0, a1);
      g.fill();
    }
    speckle(g, w, w, 300, ['#ffd27a'], [2, 5], [0.3, 0.6], 3);
  });

/** The cereal box, all six sides on one sheet. */
export const CW = 2048;
export const CH = 1280;
export const cerealBox = () =>
  painted('cereal', CW, CH, (g) => {
    const panel = (x: number, back: boolean) => {
      const w = 700;
      const h = 1000;
      const grd = g.createLinearGradient(x, 0, x, h);
      grd.addColorStop(0, '#ffd23f');
      grd.addColorStop(1, '#ffad1f');
      g.fillStyle = grd;
      g.fillRect(x, 0, w, h);
      g.save();
      g.beginPath();
      g.rect(x, 0, w, h);
      g.clip();
      g.translate(x + w / 2, 560);
      for (let i = 0; i < 24; i++) {
        g.rotate((Math.PI * 2) / 24);
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(255,140,0,0.12)';
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(900, -110);
        g.lineTo(900, 110);
        g.fill();
      }
      g.restore();
      if (back) {
        g.fillStyle = '#fff8e6';
        g.beginPath();
        g.roundRect(x + 60, 80, w - 120, 520, 40);
        g.fill();
        text(g, 'LOOP MAZE!', x + w / 2, 140, 64, w - 200, '#e63946', 900);
        const r = rand(4);
        g.strokeStyle = '#3d5a80';
        g.lineWidth = 10;
        g.lineCap = 'round';
        for (let i = 0; i < 9; i++)
          for (let j = 0; j < 7; j++) {
            if (r() < 0.55) continue;
            const cx = x + 110 + i * 60;
            const cy = 200 + j * 55;
            g.beginPath();
            g.moveTo(cx, cy);
            r() > 0.5 ? g.lineTo(cx + 60, cy) : g.lineTo(cx, cy + 55);
            g.stroke();
          }
        g.fillStyle = '#fff';
        g.beginPath();
        g.roundRect(x + 60, 640, w - 120, 300, 30);
        g.fill();
        text(g, 'Nutrition', x + 170, 680, 36, 200, '#222', 800);
        smallPrint(g, x + 90, 720, w - 180, 9, 22, '#444', 8);
        barcode(g, x + w - 260, 860, 180, 60);
        return;
      }
      g.save();
      g.translate(x + w / 2, 170);
      g.rotate(-0.06);
      g.lineJoin = 'round';
      g.font = `900 150px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 26;
      g.strokeStyle = '#7a1020';
      g.strokeText('CRUNCH', 0, 0);
      g.fillStyle = '#e63946';
      g.fillText('CRUNCH', 0, 0);
      g.font = `900 110px ${FONT}`;
      g.lineWidth = 20;
      g.strokeText("O'S", 0, 120);
      g.fillStyle = '#fff';
      g.fillText("O'S", 0, 120);
      g.restore();
      g.fillStyle = '#3d5a80';
      g.beginPath();
      g.roundRect(x + 140, 360, w - 280, 70, 35);
      g.fill();
      text(g, 'HONEY LOOPS', x + w / 2, 396, 48, w - 320, '#fff', 800);
      const bx = x + w / 2;
      const by = 760;
      g.fillStyle = '#fffaf0';
      g.beginPath();
      g.ellipse(bx, by - 40, 250, 70, 0, 0, Math.PI * 2);
      g.fill();
      const r = rand(11);
      const loops = ['#ff9f1c', '#ffd166', '#ef476f', '#8ac926', '#ff9f1c'];
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r());
        const lx = bx + Math.cos(a) * d * 220;
        const ly = by - 50 + Math.sin(a) * d * 55 - r() * 30;
        g.strokeStyle = loops[i % loops.length];
        g.lineWidth = 13;
        g.beginPath();
        g.ellipse(lx, ly, 22, 15, r(), 0, Math.PI * 2);
        g.stroke();
      }
      const bowl = g.createLinearGradient(0, by - 40, 0, by + 160);
      bowl.addColorStop(0, '#5b8def');
      bowl.addColorStop(1, '#2a4fa8');
      g.fillStyle = bowl;
      g.beginPath();
      g.moveTo(bx - 260, by - 40);
      g.bezierCurveTo(bx - 240, by + 150, bx + 240, by + 150, bx + 260, by - 40);
      g.bezierCurveTo(bx + 150, by + 10, bx - 150, by + 10, bx - 260, by - 40);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(bx - 150, by + 30, 40, 14, -0.4, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(x + 560, 520);
      g.rotate(0.2);
      g.fillStyle = '#e63946';
      g.beginPath();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const rr2 = i % 2 ? 62 : 80;
        g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
      }
      g.fill();
      text(g, 'NEW!', 0, 0, 44, 110, '#fff', 900);
      g.restore();
      text(g, 'with whole grain oats', x + w / 2, 930, 34, w - 160, '#7a3b00', 700);
      text(g, 'NET WT 500g', x + 110, 975, 22, 160, '#7a3b00', 700);
    };
    panel(0, false);
    panel(700, true);
    for (const sx of [1400, 1650]) {
      g.fillStyle = '#ffc21f';
      g.fillRect(sx, 0, 250, 1000);
      g.fillStyle = '#e63946';
      g.fillRect(sx, 0, 250, 120);
      text(g, "CRUNCH O'S", sx + 125, 60, 46, 220, '#fff', 900);
      g.fillStyle = '#fffaf0';
      g.beginPath();
      g.roundRect(sx + 20, 150, 210, 560, 18);
      g.fill();
      smallPrint(g, sx + 35, 175, 180, 22, 24, '#555', sx);
      barcode(g, sx + 50, 800, 150, 70, sx);
    }
    for (const tx of [0, 700]) {
      g.fillStyle = '#ffc21f';
      g.fillRect(tx, 1000, 700, 280);
      g.strokeStyle = 'rgba(120,60,0,0.4)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(tx + 20, 1140);
      g.lineTo(tx + 680, 1140);
      g.stroke();
      text(g, 'OPEN HERE', tx + 350, 1100, 30, 400, 'rgba(120,60,0,0.6)', 700);
    }
  });

/** Milk carton sides: front, side, back, side, each 256 x 420, and a blue strip for the gable. */
export const cartonTex = () =>
  painted('carton', 1024, 512, (g) => {
    for (let i = 0; i < 4; i++) {
      const x = i * 256;
      g.fillStyle = '#fbfdff';
      g.fillRect(x, 0, 256, 420);
      // Rolling green hills along the bottom.
      g.fillStyle = '#8fd16a';
      g.beginPath();
      g.moveTo(x, 420);
      g.lineTo(x, 330);
      g.bezierCurveTo(x + 80, 290, x + 150, 360, x + 256, 310);
      g.lineTo(x + 256, 420);
      g.fill();
      g.fillStyle = '#6cbf4a';
      g.beginPath();
      g.moveTo(x, 420);
      g.lineTo(x, 370);
      g.bezierCurveTo(x + 100, 340, x + 160, 400, x + 256, 360);
      g.lineTo(x + 256, 420);
      g.fill();
      g.fillStyle = '#2a6fdb';
      g.fillRect(x, 0, 256, 34);
      if (i % 2 === 0) {
        text(g, 'Daisy Dell', x + 128, 70, 40, 220, '#2a6fdb', 800);
        text(g, 'MILK', x + 128, 140, 96, 230, '#1d4fa8', 900);
        text(g, 'fresh & whole', x + 128, 196, 26, 220, '#2a6fdb', 700, BODY);
        // A cow, nose first.
        const cx = x + 128;
        const cy = 270;
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#222';
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(cx, cy, 52, 40, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#222';
        g.beginPath();
        g.ellipse(cx - 22, cy - 14, 16, 12, 0.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffb3c6';
        g.beginPath();
        g.ellipse(cx, cy + 18, 34, 20, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#222';
        for (const s of [-1, 1]) {
          g.beginPath();
          g.arc(cx + s * 12, cy + 18, 4, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.arc(cx + s * 20, cy - 8, 5, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.fillStyle = '#eef5ff';
        rr(g, x + 22, 56, 212, 230, 14, '#eef5ff');
        text(g, 'Nutrition', x + 128, 80, 26, 180, '#1d4fa8', 800);
        smallPrint(g, x + 36, 104, 184, 9, 18, '#5a6f99', i);
        barcode(g, x + 70, 250, 116, 30, i);
      }
    }
    g.fillStyle = '#2a6fdb';
    g.fillRect(0, 420, 1024, 92);
    text(g, 'Daisy Dell  -  OPEN HERE', 512, 466, 40, 900, '#ffffff', 800);
  });

/** Jar labels: strawberry jam and honey. */
export const jarLabel = (honey: boolean) =>
  painted(`jarlabel${honey}`, 512, 256, (g, w, h) => {
    g.fillStyle = honey ? '#fff4d6' : '#fffaf0';
    g.fillRect(0, 0, w, h);
    const ink = honey ? '#a8620a' : '#b3122e';
    g.strokeStyle = ink;
    g.lineWidth = 6;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.lineWidth = 2;
    g.strokeRect(24, 24, w - 48, h - 48);
    text(g, honey ? 'Bumble & Co' : "Granny Bea's", w / 2, 64, 34, 360, ink, 700, BODY);
    text(g, honey ? 'GOLDEN HONEY' : 'STRAWBERRY JAM', w / 2, 120, 52, 420, ink, 900);
    if (honey) {
      // A little bee.
      g.fillStyle = '#f2a516';
      g.beginPath();
      g.ellipse(w / 2, 186, 30, 20, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3b2a10';
      for (const dx of [-10, 6]) g.fillRect(w / 2 + dx, 167, 7, 38);
      g.fillStyle = 'rgba(200,230,255,0.9)';
      g.beginPath();
      g.ellipse(w / 2 - 8, 160, 14, 9, -0.5, 0, Math.PI * 2);
      g.ellipse(w / 2 + 10, 160, 14, 9, 0.5, 0, Math.PI * 2);
      g.fill();
    } else {
      for (const dx of [-40, 0, 40]) {
        g.fillStyle = '#e63946';
        g.beginPath();
        g.moveTo(w / 2 + dx - 16, 172);
        g.quadraticCurveTo(w / 2 + dx, 160, w / 2 + dx + 16, 172);
        g.quadraticCurveTo(w / 2 + dx + 14, 200, w / 2 + dx, 210);
        g.quadraticCurveTo(w / 2 + dx - 14, 200, w / 2 + dx - 16, 172);
        g.fill();
        g.fillStyle = '#4f9a2a';
        g.fillRect(w / 2 + dx - 10, 162, 20, 6);
      }
    }
    text(g, honey ? 'pure & runny' : 'homemade', w / 2, 226, 22, 300, ink, 600, BODY);
  });

/** Butter foil, gold with a printed brand. */
export const butterFoil = () =>
  painted('butterfoil', 256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#f5d77a');
    grd.addColorStop(0.5, '#e8b93c');
    grd.addColorStop(1, '#f7df8f');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const r = rand(5);
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      const x = r() * w;
      g.moveTo(x, 0);
      g.lineTo(x + (r() - 0.5) * 60, h);
      g.stroke();
    }
    text(g, 'Meadow Gold', w / 2, h * 0.42, 34, 220, '#1f4f2a', 800);
    text(g, 'SALTED BUTTER', w / 2, h * 0.6, 22, 200, '#1f4f2a', 700, BODY);
  });

/** Teapot glaze: white dots on teal. */
export const dots = () =>
  painted('teadots', 512, 160, (g, w, h) => {
    g.fillStyle = '#4fb3c4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    for (let row = 0; row < 7; row++)
      for (let i = 0; i < 24; i++) {
        g.beginPath();
        g.arc(((i + (row % 2) * 0.5) / 24) * w, (row + 0.5) * (h / 7), 4.5, 0, Math.PI * 2);
        g.fill();
      }
  });

/** Toast: the slice's top as a crumb face with a crust edge, the side as crust. `outline` is the slice in world units. */
export const toastTex = (outline: { x: number; y: number }[], size: number) =>
  painted('toast2', 512, 256, (g) => {
    // Left half: the cut face, drawn in the slice's own shape so the crust rim lines up.
    const s = 256 / size;
    const path = () => {
      g.beginPath();
      outline.forEach((p, i) => (i ? g.lineTo(128 + p.x * s, 128 - p.y * s) : g.moveTo(128 + p.x * s, 128 - p.y * s)));
      g.closePath();
    };
    g.fillStyle = '#7a4416';
    g.fillRect(0, 0, 256, 256);
    path();
    g.fillStyle = '#c98a3e';
    g.fill();
    g.save();
    path();
    g.clip();
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 130);
    grd.addColorStop(0, '#e9b765');
    grd.addColorStop(0.7, '#d6974a');
    grd.addColorStop(1, '#9a5a22');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 1400, ['#8a4f1c', '#f6d89c', '#b9762f'], [1, 3.5], [0.2, 0.6], 61);
    // A pat of melting butter.
    g.fillStyle = 'rgba(255,226,120,0.75)';
    g.beginPath();
    g.ellipse(140, 120, 40, 28, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,240,170,0.9)';
    g.fillRect(126, 106, 26, 22);
    g.restore();
    path();
    g.strokeStyle = '#6e3a12';
    g.lineWidth = 9;
    g.stroke();
    // Right half: crust.
    g.fillStyle = '#7a4416';
    g.fillRect(256, 0, 256, 256);
    speckle(g, 512, 256, 600, ['#5a2e0c', '#9c5c24'], [1, 4], [0.2, 0.6], 62);
  });

export const crumbBumps = () =>
  bumps('crumb', 256, 256, (g, w, h) => {
    const r = rand(77);
    for (let i = 0; i < 900; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 1 + r() * 3;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.beginPath();
      g.ellipse(x, y, s, s * (0.5 + r()), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);

/** A woven cloth weave, shared by napkins and curtains. */
export const weave = () =>
  bumps('weave', 128, 128, (g, w, h) => {
    for (let i = 0; i < w; i += 4) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(i, 0, 2, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, i, w, 2);
    }
  }, 1.2);

export const napkinTex = () =>
  painted('napkin', 256, 256, (g, w, h) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.setLineDash([6, 5]);
    g.lineWidth = 3;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.setLineDash([]);
    g.fillStyle = 'rgba(230,140,0,0.25)';
    for (let i = 0; i < w; i += 16) g.fillRect(i, 0, 8, h);
  });

export const bacon = () =>
  painted('bacon', 256, 64, (g, w, h) => {
    const bands = ['#b4432a', '#f3d0b4', '#9a2f1c', '#e9b896', '#b84a2e', '#f6d8bf', '#a33a22'];
    bands.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(0, (i / bands.length) * h, w, h / bands.length + 1);
    });
    speckle(g, w, h, 300, ['#6e1e0e', '#fff0e0'], [1, 4], [0.1, 0.4], 8);
  });

export const sugarTex = () =>
  painted('sugar', 128, 128, (g, w, h) => {
    g.fillStyle = '#f4f4f2';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#ffffff', '#d8dbe0', '#cfd2d8'], [1, 3], [0.4, 0.9], 31);
  });

export const sugarBumps = () =>
  bumps('sugarb', 128, 128, (g, w, h) => {
    speckle(g, w, h, 1100, ['#ffffff', '#000000'], [1.5, 4], [0.3, 0.8], 32);
  }, 3);

/** The view through the window: a morning sky over a garden. Drawn to glow. */
export const windowView = () =>
  painted('windowview', 512, 384, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#7fc4ff');
    sky.addColorStop(0.6, '#d9f0ff');
    sky.addColorStop(1, '#fff3d6');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const r = rand(9);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 6; i++) {
      const cx = r() * w;
      const cy = 40 + r() * 120;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.ellipse(cx + k * 18 - 36, cy + Math.sin(k) * 6, 26, 14, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Trees and a hedge far off.
    for (let i = 0; i < 9; i++) {
      const tx = (i / 8) * w + (r() - 0.5) * 40;
      const tr = 30 + r() * 30;
      g.fillStyle = i % 2 ? '#7fae78' : '#93bd84';
      g.beginPath();
      g.arc(tx, h * 0.68 - tr * 0.6, tr, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#a7cf8c';
    g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = '#f2ead8';
    for (let x = 0; x < w; x += 22) g.fillRect(x, h * 0.74, 14, 46);
    g.fillRect(0, h * 0.78, w, 6);
  });

export const curtainTex = () =>
  painted('curtain', 256, 256, (g, w, h) => {
    g.fillStyle = '#fff1d8';
    g.fillRect(0, 0, w, h);
    const r = rand(17);
    for (let i = 0; i < 40; i++) {
      const x = r() * w;
      const y = r() * h;
      g.fillStyle = ['#ff8fab', '#ffb703', '#8ecae6'][i % 3];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(200,120,60,0.25)';
    g.fillRect(0, h - 18, w, 6);
  });

/** Subway tiles for the splashback (colour) and their grout (normal map). */
export const subway = () =>
  painted('subway', 256, 256, (g, w, h) => {
    g.fillStyle = '#c9c4ba';
    g.fillRect(0, 0, w, h);
    const r = rand(41);
    for (let row = 0; row < 8; row++)
      for (let i = -1; i < 4; i++) {
        const x = i * 64 + (row % 2) * 32;
        const v = 236 + Math.floor(r() * 14);
        g.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
        g.fillRect(x + 2, row * 32 + 2, 60, 28);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(x + 6, row * 32 + 5, 26, 3);
      }
  }, true);

export const subwayBumps = () =>
  bumps('subwayb', 256, 256, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++)
      for (let i = -1; i < 4; i++) {
        const x = i * 64 + (row % 2) * 32;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.roundRect(x + 2, row * 32 + 2, 60, 28, 4);
        g.fill();
      }
  }, 3);

export const butcherBlock = () =>
  painted('butcher', 512, 256, (g, w, h) => {
    const r = rand(3);
    for (let i = 0; i < 8; i++) grain(g, 0, (i * h) / 8, w, h / 8, ['#c8955a', '#b9824a', '#d4a46a'][Math.floor(r() * 3)], '#7a4f26', 50 + i, 8);
    g.fillStyle = 'rgba(60,30,10,0.35)';
    for (let i = 1; i < 8; i++) g.fillRect(0, (i * h) / 8, w, 1.5);
  }, true);

/** A child's drawing and a shopping list for the fridge door, side by side. */
export const fridgeArt = () =>
  painted('fridgeart', 512, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    // Crayon: a house, a sun and a kart.
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.strokeStyle = '#ffb703';
    g.beginPath();
    g.arc(200, 50, 22, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(200 + Math.cos(a) * 30, 50 + Math.sin(a) * 30);
      g.lineTo(200 + Math.cos(a) * 42, 50 + Math.sin(a) * 42);
      g.stroke();
    }
    g.strokeStyle = '#e63946';
    g.strokeRect(40, 110, 90, 80);
    g.beginPath();
    g.moveTo(30, 112);
    g.lineTo(85, 60);
    g.lineTo(140, 112);
    g.stroke();
    g.strokeStyle = '#3d9bff';
    g.strokeRect(70, 150, 26, 40);
    g.strokeStyle = '#2a9d8f';
    g.beginPath();
    g.moveTo(0, 220);
    g.lineTo(256, 216);
    g.stroke();
    g.strokeStyle = '#8d5bc1';
    g.strokeRect(160, 170, 60, 22);
    g.beginPath();
    g.arc(172, 200, 9, 0, Math.PI * 2);
    g.arc(210, 200, 9, 0, Math.PI * 2);
    g.stroke();
    // The list.
    g.fillStyle = '#fff8b0';
    g.fillRect(256, 0, 256, 256);
    g.fillStyle = 'rgba(80,120,200,0.35)';
    for (let y = 40; y < 256; y += 26) g.fillRect(256, y, 256, 2);
    g.font = `600 26px ${BODY}`;
    g.fillStyle = '#2b2d42';
    ['milk', 'eggs', 'jam!!', 'bread', 'oranges'].forEach((s, i) => g.fillText(`- ${s}`, 276, 34 + i * 26 + 26 * 0.7));
  });

export const badgeTex = () =>
  painted('frostline', 256, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f4f6f8');
    grd.addColorStop(1, '#a9b0b8');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    text(g, 'FROSTLINE', w / 2, h / 2, 40, w - 20, '#2b3a55', 900);
  });


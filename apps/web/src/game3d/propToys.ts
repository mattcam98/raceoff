/**
 * Playroom props: wooden blocks, a teddy, a beach ball, the toy castle gate, and the bedroom the carpet
 * track sits in. Kart-scale toys are in world units (a kart is about 2.6 long); room pieces are at about
 * 0.5 cm per unit. Each prop stands on y = 0 at its origin and fills the footprint in
 * packages/game/src/track/props.ts.
 */
import * as THREE from 'three';
import { at, group, scaled } from './kit';
import { type Builder, type Rect, chrome, extrude, glaze, matte, mesh, plastic, printed, rbox, roundRect, rubber, satin, sweep, topUV, turn, uvRect, v3 } from './propKit';
import { bumps, FONT, grain, painted, rand, speckle, text } from './propTextures';

const LETTERS = 'ABCDEFGHJKLMNOPRSTUVWXYZ';
const BLOCK_COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f77f00'];
/** Deeper versions of the block colours, for printing on pale wood. */
const INK = ['#d81b4f', '#e9a400', '#00a77c', '#0b6f94', '#7b3fc9', '#e06800'];

/** A rectangle of a W x H canvas as a uv rect (canvas y runs down, v runs up), pulled in by a pixel. */
const cell = (x: number, y: number, w: number, h: number, W: number, H: number): Rect => [(x + 1) / W, 1 - (y + h - 1) / H, (x + w - 1) / W, 1 - (y + 1) / H];

// ---------------------------------------------------------------- local shapes

/** An ellipsoid centred at x, y, z. */
function ell(rx: number, ry: number, rz: number, m: THREE.Material, x: number, y: number, z: number, segs = 24) {
  const g = new THREE.SphereGeometry(1, segs, Math.max(8, Math.round(segs * 0.7)));
  g.scale(rx, ry, rz);
  return at(mesh(g, m), x, y, z);
}

/** A capsule from a to b: arms, legs, posts. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, segs = 14) {
  const dir = b.clone().sub(a);
  const o = mesh(new THREE.CapsuleGeometry(r, dir.length(), 6, segs, 1), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return o;
}

/** Scale a geometry's uvs so a repeating texture tiles every `tile` units. */
const tiled = <G extends THREE.BufferGeometry>(g: G, u: number, v: number): G => uvRect(g, [0, 0, u, v]);

// ---------------------------------------------------------------- textures

/** Alphabet-block faces: 24 letters, the digits 1-6, a star and a heart, on pale wood. 8 x 4 cells. */
const AW = 2048;
const AH = 1024;
const blockCell = (k: number) => cell((k % 8) * 256, Math.floor(k / 8) * 256, 256, 256, AW, AH);
function blockGlyph(g: CanvasRenderingContext2D, k: number, x: number, y: number) {
  const cx = x + 128;
  const cy = y + 132;
  if (k < 30) {
    g.font = `900 ${k < 24 ? 168 : 176}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(k < 24 ? LETTERS[k] : String(k - 23), cx, cy);
  } else if (k === 30) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 36 : 84;
      g.lineTo(cx + Math.cos(a) * r, cy - 4 + Math.sin(a) * r);
    }
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(cx, cy + 66);
    g.bezierCurveTo(cx - 110, cy - 10, cx - 50, cy - 92, cx, cy - 36);
    g.bezierCurveTo(cx + 50, cy - 92, cx + 110, cy - 10, cx, cy + 66);
    g.fill();
  }
}
const blockAtlas = () =>
  painted('toyblocks', AW, AH, (g) => {
    for (let k = 0; k < 32; k++) {
      const x = (k % 8) * 256;
      const y = Math.floor(k / 8) * 256;
      grain(g, x, y, 256, 256, '#efcf9c', '#b98a52', 40 + k, 22);
      const ink = INK[k % 6];
      // Printed frame, then the glyph with a soft emboss.
      g.lineJoin = 'round';
      g.strokeStyle = ink;
      g.lineWidth = 12;
      g.beginPath();
      g.roundRect(x + 22, y + 22, 212, 212, 26);
      g.stroke();
      g.fillStyle = 'rgba(70,40,10,0.35)';
      blockGlyph(g, k, x + 4, y + 5);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      blockGlyph(g, k, x - 2, y - 2);
      g.fillStyle = ink;
      blockGlyph(g, k, x, y);
    }
  });
const blockBumps = () =>
  bumps('toyblocksN', AW / 2, AH / 2, (g) => {
    g.save();
    g.scale(0.5, 0.5);
    g.fillStyle = '#d0d0d0';
    g.strokeStyle = '#d0d0d0';
    for (let k = 0; k < 32; k++) {
      const x = (k % 8) * 256;
      const y = Math.floor(k / 8) * 256;
      g.lineWidth = 12;
      g.beginPath();
      g.roundRect(x + 22, y + 22, 212, 212, 26);
      g.stroke();
      blockGlyph(g, k, x, y);
    }
    g.restore();
    // Soften it in one pass: a blur filter on every stroke and glyph costs a full-canvas blur each.
    g.filter = 'blur(2px)';
    g.drawImage(g.canvas, 0, 0);
    g.filter = 'none';
  }, 3, false);

/** Neutral fur, tinted per material: soft streaks as colour, short tufts as a normal map. */
const furMap = () => {
  const t = painted('fur', 256, 256, (g, w, h) => {
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, 0, w, h);
    const r = rand(31);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w;
      const y = r() * h;
      g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(90,70,50,0.22)';
      g.lineWidth = 1 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 6, y + 4 + r() * 6);
      g.stroke();
    }
  }, true);
  t.repeat.set(3, 3);
  return t;
};
const furBumps = () => {
  const t = bumps('furN', 256, 256, (g, w, h) => {
    const r = rand(32);
    for (let i = 0; i < 3500; i++) {
      const x = r() * w;
      const y = r() * h;
      g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 5, y + 3 + r() * 5);
      g.stroke();
    }
  }, 2.2);
  t.repeat.set(3, 3);
  return t;
};
const fur = (color: string) => printed(furMap(), { color, rough: 0.95, normalMap: furBumps(), normalScale: 0.8 });

/** Beach ball: six gores round the middle and white caps top and bottom. */
const GORES = ['#ef476f', '#ffd166', '#118ab2', '#ffffff', '#06d6a0', '#f77f00'];
const ballTex = () =>
  painted('beachball', 512, 256, (g, w, h) => {
    GORES.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect((i * w) / 6, 0, w / 6 + 1, h);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect((i * w) / 6, 0, 2, h);
    });
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, 18);
    g.fillRect(0, h - 18, w, 18);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    g.fillRect(0, 17, w, 2);
    g.fillRect(0, h - 19, w, 2);
  });

/** Domino faces: seven pip layouts and a plain black cell for the edges. 8 cells of 128 x 256. */
const dominoTex = () =>
  painted('dominoes', 1024, 256, (g) => {
    g.fillStyle = '#18181c';
    g.fillRect(0, 0, 1024, 256);
    const spots: Record<number, [number, number][]> = {
      0: [],
      1: [[0, 0]],
      2: [[-1, -1], [1, 1]],
      3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    };
    const faces = [[6, 3], [2, 5], [4, 4], [1, 6], [5, 2], [3, 0], [6, 6]];
    faces.forEach(([a, b], k) => {
      const x = k * 128;
      g.fillStyle = '#d9d4c7';
      g.fillRect(x + 14, 126, 100, 5);
      g.beginPath();
      g.arc(x + 64, 128, 6, 0, Math.PI * 2);
      g.fillStyle = '#c8b27a';
      g.fill();
      for (const [n, cy] of [[a, 64], [b, 192]] as [number, number][]) {
        for (const [sx, sy] of spots[n]) {
          g.fillStyle = '#f4f0e6';
          g.beginPath();
          g.arc(x + 64 + sx * 30, cy + sy * 30, 11, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
  });
const dominoCell = (k: number) => cell(k * 128, 0, 128, 256, 1024, 256);

/** Pale stone blocks for the toy castle: colour and relief. Tiles every 8 units. */
const brickTex = () =>
  painted('toybrick', 256, 256, (g, w) => {
    g.fillStyle = '#9fb0c2';
    g.fillRect(0, 0, w, w);
    const r = rand(55);
    for (let row = 0; row < 4; row++)
      for (let c = -1; c < 3; c++) {
        const x = c * 128 + (row % 2) * 64;
        const l = 70 + r() * 12;
        g.fillStyle = `hsl(${205 + r() * 10}, ${14 + r() * 8}%, ${l}%)`;
        g.beginPath();
        g.roundRect(x + 5, row * 64 + 5, 118, 54, 8);
        g.fill();
      }
    speckle(g, w, w, 500, ['#ffffff', '#7d8ea0'], [1, 3], [0.1, 0.3], 56);
  }, true);
const brickBumps = () =>
  bumps('toybrickN', 256, 256, (g) => {
    g.filter = 'blur(2px)';
    g.fillStyle = '#e0e0e0';
    for (let row = 0; row < 4; row++)
      for (let c = -1; c < 3; c++) {
        g.beginPath();
        g.roundRect(c * 128 + (row % 2) * 64 + 5, row * 64 + 5, 118, 54, 8);
        g.fill();
      }
  }, 2.5);
const brick = () => printed(brickTex(), { rough: 0.6, normalMap: brickBumps(), normalScale: 0.8 });

/** A crayon's paper wrapper, in its colour: zigzag bands, a name running along it. */
const wrapper = (c: string) =>
  painted(`crayon${c}`, 256, 512, (g, w, h) => {
    g.fillStyle = c;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1b1b1f';
    g.lineWidth = 7;
    for (const y0 of [36, 70, h - 70, h - 36]) {
      g.beginPath();
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + (x % 32 ? 9 : -9));
      g.stroke();
    }
    for (let side = 0; side < 2; side++) {
      g.save();
      g.translate(w * (0.25 + side * 0.5), h / 2);
      g.rotate(-Math.PI / 2);
      text(g, 'WAXIES', 0, 0, 58, 300, '#1b1b1f', 900);
      g.restore();
    }
  });

/** Duvet print: stars and little rockets on sky blue. Repeats. */
const duvetTex = () =>
  painted('duvet', 512, 512, (g, w) => {
    g.fillStyle = '#9fd3f5';
    g.fillRect(0, 0, w, w);
    const r = rand(77);
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const y = r() * w;
      g.save();
      g.translate(x, y);
      g.rotate(r() * 6);
      if (i % 5 === 0) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(0, 0, 10, 26, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ef476f';
        g.beginPath();
        g.moveTo(-10, 10);
        g.lineTo(-18, 26);
        g.lineTo(18, 26);
        g.lineTo(10, 10);
        g.fill();
        g.fillStyle = '#118ab2';
        g.beginPath();
        g.arc(0, -6, 5, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = i % 3 ? '#ffd166' : '#ffffff';
        const s = 8 + r() * 10;
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          g.lineTo(Math.cos(a) * (k % 2 ? s * 0.45 : s), Math.sin(a) * (k % 2 ? s * 0.45 : s));
        }
        g.fill();
      }
      g.restore();
    }
  }, true);

/** The toy chest's painted front panel. */
const chestLid = () =>
  painted('chestlid', 512, 256, (g, w, h) => {
    g.fillStyle = '#ffd166';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 40, ['#ffffff', '#ef476f', '#118ab2'], [10, 18], [0.6, 0.9], 81);
    g.lineJoin = 'round';
    g.font = `900 130px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 18;
    g.strokeStyle = '#ffffff';
    g.strokeText('TOYS', w / 2, h / 2 + 6);
    ['#ef476f', '#06d6a0', '#118ab2', '#9b5de5'].forEach((c, i) => {
      g.fillStyle = c;
      g.save();
      g.beginPath();
      g.rect(w / 2 - 170 + i * 85, 0, 85, h);
      g.clip();
      g.fillText('TOYS', w / 2, h / 2 + 6);
      g.restore();
    });
  });

/** A picture-book cover, shown face out. */
const bookCover = () =>
  painted('moonbook', 256, 320, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#1d3557');
    grd.addColorStop(1, '#457b9d');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h * 0.6, 60, ['#ffffff', '#ffd166'], [2, 5], [0.6, 1], 91);
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(160, 150, 52, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a4a73';
    g.beginPath();
    g.arc(185, 135, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7bc96f';
    g.beginPath();
    g.ellipse(w / 2, h + 30, 200, 90, 0, 0, Math.PI * 2);
    g.fill();
    text(g, 'THE SLEEPY', w / 2, 40, 34, 220, '#ffffff', 900);
    text(g, 'MOON', w / 2, 76, 40, 220, '#ffd166', 900);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 12, h);
  });

/** Round rug: rings of colour with a scalloped border. Planar, one image across the whole rug. */
const rugTex = () =>
  painted('roundrug', 1024, 1024, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f4ead8';
    g.fillRect(0, 0, w, w);
    const rings = ['#ef476f', '#f4ead8', '#ffd166', '#f4ead8', '#06d6a0', '#f4ead8', '#118ab2', '#f4ead8', '#9b5de5', '#ffd166'];
    rings.forEach((col, i) => {
      g.fillStyle = col;
      g.beginPath();
      const r = c * (0.98 - i * 0.095);
      for (let k = 0; k <= 360; k++) {
        const a = (k / 360) * Math.PI * 2;
        const rr = i === 0 ? r - Math.abs(Math.sin(a * 18)) * 18 : r;
        g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      g.fill();
    });
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(c + Math.cos(a) * (k % 2 ? 26 : 62), c + Math.sin(a) * (k % 2 ? 26 : 62));
    }
    g.fill();
    speckle(g, w, w, 9000, ['#ffffff', '#000000'], [1, 3], [0.03, 0.1], 95);
  });
const pileBumps = () => {
  const t = bumps('pileN', 256, 256, (g, w, h) => speckle(g, w, h, 5000, ['#ffffff', '#000000'], [1, 3], [0.3, 0.7], 96), 2);
  t.repeat.set(10, 10);
  return t;
};

// ---------------------------------------------------------------- toys

function alphaBlock(size: number, k: number) {
  return rbox(size, size, size, size * 0.09, printed(blockAtlas(), { rough: 0.55, normalMap: blockBumps(), normalScale: 0.7 }), {
    pz: blockCell(k % 24),
    px: blockCell((k + 5) % 24),
    nz: blockCell((k + 11) % 24),
    nx: blockCell((k + 17) % 24),
    py: blockCell(24 + (k % 6)),
    ny: blockCell(30 + (k % 2)),
  });
}

/** A toy car about 9.4 wide (wheels) x 16.6 long x 7.6 tall, nose towards +z. */
function toyCar(color: string) {
  const paint = glaze(color);
  const dark = glaze('#1d2b44');
  const g = group(at(rbox(8, 3.4, 15.4, 1.4, paint), 0, 1.3, 0), at(rbox(6.8, 3.2, 7.6, 1.4, paint), 0, 4.2, -1));
  // Windows: windscreen, rear and sides.
  g.add(at(rbox(5.8, 2.2, 0.3, 0.12, dark), 0, 4.8, 2.82, -0.06), at(rbox(5.8, 2.2, 0.3, 0.12, dark), 0, 4.8, -4.82, 0.06));
  for (const s of [-1, 1]) g.add(at(rbox(0.3, 2.1, 5.8, 0.12, dark), s * 3.42, 4.85, -1));
  // Bumpers, grille, lights.
  for (const z of [7.75, -7.75]) g.add(at(rbox(8.3, 0.9, 0.8, 0.35, chrome()), 0, 1.2, z));
  g.add(at(rbox(3.6, 1.1, 0.3, 0.2, dark), 0, 2.6, 7.75));
  for (const s of [-1, 1]) {
    g.add(ell(0.75, 0.6, 0.3, glaze('#fff3c4'), s * 2.8, 3.1, 7.7, 14));
    g.add(ell(0.6, 0.45, 0.25, glaze('#e63946'), s * 2.9, 3.1, -7.72, 12));
  }
  // Wheels with chrome hubs.
  const tyre: [number, number][] = [[1.2, -0.75], [1.75, -0.75], [2.05, -0.5], [2.1, 0], [2.05, 0.5], [1.75, 0.75], [1.2, 0.75]];
  for (const [x, z] of [[-4, -4.8], [4, -4.8], [-4, 4.8], [4, 4.8]]) {
    const w = group(turn(tyre, rubber('#1d1d22'), 24), turn([[1.3, 0.7], [1.0, 0.85], [0.4, 0.95], [0, 0.97]], chrome(), 18));
    if (x < 0) w.rotation.x = Math.PI;
    g.add(at(group(w), x, 2.1, z, 0, 0, -Math.PI / 2 * Math.sign(x)));
  }
  return g;
}

/** A tin robot, about 12 wide x 22 tall, for shelves. */
function robot() {
  const body = glaze('#e63946');
  const g = group(at(rbox(9, 9, 6, 1.2, body), 0, 5, 0), at(rbox(7, 6, 5.5, 1.2, chrome('#c9ced6')), 0, 14.6, 0));
  for (const s of [-1, 1]) {
    g.add(at(rbox(3, 5, 3.4, 0.8, chrome('#9aa0ab')), s * 2.4, 0, 0));
    g.add(limb(v3(s * 5, 12, 0), v3(s * 6.4, 7, 1.5), 1.1, chrome('#9aa0ab'), 10));
    g.add(ell(1.1, 1.1, 0.5, glaze('#ffd166'), s * 1.6, 17.6, 2.8, 14));
  }
  g.add(at(rbox(4, 1.2, 0.4, 0.2, satin('#1b1b1f')), 0, 15.4, 2.75));
  g.add(at(rbox(5, 3.4, 0.4, 0.4, glaze('#ffd166')), 0, 7.4, 3));
  g.add(sweep([v3(0, 20.4, 0), v3(0, 22.6, 0)], 0.25, chrome(), 4, 6), ell(0.8, 0.8, 0.8, glaze('#06d6a0'), 0, 23, 0, 12));
  return g;
}

export const toys: Record<string, Builder> = {
  /** Wooden alphabet block, 6 cube (v: index for its letters). */
  block: (v) => alphaBlock(6, typeof v === 'number' ? v : 0),

  /** Big alphabet block, 10 cube. */
  bigblock: (v) => alphaBlock(10, ((typeof v === 'number' ? v : 0) * 3) % 24),

  /** Teddy bear sitting up, about 23 tall, within radius 9: muzzle, button eyes, paw pads, a red bow. */
  teddy: () => {
    const brown = fur('#b07a46');
    const light = fur('#f1d3a6');
    const dark = satin('#2b1b10');
    const eye = glaze('#111111');
    const g = group();
    // Body leaning back a little, with a pale tummy.
    const body = ell(6, 7, 5.2, brown, 0, 7.4, -0.6);
    body.rotation.x = -0.12;
    g.add(body, ell(3.9, 4.6, 1.8, light, 0, 6.9, 3.6));
    // Legs out in front, with stitched pads on the soles.
    for (const s of [-1, 1]) {
      g.add(limb(v3(s * 3.3, 3.1, 0.6), v3(s * 4.1, 2.7, 5.8), 2.6, brown));
      g.add(ell(1.9, 2.1, 0.6, light, s * 4.15, 2.75, 8.3, 18));
      g.add(limb(v3(s * 5.0, 11, -0.4), v3(s * 6.6, 6.4, 3.0), 1.9, brown));
      g.add(ell(1.2, 1.3, 0.6, light, s * 6.7, 5.9, 4.6, 14));
    }
    // Head, ears, muzzle, nose and mouth.
    g.add(ell(5.1, 4.8, 4.7, brown, 0, 17.2, 0.2, 28));
    for (const s of [-1, 1]) {
      const ear = group(ell(2.1, 2.1, 1.1, brown, 0, 0, 0, 16), ell(1.3, 1.3, 0.5, light, 0, -0.1, 0.75, 14));
      g.add(at(ear, s * 3.8, 21, -0.4, 0, 0, -s * 0.35));
      g.add(ell(0.62, 0.62, 0.4, eye, s * 1.8, 18.3, 4.45, 14));
    }
    g.add(ell(2.5, 1.9, 1.9, light, 0, 15.9, 4.0));
    g.add(ell(1.0, 0.7, 0.6, eye, 0, 16.8, 5.75, 14));
    g.add(sweep([v3(0, 16.2, 5.85), v3(0, 15.3, 5.85)], 0.12, dark, 4, 5));
    g.add(sweep([v3(-1, 15.0, 5.5), v3(-0.4, 14.9, 5.85), v3(0, 15.3, 5.9), v3(0.4, 14.9, 5.85), v3(1, 15.0, 5.5)], 0.12, dark, 12, 5));
    // Bow at the neck.
    const ribbon = glaze('#e63946');
    g.add(ell(0.9, 0.8, 0.7, ribbon, 0, 12.7, 4.3, 14));
    for (const s of [-1, 1]) {
      const lobe = ell(2.1, 1.3, 0.7, ribbon, s * 2, 12.8, 3.9, 16);
      lobe.rotation.set(0, -s * 0.3, s * 0.25);
      g.add(lobe);
      g.add(at(rbox(0.9, 2.6, 0.3, 0.12, ribbon), s * 0.8, 10.4, 4.2, 0, 0, s * 0.35));
    }
    return g;
  },

  /** Beach ball, radius 6, resting on the floor. */
  toyball: () => {
    const g = new THREE.SphereGeometry(6, 48, 32);
    const ball = at(mesh(g, printed(ballTex(), { rough: 0.25, clearcoat: 1 })), 0, 6, 0);
    ball.rotation.z = 0.35;
    return group(ball);
  },

  /** Stacking rings on a post, radius 5, about 18 tall. */
  rings: () => {
    const g = group(turn([[0, 0], [4.6, 0], [5, 0.4], [5, 1.4], [4.6, 1.85], [1, 1.95], [0, 1.95]], plastic('#8d5bc1'), 36));
    const cols = ['#ef476f', '#f77f00', '#ffd166', '#06d6a0', '#118ab2'];
    let y = 1.95;
    cols.forEach((c, i) => {
      const tube = 1.6 - i * 0.1;
      const t = new THREE.TorusGeometry(3.7 - i * 0.4, tube, 14, 40);
      t.rotateX(Math.PI / 2);
      t.scale(1, 0.85, 1);
      y += tube * 0.85;
      g.add(at(mesh(t, plastic(c)), 0, y, 0));
      y += tube * 0.85;
    });
    // The post ends inside the cap.
    g.add(turn([[0.95, 1.9], [0.85, y + 0.6], [0.6, y + 1], [0, y + 1.1]], plastic('#ffd166'), 16));
    g.add(at(turn(spline2([[0, 0], [1.6, 0], [2.1, 0.8], [1.8, 2.2], [0, 2.8]]), plastic('#ef476f'), 28), 0, y, 0));
    return g;
  },

  /** Puzzle cube, 10 on a side: 26 rounded cubies, coloured stickers on every face but the bottom. */
  cube: () => {
    const g = new THREE.Group();
    const body = plastic('#151519');
    const s = 3.33;
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) if (x || y || z) g.add(at(rbox(3.26, 3.26, 3.26, 0.45, body, undefined, 1), x * s, 5 + y * s - 1.63, z * s));
    const cols = ['#ffffff', '#ffd500', '#d0233a', '#ff6a13', '#1f5fd1', '#12a150'];
    const r = rand(5);
    const tile = roundRect(2.6, 2.6, 0.5) as THREE.Shape;
    // Each face as the rotation that turns +z towards it.
    const faces: [number, number][] = [[0, 0], [0, Math.PI], [0, Math.PI / 2], [0, -Math.PI / 2], [-Math.PI / 2, 0]];
    faces.forEach(([rx, ry], f) => {
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const st = extrude(tile, 0.16, 0.05, plastic(cols[(f + Math.floor(r() * 3) * 2 + (r() > 0.6 ? 1 : 0)) % 6]), { curve: 3, bevelSegs: 1 });
          const holder = group(at(st, a * s, b * s, 4.99));
          holder.rotation.set(rx, ry, 0);
          holder.position.set(0, 5, 0);
          g.add(holder);
        }
    });
    return g;
  },

  /** Toy castle, 37 x 25 (towers included), about 30 tall to the flags. */
  fort: () => {
    const stone = brick();
    const roof = glaze('#e63946');
    const g = group(at(rbox(30, 12, 18, 0.6, stone, { pz: [0, 0, 30 / 8, 12 / 8], nz: [0, 0, 30 / 8, 12 / 8], px: [0, 0, 18 / 8, 12 / 8], nx: [0, 0, 18 / 8, 12 / 8], rest: [0, 0, 30 / 8, 18 / 8] }), 0, 0, 0));
    for (let i = 0; i < 7; i++) for (const z of [-8, 8]) g.add(at(rbox(2.4, 2.4, 2, 0.3, stone), -12.6 + i * 4.2, 12, z));
    for (let i = 0; i < 4; i++) for (const x of [-14, 14]) g.add(at(rbox(2, 2.4, 2.4, 0.3, stone), x, 12, -5.4 + i * 3.6));
    for (const [x, z] of [[-15, -9], [15, -9], [-15, 9], [15, 9]]) g.add(at(tower(3.4, 18, stone, roof, x > 0 ? '#ffd166' : '#118ab2'), x, 0, z));
    // Gate: a dark arch with a portcullis, and arrow slits.
    g.add(at(gateArch(7, 9), 0, 0, 9.02));
    for (const x of [-8, 8]) g.add(at(rbox(1, 3.4, 0.2, 0.3, satin('#2a2030')), x, 5.5, 9.02));
    return g;
  },

  /** Crayon lying along +z, 19 long, radius 1.15 (v: colour). */
  crayon: (v) => {
    const c = typeof v === 'string' ? v : '#ef476f';
    const wax = satin(c);
    const body = group(
      turn([[0, 0], [0.95, 0], [1.1, 0.18], [1.1, 16], [0.98, 16.25], [0.5, 18.5], [0.32, 18.85], [0, 18.9]], wax, 24),
      turn([[1.17, 1.3], [1.17, 13.6]], printed(wrapper(c), { rough: 0.8 }), 24),
    );
    return group(at(body, 0, 1.17, -9.5, Math.PI / 2, 0, 0));
  },

  /** Toy car, 9.4 x 16.6, about 7.6 tall (v: colour). */
  toycar: (v) => toyCar(typeof v === 'string' ? v : '#3d9bff'),

  /** Six dominoes standing in a row along +x, 22 long; the first is toppling onto the second. */
  dominoes: () => {
    const m = printed(dominoTex(), { rough: 0.3, clearcoat: 1 });
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const d = rbox(1.6, 10, 5, 0.35, m, { px: dominoCell(i), nx: dominoCell((i + 3) % 7), rest: dominoCell(7) });
      if (i === 0) g.add(at(group(at(d, -0.8, 0, 0)), 0.8, 0, 0, 0, 0, -0.26));
      else g.add(at(d, i * 4, 0, 0));
    }
    return g;
  },

  /** The castle gate the road runs through: walls either side at z = +/-8, an arch 12 high over the road. */
  gate: () => {
    const stone = brick();
    const roof = glaze('#e63946');
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      g.add(at(rbox(26, 12, 3, 0.4, stone, { pz: [0, 0, 26 / 8, 12 / 8], nz: [0, 0, 26 / 8, 12 / 8], rest: [0, 0, 3 / 8, 12 / 8] }), 0, 0, side * 8));
      for (let i = 0; i < 6; i++) g.add(at(rbox(2.4, 2.4, 3.2, 0.3, stone), -11 + i * 4.4, 12, side * 8));
      for (const end of [-1, 1]) g.add(at(tower(3.6, 18, stone, roof, end > 0 ? '#ffd166' : '#06d6a0'), end * 14, 0, side * 8));
      // Bunting along the wall.
      const flags = ['#ef476f', '#ffd166', '#118ab2', '#06d6a0', '#9b5de5'];
      for (let i = 0; i < 9; i++) {
        const x = -10.5 + i * 2.6;
        const sag = Math.sin((i / 8) * Math.PI) * 1.4;
        const tri = new THREE.Shape();
        tri.moveTo(-0.9, 0);
        tri.lineTo(0.9, 0);
        tri.lineTo(0, -1.8);
        g.add(at(extrude(tri, 0.12, 0, satin(flags[i % 5]), { curve: 2 }), x, 10.8 - sag, side * 9.62));
      }
      g.add(sweep(Array.from({ length: 9 }, (_, i) => v3(-11.8 + i * 2.95, 10.85 - Math.sin((i / 8) * Math.PI) * 1.4, side * 9.66)), 0.08, satin('#f4f0e6'), 24, 4));
    }
    // The arch over the road: a beam with battlements and a shield.
    g.add(at(rbox(4, 3, 19.4, 0.4, stone, { px: [0, 0, 19.4 / 8, 3 / 8], nx: [0, 0, 19.4 / 8, 3 / 8], rest: [0, 0, 4 / 8, 19.4 / 8] }), 0, 12, 0));
    for (let i = 0; i < 4; i++) g.add(at(rbox(4.2, 2, 2.2, 0.3, stone), 0, 15, -6 + i * 4));
    for (const s of [-1, 1]) {
      const shield = new THREE.Shape();
      shield.moveTo(-1.5, 1.2);
      shield.lineTo(1.5, 1.2);
      shield.quadraticCurveTo(1.6, -1.2, 0, -2);
      shield.quadraticCurveTo(-1.6, -1.2, -1.5, 1.2);
      g.add(at(extrude(shield, 0.4, 0.15, glaze('#ffd166'), { curve: 8 }), s * 2.05, 13.5, 0, 0, s * Math.PI / 2, 0));
    }
    g.add(sweep([v3(0, 17, 0), v3(0, 26, 0)], 0.25, chrome(), 4, 8), at(rbox(0.2, 3, 5, 0.08, satin('#ffd166')), 0, 22.6, 2.6));
    return g;
  },

  // ---------------------------------------------------------------- the bedroom (about 0.5 cm per unit)

  /** Child's bed, 228 wide x 430 long x 160 tall at the headboard, head towards -z: star duvet, pillow, a teddy. */
  bed: () => {
    const wood = satin('#f4f1ea');
    const accent = satin('#7bc4e8');
    const g = new THREE.Group();
    // Posts with round knobs, side rails, headboard and footboard.
    for (const [x, z, h] of [[-110, -211, 150], [110, -211, 150], [-110, 211, 90], [110, 211, 90]]) {
      g.add(at(rbox(10, h, 10, 2.5, wood), x, 0, z));
      g.add(ell(7, 6, 7, accent, x, h + 4, z, 18));
    }
    for (const s of [-1, 1]) g.add(at(rbox(6, 22, 412, 2, wood), s * 108, 26, 0));
    const board = (h: number) => {
      const s = new THREE.Shape();
      s.moveTo(-105, 0);
      s.lineTo(105, 0);
      s.lineTo(105, h - 20);
      s.quadraticCurveTo(0, h + 22, -105, h - 20);
      s.lineTo(-105, 0);
      return s;
    };
    g.add(at(extrude(board(120), 5, 1.5, accent, { curve: 24 }), 0, 26, -214));
    g.add(at(extrude(board(52), 5, 1.5, accent, { curve: 24 }), 0, 26, 209));
    // Mattress, duvet and the turned-down sheet.
    g.add(at(rbox(208, 26, 404, 8, satin('#ffffff')), 0, 48, 0));
    const T = 120;
    g.add(at(rbox(224, 44, 306, 12, printed(duvetTex(), { rough: 0.95 }), {
      py: [0, 0, 224 / T, 306 / T], px: [0, 0, 306 / T, 44 / T], nx: [0, 0, 306 / T, 44 / T], pz: [0, 0, 224 / T, 44 / T], nz: [0, 0, 224 / T, 44 / T],
    }, 3), 0, 42, 52));
    g.add(at(rbox(226, 9, 34, 4, satin('#ffffff')), 0, 81, -104));
    // Pillow and a teddy sitting up against it.
    const pillow = at(rbox(150, 22, 66, 11, satin('#fdfbf6'), undefined, 3), 0, 72, -168);
    pillow.rotation.x = -0.15;
    g.add(pillow);
    g.add(at(scaled(toys.teddy(), 2.3), 52, 85, -128, 0, -0.25, 0));
    return g;
  },

  /** Toy chest, 148 wide x 84 deep, 68 tall to the rim (lid open to about 145); a ball, a teddy, blocks and rings inside. */
  toychest: () => {
    const body = satin('#ef476f');
    const trim = satin('#ffffff');
    const g = new THREE.Group();
    // A hollow box: floor and four walls, so the toys inside show over the rim.
    g.add(at(rbox(136, 4, 76, 1, body), 0, 6, 0));
    for (const z of [-38, 38]) g.add(at(rbox(140, 62, 4, 1.5, body), 0, 6, z));
    for (const x of [-68, 68]) g.add(at(rbox(4, 62, 76, 1.5, body), x, 6, 0));
    g.add(at(rbox(118, 40, 2, 2, printed(chestLid(), { rough: 0.5, clearcoat: 0.6 }), { pz: [0, 0, 1, 1], rest: [0, 0, 0.02, 0.02] }), 0, 16, 40.5));
    for (const [x, z] of [[-62, -32], [62, -32], [-62, 32], [62, 32]]) g.add(at(turn([[0, 0], [5, 0], [6, 3], [4.5, 6], [6, 7]], trim, 16), x, 0, z));
    for (const s of [-1, 1]) g.add(sweep([v3(s * 70.5, 52, -12), v3(s * 74, 47, 0), v3(s * 70.5, 52, 12)], 1.4, satin('#e9d8b4'), 12, 8));
    // Toys piled to the brim on a heap of more toys.
    g.add(at(rbox(130, 40, 70, 4, satin('#3d5a80')), 0, 10, 0));
    g.add(at(scaled(toys.toyball(), 2.6), -38, 40, -6));
    g.add(at(scaled(alphaBlock(6, 2), 2.6), 12, 52, 10, 0.3, 0.5, 0.2));
    g.add(at(scaled(alphaBlock(6, 9), 2.6), 34, 50, -14, -0.2, 0.2, 0.4));
    g.add(at(scaled(toys.rings(), 1.8), 50, 48, 14, 0.45, 0, -0.4));
    g.add(at(scaled(toys.teddy(), 1.6), -4, 46, -18, -0.2, 0.3, 0.15));
    // The lid on a back hinge, swung open.
    g.add(at(group(at(rbox(146, 8, 84, 3, satin('#ffd166')), 0, 0, 42)), 0, 68, -42, -1.25, 0, 0));
    return g;
  },

  /** Low kids' bookcase, 160 wide x 122 tall x 50 deep: picture books on two shelves, toys on top. */
  bookcase: () => {
    const wood = satin('#a8e6cf');
    const g = new THREE.Group();
    for (const s of [-1, 1]) g.add(at(rbox(4, 122, 50, 1.2, wood), s * 78, 0, 0));
    for (const y of [0, 59, 118]) g.add(at(rbox(160, 4, 50, 1.2, wood), 0, y, 0));
    g.add(at(rbox(152, 116, 1.5, 0.5, satin('#ffd166')), 0, 2, -24));
    // A row of picture books on each shelf, with a spine band.
    const cols = ['#ef476f', '#118ab2', '#ffd166', '#06d6a0', '#9b5de5', '#f77f00', '#3d5a80', '#e76f51'];
    const r = rand(12);
    for (const [y0, x0, x1] of [[4, -74, 74], [63, -74, 20]] as [number, number, number][]) {
      let x = x0;
      while (x < x1) {
        const t = 4 + r() * 5;
        const h = 30 + r() * 20;
        const c = cols[Math.floor(r() * cols.length)];
        const lean = x + t > x1 - 10 ? -0.18 : 0;
        const b = group(rbox(t, h, 36, 0.8, satin(c), undefined, 1), at(rbox(t + 0.2, 4, 36.2, 0.6, satin('#fdfbf6'), undefined, 1), 0, h * 0.68, 0));
        g.add(at(b, x + t / 2, y0, 2, 0, 0, lean));
        x += t + 0.4 + (lean ? 8 : 0);
      }
    }
    // A book shown face out, and toys.
    g.add(at(rbox(32, 40, 2, 0.6, printed(bookCover(), { rough: 0.5 }), { pz: [0, 0, 1, 1], rest: [0, 0, 0.04, 0.04] }), 48, 63, 6, -0.12, -0.15, 0));
    g.add(at(scaled(toyCar('#ef476f'), 1.8), -40, 122, 4, 0, 0.9, 0));
    g.add(at(scaled(toys.rings(), 1.8), 30, 122, 0));
    g.add(at(scaled(alphaBlock(6, 4), 2.4), 60, 122, 4, 0, 0.3, 0));
    return g;
  },

  /** Wall shelf of toys, 200 wide x 30 deep, plank 26 up; about 80 tall with the toys. Back on z = 0. */
  toyshelf: () => {
    const wood = satin('#ffffff');
    const g = group(at(rbox(200, 4, 30, 1.2, wood), 0, 26, 15));
    for (const s of [-1, 1]) {
      const br = new THREE.Shape();
      br.moveTo(0, 0);
      br.lineTo(0, 26);
      br.lineTo(24, 26);
      br.quadraticCurveTo(4, 22, 0, 0);
      g.add(at(extrude(br, 3, 0.6, satin('#ffd166'), { curve: 10 }), s * 70 + 1.5, 0, 0, 0, -Math.PI / 2, 0));
    }
    g.add(at(scaled(toys.teddy(), 1.5), -70, 30, 14, 0, 0.3, 0));
    g.add(at(scaled(robot(), 1.6), -30, 30, 14, 0, 0.2, 0));
    g.add(at(scaled(toys.rings(), 1.5), 8, 30, 14));
    g.add(at(scaled(toyCar('#06d6a0'), 1.5), 40, 30, 15, 0, 1.3, 0));
    g.add(at(scaled(alphaBlock(6, 6), 1.8), 72, 30, 10, 0, 0.2, 0), at(scaled(alphaBlock(6, 13), 1.8), 84, 30, 18, 0, -0.3, 0), at(scaled(alphaBlock(6, 20), 1.8), 77, 40.8, 14, 0, 0.5, 0));
    return g;
  },

  /** Round rug, 300 across, 1.6 thick: rings of colour, a star in the middle, a scalloped edge. */
  rug: () => {
    const geo = new THREE.LatheGeometry([[0, 1.6], [147, 1.6], [149.4, 1.2], [150, 0.4], [149, 0], [0, 0]].map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 96);
    topUV(geo, 300, 300);
    return mesh(geo, printed(rugTex(), { rough: 0.95, normalMap: pileBumps(), normalScale: 0.6 }), false);
  },
};

/** A smooth lathe profile through a few points. */
function spline2(pts: [number, number][]): [number, number][] {
  return new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getSpacedPoints(16).map((p) => [Math.max(0, p.x), p.y]);
}

/** A round castle tower `h` tall: stone, a battlement ring, a red cone roof and a pennant. */
function tower(r: number, h: number, stone: THREE.Material, roof: THREE.Material, flag: string) {
  const circ = 2 * Math.PI * r;
  const wall = new THREE.LatheGeometry([[r, 0], [r, h], [r + 0.5, h + 0.3], [r + 0.5, h + 1.4]].map(([a, b]) => new THREE.Vector2(a, b)), 24);
  tiled(wall, circ / 8, (h + 1.4) / 8);
  const g = group(mesh(wall, stone));
  g.add(at(turn([[0, 0], [r + 1, 0], [r + 0.7, 0.6], [r * 0.45, 4.5], [0.15, 8.6], [0, 8.7]], roof, 24, 20), 0, h + 1.2, 0));
  g.add(at(rbox(0.9, 2.6, 0.2, 0.1, satin('#2a2030')), 0, h * 0.6, r - 0.05));
  g.add(sweep([v3(0, h + 9.5, 0), v3(0, h + 13, 0)], 0.15, chrome(), 3, 6));
  const pen = new THREE.Shape();
  pen.moveTo(0, 0);
  pen.lineTo(3.2, -0.8);
  pen.lineTo(0, -1.7);
  g.add(at(extrude(pen, 0.1, 0, satin(flag), { curve: 2 }), 0.1, h + 12.9, 0));
  return g;
}

/** A dark gateway arch `w` wide and `h` tall with a portcullis, standing in the plane z = 0. */
function gateArch(w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  const g = group(extrude(s, 0.3, 0, satin('#2a2030'), { curve: 16 }));
  const bars = chrome('#8a8f99');
  for (let i = 1; i < 6; i++) g.add(at(rbox(0.35, h - 1.8, 0.35, 0.1, bars), -w / 2 + (i * w) / 6, 1.6, 0.4));
  for (let j = 0; j < 3; j++) g.add(at(rbox(w - 0.6, 0.35, 0.35, 0.1, bars), 0, 2.8 + j * 2.4, 0.45));
  g.add(at(extrude(new THREE.Shape().absarc(0, 0, w / 2 + 0.9, 0, Math.PI, false), 0.5, 0.2, satin('#dde4ea'), { curve: 16 }), 0, h - w / 2, -0.1));
  return g;
}

/**
 * Bathroom props. Sizes are in world units at kart scale (a kart is about 2.6 long); each prop stands on y = 0
 * at its origin and fills the footprint in packages/game/src/track/props.ts. The room-dressing pieces at the
 * end (bathtub, sink, towelrail, mirror) are life-size at about 0.5 cm a unit.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { at, group } from './kit';
import { type Builder, BRASS, chrome, extrude, glass, glaze, matte, mesh, plastic, printed, rbox, roundRect, satin, spline, steel, sweep, turn, v3 } from './propKit';
import { bumps, FONT, painted, rand, smallPrint, speckle, text } from './propTextures';

const colorOf = (v: string | number | undefined, d: string) => (typeof v === 'string' ? v : d);

// ---------------------------------------------------------------- textures

/** Sponge: pale foam full of holes; the material's colour tints it. */
const pores = () =>
  painted('pores', 256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#b8b8b8', '#9a9a9a', '#d6d6d6'], [2, 9], [0.5, 0.9], 31);
  }, true);
const poreBumps = () =>
  bumps('poresN', 256, 256, (g, w, h) => {
    g.fillStyle = '#d0d0d0';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#000000', '#303030'], [2, 9], [0.6, 1], 31);
  }, 3);

/** Scourer pad: a tangle of green fibres. */
const scour = () =>
  painted('scour', 256, 256, (g, w, h) => {
    g.fillStyle = '#1f8a4c';
    g.fillRect(0, 0, w, h);
    const r = rand(44);
    for (let i = 0; i < 700; i++) {
      g.strokeStyle = r() > 0.5 ? 'rgba(80,200,120,0.6)' : 'rgba(5,60,30,0.6)';
      g.lineWidth = 1 + r() * 1.5;
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 40, y + (r() - 0.5) * 40);
      g.stroke();
    }
  }, true);
const scourBumps = () =>
  bumps('scourN', 256, 256, (g, w, h) => {
    const r = rand(44);
    for (let i = 0; i < 700; i++) {
      g.strokeStyle = r() > 0.5 ? '#ffffff' : '#000000';
      g.lineWidth = 1 + r() * 1.5;
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 40, y + (r() - 0.5) * 40);
      g.stroke();
    }
  }, 2);

/** Terry towelling: tiny loops, near-white so the material colour tints it. */
const terry = () =>
  painted('terry', 128, 128, (g, w, h) => {
    g.fillStyle = '#f2f2f2';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1400, ['#ffffff', '#c9c9c9'], [1.5, 3.5], [0.4, 0.9], 51);
  }, true);
const terryBumps = () =>
  bumps('terryN', 128, 128, (g, w, h) => speckle(g, w, h, 1400, ['#ffffff', '#000000'], [1.5, 3.5], [0.5, 1], 51), 2.5);

/** Toilet paper: quilted in soft diamonds. */
const quilt = () =>
  painted('quilt', 64, 64, (g, w, h) => {
    g.fillStyle = '#fbfbf8';
    g.fillRect(0, 0, w, h);
  }, true);
const quiltBumps = () =>
  bumps('quiltN', 64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grd.addColorStop(0, '#b0b0b0');
    grd.addColorStop(1, '#606060');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#303030';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w / 2, 0);
    g.lineTo(w, h / 2);
    g.lineTo(w / 2, h);
    g.closePath();
    g.stroke();
  }, 1.5);

/** Bath mat: fluffy chenille stripes. */
const matStripes = () =>
  painted('bathmat', 512, 512, (g, w, h) => {
    const n = 9;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#7cc9ee';
      g.fillRect((i * w) / n, 0, w / n + 1, h);
    }
    speckle(g, w, h, 5000, ['#ffffff', '#5aa8d0', '#e4f4fb'], [2, 5], [0.15, 0.45], 61);
    // A border all round.
    g.strokeStyle = '#4f9fcf';
    g.lineWidth = 18;
    g.strokeRect(9, 9, w - 18, h - 18);
  });
const fluff = () =>
  bumps('fluffN', 256, 256, (g, w, h) => speckle(g, w, h, 3000, ['#ffffff', '#000000'], [2, 5], [0.4, 1], 62), 2);

/** Shampoo label, wrapped round the front of the bottle. */
const shampooLabel = () =>
  painted('shampoo', 512, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#eaf6f8');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // Bubbles.
    const r = rand(71);
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = 'rgba(70,170,200,0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(r() * w, 40 + r() * 140, 6 + r() * 18, 0, Math.PI * 2);
      g.stroke();
    }
    text(g, 'bubbly', w / 2, 150, 120, w - 70, '#1b6f8a', 900);
    g.fillStyle = '#1b6f8a';
    g.fillRect(90, 220, w - 180, 6);
    text(g, 'COCONUT & ALOE', w / 2, 265, 40, w - 120, '#e05a7a', 800);
    text(g, 'gentle shampoo', w / 2, 318, 38, w - 120, '#2f4a55', 600);
    // A drop.
    g.fillStyle = '#3fb6d8';
    g.beginPath();
    g.moveTo(w / 2, 352);
    g.bezierCurveTo(w / 2 + 34, 400, w / 2 + 30, 440, w / 2, 442);
    g.bezierCurveTo(w / 2 - 30, 440, w / 2 - 34, 400, w / 2, 352);
    g.fill();
    text(g, '400 ml', w / 2, 480, 26, 200, '#2f4a55', 700);
  });

/** Toothpaste tube print. */
const paste = () =>
  painted('paste', 256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e63946';
    g.fillRect(0, h * 0.38, w, h * 0.3);
    g.fillStyle = '#3d9bff';
    g.fillRect(0, h * 0.68, w, h * 0.06);
    text(g, 'MINTY', w / 2, h * 0.53, 54, w * 0.45, '#ffffff', 900, FONT);
    smallPrint(g, 20, h * 0.8, w - 40, 3, 12, '#777', 9);
  });

/** A mirror's glass: the room's light falls on it in a soft gradient with a couple of sheen streaks. */
const mirrorSheen = () =>
  painted('mirror', 256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w * 0.4, h);
    grd.addColorStop(0, '#d9eef5');
    grd.addColorStop(0.55, '#a9c6d1');
    grd.addColorStop(1, '#8fb0bd');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (const [x, ww] of [[60, 34], [118, 12]]) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + ww, 0);
      g.lineTo(x + ww - 120, h);
      g.lineTo(x - 120, h);
      g.fill();
    }
  });

// ---------------------------------------------------------------- helpers

/** Uvs wrapped round the y axis: `around` tiles per turn, one tile per `tall` units up. */
function cylUV(g: THREE.BufferGeometry, around: number, tall: number) {
  const p = g.attributes.position;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2)) * around, p.getY(i) / tall);
  uv.needsUpdate = true;
}

/** Soft foam: a clump of white bubbles around a point, flattened on the water. */
function foam(g: THREE.Group, x: number, y: number, z: number, size: number, n: number, seed: number) {
  const r = rand(seed);
  const m = matte('#ffffff');
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * size;
    const s = size * (0.35 + r() * 0.4) * (1 - (d / size) * 0.5);
    const b = mesh(new THREE.SphereGeometry(s, 8, 5), m);
    b.scale.y = 0.75;
    b.position.set(x + Math.cos(a) * d, y + s * 0.25 + r() * s * 0.3, z + Math.sin(a) * d);
    g.add(b);
  }
}

/** A few clear soap bubbles in one mesh, so they cost one draw call. */
function bubbles(spots: [number, number, number, number][]) {
  const geos = spots.map(([x, y, z, r]) => new THREE.SphereGeometry(r, 10, 6).translate(x, y, z));
  const o = mesh(mergeGeometries(geos), glass('#f4fbff', 0.06, 0.02), false);
  o.renderOrder = 3;
  return o;
}

/** A chrome tap: a pillar with a cross-head handle and a coloured cap. */
function crossTap(cap: string, h: number) {
  const c = chrome();
  const g = group(turn([[1.3, 0], [1.3, 0.3], [0.9, 0.6], [0.75, h - 1], [0.9, h - 0.6], [0.6, h], [0, h]], c, 20));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(sweep([v3(0, h - 0.2, 0), v3(Math.cos(a) * 1.1, h, Math.sin(a) * 1.1), v3(Math.cos(a) * 1.8, h + 0.15, Math.sin(a) * 1.8)], (t) => 0.32 - t * 0.06, c, 6, 8));
    g.add(at(mesh(new THREE.SphereGeometry(0.32, 10, 8), c), Math.cos(a) * 1.85, h + 0.15, Math.sin(a) * 1.85));
  }
  g.add(at(turn([[0.55, 0], [0.55, 0.25], [0.35, 0.4], [0, 0.42]], glaze(cap), 16), 0, h, 0));
  return g;
}

/** A towel thrown over a rail: one cloth section, hanging both sides of a bar at (zc, yc), extruded `width` along x. */
function drapedTowel(width: number, zc: number, yc: number, rail: number, front: number, back: number, color: string) {
  const t = 1.8;
  const ri = rail + 0.2;
  const ro = ri + t;
  const s = new THREE.Shape();
  s.moveTo(zc - ri, back);
  s.lineTo(zc - ri, yc);
  s.absarc(zc, yc, ri, Math.PI, 0, true);
  s.lineTo(zc + ri, front);
  // A soft rounded hem.
  s.quadraticCurveTo(zc + ri + t / 2, front - 1.2, zc + ro, front);
  s.lineTo(zc + ro, yc);
  s.absarc(zc, yc, ro, 0, Math.PI, false);
  s.lineTo(zc - ro, back);
  s.quadraticCurveTo(zc - ri - t / 2, back - 1.2, zc - ri, back);
  const o = extrude(s, width, 0.6, printed(terry(), { rough: 1, normalMap: terryBumps(), color }), { curve: 16, bevelSegs: 2, uvScale: 0.08 });
  o.geometry.rotateY(-Math.PI / 2).translate(width / 2, 0, 0);
  return o;
}

// ---------------------------------------------------------------- the tub on the bath track

/**
 * The bath track's sunken tub rim: a ring round the main water ellipse (rx 101, rz 47 from the prop). The
 * bath is let into the floor, so nothing stands taller than the lip where the road runs past it.
 * `profile` is [outward offset, height] from the water's edge, over the lip and back down to the floor.
 */
function rim(profile: [number, number][], m: THREE.Material, segs = 128) {
  const pts = spline(profile, 10);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    for (const [off, y] of pts) pos.push(Math.cos(t) * (101 + off), y, Math.sin(t) * (47 + off));
  }
  const k = pts.length;
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < k - 1; j++) {
      const a = i * k + j;
      const b = ((i + 1) % segs) * k + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return mesh(g, m);
}

// ---------------------------------------------------------------- builders

export const bath: Record<string, Builder> = {
  /** Bar of soap, 10 x 3.5 x 7: a waxy pillow with a pressed oval and a little lather on top. */
  soap: (v) => {
    const c = colorOf(v, '#ffb3c6');
    const g = group(rbox(10, 3.1, 7, 1.5, satin(c), undefined, 4));
    // The pressed logo panel: a raised pillow inside a groove.
    g.add(at(rbox(6.6, 0.6, 4, 1.4, satin(c), undefined, 3), 0, 2.75, 0));
    foam(g, 1.6, 3.3, -0.6, 1.3, 7, 3);
    g.add(bubbles([[2.6, 3.9, 0.4, 0.45], [0.8, 4.1, -1.2, 0.35], [-2.4, 3.4, 1.4, 0.3]]));
    return g;
  },

  /** Rubber duck, body radius 3.2, 7.4 tall: tail up, orange beak, glossy eyes. */
  duck: (v) => {
    const c = colorOf(v, '#ffd23f');
    const skin = glaze(c);
    const geo = new THREE.SphereGeometry(1, 40, 28);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const tail = Math.max(0, -z - 0.4) / 0.6;
      let Y = y > 0 ? y * 2.1 : y * 1.25;
      Y += tail * tail * (y > -0.3 ? 2.4 : 0.8);
      p.setXYZ(i, x * 2.75 * (1 - 0.45 * tail * tail), Y + 1.25, z * 3.15 - tail * 0.5);
    }
    geo.computeVertexNormals();
    const g = group(mesh(geo, skin));
    // Head and cheeks.
    g.add(at(mesh(new THREE.SphereGeometry(2.05, 36, 24), skin), 0, 5.2, 1.35));
    // Wings, tucked along the sides.
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.SphereGeometry(1, 20, 14), skin);
      wing.scale.set(0.55, 1.05, 1.9);
      g.add(at(wing, s * 2.35, 2.35, -0.4, 0.35, 0, s * 0.15));
    }
    // Beak: upper and lower, slightly open in a smile.
    const beak = glaze('#ff7a1a');
    const up = mesh(new THREE.SphereGeometry(1, 24, 14), beak);
    up.scale.set(1.15, 0.42, 1.35);
    g.add(at(up, 0, 4.85, 3.15, 0.12, 0, 0));
    const lo = mesh(new THREE.SphereGeometry(1, 20, 12), beak);
    lo.scale.set(0.9, 0.3, 1.05);
    g.add(at(lo, 0, 4.45, 3.0, -0.1, 0, 0));
    // Eyes: white with glossy black pupils looking forward.
    for (const s of [-1, 1]) {
      const dir = new THREE.Vector3(s * 0.52, 0.42, 0.74).normalize();
      const eye = mesh(new THREE.SphereGeometry(0.62, 16, 12), glaze('#ffffff'));
      eye.scale.set(1, 1, 0.55);
      g.add(at(eye, dir.x * 1.92, 5.2 + dir.y * 1.92, 1.35 + dir.z * 1.92));
      eye.lookAt(new THREE.Vector3(dir.x * 5, 5.2 + dir.y * 5, 1.35 + dir.z * 5));
      const pupil = mesh(new THREE.SphereGeometry(0.36, 14, 10), glaze('#141414'));
      g.add(at(pupil, dir.x * 2.14 + s * -0.05, 5.25 + dir.y * 2.14, 1.35 + dir.z * 2.14 + 0.1));
    }
    return g;
  },

  /** Shampoo bottle, 7.6 wide x 4.7 deep x 17 tall: an oval squeeze bottle with a flip cap and a label. */
  bottle: (v) => {
    const c = colorOf(v, '#7b2cbf');
    const body = turn([[0, 0], [3.3, 0], [3.7, 0.25], [3.8, 1.2], [3.75, 9.5], [3.45, 11.8], [2.6, 13.3], [1.45, 13.9], [1.4, 14.3], [0, 14.3]], plastic(c), 48, 40);
    body.geometry.scale(1, 1, 0.62);
    const g = group(body);
    // Label round the front, standing just proud of the plastic.
    const lab = new THREE.CylinderGeometry(3.82, 3.82, 7.2, 32, 1, true, -1.15, 2.3);
    lab.scale(1, 1, 0.62);
    g.add(at(mesh(lab, printed(shampooLabel(), { rough: 0.35 })), 0, 5.4, 0));
    // Flip-top cap: a collar, the lid and its little nozzle.
    const cap = plastic('#f4f4f4');
    g.add(at(turn([[1.6, 0], [1.65, 1.6], [1.55, 1.8], [0, 1.8]], cap, 24), 0, 14.2, 0));
    g.add(at(turn([[1.68, 0], [1.68, 0.9], [1.4, 1.2], [0, 1.25]], cap, 24), 0, 16, 0));
    g.add(at(rbox(1.1, 0.5, 0.8, 0.2, cap), 0, 16.1, 1.6));
    return g;
  },

  /** Toothbrush cup, radius 3.4, 9 tall, with two brushes and a tube of toothpaste. */
  cup: () => {
    const g = group(turn([[0, 0], [2.7, 0], [3.0, 0.3], [3.4, 8.7], [3.32, 9.0], [3.1, 8.85], [2.7, 1.3], [0, 1.2]], glaze('#9fded9'), 40));
    const brush = (color: string, bristle: string) => {
      const b = group(turn([[0, 0], [0.45, 0.05], [0.55, 2], [0.55, 8], [0.42, 10.5], [0.28, 12.4], [0.3, 13.2], [0, 13.3]], plastic(color), 12, 24));
      b.add(at(rbox(0.75, 3, 0.55, 0.25, plastic(color)), 0, 12.8, 0));
      // Bristles: white with a coloured stripe.
      b.add(at(rbox(0.7, 2.6, 1.1, 0.12, matte('#ffffff')), 0, 13, 0.75));
      b.add(at(rbox(0.72, 0.7, 1.15, 0.1, matte(bristle)), 0, 14.4, 0.77));
      return b;
    };
    g.add(at(brush('#ff595e', '#3dc1ff'), -0.9, 1.2, 0.2, 0.05, 0, 0.24));
    g.add(at(brush('#1982c4', '#ffd23f'), 0.9, 1.2, -0.3, -0.05, Math.PI, 0.2));
    // Toothpaste: round at the cap, crimped flat at the far end.
    const tube = new THREE.CylinderGeometry(1, 1, 11, 24, 10);
    const p = tube.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.pow((p.getY(i) + 5.5) / 11, 1.6);
      p.setXYZ(i, p.getX(i) * (1 + 0.5 * t), p.getY(i), p.getZ(i) * (1 - 0.88 * t));
    }
    tube.computeVertexNormals();
    tube.translate(0, 5.5, 0);
    const t = group(mesh(tube, printed(paste(), { rough: 0.35 })), at(rbox(3.1, 0.6, 0.35, 0.1, plastic('#ffffff')), 0, 10.9, 0));
    t.add(at(turn([[0.65, 0], [0.65, 1.1], [0.5, 1.3], [0, 1.3]], plastic('#3d9bff'), 16), 0, -1.2, 0, 0, 0, 0));
    g.add(at(t, 0.3, 2.6, 0.9, 0.22, 0.4, -0.08));
    return g;
  },

  /** Toilet roll, radius 5.2, 9 tall: quilted paper on a card core, the end sheet peeling off. */
  roll: () => {
    const paper = printed(quilt(), { rough: 0.95, normalMap: quiltBumps(), normalScale: 0.6 });
    const outer = turn([[1.85, 0.1], [4.9, 0.02], [5.12, 0.15], [5.2, 0.5], [5.2, 8.5], [5.12, 8.85], [4.9, 8.98], [1.85, 8.9]], paper, 56);
    cylUV(outer.geometry, 14, 2.3);
    const g = group(outer);
    g.add(turn([[1.62, 0], [1.84, 0], [1.84, 9.02], [1.62, 9.02], [1.62, 0]], matte('#b98c5e'), 32));
    // The loose end, lifting away from the roll and resting on the floor.
    const sheet = new THREE.PlaneGeometry(1, 1, 16, 1);
    const p = sheet.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5;
      const y = (p.getY(i) + 0.5) * 8.7 + 0.15;
      // Angle runs backwards along the strip so its front faces out.
      const a = 0.9 + (1 - u) * 0.75;
      const k = 1 - u;
      const r = 5.23 + k * k * 0.9;
      p.setXYZ(i, Math.cos(a) * r, y - k * k * 0.4 * (y / 9), Math.sin(a) * r);
    }
    sheet.computeVertexNormals();
    cylUV(sheet, 14, 2.3);
    g.add(mesh(sheet, paper));
    return g;
  },

  /** Kitchen sponge, 12 x 4.2 x 8: porous foam with a green scourer on top. */
  sponge: (v) => {
    const c = colorOf(v, '#ffe66d');
    const s = (w: number, h: number): [number, number, number, number] => [0, 0, w / 5, h / 5];
    const g = group(rbox(12, 3, 8, 0.8, printed(pores(), { rough: 1, normalMap: poreBumps(), color: c }), { pz: s(12, 3), nz: s(12, 3), px: s(8, 3), nx: s(8, 3), py: s(12, 8), ny: s(12, 8) }, 3));
    g.add(at(rbox(12, 1.2, 8, 0.35, printed(scour(), { rough: 0.9, normalMap: scourBumps() }), { pz: s(12, 1.2), nz: s(12, 1.2), px: s(8, 1.2), nx: s(8, 1.2), py: s(12, 8), ny: s(12, 8) }), 0, 2.95, 0));
    return g;
  },

  /** Towel folded in two, 30 x 2.2 x 20, lying flat, with a woven band near each end. */
  towel: (v) => {
    const c = colorOf(v, '#7fc8f8');
    const m = printed(terry(), { rough: 1, normalMap: terryBumps(), color: c });
    const s = (w: number, h: number): [number, number, number, number] => [0, 0, w / 6, h / 6];
    const layer = () => rbox(30, 1.15, 20, 0.55, m, { pz: s(30, 1), nz: s(30, 1), px: s(20, 1), nx: s(20, 1), py: s(30, 20), ny: s(30, 20) }, 3);
    const g = group(layer(), at(layer(), -0.4, 1.0, 0));
    // The fold: a rounded edge joining the two layers.
    const fold = mesh(new THREE.CylinderGeometry(1.08, 1.08, 19.2, 20, 1, false, -Math.PI / 2, Math.PI), m);
    g.add(at(fold, 14.45, 1.08, 0, Math.PI / 2, 0, 0));
    for (const x of [-11, -9.6]) g.add(at(rbox(0.9, 0.2, 19.6, 0.08, satin(c)), x, 2.05, 0));
    return g;
  },

  /** Bath mat, 60 x 1.4 x 36: thick striped chenille. */
  bathmat: () => rbox(60, 1.4, 36, 1.2, printed(matStripes(), { rough: 1, normalMap: fluff(), normalScale: 0.8 }), { py: [0, 0, 1, 1], rest: [0.01, 0.01, 0.03, 0.99] }, 3),

  /**
   * The bath track's tub, sunk into the floor: a white enamel lip 0.4 high and 3.4 wide round the water (drawn
   * by the track at y 0.12), chrome taps and a plug on its chain on the lip at the +x end, foam on the water.
   * Decoration only: the road runs right along the front at floor level and up on the rim road at the back,
   * so nothing here may stand where a kart or its chase camera goes.
   */
  tub: () => {
    const g = new THREE.Group();
    g.add(rim([[-0.4, -0.3], [0, 0.15], [0.5, 0.34], [1.5, 0.42], [2.5, 0.34], [3, 0.15], [3.4, -0.3]], glaze('#fbfcfd')));
    // Mixer taps on the lip at the +x end, clear of the road up the end of the tub (x 125 in the world).
    const c = chrome();
    const tx = 102.5;
    const y = 0.4;
    g.add(at(rbox(3, 0.35, 14, 0.3, c), tx, y - 0.1, -0.5));
    g.add(at(crossTap('#e63946', 6.5), tx, y, -5.5));
    g.add(at(crossTap('#3d9bff', 6.5), tx, y, 4.5));
    g.add(at(turn([[1.3, 0], [1.3, 0.4], [0.95, 0.8], [0.9, 6.2], [0.6, 7], [0, 7]], c, 20), tx, y, -0.5));
    g.add(sweep([v3(tx, y + 6.6, -0.5), v3(tx - 1.2, y + 8.6, -0.5), v3(tx - 3.7, y + 8.3, -0.5), v3(tx - 4.9, y + 6.6, -0.5)], (t) => 0.75 - t * 0.12, c, 24, 12));
    // The plug, out on the lip, and its chain running back to the taps.
    g.add(at(turn([[1.6, 0], [1.6, 0.35], [1.25, 0.6], [0, 0.65]], c, 16), 100.6, y, 10));
    const chain = new THREE.CatmullRomCurve3([v3(tx, y + 0.5, 6), v3(tx - 0.6, y + 0.2, 7.5), v3(tx - 1.4, y + 0.1, 8.8), v3(100.8, y + 0.6, 10)]);
    for (let i = 0; i < 9; i++) {
      const p = chain.getPointAt(i / 8);
      g.add(at(mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 10), c), p.x, p.y, p.z, 0, (i % 2) * (Math.PI / 2), Math.PI / 2));
    }
    // Foam on the water, and a few clear bubbles.
    const spots: [number, number, number, number][] = [];
    for (let i = 0; i < 30; i++) {
      const a = i * 2.39;
      const t = 0.2 + ((i * 41) % 60) / 90;
      const x = Math.cos(a) * 92 * t;
      const z = Math.sin(a) * 42 * t;
      foam(g, x, 0.12, z, 1.8 + (i % 4) * 0.9, 5 + (i % 4), i + 1);
      spots.push([x + 1.5, 1.6 + (i % 3) * 0.4, z - 1, 0.5 + (i % 3) * 0.25]);
    }
    g.add(bubbles(spots));
    return g;
  },

  // ---------------------------------------------------------------- room dressing, life-size

  /**
   * Freestanding roll-top bathtub, 344 long (x) x 152 wide x 121 tall on brass claw feet; painted outside,
   * white enamel inside, filled with bubbly water. Mixer taps and a shower handset at the -x end.
   */
  bathtub: (v) => {
    const paint = colorOf(v, '#2f6f86');
    const sx = 2.27;
    const outside = turn([[50, 16], [55, 17], [63, 40], [70, 80], [73.5, 106], [75, 114]], glaze(paint), 72, 40);
    const inside = turn([[75, 114], [75.8, 117.5], [74.4, 120.6], [71.5, 121], [69.6, 118.5], [69, 113], [66.5, 82], [59, 50], [47, 34], [20, 31.5], [0, 31]], glaze('#fbfcfd'), 72, 48);
    outside.geometry.scale(sx, 1, 1);
    inside.geometry.scale(sx, 1, 1);
    const g = group(outside, inside);
    g.add(at(mesh(new THREE.CircleGeometry(50.2, 72).rotateX(Math.PI / 2).scale(sx, 1, 1), glaze(paint)), 0, 16, 0));
    // Claw feet.
    const brass = steel(BRASS);
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = fx * 92;
      const z = fz * 30;
      g.add(sweep([v3(x * 0.92, 24, z * 0.9), v3(x * 1.02, 14, z * 1.05), v3(x * 1.08, 6, z * 1.12)], (t) => 6 - t * 2.5, brass, 12, 12));
      g.add(at(mesh(new THREE.SphereGeometry(4.6, 18, 12), brass), x * 1.09, 4.6, z * 1.14));
      for (let k = -1; k <= 1; k++) {
        const a = Math.atan2(z, x) + k * 0.6;
        g.add(sweep([v3(x * 1.09, 5, z * 1.14), v3(x * 1.09 + Math.cos(a) * 4.5, 3, z * 1.14 + Math.sin(a) * 4.5), v3(x * 1.09 + Math.cos(a) * 6.5, 0.8, z * 1.14 + Math.sin(a) * 6.5)], (t) => 1.8 - t * 0.9, brass, 8, 8));
      }
    }
    // Water and foam.
    const water = at(mesh(new THREE.CircleGeometry(67.6, 72).rotateX(-Math.PI / 2).scale(sx * 0.985, 1, 0.985), glass('#9fd8f0', 0.38, 0.02), false), 0, 100, 0);
    water.renderOrder = 2;
    g.add(water);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.3;
      const k = 0.62 + ((i * 37) % 10) / 40;
      foam(g, Math.cos(a) * 66 * sx * k, 99, Math.sin(a) * 60 * k, 8 + (i % 3) * 3, 9, 100 + i);
    }
    // Deck mixer on the rim at the -x end, with a shower handset in its cradle and the hose looping down.
    const c = chrome();
    const tx = -163;
    for (const z of [-14, 14]) {
      g.add(at(turn([[3, 0], [3, 1], [2, 2], [1.8, 14], [2.4, 15], [0, 15]], c, 20), tx, 120.5, z));
      g.add(at(crossTap(z < 0 ? '#e63946' : '#3d9bff', 4), tx, 135.5, z));
    }
    g.add(sweep([v3(tx, 130, -14), v3(tx, 130, 14)], 2, c, 4, 14));
    g.add(sweep([v3(tx, 130, 0), v3(tx + 4, 140, 0), v3(tx + 13, 141, 0), v3(tx + 20, 132, 0)], (t) => 2.2 - t * 0.5, c, 24, 14));
    // Handset resting in a cradle on the bar's front.
    g.add(at(rbox(6, 6, 6, 1.5, c), tx - 5, 127, 0));
    const handset = group(turn([[0, 0], [1.5, 0], [1.8, 14], [3.2, 16], [3.6, 18.5], [3.4, 19.5], [0, 19.6]], c, 24), at(mesh(new THREE.CircleGeometry(3.3, 24).rotateX(-Math.PI / 2).rotateX(Math.PI), matte('#9aa4ad')), 0, 19.62, 0));
    g.add(at(handset, tx - 5, 128, 0, 0, 0, -0.35));
    // Hose: from under the handset, down the outside of the tub in a lazy loop to the floor.
    g.add(sweep([v3(tx - 5, 128, 0), v3(tx - 12, 112, 4), v3(tx - 14, 70, 14), v3(tx - 26, 20, 30), v3(tx - 40, 4, 50), v3(tx - 18, 2, 70), v3(tx + 4, 30, 72)], 1.6, steel(), 64, 10));
    return g;
  },

  /** Pedestal wash basin, 120 wide x 90 deep x 188 tall to the top of the mixer; its back is at z = -45. */
  sink: () => {
    const ceramic = glaze('#fbfcfd');
    const g = group(turn([[0, 0], [22, 0], [23, 2], [21, 6], [14.5, 30], [12.5, 80], [13.5, 115], [19, 135], [16, 140], [0, 140]], ceramic, 40, 40));
    const basin = turn([[0, 133], [16, 134], [30, 140], [46, 151], [56, 160], [60, 166], [60.4, 170], [59, 172.6], [52, 173], [48.5, 171.6], [46, 166], [36, 156], [20, 149.5], [0, 148]], ceramic, 72, 56);
    basin.geometry.scale(1, 1, 0.75);
    g.add(basin);
    const c = chrome();
    g.add(at(turn([[3.2, 0], [3.2, 0.6], [2, 1.4], [0, 1.6]], c, 24), 0, 147.9, 0));
    // Mixer on the back of the rim: body, swan-neck spout and lever.
    const tz = -40.5;
    g.add(at(turn([[3.2, 0], [3.2, 1], [2.3, 2], [2.1, 12], [2.5, 13], [0, 13]], c, 24), 0, 172.6, tz));
    g.add(sweep([v3(0, 182, tz), v3(0, 188, tz + 4), v3(0, 187, tz + 11), v3(0, 181, tz + 14)], (t) => 1.4 - t * 0.3, c, 24, 12));
    g.add(at(rbox(1.6, 1.6, 9, 0.7, c), 0, 185.6, tz - 4.5, -0.25, 0, 0));
    return g;
  },

  /** Wall towel rail, 140 wide x 104 tall x 16 deep (back at z = 0), with a bath towel and a hand towel. */
  towelrail: (v) => {
    const c = chrome();
    const g = new THREE.Group();
    for (const x of [-64, 64]) {
      g.add(at(turn([[4, 0], [4, 1], [3.2, 1.6], [0, 1.6]], c, 24), x, 100, 0, Math.PI / 2, 0, 0));
      g.add(sweep([v3(x, 100, 1), v3(x, 100, 12)], 1.4, c, 2, 14));
    }
    g.add(sweep([v3(-66, 100, 12), v3(66, 100, 12)], 1.4, c, 2, 16));
    g.add(at(drapedTowel(62, 12, 100, 1.4, 6, 24, colorOf(v, '#7fc8f8')), -30, 0, 0));
    g.add(at(drapedTowel(40, 12, 100, 1.4, 52, 60, '#f4efe6'), 26, 0, 0));
    return g;
  },

  /** Wall mirror, 120 wide x 160 tall x 6 deep (back at z = 0): a white glazed frame round a reflective glass. */
  mirror: () => {
    const frame = roundRect(120, 160, 14) as THREE.Shape;
    frame.holes.push(roundRect(104, 144, 8, new THREE.Path()));
    const g = group(at(extrude(frame, 6, 1.6, glaze('#f6f4ee'), { curve: 10 }), 0, 80, 0));
    g.add(at(mesh(new THREE.PlaneGeometry(106, 146), printed(mirrorSheen(), { rough: 0.05, metal: 0.7, emissive: 0.45 }), false), 0, 80, 3));
    return g;
  },
};

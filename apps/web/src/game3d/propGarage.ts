/**
 * Garage props. Sizes are in world units at kart scale (a kart is about 2.6 long); each prop stands on y = 0
 * at its origin and fills the footprint in packages/game/src/track/props.ts. The room-dressing pieces at the
 * end are at room scale (1 unit is about half a centimetre).
 */
import * as THREE from 'three';
import { at, cyl, group, scaled, torus } from './kit';
import { type Builder, chrome, extrude, glaze, glow, matte, mesh, plastic, printed, rbox, roundRect, rubber, satin, steel, sweep, turn, uvRect, v3 } from './propKit';
import { badge, batteryLabel, benchWood, crateWood, drumLabel, kraft, paintLabel, PEG_H, PEG_W, pegboard, plate, stencil, TYRE_SIDE, TYRE_TREAD, tyreBumps, tyreMap } from './propGarageTex';
import { rand } from './propTextures';

const FULL: [number, number, number, number] = [0, 0, 1, 1];
const DOT: [number, number, number, number] = [0.02, 0.02, 0.03, 0.03];
const TIN_COLORS = ['#ffd23f', '#ef476f', '#3d9bff'];
const PAINTS = ['#e63946', '#3d9bff', '#ffd23f', '#2a9d8f', '#f4f1ea', '#8d5bc1', '#ff7a1a', '#2b2d42'];

/** A lathe with its uvs squeezed into part of a shared texture. */
const turnUV = (profile: [number, number][], m: THREE.Material, r: [number, number, number, number], segs = 64) => {
  const o = turn(profile, m, segs);
  uvRect(o.geometry, r);
  return o;
};

// ---------------------------------------------------------------- reusable pieces

/** One car tyre lying flat on a steel wheel: outer radius 6.5, 4.2 tall. */
function tyre(segs = 64) {
  const rub = printed(tyreMap(), { rough: 0.82, normalMap: tyreBumps(), normalScale: 1.2 });
  const g = group(
    turnUV([[3.35, 3.65], [3.35, 0.55], [3.6, 0.25], [4.6, 0.05], [5.6, 0.05], [6.15, 0.3], [6.4, 0.75]], rub, [0, 0.5, 1, 0.5], segs),
    turnUV([[6.4, 0.75], [6.5, 1.2], [6.5, 3.0], [6.4, 3.45]], rub, TYRE_TREAD, segs),
    turnUV([[6.4, 3.45], [6.15, 3.9], [5.6, 4.15], [4.6, 4.15], [3.6, 3.95], [3.35, 3.65]], rub, TYRE_SIDE, segs),
  );
  // The wheel: a pressed steel dish with vent holes and a hub.
  g.add(turn([[3.2, 0.45], [3.45, 0.5], [3.45, 0.8], [3.28, 1.0], [3.28, 3.2], [3.45, 3.4], [3.45, 3.72], [3.15, 3.78], [2.95, 3.35], [2.2, 3.12], [1.4, 3.3], [1.15, 3.6], [0.85, 3.68], [0, 3.68]], steel('#b4bac2'), Math.round(segs * 0.75)));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(at(scaled(cyl(0.42, 0.42, 0.1, rubber('#0d0d10'), 10), 1, 1, 1.5), Math.cos(a) * 2.05, 3.14, Math.sin(a) * 2.05, 0, -a, 0));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    g.add(at(cyl(0.18, 0.2, 0.3, chrome(), 6), Math.cos(a) * 0.62, 3.6, Math.sin(a) * 0.62));
  }
  return g;
}

/** A paint tin, radius 4.5 x 9 tall: label, a lid ringed with paint, a drip, the wire bail. */
function tin(color: string, segs = 48, detail = true) {
  const g = group(
    turn([[0, 0.05], [4.2, 0], [4.45, 0.15], [4.5, 0.5], [4.35, 0.75], [4.35, 8.15], [4.5, 8.35], [4.5, 8.85], [4.3, 9.0], [4.05, 8.95], [3.95, 8.7], [0, 8.7]], steel('#c9ced6'), segs),
    at(mesh(new THREE.CylinderGeometry(4.37, 4.37, 7, segs, 1, true), printed(paintLabel(color), { rough: 0.45 })), 0, 4.45, 0),
    turn([[3.93, 8.74], [4.1, 8.92], [4.32, 9.04], [4.52, 8.9]], glaze(color), segs),
  );
  if (!detail) return g;
  const a = 0.9;
  const p = (r: number, y: number) => v3(Math.sin(a) * r, y, Math.cos(a) * r);
  g.add(sweep([p(4.56, 8.95), p(4.47, 8.3), p(4.43, 7.0), p(4.42, 5.6)], (t) => (t > 0.85 ? 0.42 : 0.3), glaze(color), 16, 8));
  g.add(at(rbox(0.5, 1.4, 1.4, 0.2, steel()), 4.4, 6.9, 0), at(rbox(0.5, 1.4, 1.4, 0.2, steel()), -4.4, 6.9, 0));
  g.add(sweep([v3(4.6, 7.6, 0), v3(4.0, 10.2, -1.6), v3(0, 11.6, -3.1), v3(-4.0, 10.2, -1.6), v3(-4.6, 7.6, 0)], 0.16, steel(), 32, 6, false));
  return g;
}

/** A claw hammer standing on its handle end, head across x at the top: 18 tall. */
function hammer() {
  const g = group(
    turn([[0, 0], [0.62, 0], [0.72, 0.4], [0.68, 6], [0.55, 11], [0.5, 15.6], [0, 15.6]], satin('#c08a52'), 16, 14),
    turn([[0.7, 0.2], [0.8, 0.6], [0.78, 5.2], [0.7, 5.6]], rubber('#1b1c20'), 16),
  );
  // The head: a striking face on one side, a curled claw on the other.
  g.add(at(rbox(4.2, 1.5, 1.5, 0.3, steel('#8d939c')), 0.6, 15.2, 0));
  g.add(at(turn([[0, 0], [0.85, 0], [0.95, 0.3], [0.95, 2.4], [0.8, 2.6], [0, 2.6]], steel('#b8bec7'), 16), 2.5, 15.95, 0, 0, 0, -Math.PI / 2));
  g.add(sweep([v3(-1.4, 15.95, 0), v3(-3.2, 16.2, 0), v3(-4.6, 15.4, 0), v3(-5.2, 14.0, 0)], (t) => 0.62 - t * 0.38, steel('#8d939c'), 16, 8));
  return g;
}

/** A combination spanner lying flat, 32 long along z: open jaws at +z, a ring at -z. */
function spanner(m = chrome('#d9dde3')) {
  const g = group();
  g.add(extrude(roundRect(1.9, 24, 0.9) as THREE.Shape, 0.8, 0.25, m, { lie: true }));
  const ring = new THREE.Shape().absarc(0, 0, 3, 0, Math.PI * 2, false);
  ring.holes.push(new THREE.Path().absarc(0, 0, 1.7, 0, Math.PI * 2, true));
  g.add(at(extrude(ring, 1.0, 0.25, m, { lie: true, curve: 24 }), 0, 0, -13.5));
  const d = Math.asin(1.3 / 3.2);
  const open = new THREE.Shape();
  open.absarc(0, 0, 3.2, -Math.PI / 2 + d, Math.PI * 1.5 - d, false);
  open.lineTo(-1.3, 0.6);
  open.lineTo(1.3, 0.6);
  open.closePath();
  // Jaws face away from the shaft, angled a little as real spanners are.
  g.add(at(extrude(open, 0.9, 0.25, m, { lie: true, curve: 24 }), 0, 0, 13.6, 0, 0.26, 0));
  return g;
}

/** A screwdriver lying along +z: fluted yellow handle, black grip band, steel shaft, flat tip. 26 long. */
function driver(color = '#ffc61a') {
  const h = turn([[0, 0], [1.2, 0], [1.45, 0.3], [1.5, 1], [1.5, 6.5], [1.35, 7.5], [1.0, 9.0], [0.75, 10.2], [0, 10.3]], plastic(color), 36, 24);
  const pos = h.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.6 || y > 7.2) continue;
    const k = 1 + 0.07 * Math.cos(6 * Math.atan2(pos.getZ(i), pos.getX(i))) - 0.07;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  h.geometry.computeVertexNormals();
  const tip = turn([[0.42, 0], [0.42, 0.4], [0.14, 1.6], [0, 1.62]], steel(), 12);
  tip.scale.set(1.25, 1, 0.35);
  const g = group(h, turn([[1.44, 0.6], [1.5, 0.75], [1.5, 2.6], [1.44, 2.75]], rubber('#1b1c20'), 36), at(cyl(0.42, 0.42, 14, steel(), 12), 0, 10.2, 0), at(tip, 0, 24.2, 0));
  return group(at(group(g), 0, 1.45, 0, Math.PI / 2, 0, 0));
}

/** A bench vice, about 9 wide x 7 tall x 12 deep, jaws opening towards +z. */
function vice() {
  const blue = glaze('#2a5db0');
  const g = group(
    turn([[0, 0], [4, 0], [4.1, 0.4], [3.6, 1.0], [0, 1.0]], blue, 24),
    at(rbox(8, 5, 5, 0.6, blue), 0, 1, -2),
    at(rbox(8, 5, 3, 0.6, blue), 0, 1, 3.4),
    at(rbox(7.6, 2.4, 0.4, 0.1, steel('#8d939c')), 0, 3.4, 0.7),
    at(rbox(7.6, 2.4, 0.4, 0.1, steel('#8d939c')), 0, 3.4, 1.7),
    at(cyl(0.42, 0.42, 6, steel(), 10), 0, 2.6, 4.6, Math.PI / 2, 0, 0),
    at(cyl(0.25, 0.25, 7, chrome(), 8), -3.5, 2.6, 10.8, 0, 0, -Math.PI / 2),
  );
  for (const s of [-1, 1]) g.add(at(cyl(0.5, 0.5, 0.6, chrome(), 10), s * 3.8, 2.6, 10.8, 0, 0, Math.PI / 2));
  return g;
}

/** A cardboard box with a label and tape. */
const box = (w: number, h: number, d: number) => rbox(w, h, d, Math.min(w, h, d) * 0.03, printed(kraft(), { rough: 0.85 }), { rest: FULL });

/** A red jerry can, 15 wide x 21 tall x 8 deep. */
function jerrycan() {
  const red = glaze('#c8102e');
  const g = group(rbox(15, 18, 8, 1.2, red));
  for (const x of [-4, 0, 4]) g.add(at(rbox(1.4, 3.6, 1.6, 0.5, red), x, 17.5, 0));
  g.add(at(rbox(11, 1.4, 1.6, 0.6, red), 0, 20.2, 0));
  g.add(at(cyl(1.4, 1.5, 2.2, satin('#1b1c20'), 14), 5.6, 18, 0, 0, 0, -0.5));
  // The pressed X on each face.
  for (const z of [-4.05, 4.05]) for (const r of [0.75, -0.75]) g.add(at(rbox(0.8, 15, 0.3, 0.2, red), 0, 1.5, z, 0, 0, r));
  return g;
}

/** A spray can, radius 2.2 x 12.5 tall. */
const spray = (c: string) => group(turn([[0, 0], [2.0, 0], [2.2, 0.4], [2.2, 9.4], [1.6, 10.6], [0, 10.7]], glaze(c), 24), at(cyl(1.5, 1.6, 1.8, plastic(c), 16), 0, 10.6, 0), at(cyl(0.4, 0.4, 0.6, plastic('#f4f4f4'), 8), 0, 12.4, 0));

/** A plastic oil bottle, 7 wide x 15 tall x 4 deep. */
const bottle = (c: string) => group(rbox(7, 12, 4, 1.4, plastic(c)), at(cyl(1.2, 1.6, 2, plastic(c), 12), 1.6, 11.8, 0), at(cyl(1.25, 1.25, 1.3, plastic('#1b1c20'), 12), 1.6, 13.6, 0));

/** A jar of screws, radius 3 x 8. */
const jar = () => group(turn([[0, 0], [2.7, 0], [3.0, 0.4], [3.0, 6.4], [2.4, 7.0], [2.4, 7.2]], glaze('#7a4a1c'), 24), at(cyl(2.6, 2.6, 1.3, steel('#c0a060'), 20), 0, 7.0, 0));

let fillCount = 0;

/** Things on a shelf from x0 to x1: tins, boxes, cans, jars. `scale` takes kart-scale things to the shelf's size. */
function stock(g: THREE.Group, x0: number, x1: number, y: number, depth: number, maxH: number, scale: number, seed: number) {
  const r = rand(seed);
  let x = x0 + 1 * scale;
  while (x < x1) {
    const kind = Math.floor(r() * 6);
    const z = (r() - 0.5) * depth * 0.25;
    let o: THREE.Object3D;
    let w: number;
    if (kind <= 1) {
      w = 9 * scale;
      // Three label colours only: each one is a texture and a draw call.
      o = scaled(tin(TIN_COLORS[Math.floor(r() * 3)], 28, false), scale);
      o.rotation.y = r() * 6;
    } else if (kind === 2) {
      w = (10 + r() * 10) * scale;
      const h = Math.min(maxH, (8 + r() * 14) * scale);
      o = box(w, h, Math.min(depth * 0.85, (12 + r() * 10) * scale));
      o.rotation.y = (r() - 0.5) * 0.12;
    } else if (kind === 3) {
      w = 4.5 * scale;
      o = scaled(spray(PAINTS[Math.floor(r() * PAINTS.length)]), scale);
    } else if (kind === 4) {
      w = 7 * scale;
      o = scaled(bottle(['#2a9d8f', '#ffd23f', '#3d9bff', '#e63946'][Math.floor(r() * 4)]), scale);
    } else {
      w = 6 * scale;
      o = scaled(jar(), scale);
    }
    if (x + w > x1) break;
    g.add(at(o, x + w / 2, y, z));
    x += w + (0.6 + r() * 2.4) * scale;
  }
}

// ---------------------------------------------------------------- the track's props

export const garage: Record<string, Builder> = {
  /** Toolbox, 26 wide x 14 deep x 16.7 tall to the handle: red enamel, chrome latches and handle. */
  toolbox: () => {
    const red = glaze('#c8102e');
    const g = group(
      rbox(26, 9.4, 14, 0.7, red),
      at(rbox(26.1, 0.5, 13.6, 0.2, satin('#2a2a30')), 0, 9.25, 0),
      at(rbox(26, 3.6, 14, 0.8, red), 0, 9.6, 0),
      at(rbox(24, 0.3, 0.3, 0.1, satin('#7a0a18')), 0, 4.8, 7.0),
      at(rbox(8, 2, 0.24, 0.15, printed(badge(), { rough: 0.4 }), { pz: FULL, rest: DOT }), -6, 2.1, 7.0),
    );
    for (const x of [-8.5, 8.5]) g.add(at(rbox(2.4, 3.4, 0.6, 0.25, chrome()), x, 7.8, 7.1), at(cyl(0.35, 0.35, 2.2, chrome(), 8), x, 10.2, 7.15, 0, 0, Math.PI / 2));
    for (const x of [-7, 7]) g.add(at(rbox(2.6, 0.9, 3.2, 0.3, chrome()), x, 13.1, 0));
    g.add(sweep([v3(-7, 13.6, 0), v3(-7, 15.6, 0), v3(-5.6, 16.3, 0), v3(5.6, 16.3, 0), v3(7, 15.6, 0), v3(7, 13.6, 0)], 0.42, chrome(), 40, 8));
    g.add(sweep([v3(-4.6, 16.3, 0), v3(4.6, 16.3, 0)], 0.75, rubber('#1b1c20'), 4, 12));
    return g;
  },

  /** A stack of `v` tyres (default 1), each radius 6.5 x 4.2 tall, slightly askew. */
  tire: (v) => {
    const g = new THREE.Group();
    const n = typeof v === 'number' ? v : 1;
    for (let i = 0; i < n; i++) g.add(at(tyre(), (i % 2) * 0.25 - 0.12, i * 4.2, ((i * 7) % 3) * 0.15 - 0.15, 0, i * 1.3, 0));
    return g;
  },

  /** Paint tin in colour `v`, radius 4.5 x 9 tall (the bail reaches 11.8). */
  paint: (v) => tin(typeof v === 'string' ? v : '#3d9bff'),

  /** Oil drum in colour `v`, radius 6 x 18 tall: rolling hoops, two bungs, a hazard sticker. */
  drum: (v) => {
    const c = typeof v === 'string' ? v : '#2a9d8f';
    const g = group(
      turn([[0, 0.3], [5.4, 0.3], [5.6, 0.05], [5.95, 0.1], [6.0, 0.5], [5.9, 0.75], [5.82, 0.9], [5.82, 5.5], [5.98, 5.8], [6.0, 6.1], [5.98, 6.4], [5.82, 6.7], [5.82, 11.3], [5.98, 11.6], [6.0, 11.9], [5.98, 12.2], [5.82, 12.5], [5.82, 17.1], [5.9, 17.25], [6.0, 17.5], [5.95, 17.9], [5.6, 17.95], [5.4, 17.7], [0, 17.7]], glaze(c), 48),
      at(mesh(new THREE.CylinderGeometry(5.86, 5.86, 4.2, 20, 1, true, -0.75, 1.5), printed(drumLabel(), { rough: 0.6 })), 0, 9.0, 0),
    );
    g.add(at(turn([[0, 0], [1.1, 0], [1.1, 0.35], [0.8, 0.5], [0, 0.5]], steel(), 16), 3.4, 17.7, 0));
    g.add(at(turn([[0, 0], [0.7, 0], [0.7, 0.3], [0.5, 0.42], [0, 0.42]], steel(), 12), -3.2, 17.7, 1.6));
    return g;
  },

  /** Traffic cone, 9.2 tall on a 5.2 square rubber base; its reflective bands glow faintly at night. */
  cone: () => {
    const r = (y: number) => 2.05 - (y - 0.7) * (1.6 / 8.3);
    const part = (y0: number, y1: number, m: THREE.Material, e = 0) => turn([[r(y0) + e, y0], [r(y1) + e, y1]], m, 32);
    const orange = glaze('#ff5f0f');
    const band = glow('#e8eef5', 0.22);
    return group(
      rbox(5.2, 0.7, 5.2, 0.7, rubber('#1d1d22')),
      turn([[2.45, 0.7], [2.3, 0.95], [r(0.95), 0.95]], orange, 32),
      part(0.95, 2.9, orange),
      part(2.9, 4.5, band, 0.02),
      part(4.5, 5.6, orange),
      part(5.6, 6.8, band, 0.02),
      turn([[r(6.8), 6.8], [r(9.0), 9.0], [0.3, 9.15], [0, 9.18]], orange, 32),
    );
  },

  /** A giant AA battery, radius 2.6 x 14 tall to the tip of its terminal. */
  battery: () =>
    group(
      turn([[0, 0], [2.3, 0], [2.55, 0.15], [2.6, 0.45]], steel(), 32),
      at(mesh(new THREE.CylinderGeometry(2.6, 2.6, 11.95, 40, 1, true), printed(batteryLabel(), { rough: 0.3, clearcoat: 1 })), 0, 6.425, 0),
      turn([[2.6, 12.4], [2.55, 12.75], [2.3, 12.9], [1.0, 12.95]], steel('#d8dce2'), 32),
      turn([[1.0, 12.95], [0.95, 13.0], [0.9, 13.75], [0.75, 13.95], [0, 13.98]], chrome(), 24),
    ),

  /** Slatted wooden crate, 16 x 16 x 14 tall with a lid, stencilled. */
  crate: () => {
    const wood = printed(crateWood(), { rough: 0.85 });
    const r = rand(77);
    const slat = (w: number, h: number, d: number) => {
      const o = r() * 0.5;
      return rbox(w, h, d, 0.2, wood, { rest: [o, 0, o + 0.5, 1] });
    };
    const g = group(at(rbox(14.2, 12.8, 14.2, 0.2, matte('#2b1f14')), 0, 0.4, 0));
    for (const [x, z] of [[-6.6, -6.6], [6.6, -6.6], [-6.6, 6.6], [6.6, 6.6]]) g.add(at(slat(2.4, 13.4, 2.4), x, 0, z));
    for (const y of [0.4, 5.0, 9.6]) {
      for (const s of [-1, 1]) {
        g.add(at(slat(16, 3.4, 0.8), 0, y, s * 7.6));
        g.add(at(group(slat(14.4, 3.4, 0.8)), s * 7.6, y, 0, 0, Math.PI / 2, 0));
      }
    }
    for (const z of [-6, -2, 2, 6]) g.add(at(slat(16, 0.8, 3.6), 0, 13.2, z));
    const sten = (s: string) => mesh(new THREE.PlaneGeometry(11, 2.1), printed(stencil(s), { rough: 0.85, alphaTest: 0.5 }), false);
    g.add(at(sten('FRAGILE'), 0, 6.7, 8.02));
    g.add(at(sten('TOOLS'), 8.02, 2.1, 0, 0, Math.PI / 2, 0));
    return g;
  },

  /** Combination spanner lying flat, 33 long along z. */
  wrench: () => spanner(),

  /** Screwdriver lying flat along z, 26 long. */
  screwdriver: () => driver(),

  /**
   * Shelving unit, 90 wide x 93 tall x 30 deep: steel angle uprights and timber shelves stocked with tins,
   * boxes, cans and jars. `v` (a number) picks the stock; otherwise each unit gets its own.
   */
  shelf: (v) => {
    const seed = typeof v === 'number' ? v : ++fillCount;
    const wood = printed(crateWood(), { rough: 0.8 });
    const frame = satin('#56636e');
    const g = new THREE.Group();
    for (const y of [2, 32, 62, 91]) g.add(at(rbox(88, 2, 29, 0.3, wood, { rest: [0, 0, 1, 1] }), 0, y, 0));
    for (const [x, z] of [[-44.5, -14.5], [44.5, -14.5], [-44.5, 14.5], [44.5, 14.5]]) {
      g.add(at(rbox(1, 93, 3, 0.2, frame), x, 0, z - Math.sign(z) * 1.0));
      g.add(at(rbox(3, 93, 1, 0.2, frame), x - Math.sign(x) * 1.0, 0, z));
      for (const y of [2, 32, 62, 91]) g.add(at(cyl(0.45, 0.45, 0.4, steel(), 6), x - Math.sign(x) * 1.3, y + 1, z + Math.sign(z) * 0.55, Math.PI / 2, 0, 0));
    }
    // Cross braces across the back.
    for (const s of [-1, 1]) g.add(sweep([v3(-43 * s, 4, -15.2), v3(43 * s, 90, -15.2)], 0.3, frame, 2, 6));
    [4, 34, 64].forEach((y, i) => stock(g, -42, 42, y, 26, 25, 1.15, seed * 13 + i));
    stock(g, -42, 42, 93, 26, 18, 1, seed * 13 + 9);
    return g;
  },

  /** Workbench at kart scale, 92 wide x 38 tall x 30 deep: butcher-block top, vice, tools, a low shelf. */
  bench: () => {
    const frame = satin('#3a3f51');
    const wood = printed(benchWood(), { rough: 0.7 });
    const g = group(at(rbox(92, 4, 30, 0.6, wood, { py: FULL, rest: [0, 0, 1, 0.12] }), 0, 34, 0));
    for (const [x, z] of [[-43, -13], [43, -13], [-43, 13], [43, 13]]) g.add(at(rbox(3, 34, 3, 0.4, frame), x, 0, z));
    for (const z of [-13, 13]) g.add(at(rbox(86, 3, 1.6, 0.3, frame), 0, 30.5, z), at(rbox(86, 2, 2, 0.3, frame), 0, 6, z));
    for (const x of [-43, 43]) g.add(at(rbox(1.6, 3, 24, 0.3, frame), x, 30.5, 0), at(rbox(2, 2, 24, 0.3, frame), x, 6, 0));
    const slats = printed(crateWood(), { rough: 0.85 });
    for (const z of [-9, 0, 9]) g.add(at(rbox(84, 1.2, 8, 0.2, slats, { rest: FULL }), 0, 8, z));
    g.add(at(vice(), 36, 38, 9));
    g.add(at(group(hammer()), -14, 39.4, 4, -Math.PI / 2, 0, 1.0));
    g.add(at(scaled(spanner(), 0.55), 4, 38, -3, 0, 0.5, 0));
    g.add(at(scaled(driver('#e63946'), 0.6), 18, 38, -8, 0, -1.2, 0));
    g.add(at(scaled(tin('#ffd23f', 32), 0.55), -36, 38, -8));
    // A tape measure and a scatter of screws.
    g.add(at(rbox(4, 4.2, 1.8, 0.8, plastic('#ffd23f')), -26, 38, 6, Math.PI / 2, 0, 0.3), at(rbox(1.2, 0.2, 2, 0.05, steel()), -24, 38, 8.2, 0, 0.3, 0));
    const r = rand(9);
    for (let i = 0; i < 9; i++) g.add(at(cyl(0.25, 0.25, 1.6, steel(), 6), 18 + r() * 12, 38.3, 4 + r() * 6, Math.PI / 2, r() * 6, 0));
    // Under the bench.
    g.add(at(box(16, 10, 14), -25, 8.6, -2, 0, 0.1, 0), at(scaled(tin('#e63946', 32), 0.85), 22, 8.6, 2));
    return g;
  },

  // ---------------------------------------------------------------- room dressing (room scale)

  /**
   * Steel shelving, 200 wide x 360 tall x 70 deep: slotted uprights, five steel shelves loaded with paint
   * tins, boxes, spray cans, a jerry can and a spare tyre on the bottom shelf. Front faces +z.
   */
  metalshelf: (v) => {
    const seed = typeof v === 'number' ? v : ++fillCount;
    const paint = satin('#6f7a86');
    const g = new THREE.Group();
    for (const [x, z] of [[-97.5, -32.5], [97.5, -32.5], [-97.5, 32.5], [97.5, 32.5]]) {
      g.add(at(rbox(1, 360, 6, 0.3, paint), x, 0, z - Math.sign(z) * 2.5));
      g.add(at(rbox(6, 360, 1, 0.3, paint), x - Math.sign(x) * 2.5, 0, z));
      g.add(at(rbox(7, 1.5, 7, 0.4, rubber('#1b1c20')), x - Math.sign(x) * 2.5, 0, z - Math.sign(z) * 2.5));
    }
    const levels = [12, 96, 180, 264, 348];
    for (const y of levels) {
      g.add(at(rbox(194, 1.5, 68, 0.5, satin('#86919e')), 0, y - 1.5, 0));
      for (const z of [-34, 34]) g.add(at(rbox(194, 5, 1.2, 0.4, paint), 0, y - 5, z));
    }
    g.add(at(scaled(tyre(48), 7), -48, 12, 6, 0, 0.6, 0));
    g.add(at(scaled(jerrycan(), 2.4), 50, 12, 8, 0, -0.25, 0));
    stock(g, -92, 92, 96, 64, 70, 3.6, seed * 7 + 1);
    stock(g, -92, 92, 180, 64, 70, 3.2, seed * 7 + 2);
    stock(g, -92, 92, 264, 64, 70, 3.8, seed * 7 + 3);
    stock(g, -92, 40, 348, 64, 60, 3, seed * 7 + 4);
    return g;
  },

  /**
   * Workbench, 300 wide x 180 tall x 120 deep: butcher-block top, a drawer chest under the right end, a low
   * shelf, and on top a vice, a toolbox, a clamp lamp that glows and hand tools. Front faces +z.
   */
  workbench: () => {
    const frame = satin('#3a3f51');
    const g = group(at(rbox(300, 12, 120, 2, printed(benchWood(), { rough: 0.7 }), { py: FULL, rest: [0, 0, 1, 0.12] }), 0, 168, 0));
    for (const [x, z] of [[-144, -54], [144, -54], [-144, 54], [144, 54]]) g.add(at(rbox(8, 168, 8, 1.2, frame), x, 0, z));
    for (const z of [-54, 54]) g.add(at(rbox(284, 10, 5, 1, frame), 0, 156, z), at(rbox(284, 6, 5, 1, frame), 0, 24, z));
    for (const x of [-144, 144]) g.add(at(rbox(5, 10, 104, 1, frame), x, 156, 0), at(rbox(5, 6, 104, 1, frame), x, 24, 0));
    g.add(at(rbox(280, 2, 106, 0.6, satin('#56636e')), 0, 30, 0));
    // A chest of drawers under the right end.
    const red = glaze('#c8102e');
    g.add(at(rbox(84, 122, 100, 2, red), 92, 32, 0));
    for (let i = 0; i < 4; i++) {
      const y = 36 + i * 29.5;
      g.add(at(rbox(78, 26, 1.5, 1.5, red), 92, y, 50.4));
      g.add(at(rbox(40, 2.4, 3, 1, chrome()), 92, y + 19, 52.4));
    }
    // On the low shelf: a tyre and boxes.
    g.add(at(scaled(tyre(48), 6.4), -90, 32, 6, 0, 0.4, 0));
    g.add(at(box(50, 40, 60), 10, 32, -10, 0, 0.15, 0), at(box(36, 28, 40), 8, 72, -12, 0, -0.2, 0));
    // On top.
    const top = 180;
    g.add(at(scaled(vice(), 3.2), -118, top, 32));
    g.add(at(scaled(garage.toolbox(), 3.4), 60, top, -24, 0, -0.08, 0));
    g.add(at(scaled(group(hammer()), 3.2), -40, top + 4.5, 30, -Math.PI / 2, 0, 1.2));
    g.add(at(scaled(spanner(), 1.6), 10, top, 34, 0, 1.2, 0));
    g.add(at(scaled(driver('#2a9d8f'), 1.6), -60, top, 10, 0, -0.9, 0));
    g.add(at(scaled(tin('#3d9bff', 40), 3.2), 130, top, 30));
    // A clamp lamp on the back edge, bent over the work.
    const lampMat = glaze('#2b2d42');
    g.add(at(rbox(14, 10, 14, 2, lampMat), -120, top, -50));
    g.add(sweep([v3(-120, top + 9, -50), v3(-118, top + 70, -48), v3(-100, top + 110, -30), v3(-80, top + 112, -10)], 2, steel(), 24, 8));
    const shade = group(turn([[0, 0], [3, 0], [5, 4], [14, 18], [14.6, 19], [13.6, 19], [4.4, 5], [0, 4]], lampMat, 32), at(scaled(cyl(5, 5, 1, glow('#fff1c8', 2.2), 20), 1, 1, 1), 0, 14, 0));
    g.add(at(shade, -78, top + 116, -6, Math.PI * 0.8, 0, 0.1));
    return g;
  },

  /**
   * Pegboard, 240 wide x 160 tall, for a wall: its back is on z = 0, origin at the bottom centre. Tools hang
   * from hooks in front of their painted outlines: hammer, three spanners, three screwdrivers, a saw.
   */
  pegboard: () => {
    const tools = new THREE.Group();
    const add = (o: THREE.Object3D, x: number, y: number) => {
      const holder = group(o);
      holder.position.set(x, y, 5);
      tools.add(holder);
      return holder;
    };
    add(scaled(group(hammer()), 4), -92, 70);
    [1.1, 1.4, 1.7].forEach((s, i) => add(at(scaled(spanner(steel('#cfd4da')), s), 0, 0, 0, Math.PI / 2, 0, 0), -44 + i * 22, 100));
    ['#ffc61a', '#e63946', '#2a9d8f'].forEach((c, i) => add(at(scaled(driver(c), 1.5), 0, 0, 0, Math.PI / 2, 0, 0), 30 + i * 14, 112));
    add(saw(), 72, 44);
    // A coiled extension lead on its own hook.
    const coil = new THREE.Group();
    for (let i = 0; i < 4; i++) coil.add(at(torus(15 - i * 0.6, 1.5, plastic('#ff7a1a'), Math.PI * 2, 40), i * 0.5, -i * 1.4, i * 0.9));
    add(coil, 82, 112);
    // Outlines painted behind each tool, from where it actually hangs.
    tools.updateMatrixWorld(true);
    const outlines = tools.children.map((t) => {
      const b = new THREE.Box3().setFromObject(t);
      return [(b.min.x + 120) * (PEG_W / 240), (160 - b.max.y) * (PEG_H / 160), (b.max.x - b.min.x) * (PEG_W / 240), (b.max.y - b.min.y) * (PEG_H / 160)] as [number, number, number, number];
    });
    const g = group(at(rbox(240, 160, 2, 0.5, printed(pegboard(outlines), { rough: 0.85 }), { pz: FULL, rest: [0, 0, 0.02, 0.02] }), 0, 0, 3));
    const batten = satin('#8a6a48');
    for (const y of [4, 152]) g.add(at(rbox(232, 4, 2, 0.4, batten), 0, y, 1));
    // Hooks: a wire out of the board and turned up.
    for (const t of tools.children) {
      const b = new THREE.Box3().setFromObject(t);
      const x = (b.min.x + b.max.x) / 2;
      const y = b.max.y + 1;
      g.add(sweep([v3(x, y + 2, 4), v3(x, y, 6), v3(x, y, 10), v3(x, y + 3, 11)], 0.45, chrome(), 10, 6));
    }
    g.add(tools);
    return g;
  },

  /**
   * The front end of a parked car, 340 wide (wheels to 345) x 247 tall x 305 deep, nose towards +z, cut off
   * square at z = -150 for parking against a wall. Glossy paint in colour `v`; headlights glow faintly.
   */
  carfront: (v) => {
    const paint = glaze(typeof v === 'string' ? v : '#c1121f');
    const dark = glaze('#121821');
    const black = satin('#1b1c20');
    const s = new THREE.Shape();
    s.moveTo(-150, 18);
    s.lineTo(14, 18);
    s.absarc(70, 48, 58, Math.PI + Math.asin(30 / 58), -Math.asin(30 / 58), true);
    s.lineTo(138, 18);
    s.lineTo(150, 26);
    s.lineTo(154, 40);
    s.lineTo(155, 70);
    s.lineTo(150, 80);
    s.lineTo(145, 104);
    s.quadraticCurveTo(142, 118, 128, 122);
    s.lineTo(20, 140);
    s.lineTo(5, 142);
    s.lineTo(-85, 232);
    s.quadraticCurveTo(-95, 241, -110, 242);
    s.lineTo(-150, 243);
    s.closePath();
    const body = extrude(s, 340, 6, paint, { curve: 20, bevelSegs: 4 });
    body.rotation.y = -Math.PI / 2;
    body.position.x = 170;
    const g = group(body);
    // Wheel wells, so you cannot see through under the car, and the wheels.
    g.add(at(rbox(300, 84, 112, 2, matte('#0b0b0d')), 0, 14, 70));
    for (const sx of [-1, 1]) g.add(at(scaled(tyre(64), 7.4), sx * 136, 48, 70, 0, 0, -sx * Math.PI / 2));
    // Glass: windscreen and side windows.
    // On the bevelled surface, which stands 6 proud of the profile.
    g.add(at(rbox(296, 128, 1.2, 4, dark), 0, 146.6, 9.7, -0.7695, 0, 0));
    for (const sx of [-1, 1]) {
      const w = new THREE.Shape();
      w.moveTo(-2, 150);
      w.lineTo(-80, 228);
      w.lineTo(-150, 234);
      w.lineTo(-150, 150);
      w.closePath();
      const win = extrude(w, 1, 0.3, dark);
      win.rotation.y = -Math.PI / 2;
      win.position.x = sx > 0 ? 171.2 : -170.2;
      g.add(win);
      // Mirror on a stalk at the base of the windscreen.
      g.add(at(rbox(14, 12, 6, 2.5, paint), sx * 184, 152, -6), at(rbox(8, 3, 3, 1, black), sx * 177, 156, -6));
    }
    // Grille, badge, headlights, indicators, bumper and plate.
    g.add(at(rbox(140, 30, 4, 3, chrome()), 0, 77, 151.5, -0.2, 0, 0));
    g.add(at(rbox(132, 24, 4, 2, black), 0, 80, 153, -0.2, 0, 0));
    for (let i = 0; i < 4; i++) g.add(at(rbox(128, 1.4, 2, 0.6, chrome()), 0, 83 + i * 5, 155.2 - i, -0.2, 0, 0));
    g.add(at(scaled(cyl(5, 5, 1.5, chrome(), 20), 1.4, 1, 1), 0, 90, 155.5, Math.PI / 2 - 0.2, 0, 0));
    for (const sx of [-1, 1]) {
      g.add(at(rbox(50, 20, 4, 6, chrome()), sx * 112, 88, 151, -0.2, 0, 0));
      g.add(at(rbox(44, 15, 4, 5, glow('#fff3d6', 0.4)), sx * 112, 90.5, 152.5, -0.2, 0, 0));
      g.add(at(rbox(12, 9, 4, 3, glow('#ffa61a', 0.3)), sx * 150, 90, 148, -0.2, sx * 0.5, 0));
      g.add(at(cyl(5, 5, 2, glow('#fff8e8', 0.25), 16), sx * 118, 34, 159.5, Math.PI / 2, 0, 0));
    }
    g.add(at(rbox(338, 12, 16, 3, black), 0, 14, 152));
    // Side skirts, door shut lines and handles.
    for (const sx of [-1, 1]) {
      g.add(at(rbox(4, 8, 140, 2, black), sx * 171, 14, -84));
      g.add(at(rbox(2, 104, 1.4, 0.5, black), sx * 170.6, 34, -6, 0, 0, 0));
      g.add(at(rbox(2, 1.4, 150, 0.5, black), sx * 170.6, 138, -80));
      g.add(at(rbox(3, 5, 22, 2, chrome()), sx * 171, 118, -40));
    }
    g.add(at(rbox(104, 23, 1, 1, printed(plate(), { rough: 0.4 }), { pz: FULL, rest: DOT }), 0, 44, 161.2));
    // Wipers parked at the bottom of the windscreen.
    for (const x0 of [-120, 5]) g.add(sweep([v3(x0, 146, 10), v3(x0 + 105, 148, 8)], 0.9, black, 2, 6));
    return g;
  },

  /**
   * A twin fluorescent strip light, 240 long x 14 wide: origin at the top centre of its housing, which
   * hangs below y = 0 on two wires that rise 40 to the ceiling. The tubes glow.
   */
  striplight: () => {
    const g = group(at(rbox(240, 5, 14, 1.5, satin('#e9ebef')), 0, -5, 0));
    for (const z of [-3.5, 3.5]) g.add(at(cyl(1.6, 1.6, 228, glow('#f2f7ff', 3), 12), 114, -7, z, 0, 0, Math.PI / 2));
    for (const x of [-116, 116]) g.add(at(rbox(4, 6, 12, 1, satin('#d5d8de')), x, -10, 0));
    for (const x of [-90, 90]) g.add(at(cyl(0.3, 0.3, 40, steel(), 6), x, 0, 0));
    return g;
  },
};

/** A handsaw hanging flat against the board, 76 long: steel blade, wooden grip. */
function saw() {
  const blade = new THREE.Shape();
  blade.moveTo(0, -9);
  blade.lineTo(56, -6);
  blade.lineTo(56, -1);
  blade.lineTo(0, 5);
  blade.closePath();
  const grip = new THREE.Shape();
  grip.moveTo(-2, -10);
  grip.lineTo(-20, -12);
  grip.quadraticCurveTo(-24, -2, -18, 8);
  grip.lineTo(-2, 7);
  grip.closePath();
  grip.holes.push(new THREE.Path().absellipse(-11, -1.5, 4.5, 4, 0, Math.PI * 2, true, 0));
  return group(extrude(blade, 0.4, 0.1, steel('#c7ccd3')), at(extrude(grip, 2.6, 0.8, satin('#a5683a')), 0, 0, -1.1));
}

/**
 * The desk and the study around it. Kart-scale props stand on y = 0 at their origin and fill the footprint
 * in packages/game/src/track/props.ts. Room pieces are at about 0.5 cm a unit; freestanding ones stand
 * centred with their front to +z, wall-mounted ones have their back on z = 0 and their origin at the
 * bottom centre of the back.
 */
import * as THREE from 'three';
import { at, group } from './kit';
import { BRASS, type BoxFaces, type Builder, boxUV, chrome, extrude, glaze, glow, matte, mesh, plastic, printed, rbox, rubber, satin, steel, std, sweep, turn, v3 } from './propKit';
import {
  bookCells, BOOKS, bookSheet, calcFace, cork, eraserSleeve, furnitureWood, globeMap, keyCaps, keyCell, KEYS, laptopDeck, laptopScreen, notePage, PAGES, pinSheet, PINS, rulerFace, snakeLeaf, soil, STICKY_EDGE, STICKY_TOP, stickySheet,
} from './propDeskTex';
import { rand } from './propTextures';

/** A plain box standing on y = 0, its faces mapped onto one texture: for things seen from afar. */
function pbox(w: number, h: number, d: number, m: THREE.Material, faces: BoxFaces) {
  const g = new THREE.BoxGeometry(w, h, d);
  boxUV(g, w, h, d, faces);
  g.translate(0, h / 2, 0);
  return mesh(g, m);
}

/** A rod between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, segs = 10) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, segs);
  const o = mesh(g, m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}

const books = () => printed(bookSheet(), { rough: 0.72 });

/**
 * A hardcover lying flat: length L along x, thickness T up, depth D along z, spine on the -z side.
 * Boards overhang the page block; everything is on the books sheet, so every book is one draw call.
 */
function book(L: number, T: number, D: number, design: number) {
  const m = books();
  const c = bookCells(design);
  const b = 0.3;
  return group(
    rbox(L, b, D, 0.12, m, { rest: c.board }),
    at(rbox(L, b, D, 0.12, m, { py: c.cover, rest: c.board }), 0, T - b, 0),
    at(rbox(L, T, 0.8, 0.36, m, { nz: c.spine, rest: c.board }), 0, 0, -D / 2 + 0.4),
    at(pbox(L - 0.7, T - 2 * b + 0.04, D - 0.7, m, { rest: PAGES }), 0, b - 0.02, 0.05),
  );
}

/** A book as one box, for shelves seen from across the room: spine, cover and page edges mapped. */
function farBook(L: number, T: number, D: number, design: number) {
  const c = bookCells(design);
  return pbox(L, T, D, books(), { nz: c.spine, py: c.cover, ny: c.board, rest: PAGES });
}

/** A hexagonal pencil along +y from 0, sharpened at the top: lacquered body, wood cone, ferrule, eraser. */
function pencil(len: number, r: number, color: string) {
  const tip = r * 4.2;
  const hex = (rt: number, rb: number, h: number) => new THREE.CylinderGeometry(rt, rb, h, 6, 1, false, Math.PI / 6).translate(0, h / 2, 0);
  const g = group(
    mesh(hex(r, r, len), glaze(color)),
    at(mesh(hex(r * 0.28, r, tip), matte('#e9c48f')), 0, len, 0),
    at(mesh(new THREE.ConeGeometry(r * 0.28, r * 1.15, 8).translate(0, r * 0.575, 0), satin('#2e2e33')), 0, len + tip - 0.02, 0),
    at(turn([[r * 1.02, 0], [r * 1.06, r * 0.4], [r * 1.0, r * 0.6], [r * 1.06, r * 0.9], [r * 1.0, r * 1.1], [r * 1.06, r * 1.4], [r * 1.02, r * 1.8]], steel(BRASS), 12), 0, -r * 1.7, 0),
    at(turn([[0, 0], [r * 0.8, 0.05], [r, r * 0.5], [r, r * 2]], std('#f28ca8', 'rubber'), 12, 8), 0, -r * 3.6, 0),
  );
  return g;
}

/** Snake plant in a terracotta pot: pot radius 7, about 27 tall. */
function plant() {
  const g = group(
    turn([[0, 0], [5.0, 0], [5.3, 0.3], [6.1, 7.2], [6.9, 7.3], [7.0, 7.6], [7.0, 9.6], [6.8, 9.85], [6.4, 9.75], [6.25, 9.2], [5.9, 8.4], [0, 8.4]], matte('#c4693f'), 40),
    at(mesh(new THREE.CircleGeometry(5.95, 32).rotateX(-Math.PI / 2), printed(soil(), { rough: 1 })), 0, 8.45, 0),
  );
  const leafMat = printed(snakeLeaf(), { rough: 0.42, clearcoat: 0.5 });
  const r = rand(91);
  for (let i = 0; i < 9; i++) {
    const H = 12 + r() * 8;
    const s = new THREE.Shape();
    const side: [number, number][] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      side.push([1.5 * Math.sin(Math.PI * (0.22 + 0.78 * t)) * (0.85 + 0.15 * (1 - t)), t * H]);
    }
    s.moveTo(-side[0][0], 0);
    for (const [x, y] of side.slice(1)) s.lineTo(-x, y);
    for (const [x, y] of side.slice(0, -1).reverse()) s.lineTo(x, y);
    const leaf = extrude(s, 0.3, 0, leafMat, { uvScale: 0.08 });
    leaf.geometry.translate(0, 0, -0.15);
    // Bend outwards as it rises, with a little twist.
    const pos = leaf.geometry.attributes.position;
    const bend = 0.6 + r() * 1.8;
    const twist = (r() - 0.5) * 0.8;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k) / H;
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const a = twist * y;
      pos.setXYZ(k, x * Math.cos(a) - z * Math.sin(a), pos.getY(k), x * Math.sin(a) + z * Math.cos(a) + bend * y * y * 3);
    }
    leaf.geometry.computeVertexNormals();
    const a = (i / 9) * Math.PI * 2 + r() * 0.5;
    const rr = i < 3 ? 0.6 : 2.4;
    g.add(at(leaf, Math.cos(a) * rr, 8, Math.sin(a) * rr, 0, -a + Math.PI / 2, 0));
    leaf.rotation.order = 'YXZ';
    leaf.rotation.x = 0.08 + r() * 0.12;
  }
  return g;
}

/** The snake plant, larger, for a shelf. */
function scaledPlant() {
  const p = plant();
  p.scale.setScalar(1.3);
  return p;
}

/** A gold cup on a plinth, about 26 tall. */
function trophy() {
  const gold = chrome('#e3bb55');
  const g = group(rbox(13, 5, 13, 0.6, glaze('#2b2018')), at(turn([[0, 0], [5, 0], [5, 1], [3.8, 1.6], [1.3, 2.6], [1, 8], [2.2, 9.2], [5.6, 12], [6.8, 18.8], [6.5, 19.1], [5.8, 13], [0, 11]], gold, 32, 0), 0, 5, 0));
  for (const s of [-1, 1]) g.add(sweep([v3(s * 5.8, 21, 0), v3(s * 9, 21, 0), v3(s * 8.4, 16.5, 0), v3(s * 5, 15, 0)], 0.45, gold, 20, 8));
  return g;
}

export const desk: Record<string, Builder> = {
  /** A stack of `v` hardcovers (default 3), each about 26 x 3.4 x 19, inside 28 x 20. */
  books: (v) => {
    const n = typeof v === 'number' ? v : 3;
    const r = rand(n * 7 + 3);
    const g = new THREE.Group();
    let y = 0;
    for (let i = 0; i < n; i++) {
      const L = 25 + r() * 2;
      const D = 17.6 + r() * 2;
      const T = 2.6 + r() * 1.7;
      const b = book(L, T, D, (i * 3 + n) % BOOKS.length);
      g.add(at(b, (r() - 0.5) * 0.8, y, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.08 + (r() > 0.6 ? Math.PI : 0), 0));
      y += T;
    }
    return g;
  },

  /** Glazed pen pot, radius 5 and 11 tall, holding pencils, a pen and scissors (about 18 tall). */
  pencilcup: () => {
    const teal = glaze('#2a9d8f');
    const g = group(
      turn([[0, 0.1], [4.2, 0], [4.55, 0.25], [4.65, 1], [5.0, 10.5], [4.92, 10.95], [4.62, 11.02], [4.45, 10.6], [4.15, 1.4], [0, 1.2]], teal, 40),
      at(turn([[4.88, 0], [4.98, 0.2], [5.0, 1.1], [4.9, 1.3]], glaze('#f2e9d8'), 40), 0, 8.4, 0),
    );
    const colors = ['#ffcc00', '#ef476f', '#3d9bff', '#06d6a0'];
    colors.forEach((c, i) => {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      g.add(at(pencil(14 + i, 0.55, c), Math.cos(a) * 2.2, 1.4, Math.sin(a) * 2.2, Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18));
    });
    // A ballpoint pen with its cap and clip.
    const pen = group(
      turn([[0, 0], [0.3, 0.2], [0.5, 1.2], [0.5, 12], [0, 12.2]], plastic('#f4f4f6'), 12),
      at(turn([[0, 0], [0.56, 0], [0.56, 4.4], [0.3, 4.9], [0, 5]], plastic('#1f4fbf'), 12), 0, 11, 0),
      at(rbox(0.3, 3.6, 0.35, 0.1, chrome()), 0, 11.8, 0.62),
    );
    g.add(at(pen, -1.6, 1.4, 1.2, 0.12, 0, 0.16));
    // Scissors, blades down: shanks rising out of the pot to two plastic finger loops.
    const sc = group();
    for (const s of [-1, 1]) {
      sc.add(at(rbox(0.5, 9, 0.25, 0.1, steel()), s * 0.3, 0, 0, 0, 0, -s * 0.06));
      const loop = new THREE.EllipseCurve(0, 0, 1.6, 1.1, 0, Math.PI * 2, false, 0);
      const pts = loop.getPoints(24).map((p) => v3(p.x, p.y, 0));
      sc.add(at(sweep(pts, 0.32, plastic('#e63946'), 30, 8, false), s * 1.5, 10.4, 0, 0, 0, s * 0.5));
    }
    g.add(at(sc, 1.2, 2, -1.6, -0.12, 0.4, 0.1));
    return g;
  },

  /** Anglepoise lamp: base radius 7, head about 32 up, a glowing bulb under the shade. */
  lamp: () => {
    const coral = glaze('#f25f5c');
    const metal = steel('#b9bfc8');
    const hub = (p: THREE.Vector3, r: number) => at(mesh(new THREE.CylinderGeometry(r, r, 2.6, 16).rotateX(Math.PI / 2), chrome()), p.x, p.y, p.z);
    const g = group(turn([[0, 0], [6.6, 0], [7, 0.4], [6.85, 1.3], [5.6, 2.1], [2, 2.5], [1.5, 3.3], [0, 3.4]], coral, 48, 30));
    const P0 = v3(0, 4, 0);
    const P1 = v3(-4.5, 21, 0);
    const P2 = v3(9.5, 28, 0);
    g.add(at(rbox(2.4, 1.6, 2.8, 0.4, coral), 0, 2.8, 0), hub(P0, 0.9), hub(P1, 0.8), hub(P2, 0.8));
    for (const z of [-0.75, 0.75]) {
      g.add(rod(v3(P0.x, P0.y, z), v3(P1.x, P1.y, z), 0.32, metal));
      g.add(rod(v3(P1.x, P1.y, z), v3(P2.x, P2.y, z), 0.32, metal));
    }
    // A spring along each arm.
    const spring = (a: THREE.Vector3, b: THREE.Vector3, turns: number) => {
      const dir = b.clone().sub(a);
      const side = v3(-dir.y, dir.x, 0).normalize().multiplyScalar(1.1);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= turns * 10; i++) {
        const t = i / (turns * 10);
        const ang = t * turns * Math.PI * 2;
        pts.push(a.clone().addScaledVector(dir, t).add(side).add(v3(-dir.y, dir.x, 0).normalize().multiplyScalar(Math.cos(ang) * 0.4)).add(v3(0, 0, Math.sin(ang) * 0.4)));
      }
      return sweep(pts, 0.09, metal, turns * 10, 5, false);
    };
    g.add(spring(v3(-0.6, 7, 0), v3(-3.2, 17, 0), 14), spring(v3(-1.5, 22.5, 0), v3(5.5, 26, 0), 12));
    // The shade: enamel outside, white inside, opening forwards and down.
    const head = group(
      turn([[5.25, -7.9], [5.5, -8.05], [5.55, -7.7], [4.3, -5.5], [2.7, -3.0], [1.9, -1.2], [1.3, 0], [0.9, 0.7], [0, 0.8]], coral, 40),
      turn([[0, 0.2], [1.0, -0.2], [1.6, -1.3], [2.5, -3.0], [4.1, -5.5], [5.05, -7.4], [5.25, -7.9]], matte('#fbf6ea'), 40),
      at(turn([[0.9, 0], [1.1, 0.6], [1.1, 1.6], [0.8, 2.4], [0, 2.5]], chrome(), 20), 0, -3.4, 0),
    );
    head.add(at(mesh(new THREE.SphereGeometry(1.75, 20, 14), glow('#fff3c8', 2.4), false), 0, -4.6, 0));
    g.add(at(head, P2.x + 1.4, P2.y + 0.6, 0, 0, 0, 0.62));
    // The cable trails off behind.
    g.add(sweep([v3(-4.6, 1.3, -2.4), v3(-6.6, 0.5, -3.4), v3(-8, 0.36, -4.2), v3(-11, 0.36, -5), v3(-15, 0.36, -9), v3(-17, 0.36, -15)], 0.36, rubber('#2b2b30'), 30, 8));
    return g;
  },

  /** Computer mouse, 7 x 11 and 2.4 tall, with a scroll wheel and a cable running forwards. */
  mouse: () => {
    const geo = new THREE.SphereGeometry(1, 40, 24);
    const pos = geo.attributes.position;
    const top = (z: number) => Math.sqrt(Math.max(0, 1 - z * z)) * (1.9 - 0.25 * z) + 0.35;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      pos.setXYZ(i, x * 3.1 * (1 - 0.12 * z), (y > 0 ? y * (1.9 - 0.25 * z) : y * 0.35) + 0.35, z * 5.4);
    }
    geo.computeVertexNormals();
    const g = group(mesh(geo, plastic('#eceef3')));
    // The parting line between the buttons, and a scroll wheel through it.
    const line: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const zn = 0.12 + k * 0.1;
      line.push(v3(0, top(zn) + 0.01, zn * 5.4));
    }
    g.add(sweep(line, 0.07, satin('#7a7f8a'), 16, 5));
    g.add(sweep([v3(-2.6, top(0.12) * 0.82, 0.65), v3(0, top(0.12) + 0.02, 0.65), v3(2.6, top(0.12) * 0.82, 0.65)], 0.06, satin('#7a7f8a'), 12, 5));
    g.add(at(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16).rotateZ(Math.PI / 2), rubber('#3a3d45')), 0, top(0.5) - 0.05, 0.5 * 5.4));
    g.add(sweep([v3(0, 0.5, 5.2), v3(0, 0.38, 6.4), v3(1.2, 0.34, 9), v3(0.2, 0.34, 13), v3(-1.6, 0.34, 17)], 0.28, rubber('#d0d4db'), 24, 6));
    return g;
  },

  /** Eraser, 6 x 2.6 x 12 in the variant colour, half in a printed card sleeve. */
  eraser: (v) => {
    const c = typeof v === 'string' ? v : '#ff8fab';
    return group(
      rbox(5.8, 2.5, 11.8, 0.7, std(c, 'rubber')),
      at(rbox(6.0, 2.62, 6.4, 0.18, printed(eraserSleeve(), { rough: 0.55 }), { pz: [0, 0, 0.01, 0.01], nz: [0, 0, 0.01, 0.01], rest: [0, 0, 1, 1] }), 0, -0.02, -2.3),
    );
  },

  /** Desk globe: a turned walnut base (radius 5.6), brass meridian (radius 8.6), the globe's top at 22.6. */
  globe: () => {
    const brass = chrome(BRASS);
    const g = group(turn([[0, 0], [5.3, 0], [5.6, 0.5], [5.4, 1.4], [4.2, 2.0], [2.0, 2.6], [1.2, 3.6], [1.0, 4.4], [0, 4.4]], glaze('#5a3a22'), 40, 30));
    g.add(sweep([v3(0, 4.0, 0), v3(0.2, 5.4, 0), v3(1.6, 6.3, 0), v3(3.31, 6.39, 0)], 0.45, brass, 16, 8));
    const tilt = group(
      mesh(new THREE.SphereGeometry(7.6, 48, 32), printed(globeMap(), { rough: 0.4, clearcoat: 0.6 })),
      at(mesh(new THREE.TorusGeometry(8.3, 0.32, 8, 56, Math.PI).rotateZ(-Math.PI / 2), brass), 0, 0, 0),
      mesh(new THREE.CylinderGeometry(0.25, 0.25, 17.2, 8), brass),
      at(mesh(new THREE.SphereGeometry(0.55, 10, 8), brass), 0, 8.55, 0),
    );
    g.add(at(tilt, 0, 14, 0, 0, 0, 0.41));
    return g;
  },

  /** Snake plant in a terracotta pot, radius 7, about 27 tall. */
  plant,

  /** Calculator, 14 x 20 and 2.2 tall: printed face and display, twenty keys from one sheet. */
  calculator: () => {
    const g = group(rbox(14, 1.6, 20, 0.8, satin('#3a3f51')));
    g.add(at(rbox(12.4, 0.12, 7.75, 0.05, printed(calcFace(), { rough: 0.35 }), { py: [0, 0, 1, 1], rest: [0, 0, 0.01, 0.01] }), 0, 1.58, -5.3));
    const keys = printed(keyCaps(), { rough: 0.45 });
    KEYS.forEach((row, r) =>
      row.forEach((_, c) => {
        const k = keyCell(r, c);
        g.add(at(rbox(2.6, 0.75, 1.75, 0.3, keys, { py: k.top, rest: k.side }), -4.65 + c * 3.1, 1.45, -0.6 + r * 2.15));
      }),
    );
    return g;
  },

  /** A pencil 36 long lying along z, flat side down, in the variant colour. */
  pencil: (v) => at(group(at(pencil(30, 0.9, typeof v === 'string' ? v : '#ffcc00'), 0, 0, -15, Math.PI / 2, 0, 0)), 0, 0.9 * Math.cos(Math.PI / 6), 0),

  /** A 30 cm wooden rule, 6 x 0.6 x 60, along z. */
  ruler: () => at(rbox(60, 0.6, 6, 0.15, printed(rulerFace(), { rough: 0.55 }), { py: [0, 0, 1, 1], rest: [0.97, 0.3, 0.99, 0.4] }), 0, 0, 0, 0, Math.PI / 2, 0),

  /** Spiral-bound notepad, 30 x 40 and 1.2 thick, its top page written on. */
  notepad: () => {
    const g = group(
      rbox(30, 0.4, 40, 0.3, matte('#9c7a55')),
      at(rbox(29.4, 0.8, 38.6, 0.08, printed(notePage(), { rough: 0.85 }), { py: [0, 0, 1, 1], rest: [0.3, 0.05, 0.31, 0.06] }), 0, 0.4, 0.7),
    );
    const wire = steel('#9aa0aa');
    for (let x = 22; x < 768; x += 32) g.add(at(mesh(new THREE.TorusGeometry(1.05, 0.11, 6, 16).rotateY(Math.PI / 2), wire), -14.7 + (x / 768) * 29.4, 0.75, -18.95));
    return g;
  },

  /** Laptop, 64 x 44 base and a lid open to 106 degrees with a glowing screen. */
  laptop: () => {
    const alu = steel('#d5d9df');
    const g = group(
      rbox(64, 2, 44, 1.6, alu, undefined, 3),
      at(rbox(58, 0.06, 40, 0.02, printed(laptopDeck(), { rough: 0.45, metal: 0.4 }), { py: [0, 0, 1, 1], rest: [0, 0, 0.01, 0.01] }), 0, 2, 1),
      at(mesh(new THREE.CylinderGeometry(0.9, 0.9, 50, 16).rotateZ(Math.PI / 2), satin('#2b2f3a')), 0, 2.1, -21.6),
    );
    const lid = group(
      at(rbox(64, 1.2, 44, 1.6, alu, undefined, 3), 0, 0, 22),
      at(rbox(62, 0.06, 42, 0.02, printed(laptopScreen(), { rough: 0.15, emissive: 0.9 }), { ny: [0, 0, 1, 1], rest: [0, 0, 0.01, 0.01] }), 0, -0.05, 22.4),
    );
    g.add(at(lid, 0, 2.2, -22, -1.85, 0, 0));
    return g;
  },

  /** A steel paperclip lying flat, about 4 x 13. */
  paperclip: () => {
    const pts: THREE.Vector3[] = [];
    const line = (x: number, z0: number, z1: number) => {
      for (let k = 0; k <= 6; k++) pts.push(v3(x, 0, z0 + ((z1 - z0) * k) / 6));
    };
    const arc = (cx: number, cz: number, r: number, from: number, to: number, side: number) => {
      for (let k = 1; k < 10; k++) {
        const a = from + ((to - from) * k) / 10;
        pts.push(v3(cx + r * Math.cos(a), 0, cz + side * r * Math.sin(a)));
      }
    };
    line(0.55, 2, -4);
    arc(0, -4, 0.55, 0, Math.PI, -1);
    line(-0.55, -4, 4.5);
    arc(0.5, 4.5, 1.05, Math.PI, 0, 1);
    line(1.55, 4.5, -5);
    arc(0.2, -5, 1.35, 0, Math.PI, -1);
    line(-1.15, -5, 1);
    const clip = sweep(pts, 0.22, chrome('#d9dde3'), 130, 8);
    return at(group(clip), 0, 0.27, 0.3);
  },

  /** A pad of sticky notes, 9 x 9 and 2 tall, the top one written on. */
  stickies: (v) => {
    const c = typeof v === 'string' ? v : '#fff176';
    const m = printed(stickySheet(), { color: c, rough: 0.85 });
    return rbox(9, 2, 9, 0.12, m, { py: STICKY_TOP, rest: STICKY_EDGE });
  },

  /**
   * Bookshelf for the study: 160 wide, 360 tall, 60 deep, five shelves of books standing, leaning and
   * lying in piles, with bookends, a snake plant and a trophy.
   */
  bookshelf: () => {
    const woodH = printed(furnitureWood(false), { rough: 0.6 });
    const woodV = printed(furnitureWood(true), { rough: 0.6 });
    const g = group(
      at(rbox(3, 360, 60, 0.8, woodV), -78.5, 0, 0),
      at(rbox(3, 360, 60, 0.8, woodV), 78.5, 0, 0),
      at(rbox(166, 4, 64, 1.2, woodH), 0, 356, 1),
      at(rbox(154, 10, 56, 0.5, woodH), 0, 0, 1),
      at(rbox(154, 346, 1.2, 0.2, woodV), 0, 10, -29.2),
    );
    const levels = [10, 79, 148, 217, 286];
    for (const y of levels.slice(1)) g.add(at(rbox(154, 3, 58, 0.6, woodH), 0, y - 3, 0));
    const r = rand(77);
    const end = steel('#3a3f51');
    let design = 0;
    /** A book standing on its bottom-left corner at x, leaning left by `lean`, spine out to the front. */
    const stand = (x: number, y: number, L: number, T: number, D: number, lean = 0) => {
      const b = group(at(farBook(L, T, D, design++), 0, 0, 0, 0, Math.PI, 0));
      const pivot = group(at(b, T, L / 2, 0, 0, 0, Math.PI / 2));
      return at(pivot, x, y, 27 - D / 2, 0, 0, lean);
    };
    const pile = (x: number, y: number, n: number) => {
      let py = y;
      for (let k = 0; k < n; k++) {
        const T = 4 + r() * 3;
        g.add(at(farBook(38 + r() * 5, T, 30 + r() * 4, design++), x, py, 8, 0, Math.PI + (r() - 0.5) * 0.15, 0));
        py += T;
      }
    };
    // One feature on each shelf, the rest packed with books.
    const features = ['pile', 'plant', 'bookend', 'pile', 'trophy'];
    levels.forEach((y, li) => {
      const room = (li < 4 ? levels[li + 1] - 3 : 352) - y;
      const featureAt = -60 + r() * 90;
      let feature = features[li];
      let x = -76.4;
      let prevL = 0;
      while (x < 76) {
        if (feature && x > featureAt) {
          const w = feature === 'pile' ? 46 : feature === 'plant' ? 22 : feature === 'trophy' ? 16 : 14;
          if (x + w > 76) break;
          if (feature === 'pile') pile(x + 23, y, 2 + Math.floor(r() * 3));
          else if (feature === 'plant') g.add(at(scaledPlant(), x + 11, y, 4));
          else if (feature === 'trophy') g.add(at(trophy(), x + 8, y, 4));
          else g.add(at(rbox(0.8, 18, 14, 0.3, end), x + 0.4, y, 10), at(rbox(9, 0.6, 14, 0.2, end), x + 4.5, y, 10));
          x += w;
          feature = '';
          prevL = 0;
          continue;
        }
        const L = Math.min(room - 3, 42 + r() * 20);
        const T = 2.4 + r() * 4.6;
        const D = 32 + r() * 10;
        // Now and then a book leans on its neighbour.
        const lean = prevL && r() < 0.08 ? 0.12 + r() * 0.2 : 0;
        const xb = x + (lean ? Math.min(prevL, L) * Math.tan(lean) : 0);
        if (xb + T > 76.4) break;
        g.add(stand(xb, y, L, T, D, lean));
        x = xb + T + 0.12;
        prevL = lean ? 0 : L;
      }
    });
    // On top: a globe and a pile.
    const gl = desk.globe();
    gl.scale.setScalar(1.5);
    g.add(at(gl, -45, 360, 2));
    pile(30, 360, 3);
    return g;
  },

  /**
   * Pinboard for the study wall: 200 wide, 140 tall, 4 deep. Cork in a wooden frame with a calendar,
   * two photos, a postcard, a child's drawing, a to-do list and a sticky note, each held by push pins.
   */
  pinboard: () => {
    const wood = printed(furnitureWood(false), { rough: 0.55 });
    const g = group(
      at(rbox(200, 7, 4, 0.8, wood), 0, 0, 2),
      at(rbox(200, 7, 4, 0.8, wood), 0, 133, 2),
      at(rbox(7, 126, 4, 0.8, wood), -96.5, 7, 2),
      at(rbox(7, 126, 4, 0.8, wood), 96.5, 7, 2),
      at(rbox(188, 128, 2, 0.2, printed(cork(), { rough: 0.95 })), 0, 6, 1),
    );
    const sheet = printed(pinSheet(), { rough: 0.7 });
    const items: [keyof typeof PINS, number, number, number, number, number][] = [
      ['calendar', 40, 52, -65, 46, 0.02],
      ['photo1', 26, 30, -20, 85, -0.08],
      ['photo2', 26, 30, 10, 81, 0.1],
      ['note', 24, 24, 45, 93, -0.05],
      ['todo', 20, 28, 78, 81, 0.06],
      ['postcard', 42, 28, -10, 31, 0.04],
      ['drawing', 40, 30, 55, 30, -0.05],
    ];
    const pinColors = ['#e63946', '#3d9bff', '#ffd23f', '#06d6a0', '#ff8fab', '#ffffff', '#8d5bc1'];
    const pinShape: [number, number][] = [[0, 0], [0.9, 0], [1.05, 0.35], [0.55, 0.7], [0.5, 1.6], [1.15, 2.0], [1.2, 2.5], [0, 2.6]];
    items.forEach(([k, w, h, x, y, rot], i) => {
      g.add(at(rbox(w, h, 0.16, 0.04, sheet, { pz: PINS[k], rest: PINS.paper }, 1), x, y, 2.05, 0, 0, rot));
      const top = v3(x - Math.sin(rot) * (h - 3), y + Math.cos(rot) * (h - 3), 2.2);
      g.add(at(turn(pinShape, plastic(pinColors[i % pinColors.length]), 14), top.x, top.y, top.z, Math.PI / 2, 0, 0));
    });
    return g;
  },
};

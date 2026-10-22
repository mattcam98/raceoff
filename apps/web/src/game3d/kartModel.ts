/**
 * Karts and their drivers: glossy toy miniatures. A kart faces +z with its
 * origin on the ground between the wheels.
 *
 *   root     position and heading
 *   tilt     pitch and roll to match the ground
 *   body     drift yaw, spins and squash; the wheels hang off it
 *   sprung   the chassis on its springs: squat, dive, roll and bounce
 *   driver   leans in the seat; its head looks into corners; arms reach for the wheel
 *
 * Parts that never move relative to each other are baked into one mesh per finish.
 * kartAnim.ts poses all of it from the Kart each frame.
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { at, bake, scaled, shareResource } from './kit';
import { characterById } from '@raceoff/shared';
import { tex } from './textures';
import { newKartAnim, type KartAnim } from './kartAnim';

export interface KartArm {
  mesh: THREE.Object3D;
  /** Shoulder in the driver's frame. */
  shoulder: THREE.Vector3;
  /** -1 left (+x), 1 right (-x). */
  side: number;
  /** Rest length from shoulder to hand. */
  length: number;
}

export interface KartRig {
  root: THREE.Group;
  tilt: THREE.Group;
  body: THREE.Group;
  /** The chassis and driver, riding on the suspension. */
  sprung: THREE.Group;
  driver: THREE.Group;
  head: THREE.Group;
  /** Turns about its z axis with the steering. */
  steering: THREE.Object3D;
  /** Hand grip points on the steering wheel rim, in its frame. */
  grips: THREE.Vector3[];
  arms: KartArm[];
  /** Squashed flat to blink; catchlights hide meanwhile. */
  eyes: THREE.Object3D | null;
  catchlights: THREE.Object3D | null;
  /** The robot's wind-up key. */
  key: THREE.Object3D | null;
  seatY: number;
  wheels: THREE.Object3D[];
  front: THREE.Object3D[];
  /** Local positions of exhaust tips and rear wheels, for flames and sparks. */
  exhausts: THREE.Vector3[];
  rearWheels: THREE.Vector3[];
  shield: THREE.Mesh;
  shadow: THREE.Mesh;
  ring: THREE.Mesh | null;
  tag: THREE.Sprite | null;
  rocket: THREE.Object3D;
  /** Body materials that flash during a Sugar Rush. */
  paint: THREE.MeshStandardMaterial[];
  wheelRadius: number;
  anim: KartAnim;
}

// ---------------------------------------------------------------- materials

const cache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = shareResource(make());
    cache.set(key, m);
  }
  return m;
}

/** Glossy toy paint under a clear lacquer: die-cast. Casts shadows and glows in a Sugar Rush. */
const paint = (color: string) =>
  cached(`paint${color}`, () => {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08 });
    m.userData = { paint: true, casts: true };
    return m;
  });
/** Soft-gloss vinyl for the drivers. */
const vinyl = (color: string) =>
  cached(`vinyl${color}`, () => {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.48, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff') });
    m.userData = { paint: true, casts: true };
    return m;
  });
const finish = (key: string, color: string, roughness: number, metalness: number, casts: boolean) =>
  cached(`${key}${color}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.userData = { casts };
    return m;
  });
const rubber = (c = '#1c1d23') => finish('rubber', c, 0.86, 0, true);
/** Moulded dark plastic: chassis, seat, bumpers. */
const plastic = (c = '#2a2c36') => finish('plastic', c, 0.5, 0, true);
const chrome = (c = '#eef1f5') => finish('chrome', c, 0.16, 1, false);
/** Anodised metal rims, tinted per kart. */
const anodised = (c: string) => finish('anod', c, 0.3, 1, false);
const EYE = cached('eye', () => new THREE.MeshPhysicalMaterial({ color: '#15151d', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }));
const glow = (color: string, intensity: number) =>
  cached(`glow${color}${intensity}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 }));
const HEADLIGHT = glow('#fff1cf', 4.5);
const TAILLIGHT = glow('#ff1426', 1.8);
const CATCH = glow('#ffffff', 1.3);

/** A licence plate: the player's tag in their colour, or the driver's name on white. */
function plateMat(text: string, bg: string, fg: string) {
  return cached(`plate${text}${bg}`, () => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1b1b22';
    g.beginPath();
    g.roundRect(0, 0, 128, 64, 14);
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(5, 5, 118, 54, 10);
    g.fill();
    g.fillStyle = fg;
    g.font = `900 ${text.length > 4 ? 27 : text.length > 2 ? 34 : 42}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 35);
    const t = shareResource(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 });
  });
}

// ---------------------------------------------------------------- shapes

function mk(g: THREE.BufferGeometry, m: THREE.Material) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** A closed outline with its corners rounded by `r` (or a per-corner third value). */
function outline(pts: number[][], r: number): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x, y, rr = r] = pts[i];
    const p = pts[(i + n - 1) % n];
    const q = pts[(i + 1) % n];
    const d1 = Math.hypot(p[0] - x, p[1] - y);
    const d2 = Math.hypot(q[0] - x, q[1] - y);
    const a = Math.min(rr, d1 * 0.45) / d1;
    const b = Math.min(rr, d2 * 0.45) / d2;
    const ax = x + (p[0] - x) * a;
    const ay = y + (p[1] - y) * a;
    if (i === 0) s.moveTo(ax, ay);
    else s.lineTo(ax, ay);
    s.quadraticCurveTo(x, y, x + (q[0] - x) * b, y + (q[1] - y) * b);
  }
  s.closePath();
  return s;
}

/** Smooth shading across bevels and rounded corners, which ExtrudeGeometry leaves faceted. */
const smooth = (g: THREE.BufferGeometry) => toCreasedNormals(g, 0.95);

const extrudeOpts = (depth: number, bevel: number) => ({ depth: Math.max(0.001, depth), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: bevel >= 0.08 ? 2 : 1, curveSegments: 3 });

/** A panel drawn from the side, [z, y] corners, extruded across the kart `width` wide with soft edges. */
function side(pts: number[][], width: number, bevel: number, m: THREE.Material, r = 0.12) {
  const g = new THREE.ExtrudeGeometry(outline(pts, r), extrudeOpts(width - bevel * 2, bevel));
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return mk(smooth(g), m);
}

/** A panel drawn from above, [x, z] corners, `h` tall standing on y = 0, with soft edges. */
function plan(pts: number[][], h: number, bevel: number, m: THREE.Material, r = 0.15) {
  const g = new THREE.ExtrudeGeometry(outline(pts.map(([x, z, rr]) => [x, z, rr ?? r]), r), extrudeOpts(h - bevel * 2, bevel));
  g.rotateX(Math.PI / 2);
  g.translate(0, h - bevel, 0);
  return mk(smooth(g), m);
}

const rect = (x0: number, z0: number, x1: number, z1: number) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** A tube along a smooth path. */
function tube(pts: number[][], radius: number, m: THREE.Material, segs = 16, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.3);
  return mk(new THREE.TubeGeometry(curve, segs, radius, radial, false), m);
}

/** A lathed solid from [radius, y] pairs, bottom up. */
function turn(profile: number[][], m: THREE.Material, segs = 20) {
  return mk(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs), m);
}

function orb(r: number, m: THREE.Material, w = 20, h = 14) {
  // Small details need fewer facets.
  const f = r < 0.25 && r !== 1 ? 0.72 : 1;
  return mk(new THREE.SphereGeometry(r, Math.max(6, Math.round(w * f)), Math.max(4, Math.round(h * f))), m);
}

function cone(r: number, h: number, m: THREE.Material, segs = 12) {
  const g = new THREE.ConeGeometry(r, h, segs);
  g.translate(0, h / 2, 0);
  return mk(g, m);
}

function rod(r: number, h: number, m: THREE.Material, segs = 10) {
  return mk(new THREE.CylinderGeometry(r, r, h, segs), m);
}

/** A flat ring sector standing across the kart: a mudguard over a wheel. */
function fender(radius: number, thick: number, width: number, from: number, to: number, m: THREE.Material) {
  const s = new THREE.Shape();
  s.absarc(0, 0, radius + thick, from, to, false);
  s.absarc(0, 0, radius, to, from, true);
  s.closePath();
  const bevel = Math.min(0.05, thick * 0.4);
  const g = new THREE.ExtrudeGeometry(s, { ...extrudeOpts(width - bevel * 2, bevel), curveSegments: 8 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return mk(smooth(g), m);
}

/** A point on a sphere of radius r, `yaw` round from the front and `pitch` up, pushed out by `out`. */
function onSphere(o: THREE.Object3D, r: number, yaw: number, pitch: number, out = 0) {
  const n = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  o.position.copy(n).multiplyScalar(r + out);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return o;
}

/** Cast shadows only from the big parts: paint, vinyl, rubber and plastic. */
function shadowsByFinish<T extends THREE.Object3D>(g: T): T {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = !!(m.material as THREE.Material).userData.casts;
  });
  return g;
}

/** Bake a group into one mesh per finish, then hand back the result. */
const baked = (g: THREE.Object3D, name: string) => shadowsByFinish(bake(g, name));

// ---------------------------------------------------------------- wheels

/** A tyre with sidewalls and tread blocks on a dished rim, axle along x, its face to +x. */
function wheel(r: number, w: number, rimColor: string, knobbly: boolean) {
  const g = new THREE.Group();
  const h = w / 2;
  const tyre = rubber();
  // Lathe around y, then laid on its side: lathe y = -x, so the outer face is at y = -h.
  const tread = knobbly ? [[1, -h + 0.09], [1, h - 0.09]] : [[1, -h + 0.09], [1, -0.03], [0.97, -0.02], [0.97, 0.02], [1, 0.03], [1, h - 0.09]];
  const prof = [[0.6, -h + 0.03], [0.8, -h], [0.94, -h + 0.02], ...tread, [0.94, h - 0.02], [0.8, h], [0.6, h - 0.03], [0.6, -h + 0.03]];
  const t = turn(prof.map(([rr, y]) => [rr * r, y]), tyre, 18);
  t.rotation.z = Math.PI / 2;
  g.add(t);
  // Tread blocks in two staggered rows: chunky lugs on a buggy or a monster.
  const n = 12;
  const lug = 0.09;
  for (let i = 0; i < (knobbly ? n * 2 : 0); i++) {
    const row = i % 2 ? 1 : -1;
    const a = ((Math.floor(i / 2) + (row > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
    const b = mk(new THREE.BoxGeometry(w * 0.4, lug * 2, ((Math.PI * 2 * r) / n) * 0.5), tyre);
    b.position.set(row * w * 0.22, Math.cos(a) * r, Math.sin(a) * r);
    b.rotation.set(a, 0, row * 0.25);
    g.add(b);
  }
  // Inner face closed off.
  g.add(at(rod(r * 0.6, 0.02, tyre, 16), -h + 0.04, 0, 0, 0, 0, Math.PI / 2));
  // Dished rim, spokes and a hub cap.
  const rim = anodised(rimColor);
  const disc = turn([[0.62, -h + 0.05], [0.6, -h + 0.02], [0.5, -h + 0.06], [0.3, -h + 0.12], [0.001, -h + 0.13]].map(([rr, y]) => [rr * r, y]), rim, 16);
  disc.rotation.z = Math.PI / 2;
  g.add(disc);
  const bright = anodised('#dfe3ea');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const s = mk(new THREE.BoxGeometry(0.05, r * 0.42, r * 0.13), bright);
    s.position.set(h - 0.09, Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36);
    s.rotation.x = a;
    g.add(s);
  }
  const cap = turn([[0.2 * r, 0], [0.19 * r, 0.04], [0.1 * r, 0.08], [0.001, 0.09]], bright, 10);
  cap.rotation.z = -Math.PI / 2;
  cap.position.x = h - 0.12;
  g.add(cap);
  const out = baked(g, 'wheel');
  out.userData.r = r;
  return out;
}

// ---------------------------------------------------------------- drivers

interface Head {
  group: THREE.Group;
  eyes: THREE.Group;
  catches: THREE.Group;
}

const HEAD_R = 0.5;

/** Big glossy eyes with two catchlights each, set on the head sphere. */
function addEyes(hd: Head, r: number, spread: number, pitch: number, size = 1, center = new THREE.Vector3()) {
  for (const s of [-1, 1]) {
    const e = scaled(onSphere(orb(1, EYE, 14, 10), r, s * spread, pitch, -0.02), 0.1 * size, 0.135 * size, 0.06);
    e.position.add(center);
    hd.eyes.add(e);
    for (const [dy, dp, cr] of [[-0.06, 0.06, 0.034], [0.05, -0.05, 0.016]]) {
      const c = onSphere(orb(cr * size, CATCH, 6, 4), r, s * spread + dy * size, pitch + dp * size, 0.035);
      c.position.add(center);
      hd.catches.add(c);
    }
  }
}

function blush(hd: Head, r: number, spread = 0.62, pitch = -0.2) {
  for (const s of [-1, 1]) hd.group.add(scaled(onSphere(orb(1, vinyl('#ff8fa3'), 10, 8), r, s * spread, pitch, -0.01), 0.07, 0.045, 0.02));
}

function buildHead(id: string, color: string, accent: string): Head {
  const hd: Head = { group: new THREE.Group(), eyes: new THREE.Group(), catches: new THREE.Group() };
  const g = hd.group;
  const c = vinyl(color);
  const a = vinyl(accent);
  const dark = EYE;
  const R = HEAD_R;
  switch (id) {
    case 'zip': {
      // Fox: tall pointed ears, white cheek ruff, a pointed muzzle with a black nose.
      g.add(scaled(orb(R, c, 24, 16), 1.04, 0.96, 1));
      g.add(at(scaled(orb(0.2, a, 16, 12), 1.1, 0.75, 1.5), 0, -0.14, 0.36));
      g.add(at(orb(0.065, dark, 10, 8), 0, -0.09, 0.66));
      for (const s of [-1, 1]) {
        g.add(at(scaled(orb(0.15, a, 12, 10), 1.2, 0.7, 0.8), s * 0.36, -0.26, 0.16, 0, 0, s * 0.5));
        g.add(at(scaled(cone(0.2, 0.5, c, 14), 1, 1, 0.55), s * 0.27, 0.32, -0.04, 0, 0, -s * 0.35));
        g.add(at(scaled(cone(0.12, 0.34, a, 10), 1, 1, 0.4), s * 0.265, 0.34, 0.02, 0, 0, -s * 0.35));
        g.add(at(scaled(cone(0.082, 0.16, vinyl('#3b2620'), 10), 1, 1, 0.55), s * 0.4, 0.75, -0.04, 0, 0, -s * 0.35));
      }
      addEyes(hd, R, 0.36, 0.06);
      break;
    }
    case 'bonk': {
      // Bear: round ears, a tan muzzle and a big button nose.
      g.add(scaled(orb(R * 1.05, c, 24, 16), 1.06, 0.98, 1));
      for (const s of [-1, 1]) {
        g.add(at(scaled(orb(0.17, c, 14, 10), 1, 1, 0.7), s * 0.38, 0.38, -0.04));
        g.add(at(scaled(orb(0.1, a, 12, 8), 1, 1, 0.4), s * 0.38, 0.37, 0.04));
      }
      g.add(at(scaled(orb(0.22, a, 18, 12), 1.15, 0.82, 0.9), 0, -0.16, 0.38));
      g.add(at(scaled(orb(0.08, dark, 12, 8), 1.3, 0.9, 1), 0, -0.07, 0.58));
      addEyes(hd, R * 1.05, 0.33, 0.1, 0.95);
      blush(hd, R * 1.05);
      break;
    }
    case 'volt': {
      // Wind-up robot: a rounded box head, a dark visor with glowing eyes, an antenna and ear bolts.
      const box = plan(rect(-0.44, -0.36, 0.44, 0.38), 0.74, 0.1, c, 0.18);
      g.add(at(box, 0, -0.42, 0));
      g.add(at(plan(rect(-0.34, 0, 0.34, 0.06), 0.36, 0.03, dark, 0.1), 0, -0.24, 0.36));
      for (const s of [-1, 1]) {
        g.add(at(scaled(orb(1, glow('#7df9ff', 3), 12, 8), 0.075, 0.1, 0.03), s * 0.15, -0.06, 0.43));
        g.add(at(rod(0.12, 0.08, chrome(accent), 16), s * 0.48, -0.06, 0, 0, 0, Math.PI / 2));
        g.add(at(rod(0.05, 0.08, chrome('#9aa3ad'), 10), s * 0.53, -0.06, 0, 0, 0, Math.PI / 2));
      }
      // A smile on the visor.
      g.add(at(mk(new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI), glow('#7df9ff', 3)), 0, -0.17, 0.43, 0, 0, Math.PI));
      g.add(at(rod(0.025, 0.3, chrome(), 8), 0, 0.42, 0));
      g.add(at(orb(0.075, glow('#ff4d6d', 4), 12, 8), 0, 0.6, 0));
      g.add(at(plan(rect(-0.2, -0.36, 0.2, -0.3), 0.16, 0.02, a, 0.04), 0, 0.2, 0.0));
      break;
    }
    case 'duckie': {
      // Duck: a wide flat bill, a tuft of feathers on top.
      g.add(scaled(orb(R, c, 24, 16), 1, 0.98, 1));
      g.add(at(scaled(orb(0.22, a, 16, 10), 1.35, 0.3, 1.2), 0, -0.1, 0.44));
      g.add(at(scaled(orb(0.19, a, 16, 10), 1.2, 0.26, 1.05), 0, -0.17, 0.41));
      for (const [x, rz, rx, h] of [[0, 0, -0.5, 0.3], [0.07, -0.45, -0.7, 0.24], [-0.07, 0.45, -0.7, 0.24]]) g.add(at(scaled(cone(0.07, h, c, 10), 1, 1, 0.6), x, 0.44, -0.02, rx, 0, rz));
      addEyes(hd, R, 0.34, 0.12, 0.95);
      blush(hd, R, 0.66, -0.12);
      break;
    }
    case 'mochi': {
      // Cat: triangle ears, a little muzzle, whiskers and a pink nose.
      g.add(scaled(orb(R, c, 24, 16), 1.08, 0.94, 1));
      for (const s of [-1, 1]) {
        g.add(at(scaled(cone(0.2, 0.36, c, 4), 1, 1, 0.6), s * 0.3, 0.3, -0.02, 0, Math.PI / 4, -s * 0.3));
        g.add(at(scaled(cone(0.11, 0.24, vinyl('#ffc2dc'), 4), 1, 1, 0.4), s * 0.3, 0.32, 0.04, 0, Math.PI / 4, -s * 0.3));
        for (const k of [-1, 1]) g.add(at(rod(0.008, 0.32, vinyl('#ffffff'), 4), s * 0.36, -0.12 + k * 0.04, 0.38, 0, s * 0.3, Math.PI / 2 + s * k * 0.12));
      }
      g.add(at(scaled(orb(0.17, a, 14, 10), 1.25, 0.72, 0.9), 0, -0.16, 0.38));
      g.add(at(scaled(orb(0.05, vinyl('#ff4d8d'), 10, 8), 1.3, 0.8, 1), 0, -0.08, 0.53));
      addEyes(hd, R, 0.36, 0.04);
      blush(hd, R);
      break;
    }
    case 'hopper': {
      // Frog: a wide flat head with eyes up on bumps, a long smile and a pale chin.
      g.add(scaled(orb(R, c, 24, 16), 1.18, 0.78, 1.02));
      g.add(at(scaled(orb(0.38, a, 20, 12), 1.25, 0.5, 1), 0, -0.2, 0.14));
      for (const s of [-1, 1]) {
        const bump = new THREE.Vector3(s * 0.26, 0.32, 0.1);
        g.add(at(orb(0.19, c, 18, 12), bump.x, bump.y, bump.z));
        const e = scaled(onSphere(orb(1, EYE, 12, 10), 0.19, 0, 0.15, -0.015), 0.1, 0.11, 0.05);
        e.position.add(bump);
        hd.eyes.add(e);
        for (const [dx, dy, cr] of [[-0.035, 0.05, 0.028], [0.03, -0.03, 0.013]]) {
          const ct = onSphere(orb(cr, CATCH, 6, 4), 0.19, dx * 2, 0.15 + dy * 2, 0.025);
          ct.position.add(bump);
          hd.catches.add(ct);
        }
      }
      g.add(at(mk(new THREE.TorusGeometry(0.3, 0.018, 6, 20, Math.PI * 0.8), vinyl('#1f5a2a')), 0, -0.05, 0.38, 0.35, 0, Math.PI * 1.1));
      blush(hd, R * 1.1, 0.8, -0.15);
      break;
    }
    case 'pebble': {
      // Penguin: a white face mask and an orange beak.
      g.add(scaled(orb(R, c, 24, 16), 1, 1, 1));
      for (const s of [-1, 1]) g.add(at(scaled(orb(0.27, a, 18, 14), 1, 1.1, 0.7), s * 0.15, -0.04, 0.27));
      g.add(at(scaled(orb(0.26, a, 18, 14), 1.25, 0.9, 0.7), 0, -0.16, 0.26));
      g.add(at(scaled(cone(0.09, 0.22, vinyl('#ff9f1c'), 12), 1.3, 1, 0.8), 0, -0.1, 0.46, Math.PI / 2, 0, 0));
      // A red bobble hat, so he reads from behind.
      g.add(at(turn([[0.47, 0], [0.47, 0.08], [0.43, 0.2], [0.33, 0.33], [0.18, 0.42], [0.001, 0.45]], vinyl('#e63946'), 22), 0, 0.12, -0.02, -0.12, 0, 0));
      g.add(at(mk(new THREE.TorusGeometry(0.46, 0.06, 6, 22), vinyl('#ffffff')), 0, 0.14, -0.02, Math.PI / 2 - 0.12, 0, 0));
      g.add(at(orb(0.12, vinyl('#ffffff'), 12, 10), 0, 0.6, -0.08));
      addEyes(hd, R, 0.3, 0.06, 0.9);
      blush(hd, R, 0.6, -0.22);
      break;
    }
    case 'ember': {
      // Dragon: a snout with nostrils, swept-back horns and spines down the back of the head.
      g.add(scaled(orb(R, c, 24, 16), 1.02, 0.96, 1));
      g.add(at(scaled(orb(0.24, c, 18, 12), 1.15, 0.78, 1.15), 0, -0.14, 0.34));
      for (const s of [-1, 1]) {
        g.add(at(scaled(orb(0.03, dark, 8, 6), 1, 0.7, 1), s * 0.09, -0.07, 0.6));
        g.add(at(cone(0.08, 0.42, vinyl(accent), 12), s * 0.22, 0.32, -0.12, -0.75, 0, -s * 0.28));
        g.add(at(scaled(cone(0.09, 0.2, c, 10), 1, 1, 0.4), s * 0.42, 0.12, -0.06, 0, 0, -s * 1.2));
      }
      for (let i = 0; i < 3; i++) g.add(at(scaled(cone(0.07 - i * 0.012, 0.18 - i * 0.03, a, 8), 0.5, 1, 1), 0, 0.42 - i * 0.2, -0.2 - i * 0.14, -0.6 - i * 0.45, 0, 0));
      g.add(at(scaled(orb(0.16, a, 12, 8), 1.3, 0.5, 0.9), 0, -0.26, 0.3));
      addEyes(hd, R, 0.36, 0.08);
      break;
    }
    default:
      g.add(orb(R, c, 24, 16));
      addEyes(hd, R, 0.36, 0.06);
  }
  return hd;
}

/** The body, sat in the seat, with the bits that show from behind: tails, wings, a key, a scarf. */
function buildTorso(id: string, color: string, accent: string) {
  const g = new THREE.Group();
  const c = vinyl(color);
  const a = vinyl(accent);
  let key: THREE.Object3D | null = null;
  if (id === 'volt') {
    g.add(at(plan(rect(-0.3, -0.24, 0.3, 0.24), 0.62, 0.1, c, 0.16), 0, 0.08, 0));
    g.add(at(plan(rect(-0.18, 0, 0.18, 0.04), 0.24, 0.02, chrome('#c9d2dc'), 0.06), 0, 0.3, 0.24));
    // Wind-up key on the back, turning while the kart runs.
    const k = new THREE.Group();
    k.add(at(rod(0.035, 0.22, chrome(), 8), 0, 0, 0.11, Math.PI / 2, 0, 0));
    for (const s of [-1, 1]) k.add(at(scaled(orb(0.12, chrome('#f2c94c'), 14, 10), 1, 1, 0.3), s * 0.12, 0, 0));
    key = baked(k, 'key');
    key.position.set(0, 0.42, -0.36);
    key.rotation.y = Math.PI;
    key.userData.dynamic = true;
    g.add(key);
  } else {
    g.add(at(scaled(orb(0.34, c, 18, 12), 1.05, 1.08, 0.88), 0, 0.36, 0));
    if (id !== 'mochi') g.add(at(scaled(orb(0.26, a, 14, 10), 1, 1.05, 0.5), 0, 0.33, 0.17));
  }
  switch (id) {
    case 'zip': // A big bushy tail, white at the tip, curling up behind the seat.
      g.add(at(scaled(orb(0.2, c, 14, 10), 1, 1, 1.5), 0.18, 0.4, -0.58, -0.7, 0, 0));
      g.add(at(scaled(orb(0.27, c, 16, 12), 1, 1.45, 1), 0.36, 0.82, -0.72, -0.25, 0, -0.45));
      g.add(at(scaled(orb(0.2, a, 14, 10), 1, 1.35, 1), 0.52, 1.24, -0.7, -0.1, 0, -0.6));
      break;
    case 'bonk':
      g.add(at(orb(0.1, c, 10, 8), 0, 0.18, -0.32));
      break;
    case 'duckie':
      g.add(at(scaled(cone(0.14, 0.26, c, 10), 1, 1, 0.5), 0, 0.2, -0.3, -1.9, 0, 0));
      break;
    case 'mochi': // A tail curling up in an S behind the seat.
      g.add(tube([[0, 0.2, -0.28], [0.1, 0.35, -0.55], [0.05, 0.75, -0.62], [0.18, 1.0, -0.5]], 0.065, c, 18, 8));
      g.add(at(orb(0.075, a, 10, 8), 0.18, 1.0, -0.5));
      break;
    case 'hopper':
      break;
    case 'pebble': // A red scarf, its ends flying out behind.
      g.add(at(mk(new THREE.TorusGeometry(0.25, 0.07, 8, 20), vinyl('#e63946')), 0, 0.7, 0, Math.PI / 2, 0, 0));
      g.add(at(plan(rect(-0.08, -0.46, 0.08, 0), 0.04, 0.015, vinyl('#e63946'), 0.05), 0.14, 0.68, -0.2, -0.4, 0.3, 0));
      for (const s of [-1, 1]) g.add(at(scaled(orb(0.11, c, 10, 8), 1, 0.4, 1.4), s * 0.36, 0.42, -0.05, 0, 0, s * 0.5));
      break;
    case 'ember': { // Wings on the back and a spiked tail.
      const wing = new THREE.Shape();
      wing.moveTo(0, 0);
      wing.quadraticCurveTo(0.25, 0.55, 0.62, 0.62);
      wing.quadraticCurveTo(0.5, 0.42, 0.56, 0.3);
      wing.quadraticCurveTo(0.42, 0.24, 0.42, 0.1);
      wing.quadraticCurveTo(0.28, 0.12, 0.22, -0.04);
      wing.closePath();
      for (const s of [-1, 1]) {
        const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 6 });
        const w = mk(smooth(wg), vinyl('#b0233a'));
        w.position.set(s * 0.12, 0.5, -0.26);
        w.rotation.set(0.2, s * 0.65 + (s < 0 ? Math.PI : 0), 0);
        g.add(w);
      }
      g.add(tube([[0, 0.18, -0.25], [0.15, 0.25, -0.6], [0.35, 0.45, -0.78]], 0.08, c, 14, 8));
      g.add(at(scaled(cone(0.1, 0.2, a, 8), 1, 1, 0.4), 0.36, 0.48, -0.8, -0.8, 0, -0.6));
      break;
    }
  }
  return { torso: baked(g, 'torso'), key };
}

/** An arm along +y from the shoulder, ending in a round mitten. */
function buildArm(color: string, accent: string, length: number) {
  const g = new THREE.Group();
  const sleeve = new THREE.CapsuleGeometry(0.075, length - 0.12, 3, 8);
  sleeve.translate(0, (length - 0.12) / 2 + 0.04, 0);
  g.add(mk(sleeve, vinyl(color)));
  g.add(at(scaled(orb(0.1, vinyl(accent), 10, 8), 1, 0.9, 1.1), 0, length, 0));
  const arm = baked(g, 'arm').children[0];
  arm.matrixAutoUpdate = true;
  return arm;
}

// ---------------------------------------------------------------- bodies

interface BodyParts {
  shell: THREE.Group;
  wheelR: number;
  wheelW: [number, number];
  front: [number, number];
  rear: [number, number];
  seatY: number;
  /** Steering wheel hub, and its tilt back toward the driver. */
  wheelAt: [number, number, number];
  knobbly: boolean;
  exhausts: THREE.Vector3[];
}

/** Headlights in chrome bezels, facing forward. */
function headlights(g: THREE.Group, pts: number[][], r: number) {
  for (const [x, y, z] of pts) {
    g.add(at(scaled(orb(r, HEADLIGHT, 14, 10), 1, 1, 0.55), x, y, z));
    g.add(at(mk(new THREE.TorusGeometry(r, r * 0.22, 4, 12), chrome()), x, y, z - 0.01));
  }
}

function taillights(g: THREE.Group, pts: number[][], w = 0.2, h = 0.09) {
  for (const [x, y, z] of pts) g.add(at(plan(rect(-w / 2, -0.03, w / 2, 0.03), h, 0.02, TAILLIGHT, 0.03), x, y, z));
}

function plate(g: THREE.Group, x: number, y: number, z: number, m: THREE.Material, back = true) {
  const p = mk(new THREE.PlaneGeometry(0.46, 0.23), m);
  p.castShadow = false;
  g.add(at(p, x, y, z, 0, back ? Math.PI : 0, 0));
}

/** A chrome exhaust pipe pointing back, its flared tip at `tip`. */
function exhaust(g: THREE.Group, tip: THREE.Vector3, len: number, r: number, lift = 0) {
  const p = turn([[r * 0.7, 0], [r, 0.02], [r, len * 0.6], [r * 1.25, len * 0.9], [r * 1.3, len], [r * 1.0, len]], chrome(), 10);
  p.position.copy(tip);
  p.rotation.x = Math.PI / 2 + lift;
  g.add(p);
}

function racer(main: THREE.Material, trim: THREE.Material, plateM: THREE.Material): BodyParts {
  const g = new THREE.Group();
  const dark = plastic();
  // Floor pan and axles.
  g.add(at(plan([[-0.62, -1.45], [0.62, -1.45], [0.55, 1.5], [-0.55, 1.5]], 0.12, 0.04, dark, 0.2), 0, 0.14, 0));
  for (const z of [0.95, -0.95]) g.add(at(rod(0.05, 1.7, chrome('#8b9099')), 0, 0.42, z, 0, 0, Math.PI / 2));
  // The nose: a low wedge rising to the cowl, a stripe down its middle.
  const nose = [[1.68, 0.2], [1.72, 0.38, 0.1], [1.35, 0.5, 0.3], [0.6, 0.66, 0.3], [0.2, 0.68, 0.1], [0.12, 0.24, 0.05]];
  g.add(at(side(nose, 0.86, 0.16, main), 0, 0, 0));
  g.add(at(side(nose.map(([z, y, r]) => [z, y + 0.05, r]), 0.3, 0.12, trim), 0, 0, 0.01));
  // Front bumper bar, wide and soft.
  g.add(at(plan([[-0.98, 1.72], [0.98, 1.72], [0.85, 1.98], [-0.85, 1.98]], 0.18, 0.07, trim, 0.12), 0, 0.12, 0));
  // Side pods, with an intake at the front and a stripe.
  for (const s of [-1, 1]) {
    g.add(at(side([[0.36, 0.18], [0.42, 0.4, 0.15], [0.2, 0.56, 0.2], [-0.32, 0.56, 0.18], [-0.44, 0.38], [-0.4, 0.18]], 0.34, 0.12, main), s * 0.54, 0, 0));
    g.add(at(side([[0.3, 0.42], [-0.36, 0.42], [-0.36, 0.5], [0.3, 0.5]], 0.36, 0.03, trim, 0.04), s * 0.55, 0.0, 0));
    g.add(at(scaled(orb(0.1, dark, 12, 8), 1.3, 0.9, 0.5), s * 0.54, 0.36, 0.52));
  }
  // Rear mudguards.
  for (const s of [-1, 1]) g.add(at(fender(0.52, 0.06, 0.5, 0.25, Math.PI - 0.4, main), s * 0.9, 0.45, -0.95, 0, 0, 0));
  // Seat: a dark bucket with a coloured headrest.
  g.add(at(side([[0.25, 0], [0.25, 0.14], [-0.3, 0.14], [-0.3, 0]], 0.82, 0.06, dark, 0.06), 0, 0.42, -0.3));
  g.add(at(side([[-0.38, 0], [-0.3, 0.8, 0.1], [-0.46, 0.84, 0.1], [-0.56, 0]], 0.84, 0.08, dark, 0.1), 0, 0.42, -0.2));
  // Engine behind the seat: a block, finned cylinders and an air scoop.
  g.add(at(plan(rect(-0.4, -1.5, 0.4, -0.75), 0.32, 0.08, dark, 0.15), 0, 0.26, 0));
  for (const s of [-1, 1]) {
    g.add(at(rod(0.15, 0.3, chrome('#9ba2ad'), 16), s * 0.2, 0.7, -1.1));
    for (let i = 0; i < 2; i++) g.add(at(mk(new THREE.TorusGeometry(0.15, 0.025, 4, 12), chrome('#c3c9d2')), s * 0.2, 0.66 + i * 0.12, -1.1, Math.PI / 2, 0, 0));
  }
  g.add(at(turn([[0.12, 0], [0.13, 0.1], [0.18, 0.22], [0.15, 0.24]], chrome(), 12), 0, 0.84, -1.1));
  // A low ducktail spoiler over the engine, in the trim colour.
  g.add(at(side([[0.16, 0], [0.1, 0.08, 0.04], [-0.2, 0.12, 0.04], [-0.24, 0.0]], 1.5, 0.04, trim, 0.04), 0, 0.6, -1.5));
  // Rear bumper, tail lights and plate.
  g.add(at(plan([[-0.78, -1.72], [0.78, -1.72], [0.78, -1.5], [-0.78, -1.5]], 0.16, 0.05, dark, 0.08), 0, 0.14, 0));
  taillights(g, [[-0.58, 0.27, -1.74], [0.58, 0.27, -1.74]]);
  plate(g, 0, 0.42, -1.6, plateM);
  headlights(g, [[-0.3, 0.42, 1.72], [0.3, 0.42, 1.72]], 0.085);
  // Steering column.
  g.add(tube([[0, 0.62, 0.8], [0, 0.82, 0.45], [0, 0.96, 0.3]], 0.035, dark, 6, 6));
  const exhausts = [new THREE.Vector3(-0.3, 0.46, -1.58), new THREE.Vector3(0.3, 0.46, -1.58)];
  for (const e of exhausts) exhaust(g, e, 0.55, 0.075, -0.15);
  return { shell: baked(g, 'shell'), wheelR: 0.42, wheelW: [0.36, 0.46], front: [0.88, 0.95], rear: [0.92, -0.95], seatY: 0.56, wheelAt: [0, 0.98, 0.28], knobbly: false, exhausts };
}

function buggy(main: THREE.Material, trim: THREE.Material, plateM: THREE.Material): BodyParts {
  const g = new THREE.Group();
  const dark = plastic();
  // A rounded tub riding high between big wheels.
  g.add(at(side([[1.32, 0.42], [1.38, 0.7, 0.2], [1.0, 0.86, 0.3], [0.4, 0.84, 0.2], [-0.9, 0.84, 0.2], [-1.12, 0.66, 0.15], [-1.08, 0.42]], 1.1, 0.16, main, 0.2), 0, 0, 0));
  g.add(at(side([[1.0, 0.86, 0.3], [0.4, 0.86, 0.2], [0.42, 0.98], [0.95, 0.95]], 0.7, 0.06, trim, 0.12), 0, 0.0, 0));
  g.add(at(plan(rect(-0.62, -1.1, 0.62, 1.3), 0.12, 0.04, dark, 0.25), 0, 0.36, 0));
  // Suspension arms out to the wheels.
  for (const s of [-1, 1]) for (const z of [0.85, -0.85]) {
    g.add(tube([[s * 0.4, 0.5, z + 0.12], [s * 0.82, 0.55, z]], 0.035, dark, 2, 6));
    g.add(tube([[s * 0.4, 0.62, z - 0.12], [s * 0.82, 0.58, z]], 0.035, dark, 2, 6));
  }
  // Front bash bar with headlights.
  g.add(tube([[-0.62, 0.48, 1.44], [-0.5, 0.42, 1.62], [0.5, 0.42, 1.62], [0.62, 0.48, 1.44]], 0.05, chrome(), 14, 6));
  headlights(g, [[-0.38, 0.72, 1.4], [0.38, 0.72, 1.4]], 0.1);
  // Roll cage behind the driver's head, with a light bar on top.
  for (const s of [-1, 1]) g.add(tube([[s * 0.5, 0.82, -0.85], [s * 0.58, 1.9, -0.95], [s * 0.5, 2.5, -1.0]], 0.05, trim, 10, 8));
  g.add(tube([[-0.5, 2.5, -1.0], [-0.25, 2.62, -1.0], [0.25, 2.62, -1.0], [0.5, 2.5, -1.0]], 0.05, trim, 12, 8));
  for (const s of [-1, 1]) g.add(tube([[s * 0.56, 1.8, -0.95], [s * 0.5, 1.3, -1.2], [s * 0.45, 0.85, -1.15]], 0.04, trim, 8, 6));
  g.add(at(plan(rect(-0.4, -0.06, 0.4, 0.06), 0.12, 0.03, dark, 0.05), 0, 2.6, -1.0));
  for (const x of [-0.25, 0, 0.25]) g.add(at(scaled(orb(0.055, HEADLIGHT, 10, 8), 1, 1, 0.5), x, 2.66, -0.93));
  // Seat.
  g.add(at(side([[0.25, 0], [0.25, 0.14], [-0.3, 0.14], [-0.3, 0]], 0.8, 0.06, dark, 0.06), 0, 0.64, -0.3));
  g.add(at(side([[-0.38, 0], [-0.32, 0.72, 0.1], [-0.48, 0.76, 0.1], [-0.56, 0]], 0.82, 0.08, dark, 0.1), 0, 0.64, -0.2));
  // Engine out back, one big pipe.
  g.add(at(plan(rect(-0.36, -1.35, 0.36, -0.95), 0.36, 0.08, chrome('#7d838d'), 0.12), 0, 0.5, 0));
  for (let i = 0; i < 4; i++) g.add(at(plan(rect(-0.3, -0.02, 0.3, 0.02), 0.05, 0.01, chrome('#c3c9d2'), 0.01), 0, 0.9 + 0, -1.0 - i * 0.1));
  taillights(g, [[-0.45, 0.55, -1.27], [0.45, 0.55, -1.27]], 0.16, 0.12);
  plate(g, 0, 0.68, -1.45, plateM);
  g.add(tube([[0, 0.98, 0.95], [0, 1.08, 0.6], [0, 1.18, 0.42]], 0.035, dark, 6, 6));
  const exhausts = [new THREE.Vector3(0, 0.72, -1.42)];
  exhaust(g, exhausts[0], 0.5, 0.1, -0.45);
  return { shell: baked(g, 'shell'), wheelR: 0.55, wheelW: [0.42, 0.5], front: [0.88, 0.85], rear: [0.92, -0.85], seatY: 0.78, wheelAt: [0, 1.2, 0.36], knobbly: true, exhausts };
}

function truck(main: THREE.Material, trim: THREE.Material, plateM: THREE.Material): BodyParts {
  const g = new THREE.Group();
  const dark = plastic();
  // Frame rails, axles and coil springs.
  for (const s of [-1, 1]) g.add(at(plan(rect(-0.07, -1.5, 0.07, 1.5), 0.14, 0.03, dark, 0.05), s * 0.42, 0.62, 0));
  for (const z of [1.0, -1.0]) {
    g.add(at(rod(0.08, 1.9, chrome('#8b9099'), 10), 0, 0.7, z, 0, 0, Math.PI / 2));
    g.add(at(plan(rect(-0.25, -0.15, 0.25, 0.15), 0.22, 0.06, chrome('#8b9099'), 0.08), 0, 0.59, z));
    for (const s of [-1, 1]) {
      const coil: number[][] = [];
      for (let i = 0; i <= 20; i++) coil.push([s * 0.55 + Math.cos(i * 0.9) * 0.09, 0.72 + i * 0.023, z + Math.sin(i * 0.8) * 0.09]);
      g.add(tube(coil, 0.024, chrome('#f2c94c'), 30, 4));
    }
  }
  // The shell: hood in front, open cockpit, a bed behind.
  g.add(at(side([[1.62, 0.82], [1.68, 1.22, 0.15], [1.35, 1.42, 0.25], [0.5, 1.46, 0.15], [0.38, 1.1, 0.1], [-0.62, 1.1, 0.1], [-0.72, 1.48, 0.12], [-1.5, 1.44, 0.2], [-1.62, 1.2, 0.12], [-1.58, 0.82]], 1.36, 0.15, main, 0.12), 0, 0, 0));
  g.add(at(side([[1.6, 1.08], [1.66, 1.24], [1.0, 1.38], [1.0, 1.2]], 1.4, 0.04, trim, 0.06), 0, 0, 0));
  // Big wheel arches.
  for (const s of [-1, 1]) for (const [z, wr] of [[1.0, 0.7], [-1.0, 0.756]]) g.add(at(fender(wr + 0.08, 0.1, 0.64, 0.15, Math.PI - 0.15, trim), s * 0.98, wr, z));
  // Grille, bull bar and headlights.
  g.add(at(plan(rect(-0.5, 1.7, 0.5, 1.78), 0.32, 0.04, dark, 0.06), 0, 0.88, 0));
  for (let i = 0; i < 3; i++) g.add(at(rod(0.025, 0.95, chrome(), 6), 0, 0.96 + i * 0.09, 1.79, 0, 0, Math.PI / 2));
  g.add(tube([[-0.8, 0.7, 1.6], [-0.7, 0.72, 1.95], [0.7, 0.72, 1.95], [0.8, 0.7, 1.6]], 0.06, chrome(), 14, 6));
  headlights(g, [[-0.58, 1.1, 1.76], [0.58, 1.1, 1.76]], 0.12);
  // Roll bar behind the seat with a row of lights.
  g.add(tube([[-0.68, 1.4, -0.72], [-0.6, 2.35, -0.95], [0, 2.5, -1.0], [0.6, 2.35, -0.95], [0.68, 1.4, -0.72]], 0.06, chrome('#3a3d46'), 18, 6));
  for (const x of [-0.3, 0, 0.3]) g.add(at(scaled(orb(0.075, HEADLIGHT, 10, 8), 1, 1, 0.5), x, 2.5, -0.93));
  // Seat.
  g.add(at(side([[0.25, 0], [0.25, 0.14], [-0.3, 0.14], [-0.3, 0]], 0.84, 0.06, dark, 0.06), 0, 1.16, -0.3));
  g.add(at(side([[-0.38, 0], [-0.3, 0.8, 0.1], [-0.46, 0.84, 0.1], [-0.56, 0]], 0.86, 0.08, dark, 0.1), 0, 1.16, -0.2));
  taillights(g, [[-0.5, 1.2, -1.78], [0.5, 1.2, -1.78]], 0.26, 0.13);
  // A tailgate stripe and a chrome step bumper.
  g.add(at(plan(rect(-0.62, -0.03, 0.62, 0.03), 0.07, 0.02, trim, 0.03), 0, 1.36, -1.77));
  g.add(tube([[-0.8, 0.84, -1.75], [-0.7, 0.8, -1.95], [0.7, 0.8, -1.95], [0.8, 0.84, -1.75]], 0.055, chrome(), 14, 6));
  plate(g, 0, 1.02, -1.78, plateM);
  g.add(at(plan(rect(-0.85, -1.85, 0.85, -1.62), 0.18, 0.06, dark, 0.08), 0, 0.72, 0));
  g.add(tube([[0, 1.3, 0.5], [0, 1.6, 0.35], [0, 1.74, 0.24]], 0.035, dark, 6, 6));
  // Exhaust stacks up the back corners.
  const exhausts = [new THREE.Vector3(-0.6, 2.0, -1.12), new THREE.Vector3(0.6, 2.0, -1.12)];
  for (const e of exhausts) {
    g.add(at(turn([[0.09, 0], [0.09, 0.85], [0.11, 0.88], [0.11, 0.98], [0.09, 1.0]], chrome(), 14), e.x, 1.0, -1.05));
    g.add(at(turn([[0.1, 0], [0.1, 0.1]], chrome(), 14), e.x, 1.98, -1.05, -0.9, 0, 0));
  }
  return { shell: baked(g, 'shell'), wheelR: 0.7, wheelW: [0.52, 0.58], front: [0.98, 1.0], rear: [0.98, -1.0], seatY: 1.34, wheelAt: [0, 1.76, 0.22], knobbly: true, exhausts };
}

/** A three-spoke steering wheel in the xy plane, its axis along z. */
function steeringWheel(accent: string) {
  const g = new THREE.Group();
  const dark = plastic('#22232b');
  g.add(mk(new THREE.TorusGeometry(0.2, 0.035, 6, 18), dark));
  for (const a of [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 - (Math.PI * 2) / 3]) {
    const s = mk(new THREE.BoxGeometry(0.2, 0.035, 0.025), dark);
    s.position.set(Math.cos(a + Math.PI) * 0.1, Math.sin(a + Math.PI) * 0.1, 0);
    s.rotation.z = a;
    g.add(s);
  }
  g.add(at(rod(0.065, 0.06, plastic(accent), 14), 0, 0, 0, Math.PI / 2, 0, 0));
  return baked(g, 'steering');
}

// ---------------------------------------------------------------- shield

const shieldMaterial = shareResource(new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#7fd8ff') } },
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
      float swirl = 0.5 + 0.5 * sin(vNormal.y * 8.0 + uTime * 3.0 + vNormal.x * 5.0);
      vec3 col = mix(uColor, vec3(1.0, 0.6, 1.0), swirl * 0.5);
      gl_FragColor = vec4(col * (rim * 1.4 + 0.06), 1.0);
    }`,
}));
export const shieldUniforms = shieldMaterial.uniforms;

// Shared by every kart, so never freed with one.
const shadowMaterial = shareResource(new THREE.MeshBasicMaterial({ map: tex.blob(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
const shadowGeometry = shareResource(new THREE.PlaneGeometry(3.4, 4.2).rotateX(-Math.PI / 2));
const ringGeometry = shareResource(new THREE.RingGeometry(1.55, 1.95, 32).rotateX(-Math.PI / 2));

function rocketBooster() {
  const g = new THREE.Group();
  const body = paint('#e8eaf0');
  const red = paint('#e63946');
  g.add(at(rod(0.38, 1.6, body, 18), 0, 0, 0, Math.PI / 2, 0, 0));
  g.add(at(cone(0.38, 0.6, red, 18), 0, 0, 0.8, Math.PI / 2, 0, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.5), red), Math.cos(a) * 0.45, Math.sin(a) * 0.45, -0.6, 0, 0, a));
  }
  const out = baked(g, 'rocket');
  out.position.set(0, 1.2, -1.2);
  out.visible = false;
  return out;
}

// ---------------------------------------------------------------- build

export function buildKart(character: { id: string; color: string; accent: string }, bodyId: string, player: { label: string; color: string } | null, tagLayer = 0): KartRig {
  const main = paint(character.color);
  const trim = paint(character.accent);
  const plateM = player ? plateMat(player.label, player.color, '#ffffff') : plateMat(characterById(character.id).name.toUpperCase(), '#f4f1ea', '#22232b');
  const parts = bodyId === 'buggy' ? buggy(main, trim, plateM) : bodyId === 'truck' ? truck(main, trim, plateM) : racer(main, trim, plateM);

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const body = new THREE.Group();
  const sprung = new THREE.Group();
  root.add(tilt);
  tilt.add(body);
  body.add(sprung);
  sprung.add(parts.shell);

  // The driver, sat in the seat.
  const driver = new THREE.Group();
  driver.position.set(0, parts.seatY, -0.3);
  sprung.add(driver);
  const { torso, key } = buildTorso(character.id, character.color, character.accent);
  driver.add(torso);
  const hd = buildHead(character.id, character.color, character.accent);
  const head = new THREE.Group();
  head.position.set(0, 1.1, 0.02);
  const headMesh = baked(hd.group, 'head');
  head.add(headMesh);
  // Eyes blink by squashing about their own middle, so they hang under a pivot at eye height.
  let eyes: THREE.Group | null = null;
  if (hd.eyes.children.length) {
    const cy = hd.eyes.children.reduce((sum, e) => sum + e.position.y, 0) / hd.eyes.children.length;
    const b = baked(hd.eyes, 'eyes');
    b.position.y = -cy;
    eyes = new THREE.Group();
    eyes.position.y = cy;
    eyes.add(b);
  }
  const catchlights = hd.catches.children.length ? baked(hd.catches, 'catchlights') : null;
  for (const o of [eyes, catchlights]) if (o) {
    o.traverse((m) => (m.castShadow = false));
    head.add(o);
  }
  driver.add(head);

  // Steering wheel, tilted back toward the driver, and arms reaching for it.
  const column = new THREE.Group();
  column.position.set(...parts.wheelAt);
  column.rotation.x = -0.55;
  const steering = steeringWheel(character.accent);
  column.add(steering);
  sprung.add(column);
  const grips = [-1, 1].map((s) => new THREE.Vector3(-s * Math.sin(1.1) * 0.2, Math.cos(1.1) * 0.2, 0));
  const arms: KartArm[] = [-1, 1].map((s) => {
    const shoulder = new THREE.Vector3(-s * 0.3, 0.58, 0.05);
    // Rest length: shoulder to grip with the wheel straight.
    const hand = grips[(s + 1) / 2].clone().applyEuler(column.rotation).add(column.position).sub(driver.position);
    const length = shoulder.distanceTo(hand);
    const mesh = buildArm(character.color, character.accent, length);
    sprung.add(mesh);
    return { mesh, shoulder, side: s, length };
  });

  const wheels: THREE.Object3D[] = [];
  const front: THREE.Object3D[] = [];
  const rearWheels: THREE.Vector3[] = [];
  const r = parts.wheelR;
  for (const [x, z, isFront] of [
    [parts.front[0], parts.front[1], true],
    [-parts.front[0], parts.front[1], true],
    [parts.rear[0], parts.rear[1], false],
    [-parts.rear[0], parts.rear[1], false],
  ] as [number, number, boolean][]) {
    const wr = isFront ? r : r * 1.08;
    const holder = new THREE.Group();
    holder.position.set(x, wr, z);
    const w = wheel(wr, isFront ? parts.wheelW[0] : parts.wheelW[1], character.color, parts.knobbly);
    // Left wheels are the right ones turned round, so their faces point out.
    if (x < 0) w.rotation.y = Math.PI;
    holder.add(w);
    body.add(holder);
    wheels.push(w);
    if (isFront) front.push(holder);
    else rearWheels.push(new THREE.Vector3(x, 0.05, z));
  }
  const rocket = rocketBooster();
  body.add(rocket);

  // Everything that can glow during a Sugar Rush: the baked paint and vinyl.
  const paintList: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && (o as THREE.Mesh).isMesh && m.userData?.paint && !paintList.includes(m)) paintList.push(m);
  });

  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 16), shieldMaterial);
  shield.position.y = 1 + (parts.seatY - 0.56) * 0.6;
  shield.visible = false;
  root.add(shield);

  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.renderOrder = 1;

  let ring: THREE.Mesh | null = null;
  let tag: THREE.Sprite | null = null;
  if (player) {
    ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: player.color, transparent: true, opacity: 0.75, depthWrite: false }));
    ring.position.y = 0.08;
    root.add(ring);
    // The same size on screen however far away, so a tag never fills the view of the kart right behind.
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.tag(player.label, player.color), depthTest: false, transparent: true, sizeAttenuation: false }));
    tag.scale.set(0.075, 0.056, 1);
    tag.position.y = parts.seatY + 3.1;
    tag.renderOrder = 10;
    tag.layers.set(tagLayer);
    root.add(tag);
  }

  return {
    root, tilt, body, sprung, driver, head, steering, grips, arms, eyes, catchlights, key, seatY: parts.seatY,
    wheels, front, exhausts: parts.exhausts, rearWheels, shield, shadow, ring, tag, rocket,
    paint: paintList, wheelRadius: r, anim: newKartAnim(),
  };
}


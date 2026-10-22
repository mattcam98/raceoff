/**
 * Builds a track's scenery from its compiled form: the floor, the roads and
 * curbs, walls, ramps, pads, puddles, props and moving hazards. Everything
 * that never moves is merged into a few big meshes; the rest is updated each
 * frame from the race.
 */
import * as THREE from 'three';
import { hazardAt, rightX, rightZ, SURF, type HazardState, type Track, type TrackPath } from '@raceoff/game';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { at, bake, ball, box, cone, cyl, decal, disposeTree, group, mat, slab } from './kit';
import { buildProp } from './props';
import { roomUniforms } from './rooms';
import { bumpFrom, roughFrom, withRelief } from './surface';
import { tex } from './textures';
import { themeFor, type Theme } from './themes';

export interface World {
  group: THREE.Group;
  theme: Theme;
  update(time: number, dt: number, hazards: HazardState[]): void;
  dispose(): void;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- strips

interface StripPoint {
  lx: number;
  lz: number;
  ly: number;
  rx: number;
  rz: number;
  ry: number;
  v: number;
}

/** A ribbon through pairs of left/right points; u runs 0 (left) to 1 (right). Breaks where a point is null. */
function strip(points: (StripPoint | null)[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let prev = -1;
  for (const p of points) {
    if (!p) {
      prev = -1;
      continue;
    }
    const base = pos.length / 3;
    pos.push(p.lx, p.ly, p.lz, p.rx, p.ry, p.rz);
    uv.push(0, p.v, 1, p.v);
    if (prev >= 0) idx.push(prev, prev + 1, base, prev + 1, base + 1, base);
    prev = base;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function inGap(track: Track, p: TrackPath, d: number) {
  for (const r of track.ramps) if (r.path === p.index && r.gap > 0 && d > r.d1 + 0.5 && d < r.d1 + r.gap - 0.5) return true;
  return false;
}

function roadMesh(track: Track, p: TrackPath, theme: Theme): THREE.Object3D {
  const S = p.samples;
  const n = p.closed ? S.length + 1 : S.length;
  const pts: (StripPoint | null)[] = [];
  for (let i = 0; i < n; i++) {
    const s = S[i % S.length];
    const d = p.closed && i === S.length ? p.length : s.d;
    if (inGap(track, p, d)) {
      pts.push(null);
      continue;
    }
    const hw = s.w / 2;
    const y = s.y + 0.05;
    pts.push({ lx: s.x - rightX(s.h) * hw, lz: s.z - rightZ(s.h) * hw, ly: y, rx: s.x + rightX(s.h) * hw, rz: s.z + rightZ(s.h) * hw, ry: y, v: d / 12 });
  }
  let material: THREE.Material;
  if (p.surface === SURF.road) {
    const map = tex.road(theme.road.base, theme.road.line, theme.road.dash, theme.road.edge);
    // Stones in the asphalt catch the light; the paint is smoother than the road it is on.
    material = new THREE.MeshStandardMaterial({ map, normalMap: bumpFrom(map, 2.2), roughnessMap: roughFrom(map, 0.98, 0.5), roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
  } else material = p.surface === SURF.sand ? mat('#ffffff', { map: tex.sand() }) : theme.roughRoad();
  const m = new THREE.Mesh(strip(pts), material);
  m.receiveShadow = true;
  return m;
}

/** Side faces under raised road, down to the floor. */
function skirts(track: Track, p: TrackPath, theme: Theme): THREE.Object3D | null {
  const floor = track.def.floorY;
  const S = p.samples;
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const pts: (StripPoint | null)[] = [];
    const n = p.closed ? S.length + 1 : S.length;
    for (let i = 0; i < n; i++) {
      const s = S[i % S.length];
      if (s.y < floor + 0.4 || inGap(track, p, s.d)) {
        pts.push(null);
        continue;
      }
      const off = (side * s.w) / 2;
      const x = s.x + rightX(s.h) * off;
      const z = s.z + rightZ(s.h) * off;
      pts.push(side > 0 ? { lx: x, lz: z, ly: s.y + 0.05, rx: x, rz: z, ry: floor, v: s.d / 6 } : { lx: x, lz: z, ly: floor, rx: x, rz: z, ry: s.y + 0.05, v: s.d / 6 });
    }
    const geo = strip(pts);
    if (geo.index!.count) {
      const m = new THREE.Mesh(geo, theme.skirt());
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
  }
  return g.children.length ? g : null;
}

/** Rumble strips along open edges: a raised, rounded kerb in two colours, bevelled down to the road on both sides. */
function curbs(p: TrackPath, theme: Theme): THREE.Object3D {
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ map: tex.curb(theme.curb[0], theme.curb[1]), roughness: 0.45 });
  // Across the kerb from the road side out: [offset from the road's edge, height].
  const profile: [number, number][] = [[-0.25, 0.06], [0.15, 0.24], [0.95, 0.24], [1.35, 0.06]];
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'right' ? 1 : -1;
    const S = p.samples;
    const n = p.closed ? S.length + 1 : S.length;
    for (let band = 0; band + 1 < profile.length; band++) {
      const pts: (StripPoint | null)[] = [];
      for (let i = 0; i < n; i++) {
        const s = S[i % S.length];
        if (s[side] !== 'open') {
          pts.push(null);
          continue;
        }
        const [oa, ya] = profile[band];
        const [ob, yb] = profile[band + 1];
        const a = (s.w / 2 + oa) * sign;
        const b = (s.w / 2 + ob) * sign;
        const inner = { x: s.x + rightX(s.h) * a, z: s.z + rightZ(s.h) * a, y: s.y + ya };
        const outer = { x: s.x + rightX(s.h) * b, z: s.z + rightZ(s.h) * b, y: s.y + yb };
        const [L, R] = sign > 0 ? [inner, outer] : [outer, inner];
        pts.push({ lx: L.x, lz: L.z, ly: L.y, rx: R.x, rz: R.z, ry: R.y, v: s.d / 4 });
      }
      const geo = strip(pts);
      if (geo.index!.count) {
        const m = new THREE.Mesh(geo, material);
        m.receiveShadow = true;
        g.add(m);
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------- walls

/** One instanced layer of a wall piece. Tinted layers take each piece's colour; the rest keep their own. */
interface WallLayer {
  geo: THREE.BufferGeometry;
  material: THREE.Material;
  tint: boolean;
}

interface WallKind {
  layers: WallLayer[];
  spacing: number;
  colors: string[];
  /** Turn each piece to lie along the wall. */
  along: boolean;
  jitter: number;
  stack?: number;
}

/** Colour every vertex of a geometry, so parts of different colours can merge into one instanced layer. */
function painted(geo: THREE.BufferGeometry, color: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
  return g;
}

/** Painted once: the relief maps made from them are cached by texture, so a new one each world would pile up. */
let crystal: THREE.Texture | null = null;
let tread: THREE.Texture | null = null;

/** A little crystalline relief, for sugar and salt. */
function crystalTexture() {
  if (crystal) return crystal;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 128, 128);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const v = Math.floor(80 + r() * 150);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    const x = r() * 128;
    const y = r() * 128;
    const s = 2 + r() * 6;
    g.moveTo(x, y - s);
    g.lineTo(x + s, y);
    g.lineTo(x, y + s * 0.8);
    g.lineTo(x - s * 0.9, y + 0.2);
    g.fill();
  }
  crystal = new THREE.CanvasTexture(c);
  crystal.wrapS = crystal.wrapT = THREE.RepeatWrapping;
  return crystal;
}

/** Tyre tread, wrapped round the torus. */
function treadTexture() {
  if (tread) return tread;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#000000';
  for (let x = 0; x < 256; x += 8) {
    g.beginPath();
    g.moveTo(x, 18);
    g.lineTo(x + 4, 32);
    g.lineTo(x, 46);
    g.lineTo(x + 3, 46);
    g.lineTo(x + 7, 32);
    g.lineTo(x + 3, 18);
    g.fill();
  }
  tread = new THREE.CanvasTexture(c);
  tread.wrapS = tread.wrapT = THREE.RepeatWrapping;
  return tread;
}

function wallKind(style: string): WallKind {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  switch (style) {
    case 'sugar': {
      const t = crystalTexture();
      const m = std({ roughness: 0.5, normalMap: bumpFrom(t, 3), roughnessMap: roughFrom(t, 0.75, 0.25) });
      return { layers: [{ geo: new RoundedBoxGeometry(2.8, 2.8, 2.8, 2, 0.3).translate(0, 1.4, 0), material: m, tint: true }], spacing: 3, colors: ['#ffffff', '#fbf6ec', '#f2f2f2'], along: true, jitter: 0.25 };
    }
    case 'pencil': {
      // Lying along the wall: a painted hexagonal body, a sharpened wooden cone with graphite, a ferrule and an eraser.
      const lay = (g: THREE.BufferGeometry, z: number) => g.rotateX(Math.PI / 2).translate(0, 1, z);
      const body = lay(new THREE.CylinderGeometry(1, 1, 5.2, 6), -0.4);
      const ends = mergeGeometries([
        painted(lay(new THREE.CylinderGeometry(0.32, 1, 1, 6), 2.7), '#e8c28f'),
        painted(lay(new THREE.CylinderGeometry(0.02, 0.32, 0.45, 6), 3.42), '#34343c'),
        painted(lay(new THREE.CylinderGeometry(1.03, 1.03, 0.55, 12), -3.27), '#c9ced6'),
        painted(lay(new THREE.CylinderGeometry(0.95, 0.95, 0.5, 12), -3.8), '#ff8fa3'),
      ]);
      return {
        layers: [
          { geo: body, material: std({ roughness: 0.35, flatShading: true }), tint: true },
          { geo: ends, material: std({ roughness: 0.6, vertexColors: true }), tint: false },
        ],
        spacing: 8.2, colors: ['#ffcc00', '#ef476f', '#3d9bff', '#06d6a0', '#9b5de5', '#ff8c1a'], along: true, jitter: 0,
      };
    }
    case 'block': {
      const grain = bumpFrom(tex.wood('#808080', '#404040', 3), 1.2);
      return { layers: [{ geo: new RoundedBoxGeometry(3, 3, 3, 2, 0.28).translate(0, 1.5, 0), material: std({ roughness: 0.42, normalMap: grain }), tint: true }], spacing: 3.1, colors: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5'], along: true, jitter: 0 };
    }
    case 'tire': {
      const t = treadTexture();
      const m = std({ roughness: 0.85, normalMap: bumpFrom(t, 4, false, 1) });
      return { layers: [{ geo: new THREE.TorusGeometry(1.15, 0.6, 12, 28).rotateX(Math.PI / 2).translate(0, 0.6, 0), material: m, tint: true }], spacing: 3.4, colors: ['#26272e', '#1d1e24', '#ffd23f'], along: false, jitter: 0, stack: 2 };
    }
    case 'soap':
      return { layers: [{ geo: new THREE.CapsuleGeometry(0.9, 1.6, 6, 16).rotateZ(Math.PI / 2).translate(0, 0.9, 0), material: new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }), tint: true }], spacing: 3.6, colors: ['#ffb3c6', '#bde0fe', '#caffbf', '#fdffb6', '#ffd6a5'], along: true, jitter: 0.1 };
    case 'stone': {
      // A pebble: a lumpy icosahedron, the same lumps every time.
      const geo = new THREE.IcosahedronGeometry(1.6, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const k = 1 + 0.12 * Math.sin(x * 3.1 + z * 1.7) + 0.08 * Math.cos(y * 4.3 + x);
        pos.setXYZ(i, x * k, y * k, z * k);
      }
      geo.computeVertexNormals();
      return { layers: [{ geo: geo.scale(1, 0.72, 1).translate(0, 1, 0), material: std({ roughness: 0.92, flatShading: true }), tint: true }], spacing: 2.6, colors: ['#9a9a9a', '#b0aaa0', '#8a8f96', '#c2b8a8'], along: false, jitter: 0.6 };
    }
    default:
      return { layers: [{ geo: new RoundedBoxGeometry(1, 1.6, 3.2, 2, 0.15).translate(0, 0.8, 0), material: std({ roughness: 0.4 }), tint: true }], spacing: 3.2, colors: ['#ff4d2e', '#ffffff'], along: true, jitter: 0 };
  }
}

function walls(track: Track, style: string): THREE.Object3D {
  const kind = wallKind(style);
  const spots: { x: number; y: number; z: number; h: number }[] = [];
  for (const w of track.walls) {
    if (w.side === 'extra') continue;
    let carry = 0;
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const a = w.pts[i];
      const b = w.pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const h = Math.atan2(b.x - a.x, b.z - a.z);
      let t = carry;
      while (t < len) {
        const f = t / len;
        spots.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, h });
        t += kind.spacing;
      }
      carry = t - len;
    }
  }
  const stack = kind.stack ?? 1;
  const layers = kind.layers.map((l) => new THREE.InstancedMesh(l.geo, l.material, spots.length * stack));
  let k = 0;
  let seed = 1;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  spots.forEach((s, i) => {
    for (let j = 0; j < stack; j++) {
      const yaw = (kind.along ? s.h : r() * Math.PI) + (r() - 0.5) * kind.jitter;
      tmpQ.setFromAxisAngle(UP, yaw);
      tmpP.set(s.x, s.y + j * 1.2, s.z);
      tmpS.set(1, 1, 1);
      tmpM.compose(tmpP, tmpQ, tmpS);
      const color = j === stack - 1 && style === 'tire' && i % 4 === 0 ? kind.colors[2] : kind.colors[(i + j) % (style === 'tire' ? 2 : kind.colors.length)];
      layers.forEach((inst, li) => {
        inst.setMatrixAt(k, tmpM);
        if (kind.layers[li].tint) inst.setColorAt(k, tmpC.set(color));
      });
      k++;
    }
  });
  const g = new THREE.Group();
  for (const inst of layers) {
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.userData.dynamic = true;
    g.add(inst);
  }
  // Extra walls are a simple low barrier.
  for (const w of track.walls) {
    if (w.side !== 'extra') continue;
    const a = w.pts[0];
    const b = w.pts[1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    g.add(at(box(2, 3, len, mat('#c8c8d2', { shiny: 20 })), (a.x + b.x) / 2, a.y, (a.z + b.z) / 2, 0, Math.atan2(b.x - a.x, b.z - a.z), 0));
  }
  return g;
}

// ---------------------------------------------------------------- ramps, pads, start line

function rampMesh(look: string, p: TrackPath, d0: number, d1: number, h: number): THREE.Object3D {
  const S = p.samples;
  const step = p.length / (p.closed ? S.length : S.length - 1);
  const at = (d: number) => {
    const i = Math.round(d / step);
    return p.closed ? S[((i % S.length) + S.length) % S.length] : S[Math.max(0, Math.min(S.length - 1, i))];
  };
  const top: StripPoint[] = [];
  const left: StripPoint[] = [];
  const right: StripPoint[] = [];
  const N = Math.max(4, Math.ceil(d1 - d0));
  for (let i = 0; i <= N; i++) {
    const d = d0 + ((d1 - d0) * i) / N;
    const s = at(d);
    const hw = s.w / 2 + 0.4;
    const y0 = s.y + 0.06;
    const y = y0 + (h * i) / N;
    const L = { x: s.x - rightX(s.h) * hw, z: s.z - rightZ(s.h) * hw };
    const R = { x: s.x + rightX(s.h) * hw, z: s.z + rightZ(s.h) * hw };
    top.push({ lx: L.x, lz: L.z, ly: y, rx: R.x, rz: R.z, ry: y, v: i / N });
    left.push({ lx: L.x, lz: L.z, ly: y0, rx: L.x, rz: L.z, ry: y, v: i / N });
    right.push({ lx: R.x, lz: R.z, ly: y, rx: R.x, rz: R.z, ry: y0, v: i / N });
  }
  const last = top[top.length - 1];
  const s1 = at(d1);
  const y0 = s1.y + 0.06;
  const lip: StripPoint[] = [
    { lx: last.rx, lz: last.rz, ly: y0, rx: last.lx, rz: last.lz, ry: y0, v: 0 },
    { lx: last.rx, lz: last.rz, ly: last.ly, rx: last.lx, rz: last.lz, ry: last.ly, v: 1 },
  ];
  const surface =
    look === 'toast' ? mat('#ffffff', { map: tex.toast() })
    : look === 'book' ? mat('#ffffff', { map: tex.book('#e63946') })
    : look === 'sponge' ? mat('#ffe66d')
    : look === 'sand' ? mat('#ffffff', { map: tex.sand() })
    : look === 'plank' ? mat('#ffffff', { map: tex.wood('#c79a5d', '#8a6233', 2) })
    : mat('#ffffff', { map: tex.stripes('#ff4d2e', '#ffffff', 6) });
  const side = look === 'toast' ? mat('#a8652a') : look === 'sponge' ? mat('#2ec27e') : look === 'book' ? mat('#e63946') : mat('#d0d4dc');
  const g = group(new THREE.Mesh(strip(top), surface), new THREE.Mesh(strip(left), side), new THREE.Mesh(strip(right), side), new THREE.Mesh(strip(lip), side));
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

function gapPit(p: TrackPath, d0: number, d1: number, water: boolean): THREE.Object3D {
  const S = p.samples;
  const step = p.length / (p.closed ? S.length : S.length - 1);
  const pts: StripPoint[] = [];
  for (let d = d0; d <= d1 + 0.01; d += 1) {
    const i = Math.round(d / step);
    const s = p.closed ? S[((i % S.length) + S.length) % S.length] : S[Math.max(0, Math.min(S.length - 1, i))];
    const hw = s.w / 2 + 1.5;
    const y = water ? 0.12 : s.y + 0.03;
    pts.push({ lx: s.x - rightX(s.h) * hw, lz: s.z - rightZ(s.h) * hw, ly: y, rx: s.x + rightX(s.h) * hw, rz: s.z + rightZ(s.h) * hw, ry: y, v: 0 });
  }
  return new THREE.Mesh(strip(pts), water ? zoneMaterial('water', 'water') : mat('#0b0b12'));
}

interface StartLine {
  obj: THREE.Object3D;
  /** Red lamps lit one by one through the countdown; all turn green at GO. */
  lamps: THREE.MeshStandardMaterial[];
}

function startLine(track: Track): StartLine {
  const s = track.pointAt(0, 0);
  const smp = track.sampleAt(0);
  const w = smp.w;
  const g = new THREE.Group();
  const line = decal(w, 3, new THREE.MeshStandardMaterial({ map: tex.checker(10), roughness: 0.5 }), 0.12);
  line.receiveShadow = true;
  g.add(line);
  // A gantry over the line: rounded posts on weighted feet, a banner, and the start lights.
  const postMat = mat('#e8eaf0', { shiny: 60 });
  const dark = mat('#2a2c36', { shiny: 30 });
  const half = w / 2 + 2.5;
  for (const x of [-half, half]) {
    g.add(at(cyl(0.45, 0.55, 12.5, postMat, 16), x, 0, 0));
    g.add(at(slab(2.4, 0.6, 2.4, 0.5, dark), x, 0, 0));
  }
  const banner = tex.label('RACEOFF', '#ff4d2e', '#ffffff', 512, 96);
  const bannerMat = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.55 });
  g.add(at(box(half * 2 + 1, 2.6, 0.6, [postMat, postMat, postMat, postMat, bannerMat, bannerMat]), 0, 10.6, 0));
  g.add(at(box(half * 2 + 1, 0.8, 0.8, new THREE.MeshStandardMaterial({ map: tex.checker(16), roughness: 0.5 })), 0, 13.2, 0));
  // Three lamps in a housing hung under the banner, facing the grid.
  g.add(at(slab(5.4, 1.8, 1.0, 0.4, dark), 0, 8.5, 0));
  const lamps: THREE.MeshStandardMaterial[] = [];
  for (const x of [-1.7, 0, 1.7]) {
    const m = new THREE.MeshStandardMaterial({ color: '#3a1010', emissive: '#ff2a1a', emissiveIntensity: 0, roughness: 0.2 });
    lamps.push(m);
    const lamp = at(ball(0.62, m, 16), x, 9.4, -0.55);
    lamp.userData.dynamic = true;
    g.add(lamp);
  }
  g.position.set(s.x, s.y, s.z);
  g.rotation.y = s.h + Math.PI;
  return { obj: g, lamps };
}

// ---------------------------------------------------------------- zones

/** Liquids are glossy and a little deep; solids (sand, grass) are matte. A fresh material each: worlds free them. */
function zoneMaterial(look: string | undefined, surface: string): THREE.Material {
  const liquid = (color: string, o: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, ...o, transparent: (o.opacity ?? 1) < 1, depthWrite: (o.opacity ?? 1) >= 1 });
  switch (look ?? surface) {
    case 'milk':
      return liquid('#fffaf0', { roughness: 0.3, sheen: 0.5, sheenColor: new THREE.Color('#ffffff') });
    case 'jam':
      return liquid('#9e0c26', { opacity: 0.93 });
    case 'syrup':
      return liquid('#c7701a', { opacity: 0.9 });
    case 'coffee':
      return liquid('#3a2212', { opacity: 0.94 });
    case 'ink':
      return liquid('#1b2a6b', { roughness: 0.05, opacity: 0.95 });
    case 'oil':
    case 'slick':
      return liquid('#0b0b10', { roughness: 0.03, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 600] });
    case 'suds':
      return liquid('#ffffff', { map: tex.bubbles(), opacity: 0.95, roughness: 0.25 });
    case 'water':
    case 'pond':
      return liquid('#2f9ee0', { opacity: 0.78, roughness: 0.02 });
    case 'mud':
    case 'sticky':
      return liquid('#5a3d22', { roughness: 0.45, clearcoat: 0.4 });
    case 'paint':
      return liquid('#3d9bff', { roughness: 0.12 });
    case 'sand':
      return mat('#ffffff', { map: tex.sand() });
    case 'rough':
      return mat('#ffffff', { map: tex.grass() });
    default:
      return mat('#888888');
  }
}

/** An organic puddle outline of the zone's size: never a perfect ellipse. */
function blobShape(rx: number, rz: number, seed: number) {
  const shape = new THREE.Shape();
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + 0.07 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 5 + seed * 2.3) + 0.03 * Math.sin(a * 9 + seed * 0.7);
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * rz * k;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

function zones(track: Track): THREE.Object3D {
  const g = new THREE.Group();
  for (const [i, z] of (track.def.zones ?? []).entries()) {
    if (z.surface === 'void') continue;
    const material = zoneMaterial(z.look, z.surface);
    const flat = z.surface === 'sand' || z.surface === 'rough';
    let geo: THREE.BufferGeometry;
    if (flat) {
      geo = new THREE.ShapeGeometry(blobShape(z.rx, z.rz, i * 1.7), 1).rotateX(-Math.PI / 2);
    } else {
      // A liquid stands a little proud of the ground with a rounded edge, so it catches the light like one.
      const bevel = Math.min(0.6, Math.min(z.rx, z.rz) * 0.12);
      geo = new THREE.ExtrudeGeometry(blobShape(z.rx - bevel, z.rz - bevel, i * 1.7), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.09, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
    }
    const m = new THREE.Mesh(geo, material);
    m.rotation.y = -(z.rot ?? 0);
    // A patch the road runs through lies under the road; a puddle on the road lies on top of it.
    const y = z.surface === 'water' ? track.def.floorY + 0.12 : z.offRoad ? track.def.floorY + 0.025 + i * 0.002 : track.grid.heightAt(z.x, z.z, track.def.floorY) + 0.06 + i * 0.004;
    m.position.set(z.x, y, z.z);
    m.receiveShadow = true;
    m.renderOrder = z.offRoad ? 0 : 2;
    g.add(m);
    if (z.surface === 'water') {
      // A rim of pebbles so the pool reads as sunken water rather than paint.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2), mat('#d9d4c7', { flat: true }));
      ring.scale.set(z.rx, 14, z.rz);
      ring.rotation.y = -(z.rot ?? 0);
      ring.position.set(z.x, track.def.floorY + 0.1, z.z);
      g.add(ring);
    }
  }
  return g;
}

// ---------------------------------------------------------------- hazards

interface HazardView {
  obj: THREE.Object3D;
  parts: THREE.Object3D[];
  warn?: THREE.Mesh;
  update(st: HazardState, time: number): void;
}

function trainCar(color: string, engine: boolean) {
  const g = new THREE.Group();
  const body = mat(color, { shiny: 50 });
  if (engine) {
    g.add(at(box(5.6, 3, 7, body), 0, 1, -0.5));
    g.add(at(cyl(2.2, 2.2, 6, mat('#2b2d42', { shiny: 60 }), 14), 0, 3.6, 1.5, Math.PI / 2, 0, 0));
    g.add(at(box(5.6, 5, 3, body), 0, 4, -2.6));
    g.add(at(cyl(0.7, 1, 2.6, mat('#2b2d42'), 10), 0, 6.4, 3.6));
  } else {
    g.add(at(box(5.6, 3.6, 6.6, body), 0, 1, 0));
    g.add(at(box(5.8, 0.6, 6.8, mat('#ffffff')), 0, 4.6, 0));
  }
  for (const [x, z] of [[-2.9, -2.2], [2.9, -2.2], [-2.9, 2.2], [2.9, 2.2]]) g.add(at(cyl(1.1, 1.1, 0.6, mat('#ffd23f'), 12), x, 1.1, z, 0, 0, Math.PI / 2));
  return g;
}

function buildHazard(track: Track, st: HazardState): HazardView {
  const def = st.def;
  const root = new THREE.Group();
  const y0 = track.def.floorY;
  if (def.kind === 'train') {
    const colors = ['#e63946', '#3d9bff', '#ffd23f', '#06d6a0', '#9b5de5'];
    const parts = st.bodies.map((_, i) => trainCar(colors[i % colors.length], i === 0));
    parts.forEach((p) => root.add(p));
    return {
      obj: root, parts,
      update: (s) => s.bodies.forEach((b, i) => {
        parts[i].position.set(b.x, y0, b.z);
        parts[i].rotation.y = b.h;
      }),
    };
  }
  if (def.kind === 'stomper') {
    // A hinge behind the danger spot, with an arm that swings down over it.
    const arm = new THREE.Group();
    const look = def.look ?? 'stapler';
    const r = def.r;
    const pivotZ = r * 2.2;
    const pivotY = look === 'hammer' ? r * 1.0 : 3.2;
    if (look === 'hammer') {
      arm.add(at(box(1.4, 1.4, pivotZ + r * 0.4, mat('#d4a373')), 0, -0.7, -(pivotZ + r * 0.4) / 2));
      arm.add(at(cyl(r * 0.85, r * 0.85, r * 2, mat('#e63946', { shiny: 50 }), 16), -r, 0, -pivotZ, 0, 0, Math.PI / 2));
      root.add(at(box(3, pivotY + 1, 3, mat('#5c3d2e')), 0, 0, pivotZ));
    } else {
      const c = mat('#2b2d42', { shiny: 70 });
      arm.add(at(slab(r * 1.9, 2.2, pivotZ + r * 1.2, 1, c), 0, -1.4, -(pivotZ + r * 1.2) / 2));
      arm.add(at(box(r * 1.5, 0.5, r * 2.2, mat('#c9ced6', { shiny: 90 })), 0, -1.9, -pivotZ));
      root.add(at(slab(r * 2, 1.2, r * 2.4, 1, c), 0, 0, pivotZ));
      root.add(at(box(2.4, pivotY, 2.4, c), 0, 0, pivotZ));
    }
    arm.position.set(0, pivotY, pivotZ);
    root.add(arm);
    root.position.set(def.x ?? 0, y0, def.z ?? 0);
    const warn = new THREE.Mesh(new THREE.CircleGeometry(r + 0.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff2d55', transparent: true, opacity: 0, depthWrite: false }));
    warn.position.set(def.x ?? 0, y0 + 0.2, def.z ?? 0);
    warn.renderOrder = 3;
    const g = group(root, warn);
    return {
      obj: g, parts: [arm], warn,
      update: (s, time) => {
        const open = look === 'hammer' ? 1.2 : 0.75;
        arm.rotation.x = open * (1 - s.drop) + (s.warning ? Math.sin(time * 40) * 0.04 : 0);
        (warn.material as THREE.MeshBasicMaterial).opacity = s.warning ? 0.35 + 0.25 * Math.sin(time * 18) : s.drop > 0.5 ? 0.15 : 0;
      },
    };
  }
  // Rollers and tops.
  let model: THREE.Object3D;
  const r = def.r;
  const look = def.look ?? (def.kind === 'top' ? 'top' : 'orange');
  if (look === 'top') {
    const t = tex.stripes('#ef476f', '#ffd166', 8);
    model = group(at(cone(r, r * 1.2, mat('#ffffff', { map: t, shiny: 50 }), 20), 0, r * 1.2, 0, Math.PI, 0, 0), at(cyl(r, r, r * 0.4, mat('#06d6a0', { shiny: 50 }), 20), 0, r * 1.2, 0), at(cyl(0.4, 0.4, r * 0.8, mat('#ffffff'), 8), 0, r * 1.6, 0));
  } else if (look === 'paint') {
    model = at(group(at(cyl(r, r, r * 1.8, mat('#c9ced6', { shiny: 90 }), 20), 0, -r * 0.9, 0), at(cyl(r * 1.01, r * 1.01, r, mat('#ffffff', { map: tex.label('PAINT', '#3d9bff', '#ffffff', 256, 64) }), 20), 0, -r * 0.5, 0)), 0, r, 0, 0, 0, Math.PI / 2);
  } else if (look === 'bathbomb') {
    model = at(ball(r, mat('#ffafcc', { flat: true }), 14), 0, r, 0);
  } else if (look === 'football') {
    model = at(ball(r, mat('#ffffff', { map: tex.stripes('#ffffff', '#222222', 8), shiny: 40 }), 20), 0, r, 0);
  } else {
    model = at(ball(r, mat('#ff8c1a', { shiny: 40 }), 20), 0, r, 0);
  }
  const holder = new THREE.Group();
  holder.add(model);
  root.add(holder);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.6, r * 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.blob(), transparent: true, depthWrite: false }));
  shadow.position.y = y0 + 0.15;
  return {
    obj: group(root, shadow), parts: [holder],
    update: (s, time) => {
      const b = s.bodies[0];
      if (!b) return;
      root.position.set(b.x, y0, b.z);
      shadow.position.set(b.x, y0 + 0.15, b.z);
      if (look === 'top') {
        holder.rotation.y = time * 14;
        holder.rotation.z = Math.sin(time * 3) * 0.08;
      } else {
        // Roll along the direction of travel.
        holder.rotation.y = b.h;
        model.rotation.x = s.phase / r;
      }
    },
  };
}

// ---------------------------------------------------------------- build

export function buildWorld(track: Track): World {
  const theme = themeFor(track.def.id);
  const stat = new THREE.Group();
  const dyn = new THREE.Group();

  // The floor the track sits on.
  const f = track.def.floor;
  // A copy: the theme's material is cached and used elsewhere (a rough road of the same stuff), and the
  // floor's texture repeat must not reach those.
  const groundMat = (theme.ground() as THREE.MeshStandardMaterial).clone();
  if (groundMat.map) {
    groundMat.map = groundMat.map.clone();
    groundMat.map.needsUpdate = true;
  }
  if (f) {
    const w = f.maxX - f.minX;
    const d = f.maxZ - f.minZ;
    groundMat.map?.repeat.set(w / theme.groundRepeat, d / theme.groundRepeat);
    withRelief(groundMat, theme.groundRelief);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), groundMat);
    m.position.set((f.minX + f.maxX) / 2, track.def.floorY, (f.minZ + f.maxZ) / 2);
    m.receiveShadow = true;
    stat.add(m);
  } else {
    const size = 1400;
    groundMat.map?.repeat.set(size / theme.groundRepeat, size / theme.groundRepeat);
    withRelief(groundMat, theme.groundRelief);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), groundMat);
    const b = track.bounds;
    m.position.set((b.minX + b.maxX) / 2, track.def.floorY, (b.minZ + b.maxZ) / 2);
    m.receiveShadow = true;
    stat.add(m);
  }
  stat.add(theme.backdrop(track, theme));

  for (const p of track.paths) {
    stat.add(roadMesh(track, p, theme));
    const sk = skirts(track, p, theme);
    if (sk) stat.add(sk);
    stat.add(curbs(p, theme));
  }
  stat.add(walls(track, theme.wall));
  stat.add(zones(track));
  const start = startLine(track);
  stat.add(start.obj);

  for (const r of track.ramps) {
    const p = track.paths[r.path];
    stat.add(rampMesh(r.look, p, r.d0, r.d1, r.h));
    if (r.gap > 0) stat.add(gapPit(p, r.d1 - 0.5, r.d1 + r.gap + 0.5, r.over === 'water'));
  }

  // Boost pads share one scrolling texture.
  const padTex = tex.boostPad().clone();
  padTex.needsUpdate = true;
  // Brighter than white, so the chevrons glow through the bloom.
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, opacity: 0.95, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) });
  for (const pad of track.pads) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pad.hw * 2, pad.hl * 2).rotateX(-Math.PI / 2), padMat);
    m.position.set(pad.x, track.grid.heightAt(pad.x, pad.z, pad.y) + 0.16, pad.z);
    // Turned round so the chevrons point the way you are going.
    m.rotation.y = pad.h + Math.PI;
    m.renderOrder = 2;
    dyn.add(m);
  }

  for (const prop of track.def.props ?? []) {
    const o = buildProp(prop.k, prop.v);
    o.position.set(prop.x, prop.y ?? track.def.floorY, prop.z);
    o.rotation.y = prop.r ?? 0;
    if (prop.s) o.scale.setScalar(prop.s);
    stat.add(o);
  }

  // Train lines get their rails drawn.
  for (const h of track.hazards) {
    if (h.kind !== 'train' || h.motion?.type !== 'loop') continue;
    const pts = h.motion.points;
    const railMat = mat('#9aa0ab', { shiny: 80 });
    const sleeper = mat('#8d6e63');
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      for (const off of [-2.2, 2.2]) stat.add(at(box(0.5, 0.5, len, railMat), mx + Math.cos(yaw) * off, track.def.floorY + 0.4, mz - Math.sin(yaw) * off, 0, yaw, 0));
      for (let t = 0; t < len; t += 3) {
        const x = a[0] + ((b[0] - a[0]) * t) / len;
        const z = a[1] + ((b[1] - a[1]) * t) / len;
        stat.add(at(box(6.4, 0.4, 1.2, sleeper), x, track.def.floorY + 0.1, z, 0, yaw, 0));
      }
    }
  }

  const hazardViews = track.hazards.map((h) => buildHazard(track, hazardAt(h, 0)));
  for (const hv of hazardViews) dyn.add(hv.obj);

  const group = new THREE.Group();
  const baked = bake(stat, 'static');
  baked.traverse((o) => (o.userData.static = true));
  group.add(baked);
  group.add(dyn);

  let disposed = false;
  return {
    group,
    theme,
    update(time, dt, hazards) {
      padTex.offset.y = (padTex.offset.y - dt * 1.6) % 1;
      roomUniforms.uTime.value += dt;
      // Countdown lights: one more red each second from three to go, then all green, fading out after the start.
      const lit = time < -3 ? 0 : time < 0 ? Math.min(3, Math.floor(time + 4)) : 3;
      start.lamps.forEach((m, i) => {
        const go = time >= 0;
        m.emissive.set(go ? '#3dff6a' : '#ff2a1a');
        m.emissiveIntensity = i < lit ? (go ? 6 * Math.max(0.15, 1 - time / 4) : 6) : 0;
      });
      hazards.forEach((h, i) => hazardViews[i]?.update(h, time));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeTree(group);
      padTex.dispose();
    },
  };
}


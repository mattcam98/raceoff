/**
 * The garden: the sandpit's toys and the garden around it. Sizes are in world units at kart scale (a kart
 * is about 2.6 long); each prop stands on y = 0 at its origin and fills the footprint in
 * packages/game/src/track/props.ts. The room-dressing pieces (shed, flowers, grass, fence, tree) are at
 * about 1 unit = 0.5 cm, front facing +z.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { at, group } from './kit';
import { type Builder, chrome, BRASS, extrude, glass, glaze, lumpy, matte, mesh, noise3, plastic, printed, rbox, satin, sphereUV, spline, steel, sweep, turn, v3 } from './propKit';
import { bumps, grain, painted, rand, speckle } from './propTextures';

// ---------------------------------------------------------------- textures

const sandTex = () =>
  painted('g-sand', 256, 256, (g, w, h) => {
    g.fillStyle = '#e2bd7c';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, ['#c99a55', '#f3d9a4', '#b98a4a', '#fff1d0'], [1, 2.5], [0.25, 0.8], 31);
  }, true);
const sandBumps = () => bumps('g-sandn', 256, 256, (g, w, h) => speckle(g, w, h, 6000, ['#000', '#fff'], [1, 3], [0.3, 0.8], 32), 1.6);
const SAND = () => printed(sandTex(), { rough: 0.95, normalMap: sandBumps(), normalScale: 1.2 });

const soilTex = () =>
  painted('g-soil', 128, 128, (g, w, h) => {
    g.fillStyle = '#4a3020';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1400, ['#2e1c10', '#6b4a30', '#7a5a3a'], [1, 4], [0.4, 0.9], 33);
  }, true);

const terracottaTex = () =>
  painted('g-terra', 256, 128, (g, w, h) => {
    g.fillStyle = '#c4683e';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1600, ['#a9532d', '#d98a5e', '#8c4424'], [1, 3], [0.15, 0.5], 34);
    // Weathering: a white bloom low on the pot.
    const grd = g.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, 'rgba(240,225,200,0.35)');
    grd.addColorStop(0.3, 'rgba(240,225,200,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, true);

const barkTex = () =>
  painted('g-bark', 256, 256, (g, w, h) => {
    grain(g, 0, 0, w, h, '#6b4a30', '#2e1d10', 41, 60);
    speckle(g, w, h, 500, ['#8a6a48', '#3b2817'], [1, 4], [0.2, 0.5], 42);
  }, true);
const barkBumps = () =>
  bumps('g-barkn', 256, 256, (g, w, h) => {
    const r = rand(43);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = r() > 0.5 ? '#000' : '#fff';
      g.globalAlpha = 0.5;
      g.lineWidth = 2 + r() * 5;
      g.beginPath();
      const y = r() * h;
      g.moveTo(-10, y);
      for (let x = 0; x <= w + 10; x += 16) g.lineTo(x, y + Math.sin(x / 30 + i) * 4);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, 3);

/** Leafy foliage in near-white shades: each tree tints it green. */
const leafTex = () =>
  painted('g-leaf', 256, 256, (g, w, h) => {
    g.fillStyle = '#b9c2b0';
    g.fillRect(0, 0, w, h);
    const r = rand(44);
    for (let i = 0; i < 900; i++) {
      const s = 0.55 + r() * 0.45;
      g.fillStyle = `rgb(${Math.round(255 * s)},${Math.round(255 * s)},${Math.round(235 * s)})`;
      g.save();
      g.translate(r() * w, r() * h);
      g.rotate(r() * Math.PI);
      g.beginPath();
      g.ellipse(0, 0, 7, 3.2, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }, true);
const leafBumps = () =>
  bumps('g-leafn', 256, 256, (g, w, h) => {
    const r = rand(44);
    for (let i = 0; i < 900; i++) {
      const x = r() * w;
      const y = r() * h;
      const a = r() * Math.PI;
      g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, 0, 7, 3.2, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      r();
    }
  }, 2.5);

/** Vertical wood grain for fence pickets. */
const picketTex = () =>
  painted('g-picket', 512, 256, (g, w, h) => {
    g.save();
    g.translate(w, 0);
    g.rotate(Math.PI / 2);
    grain(g, 0, 0, h, w, '#d9aa6e', '#8a6038', 45, 70);
    g.restore();
  }, true);

/** Shiplap planks for the shed, 8 boards to the sheet. */
const shedPlanks = () =>
  painted('g-shed', 512, 512, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      grain(g, 0, (i * h) / n, w, h / n, '#93ad8e', '#5d7358', 50 + i, 10);
      g.fillStyle = 'rgba(30,45,30,0.55)';
      g.fillRect(0, ((i + 1) * h) / n - 5, w, 5);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, (i * h) / n, w, 3);
    }
  }, true);

/** Vertical boards for the shed door. */
const doorTex = () =>
  painted('g-door', 256, 512, (g, w, h) => {
    const n = 5;
    for (let i = 0; i < n; i++) {
      g.save();
      g.translate(((i + 1) * w) / n, 0);
      g.rotate(Math.PI / 2);
      grain(g, 0, 0, h, w / n, '#7e9a79', '#4d6249', 60 + i, 10);
      g.restore();
      g.fillStyle = 'rgba(20,35,20,0.6)';
      g.fillRect((i * w) / n, 0, 3, h);
    }
  });

const feltTex = () =>
  painted('g-felt', 256, 256, (g, w, h) => {
    g.fillStyle = '#3a3d40';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 4000, ['#55595d', '#26282a', '#6a6f72'], [1, 2.5], [0.3, 0.8], 70);
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, y, w, 4);
    }
  }, true);
const feltBumps = () => bumps('g-feltn', 256, 256, (g, w, h) => {
  speckle(g, w, h, 5000, ['#000', '#fff'], [1, 2], [0.3, 0.7], 71);
  g.fillStyle = '#000';
  for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 4);
}, 2);

const flagTex = () =>
  painted('g-flag', 128, 96, (g, w, h) => {
    g.fillStyle = '#ff4d6d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd23f';
    g.fillRect(0, h * 0.4, w, h * 0.2);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(w * 0.3, h * 0.5, 12, 0, Math.PI * 2);
    g.fill();
  });

const seedTex = () =>
  painted('g-seeds', 128, 128, (g, w, h) => {
    g.fillStyle = '#c98a1c';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 700, ['#6b3e10', '#ffd23f', '#8a5a14'], [2, 5], [0.5, 1], 72);
  });

const gillTex = () =>
  painted('g-gills', 256, 256, (g, w, h) => {
    g.fillStyle = '#efe2c8';
    g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    for (let i = 0; i < 120; i++) {
      g.rotate((Math.PI * 2) / 120);
      g.strokeStyle = i % 2 ? '#bfa984' : '#d7c4a0';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(30, 0);
      g.lineTo(w / 2, 0);
      g.stroke();
    }
  });

const roseTex = () =>
  painted('g-rose', 128, 128, (g, w, h) => {
    g.fillStyle = '#c9ced6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2d33';
    for (let ring = 0; ring < 5; ring++) {
      const n = ring ? ring * 7 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        g.beginPath();
        g.arc(w / 2 + Math.cos(a) * ring * 12, h / 2 + Math.sin(a) * ring * 12, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  });

/** Galvanised steel: the crystalline spangle of zinc. */
const zincTex = () =>
  painted('g-zinc', 256, 256, (g, w, h) => {
    g.fillStyle = '#a9b1b8';
    g.fillRect(0, 0, w, h);
    const r = rand(81);
    for (let i = 0; i < 160; i++) {
      const s = 60 + Math.floor(r() * 50);
      g.fillStyle = `rgb(${s + 100},${s + 108},${s + 116})`;
      g.globalAlpha = 0.5;
      g.beginPath();
      const x = r() * w;
      const y = r() * h;
      for (let k = 0; k < 6; k++) g.lineTo(x + Math.cos(k + r()) * (6 + r() * 16), y + Math.sin(k + r()) * (6 + r() * 16));
      g.fill();
    }
    g.globalAlpha = 1;
  }, true);

const stoneTex = () =>
  painted('g-stone', 256, 128, (g, w, h) => {
    g.fillStyle = '#d6d3cc';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, ['#8f8b84', '#ffffff', '#6d6a64', '#b8b0a2'], [1, 3], [0.2, 0.7], 80);
  }, true);

const bladeTex = () =>
  painted('g-blade', 16, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, '#2f6b1f');
    grd.addColorStop(0.6, '#5fae3a');
    grd.addColorStop(1, '#b7d96a');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });

// ---------------------------------------------------------------- helpers

/** Scale a geometry's uvs, so a repeating texture tiles at the right density. */
function uvScale<G extends THREE.BufferGeometry>(geo: G, su: number, sv: number): G {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

/** Push vertices out from the y axis by smooth noise: a hand-patted, not lathe-perfect, surface. */
function wobble<T extends THREE.Mesh>(m: T, amp: number, freq: number, seed = 1): T {
  const n = noise3(seed);
  const pos = m.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-3) continue;
    const k = 1 + (n(x * freq, y * freq, z * freq) * amp) / r;
    pos.setXYZ(i, x * k, y, z * k);
  }
  m.geometry.computeVertexNormals();
  return m;
}

/** Weld and smooth a thin extruded shape so it shades as one soft surface (petals, leaves). */
function soften(geo: THREE.BufferGeometry, bend: (x: number, y: number) => number) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + bend(pos.getX(i), pos.getY(i)));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
  return g;
}

/** A leaf or petal outline along +y, `len` long and `w` wide. */
function bladeShape(len: number, w: number, pointy = 0.9) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(w * 0.6, len * 0.15, w * 0.55, len * pointy, 0, len);
  s.bezierCurveTo(-w * 0.55, len * pointy, -w * 0.6, len * 0.15, 0, 0);
  return s;
}

/** A soft, cupped leaf or petal lying in x/y, pointing +y, facing +z. `curve`: segments per edge. */
function blade(len: number, w: number, m: THREE.Material, cup = 0.15, curl = 0.02, curve = 6) {
  const e = extrude(bladeShape(len, w), Math.max(0.08, w * 0.05), 0, m, { curve });
  e.geometry = soften(e.geometry, (x, y) => cup * x * x - curl * y * y);
  return e;
}

/** Lay a petal or leaf out from the origin: `yaw` round the stem, `rise` up from flat. */
function radiate(o: THREE.Object3D, yaw: number, rise: number) {
  const p = new THREE.Group();
  o.rotation.x = -Math.PI / 2 + rise;
  p.add(o);
  p.rotation.y = yaw;
  return p;
}

/** A flower head facing +y: a ring of petals round a seeded centre. `curve` 3 is for flowers seen from afar. */
function bloom(color: string, petals = 10, len = 3.6, w = 1.5, rise = 0.35, centre = 1.4, curve = 6) {
  const g = new THREE.Group();
  const pm = satin(color);
  for (let i = 0; i < petals; i++) g.add(radiate(blade(len, w, pm, 0.18, 0.015, curve), (i / petals) * Math.PI * 2 + (i % 2) * 0.1, rise + (i % 2) * 0.12));
  const c = new THREE.SphereGeometry(centre, curve * 2 + 4, curve + 2, 0, Math.PI * 2, 0, Math.PI / 2);
  c.scale(1, 0.55, 1);
  g.add(mesh(c, printed(seedTex(), { rough: 0.8 })));
  // A green calyx underneath.
  g.add(at(turn([[0, -1.2], [0.5, -1.0], [centre * 0.8, -0.1], [0, 0]], satin('#4f8a2e'), curve * 2), 0, 0, 0));
  return g;
}

const STEM = '#4f8a2e';

const scaledBy = <T extends THREE.Object3D>(o: T, k: number) => (o.scale.setScalar(k), o);

/** A stem from the ground up to `top`, gently curved, with a bloom on it and leaves along it. `far`: half the detail. */
function flowerOn(top: THREE.Vector3, color: string, scale = 1, seed = 1, far = false) {
  const curve = far ? 3 : 6;
  const r = rand(seed);
  const g = new THREE.Group();
  const mid = v3(top.x * 0.4 + (r() - 0.5) * 1.5, top.y * 0.55, top.z * 0.4 + (r() - 0.5) * 1.5);
  g.add(sweep([v3(0, 0, 0), mid, top], 0.32 * scale, satin(STEM), far ? 6 : 16, far ? 5 : 6, false));
  const head = bloom(color, 9 + Math.floor(r() * 4), 3.4 * scale, 1.4 * scale, 0.3 + r() * 0.2, 1.2 * scale, curve);
  head.position.copy(top);
  head.rotation.set((r() - 0.5) * 0.6, r() * 6, (r() - 0.5) * 0.6);
  g.add(head);
  for (let i = 0; i < 2; i++) {
    const l = blade(6 * scale, 2 * scale, satin('#5a9a36'), 0.12, 0.03, curve);
    const p = radiate(l, r() * 6.28, 0.5 + r() * 0.4);
    p.position.set(mid.x * (0.4 + i * 0.4), top.y * (0.2 + i * 0.25), mid.z * (0.4 + i * 0.4));
    g.add(p);
  }
  return g;
}

// ---------------------------------------------------------------- builders

export const garden: Record<string, Builder> = {
  /** Sandcastle, radius 13, 30 tall to the flag: four bucket-moulded towers round a keep on a patted mound. */
  castle: () => {
    const sand = SAND();
    const g = group();
    const base = turn([[0, 0], [13, 0], [12.9, 0.6], [12.3, 3], [11.4, 6.4], [10.6, 7.5], [0, 7.7]], sand, 64, 30);
    uvScale(base.geometry, 10, 1.5);
    g.add(wobble(base, 0.35, 0.35, 3));
    // Upside-down bucket: the lip at the bottom, ridges, a flat top crowned with merlons.
    const tower = (h: number, seed: number) => {
      const t = turn([[0, 0], [4.25, 0], [4.25, 1.1], [3.95, 1.3], [3.75, 5], [3.85, 5.3], [3.6, 5.6], [3.4, 10], [3.5, 10.3], [3.3, 10.6], [3.15, h], [0, h]], sand, 32);
      uvScale(t.geometry, 3, 2);
      const tg = group(wobble(t, 0.1, 0.6, seed));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        tg.add(at(rbox(1.6, 1.9, 1.3, 0.35, sand), Math.cos(a) * 2.55, h - 0.1, Math.sin(a) * 2.55, 0, -a, 0));
      }
      return tg;
    };
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      g.add(at(tower(13.5 + (i % 2) * 2, i + 5), Math.cos(a) * 8.6, 0, Math.sin(a) * 8.6));
    }
    const keep = turn([[0, 0], [5.4, 0], [5.3, 17], [5.6, 17.4], [5.6, 18.6], [0, 18.6]], sand, 40);
    uvScale(keep.geometry, 4, 3);
    g.add(wobble(keep, 0.12, 0.5, 9));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.add(at(rbox(2, 2.2, 1.4, 0.4, sand), Math.cos(a) * 4.7, 18.5, Math.sin(a) * 4.7, 0, -a, 0));
    }
    // Arched windows and a door poked in with a finger.
    const arch = (w: number, h: number) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0);
      s.lineTo(w / 2, 0);
      s.lineTo(w / 2, h - w / 2);
      s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
      s.closePath();
      return extrude(s, 0.3, 0.1, matte('#7d5a2e'), { curve: 8, bevelSegs: 1 });
    };
    const onKeep = (o: THREE.Object3D, a: number, y: number, r: number) => {
      const p = group(o);
      o.position.z = r;
      p.rotation.y = a;
      p.position.y = y;
      return p;
    };
    g.add(onKeep(arch(1.6, 2.6), 0.3, 12.5, 5.15), onKeep(arch(1.6, 2.6), -1.3, 12.5, 5.15), onKeep(arch(1.6, 2.6), 2.2, 13, 5.15));
    g.add(onKeep(arch(3.2, 4.4), 0, 7.4, 5.25));
    // Shells pressed into the mound.
    const shell = new THREE.Shape();
    shell.moveTo(0, 0);
    shell.absarc(0, 0, 1.3, Math.PI * 0.18, Math.PI * 0.82, false);
    shell.closePath();
    for (const [a, c] of [[0.9, '#ffd9c7'], [2.6, '#fff4e6'], [4.1, '#ffc9b0'], [5.4, '#fff4e6']] as [number, string][]) {
      const s = extrude(shell, 0.35, 0.12, glaze(c), { curve: 10, bevelSegs: 2 });
      const p = group(at(s, 0, 0, 0, -0.55, 0, 0));
      p.position.set(Math.cos(a) * 11.9, 3.2, Math.sin(a) * 11.9);
      p.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      g.add(p);
    }
    // A lolly-stick flagpole and a paper flag.
    g.add(at(rbox(0.6, 10, 0.25, 0.1, satin('#e3c48f')), 0, 18.6, 0));
    const flag = new THREE.PlaneGeometry(5, 3.4, 8, 1);
    const fp = flag.attributes.position;
    for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin((fp.getX(i) + 2.5) * 1.1) * 0.35 * ((fp.getX(i) + 2.5) / 5));
    flag.computeVertexNormals();
    flag.translate(2.8, 0, 0);
    g.add(at(mesh(flag, printed(flagTex(), { rough: 0.8, side: THREE.DoubleSide })), 0, 26.8, 0, 0, 0.3, 0));
    return g;
  },

  /** Beach bucket, radius 6.5, 12.6 tall (handle to 18): ridged plastic, heaped with sand. */
  bucket: (v) => {
    const c = typeof v === 'string' ? v : '#3d9bff';
    const p = plastic(c);
    const g = group(
      turn([[0, 0], [4.5, 0], [4.75, 0.3], [4.9, 2.6], [5.15, 2.8], [5.15, 3.3], [5.0, 3.5], [5.6, 8.6], [5.85, 8.8], [5.85, 9.3], [5.7, 9.5], [6.05, 11.5], [6.5, 11.7], [6.55, 12.4], [6.3, 12.6], [5.85, 12.4], [5.6, 11.4], [4.4, 1.0], [0, 0.9]], p, 48),
    );
    const heap = turn([[0, 13.4], [2.5, 13.0], [4.6, 12.1], [5.7, 11.4], [5.5, 10.8], [0, 10.8]], SAND(), 36, 16);
    uvScale(heap.geometry, 4, 1);
    g.add(wobble(heap, 0.25, 0.7, 4));
    // Lugs and a white handle that has flopped over to one side.
    const hm = plastic('#ffffff');
    for (const s of [-1, 1]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.8, 12).rotateZ(Math.PI / 2), hm), s * 6.35, 11, 0));
    const tilt = 1.0;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const f = (i / 12) * Math.PI;
      const hgt = 6.8 * Math.sin(f);
      pts.push(v3(-6.6 * Math.cos(f), 11 + hgt * Math.cos(tilt), -hgt * Math.sin(tilt)));
    }
    g.add(sweep(pts, 0.32, hm, 40, 8));
    return g;
  },

  /** Garden gnome, radius 4.2, 16.5 tall: boots, belted coat, white beard, bent red hat. */
  gnome: () => {
    const g = group();
    const ball = (r: number, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => at(mesh(new THREE.SphereGeometry(r, 18, 12).scale(sx, sy, sz), m), x, y, z);
    for (const s of [-1, 1]) g.add(ball(1, glaze('#2b2220'), s * 1.35, 0.55, 0.9, 1.1, 0.6, 1.8));
    g.add(turn([[0, 0.6], [3.3, 0.6], [3.5, 1.1], [3.15, 4], [2.6, 6.6], [2.0, 8.1], [0, 8.3]], glaze('#3d5a80'), 36, 24));
    g.add(turn([[3.05, 3.9], [3.25, 4.0], [3.2, 4.9], [3.0, 5.0]], satin('#6b4226'), 36));
    g.add(at(rbox(1.5, 1.1, 0.35, 0.15, chrome(BRASS)), 0, 3.9, 3.15, -0.15, 0, 0));
    for (const s of [-1, 1]) {
      g.add(sweep([v3(s * 2.0, 7.6, 0), v3(s * 3.1, 6.2, 0.6), v3(s * 2.4, 4.9, 2.4), v3(s * 1.3, 4.7, 3.0)], (t) => 0.95 - 0.2 * t, glaze('#3d5a80'), 16, 10));
      g.add(ball(0.75, satin('#f2c29b'), s * 1.0, 4.65, 3.35));
    }
    g.add(ball(2.0, satin('#f2c29b'), 0, 9.8, 0));
    // A teardrop beard falling over the chest.
    const beard = new THREE.LatheGeometry(spline([[0.01, -2.9], [0.9, -2.2], [1.7, -0.6], [1.8, 0.6], [0.01, 1.4]], 16).map(([x, y]) => new THREE.Vector2(x, y)), 18).scale(1, 1, 0.6);
    g.add(wobble(at(mesh(beard, matte('#f4f1ea')), 0, 8.2, 1.6), 0.1, 2.2, 5));
    for (const s of [-1, 1]) g.add(ball(0.75, matte('#f4f1ea'), s * 0.65, 9.0, 1.8, 1.3, 0.7, 0.8));
    g.add(ball(0.75, glaze('#f08a7a'), 0, 9.55, 2.05));
    for (const s of [-1, 1]) g.add(ball(0.22, glaze('#1b1b1f'), s * 0.72, 10.35, 1.75));
    g.add(sweep([v3(0, 10.4, 0), v3(0, 12.8, -0.3), v3(0, 15, 0.2), v3(0.1, 16.3, 1.6)], (t) => 2.2 * Math.pow(1 - t, 0.85) + 0.06, glaze('#d62828'), 24, 18));
    return g;
  },

  /** Terracotta pot, radius 6, 11 tall, with flowers to about 21 (v: the flowers' colour). */
  pot: (v) => {
    const c = typeof v === 'string' ? v : '#ff5d8f';
    const terra = printed(terracottaTex(), { rough: 0.92 });
    const pot = turn([[0, 0], [4.1, 0], [4.3, 0.4], [5.2, 8.6], [5.95, 8.7], [6.0, 9.0], [6.0, 10.9], [5.8, 11.1], [5.4, 11.0], [5.25, 9.6], [4.0, 1.0], [0, 1.0]], terra, 40);
    uvScale(pot.geometry, 3, 1);
    const g = group(pot);
    const soil = mesh(new THREE.CircleGeometry(5.3, 32).rotateX(-Math.PI / 2), printed(soilTex(), { rough: 1 }));
    g.add(at(soil, 0, 10.2, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const top = v3(Math.cos(a) * 3.2, 7.5 + (i % 3) * 1.6, Math.sin(a) * 3.2);
      g.add(at(flowerOn(top, c, 0.85, 10 + i), Math.cos(a) * 1.6, 10.2, Math.sin(a) * 1.6));
    }
    return g;
  },

  /** Pebble, radius 3, 3.7 tall: smooth, lumpy, speckled (v: its colour). */
  stone: (v) => {
    const geo = lumpy(new THREE.IcosahedronGeometry(2.9, 5), 0.45, 0.35, 7);
    geo.scale(1, 0.64, 0.86);
    sphereUV(geo);
    uvScale(geo, 2, 1);
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox!.min.y - 0.25, 0);
    return group(mesh(geo, printed(stoneTex(), { rough: 0.55, color: typeof v === 'string' ? v : '#c9c5bc' })));
  },

  /** Galvanised watering can, body radius 5 (handle and spout reach out to 7 and 13), 14.5 tall. */
  can: () => {
    const zinc = printed(zincTex(), { metal: 1, rough: 0.5 });
    const body = turn([[0, 0], [4.7, 0], [5.0, 0.4], [5.0, 9.8], [4.6, 10.3], [2.8, 11.1], [2.4, 11.2], [2.45, 11.8], [2.2, 11.85], [2.15, 11.0], [0, 10.9]], zinc, 40);
    uvScale(body.geometry, 3, 1);
    const g = group(body);
    const band = steel('#8f979f');
    for (const y of [0.6, 5, 9.4]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(5.02, 0.2, 6, 40).rotateX(Math.PI / 2), band), 0, y, 0));
    const spout = [v3(4.4, 1.8, 0), v3(7.2, 5.2, 0), v3(10, 9, 0), v3(12, 12.2, 0)];
    g.add(sweep(spout, (t) => 0.95 - 0.45 * t, zinc, 24, 12));
    // The rose: a cone on the spout's end, its face pierced with holes.
    const dir = v3(2, 3.2, 0).normalize();
    const rose = group(turn([[0.5, 0], [1.4, 1.0], [1.6, 1.35], [1.55, 1.45]], zinc, 24));
    rose.add(at(mesh(new THREE.CircleGeometry(1.55, 24).rotateX(-Math.PI / 2), printed(roseTex(), { rough: 0.35, metal: 1 })), 0, 1.45, 0));
    rose.position.set(11.8, 11.9, 0);
    rose.quaternion.setFromUnitVectors(v3(0, 1, 0), dir);
    g.add(rose);
    g.add(sweep([v3(-4.4, 10.3, 0), v3(-2.8, 14.2, 0), v3(1.4, 14.5, 0), v3(2.4, 11.6, 0)], 0.42, zinc, 24, 8));
    g.add(sweep([v3(-4.9, 8.6, 0), v3(-7.1, 7.4, 0), v3(-7.0, 3.6, 0), v3(-4.9, 2.2, 0)], 0.42, zinc, 24, 8));
    return g;
  },

  /** Toadstool, radius 3.4, 6.9 tall: a skirted stem, gills under a glossy red spotted cap. */
  mushroom: () => {
    const cream = satin('#f3ead8');
    const g = group(turn([[0, 0], [1.25, 0], [1.35, 0.5], [1.05, 1.8], [0.9, 3.4], [0.82, 4.6], [0, 4.6]], cream, 24, 20));
    // The ring on the stem droops like a little skirt.
    g.add(turn([[0.9, 3.5], [1.25, 3.3], [1.55, 2.85], [1.6, 2.7], [1.5, 2.75], [1.15, 3.1], [0.88, 3.25]], cream, 24));
    const capProfile: [number, number][] = [[0.8, 4.1], [2.9, 4.1], [3.4, 4.45], [3.45, 4.9], [3.0, 6.0], [2.0, 6.9], [0.9, 7.3], [0, 7.38]];
    g.add(turn(capProfile, glaze('#e63946'), 40, 24));
    g.add(at(mesh(new THREE.RingGeometry(0.8, 2.95, 40, 1).rotateX(Math.PI / 2), printed(gillTex(), { rough: 0.9 })), 0, 4.12, 0));
    const spot = matte('#fbf6ea');
    const r = rand(9);
    // Spots sit on the cap's own (smoothed) profile, turned to its surface.
    const prof = spline(capProfile, 24);
    for (let i = 0; i < 12; i++) {
      const th = i * 2.4 + r();
      const k = 11 + ((i * 5) % 11);
      const [pr, py] = prof[k];
      const dr = prof[k + 1][0] - prof[k - 1][0];
      const dy = prof[k + 1][1] - prof[k - 1][1];
      const n = v3(dy * Math.cos(th), -dr, dy * Math.sin(th)).normalize();
      const s = mesh(new THREE.SphereGeometry(0.32 + r() * 0.25, 10, 6).scale(1, 0.3, 1), spot);
      s.position.set(pr * Math.cos(th), py, pr * Math.sin(th)).addScaledVector(n, -0.04);
      s.quaternion.setFromUnitVectors(v3(0, 1, 0), n);
      g.add(s);
    }
    return g;
  },

  /** Tall flower, 36 tall: a curving stem, two leaves and a daisy-like head (v: petal colour). */
  flower: (v) => {
    const c = typeof v === 'string' ? v : '#ff70a6';
    const g = group(sweep([v3(0, 0, 0), v3(0.8, 12, 0.3), v3(-0.4, 24, 0), v3(0.4, 33, 0.8)], (t) => 0.62 - t * 0.2, satin(STEM), 24, 8, false));
    const head = bloom(c, 13, 5.2, 1.8, 0.28, 2.2);
    head.position.set(0.45, 33.6, 0.9);
    head.rotation.set(0.35, 0, -0.1);
    g.add(head);
    for (const [y, yaw, x] of [[9, 0.4, 0.5], [17, 3.4, 0.2]]) {
      const p = radiate(blade(9, 2.6, satin('#5a9a36'), 0.12, 0.04), yaw, 0.6);
      p.position.set(x, y, 0.1);
      g.add(p);
    }
    return g;
  },

  /** Toy spade lying on the sand, 33 long: a cupped blade, a shaft and a D grip. */
  spade: () => {
    const p = plastic('#ff9f1c');
    const s = new THREE.Shape();
    s.moveTo(-3.6, 0);
    s.lineTo(-4.4, 6);
    s.quadraticCurveTo(-4.3, 9.6, 0, 10.6);
    s.quadraticCurveTo(4.3, 9.6, 4.4, 6);
    s.lineTo(3.6, 0);
    s.quadraticCurveTo(0, -1.2, -3.6, 0);
    const b = extrude(s, 0.5, 0.18, p, { lie: true, curve: 16 });
    const pos = b.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + 0.05 * pos.getX(i) ** 2);
    b.geometry.computeVertexNormals();
    const g = group(b);
    g.add(sweep([v3(0, 0.75, 0.5), v3(0, 0.85, 8), v3(0, 0.85, 17)], 0.75, p, 8, 10));
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.6, 8, 24), p), 0, 0.62, 19.2, Math.PI / 2, 0, 0));
    g.position.z = -4.3;
    return group(g);
  },

  /** Garden hose coiled on the ground, about 34 across, with a brass nozzle on its end. */
  hose: () => {
    const pts: THREE.Vector3[] = [v3(-30, 1, 10), v3(-20, 1, 13.5)];
    const turns = 3;
    for (let i = 0; i <= 72; i++) {
      const t = i / 72;
      const a = Math.PI * 0.9 + t * turns * Math.PI * 2;
      const r = 13 - t * 4.4;
      pts.push(v3(Math.cos(a) * r, 1, Math.sin(a) * r));
    }
    // The free end rides up over the coils and out the other side.
    const end = pts[pts.length - 1];
    const out = v3(end.x, 0, end.z).normalize();
    pts.push(v3(out.x * 11, 2.9, out.z * 11), v3(out.x * 14, 3.1, out.z * 14), v3(out.x * 17.5, 1.1, out.z * 17.5), v3(out.x * 20, 1, out.z * 20));
    const g = group(sweep(pts, 1, plastic('#2ec27e'), 320, 10));
    const nozzle = group(turn([[1.15, -0.6], [1.15, 1.2], [0.95, 1.4], [0.95, 3.4], [0.6, 4.2], [0, 4.25]], chrome(BRASS), 16));
    nozzle.add(at(turn([[1.3, 0], [1.3, 1.0], [0, 1.0]], plastic('#ffd23f'), 16), 0, 1.4, 0));
    nozzle.position.copy(pts[pts.length - 1]);
    nozzle.quaternion.setFromUnitVectors(v3(0, 1, 0), v3(out.x, 0, out.z));
    g.add(nozzle);
    return g;
  },

  /** Fence panel, 47 wide x 42 tall (posts at x = +-23.5): six pointed pickets on two rails. */
  fence: () => {
    const wood = printed(picketTex(), { rough: 0.85 });
    const s = new THREE.Shape();
    s.moveTo(-3, 0);
    s.lineTo(3, 0);
    s.lineTo(3, 35.5);
    s.lineTo(0, 39.5);
    s.lineTo(-3, 35.5);
    s.closePath();
    const g = group();
    for (let i = 0; i < 6; i++) {
      const p = extrude(s, 1.4, 0.3, wood, { curve: 1, bevelSegs: 1, uvScale: 1 / 40 });
      const uv = p.geometry.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) + i * 0.17);
      g.add(at(p, i * 7 - 17.5, 0, 0, 0, 0, (i % 3 - 1) * 0.008));
    }
    const rail = (y: number) => at(rbox(47, 3, 1.5, 0.3, wood, { rest: [0, 0.3, 1.2, 0.36] }), 0, y, -0.85);
    g.add(rail(8), rail(28));
    for (const x of [-23.5, 23.5]) {
      g.add(at(rbox(3.4, 41, 3.4, 0.4, wood, { rest: [0.1, 0, 0.2, 1] }), x, 0, -0.9));
      g.add(at(rbox(4.2, 1.2, 4.2, 0.4, wood, { rest: [0.1, 0, 0.2, 0.1] }), x, 41, -0.9));
    }
    return g;
  },

  /** Garden tree, about 115 tall and 90 across: a flared trunk, roots, branches, lumpy leafy crown. */
  tree: () => {
    const bark = printed(barkTex(), { rough: 0.95, normalMap: barkBumps(), normalScale: 1.2 });
    const g = group();
    const trunk = sweep([v3(0, -1, 0), v3(1, 16, 0.5), v3(-1, 34, 0), v3(0.5, 56, -0.5)], (t) => 4.4 + 6 * Math.pow(1 - t, 5) - 1.2 * t, bark, 28, 14);
    uvScale(trunk.geometry, 3, 2);
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      const root = sweep([v3(Math.cos(a) * 3, 4, Math.sin(a) * 3), v3(Math.cos(a) * 8, 1.2, Math.sin(a) * 8), v3(Math.cos(a) * 13, -0.5, Math.sin(a) * 13)], (t) => 2.6 * (1 - t) + 0.4, bark, 8, 8);
      g.add(root);
    }
    const crown: [number, number, number, number, string][] = [
      [0, 88, 0, 23, '#4f9a37'],
      [21, 76, 6, 18, '#3f8a2e'],
      [-20, 78, -4, 18, '#5fae45'],
      [4, 71, -20, 16, '#4f9a37'],
      [-6, 70, 19, 16, '#3f8a2e'],
      [16, 94, -12, 14, '#5fae45'],
      [-15, 96, 10, 14, '#4f9a37'],
      [24, 84, -15, 13, '#5fae45'],
      [-22, 86, 15, 13, '#3f8a2e'],
    ];
    crown.forEach(([x, y0, z, r, c], i) => {
      const y = y0 - 7;
      if (i) g.add(sweep([v3(x * 0.1, 40 + i * 2, z * 0.1), v3(x * 0.55, y - r * 0.5, z * 0.55), v3(x * 0.8, y - r * 0.2, z * 0.8)], (t) => 2.4 - 1.6 * t, bark, 8, 8));
      const geo = lumpy(new THREE.IcosahedronGeometry(r, r > 17 ? 6 : 4), r * 0.11, 0.17, 20 + i);
      sphereUV(geo);
      uvScale(geo, r / 4, r / 8);
      geo.translate(x, y, z);
      g.add(mesh(geo, printed(leafTex(), { rough: 0.85, color: c, normalMap: leafBumps(), normalScale: 1.4 })));
    });
    return g;
  },

  /**
   * Garden shed, 316 wide x 372 tall x 270 deep with its roof (walls 300 x 240): sage shiplap, felt roof,
   * a ledged door with a latch at x = -55, a window at x = 80, and a watering can by the door.
   */
  shed: () => {
    const g = group();
    const planks = printed(shedPlanks(), { rough: 0.8 });
    const trim = satin('#efe8d6');
    const T = 192;
    g.add(rbox(316, 8, 256, 1.5, matte('#a9a59c')));
    const gable = new THREE.Shape();
    gable.moveTo(-150, 0);
    gable.lineTo(150, 0);
    gable.lineTo(150, 250);
    gable.lineTo(0, 350);
    gable.lineTo(-150, 250);
    gable.closePath();
    for (const z of [114, -120]) g.add(at(extrude(gable, 6, 0, planks, { curve: 1, uvScale: 1 / T }), 0, 8, z));
    for (const x of [-147, 147]) g.add(at(rbox(6, 250, 228, 0.5, planks, { px: [0, 0, 228 / T, 250 / T], nx: [0, 0, 228 / T, 250 / T], rest: [0, 0, 0.01, 0.01] }), x, 8, 0));
    for (const x of [-148, 148]) for (const z of [118, -118]) g.add(at(rbox(10, 250, 10, 1.5, trim), x, 8, z));
    // Felt roof: two slopes overhanging the walls, a ridge cap and barge boards.
    const felt = printed(feltTex(), { rough: 0.95, normalMap: feltBumps(), normalScale: 1 });
    const th = Math.atan2(100, 150);
    const W = 205;
    for (const s of [-1, 1]) {
      const slope = rbox(W, 5, 272, 1, felt, { py: [0, 0, W / 100, 272 / 100], rest: [0, 0, 0.05, 0.05] });
      slope.geometry.translate(0, -2.5, 0);
      const o = group(slope);
      o.rotation.z = -s * th;
      o.position.set(s * (75 + Math.cos(th) * 12), 8 + 300 - Math.sin(th) * 12 + 5, 0);
      g.add(o);
      for (const z of [123, -123]) {
        const b = group(at(rbox(W, 12, 3, 1, trim), 0, -12, 0));
        b.rotation.z = -s * th;
        b.position.set(s * (75 + Math.cos(th) * 12), 8 + 300 - Math.sin(th) * 12 + 3, z);
        g.add(b);
      }
    }
    g.add(at(rbox(16, 7, 276, 2, felt, { rest: [0, 0, 0.3, 0.3] }), 0, 356, 0));
    // The door: boards, ledges and braces, strap hinges and a latch.
    const door = group(rbox(100, 200, 4, 1, printed(doorTex(), { rough: 0.8 }), { pz: [0, 0, 1, 1], rest: [0, 0, 0.05, 0.05] }));
    const ledge = satin('#6f8a6a');
    for (const y of [18, 96, 174]) door.add(at(rbox(92, 12, 2.5, 0.8, ledge), 0, y, 2.4));
    for (const y of [30, 108]) {
      const b = rbox(100, 9, 2.5, 0.8, ledge);
      b.geometry.translate(0, -4.5, 0);
      door.add(at(b, 0, y + 33, 2.4, 0, 0, 0.82));
    }
    const iron = satin('#2b2d30');
    for (const y of [22, 178]) door.add(at(rbox(60, 4, 1, 0.4, iron), -24, y, 4));
    door.add(at(rbox(4, 14, 1.4, 0.6, iron), 38, 96, 4.5), at(sweep([v3(38, 100, 5), v3(38, 104, 9), v3(38, 92, 9), v3(38, 88, 5)], 0.8, iron, 12, 6), 0, 0, 0));
    g.add(at(door, -55, 10, 120));
    // A four-pane window with a sill, dark inside.
    const win = group(at(rbox(64, 54, 0.5, 0.2, matte('#20271f')), 0, 0, 0));
    const pane = mesh(new THREE.PlaneGeometry(64, 54), glass('#e8f4ff', 0.1, 0.03));
    win.add(at(pane, 0, 27, 1.6));
    for (const [w, h, x, y] of [[72, 5, 0, -4], [72, 5, 0, 53], [5, 62, -34, -4], [5, 62, 34, -4], [64, 3, 0, 25.5], [3, 54, 0, 0]] as [number, number, number, number][]) win.add(at(rbox(w, h, 4, 0.8, trim), x, y, 0.5));
    win.add(at(rbox(80, 4, 12, 1, trim), 0, -8, 4));
    g.add(at(win, 80, 130, 120));
    g.add(at(scaledBy(garden.can(), 6), -125, 8, 152, 0, -2.2, 0));
    return g;
  },

  /**
   * A clump of flowers, about 40 across and 24 tall, with leaves at its foot (v: the main colour). Room dressing
   * seen from the track across the garden, so built at half the curve detail of the kart-scale flowers.
   */
  flowers: (v) => {
    const c = typeof v === 'string' ? v : '#ff70a6';
    const cols = [c, c, '#ffffff', c, '#ffd23f', c, '#ffffff', c, '#ffd23f'];
    const g = group();
    const r = rand(17);
    cols.forEach((col, i) => {
      const a = i * 2.4;
      const d = 4 + r() * 11;
      const top = v3(Math.cos(a) * 3, 11 + r() * 12, Math.sin(a) * 3);
      g.add(at(flowerOn(top, col, 0.9 + r() * 0.3, 30 + i, true), Math.cos(a) * d, 0, Math.sin(a) * d));
    });
    const leaf = satin('#4f8f30');
    for (let i = 0; i < 12; i++) {
      const p = radiate(blade(7 + r() * 5, 2.4, leaf, 0.12, 0.05, 3), r() * 6.28, 0.6 + r() * 0.5);
      p.position.set((r() - 0.5) * 26, 0, (r() - 0.5) * 26);
      g.add(p);
    }
    return g;
  },

  /** A tuft of grass, about 22 across and 15 tall: one merged mesh of bending blades. */
  grass: (v) => {
    const r = rand(typeof v === 'number' ? v : 5);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const SEG = 3;
    for (let b = 0; b < 26; b++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 6;
      const bx = Math.cos(a) * d;
      const bz = Math.sin(a) * d;
      const h = 8 + r() * 8;
      const lean = 2 + r() * 6;
      const ly = a + (r() - 0.5) * 0.8;
      const face = ly + Math.PI / 2;
      const w = 0.7 + r() * 0.5;
      const base = pos.length / 3;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        const cx = bx + Math.cos(ly) * lean * t * t;
        const cz = bz + Math.sin(ly) * lean * t * t;
        const half = w * (1 - t) + 0.02;
        pos.push(cx - Math.cos(face) * half, h * t, cz - Math.sin(face) * half, cx + Math.cos(face) * half, h * t, cz + Math.sin(face) * half);
        uv.push(0, t, 1, t);
      }
      for (let s = 0; s < SEG; s++) {
        const k = base + s * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return group(mesh(geo, printed(bladeTex(), { rough: 0.8, side: THREE.DoubleSide })));
  },
};

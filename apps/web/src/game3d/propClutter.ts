/**
 * Ground clutter: crumbs, paper scraps, droplets, pebbles, marbles and bolts strewn over the ground beside the
 * track, thickest near the road, so the miniature scale reads at speed. All of it is low, plain-coloured and
 * decoration only, and it is placed only where the compiled grid says nobody races: beyond the road, its
 * shoulder and the progress margin, or behind a wall, and clear of props, puddles and hazards. Built from a
 * few plain finishes, it merges into the track's baked meshes for next to no extra draw calls.
 */
import * as THREE from 'three';
import { colliderDistance, footprintOf, SURF, type Collider, type Track } from '@raceoff/game';
import { at, box, cyl, group, shareResource } from './kit';
import { glaze, lumpy, matte, mesh, plastic, rbox, rubber, satin, std, steel } from './propKit';

export interface Spot {
  x: number;
  z: number;
  /** Distance to the nearest road edge. */
  d: number;
}

/** Deterministic random numbers, so a track looks the same every time. */
function rand(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Up to `count` spots on open ground near the track, chosen so none is on the road or anywhere a kart races.
 * `reach` is how far beyond the road's box to look; spots near the road are kept more often than far ones.
 */
export function offRoadSpots(track: Track, count: number, seed: number, reach = 40, clear = 1.5): Spot[] {
  const r = rand(seed);
  const { grid, def } = track;
  const b = track.bounds;
  const f = def.floor;
  const ground = SURF[def.ground];
  const samples = track.paths.flatMap((p) => p.samples.filter((_, i) => i % 2 === 0));
  const scratch: Collider[] = [];
  const props = (def.props ?? []).map((p) => {
    const fp = footprintOf(p.k);
    return { x: p.x, z: p.z, r: (fp ? ('c' in fp ? fp.c : Math.hypot(fp.b[0], fp.b[1])) : 10) * (p.s ?? 1) + clear };
  });
  const out: Spot[] = [];
  for (let tries = 0; tries < count * 12 && out.length < count; tries++) {
    const x = b.minX - reach + r() * (b.maxX - b.minX + reach * 2);
    const z = b.minZ - reach + r() * (b.maxZ - b.minZ + reach * 2);
    const keep = r();
    if (f && (x < f.minX + 2 || x > f.maxX - 2 || z < f.minZ + 2 || z > f.maxZ - 2)) continue;
    const c = grid.index(x, z);
    if (c >= 0) {
      // Open ground at floor height, where no progress is painted (nobody races there) or behind a wall.
      if (grid.surf[c] !== ground && grid.surf[c] !== SURF.sand) continue;
      if (Math.abs(grid.y[c] - def.floorY) > 0.05) continue;
      if (!Number.isNaN(grid.s[c]) && !grid.outside[c]) continue;
    }
    let near = Infinity;
    for (const s of samples) near = Math.min(near, Math.hypot(s.x - x, s.z - z) - s.w / 2);
    // Thick beside the road, where it gives scale at speed; sparse further out.
    if (keep > (near < 25 ? 1 : near < 60 ? 0.35 : 0.12)) continue;
    if (track.query(x, z, clear + 1, scratch).some((col) => colliderDistance(col, x, z) < clear)) continue;
    if (props.some((p) => Math.hypot(p.x - x, p.z - z) < p.r)) continue;
    if (nearHazard(track, x, z)) continue;
    out.push({ x, z, d: near });
  }
  return out;
}

/** Train lines and spinning tops need their ground clear. */
function nearHazard(track: Track, x: number, z: number) {
  for (const h of track.hazards) {
    const m = h.motion;
    if (m?.type === 'loop') {
      for (let i = 0; i < m.points.length; i++) {
        const [ax, az] = m.points[i];
        const [bx, bz] = m.points[(i + 1) % m.points.length];
        if (colliderDistance({ t: 'seg', ax, az, bx, bz, r: 0 }, x, z) < h.r + 4) return true;
      }
    } else if (m?.type === 'circle' && Math.abs(Math.hypot(x - m.cx, z - m.cz) - m.radius) < h.r + 3) return true;
  }
  return false;
}

type Piece = (r: () => number) => THREE.Object3D;
const pick = <T>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

/** A few shapes made once and shared by every copy (bake copies them into its merged meshes). */
const once = <T>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};
/** Irregular lumps: crumbs, pebbles, eraser rubbings. Four variants, flattened and squashed per piece. */
const lumps = once(() => [1, 2, 3, 4].map((seed) => lumpy(new THREE.IcosahedronGeometry(0.5, 1), 0.14, 1.8, seed)));
const hoop = once(() => new THREE.TorusGeometry(0.42, 0.16, 5, 10).rotateX(Math.PI / 2).translate(0, 0.16, 0));
const dome = once(() => new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2));
const ringGeo = once(() => new THREE.TorusGeometry(0.32, 0.09, 4, 10).rotateX(Math.PI / 2).translate(0, 0.09, 0));
/** Spilt oil: glossy, dark and opaque so every stain merges into one mesh; lifted off the floor so it never flickers. */
const oilMat = once(() =>
  shareResource(new THREE.MeshPhysicalMaterial({ color: '#0d0d12', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.8, iridescenceIOR: 1.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
);

const lump = (r: () => number, m: THREE.Material, size: number, flat = 0.55) => {
  const o = mesh(pick(r, lumps()), m);
  o.scale.set(size * (0.8 + r() * 0.4), size * flat, size * (0.7 + r() * 0.4));
  o.position.y = size * flat * 0.3;
  return o;
};
/** A flat organic blob lying on the ground: a stain, a petal, a puddle of spilt something. */
function blob(rx: number, rz: number, m: THREE.Material, seed: number, y = 0.03) {
  const shape = new THREE.Shape();
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2.3);
    if (i === 0) shape.moveTo(Math.cos(a) * rx * k, Math.sin(a) * rz * k);
    else shape.lineTo(Math.cos(a) * rx * k, Math.sin(a) * rz * k);
  }
  return mesh(new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2).translate(0, y, 0), m, false);
}
/** A toy brick: bevelled body and its studs on top, all in one glossy plastic. */
function brick(c: string, cols: number, rows: number, h: number) {
  const m = plastic(c);
  const g = group(rbox(cols * 0.5, h, rows * 0.5, 0.05, m, undefined, 1));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) g.add(at(cyl(0.14, 0.14, 0.09, m, 6), (i - (cols - 1) / 2) * 0.5, h, (j - (rows - 1) / 2) * 0.5));
  return g;
}

const TOY = ['#e3242b', '#ffcd00', '#0057b8', '#00a651', '#ff7a00', '#f5f5f5'];
const CEREAL = ['#ffb703', '#fb8500', '#e63946', '#8ac926', '#9b5de5'];

/**
 * Each theme's litter, at kart scale (a kart is about 2.6 across and taller than any of this: everything here
 * stays under about 0.65, so it reads as something you drive over). Plain finishes from propKit, so it merges.
 */
const PIECES: Record<string, { pieces: Piece[]; count: number }> = {
  breakfast: {
    count: 460,
    pieces: [
      (r) => lump(r, satin(pick(r, ['#d9a25b', '#c4823f', '#e8c07a', '#b8712e'])), 0.6 + r() * 0.7),
      (r) => lump(r, satin(pick(r, ['#d9a25b', '#c4823f', '#e8c07a'])), 0.4 + r() * 0.4),
      (r) => mesh(hoop(), satin(pick(r, CEREAL))),
      () => rbox(0.38, 0.38, 0.38, 0.04, std('#ffffff', 'gloss'), undefined, 1),
    ],
  },
  desk: {
    count: 380,
    pieces: [
      (r) => {
        // A torn scrap of paper, lying a little curled.
        const o = rbox(1.6 + r() * 1.8, 0.04, 1.2 + r() * 1.4, 0.02, matte(pick(r, ['#ffffff', '#fff3b0', '#ffd6e0', '#cdeffd'])), undefined, 1);
        o.rotation.z = (r() - 0.5) * 0.08;
        return o;
      },
      (r) => {
        // A pencil shaving: a frilly wooden disc with its painted rim.
        const c = pick(r, ['#ef476f', '#ffd23f', '#3d9bff', '#06d6a0']);
        return group(cyl(0.62, 0.66, 0.05, satin(c), 10), cyl(0.5, 0.56, 0.07, satin('#e2b77a'), 10), cyl(0.12, 0.12, 0.09, satin('#3a3a3a'), 6));
      },
      (r) => lump(r, rubber(pick(r, ['#ff8fab', '#ffafcc'])), 0.35 + r() * 0.25),
      () => {
        // A staple, bent into its U.
        const m = steel();
        return group(at(box(0.9, 0.06, 0.06, m), 0, 0, 0), at(box(0.06, 0.06, 0.28, m), -0.42, 0, 0.11), at(box(0.06, 0.06, 0.28, m), 0.42, 0, 0.11));
      },
    ],
  },
  bath: {
    count: 340,
    pieces: [
      (r) => {
        // A bead of water.
        const o = mesh(dome(), glaze('#dff4ff'));
        const rad = 0.4 + r() * 0.7;
        o.scale.set(rad * (0.8 + r() * 0.5), rad * 0.35, rad);
        return o;
      },
      (r) => {
        // A little cluster of soap bubbles.
        const g = group();
        for (let i = 0; i < 3; i++) {
          const o = mesh(dome(), glaze('#ffffff'));
          const rad = 0.25 + r() * 0.35;
          o.scale.setScalar(rad);
          o.position.set((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9);
          g.add(o);
        }
        return g;
      },
    ],
  },
  sandbox: {
    count: 360,
    pieces: [
      (r) => lump(r, satin(pick(r, ['#a8a29e', '#d6d3d1', '#8d8580', '#c8b8a2'])), 0.5 + r() * 0.8, 0.5),
      (r) => blob(0.7, 0.35, matte(pick(r, ['#ff8fab', '#ffd23f', '#ffffff', '#b07cff'])), r() * 10, 0.04),
      (r) => {
        // A twig.
        const o = cyl(0.07, 0.1, 1.6 + r() * 1.4, satin('#7a5230'), 5);
        o.rotation.z = Math.PI / 2;
        o.position.y = 0.09;
        return o;
      },
    ],
  },
  toybox: {
    count: 400,
    pieces: [
      (r) => brick(pick(r, TOY), 2, 1, 0.3),
      (r) => brick(pick(r, TOY), 2, 2, 0.12),
      (r) => {
        const o = mesh(new THREE.SphereGeometry(0.28, 8, 6).translate(0, 0.28, 0), glaze(pick(r, ['#e3242b', '#3d9bff', '#06d6a0', '#ffd23f'])));
        return o;
      },
      (r) => {
        const o = box(0.45, 0.02, 0.3, matte(pick(r, ['#ff70a6', '#ffd23f', '#70d6ff', '#ffffff', '#9b5de5'])));
        o.rotation.x = (r() - 0.5) * 0.3;
        return o;
      },
    ],
  },
  garage: {
    count: 380,
    pieces: [
      () => {
        // A bolt lying on its side: hex head and shank.
        const m = steel();
        const g = group(at(cyl(0.3, 0.3, 0.2, m, 6), 0, 0, 0), at(cyl(0.12, 0.12, 0.9, m, 6), 0, 0.2, 0));
        g.rotation.z = Math.PI / 2;
        g.position.y = 0.3;
        return g;
      },
      () => cyl(0.34, 0.34, 0.24, steel('#9aa0ab'), 6),
      () => mesh(ringGeo(), steel()),
      (r) => blob(1.5 + r() * 2.5, 1 + r() * 1.8, oilMat(), r() * 10),
    ],
  },
};

/** The clutter for a track, as one group to be baked with the rest of the scenery. */
export function clutter(track: Track): THREE.Group {
  const g = new THREE.Group();
  const kit = PIECES[track.def.id];
  if (!kit) return g;
  const r = rand(track.def.id.length * 7919 + 17);
  for (const s of offRoadSpots(track, kit.count, 101 + track.def.id.charCodeAt(0))) {
    const piece = pick(r, kit.pieces)(r);
    const o = at(new THREE.Group().add(piece), s.x, track.def.floorY, s.z, 0, r() * Math.PI * 2, 0);
    piece.traverse((m) => (m.castShadow = false));
    g.add(o);
  }
  return g;
}

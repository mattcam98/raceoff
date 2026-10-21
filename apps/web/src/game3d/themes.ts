/**
 * How each track looks: sky, light, the ground it sits on, its road and walls,
 * and the giant room around it that makes the karts feel tiny.
 */
import * as THREE from 'three';
import type { Track } from '@raceoff/game';
import { at, box, cyl, group, mat } from './kit';
import { buildProp } from './props';
import { tex } from './textures';

export type WallStyle = 'sugar' | 'pencil' | 'block' | 'tire' | 'rail' | 'soap' | 'stone' | 'domino' | 'crayon' | 'books';

export interface Theme {
  sky: [string, string];
  fog: string;
  fogNear: number;
  fogFar: number;
  sun: { color: string; intensity: number; x: number; y: number; z: number };
  hemi: { sky: string; ground: string; intensity: number };
  ambient?: number;
  /** Material for the floor the track sits on, and its texture repeat in world units. */
  ground: () => THREE.Material;
  groundRepeat: number;
  road: { base: string; line: string; edge: string; dash: boolean };
  roughRoad: () => THREE.Material;
  curb: [string, string];
  wall: WallStyle;
  /** Builds the room around the track. */
  backdrop: (track: Track) => THREE.Object3D;
  /** Night tracks get lamps and glowing bits. */
  night?: boolean;
}

function texMat(t: THREE.Texture, repeat: number, size: number, color = '#ffffff') {
  const tt = t.clone();
  tt.needsUpdate = true;
  tt.repeat.set(size / repeat, size / repeat);
  return mat(color, { map: tt });
}

/** The table or desk the track sits on: its top is the floor, and it stands in a room far below. */
/**
 * The table or desk the track sits on: its top is the floor, and it stands in a
 * room far below. `drape`, if given, is a tablecloth hanging over the edges.
 */
function tableRoom(track: Track, drape: THREE.Material | null, side: THREE.Material, floorMat: THREE.Material, wall: THREE.Material, extra?: (g: THREE.Group, f: NonNullable<Track['def']['floor']>) => void) {
  const f = track.def.floor!;
  const w = f.maxX - f.minX;
  const d = f.maxZ - f.minZ;
  const cx = (f.minX + f.maxX) / 2;
  const cz = (f.minZ + f.maxZ) / 2;
  const y = track.def.floorY;
  const g = new THREE.Group();
  const slabT = 8;
  // The top is drawn separately (it is the floor material); this is the table's thickness and legs.
  g.add(at(box(w, slabT, d, side), cx, y - slabT - 0.08, cz));
  if (drape) {
    // The cloth hangs a hand's width over every edge, with a gentle wave in it.
    const hang = 28;
    for (const [len, x, z, ry] of [[w, cx, f.maxZ + 0.6, 0], [w, cx, f.minZ - 0.6, Math.PI], [d, f.maxX + 0.6, cz, Math.PI / 2], [d, f.minX - 0.6, cz, -Math.PI / 2]] as [number, number, number, number][]) {
      const geo = new THREE.PlaneGeometry(len + 1.2, hang, Math.round(len / 6), 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const lower = (hang / 2 - pos.getY(i)) / hang;
        pos.setZ(i, Math.sin(pos.getX(i) * 0.35) * 1.6 * lower + lower * 2);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, drape);
      m.position.set(x, y - hang / 2 + 0.05, z);
      m.rotation.y = ry;
      m.castShadow = true;
      g.add(m);
    }
  }
  const legH = 150;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(box(10, legH, 10, side), cx + sx * (w / 2 - 14), y - slabT - legH, cz + sz * (d / 2 - 14)));
  const floorY = y - slabT - legH;
  const roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), floorMat);
  roomFloor.position.set(cx, floorY, cz);
  roomFloor.receiveShadow = true;
  g.add(roomFloor);
  // Walls of the room, far enough away to feel huge.
  const R = 620;
  for (const [x, z, ry] of [[0, -R, 0], [0, R, Math.PI], [-R, 0, Math.PI / 2], [R, 0, -Math.PI / 2]] as [number, number, number][]) {
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(1300, 700), wall);
    wm.position.set(cx + x, floorY + 350, cz + z);
    wm.rotation.y = ry;
    g.add(wm);
  }
  extra?.(g, f);
  return g;
}

function clothDrape() {
  const t = tex.gingham('#e8414b', '#ffffff').clone();
  t.needsUpdate = true;
  t.repeat.set(9, 0.8);
  return mat('#ffffff', { map: t, side: THREE.DoubleSide });
}

export const THEMES: Record<string, Theme> = {
  breakfast: {
    sky: ['#ffe8c7', '#fff6e6'],
    fog: '#f6e3c8',
    fogNear: 260,
    fogFar: 900,
    sun: { color: '#fff1d6', intensity: 2.4, x: -120, y: 260, z: 90 },
    hemi: { sky: '#fff3df', ground: '#b98c62', intensity: 1.1 },
    ground: () => mat('#ffffff', { map: tex.gingham('#e8414b', '#ffffff') }),
    groundRepeat: 36,
    road: { base: '#3c4152', line: '#ffffff', edge: '#ffd23f', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.gingham('#e8414b', '#ffffff') }),
    curb: ['#e63946', '#ffffff'],
    wall: 'sugar',
    backdrop: (t) =>
      tableRoom(t, clothDrape(), mat('#ffffff', { map: tex.wood('#b07a47', '#8a5a2e', 3) }), texMat(tex.checkerFloor('#f2efe6', '#3a3f5c'), 60, 1600), mat('#ffe0b8'), (g, f) => {
        // A chair pulled up to the table and a window with morning light.
        g.add(at(buildProp('chair'), (f.minX + f.maxX) / 2 + 60, -158, f.maxZ + 70, 0, Math.PI, 0));
        g.add(at(buildProp('chair'), f.minX - 70, -158, (f.minZ + f.maxZ) / 2, 0, Math.PI / 2, 0));
        g.add(at(buildProp('window'), 0, 120, -618, 0, 0, 0));
        // Kitchen counter along the far wall.
        g.add(at(box(700, 90, 60, mat('#ffffff', { map: tex.wood('#d9c2a0', '#b49b78', 2) })), 0, -158, -560));
        g.add(at(box(700, 6, 64, mat('#e9e4dc', { shiny: 40 })), 0, -68, -560));
      }),
  },
  desk: {
    sky: ['#cfd8ff', '#eef1ff'],
    fog: '#dfe4f7',
    fogNear: 240,
    fogFar: 900,
    sun: { color: '#fffaf0', intensity: 2.2, x: 140, y: 240, z: -60 },
    hemi: { sky: '#e8edff', ground: '#8c6b4a', intensity: 1.15 },
    ground: () => mat('#ffffff', { map: tex.wood('#a8784a', '#7a5130', 2) }),
    groundRepeat: 90,
    road: { base: '#2f3445', line: '#ffffff', edge: '#7fd1ff', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.paper() }),
    curb: ['#3d9bff', '#ffffff'],
    wall: 'pencil',
    backdrop: (t) =>
      tableRoom(t, null, mat('#ffffff', { map: tex.wood('#8a5d36', '#5e3d20', 3) }), texMat(tex.carpet('#58607a', '#6a7390'), 30, 1600), mat('#d9e2ff'), (g) => {
        g.add(at(buildProp('window'), 0, 140, -618));
        g.add(at(buildProp('shelf'), 300, -158, -580, 0, 0, 0));
        g.add(at(buildProp('chair'), 0, -158, 190, 0, 0, 0));
      }),
  },
  bath: {
    sky: ['#d7f6ff', '#f2fdff'],
    fog: '#dff6fb',
    fogNear: 260,
    fogFar: 950,
    sun: { color: '#ffffff', intensity: 2.1, x: 80, y: 250, z: 120 },
    hemi: { sky: '#eafcff', ground: '#9fd3df', intensity: 1.25 },
    ground: () => mat('#ffffff', { map: tex.tiles('#eaf6f8', '#9fc2cc', 4) }),
    groundRepeat: 24,
    road: { base: '#4a5a8c', line: '#ffffff', edge: '#ffffff', dash: false },
    roughRoad: () => mat('#ffffff', { map: tex.stripes('#9ee1ff', '#ffffff', 10) }),
    curb: ['#ff8fab', '#ffffff'],
    wall: 'soap',
    backdrop: () => {
      const g = new THREE.Group();
      const wall = mat('#ffffff', { map: tex.tiles('#d4f1f7', '#9fc2cc', 4) });
      for (const [x, z, ry] of [[0, -520, 0], [0, 520, Math.PI], [-520, 0, Math.PI / 2], [520, 0, -Math.PI / 2]] as [number, number, number][]) {
        const t = (wall as THREE.MeshLambertMaterial).map!.clone();
        t.needsUpdate = true;
        t.repeat.set(40, 20);
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(1100, 600), mat('#ffffff', { map: t }));
        wm.position.set(x, 290, z);
        wm.rotation.y = ry;
        g.add(wm);
      }
      g.add(at(buildProp('window'), -200, 220, -518));
      return g;
    },
  },
  sandbox: {
    sky: ['#4fb3ff', '#cdeeff'],
    fog: '#cdeeff',
    fogNear: 300,
    fogFar: 1100,
    sun: { color: '#fff4dc', intensity: 2.6, x: -160, y: 280, z: -40 },
    hemi: { sky: '#bfe6ff', ground: '#5f9c45', intensity: 1.05 },
    ground: () => mat('#ffffff', { map: tex.grass() }),
    groundRepeat: 26,
    road: { base: '#474a55', line: '#ffffff', edge: '#ffffff', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.sand() }),
    curb: ['#ff7a1a', '#ffffff'],
    wall: 'stone',
    backdrop: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        g.add(at(buildProp('fence'), Math.cos(a) * 470, 0, Math.sin(a) * 470, 0, -a + Math.PI / 2, 0));
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3;
        g.add(at(buildProp('tree'), Math.cos(a) * 560, 0, Math.sin(a) * 560, 0, a, 0));
      }
      g.add(at(group(box(140, 110, 120, mat('#f2e8d5')), at(box(150, 10, 130, mat('#b5523b')), 0, 110, 0)), -420, 0, -420, 0, 0.6, 0));
      return g;
    },
  },
  toybox: {
    sky: ['#ffd6f0', '#fff0fa'],
    fog: '#f7e3f2',
    fogNear: 260,
    fogFar: 950,
    sun: { color: '#fff3e6', intensity: 2.2, x: 120, y: 260, z: 140 },
    hemi: { sky: '#ffe9f7', ground: '#8f6fd6', intensity: 1.15 },
    ground: () => mat('#ffffff', { map: tex.carpet('#6b5bd6', '#8576ee') }),
    groundRepeat: 30,
    road: { base: '#3b3561', line: '#ffd23f', edge: '#ffffff', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.rug() }),
    curb: ['#ffd23f', '#3d9bff'],
    wall: 'block',
    backdrop: () => {
      const g = new THREE.Group();
      const wp = tex.starsWallpaper().clone();
      wp.needsUpdate = true;
      wp.repeat.set(10, 5);
      for (const [x, z, ry] of [[0, -540, 0], [0, 540, Math.PI], [-540, 0, Math.PI / 2], [540, 0, -Math.PI / 2]] as [number, number, number][]) {
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(1100, 600), mat('#ffffff', { map: wp }));
        wm.position.set(x, 290, z);
        wm.rotation.y = ry;
        g.add(wm);
      }
      // A bed against the wall and a toy chest.
      g.add(at(group(box(260, 60, 420, mat('#ffffff', { map: tex.wood('#d6a46b', '#a4733f', 3) })), at(box(250, 30, 400, mat('#7bdff2')), 0, 60, 0), at(box(200, 30, 90, mat('#ffffff')), 0, 90, -150)), 380, 0, -200));
      g.add(at(group(box(140, 70, 80, mat('#ef476f')), at(box(146, 10, 86, mat('#ffd166')), 0, 70, 0)), -380, 0, -380, 0, 0.4, 0));
      return g;
    },
  },
  garage: {
    sky: ['#0d1026', '#262b4d'],
    fog: '#1b1f3a',
    fogNear: 220,
    fogFar: 800,
    sun: { color: '#bcd0ff', intensity: 1.4, x: 80, y: 260, z: 60 },
    hemi: { sky: '#7d8fd6', ground: '#3a2f2a', intensity: 1.0 },
    ground: () => mat('#ffffff', { map: tex.concrete() }),
    groundRepeat: 70,
    road: { base: '#262833', line: '#ffd23f', edge: '#ffd23f', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.concrete() }),
    curb: ['#ffd23f', '#1b1b1f'],
    wall: 'tire',
    night: true,
    backdrop: () => {
      const g = new THREE.Group();
      const wall = mat('#4b4f63');
      for (const [x, z, ry] of [[0, -500, 0], [0, 500, Math.PI], [-500, 0, Math.PI / 2], [500, 0, -Math.PI / 2]] as [number, number, number][]) {
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(1000, 500), wall);
        wm.position.set(x, 250, z);
        wm.rotation.y = ry;
        g.add(wm);
      }
      for (let i = 0; i < 4; i++) g.add(at(buildProp('shelf'), -300 + i * 200, 0, -470));
      // A car parked in the corner: two huge tyres and a bumper.
      g.add(at(group(at(cyl(60, 60, 40, mat('#1b1b20'), 24), 0, 60, 0, 0, 0, Math.PI / 2), at(cyl(60, 60, 40, mat('#1b1b20'), 24), 0, 60, 280, 0, 0, Math.PI / 2), at(box(60, 140, 420, mat('#c1121f', { shiny: 80 })), -40, 60, 140)), 420, 0, 120));
      // Strip lights.
      for (const x of [-200, 0, 200]) g.add(at(box(120, 4, 10, mat('#ffffff', { emissive: '#fffbe6', emissiveIntensity: 1.5 })), x, 300, 0));
      return g;
    },
  },
};

export const themeFor = (id: string): Theme => THEMES[id] ?? THEMES.breakfast;

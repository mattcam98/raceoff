/**
 * How each track looks: sky, light, the ground it sits on, its road and walls,
 * and the giant room around it that makes the karts feel tiny.
 */
import * as THREE from 'three';
import type { Track } from '@raceoff/game';
import { at, box, cyl, group, lathe, mat, slab } from './kit';
import type { Grade } from './post';
import { buildRoom, buildSky, type RoomSpec } from './rooms';
import { withRelief, type Relief } from './surface';
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
  /** The floor's surface relief and how its gloss varies: grout is matte, glazed tile glossy. */
  groundRelief: Relief;
  road: { base: string; line: string; edge: string; dash: boolean };
  roughRoad: () => THREE.Material;
  /** The sides of raised road, down to the floor: what it is built up on. */
  skirt: () => THREE.Material;
  curb: [string, string];
  wall: WallStyle;
  /** Builds the room around the track. */
  backdrop: (track: Track, theme: Theme) => THREE.Object3D;
  /** Night tracks get lamps and glowing bits. */
  night?: boolean;
  /**
   * The photographic look: how strong the room's reflected light, the sky light and the sun are (multiples
   * of the values above), and the colour grade.
   */
  look: { env: number; hemi: number; sun: number; grade: Grade };
}

const DAY: Theme['look'] = { env: 0.55, hemi: 0.15, sun: 1.15, grade: { saturation: 1.12, contrast: 1.06, tint: '#ffffff', vignette: 0.32, bloom: 0.5, dof: 4.5 } };
const lookWith = (grade: Partial<Grade>, o: Partial<Omit<Theme['look'], 'grade'>> = {}): Theme['look'] => ({ ...DAY, ...o, grade: { ...DAY.grade, ...grade } });

/** A material of its own, not a cached one: its texture copy is made for one world and freed with it. */
function texMat(t: THREE.Texture, repeat: number, size: number, color = '#ffffff') {
  const tt = t.clone();
  tt.needsUpdate = true;
  tt.repeat.set(size / repeat, size / repeat);
  return new THREE.MeshStandardMaterial({ color, map: tt, roughness: 0.85 });
}

type RoomLook = Pick<RoomSpec, 'floor' | 'wall' | 'lower' | 'skirting' | 'outside' | 'shafts'> & { half?: number; height?: number };

/** The room for a theme: its sun is the theme's sun, so the window, the light shafts and the shadows agree. */
function room(theme: Theme, place: { x: number; z: number; floorY: number; aimY: number }, look: RoomLook) {
  return buildRoom({
    ...place,
    half: look.half ?? 620,
    height: look.height ?? 900,
    sun: new THREE.Vector3(theme.sun.x, theme.sun.y, theme.sun.z),
    sunColor: theme.sun.color,
    window: { w: 340, h: 300 },
    ...look,
  });
}

/** A wall finish with world-scale tiling (a texture repeat every 100 units) and a little relief. */
function wallMat(t: THREE.Texture, relief = 1.2, roughness = 0.9) {
  return withRelief(new THREE.MeshStandardMaterial({ map: t, roughness }), { strength: relief });
}

/**
 * The table or desk the track sits on: its top is the floor, and it stands in a
 * room far below. `drape`, if given, is a tablecloth hanging over the edges.
 */
function tableRoom(track: Track, theme: Theme, drape: THREE.Material | null, side: THREE.Material, look: RoomLook, extra?: (g: THREE.Group, f: NonNullable<Track['def']['floor']>, floorY: number) => void) {
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
      const geo = new THREE.PlaneGeometry(len + 1.2, hang, Math.round(len / 6), 4);
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
  // Turned legs: a lathed profile, the way a real table's are.
  const legProfile: [number, number][] = [[3.5, 0], [4.5, 4], [3.2, 12], [4, 40], [5.5, 70], [4, 110], [5, 132], [6, 140], [6, legH]];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(lathe(legProfile, side, 20), cx + sx * (w / 2 - 14), y - slabT - legH, cz + sz * (d / 2 - 14)));
  const floorY = y - slabT - legH;
  g.add(room(theme, { x: cx, z: cz, floorY, aimY: y }, look));
  extra?.(g, f, floorY);
  return g;
}

function clothDrape() {
  const t = tex.gingham('#e8414b', '#ffffff').clone();
  t.needsUpdate = true;
  t.repeat.set(9, 0.8);
  return new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: t, side: THREE.DoubleSide, roughness: 0.9, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff') });
}

/** Where a floor-level track's room is centred. */
const floorRoom = (track: Track) => {
  const b = track.bounds;
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, floorY: track.def.floorY, aimY: track.def.floorY };
};

export const THEMES: Record<string, Theme> = {
  breakfast: {
    sky: ['#ffe8c7', '#fff6e6'],
    fog: '#f6e3c8',
    fogNear: 420,
    fogFar: 2200,
    // Low morning sun through the kitchen window.
    sun: { color: '#ffe9c4', intensity: 2.5, x: -300, y: 250, z: 200 },
    hemi: { sky: '#fff3df', ground: '#b98c62', intensity: 1.1 },
    ground: () => mat('#ffffff', { map: tex.gingham('#e8414b', '#ffffff') }),
    groundRepeat: 36,
    groundRelief: { strength: 0.8, rough: [0.95, 0.8] },
    road: { base: '#3c4152', line: '#ffffff', edge: '#ffd23f', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.gingham('#e8414b', '#ffffff') }),
    skirt: () => mat('#ffffff', { map: tex.book('#c0392b') }),
    curb: ['#e63946', '#ffffff'],
    wall: 'sugar',
    look: lookWith({ tint: '#fff4e6', saturation: 1.12 }),
    backdrop: (t, th) =>
      tableRoom(t, th, clothDrape(), mat('#ffffff', { map: tex.wood('#b07a47', '#8a5a2e', 3) }), {
        floor: texMat(tex.checkerFloor('#f2efe6', '#3a3f5c'), 60, 1400),
        wall: wallMat(tex.plaster('#f7e4c6')),
        lower: { material: wallMat(tex.panelling('#e9dcc4'), 1.5, 0.6), dado: 110 },
        skirting: '#fbf7ef',
        outside: '#d8ecff',
        shafts: 0.08,
      }, (g, f, floorY) => {
        g.add(at(buildProp('chair'), (f.minX + f.maxX) / 2 + 60, floorY, f.maxZ + 70, 0, Math.PI, 0));
        g.add(at(buildProp('chair'), f.minX - 70, floorY, (f.minZ + f.maxZ) / 2, 0, Math.PI / 2, 0));
        // Kitchen counter along the far wall.
        g.add(at(box(700, 90, 60, mat('#ffffff', { map: tex.wood('#d9c2a0', '#b49b78', 2) })), 0, floorY, -560));
        g.add(at(box(700, 6, 64, mat('#e9e4dc', { shiny: 40 })), 0, floorY + 90, -560));
      }),
  },
  desk: {
    sky: ['#cfd8ff', '#eef1ff'],
    fog: '#dfe4f7',
    fogNear: 420,
    fogFar: 2200,
    sun: { color: '#fff6ea', intensity: 2.3, x: 320, y: 260, z: -160 },
    hemi: { sky: '#e8edff', ground: '#8c6b4a', intensity: 1.15 },
    ground: () => mat('#ffffff', { map: tex.wood('#a8784a', '#7a5130', 2) }),
    groundRepeat: 90,
    groundRelief: { strength: 2.5, blur: 1, rough: [0.7, 0.45] },
    road: { base: '#2f3445', line: '#ffffff', edge: '#7fd1ff', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.paper() }),
    skirt: () => mat('#ffffff', { map: tex.book('#3d5a80') }),
    curb: ['#3d9bff', '#ffffff'],
    wall: 'pencil',
    look: lookWith({ tint: '#f6f7ff' }),
    backdrop: (t, th) =>
      tableRoom(t, th, null, mat('#ffffff', { map: tex.wood('#8a5d36', '#5e3d20', 3) }), {
        floor: texMat(tex.carpet('#58607a', '#6a7390'), 30, 1400),
        wall: wallMat(tex.wallStripes('#dfe6f5', '#c9d4ec')),
        skirting: '#f4f4f0',
        outside: '#cfe4ff',
        shafts: 0.07,
      }, (g, _f, floorY) => {
        g.add(at(buildProp('shelf'), 300, floorY, -580, 0, 0, 0));
        g.add(at(buildProp('chair'), 0, floorY, 190, 0, 0, 0));
      }),
  },
  bath: {
    sky: ['#d7f6ff', '#f2fdff'],
    fog: '#dff6fb',
    fogNear: 420,
    fogFar: 2000,
    sun: { color: '#fffaf2', intensity: 2.2, x: 200, y: 260, z: 260 },
    hemi: { sky: '#eafcff', ground: '#9fd3df', intensity: 1.25 },
    ground: () => mat('#ffffff', { map: tex.tiles('#eaf6f8', '#9fc2cc', 4) }),
    groundRepeat: 24,
    groundRelief: { strength: 4, blur: 1, rough: [0.85, 0.12] },
    road: { base: '#4a5a8c', line: '#ffffff', edge: '#ffffff', dash: false },
    roughRoad: () => mat('#ffffff', { map: tex.stripes('#9ee1ff', '#ffffff', 10) }),
    skirt: () => mat('#ffffff', { map: tex.tiles('#eaf6f8', '#9fc2cc', 4), shiny: 70 }),
    curb: ['#ff8fab', '#ffffff'],
    wall: 'soap',
    look: lookWith({ tint: '#f2fbff', saturation: 1.08, bloom: 0.4 }),
    backdrop: (t, th) =>
      room(th, floorRoom(t), {
        floor: null,
        half: 540,
        height: 760,
        wall: wallMat(tex.plaster('#dff3f6')),
        lower: { material: wallMat(tex.tiles('#d4f1f7', '#9fc2cc', 4), 3, 0.2), dado: 240 },
        skirting: '#ffffff',
        outside: '#e6f6ff',
        shafts: 0.07,
      }),
  },
  sandbox: {
    sky: ['#4fb3ff', '#cdeeff'],
    fog: '#cfe6f5',
    fogNear: 500,
    fogFar: 2400,
    sun: { color: '#fff1d8', intensity: 2.6, x: -300, y: 330, z: -120 },
    hemi: { sky: '#bfe6ff', ground: '#5f9c45', intensity: 1.05 },
    ground: () => mat('#ffffff', { map: tex.grass() }),
    groundRepeat: 26,
    groundRelief: { strength: 2.5, invert: true },
    road: { base: '#474a55', line: '#ffffff', edge: '#ffffff', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.sand() }),
    skirt: () => mat('#ffffff', { map: tex.sand() }),
    curb: ['#ff7a1a', '#ffffff'],
    wall: 'stone',
    look: lookWith({ tint: '#fffaf0', saturation: 1.15 }, { sun: 1.2 }),
    backdrop: (_t, th) => {
      const g = new THREE.Group();
      g.add(buildSky(new THREE.Vector3(th.sun.x, th.sun.y, th.sun.z)));
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
    fogNear: 420,
    fogFar: 2000,
    sun: { color: '#fff0e0', intensity: 2.3, x: 260, y: 250, z: 260 },
    hemi: { sky: '#ffe9f7', ground: '#8f6fd6', intensity: 1.15 },
    ground: () => mat('#ffffff', { map: tex.carpet('#6b5bd6', '#8576ee') }),
    groundRepeat: 30,
    groundRelief: { strength: 1.5, rough: [0.95, 0.9] },
    road: { base: '#3b3561', line: '#ffd23f', edge: '#ffffff', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.rug() }),
    skirt: () => mat('#ffffff', { map: tex.stripes('#ffd166', '#ef476f', 6), shiny: 30 }),
    curb: ['#ffd23f', '#3d9bff'],
    wall: 'block',
    look: lookWith({ tint: '#fff2fb', saturation: 1.14 }),
    backdrop: (t, th) => {
      const g = new THREE.Group();
      g.add(room(th, floorRoom(t), {
        floor: null,
        half: 560,
        height: 760,
        wall: wallMat(tex.starsWallpaper(), 0.8),
        lower: { material: wallMat(tex.panelling('#f3f0ff'), 1.5, 0.55), dado: 120 },
        skirting: '#ffffff',
        outside: '#dff0ff',
        shafts: 0.08,
      }));
      // A bed against the wall and a toy chest.
      g.add(at(group(box(260, 60, 420, mat('#ffffff', { map: tex.wood('#d6a46b', '#a4733f', 3) })), at(box(250, 30, 400, mat('#7bdff2')), 0, 60, 0), at(box(200, 30, 90, mat('#ffffff')), 0, 90, -150)), 380, 0, -200));
      g.add(at(group(box(140, 70, 80, mat('#ef476f')), at(box(146, 10, 86, mat('#ffd166')), 0, 70, 0)), -380, 0, -380, 0, 0.4, 0));
      return g;
    },
  },
  garage: {
    sky: ['#0d1026', '#262b4d'],
    fog: '#151a33',
    fogNear: 300,
    fogFar: 1600,
    // Overhead strip lights, cool and hard.
    sun: { color: '#cddaff', intensity: 1.5, x: 80, y: 260, z: 60 },
    hemi: { sky: '#7d8fd6', ground: '#3a2f2a', intensity: 1.0 },
    ground: () => mat('#ffffff', { map: tex.concrete() }),
    groundRepeat: 70,
    groundRelief: { strength: 1.5, rough: [0.95, 0.55] },
    road: { base: '#262833', line: '#ffd23f', edge: '#ffd23f', dash: true },
    roughRoad: () => mat('#ffffff', { map: tex.concrete() }),
    skirt: () => mat('#ffffff', { map: tex.wood('#a77b4f', '#7a5233', 3) }),
    curb: ['#ffd23f', '#1b1b1f'],
    wall: 'tire',
    night: true,
    look: lookWith({ tint: '#e4ecff', contrast: 1.1, vignette: 0.45, bloom: 0.6 }, { env: 0.5, hemi: 0.35, sun: 1 }),
    backdrop: (t, th) => {
      const g = new THREE.Group();
      const at0 = floorRoom(t);
      // Night outside: the window is dark blue moonlight, and no shafts.
      g.add(room(th, at0, { floor: null, half: 520, height: 520, wall: wallMat(tex.cinder(), 2.5, 0.85), skirting: '#3b3f4d', outside: '#1d2a55', shafts: 0 }));
      for (let i = 0; i < 4; i++) g.add(at(buildProp('shelf'), at0.x - 300 + i * 200, 0, at0.z - 470));
      // A car parked in the corner: two huge tyres and a bumper.
      g.add(at(group(at(cyl(60, 60, 40, mat('#1b1b20'), 24), 0, 60, 0, 0, 0, Math.PI / 2), at(cyl(60, 60, 40, mat('#1b1b20'), 24), 0, 60, 280, 0, 0, Math.PI / 2), at(box(60, 140, 420, mat('#c1121f', { shiny: 80 })), -40, 60, 140)), at0.x + 420, 0, at0.z + 120));
      // Strip lights, bright enough to bloom.
      for (const x of [-200, 0, 200]) g.add(at(box(120, 4, 10, mat('#ffffff', { emissive: '#fffbe6', emissiveIntensity: 4 })), at0.x + x, 300, at0.z));
      return g;
    },
  },
};

export const themeFor = (id: string): Theme => THEMES[id] ?? THEMES.breakfast;

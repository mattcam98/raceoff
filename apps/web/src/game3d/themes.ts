/**
 * How each track looks: sky, light, the ground it sits on, its road and walls,
 * and the giant room around it that makes the karts feel tiny.
 */
import * as THREE from 'three';
import type { Track } from '@raceoff/game';
import { at, box, cyl, group, lathe, mat, slab } from './kit';
import type { Grade } from './post';
import { buildRoom, buildSky, onWall, type Room, type RoomSpec } from './rooms';
import { withRelief, type Relief } from './surface';
import { offRoadSpots } from './propClutter';
import { buildProp } from './props';
import { tex } from './textures';

export type WallStyle = 'sugar' | 'pencil' | 'block' | 'tire' | 'rail' | 'soap' | 'stone';

export interface Theme {
  sky: [string, string];
  fog: string;
  fogNear: number;
  fogFar: number;
  sun: { color: string; intensity: number; x: number; y: number; z: number };
  hemi: { sky: string; ground: string; intensity: number };
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

/** Puts a prop against a wall: `put(wall, along, up, kind, variant?, out?, scale?)`. */
type Put = (wall: number, along: number, up: number, kind: string, v?: string | number, out?: number, scale?: number) => THREE.Object3D;

/**
 * The room for a theme: its sun is the theme's sun, so the window, the light shafts and the shadows agree.
 * `dress` furnishes it; walls are 0 (-z), 1 (+x), 2 (+z), 3 (-x), and `win` says which has the window.
 */
function room(theme: Theme, place: { x: number; z: number; floorY: number; aimY: number }, look: RoomLook, dress?: (put: Put, win: Room['userData']['window']) => void) {
  const half = look.half ?? 620;
  const r = buildRoom({
    ...place,
    half,
    height: look.height ?? 640,
    sun: new THREE.Vector3(theme.sun.x, theme.sun.y, theme.sun.z),
    sunColor: theme.sun.color,
    window: { w: 340, h: 300 },
    ...look,
  });
  const put: Put = (wall, along, up, kind, v, out = 0, scale = 1) => {
    const o = onWall({ ...place, half }, wall, along, up, buildProp(kind, v), out);
    o.scale.setScalar(scale);
    r.add(o);
    return o;
  };
  if (dress) {
    const win = r.userData.window;
    dress(put, win);
    // Curtains either side of the window, the rod just above it, and a plant on the sill.
    const c = put(win.wall, win.along, 0, 'curtains', win.w + 20, 4);
    c.scale.y = (win.y + win.h / 2 + 22) / 266;
    put(win.wall, win.along - win.w * 0.28, win.y - win.h / 2 - 10, 'herbs', undefined, 12, 1.4);
  }
  return r;
}

/** The wall the window is not on, of a preferred pair. */
const awayFrom = (win: { wall: number }, wall: number) => (win.wall === wall ? (wall + 2) % 4 : wall);

/** A wall finish with world-scale tiling (a texture repeat every 100 units) and a little relief. */
function wallMat(t: THREE.Texture, relief = 1.2, roughness = 0.9) {
  return withRelief(new THREE.MeshStandardMaterial({ map: t, roughness }), { strength: relief });
}

/**
 * The table or desk the track sits on: its top is the floor, and it stands in a
 * room far below. `drape`, if given, is a tablecloth hanging over the edges.
 */
function tableRoom(
  track: Track,
  theme: Theme,
  drape: THREE.Material | null,
  side: THREE.Material,
  look: RoomLook,
  dress?: Parameters<typeof room>[3],
  extra?: (g: THREE.Group, f: NonNullable<Track['def']['floor']>, floorY: number) => void,
) {
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
  g.add(room(theme, { x: cx, z: cz, floorY, aimY: y }, look, dress));
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
        shafts: 0.025,
      }, (put, win) => {
        // A run of kitchen units and the fridge along the back wall.
        const back = awayFrom(win, 0);
        put(back, -380, 0, 'counter', 400);
        put(back, 20, 0, 'counter', 400);
        put(back, 330, 0, 'fridge');
      }, (g, f, floorY) => {
        g.add(at(buildProp('chair'), (f.minX + f.maxX) / 2 + 60, floorY, f.maxZ + 70, 0, Math.PI, 0));
        g.add(at(buildProp('chair'), f.minX - 70, floorY, (f.minZ + f.maxZ) / 2, 0, Math.PI / 2, 0));
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
      }, (put, win) => {
        const back = awayFrom(win, 0);
        for (const a of [-420, -250, -80]) put(back, a, 0, 'bookshelf');
        put(back, 250, 0, 'shelf');
        put(awayFrom(win, 3), 0, 260, 'pinboard');
      }, (g, _f, floorY) => {
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
        half: 430,
        height: 560,
        wall: wallMat(tex.plaster('#dff3f6')),
        lower: { material: wallMat(tex.tiles('#d4f1f7', '#9fc2cc', 4), 3, 0.2), dado: 240 },
        skirting: '#ffffff',
        outside: '#e6f6ff',
        shafts: 0.07,
      }, (put, win) => {
        const back = awayFrom(win, 0);
        put(back, -150, 0, 'sink');
        put(back, -150, 220, 'mirror');
        put(back, 200, 110, 'towelrail');
        put(awayFrom(win, 1), 100, 110, 'towelrail');
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
    backdrop: (t, th) => {
      const g = new THREE.Group();
      g.add(buildSky(new THREE.Vector3(th.sun.x, th.sun.y, th.sun.z)));
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        g.add(at(buildProp('fence'), Math.cos(a) * 470, 0, Math.sin(a) * 470, 0, -a + Math.PI / 2, 0));
      }
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + 0.3;
        const tree = at(buildProp('tree'), Math.cos(a) * (600 + (i % 3) * 60), 0, Math.sin(a) * (600 + (i % 3) * 60), 0, a, 0);
        tree.scale.setScalar(2.2 + (i % 4) * 0.35);
        g.add(tree);
      }
      g.add(at(buildProp('shed'), -560, 0, -520, 0, 0.75, 0));
      // Flowerbeds and tufts of grass between the track and the fence, the same every time.
      let seed = 5;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const b = t.bounds;
      const colors = ['#ff5d8f', '#ffd23f', '#b07cff', '#ffffff', '#ff8c42'];
      for (let i = 0; i < 160; i++) {
        const a = r() * Math.PI * 2;
        const d = 300 + r() * 160;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (x > b.minX - 30 && x < b.maxX + 30 && z > b.minZ - 30 && z < b.maxZ + 30) continue;
        // Flower clumps are rich (about ten thousand triangles), so only a few; grass tufts are cheap.
        const flower = i % 12 === 0;
        g.add(at(buildProp(flower ? 'flowers' : 'grass', flower ? colors[i % colors.length] : undefined), x, 0, z, 0, r() * 6, 0));
      }
      // And over the lawn inside and beside the lap, wherever the grid says nobody races. Tufts are taller than a
      // kart and karts drive through them, so they keep well back from the road, and the nearer ones are short.
      const lawn = offRoadSpots(t, 320, 11, 30, 3).filter((sp) => sp.d > 22).slice(0, 130);
      for (const [i, sp] of lawn.entries()) {
        const tuft = at(buildProp('grass', i % 7), sp.x, 0, sp.z, 0, r() * 6, 0);
        tuft.scale.setScalar(sp.d > 45 ? 1 : 0.55);
        g.add(tuft);
      }
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
      }, (put, win) => {
        const back = awayFrom(win, 0);
        // The bed's head is against the wall: it is 430 long, so its middle stands well out.
        put(back, 300, 0, 'bed', undefined, 215);
        put(back, -120, 0, 'toychest', undefined, 50);
        put(back, -360, 0, 'bookcase');
        put(back, -240, 200, 'toyshelf');
        put(awayFrom(win, 3), 0, 0, 'bookcase');
        put(awayFrom(win, 3), 0, 190, 'toyshelf');
      }));
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
    groundRelief: { strength: 0.7, rough: [0.95, 0.6] },
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
      g.add(room(th, at0, { floor: null, half: 520, height: 520, wall: wallMat(tex.cinder(), 2.5, 0.85), skirting: '#3b3f4d', outside: '#1d2a55', shafts: 0 }, (put, win) => {
        const back = awayFrom(win, 0);
        for (const a of [-360, -140, 80]) put(back, a, 0, 'metalshelf');
        put(awayFrom(win, 3), -120, 0, 'workbench');
        put(awayFrom(win, 3), -120, 200, 'pegboard');
        // The family car, nosed in to the garage.
        put(awayFrom(win, 2), 180, 0, 'carfront', '#c1121f');
      }));
      // Strip lights hanging from the ceiling.
      for (const x of [-200, 0, 200]) g.add(at(buildProp('striplight'), at0.x + x, 515, at0.z));
      return g;
    },
  },
};

export const themeFor = (id: string): Theme => THEMES[id] ?? THEMES.breakfast;

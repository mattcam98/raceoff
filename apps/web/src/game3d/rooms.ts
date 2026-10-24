/**
 * The giant rooms around the tracks: floor, walls with skirting boards, and a
 * window placed where the sun really is, so the light pouring through it, the
 * shafts of light in the air and the shadows on the table all agree. Dust
 * drifts in the light. Pictures, sockets and soft shading where walls meet
 * keep the walls from reading as flat planes. The garden gets a sky instead.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { at, box, mat, shareResource } from './kit';

/** Shared by every room's animated parts; the world advances the time, the view sets the pixel ratio. */
export const roomUniforms = { uTime: { value: 0 }, uPixelRatio: { value: 1 } };

export interface RoomSpec {
  /** Centre of the room on the floor plan, and the height of the room's floor. */
  x: number;
  z: number;
  floorY: number;
  /** Distance from the centre to each wall. */
  half: number;
  height: number;
  /** Height of the surface the light should land on (the table top), to aim the window. */
  aimY: number;
  /** Null when the track's own ground is the room's floor. */
  floor: THREE.Material | null;
  wall: THREE.Material;
  /** A different lower part of the wall (tiles, panelling), up to `dado` above the floor. */
  lower?: { material: THREE.Material; dado: number };
  skirting: string;
  /** Toward the sun, from the centre. */
  sun: THREE.Vector3;
  sunColor: string;
  /** What is seen through the glass. */
  outside: string;
  window: { w: number; h: number };
  /** How strong the shafts of light are: 0 for none (night). */
  shafts: number;
}

const beamVert = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vFade = aFade;
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying float vFade;
  varying vec2 vUv;
  void main() {
    // Soft across each face, fading out toward the floor: light in dusty air, not a solid prism.
    float across = sin(vUv.x * 3.14159);
    float along = smoothstep(1.0, 0.75, vFade) * vFade;
    gl_FragColor = vec4(uColor * uStrength * across * across * along, 1.0);
  }`;

/** A shaft of light: the tube swept from a window pane along the sunlight to where it lands. */
function beam(corners: THREE.Vector3[], dir: THREE.Vector3, length: number, color: THREE.Color, strength: number) {
  const far = corners.map((c) => c.clone().addScaledVector(dir, length));
  const pos: number[] = [];
  const uv: number[] = [];
  const fade: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const fa = far[i];
    const fb = far[(i + 1) % 4];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, fb.x, fb.y, fb.z, a.x, a.y, a.z, fb.x, fb.y, fb.z, fa.x, fa.y, fa.z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    fade.push(1, 1, 0, 1, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uStrength: { value: strength }, ...THREE.UniformsLib.fog },
    vertexShader: beamVert,
    fragmentShader: beamFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.dynamic = true;
  mesh.renderOrder = 6;
  return mesh;
}

/** Dust motes drifting slowly in the light. */
function motes(corners: THREE.Vector3[], dir: THREE.Vector3, length: number, count: number) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    // A random point in the shaft: across the pane, then some way along the light.
    const u = r();
    const v = r();
    const p = corners[0].clone().lerp(corners[1], u).lerp(corners[3].clone().lerp(corners[2], u), v);
    p.addScaledVector(dir, length * (0.05 + r() * 0.8));
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    seed[i] = r() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const m = new THREE.ShaderMaterial({
    uniforms: roomUniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTw;
      void main() {
        // Every rate below turns a whole number of times in 200 pi seconds, so wrapping there is seamless.
        float t = mod(uTime, 628.3185307);
        vec3 p = position + vec3(sin(t * 0.13 + aSeed) * 6.0, sin(t * 0.09 + aSeed * 1.7) * 4.0, cos(t * 0.11 + aSeed) * 6.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // Points are sized in buffer pixels: scaled, so they keep their size as the resolution steps.
        gl_PointSize = 500.0 * uPixelRatio / max(1.0, -mv.z);
        vTw = 0.5 + 0.5 * sin(t * 1.3 + aSeed * 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * (0.15 + vTw * 0.45), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.userData.dynamic = true;
  p.frustumCulled = false;
  return p;
}

/** A wall with an optional rectangular hole, built from up to four panels around it. */
function wallPanels(width: number, height: number, hole: { x: number; y: number; w: number; h: number } | null, material: THREE.Material) {
  const g = new THREE.Group();
  const panel = (x0: number, y0: number, x1: number, y1: number) => {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
    // World-scaled UVs, so a texture tiles the same on every panel.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 100, (y0 + uv.getY(i) * (y1 - y0)) / 100);
    const m = new THREE.Mesh(geo, material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    // The room is outside the sun's shadow map: sampling it here would only cost every wall pixel the lookups.
    m.receiveShadow = false;
    g.add(m);
  };
  const W = width / 2;
  if (!hole) panel(-W, 0, W, height);
  else {
    panel(-W, 0, W, hole.y - hole.h / 2);
    panel(-W, hole.y + hole.h / 2, W, height);
    panel(-W, hole.y - hole.h / 2, hole.x - hole.w / 2, hole.y + hole.h / 2);
    panel(hole.x + hole.w / 2, hole.y - hole.h / 2, W, hole.y + hole.h / 2);
  }
  return g;
}

/** The window: frame, glazing bars, sill and the bright world outside. Faces +z, centred on its origin. */
function windowFrame(w: number, h: number, outside: string) {
  const g = new THREE.Group();
  const frame = mat('#f4f1ea', { shiny: 40 });
  const t = 6;
  g.add(at(box(w + t * 2, t, 10, frame), 0, h / 2, 0), at(box(w + t * 2, t, 10, frame), 0, -h / 2 - t, 0));
  g.add(at(box(t, h, 10, frame), -w / 2 - t / 2, -h / 2, 0), at(box(t, h, 10, frame), w / 2 + t / 2, -h / 2, 0));
  g.add(at(box(t * 0.6, h, 6, frame), 0, -h / 2, 0), at(box(w, t * 0.6, 6, frame), 0, -t * 0.3, 0));
  g.add(at(box(w + t * 4, 4, 26, frame), 0, -h / 2 - t - 4, 8));
  // The glass shows the bright day outside: brighter than white, so it blooms like a real window does.
  const glow = new THREE.Color(outside).multiplyScalar(1.8);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: glow, fog: false }));
  glass.position.z = -3;
  glass.userData.dynamic = true;
  g.add(glass);
  return g;
}

// ---------------------------------------------------------------- wall dressing

const paintingCache = new Map<string, THREE.Texture>();

/** Three little paintings side by side in one texture, in the room's own colours: a landscape, blocks, a sun. */
function paintings(sky: string, sun: string, accent: string): THREE.Texture {
  const key = `${sky}|${sun}|${accent}`;
  const known = paintingCache.get(key);
  if (known) return known;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 3;
  c.height = S;
  const g = c.getContext('2d')!;
  // A landscape: sky, sun, two rolling hills.
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, sky);
  grd.addColorStop(1, '#fff6e6');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.fillStyle = sun;
  g.beginPath();
  g.arc(S * 0.7, S * 0.34, S * 0.13, 0, Math.PI * 2);
  g.fill();
  for (const [y, col, k] of [[0.62, '#7fb77e', 2.2], [0.74, '#4f8a5b', 3.1]] as [number, string, number][]) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, S);
    for (let x = 0; x <= S; x += 4) g.lineTo(x, S * y + Math.sin((x / S) * k * Math.PI + y * 9) * S * 0.06);
    g.lineTo(S, S);
    g.fill();
  }
  // Blocks of colour with dark lines between them.
  const x1 = S;
  g.fillStyle = '#f7f3ea';
  g.fillRect(x1, 0, S, S);
  for (const [x, y, w, h, col] of [[0, 0, 0.55, 0.6, accent], [0.55, 0, 0.45, 0.3, sun], [0.55, 0.3, 0.45, 0.7, '#f7f3ea'], [0, 0.6, 0.3, 0.4, sky], [0.3, 0.6, 0.25, 0.4, '#2b2d42']] as [number, number, number, number, string][]) {
    g.fillStyle = col;
    g.fillRect(x1 + x * S, y * S, w * S, h * S);
  }
  g.strokeStyle = '#1d1e26';
  g.lineWidth = 5;
  for (const [ax, ay, bx, by] of [[0.55, 0, 0.55, 1], [0, 0.6, 1, 0.6], [0.55, 0.3, 1, 0.3], [0.3, 0.6, 0.3, 1]]) {
    g.beginPath();
    g.moveTo(x1 + ax * S, ay * S);
    g.lineTo(x1 + bx * S, by * S);
    g.stroke();
  }
  // A big low sun in rings, like a print.
  const x2 = S * 2;
  g.fillStyle = '#fbf3e4';
  g.fillRect(x2, 0, S, S);
  [accent, sun, sky, '#fbf3e4'].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x2 + S / 2, S * 0.78, S * (0.46 - i * 0.11), Math.PI, 0);
    g.fill();
  });
  g.fillStyle = '#2b2d42';
  g.fillRect(x2 + S * 0.08, S * 0.78, S * 0.84, S * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  paintingCache.set(key, shareResource(t));
  return t;
}

/** A framed picture hung on a wall (wall-local: +z into the room), showing painting `cell` of the three. */
function picture(w: number, h: number, cell: number, art: THREE.Material, frame: THREE.Material) {
  const g = new THREE.Group();
  const t = Math.max(4, w * 0.06);
  const d = 4;
  g.add(at(box(w + t * 2, t, d, frame), 0, h / 2, 0), at(box(w + t * 2, t, d, frame), 0, -h / 2 - t, 0));
  g.add(at(box(t, h, d, frame), -w / 2 - t / 2, -h / 2, 0), at(box(t, h, d, frame), w / 2 + t / 2, -h / 2, 0));
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 3);
  const canvas = new THREE.Mesh(geo, art);
  canvas.position.z = d * 0.4;
  g.add(canvas);
  return g;
}

/** A double wall socket just above the skirting. */
function socket(plate: THREE.Material, holes: THREE.Material) {
  const g = new THREE.Group();
  g.add(at(box(16, 9, 1.2, plate), 0, 0, 0.6));
  for (const x of [-4, 4]) g.add(at(box(1.2, 2.6, 0.4, holes), x, 3.2, 1.3));
  return g;
}

/**
 * Soft shading where walls meet each other, the ceiling and the floor: light reaches less far into a corner. One
 * transparent mesh for the whole room, its darkness carried in vertex alpha. `spans` are each wall's stretches
 * clear of the window, in wall-local x; `m` places each wall.
 */
function cornerShade(walls: THREE.Matrix4[], half: number, height: number, holes: ({ x0: number; x1: number } | null)[]) {
  const pos: number[] = [];
  const col: number[] = [];
  const v = new THREE.Vector3();
  const quad = (m: THREE.Matrix4, x0: number, y0: number, x1: number, y1: number, a: [number, number, number, number]) => {
    const corners: [number, number, number][] = [[x0, y0, a[0]], [x1, y0, a[1]], [x1, y1, a[2]], [x0, y1, a[3]]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [x, y, al] = corners[i];
      v.set(x, y, 0.8).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      col.push(0, 0, 0, al);
    }
  };
  const C = Math.min(90, half * 0.15);
  walls.forEach((m, i) => {
    // Into each corner, the full height.
    quad(m, -half, 0, -half + C, height, [0.34, 0, 0, 0.34]);
    quad(m, half - C, 0, half, height, [0, 0.34, 0.34, 0]);
    // Along the ceiling and above the skirting, around the window if this wall has it.
    const hole = holes[i];
    const runs = hole ? [[-half, hole.x0], [hole.x1, half]] : [[-half, half]];
    for (const [a, b] of runs) {
      if (b - a < 1) continue;
      quad(m, a, height - 80, b, height, [0, 0, 0.28, 0.28]);
      quad(m, a, 14, b, 60, [0.2, 0.2, 0, 0]);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const shade = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#000000', vertexColors: true, transparent: true, depthWrite: false }));
  shade.renderOrder = 1;
  return shade;
}

/** A built room, with what dressing it needs: where its walls and window are. */
export interface Room extends THREE.Group {
  userData: {
    /** Which wall (0 -z, 1 +x, 2 +z, 3 -x) has the window, and where along it and how high its centre is. */
    window: { wall: number; along: number; y: number; w: number; h: number };
  };
}

/**
 * Stand `obj` against wall `wall` (0 -z, 1 +x, 2 +z, 3 -x), `along` it from the middle, `up` from the floor,
 * facing into the room (props face +z with their back at z = 0). `out` brings it off the wall.
 */
export function onWall(spec: Pick<RoomSpec, 'x' | 'z' | 'floorY' | 'half'>, wall: number, along: number, up: number, obj: THREE.Object3D, out = 0) {
  const ry = [0, -Math.PI / 2, Math.PI, Math.PI / 2][wall];
  const local = new THREE.Vector3(along, up, out).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  const base = [[0, -spec.half], [spec.half, 0], [0, spec.half], [-spec.half, 0]][wall];
  obj.position.set(spec.x + base[0] + local.x, spec.floorY + local.y, spec.z + base[1] + local.z);
  obj.rotation.y = ry;
  return obj;
}

export function buildRoom(spec: RoomSpec): Room {
  const g = new THREE.Group() as Room;
  const { x: cx, z: cz, floorY, half, height } = spec;
  if (spec.floor) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2.2, half * 2.2).rotateX(-Math.PI / 2), spec.floor);
    floor.position.set(cx, floorY, cz);
    floor.receiveShadow = false;
    g.add(floor);
  }

  // Which wall the sun comes through, and where on it: follow the sunlight back from the table to the wall.
  const sun = spec.sun.clone().normalize();
  const sunWall = Math.abs(sun.x) > Math.abs(sun.z) ? (sun.x > 0 ? 1 : 3) : sun.z > 0 ? 2 : 0;
  const walls = [
    { x: 0, z: -half, ry: 0 },
    { x: half, z: 0, ry: -Math.PI / 2 },
    { x: 0, z: half, ry: Math.PI },
    { x: -half, z: 0, ry: Math.PI / 2 },
  ];
  const horiz = Math.hypot(sun.x, sun.z) || 1;
  const toWall = half / Math.max(Math.abs(sunWall % 2 ? sun.x : sun.z) / horiz, 0.3);
  const hitX = cx + (sun.x / horiz) * toWall;
  const hitZ = cz + (sun.z / horiz) * toWall;
  const hitY = spec.aimY + (sun.y / horiz) * toWall;
  const ww = spec.window.w;
  const wh = spec.window.h;
  const winY = THREE.MathUtils.clamp(hitY - floorY, wh / 2 + 40, height - wh / 2 - 30);
  // Where the window sits along its wall: each wall's own x runs a different way round the room.
  const along = [hitX - cx, hitZ - cz, -(hitX - cx), -(hitZ - cz)][sunWall];
  const winX = THREE.MathUtils.clamp(along, -half + ww, half - ww);
  g.userData.window = { wall: sunWall, along: winX, y: winY, w: ww, h: wh };

  const art = mat('#ffffff', { map: paintings(spec.outside, spec.sunColor, spec.skirting), shiny: 20 });
  const frame = mat(spec.skirting, { shiny: 50 });
  const plate = mat('#f4f1ea', { shiny: 40 });
  const holes = mat('#2a2c36', { shiny: 30 });
  const wallMatrices: THREE.Matrix4[] = [];
  const holeSpans: ({ x0: number; x1: number } | null)[] = [];
  walls.forEach((w, i) => {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(cx + w.x, floorY, cz + w.z);
    wallGroup.rotation.y = w.ry;
    wallGroup.updateMatrix();
    wallMatrices.push(wallGroup.matrix.clone());
    holeSpans.push(i === sunWall ? { x0: winX - ww / 2 - 8, x1: winX + ww / 2 + 8 } : null);
    // Along the wall, where the window is (the wall's local x).
    let hole: { x: number; y: number; w: number; h: number } | null = null;
    if (i === sunWall) {
      hole = { x: winX, y: winY, w: ww, h: wh };
      const win = windowFrame(ww, wh, spec.outside);
      win.position.set(winX, winY, 0);
      wallGroup.add(win);
    }
    const lower = spec.lower;
    if (lower) {
      wallGroup.add(wallPanels(half * 2.2, lower.dado, null, lower.material));
      const upper = wallPanels(half * 2.2, height - lower.dado, hole ? { ...hole, y: hole.y - lower.dado } : null, spec.wall);
      upper.position.y = lower.dado;
      wallGroup.add(upper);
      wallGroup.add(at(box(half * 2.2, 5, 4, mat(spec.skirting, { shiny: 50 })), 0, lower.dado - 2.5, 2));
    } else {
      wallGroup.add(wallPanels(half * 2.2, height, hole, spec.wall));
    }
    // Skirting board along the bottom.
    wallGroup.add(at(box(half * 2.2, 14, 4, mat(spec.skirting, { shiny: 50 })), 0, 0, 2));
    // Pictures hung high, above the furniture the themes stand against the walls, and a socket or two.
    if (i !== sunWall) {
      const pw = Math.min(110, half * 0.2);
      const py = Math.max(height * 0.66, (lower?.dado ?? 0) + pw);
      wallGroup.add(at(picture(pw, pw * 0.78, i % 3, art, frame), -half * 0.5, py, 0));
      wallGroup.add(at(picture(pw * 0.7, pw * 0.9, (i + 1) % 3, art, frame), half * 0.42, py + pw * 0.08, 0));
    }
    for (const a of [-0.72, 0.28]) {
      const x = half * a;
      if (hole && Math.abs(x - hole.x) < hole.w / 2 + 20) continue;
      wallGroup.add(at(socket(plate, holes), x, 30, 0));
    }
    g.add(wallGroup);
  });
  g.add(cornerShade(wallMatrices, half, height, holeSpans));
  // Nothing built here can receive the sun's shadows (they would only cost the lookups); themes' dressing keeps its own.
  g.traverse((o) => (o.receiveShadow = false));

  if (spec.shafts > 0) {
    // Shafts through each pane, along the sunlight, down to the table.
    const wall = walls[sunWall];
    const local = new THREE.Group();
    local.position.set(cx + wall.x, floorY, cz + wall.z);
    local.rotation.y = wall.ry;
    local.updateMatrixWorld();
    const into = sun.clone().negate();
    const length = (winY + floorY - spec.aimY) / Math.max(0.2, -into.y) * 1.05;
    const color = new THREE.Color(spec.sunColor);
    for (const [px, py] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const pw = ww / 2 - 6;
      const ph = wh / 2 - 6;
      const ox = winX + px * (ww / 4);
      const oy = winY + py * (wh / 4);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(ox + (a * pw) / 2, oy + (b * ph) / 2, 4).applyMatrix4(local.matrixWorld));
      g.add(beam(corners, into, length, color, spec.shafts));
      g.add(motes(corners, into, length, 70));
    }
  }
  return g;
}

/** An outdoor sky with a sun in it, for the garden. */
export function buildSky(sunDir: THREE.Vector3): THREE.Object3D {
  const sky = new Sky();
  sky.scale.setScalar(2200);
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir).normalize();
  // The physical sky is far brighter than the rest of the scene is exposed for: bring it into range.
  sky.material.fragmentShader = sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * 0.075, 1.0 );');
  sky.material.fog = false;
  sky.userData.dynamic = true;
  return sky;
}

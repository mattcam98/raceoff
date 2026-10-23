/**
 * The giant rooms around the tracks: floor, walls with skirting boards, and a
 * window placed where the sun really is, so the light pouring through it, the
 * shafts of light in the air and the shadows on the table all agree. Dust
 * drifts in the light. The garden gets a sky instead.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { at, box, mat } from './kit';

/** Shared by every room's animated parts; the world advances it. */
export const roomUniforms = { uTime: { value: 0 } };

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
    pos.set([p.x, p.y, p.z], i * 3);
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
      varying float vTw;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.13 + aSeed) * 6.0, sin(uTime * 0.09 + aSeed * 1.7) * 4.0, cos(uTime * 0.11 + aSeed) * 6.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 500.0 / max(1.0, -mv.z);
        vTw = 0.5 + 0.5 * sin(uTime * 1.3 + aSeed * 5.0);
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
    m.receiveShadow = true;
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
    floor.receiveShadow = true;
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

  walls.forEach((w, i) => {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(cx + w.x, floorY, cz + w.z);
    wallGroup.rotation.y = w.ry;
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
    g.add(wallGroup);
  });

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

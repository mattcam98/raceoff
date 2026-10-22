/**
 * Dev-only prop gallery (apps/web/prop-gallery.html, not part of the app build): renders props, or a
 * whole track, with the game's lighting and post effects, and counts what they cost. Driven from the
 * console or a headless browser:
 *   show('mug:#3d5a80', 'breakfast', { yaw: 0.6, elev: 0.35, kart: true })
 *   showTrack('desk', [0, 60, 200], [0, 0, 0])
 *   stats('garage')
 */
import '@fontsource-variable/bricolage-grotesque/wdth.css';
import '@fontsource-variable/figtree';
import * as THREE from 'three';
import { CHARACTERS } from '@raceoff/shared';
import { getTrack } from '@raceoff/game';
import { environmentFor } from './env';
import { bake, disposeTree } from './kit';
import { buildKart } from './kartModel';
import { Post } from './post';
import { buildProp } from './props';
import { tex } from './textures';
import { THEMES, type Theme } from './themes';
import { buildWorld } from './world';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const W = innerWidth;
const H = innerHeight;
renderer.setSize(W, H, false);
const post = new Post(renderer);
post.setSize(W, H, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, W / H, 0.5, 5000);
const hemi = new THREE.HemisphereLight();
const sun = new THREE.DirectionalLight();
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.35;
sun.shadow.radius = 3;
let content = new THREE.Group();
let env: THREE.WebGLRenderTarget | null = null;
let lamps: THREE.Light[] = [];

/** The same lights view.ts sets for a track, centred on `c` and covering `half` units. */
function light(th: Theme, c: THREE.Vector3, half: number) {
  scene.background = tex.sky(th.sky[0], th.sky[1]);
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
  env?.dispose();
  env = environmentFor(renderer, th);
  scene.environment = env.texture;
  scene.environmentIntensity = th.look.env;
  hemi.color.set(th.hemi.sky);
  hemi.groundColor.set(th.hemi.ground);
  hemi.intensity = th.hemi.intensity * th.look.hemi;
  sun.color.set(th.sun.color);
  sun.intensity = th.sun.intensity * th.look.sun;
  post.setGrade(th.look.grade);
  sun.position.set(c.x + th.sun.x, c.y + th.sun.y, c.z + th.sun.z);
  sun.target.position.copy(c);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -half;
  cam.right = cam.top = half;
  cam.near = 10;
  cam.far = 1500;
  cam.updateProjectionMatrix();
  for (const l of lamps) scene.remove(l);
  lamps = [];
  if (th.night) {
    for (const [x, z, col] of [[-80, -40, '#ffcf8a'], [90, 50, '#8ad4ff'], [0, 0, '#ffffff']] as [number, number, string][]) {
      const pl = new THREE.PointLight(col, 3500, 260, 1.6);
      pl.position.set(c.x + x, c.y + 60, c.z + z);
      scene.add(pl);
      lamps.push(pl);
    }
  }
}

function setContent(g: THREE.Group) {
  scene.clear();
  disposeTree(content);
  content = g;
  scene.add(hemi, sun, sun.target, content, ...lamps);
}

function draw(focus: number) {
  const v = { x: 0, y: 0, w: W, h: H, near: camera.near, far: camera.far, focus, speed: 0 };
  post.begin();
  post.viewport(v);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  post.end([v], 0);
}

function parse(spec: string): [string, string | number | undefined] {
  const [k, v] = spec.split(':');
  return [k, v === undefined ? undefined : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v];
}

/** One or more props side by side (specs like 'mug:#3d5a80'), framed from a kart's-eye angle. */
function show(specs: string | string[], theme = 'breakfast', o: { yaw?: number; elev?: number; kart?: boolean; zoom?: number; scale?: number } = {}) {
  const th = THEMES[theme];
  const g = new THREE.Group();
  let x = 0;
  for (const s of Array.isArray(specs) ? specs : [specs]) {
    const p = buildProp(...parse(s));
    p.scale.setScalar(o.scale ?? 1);
    const b = new THREE.Box3().setFromObject(p);
    p.position.x = x - b.min.x;
    x += b.max.x - b.min.x + 6;
    g.add(p);
  }
  g.position.x = -x / 2 + 3;
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const ctr = box.getCenter(new THREE.Vector3());
  const R = Math.max(size.x, size.y, size.z, 6);
  const ground = (th.ground() as THREE.MeshStandardMaterial).clone();
  if (ground.map) {
    ground.map = ground.map.clone();
    ground.map.needsUpdate = true;
    ground.map.repeat.setScalar(R * 8 / th.groundRepeat);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 8, R * 8).rotateX(-Math.PI / 2), ground);
  floor.receiveShadow = true;
  const root = new THREE.Group();
  root.add(bake(g, 'props'), floor);
  if (o.kart) {
    const c = CHARACTERS[0];
    const k = buildKart(c, 'racer', null).root;
    k.position.set(box.max.x + 4, 0, box.max.z - 2);
    k.rotation.y = -0.6;
    root.add(k);
  }
  setContent(root);
  light(th, ctr, R * 2);
  const yaw = o.yaw ?? 0.5;
  const elev = o.elev ?? 0.3;
  const dist = (R * 1.25) / (o.zoom ?? 1) / Math.tan((camera.fov * Math.PI) / 360) / Math.max(1, (W / H) * 0.7);
  camera.position.set(ctr.x + Math.sin(yaw) * Math.cos(elev) * dist, ctr.y + Math.sin(elev) * dist, ctr.z + Math.cos(yaw) * Math.cos(elev) * dist);
  camera.lookAt(ctr);
  camera.near = dist / 50;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  scene.fog = null;
  draw(dist * 2);
}

/** A whole track world, as the game builds it, from one camera. */
function showTrack(id: string, from: [number, number, number], to: [number, number, number]) {
  const track = getTrack(id);
  const w = buildWorld(track);
  const root = new THREE.Group();
  root.add(w.group);
  setContent(root);
  const b = track.bounds;
  light(w.theme, new THREE.Vector3((b.minX + b.maxX) / 2, track.def.floorY, (b.minZ + b.maxZ) / 2), Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 20);
  camera.position.set(...from);
  camera.lookAt(new THREE.Vector3(...to));
  camera.near = 0.5;
  camera.far = 3000;
  camera.updateProjectionMatrix();
  draw(new THREE.Vector3(...from).distanceTo(new THREE.Vector3(...to)) * 1.4);
}

function count(root: THREE.Object3D) {
  let tris = 0;
  let calls = 0;
  const textured = new Set<string>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const n = m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
    tris += n / 3;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    calls += Array.isArray(m.material) ? Math.max(1, m.geometry.groups.length) : 1;
    for (const x of mats) if ((x as THREE.MeshStandardMaterial).map) textured.add(x.uuid);
  });
  return { tris: Math.round(tris), calls, textured: textured.size };
}

/** What a track's props cost once baked, and the whole static world. */
function stats(id: string) {
  const track = getTrack(id);
  const g = new THREE.Group();
  for (const p of track.def.props ?? []) {
    const o = buildProp(p.k, p.v);
    o.position.set(p.x, p.y ?? track.def.floorY, p.z);
    o.rotation.y = p.r ?? 0;
    if (p.s) o.scale.setScalar(p.s);
    g.add(o);
  }
  const props = count(bake(g));
  const world = count(buildWorld(track).group);
  return { id, props, world };
}

/** Every prop kind's own cost, unbaked: triangles and meshes. */
function kindStats(kinds: string[]) {
  return Object.fromEntries(kinds.map((s) => [s, count(bake(buildProp(...parse(s))))]));
}

Object.assign(window, { show, showTrack, stats, kindStats, galleryReady: document.fonts.ready.then(() => true) });

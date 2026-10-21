/**
 * A tiny modelling kit: cached materials and primitives that stand on the
 * ground at their origin, so props read like a recipe.
 */
import * as THREE from 'three';

const mats = new Map<string, THREE.Material>();

/** Geometries, materials and textures used by many objects: never freed along with any one of them. */
const sharedResources = new WeakSet<object>();
export function shareResource<T extends object>(r: T): T {
  sharedResources.add(r);
  return r;
}

/**
 * Free the GPU memory of everything under `root` that belongs to it alone: geometries, materials and the
 * textures those materials own. Shared resources (cached materials and textures, module-wide geometries)
 * are left alone. three keeps a geometry's buffers until it is disposed, even once nothing draws it.
 */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // Every sprite shares one geometry inside three.
    if (m.geometry && !(o as THREE.Sprite).isSprite && !sharedResources.has(m.geometry)) m.geometry.dispose();
    const list = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const material of list) {
      if (sharedResources.has(material)) continue;
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture | null)?.isTexture && !sharedResources.has(value)) (value as THREE.Texture).dispose();
      }
      material.dispose();
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}

export interface MatOpts {
  shiny?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  map?: THREE.Texture;
  side?: THREE.Side;
  flat?: boolean;
}

/** A material by colour and finish, made once. Shiny ones are Phong (ceramic, plastic), the rest Lambert. */
export function mat(color: string, o: MatOpts = {}): THREE.Material {
  const key = `${color}|${o.shiny ?? 0}|${o.emissive ?? ''}|${o.emissiveIntensity ?? 1}|${o.opacity ?? 1}|${o.map?.uuid ?? ''}|${o.side ?? 0}|${o.flat ? 1 : 0}`;
  let m = mats.get(key);
  if (m) return m;
  const common = {
    color: new THREE.Color(color),
    map: o.map ?? null,
    transparent: (o.opacity ?? 1) < 1,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    flatShading: o.flat ?? false,
    emissive: new THREE.Color(o.emissive ?? '#000000'),
    emissiveIntensity: o.emissiveIntensity ?? 1,
  };
  m = o.shiny ? new THREE.MeshPhongMaterial({ ...common, shininess: o.shiny, specular: new THREE.Color('#444444') }) : new THREE.MeshLambertMaterial(common);
  if (common.transparent) (m as THREE.Material).depthWrite = false;
  mats.set(key, m);
  return shareResource(m);
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

type Mat = THREE.Material | string;
const asMat = (m: Mat) => (typeof m === 'string' ? mat(m) : m);

/** A cylinder standing on y = 0. */
export function cyl(rTop: number, rBottom: number, h: number, m: Mat, segs = 20) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segs);
  g.translate(0, h / 2, 0);
  return mesh(g, asMat(m));
}

/** A box standing on y = 0. */
export function box(w: number, h: number, d: number, m: Mat | THREE.Material[]) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return mesh(g, Array.isArray(m) ? m : asMat(m));
}

export function ball(r: number, m: Mat, segs = 18) {
  const g = new THREE.SphereGeometry(r, segs, Math.max(8, Math.round(segs * 0.7)));
  return mesh(g, asMat(m));
}

export function torus(r: number, tube: number, m: Mat, arc = Math.PI * 2, segs = 28) {
  return mesh(new THREE.TorusGeometry(r, tube, 10, segs, arc), asMat(m));
}

export function cone(r: number, h: number, m: Mat, segs = 16) {
  const g = new THREE.ConeGeometry(r, h, segs);
  g.translate(0, h / 2, 0);
  return mesh(g, asMat(m));
}

/** A lathed profile, given as [radius, height] pairs from the bottom up. */
export function lathe(profile: [number, number][], m: Mat, segs = 32) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  return mesh(g, asMat(m));
}

/** A rounded slab: a box with bevelled vertical edges. */
export function slab(w: number, h: number, d: number, r: number, m: Mat) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const z = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, z);
  s.lineTo(x + w - r, z);
  s.quadraticCurveTo(x + w, z, x + w, z + r);
  s.lineTo(x + w, z + d - r);
  s.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
  s.lineTo(x + r, z + d);
  s.quadraticCurveTo(x, z + d, x, z + d - r);
  s.lineTo(x, z + r);
  s.quadraticCurveTo(x, z, x + r, z);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: Math.min(r * 0.4, h * 0.2), bevelSize: Math.min(r * 0.4, h * 0.2), bevelSegments: 2, curveSegments: 6 });
  g.rotateX(Math.PI / 2);
  g.translate(0, h, 0);
  return mesh(g, asMat(m));
}

/** Place an object: position, then rotations in radians. Returns it for chaining. */
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

export function scaled<T extends THREE.Object3D>(o: T, sx: number, sy = sx, sz = sx): T {
  o.scale.set(sx, sy, sz);
  return o;
}

export function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/** A flat decal lying on the ground. */
export function decal(w: number, d: number, m: Mat, y = 0.04) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const o = mesh(g, asMat(m));
  o.castShadow = false;
  return o;
}

/**
 * Merge every static mesh under `root` into as few meshes as possible. Plain
 * coloured materials of the same kind and finish share one mesh, their colours
 * carried per vertex; textured, transparent and glowing materials keep their
 * own. A scene of hundreds of little parts draws in a few dozen calls.
 */
export function bake(root: THREE.Object3D, name = 'baked'): THREE.Group {
  root.updateMatrixWorld(true);
  interface Bucket {
    material: THREE.Material;
    geos: { g: THREE.BufferGeometry; color: THREE.Color | null }[];
    cast: boolean;
    receive: boolean;
  }
  const buckets = new Map<string, Bucket>();
  const keep: THREE.Object3D[] = [];
  /** One shared vertex-coloured material per kind of finish, made for this bake only. */
  const shared = (m: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial): { key: string; make: () => THREE.Material } | null => {
    if (m.map || m.transparent || m.emissiveIntensity * (m.emissive.r + m.emissive.g + m.emissive.b) > 0) return null;
    const phong = (m as THREE.MeshPhongMaterial).isMeshPhongMaterial;
    const shininess = phong ? (m as THREE.MeshPhongMaterial).shininess : 0;
    const key = `vc|${phong ? 'p' : 'l'}|${shininess}|${m.flatShading ? 1 : 0}|${m.side}`;
    return {
      key,
      make: () => {
        const opts = { vertexColors: true, flatShading: m.flatShading, side: m.side };
        return phong ? new THREE.MeshPhongMaterial({ ...opts, shininess, specular: (m as THREE.MeshPhongMaterial).specular.clone() }) : new THREE.MeshLambertMaterial(opts);
      },
    };
  };
  const visit = (o: THREE.Object3D) => {
    // Anything marked dynamic moves or changes later: it stays a separate object, children and all.
    if (o.userData.dynamic) return void keep.push(o);
    for (const c of o.children) visit(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (Array.isArray(m.material) || (m.material as THREE.Material).transparent) return void keep.push(m);
    let g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    // Merging needs the same attributes everywhere: position, normal and uv.
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const mat = m.material as THREE.MeshLambertMaterial;
    const sh = mat.isMeshLambertMaterial || (mat as unknown as THREE.MeshPhongMaterial).isMeshPhongMaterial ? shared(mat) : null;
    const key = sh ? sh.key : mat.uuid;
    let b = buckets.get(key);
    if (!b) {
      b = { material: sh ? sh.make() : mat, geos: [], cast: false, receive: false };
      buckets.set(key, b);
    }
    b.geos.push({ g, color: sh ? mat.color : null });
    b.cast ||= m.castShadow;
    b.receive ||= m.receiveShadow;
  };
  visit(root);
  const out = new THREE.Group();
  out.name = name;
  for (const b of buckets.values()) {
    const merged = mergeAll(b.geos);
    const mm = new THREE.Mesh(merged, b.material);
    mm.castShadow = b.cast;
    mm.receiveShadow = b.receive;
    mm.matrixAutoUpdate = false;
    out.add(mm);
  }
  for (const o of keep) {
    // Keep its world placement now that it leaves its parent.
    o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

function mergeAll(geos: { g: THREE.BufferGeometry; color: THREE.Color | null }[]): THREE.BufferGeometry {
  let count = 0;
  for (const { g } of geos) count += g.attributes.position.count;
  const colored = geos.some((x) => x.color);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = colored ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const { g, color } of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    if (col && color) for (let i = 0; i < n; i++) col.set([color.r, color.g, color.b], (o + i) * 3);
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

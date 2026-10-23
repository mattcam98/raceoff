/**
 * The prop workshop: a small set of finishes and shape helpers the household props are made from.
 *
 * Finishes are deliberately few. bake() merges every plain-coloured part that shares a finish into one
 * vertex-coloured mesh, so a whole kitchen of ceramic, plastic and steel draws in a handful of calls.
 * Textured materials are cached singletons, so every copy of a prop on a track shares one draw call.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shareResource } from './kit';

/** Builds one kind of prop; `v` is its variant (a colour, a count or a name). */
export type Builder = (v?: string | number) => THREE.Object3D;

// ---------------------------------------------------------------- finishes

const cache = new Map<string, THREE.Material>();
function made<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = shareResource(make());
    cache.set(key, m);
  }
  return m;
}

/** Roughness of the shared finishes: every plain part uses one of these, so they merge. */
const R = { matte: 0.88, cloth: 0.95, rubber: 0.72, satin: 0.55, gloss: 0.3 } as const;
export type Finish = keyof typeof R;

/** A plain dielectric surface: wood paint, cardboard, cloth, rubber, toy plastic. */
export const std = (color: string, finish: Finish = 'satin') =>
  made(`std|${color}|${finish}`, () => new THREE.MeshStandardMaterial({ color, roughness: R[finish], metalness: 0 }));

export const matte = (c: string) => std(c, 'matte');
export const cloth = (c: string) => std(c, 'cloth');
export const rubber = (c: string) => std(c, 'rubber');
export const satin = (c: string) => std(c, 'satin');
export const plastic = (c: string) => std(c, 'gloss');

/** Glazed ceramic, enamel and lacquer: a glossy clear coat over a coloured body. Also glossy fruit and jam. */
export const glaze = (color: string) =>
  made(`glaze|${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 }));

/** Bare metal: chrome is a mirror, steel is brushed, both take their colour per vertex. */
export const chrome = (color = '#e8ebf0') => made(`chrome|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 1 }));
export const steel = (color = '#c4c9d1') => made(`steel|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 1 }));
export const BRASS = '#d8b26a';

/** Something that glows: a bulb, a screen, an LED. Kept as its own draw call so bloom picks it up. */
export const glow = (color: string, intensity = 1.5) =>
  made(`glow|${color}|${intensity}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));

/**
 * Clear glass without a transmission pass: mostly see-through face-on, it turns opaque and mirror-like at
 * grazing angles and wherever it catches a reflection, which is what makes glass read as glass.
 */
export const glass = (tint = '#eef8ff', opacity = 0.12, rough = 0.04) =>
  made(`glass|${tint}|${opacity}|${rough}`, () => {
    const m = new THREE.MeshPhysicalMaterial({ color: tint, roughness: rough, metalness: 0, transparent: true, opacity, depthWrite: false, envMapIntensity: 1.8, specularIntensity: 1 });
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float glassFr = pow(1.0 - saturate(abs(dot(geometryNormal, geometryViewDir))), 3.0);
        vec3 glassSp = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
        gl_FragColor.a = saturate(diffuseColor.a + glassFr * 0.75 + dot(glassSp, vec3(0.3, 0.59, 0.11)) * 1.4);`,
      );
    };
    m.customProgramCacheKey = () => 'propglass';
    return m;
  });

/** A translucent liquid or plastic: coloured, glossy, partly see-through. */
export const clear = (color: string, opacity = 0.6) =>
  made(`clear|${color}|${opacity}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, transparent: true, opacity, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05 }));

export interface PrintOpts {
  rough?: number;
  metal?: number;
  normalMap?: THREE.Texture;
  normalScale?: number;
  clearcoat?: number;
  color?: string;
  side?: THREE.Side;
  emissive?: number;
  alphaTest?: number;
}

/** A textured surface: printed packaging, wood, fabric, food. One shared material per texture and finish. */
export const printed = (map: THREE.Texture, o: PrintOpts = {}) =>
  made(`print|${map.uuid}|${o.rough ?? 0.6}|${o.metal ?? 0}|${o.normalMap?.uuid ?? ''}|${o.normalScale ?? 1}|${o.clearcoat ?? 0}|${o.color ?? ''}|${o.side ?? 0}|${o.emissive ?? 0}|${o.alphaTest ?? 0}`, () => {
    const p = {
      map,
      color: o.color ?? '#ffffff',
      roughness: o.rough ?? 0.6,
      metalness: o.metal ?? 0,
      normalMap: o.normalMap ?? null,
      normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
      side: o.side ?? THREE.FrontSide,
      emissive: o.emissive ? new THREE.Color('#ffffff') : new THREE.Color('#000000'),
      emissiveMap: o.emissive ? map : null,
      emissiveIntensity: o.emissive ?? 0,
      alphaTest: o.alphaTest ?? 0,
    };
    return o.clearcoat ? new THREE.MeshPhysicalMaterial({ ...p, clearcoat: o.clearcoat, clearcoatRoughness: 0.08 }) : new THREE.MeshStandardMaterial(p);
  });

// ---------------------------------------------------------------- meshes

export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

export type Rect = [u0: number, v0: number, u1: number, v1: number];
export type BoxFaces = Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', Rect>> & { rest?: Rect };
const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

/**
 * Map each face of a box-shaped geometry (centred, from BoxGeometry or RoundedBoxGeometry) onto a rectangle
 * of one texture, each the right way up as seen from outside: front is +z, top is seen with the front
 * towards you. Bevels take the texture of the face they belong to. The faces then share one material.
 */
export function boxUV(geo: THREE.BufferGeometry, w: number, h: number, d: number, faces: BoxFaces) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const index = geo.index;
  geo.groups.forEach((grp) => {
    const key = FACE_KEYS[grp.materialIndex ?? 0];
    const r = faces[key] ?? faces.rest ?? [0, 0, 0.001, 0.001];
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const vi = index ? index.getX(i) : i;
      const x = pos.getX(vi) / w + 0.5;
      const y = pos.getY(vi) / h + 0.5;
      const z = pos.getZ(vi) / d + 0.5;
      const [u, v] = key === 'px' ? [1 - z, y] : key === 'nx' ? [z, y] : key === 'pz' ? [x, y] : key === 'nz' ? [1 - x, y] : key === 'py' ? [x, 1 - z] : [x, z];
      uv.setXY(vi, r[0] + (r[2] - r[0]) * clamp01(u), r[1] + (r[3] - r[1]) * clamp01(v));
    }
  });
  uv.needsUpdate = true;
  geo.clearGroups();
  return geo;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** A box with rounded edges standing on y = 0; `faces` maps it onto one texture (see boxUV). */
export function rbox(w: number, h: number, d: number, r: number, m: THREE.Material, faces?: BoxFaces, segs = 2) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const g = new RoundedBoxGeometry(w, h, d, segs, Math.max(0.001, r));
  if (faces) boxUV(g, w, h, d, faces);
  else g.clearGroups();
  g.translate(0, h / 2, 0);
  return mesh(g, m);
}

/** Squash a geometry's uvs into a rectangle of a shared texture. */
export function uvRect<G extends THREE.BufferGeometry>(g: G, r: Rect): G {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + (r[2] - r[0]) * uv.getX(i), r[1] + (r[3] - r[1]) * uv.getY(i));
  uv.needsUpdate = true;
  return g;
}

/** A smooth curve through [radius, height] points, `n` samples: for lathed bodies. */
export function spline(pts: [number, number][], n = 40): [number, number][] {
  const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return c.getSpacedPoints(n).map((p) => [Math.max(0, p.x), p.y]);
}

/** A lathed body from [radius, height] pairs, bottom up; `smooth` runs a spline through them first. */
export function turn(profile: [number, number][], m: THREE.Material, segs = 40, smooth = 0) {
  const pts = smooth ? spline(profile, smooth) : profile;
  return mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), segs), m);
}

/**
 * A tube swept along a path whose radius may change along it (spouts, handles, cables, stems, hoses).
 * `radius` is a number or a function of 0-1 along the path. Ends are capped when `caps` is set.
 */
export function sweep(points: THREE.Vector3[] | THREE.Curve<THREE.Vector3>, radius: number | ((t: number) => number), m: THREE.Material, seg = 32, radial = 10, caps = true) {
  const curve = Array.isArray(points) ? new THREE.CatmullRomCurve3(points, false, 'centripetal') : points;
  const fr = curve.computeFrenetFrames(seg, false);
  const rad = typeof radius === 'number' ? () => radius : radius;
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, p);
    const r = rad(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(fr.normals[i]).multiplyScalar(-Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a)).normalize();
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  if (caps) {
    for (const [i, sgn] of [[0, -1], [seg, 1]] as const) {
      const t = i / seg;
      curve.getPointAt(t, p);
      const tan = fr.tangents[i];
      const c = pos.length / 3;
      pos.push(p.x, p.y, p.z);
      nor.push(tan.x * sgn, tan.y * sgn, tan.z * sgn);
      uvs.push(t, 0.5);
      const r = rad(t);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        n.copy(fr.normals[i]).multiplyScalar(-Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a)).normalize();
        pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
        nor.push(tan.x * sgn, tan.y * sgn, tan.z * sgn);
        uvs.push(t, j / radial);
      }
      for (let j = 0; j < radial; j++) sgn > 0 ? idx.push(c, c + 1 + j, c + 2 + j) : idx.push(c, c + 2 + j, c + 1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return mesh(g, m);
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export { v3 };

/** A rounded rectangle outline centred on the origin. */
export function roundRect(w: number, h: number, r: number, s: THREE.Shape | THREE.Path = new THREE.Shape()) {
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * A shape (drawn in x/y) extruded `depth` with a rounded bevel. `lie` lays it flat on the ground with the
 * shape's y running along -z (a cut-out lying on a table); otherwise it stands up, extruded towards +z
 * from z = 0. UVs on the faces are the shape's own coordinates scaled by `uvScale`.
 */
export function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, bevel: number, m: THREE.Material, o: { lie?: boolean; curve?: number; bevelSegs?: number; uvScale?: number } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: o.bevelSegs ?? 3,
    curveSegments: o.curve ?? 12,
  });
  g.translate(0, 0, bevel);
  if (o.uvScale) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.uvScale, uv.getY(i) * o.uvScale);
  }
  g.clearGroups();
  if (o.lie) g.rotateX(-Math.PI / 2);
  return mesh(g, m);
}

/** Planar uvs from world x/z over a w x d area centred on the origin: for things seen from above. */
export function topUV<G extends THREE.BufferGeometry>(g: G, w: number, d: number, r: Rect = [0, 0, 1, 1]): G {
  const pos = g.attributes.position;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, r[0] + (r[2] - r[0]) * clamp01(pos.getX(i) / w + 0.5), r[1] + (r[3] - r[1]) * clamp01(0.5 - pos.getZ(i) / d));
  uv.needsUpdate = true;
  return g;
}

/** Smooth 3D value noise in -1..1, seeded: for lumpy stones, foliage and dough. */
export function noise3(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = (i: number) => perm[i & 511] / 127.5 - 1;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number, z: number) => {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    const Z = Math.floor(z);
    const u = fade(x - X);
    const v = fade(y - Y);
    const w = fade(z - Z);
    const h = (a: number, b: number, c: number) => val(perm[(perm[(X + a) & 255] + Y + b) & 255] + Z + c);
    return lerp(
      lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
      lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v),
      w,
    );
  };
}

/** Push every vertex along its normal by smooth noise: rocks, bushes, lumps of sand. Welds seams first. */
export function lumpy(geo: THREE.BufferGeometry, amp: number, freq: number, seed = 1) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  const n = noise3(seed);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = (n(x * freq, y * freq, z * freq) + 0.5 * n(x * freq * 2.3 + 7, y * freq * 2.3, z * freq * 2.3)) * amp;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
  return g;
}

/** Spherical uvs (u around y, v up) for a geometry centred on the origin. */
export function sphereUV<G extends THREE.BufferGeometry>(g: G): G {
  const pos = g.attributes.position;
  const uv = (g.attributes.uv as THREE.BufferAttribute) ?? new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    uv.setXY(i, 0.5 + Math.atan2(x, z) / (Math.PI * 2), 0.5 + Math.asin(Math.max(-1, Math.min(1, y / Math.hypot(x, y, z)))) / Math.PI);
  }
  g.setAttribute('uv', uv);
  return g;
}


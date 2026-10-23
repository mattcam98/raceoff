/**
 * Relief for painted textures. A texture's own light and dark become height
 * (grout and grain lines sink, woven threads rise), and that height becomes a
 * normal map, so the sun picks out the surface the way it would on the real
 * thing. Roughness maps come the same way: the dark parts of asphalt are
 * rough, the painted lines smoother.
 */
import * as THREE from 'three';
import { shareResource } from './kit';

// Keyed by the picture (a texture's source), not the texture: a world's floor is a fresh copy of a cached
// texture each time, and keying by that copy would paint and keep a new relief map on every track change.
const normals = new Map<string, THREE.Texture>();
const roughs = new Map<string, THREE.Texture>();

function pixels(t: THREE.Texture) {
  const src = t.image as HTMLCanvasElement;
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  return { w, h, lum };
}

function toTexture(w: number, h: number, fill: (i: number, out: Uint8ClampedArray, o: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) fill(i, img.data, i * 4);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  // Data, not colour: no sRGB conversion.
  t.colorSpace = THREE.NoColorSpace;
  return shareResource(t);
}

/**
 * A normal map from a texture's brightness. `invert` makes dark parts raised (dark threads on a cloth);
 * by default dark parts are low (grout, grain, cracks). `blur` softens the relief, in pixels.
 */
export function bumpFrom(t: THREE.Texture, strength = 2, invert = false, blur = 1): THREE.Texture {
  const key = `${t.source.uuid}|${strength}|${invert}|${blur}`;
  let n = normals.get(key);
  if (n) return n;
  const { w, h, lum } = pixels(t);
  let hgt = lum;
  for (let pass = 0; pass < blur; pass++) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += hgt[((y + dy + h) % h) * w + ((x + dx + w) % w)];
        out[y * w + x] = s / 9;
      }
    hgt = out;
  }
  const sign = invert ? -1 : 1;
  const at = (x: number, y: number) => hgt[((y + h) % h) * w + ((x + w) % w)] * sign;
  n = toTexture(w, h, (i, o, k) => {
    const x = i % w;
    const y = (i / w) | 0;
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    o[k] = ((-dx / len) * 0.5 + 0.5) * 255;
    o[k + 1] = ((dy / len) * 0.5 + 0.5) * 255;
    o[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
    o[k + 3] = 255;
  });
  normals.set(key, n);
  return n;
}

/** A roughness map from brightness: dark parts get `dark`, light parts `light` (green channel, as three reads it). */
export function roughFrom(t: THREE.Texture, dark: number, light: number): THREE.Texture {
  const key = `${t.source.uuid}|${dark}|${light}`;
  let r = roughs.get(key);
  if (r) return r;
  const { w, h, lum } = pixels(t);
  r = toTexture(w, h, (i, o, k) => {
    const v = (dark + (light - dark) * lum[i]) * 255;
    o[k] = o[k + 1] = o[k + 2] = v;
    o[k + 3] = 255;
  });
  roughs.set(key, r);
  return r;
}

export interface Relief {
  strength: number;
  invert?: boolean;
  blur?: number;
  /** Roughness of the darkest and lightest parts, if it should vary across the texture. */
  rough?: [number, number];
}

/** Give a textured standard material relief from its own colour map, sharing the map's repeat and offset. */
export function withRelief<T extends THREE.MeshStandardMaterial>(m: T, r: Relief): T {
  if (!m.map) return m;
  // Each map must tile exactly like the colour map: same repeat, same offset.
  const follow = (t: THREE.Texture) => {
    const own = t.clone();
    own.repeat.copy(m.map!.repeat);
    own.offset.copy(m.map!.offset);
    own.needsUpdate = true;
    return own;
  };
  if (r.strength > 0) m.normalMap = follow(bumpFrom(m.map, r.strength, r.invert, r.blur ?? 1));
  if (r.rough) {
    m.roughnessMap = follow(roughFrom(m.map, r.rough[0], r.rough[1]));
    m.roughness = 1;
  }
  return m;
}

/**
 * Skid marks: dark stripes left on the road behind drifting and braking
 * wheels, fading out over a few seconds. One ring buffer of quads, one draw.
 */
import * as THREE from 'three';

const MAX = 1400;
const LIFE = 7;
const WIDTH = 0.42;

const VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.06, 0.06, 0.08, vAlpha);
  }`;

export class Skids {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(MAX * 4 * 3);
  private alpha = new Float32Array(MAX * 4);
  private born = new Float32Array(MAX).fill(-1e9);
  private strength = new Float32Array(MAX);
  private next = 0;
  private last = new Map<string, { x: number; y: number; z: number }>();
  private geo = new THREE.BufferGeometry();
  private time = 0;

  constructor() {
    const idx = new Uint32Array(MAX * 6);
    for (let i = 0; i < MAX; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Lay a mark from where this wheel was last to (x, y, z). Pass `on = false` to lift the wheel. */
  mark(key: string, x: number, y: number, z: number, on: boolean, strength = 0.5) {
    const prev = this.last.get(key);
    if (!on) {
      this.last.delete(key);
      return;
    }
    if (!prev) {
      this.last.set(key, { x, y, z });
      return;
    }
    const dx = x - prev.x;
    const dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.35) return;
    if (len > 4) {
      // A jump in position (a respawn, a teleport): start a fresh mark.
      this.last.set(key, { x, y, z });
      return;
    }
    const nx = (-dz / len) * (WIDTH / 2);
    const nz = (dx / len) * (WIDTH / 2);
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const p = this.pos;
    const o = i * 12;
    const ya = prev.y + 0.11;
    const yb = y + 0.11;
    p.set([prev.x - nx, ya, prev.z - nz, prev.x + nx, ya, prev.z + nz, x - nx, yb, z - nz, x + nx, yb, z + nz], o);
    this.born[i] = this.time;
    this.strength[i] = strength;
    this.last.set(key, { x, y, z });
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number) {
    this.time += dt;
    let dirty = false;
    for (let i = 0; i < MAX; i++) {
      const age = this.time - this.born[i];
      const a = age < LIFE ? this.strength[i] * (1 - age / LIFE) : 0;
      if (this.alpha[i * 4] === a) continue;
      this.alpha[i * 4] = this.alpha[i * 4 + 1] = this.alpha[i * 4 + 2] = this.alpha[i * 4 + 3] = a;
      dirty = true;
    }
    if (dirty) (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.born.fill(-1e9);
    this.last.clear();
  }
}

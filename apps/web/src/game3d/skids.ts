/**
 * Skid marks: soft-edged stripes left behind drifting and braking wheels:
 * dark rubber on the road, pale scuffs on rough ground, fading out over a few
 * seconds. One ring buffer of quads, each joined to the one before so a mark
 * curves smoothly; the fade is worked out on the GPU, so the buffer is only
 * touched when a mark is laid. One draw.
 */
import * as THREE from 'three';

const MAX = 1600;
const LIFE = 8;
const WIDTH = 0.44;

const VERT = /* glsl */ `
  attribute vec4 aMark;
  uniform float uTime;
  varying float vAlpha;
  varying float vAcross;
  varying float vAlong;
  varying float vTone;
  void main() {
    // aMark: born, strength, tone (0 rubber, 1 scuff), and which side (-1, 1) plus how far along.
    float age = uTime - aMark.x;
    vAlpha = age < ${LIFE}.0 ? aMark.y * min(1.0, (${LIFE}.0 - age) / ${(LIFE * 0.5).toFixed(1)}) : 0.0;
    vTone = aMark.z;
    vAcross = sign(aMark.w);
    vAlong = abs(aMark.w);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vAcross;
  varying float vAlong;
  varying float vTone;
  void main() {
    if (vAlpha <= 0.0) discard;
    // Soft at the edges, with the faint ribs of a tread pattern along it.
    float edge = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
    float tread = 0.82 + 0.18 * sin(vAlong * 9.0);
    vec3 c = mix(vec3(0.035, 0.033, 0.04), vec3(0.42, 0.38, 0.33), vTone);
    gl_FragColor = vec4(c, vAlpha * edge * tread);
  }`;

interface End {
  x: number;
  y: number;
  z: number;
  /** The last quad's far corners, so the next one starts where it ended. */
  lx: number;
  lz: number;
  rx: number;
  rz: number;
  along: number;
  joined: boolean;
}

export class Skids {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(MAX * 4 * 3);
  private mark4 = new Float32Array(MAX * 4 * 4);
  private next = 0;
  private last = new Map<string, End>();
  private geo = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;
  private time = 0;

  constructor() {
    const idx = new Uint32Array(MAX * 6);
    for (let i = 0; i < MAX; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    // Nothing is drawn until laid: born far in the past.
    for (let i = 0; i < MAX * 4; i++) this.mark4[i * 4] = -1e9;
    this.geo.setAttribute('aMark', new THREE.BufferAttribute(this.mark4, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /**
   * Lay a mark from where this wheel was last to (x, y, z). Pass `on = false` to lift the wheel.
   * `tone` 0 is rubber on a hard surface, 1 a pale scuff in dirt or cloth.
   */
  mark(key: string, x: number, y: number, z: number, on: boolean, strength = 0.5, tone = 0) {
    let prev = this.last.get(key);
    if (!on) {
      if (prev) prev.joined = false;
      return;
    }
    if (!prev) {
      prev = { x, y, z, lx: 0, lz: 0, rx: 0, rz: 0, along: 0, joined: false };
      this.last.set(key, prev);
    }
    const dx = x - prev.x;
    const dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    // A fresh mark, or a jump in position (a respawn, a teleport): start from here.
    if (!prev.joined || len > 4) {
      prev.x = x;
      prev.y = y;
      prev.z = z;
      prev.along = 0;
      prev.lx = NaN;
      prev.joined = true;
      return;
    }
    if (len < 0.35) return;
    const nx = (-dz / len) * (WIDTH / 2);
    const nz = (dx / len) * (WIDTH / 2);
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    // Start from the end of the last quad when there is one, so the stripe has no gaps on a curve.
    const fresh = Number.isNaN(prev.lx);
    const ya = prev.y + 0.11;
    const yb = y + 0.11;
    const p4 = this.pos;
    const o = i * 12;
    p4[o] = fresh ? prev.x - nx : prev.lx;
    p4[o + 1] = ya;
    p4[o + 2] = fresh ? prev.z - nz : prev.lz;
    p4[o + 3] = fresh ? prev.x + nx : prev.rx;
    p4[o + 4] = ya;
    p4[o + 5] = fresh ? prev.z + nz : prev.rz;
    p4[o + 6] = x - nx;
    p4[o + 7] = yb;
    p4[o + 8] = z - nz;
    p4[o + 9] = x + nx;
    p4[o + 10] = yb;
    p4[o + 11] = z + nz;
    const a0 = prev.along + 0.001;
    const a1 = a0 + len;
    for (let v = 0; v < 4; v++) {
      const m = i * 16 + v * 4;
      this.mark4[m] = this.time;
      this.mark4[m + 1] = strength;
      this.mark4[m + 2] = tone;
      this.mark4[m + 3] = (v < 2 ? a0 : a1) * (v % 2 ? 1 : -1);
    }
    prev.x = x;
    prev.y = y;
    prev.z = z;
    prev.lx = x - nx;
    prev.lz = z - nz;
    prev.rx = x + nx;
    prev.rz = z + nz;
    prev.along = a1;
    const p = this.geo.attributes.position as THREE.BufferAttribute;
    const m = this.geo.attributes.aMark as THREE.BufferAttribute;
    // Only the quads laid this frame go up to the GPU.
    p.addUpdateRange(i * 12, 12);
    m.addUpdateRange(i * 16, 16);
    p.needsUpdate = m.needsUpdate = true;
  }

  update(dt: number) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
  }

  clear() {
    for (let i = 0; i < MAX * 4; i++) this.mark4[i * 4] = -1e9;
    const m = this.geo.attributes.aMark as THREE.BufferAttribute;
    m.clearUpdateRanges();
    m.needsUpdate = true;
    this.last.clear();
  }
}

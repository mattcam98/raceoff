/**
 * Particles: drift sparks, exhaust flames, dust, splashes, explosions and
 * confetti. One pooled point cloud per blend mode, simulated on the CPU and
 * drawn in a single call each.
 */
import * as THREE from 'three';
import { tex } from './textures';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
    vColor = aColor;
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
  }`;

export interface Spawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  color: THREE.Color | string;
  size: number;
  /** Size at the end of its life, as a multiple. */
  grow?: number;
  life: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
}

const tmpColor = new THREE.Color();

class Cloud {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private max: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private age: Float32Array;
  private base: Float32Array;
  private grow: Float32Array;
  private gravity: Float32Array;
  private drag: Float32Array;
  private a0: Float32Array;
  private next = 0;
  private geo: THREE.BufferGeometry;

  constructor(max: number, blending: THREE.Blending, map: THREE.Texture) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max).fill(1e9);
    this.base = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(p: Spawn) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = p.vx ?? 0;
    this.vel[i * 3 + 1] = p.vy ?? 0;
    this.vel[i * 3 + 2] = p.vz ?? 0;
    const c = typeof p.color === 'string' ? tmpColor.set(p.color) : p.color;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.base[i] = p.size;
    this.size[i] = p.size;
    this.grow[i] = p.grow ?? 1;
    this.life[i] = p.life;
    this.age[i] = 0;
    this.gravity[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
    this.a0[i] = p.alpha ?? 1;
    this.alpha[i] = this.a0[i];
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const t = Math.min(1, this.age[i] / this.life[i]);
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.base[i] * (1 + (this.grow[i] - 1) * t);
      // Fade in fast, out slow.
      this.alpha[i] = this.a0[i] * Math.min(1, t * 8) * (1 - t * t);
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.age.fill(1e9);
    this.alpha.fill(0);
  }
}

export class Fx {
  readonly glow = new Cloud(2600, THREE.AdditiveBlending, tex.glow());
  readonly soft = new Cloud(1600, THREE.NormalBlending, tex.glow());
  readonly group = new THREE.Group();

  constructor() {
    this.group.add(this.glow.points, this.soft.points);
  }

  /** Pixel scale for point sizes; set before rendering each viewport. */
  setScale(viewportHeight: number, fov: number) {
    const s = viewportHeight / (2 * Math.tan((fov * Math.PI) / 360));
    this.glow.material.uniforms.uScale.value = s;
    this.soft.material.uniforms.uScale.value = s;
  }

  update(dt: number) {
    this.glow.update(dt);
    this.soft.update(dt);
  }

  clear() {
    this.glow.clear();
    this.soft.clear();
  }

  spark(x: number, y: number, z: number, color: string, power = 1) {
    this.glow.spawn({
      x, y, z,
      vx: (Math.random() - 0.5) * 6 * power, vy: 2 + Math.random() * 5 * power, vz: (Math.random() - 0.5) * 6 * power,
      color, size: 0.35 + Math.random() * 0.3, life: 0.25 + Math.random() * 0.2, gravity: 22, grow: 0.3,
    });
  }

  flame(x: number, y: number, z: number, vx: number, vz: number, hot: boolean) {
    this.glow.spawn({
      x, y, z, vx: vx + (Math.random() - 0.5) * 2, vy: 0.8 + Math.random(), vz: vz + (Math.random() - 0.5) * 2,
      color: hot ? (Math.random() < 0.5 ? '#7ad7ff' : '#c6f1ff') : Math.random() < 0.5 ? '#ff9a1f' : '#ffd23f',
      size: 0.8 + Math.random() * 0.5, life: 0.18 + Math.random() * 0.1, grow: 0.2, drag: 2,
    });
  }

  dust(x: number, y: number, z: number, color = '#cbbfa8', size = 1.2) {
    this.soft.spawn({
      x: x + (Math.random() - 0.5), y: y + 0.3, z: z + (Math.random() - 0.5),
      vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 2,
      color, size, grow: 2.6, life: 0.6 + Math.random() * 0.4, drag: 1.5, alpha: 0.55,
    });
  }

  smoke(x: number, y: number, z: number) {
    this.soft.spawn({
      x, y, z, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.5,
      color: '#5d5d66', size: 2, grow: 3, life: 1 + Math.random() * 0.6, drag: 1, alpha: 0.5,
    });
  }

  burst(x: number, y: number, z: number, colors: string[], count: number, speed: number, size = 0.6, life = 0.6) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.glow.spawn({
        x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.abs(Math.sin(e)) * s + 2, vz: Math.sin(a) * Math.cos(e) * s,
        color: colors[i % colors.length], size: size * (0.6 + Math.random() * 0.8), life: life * (0.6 + Math.random() * 0.6), gravity: 14, drag: 1.5, grow: 0.4,
      });
    }
  }

  explosion(x: number, y: number, z: number) {
    this.burst(x, y + 1, z, ['#ffd23f', '#ff7a1a', '#ff3d3d', '#fff1b8'], 70, 22, 1.4, 0.7);
    for (let i = 0; i < 18; i++) this.smoke(x + (Math.random() - 0.5) * 6, y + 1 + Math.random() * 2, z + (Math.random() - 0.5) * 6);
  }

  splash(x: number, y: number, z: number, color = '#bfe9ff') {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 6;
      this.soft.spawn({ x, y, z, vx: Math.cos(a) * s, vy: 6 + Math.random() * 8, vz: Math.sin(a) * s, color, size: 0.7, life: 0.8, gravity: 26, alpha: 0.9 });
    }
  }

  confetti(x: number, y: number, z: number, count = 80) {
    const colors = ['#ff4d6d', '#ffd23f', '#3ddc84', '#3d9bff', '#b07cff', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 10;
      this.soft.spawn({
        x, y, z, vx: Math.cos(a) * s, vy: 10 + Math.random() * 12, vz: Math.sin(a) * s, color: colors[i % colors.length],
        size: 0.6, life: 2.2 + Math.random(), gravity: 9, drag: 1.2,
      });
    }
  }
}

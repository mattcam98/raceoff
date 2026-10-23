/**
 * Effects: particles, exhaust flames and the flash of a blast.
 *
 * Particles are camera-facing quads drawn as instances, one draw for
 * everything that glows (added on top, in HDR so it blooms) and one for
 * everything that has body (smoke, dust, droplets, confetti, lit from above).
 * Each can stretch along its velocity (sparks, streaks), spin (smoke, chips),
 * grow and fade. They live in dense arrays: a dead one is swapped with the
 * last, so the GPU only ever sees live ones and nothing is allocated mid-race.
 *
 * Flames are additive cone meshes, one instanced draw for every exhaust.
 */
import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, fxAtlas, TILE } from './fxTextures';

// ---------------------------------------------------------------- kinds

/** How one sort of particle behaves. Sizes are world units, life is seconds. */
export interface Kind {
  /** Added on top in HDR (sparks, fire) rather than drawn with body (smoke, drops). */
  glow: boolean;
  tile: number;
  size: number;
  /** Size at the end of its life, as a multiple. */
  grow: number;
  life: number;
  gravity: number;
  drag: number;
  alpha: number;
  /** Seconds of travel drawn as a streak behind it; 0 for a round sprite. */
  stretch: number;
  /** Most it spins, radians a second. */
  spin: number;
  /** How quickly it fades in: 1/seconds-ish as a share of life. */
  fadeIn: number;
  /** How long it holds before fading out: alpha falls as 1 - t^hold. */
  hold: number;
  /** Bounces off the ground it was spawned over. */
  bounce: number;
}

const kind = (k: Partial<Kind> & Pick<Kind, 'glow' | 'tile'>): Kind => ({
  size: 1, grow: 1, life: 0.5, gravity: 0, drag: 0, alpha: 1, stretch: 0, spin: 0, fadeIn: 12, hold: 2, bounce: 0, ...k,
});

export const P = {
  spark: kind({ glow: true, tile: TILE.spark, size: 0.13, grow: 0.5, life: 0.34, gravity: 26, drag: 1.2, stretch: 0.035, hold: 1.6, bounce: 0.4, fadeIn: 40 }),
  flare: kind({ glow: true, tile: TILE.glow, size: 1.2, grow: 1, life: 0.06, fadeIn: 60, hold: 1 }),
  ember: kind({ glow: true, tile: TILE.spark, size: 0.16, grow: 0.3, life: 0.5, gravity: -2, drag: 2.5, stretch: 0.02, hold: 1.2 }),
  fire: kind({ glow: true, tile: TILE.smoke, size: 1.6, grow: 2.2, life: 0.4, drag: 3, spin: 2, fadeIn: 40, hold: 1.1 }),
  streak: kind({ glow: true, tile: TILE.spark, size: 0.06, life: 0.2, stretch: 0.07, alpha: 0.8, fadeIn: 6, hold: 1 }),
  ring: kind({ glow: true, tile: TILE.ring, size: 1, grow: 4.5, life: 0.3, fadeIn: 60, hold: 1.2 }),
  star: kind({ glow: true, tile: TILE.star, size: 0.8, grow: 0.25, life: 0.55, gravity: 3, drag: 2.5, spin: 3, hold: 2 }),
  shard: kind({ glow: true, tile: TILE.shard, size: 0.55, grow: 0.7, life: 0.65, gravity: 20, drag: 1, spin: 12, hold: 2, fadeIn: 60 }),
  trail: kind({ glow: true, tile: TILE.glow, size: 0.9, grow: 0.15, life: 0.35, hold: 1, fadeIn: 30 }),
  smoke: kind({ glow: false, tile: TILE.smoke, size: 1.3, grow: 3, life: 1.2, drag: 1.4, alpha: 0.5, spin: 1.2, fadeIn: 7, hold: 1.4 }),
  dust: kind({ glow: false, tile: TILE.smoke, size: 0.9, grow: 2.8, life: 0.8, drag: 2.2, alpha: 0.55, spin: 1.2, fadeIn: 8, hold: 1.2 }),
  bit: kind({ glow: false, tile: TILE.chip, size: 0.16, grow: 0.8, life: 0.7, gravity: 24, drag: 0.6, spin: 14, hold: 5, bounce: 0.3 }),
  drop: kind({ glow: false, tile: TILE.drop, size: 0.22, grow: 0.6, life: 0.8, gravity: 28, drag: 0.4, stretch: 0.025, alpha: 0.9, hold: 4 }),
  confetti: kind({ glow: false, tile: TILE.chip, size: 0.32, life: 2.8, gravity: 8, drag: 1.7, spin: 10, hold: 5 }),
  debris: kind({ glow: false, tile: TILE.chip, size: 0.4, grow: 0.9, life: 1.3, gravity: 32, drag: 0.3, spin: 9, hold: 6, bounce: 0.35 }),
};

const C = (hex: string) => new THREE.Color(hex);
const WHITE = C('#ffffff');

// ---------------------------------------------------------------- particles

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iCol;
  attribute vec4 iMisc;
  uniform float uLit;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vShade;
  void main() {
    vCol = iCol;
    if (iCol.a <= 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float size = iMisc.x;
    float stretch = iMisc.z;
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec2 c = position.xy;
    vec2 off;
    if (stretch > 0.0) {
      // Its velocity as it moves across the screen, so a streak points the way it flies from any camera.
      vec3 v = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      vec2 d = v.xy - mv.xy * (v.z / min(mv.z, -0.01));
      float len = length(d) * stretch;
      vec2 axis = len > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
      // (side, axis) must keep the quad's winding, or it faces away and is culled.
      vec2 side = vec2(axis.y, -axis.x);
      off = side * c.x * size + axis * (c.y * (size + len) - len * 0.5);
    } else {
      float s = sin(iMisc.y), co = cos(iMisc.y);
      off = mat2(co, s, -s, co) * c * size;
    }
    // Drawn a little towards the camera, so a puff or a glow sitting on the road is not cut off by it.
    float dist = length(mv.xyz);
    float pull = clamp((dist - size) / dist, 0.3, 1.0);
    mv.xyz *= pull;
    mv.xy += off * pull;
    gl_Position = projectionMatrix * mv;
    float tile = iMisc.w;
    vec2 cell = vec2(mod(tile, ${ATLAS_COLS}.0), floor(tile / ${ATLAS_COLS}.0));
    vUv = vec2((cell.x + uv.x) / ${ATLAS_COLS}.0, 1.0 - (cell.y + 1.0 - uv.y) / ${ATLAS_ROWS}.0);
    // Light from above whichever way it spins: the top of a puff is lit, its underside in shade.
    vShade = mix(1.0, mix(0.58, 1.15, c.y + 0.5), uLit);
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uLit;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vShade;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vCol.a;
    if (a < 0.004) discard;
    vec3 c = vCol.rgb * t.rgb * vShade;
    // Glowing things burn white at the heart, keeping their colour at the edges.
    c += vec3(max(max(vCol.r, vCol.g), vCol.b)) * pow(t.a, 5.0) * 0.45 * (1.0 - uLit);
    gl_FragColor = vec4(c, a);
  }`;

class Cloud {
  readonly mesh: THREE.Mesh;
  n = 0;
  private spawned = 0;
  // Simulation, one entry per live particle.
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private s0: Float32Array;
  private life: Float32Array;
  private age: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private floor: Float32Array;
  private kinds: Kind[];
  // What the GPU reads.
  private iPos: THREE.InstancedBufferAttribute;
  private iVel: THREE.InstancedBufferAttribute;
  private iCol: THREE.InstancedBufferAttribute;
  private iMisc: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(
    readonly max: number,
    glow: boolean,
  ) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.s0 = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.floor = new Float32Array(max);
    this.kinds = new Array(max).fill(P.flare);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    const attr = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(max * size), size).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', (this.iPos = attr(3)));
    this.geo.setAttribute('iVel', (this.iVel = attr(3)));
    this.geo.setAttribute('iCol', (this.iCol = attr(4)));
    this.geo.setAttribute('iMisc', (this.iMisc = attr(4)));
    this.geo.instanceCount = 0;
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: fxAtlas() }, uLit: { value: glow ? 0 : 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    // Smoke first, glow over it.
    this.mesh.renderOrder = glow ? 6 : 5;
    this.mesh.visible = false;
  }

  emit(k: Kind, x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, intensity: number, size: number, life: number, floor: number) {
    // When full, the newest overwrite the oldest-ish rather than being dropped, so bursts always show.
    const i = this.n < this.max ? this.n++ : this.spawned % this.max;
    this.spawned++;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.col[i3] = color.r * intensity;
    this.col[i3 + 1] = color.g * intensity;
    this.col[i3 + 2] = color.b * intensity;
    this.s0[i] = k.size * size * (0.8 + Math.random() * 0.4);
    this.life[i] = k.life * life * (0.75 + Math.random() * 0.5);
    this.age[i] = 0;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.spin[i] = k.spin * (Math.random() * 2 - 1);
    this.floor[i] = floor;
    this.kinds[i] = k;
  }

  private move(from: number, to: number) {
    const f3 = from * 3;
    const t3 = to * 3;
    for (let j = 0; j < 3; j++) {
      this.pos[t3 + j] = this.pos[f3 + j];
      this.vel[t3 + j] = this.vel[f3 + j];
      this.col[t3 + j] = this.col[f3 + j];
    }
    this.s0[to] = this.s0[from];
    this.life[to] = this.life[from];
    this.age[to] = this.age[from];
    this.rot[to] = this.rot[from];
    this.spin[to] = this.spin[from];
    this.floor[to] = this.floor[from];
    this.kinds[to] = this.kinds[from];
  }

  update(dt: number) {
    const ip = this.iPos.array as Float32Array;
    const iv = this.iVel.array as Float32Array;
    const ic = this.iCol.array as Float32Array;
    const im = this.iMisc.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.move(--this.n, i);
        i--;
        continue;
      }
      const k = this.kinds[i];
      const t = this.age[i] / this.life[i];
      const i3 = i * 3;
      const f = 1 / (1 + k.drag * dt);
      let vx = this.vel[i3] * f;
      let vy = this.vel[i3 + 1] * f - k.gravity * dt;
      let vz = this.vel[i3 + 2] * f;
      let y = this.pos[i3 + 1] + vy * dt;
      if (y < this.floor[i] && vy < 0) {
        y = this.floor[i];
        vy = -vy * k.bounce;
        vx *= 0.6;
        vz *= 0.6;
      }
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] += vz * dt;
      this.rot[i] += this.spin[i] * dt;
      ip[i3] = this.pos[i3];
      ip[i3 + 1] = y;
      ip[i3 + 2] = this.pos[i3 + 2];
      iv[i3] = vx;
      iv[i3 + 1] = vy;
      iv[i3 + 2] = vz;
      const i4 = i * 4;
      ic[i4] = this.col[i3];
      ic[i4 + 1] = this.col[i3 + 1];
      ic[i4 + 2] = this.col[i3 + 2];
      ic[i4 + 3] = k.alpha * Math.min(1, t * k.fadeIn) * (1 - Math.pow(t, k.hold));
      im[i4] = this.s0[i] * (1 + (k.grow - 1) * t);
      im[i4 + 1] = this.rot[i];
      im[i4 + 2] = k.stretch;
      im[i4 + 3] = k.tile;
    }
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (const a of [this.iPos, this.iVel, this.iCol, this.iMisc]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}

// ---------------------------------------------------------------- flames

const MAX_FLAMES = 48;

/** A cone from the nozzle (z = 0) to its tip (z = -1), open at the back. */
function flameGeometry() {
  const g = new THREE.ConeGeometry(1, 1, 14, 6, true);
  g.translate(0, -0.5, 0);
  g.rotateX(Math.PI / 2);
  return g;
}

const flameMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying float vT;
    varying vec3 vColor;
    varying float vFacing;
    varying float vSeed;
    void main() {
      vT = -position.z;
      vColor = instanceColor;
      vSeed = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
      vec3 p = position;
      // A licking, wobbling tongue: wider in the middle, wavering towards the tip.
      p.xy *= 1.0 + 0.35 * sin(vT * 3.14159) + 0.12 * sin(uTime * 37.0 + vT * 9.0 + vSeed);
      vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
      vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * vec3(normal.xy, 0.0));
      vFacing = abs(dot(n, normalize(cameraPosition - wp.xyz)));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying float vT;
    varying vec3 vColor;
    varying float vFacing;
    varying float vSeed;
    void main() {
      float t = clamp(vT, 0.0, 1.0);
      float flick = 0.75 + 0.25 * sin(t * 18.0 - uTime * 55.0 + vSeed) * sin(t * 7.0 - uTime * 23.0);
      // White-hot at the nozzle, the flame's colour through the body, a deep red at the tip.
      vec3 core = vec3(1.0, 0.97, 0.9) * 2.4;
      vec3 c = mix(core, vColor, smoothstep(0.0, 0.35, t));
      c = mix(c, vColor * vec3(1.0, 0.35, 0.3) * 0.6, smoothstep(0.55, 1.0, t));
      float a = pow(vFacing, 1.3) * (1.0 - smoothstep(0.35, 1.0, t)) * flick;
      gl_FragColor = vec4(c * a, a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

class Flames {
  readonly mesh = new THREE.InstancedMesh(flameGeometry(), flameMaterial, MAX_FLAMES);
  private n = 0;
  constructor() {
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, WHITE);
  }

  /** One flame this frame, placed by `m` (nozzle at its origin, blowing along its -z). */
  add(m: THREE.Matrix4, color: THREE.Color, intensity: number) {
    if (this.n >= MAX_FLAMES) return;
    this.mesh.setMatrixAt(this.n, m);
    tmpColor.copy(color).multiplyScalar(intensity);
    this.mesh.setColorAt(this.n, tmpColor);
    this.n++;
  }

  flush(time: number) {
    flameMaterial.uniforms.uTime.value = time;
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.n = 0;
  }
}

const tmpColor = new THREE.Color();

/** Particles to make this frame for an emission rate per second: whole ones, and the fraction by chance. */
export function rate(perSecond: number, dt: number) {
  const f = perSecond * dt;
  const n = Math.floor(f);
  return n + (Math.random() < f - n ? 1 : 0);
}

const rnd = (a: number) => (Math.random() * 2 - 1) * a;

const FIRE = [C('#fff3c4'), C('#ffc43d'), C('#ff7a1a'), C('#ff3d1f')];
const SMOKE = C('#4a4750');
const DEBRIS = [C('#2b2830'), C('#5a5048'), C('#7a6a58')];
const SPLASH = C('#d8f1ff');
const CONFETTI = ['#ff4d6d', '#ffd23f', '#3ddc84', '#3d9bff', '#b07cff', '#ffffff'].map(C);

export class Fx {
  readonly glow = new Cloud(4096, true);
  readonly soft = new Cloud(2048, false);
  readonly flames = new Flames();
  readonly group = new THREE.Group();
  /** A blast's light on its surroundings: one light, always there, so adding it never recompiles a shader. */
  private light = new THREE.PointLight('#ffb35c', 0, 70, 1.6);
  private lightT = 0;
  private lightPeak = 0;
  private time = 0;
  /** The last frame's step, for emission rates; karts are updated before the effects step. */
  dt = 1 / 60;
  /** Per kart, seconds left of a mini-turbo's flare. */
  readonly kickT: number[] = [];

  constructor() {
    this.group.add(this.soft.mesh, this.glow.mesh, this.flames.mesh, this.light);
    active = this;
  }

  /** Kept for the view, which sets it per viewport; quads are sized in the world and need no pixel scale. */
  setScale(_viewportHeight: number, _fov: number) {}

  update(dt: number) {
    this.time += dt;
    if (dt > 0) this.dt = Math.min(dt, 0.1);
    this.glow.update(dt);
    this.soft.update(dt);
    this.flames.flush(this.time);
    for (let i = 0; i < this.kickT.length; i++) this.kickT[i] = Math.max(0, this.kickT[i] - dt);
    if (this.lightT > 0) {
      this.lightT = Math.max(0, this.lightT - dt);
      this.light.intensity = this.lightPeak * (this.lightT / 0.45) ** 2;
    }
  }

  clear() {
    this.glow.clear();
    this.soft.clear();
    this.kickT.length = 0;
    this.lightT = 0;
    this.light.intensity = 0;
  }

  /** One particle. `intensity` scales its colour: above 1 glows, and glowing kinds bloom above about 2. */
  emit(k: Kind, x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, intensity = 1, size = 1, life = 1, floor = -1e9) {
    (k.glow ? this.glow : this.soft).emit(k, x, y, z, vx, vy, vz, color, intensity, size, life, floor);
  }

  /** `count` of a kind flying out from a point in every direction, a little upwards. */
  burst(k: Kind, x: number, y: number, z: number, count: number, speed: number, colors: THREE.Color[], intensity = 1, size = 1, up = 0.4, floor = -1e9) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const h = Math.cos(e) * s;
      this.emit(k, x, y, z, Math.cos(a) * h, Math.abs(Math.sin(e)) * s + up * speed, Math.sin(a) * h, colors[i % colors.length], intensity, size, 1, floor);
    }
  }

  flame(m: THREE.Matrix4, color: THREE.Color, intensity: number) {
    this.flames.add(m, color, intensity);
  }

  /** Light the surroundings for a moment. */
  flash(x: number, y: number, z: number, color: THREE.Color, intensity: number) {
    this.light.position.set(x, y, z);
    this.light.color.copy(color);
    this.lightPeak = intensity;
    this.lightT = 0.45;
    this.light.intensity = intensity;
  }

  // ---------------------------------------------------------------- set pieces

  explosion(x: number, y: number, z: number) {
    this.flash(x, y + 3, z, FIRE[1], 260);
    this.emit(P.flare, x, y + 1.5, z, 0, 0, 0, FIRE[0], 2.2, 8, 2.5);
    this.emit(P.ring, x, y + 1, z, 0, 0, 0, FIRE[1], 2, 4, 1.4);
    // Licks of flame thrown out of the fireball.
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 6 + Math.random() * 10;
      this.emit(P.fire, x + rnd(1.5), y + 1 + Math.random() * 2, z + rnd(1.5), Math.cos(a) * s, 3 + Math.random() * 7, Math.sin(a) * s, FIRE[1 + (i % 3)], 1.6, 1, 1.2);
    }
    this.burst(P.spark, x, y + 1, z, 44, 30, FIRE, 6, 1.5, 0.3, y + 0.1);
    this.burst(P.debris, x, y + 1, z, 22, 20, DEBRIS, 1, 1, 0.6, y + 0.1);
    for (let i = 0; i < 16; i++) {
      this.emit(P.smoke, x + rnd(4), y + 1 + Math.random() * 3, z + rnd(4), rnd(3), 3 + Math.random() * 3, rnd(3), SMOKE, 1, 2.4, 2.2);
    }
  }

  splash(x: number, y: number, z: number, color = SPLASH) {
    this.emit(P.ring, x, y + 0.3, z, 0, 0, 0, color, 1.2, 3, 1.5);
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 7;
      this.emit(P.drop, x + Math.cos(a), y, z + Math.sin(a), Math.cos(a) * s, 7 + Math.random() * 10, Math.sin(a) * s, color, 1.1, 1.4);
    }
    for (let i = 0; i < 8; i++) this.emit(P.smoke, x + rnd(2), y + 1, z + rnd(2), rnd(2), 2 + Math.random() * 2, rnd(2), WHITE, 1.4, 1.6, 0.9);
  }

  confetti(x: number, y: number, z: number, count = 80) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 10;
      this.emit(P.confetti, x, y, z, Math.cos(a) * s, 10 + Math.random() * 12, Math.sin(a) * s, CONFETTI[i % CONFETTI.length], 1.15);
    }
  }
}

/** The view's effects, for item models that leave trails. There is one view per page. */
export let active: Fx | null = null;

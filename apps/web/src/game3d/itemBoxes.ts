/**
 * Item boxes: cubes of iridescent rainbow glass with a floating question mark
 * inside, bobbing and turning, a shimmer sweeping over them now and then, and
 * a soft pool of light beneath. Taken, a box vanishes (the shatter is a
 * particle burst); it springs back with an overshoot and a sparkle.
 *
 * Four instanced draws for every box on the track: the glass's inside faces,
 * the question marks, the glass's outside faces, the light pools.
 */
import * as THREE from 'three';
import { P, type Fx } from './fx';
import { questionTexture } from './fxTextures';
import { tex } from './textures';

const SIZE = 2.4;
/** Seconds of the respawn countdown spent growing back. */
const GROW = 0.4;

const GLASS_VERT = /* glsl */ `
  attribute float aGlow;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  varying vec2 vUv;
  varying float vGlow;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vV = cameraPosition - wp.xyz;
    vP = position;
    vUv = uv;
    vGlow = aGlow;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const GLASS_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  varying vec2 vUv;
  varying float vGlow;
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = abs(dot(n, v));
    float fres = pow(1.0 - ndv, 2.2);
    // A rounded frame round each face.
    vec2 q = abs(vUv - 0.5) * 2.0;
    float rr = length(max(q - 0.66, 0.0)) - 0.2;
    float frame = smoothstep(-0.02, 0.03, rr);
    // Thin-film colours that slide with the viewing angle, like a soap bubble.
    vec3 rainbow = mix(vec3(1.0), hue(fract(ndv * 0.9 + dot(vP, vec3(0.11, 0.19, 0.15)) + uTime * 0.1)), 0.75);
    // Tinted glass, clearer in the middle of each face so the question mark shows through.
    float body = mix(0.22, 0.5, smoothstep(0.2, 0.95, max(q.x, q.y)));
    // A gloss stripe across each face, and a shimmer sweeping over the whole box now and then.
    float gloss = smoothstep(0.08, 0.0, abs(vUv.x + vUv.y - 0.75)) * 0.7 + smoothstep(0.04, 0.0, abs(vUv.x + vUv.y - 0.98)) * 0.4;
    float band = pow(max(0.0, sin(dot(vP, vec3(0.8, 0.55, 0.35)) * 1.1 - uTime * 2.2)), 30.0);
    // The room's light caught on the glass from above.
    vec3 r = reflect(-v, n);
    float sky = smoothstep(0.25, 0.95, r.y) * (0.3 + fres);
    vec3 col = rainbow * (0.55 + fres * 0.6) * (1.0 - frame) + frame * mix(vec3(1.0), rainbow, 0.6) * 1.15 + (gloss + band * 1.3 + sky * 0.5) * vec3(1.0);
    col *= 1.0 + vGlow * 1.2;
    float a = clamp(body + fres * 0.35 + frame * 0.8 + gloss * 0.5 + band * 0.4 + sky * 0.3, 0.0, 1.0);
    if (!gl_FrontFacing) a *= 0.32;
    gl_FragColor = vec4(col, a);
  }`;

function glassMaterial(side: THREE.Side, uniforms: { uTime: { value: number } }) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GLASS_VERT,
    fragmentShader: GLASS_FRAG,
    transparent: true,
    depthWrite: false,
    side,
  });
}

/** The question mark: always facing the camera, rocking gently. */
const markMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uMap: { value: questionTexture() }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        float wob = sin(uTime * 2.1 + c.x * 0.37) * 0.22;
        vec2 p = mat2(cos(wob), sin(wob), -sin(wob), cos(wob)) * position.xy * s;
        vec4 mv = viewMatrix * c;
        mv.xy += p;
        vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.01) discard;
        gl_FragColor = vec4(t.rgb * 1.4, t.a);
      }`,
    transparent: true,
    depthWrite: false,
  });

const easeOutBack = (x: number) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const ID = new THREE.Quaternion();
const sparkle = new THREE.Color();

export interface BoxState {
  x: number;
  y: number;
  z: number;
  respawn: number;
}

export class ItemBoxes {
  readonly group = new THREE.Group();
  private inside: THREE.InstancedMesh;
  private outside: THREE.InstancedMesh;
  private marks: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;
  private glow: THREE.InstancedBufferAttribute;
  private uniforms = { uTime: { value: 0 } };
  private prev: Float32Array;
  private t = 0;

  constructor(count: number) {
    const n = Math.max(1, count);
    const geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
    this.glow = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aGlow', this.glow);
    this.inside = new THREE.InstancedMesh(geo, glassMaterial(THREE.BackSide, this.uniforms), n);
    this.outside = new THREE.InstancedMesh(geo, glassMaterial(THREE.FrontSide, this.uniforms), n);
    this.marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.1, 2.1), markMaterial(), n);
    this.pools = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(5.5, 5.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex.glow(), color: new THREE.Color(0.75, 0.6, 1.1), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
      n,
    );
    // Inside faces, then the outside faces, then the mark: crisp over the clear middle of the glass.
    this.pools.renderOrder = 2;
    this.inside.renderOrder = 3;
    this.marks.renderOrder = 6;
    this.outside.renderOrder = 5;
    for (const m of [this.inside, this.outside, this.marks, this.pools]) {
      // Their matrices change every frame; one bounding sphere for the lot would be stale.
      m.frustumCulled = false;
      m.count = count;
      this.group.add(m);
    }
    this.prev = new Float32Array(n);
  }

  update(boxes: readonly BoxState[], dt: number, fx: Fx | null) {
    this.t += dt;
    const t = this.t;
    this.uniforms.uTime.value = t;
    (this.marks.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    const glow = this.glow.array as Float32Array;
    boxes.forEach((b, i) => {
      // Gone while the countdown runs, then grows back with an overshoot.
      const u = b.respawn > 0 ? (b.respawn < GROW ? 1 - b.respawn / GROW : 0) : 1;
      const s = Math.max(0.0001, u < 1 ? easeOutBack(u) : 1);
      if (fx && this.prev[i] >= GROW && b.respawn < GROW && b.respawn > 0) this.respawned(fx, b);
      this.prev[i] = b.respawn;
      glow[i] = u < 1 ? (1 - u) * 0.8 : 0;
      const bob = Math.sin(t * 2 + i) * 0.28;
      tmpP.set(b.x, b.y + 1.95 + bob, b.z);
      tmpE.set(0.5 + Math.sin(t * 0.7 + i) * 0.15, t * 1.1 + i * 0.9, 0.38);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.inside.setMatrixAt(i, tmpM);
      this.outside.setMatrixAt(i, tmpM);
      tmpS.setScalar(s * (0.95 + Math.sin(t * 5 + i) * 0.05));
      tmpM.compose(tmpP, ID, tmpS);
      this.marks.setMatrixAt(i, tmpM);
      tmpP.set(b.x, b.y + 0.16, b.z);
      tmpS.setScalar(s * (0.9 - bob * 0.25));
      tmpM.compose(tmpP, ID, tmpS);
      this.pools.setMatrixAt(i, tmpM);
    });
    for (const m of [this.inside, this.outside, this.marks, this.pools]) m.instanceMatrix.needsUpdate = true;
    this.glow.needsUpdate = true;
  }

  /** A box coming back: a twinkle of rainbow stars and a ring. */
  private respawned(fx: Fx, b: BoxState) {
    const y = b.y + 1.95;
    fx.emit(P.ring, b.x, y, b.z, 0, 0, 0, sparkle.setRGB(1, 1, 1), 2, 1.6, 1.3);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      sparkle.setHSL(i / 14, 1, 0.7);
      fx.emit(P.star, b.x + Math.cos(a) * 1.8, y + Math.sin(a * 3) * 0.6, b.z + Math.sin(a) * 1.8, Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5, sparkle, 3, 0.8);
    }
  }
}

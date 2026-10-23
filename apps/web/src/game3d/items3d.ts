/**
 * What items look like in the world: item boxes, bouncy balls, seeker bees,
 * pop bombs, paper jets, oil slicks, blasts, and the Giant's Hand reaching in.
 * Everything that flies leaves a trail. Models are pooled by id so nothing is
 * built or thrown away mid-race except when something new appears, and their
 * geometry and materials are shared between copies.
 */
import * as THREE from 'three';
import { PLAYER_COLORS } from '@raceoff/shared';
import { clamp, GIANT_BLAST_RADIUS, lerp, OIL_RADIUS, type Race } from '@raceoff/game';
import { active, P, rate, type Fx, type Kind } from './fx';
import { ballTexture } from './fxTextures';
import { ItemBoxes } from './itemBoxes';
import { at, ball, box, disposeTree, group, mat, shareResource } from './kit';
import { tex } from './textures';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const C = (hex: string) => new THREE.Color(hex);
const BALL_TRAIL = C('#5dffa8');
const BEE_TRAIL = C('#ffd23f');
const FUSE = [C('#fff1b8'), C('#ffb347'), C('#ff7a1a')];
const SMOKE = C('#8a8790');
const CONTRAIL = C('#ffffff');

/** Glossy rubber with a clear lacquer: a toy shop bouncy ball. */
const shared = <T extends object>(make: () => T) => {
  let v: T | null = null;
  return () => (v ??= shareResource(make()));
};
const ballGeo = shared(() => new THREE.SphereGeometry(0.9, 24, 16));
const ballMat = shared(() => new THREE.MeshPhysicalMaterial({ map: ballTexture('#22c96a'), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }));

function ballModel() {
  const m = new THREE.Mesh(ballGeo(), ballMat());
  m.castShadow = true;
  m.rotation.order = 'YXZ';
  return m;
}

const beeBodyGeo = shared(() => new THREE.SphereGeometry(0.85, 20, 14).scale(0.85, 1.2, 0.85).rotateX(Math.PI / 2));
/** Fuzzy: sheen makes the stripes catch the light at the edges like velvet. */
const beeBodyMat = shared(() => new THREE.MeshPhysicalMaterial({ map: tex.stripes('#ffc61a', '#1b1b1f', 6), roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#fff1a8'), sheenRoughness: 0.4 }));
const wingGeo = shared(() => new THREE.CircleGeometry(0.75, 16).scale(0.7, 1, 1));
const wingMat = shared(() => new THREE.MeshPhysicalMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.62, roughness: 0.08, iridescence: 1, iridescenceIOR: 1.5, side: THREE.DoubleSide, depthWrite: false }));
const eyeMat = shared(() => mat('#0e0e12', { shiny: 110 }));

function beeModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(beeBodyGeo(), beeBodyMat());
  body.castShadow = true;
  g.add(body);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo(), wingMat());
    wing.position.set(s * 0.62, 0.78, -0.05);
    wing.rotation.set(-Math.PI / 2.4, 0, s * 0.5);
    wing.userData.wing = s;
    g.add(wing);
    g.add(at(ball(0.2, eyeMat(), 10), s * 0.32, 0.3, 0.92));
    // Antennae.
    const stalk = at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 5), eyeMat()), s * 0.2, 0.85, 0.75, 0.6, 0, -s * 0.35);
    g.add(stalk, at(ball(0.08, eyeMat(), 6), s * 0.32, 1.12, 0.92));
  }
  g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 8).rotateX(-Math.PI / 2), eyeMat()), 0, 0, -1.2));
  return g;
}

/** A curly fuse from the bomb's cap to its tip at FUSE_TIP. */
const FUSE_TIP = new THREE.Vector3(0.22, 3.12, 0);
const fuseGeo = shared(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2.4, 0), new THREE.Vector3(0.18, 2.68, 0.06), new THREE.Vector3(0.02, 2.92, -0.08), FUSE_TIP]), 12, 0.06, 6));
const bombGeo = shared(() => new THREE.SphereGeometry(1.1, 28, 18));
const capMat = shared(() => mat('#b9c0cc', { shiny: 100, metal: 1 }));
const fuseMat = shared(() => mat('#d8c7a0', { shiny: 10 }));

function bombModel() {
  // Its own body material, so it can flash red as the fuse runs down.
  const body = new THREE.Mesh(bombGeo(), new THREE.MeshPhysicalMaterial({ color: '#232a4a', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color('#ff2d2d'), emissiveIntensity: 0 }));
  body.castShadow = true;
  body.position.y = 1.1;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.42, 14), capMat());
  cap.position.y = 2.25;
  const g = group(body, cap, new THREE.Mesh(fuseGeo(), fuseMat()));
  g.userData.body = body.material;
  return g;
}

function planeModel() {
  // A folded paper dart.
  const shape = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 2.4, -1.6, 0.1, -1.6, 0, -0.1, -1.2,
    0, 0, 2.4, 0, -0.1, -1.2, 1.6, 0.1, -1.6,
    0, 0, 2.4, 0, -0.1, -1.2, 0, -0.7, -1.4,
  ]);
  shape.setAttribute('position', new THREE.BufferAttribute(v, 3));
  shape.computeVertexNormals();
  const m = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.7 }));
  m.castShadow = true;
  const g = group(m);
  g.add(at(box(0.05, 0.4, 1.2, '#ff4d6d'), 0, -0.3, -0.6));
  g.scale.setScalar(1.4);
  return g;
}

function oilModel() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(OIL_RADIUS * 2.3, OIL_RADIUS * 2.3).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: tex.puddle('#16161d'), transparent: true, roughness: 0.05, metalness: 0.2, iridescence: 1, iridescenceIOR: 1.6, depthWrite: false }));
  m.renderOrder = 3;
  return m;
}

// ---------------------------------------------------------------- blasts

/** A boiling fireball: white-hot at the heart, orange, then dark red and smoke as it burns out and breaks up. */
const fireballMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uAge: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uAge;
      uniform float uSeed;
      varying float vN;
      varying float vFacing;
      float lumps(vec3 p) {
        return sin(p.x * 3.1 + uSeed) * sin(p.y * 2.7 + uAge * 4.0) * sin(p.z * 3.3 - uSeed)
          + 0.5 * sin(p.x * 6.3 - uAge * 6.0) * sin(p.y * 5.9 + uSeed) * sin(p.z * 6.7);
      }
      void main() {
        vN = lumps(position);
        vec3 p = position * (1.0 + 0.22 * vN);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vFacing = abs(dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - wp.xyz)));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAge;
      varying float vN;
      varying float vFacing;
      void main() {
        float f = clamp(uAge / 0.8, 0.0, 1.0);
        float n = vN * 0.5 + 0.5;
        // Hottest where it faces you (the heart), cooling to the rim and as it burns out.
        float heat = clamp(vFacing * 0.95 + (n - 0.5) * 0.7 - f * 1.15 + 0.2, 0.0, 1.0);
        // Saturated colours stay at or under 1 so tone mapping keeps them orange; only the heart is HDR.
        vec3 c = mix(vec3(0.07, 0.06, 0.07), vec3(0.7, 0.07, 0.02), smoothstep(0.04, 0.2, heat));
        c = mix(c, vec3(1.0, 0.36, 0.03), smoothstep(0.2, 0.42, heat));
        c = mix(c, vec3(1.5, 1.0, 0.2), smoothstep(0.48, 0.68, heat));
        c = mix(c, vec3(3.2, 2.7, 1.6), smoothstep(0.78, 0.96, heat));
        // A soft rim, and it breaks up into lumps as it goes.
        float a = smoothstep(0.0, 0.4, vFacing) * smoothstep(f - 0.12, f + 0.12, n * 0.9 + 0.12) * (1.0 - smoothstep(0.8, 1.0, f));
        if (a < 0.01) discard;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
  });

/** A soft ring, expanding across the ground. */
const shockMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 1 }, uColor: { value: new THREE.Color(3, 1.6, 0.6) } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = smoothstep(0.6, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r)) * uFade;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

const fireballGeo = shared(() => new THREE.IcosahedronGeometry(1, 4));
const shockGeo = shared(() => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));

function blastModel() {
  const fire = new THREE.Mesh(fireballGeo(), fireballMaterial());
  fire.renderOrder = 6;
  const shock = new THREE.Mesh(shockGeo(), shockMaterial());
  shock.renderOrder = 6;
  const g = group(fire, shock);
  g.userData.parts = { fire, shock };
  return g;
}

/** Glowing dots laid along an object's path, close enough to read as a ribbon. */
function trail(fx: Fx | null, o: THREE.Object3D, x: number, y: number, z: number, k: Kind, color: THREE.Color, intensity: number, size: number, spacing: number) {
  const last = o.userData.last as THREE.Vector3 | undefined;
  if (!last) {
    o.userData.last = new THREE.Vector3(x, y, z);
    return;
  }
  const d = Math.hypot(x - last.x, y - last.y, z - last.z);
  if (d < spacing) return;
  if (fx && d < 30) {
    const n = Math.min(10, Math.floor(d / spacing));
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      fx.emit(k, lerp(last.x, x, f), lerp(last.y, y, f), lerp(last.z, z, f), 0, 0, 0, color, intensity, size);
    }
  }
  last.set(x, y, z);
}

/** Sparks off a lit fuse. */
function fuse(fx: Fx | null, o: THREE.Object3D, dt: number) {
  if (!fx) return;
  o.updateMatrixWorld();
  tmpP.copy(FUSE_TIP).applyMatrix4(o.matrixWorld);
  fx.emit(P.flare, tmpP.x, tmpP.y, tmpP.z, 0, 0, 0, FUSE[1], 3, 0.9, Math.max(1, (dt * 1.6) / P.flare.life));
  const n = rate(30, dt);
  for (let i = 0; i < n; i++) {
    fx.emit(P.spark, tmpP.x, tmpP.y, tmpP.z, (Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5, FUSE[i % 3], 5, 0.7, 0.6);
  }
}

// ---------------------------------------------------------------- the Giant's Hand

const SKIN = '#f1c09a';

/** A pat of butter, sitting on the ground at its origin. */
function butterPat() {
  const butter = mat('#ffe27a', { shiny: 70 });
  return group(box(2.4, 0.9, 1.7, butter), at(box(2.0, 0.08, 1.4, mat('#fff1b0', { shiny: 90 })), 0, 0.9, 0));
}

/** Butter that has landed: a pat on a melting yellow puddle. */
function butterModel() {
  const puddle = new THREE.Mesh(
    new THREE.PlaneGeometry(OIL_RADIUS * 2.3, OIL_RADIUS * 2.3).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex.puddle('#f5c938'), transparent: true, roughness: 0.12, depthWrite: false }),
  );
  puddle.renderOrder = 3;
  const pat = butterPat();
  pat.scale.setScalar(0.8);
  pat.rotation.y = 0.5;
  return group(puddle, pat);
}

/** A giant's hand, palm down, fingers forward along +z, with a sleeve cuff in the giant's colour. */
function handModel() {
  const skin = mat(SKIN, { shiny: 14 });
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 7.5), skin);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 4 - Math.abs(i - 1.5) * 0.5, 4, 10), skin);
    // Pointing forward and curling down a little, like a hand about to let go.
    finger.position.set(-2.55 + i * 1.7, -0.7, 5.4 - Math.abs(i - 1.5) * 0.35);
    finger.rotation.x = Math.PI / 2 + 0.45;
    g.add(finger);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 3, 4, 10), skin);
  thumb.position.set(4.1, -0.9, 1.4);
  thumb.rotation.set(Math.PI / 2, 0, -0.95);
  g.add(thumb);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.9, 6, 18).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }));
  sleeve.position.set(0, 0.4, -6.4);
  g.add(sleeve);
  g.traverse((o) => (o.castShadow = true));
  g.userData.sleeve = sleeve.material;
  return g;
}

/** Everything one giant's drop shows: the target ring and its filling disc, the hand, and what it holds. */
function giantModel() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.76, 1, 56).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ff2d55', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.renderOrder = 4;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff2d55', transparent: true, opacity: 0.22, depthWrite: false }));
  fill.renderOrder = 4;
  // A column of light from the ring up to the hand: seen from behind, a flat ring far ahead is a sliver, a beam is not.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({ color: '#ff2d55', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.renderOrder = 5;
  const hand = handModel();
  const butter = butterPat();
  const candy = ball(1.5, mat('#ffffff', { map: tex.stripes('#ff5fa2', '#ffffff', 8), shiny: 100 }), 20);
  candy.castShadow = butter.castShadow = true;
  g.add(ring, fill, beam, hand, butter, candy);
  g.userData.parts = { ring, fill, beam, hand, butter, candy };
  return g;
}

const easeOut = (x: number) => 1 - (1 - x) ** 3;

interface Pooled {
  obj: THREE.Object3D;
  seen: boolean;
}

class Pool {
  private live = new Map<number, Pooled>();
  constructor(
    private parent: THREE.Object3D,
    private make: () => THREE.Object3D,
  ) {}

  begin() {
    for (const p of this.live.values()) p.seen = false;
  }

  get(id: number): THREE.Object3D {
    let p = this.live.get(id);
    if (!p) {
      const obj = this.make();
      this.parent.add(obj);
      p = { obj, seen: true };
      this.live.set(id, p);
    }
    p.seen = true;
    return p.obj;
  }

  end() {
    for (const [id, p] of this.live) {
      if (p.seen) continue;
      this.parent.remove(p.obj);
      disposeTree(p.obj);
      this.live.delete(id);
    }
  }

  clear() {
    for (const p of this.live.values()) {
      this.parent.remove(p.obj);
      disposeTree(p.obj);
    }
    this.live.clear();
  }
}

export class ItemsView {
  readonly group = new THREE.Group();
  private boxes: ItemBoxes;
  private balls: Pool;
  private bees: Pool;
  private bombs: Pool;
  private planes: Pool;
  private oils: Pool;
  private butters: Pool;
  private giants: Pool;
  private blasts: Pool;
  private orbits: THREE.InstancedMesh;

  constructor(race: Race) {
    this.boxes = new ItemBoxes(race.boxes.length);
    this.group.add(this.boxes.group);
    this.balls = new Pool(this.group, ballModel);
    this.bees = new Pool(this.group, beeModel);
    this.bombs = new Pool(this.group, bombModel);
    this.planes = new Pool(this.group, planeModel);
    this.oils = new Pool(this.group, oilModel);
    this.butters = new Pool(this.group, butterModel);
    this.giants = new Pool(this.group, giantModel);
    this.blasts = new Pool(this.group, blastModel);
    this.orbits = new THREE.InstancedMesh(ballGeo(), ballMat(), 32);
    this.orbits.count = 0;
    // Its bounding sphere would be worked out once, while empty, and the balls culled for good.
    this.orbits.frustumCulled = false;
    this.orbits.castShadow = true;
    this.group.add(this.orbits);
    this.poolList = [this.balls, this.bees, this.bombs, this.planes, this.oils, this.butters, this.blasts, this.giants];
  }

  update(race: Race, alpha: number, dt: number) {
    const t = race.time;
    const fx = active;
    this.boxes.update(race.boxes, dt, fx);

    for (const pool of this.pools()) pool.begin();
    for (const p of race.projectiles) {
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      const z = p.pz + (p.z - p.pz) * alpha;
      if (p.kind === 'ball') {
        const o = this.balls.get(p.id);
        o.position.set(x, y, z);
        o.rotation.y = p.h;
        o.rotation.x += dt * 12;
        trail(fx, o, x, y, z, P.trail, BALL_TRAIL, 2.2, 1.1, 0.45);
      } else if (p.kind === 'seeker') {
        const o = this.bees.get(p.id);
        const by = y + 0.3 + Math.sin(t * 20 + p.id) * 0.15;
        o.position.set(x, by, z);
        o.rotation.y = p.h;
        for (const c of o.children) if (c.userData.wing) c.rotation.z = c.userData.wing * (0.4 + Math.sin(t * 60) * 0.5);
        trail(fx, o, x, by, z, P.trail, BEE_TRAIL, 2.6, 0.7, 0.5);
        if (fx && Math.random() < dt * 14) fx.emit(P.star, x, by, z, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2, BEE_TRAIL, 3, 0.6);
      } else if (p.kind === 'bomb') {
        const o = this.bombs.get(p.id);
        o.position.set(x, y - 1.1, z);
        o.rotation.x += dt * 6;
        fuse(fx, o, dt);
        trail(fx, o, x, y, z, P.trail, FUSE[2], 1.2, 0.9, 0.6);
      } else if (p.kind === 'plane') {
        const o = this.planes.get(p.id);
        o.position.set(x, y, z);
        o.rotation.set(p.diving ? 0.6 : Math.sin(t * 3) * 0.1, p.h, Math.sin(t * 4) * 0.25);
        // Contrails from the wing tips.
        o.updateMatrixWorld();
        for (const s of [-1, 1]) {
          tmpP.set(s * 1.6, 0.1, -1.6).applyMatrix4(o.matrixWorld);
          const tip = o.userData[s < 0 ? 'left' : 'right'] ?? (o.userData[s < 0 ? 'left' : 'right'] = new THREE.Object3D());
          trail(fx, tip, tmpP.x, tmpP.y, tmpP.z, P.trail, CONTRAIL, 1.3, 0.45, 0.5);
        }
      }
    }
    for (const d of race.drops) {
      if (d.kind === 'oil') {
        const o = this.oils.get(d.id);
        o.position.set(d.x, d.y + 0.17, d.z);
        const s = Math.min(1, d.age * 4);
        o.scale.set(s, 1, s);
      } else if (d.kind === 'butter') {
        // Splats out on landing, then slowly melts away.
        const o = this.butters.get(d.id);
        o.position.set(d.x, d.y + 0.17, d.z);
        const s = Math.min(1, d.age * 6) * (1 + Math.min(0.35, d.age * 0.02));
        o.scale.set(s, Math.min(1, d.age * 6), s);
      } else {
        const o = this.bombs.get(d.id);
        o.position.set(d.x, d.y, d.z);
        o.rotation.set(0, 0, 0);
        // Flashing red, faster and faster, as it is about to go.
        const body = o.userData.body as THREE.MeshPhysicalMaterial;
        const urgency = clamp(1 - d.fuse / 2, 0, 1);
        body.emissiveIntensity = Math.max(0, Math.sin(t * (6 + urgency * 22))) * urgency * 3;
        o.scale.setScalar(1 + body.emissiveIntensity * 0.03);
        fuse(fx, o, dt);
      }
    }
    for (const b of race.blasts) {
      const o = this.blasts.get(b.id);
      const { fire, shock } = o.userData.parts as { fire: THREE.Mesh; shock: THREE.Mesh };
      const f = Math.min(1, b.age / 0.8);
      fire.position.set(b.x, b.y + 0.5 + b.r * (0.15 + f * 0.45), b.z);
      fire.scale.setScalar(b.r * (0.22 + (1 - (1 - f) ** 3) * 0.5));
      const fm = fire.material as THREE.ShaderMaterial;
      fm.uniforms.uAge.value = b.age;
      fm.uniforms.uSeed.value = b.id * 1.7;
      shock.position.set(b.x, b.y + 0.25, b.z);
      shock.scale.setScalar(b.r * (0.3 + Math.sqrt(f) * 1.1));
      (shock.material as THREE.ShaderMaterial).uniforms.uFade.value = 1 - f;
      if (fx && b.age < dt * 1.5 + 0.02) {
        // A lingering column of smoke over where it went off.
        for (let i = 0; i < 6; i++) fx.emit(P.smoke, b.x + (Math.random() - 0.5) * 3, b.y + 2, b.z + (Math.random() - 0.5) * 3, 0, 4, 0, SMOKE, 0.8, 2.6, 2.4);
      }
    }
    for (const g of race.giants) this.giant(g, t);
    for (const pool of this.pools()) pool.end();

    // Orbiting balls around Triple Balls holders, each with a little trail.
    let n = 0;
    for (const k of race.karts) {
      for (const o of race.orbitOf(k)) {
        if (n >= 32) break;
        tmpP.set(o.x, k.y + 1, o.z);
        tmpQ.setFromAxisAngle(Y_AXIS, t * 7 + n);
        tmpS.setScalar(1);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.orbits.setMatrixAt(n++, tmpM);
        if (fx) fx.emit(P.trail, o.x, k.y + 1, o.z, 0, 0, 0, BALL_TRAIL, 1.6, 0.9, Math.max(1, (dt * 3) / P.trail.life) * 0.6);
      }
    }
    this.orbits.count = n;
    this.orbits.instanceMatrix.needsUpdate = true;
  }

  private pools() {
    return this.poolList;
  }
  private poolList: Pool[] = [];

  /**
   * A giant's drop: the ring marks where it lands and fills as it comes; the hand swoops down over it, lets go
   * halfway, and rises away while the butter or gobstopper falls.
   */
  private giant(g: Race['giants'][number], t: number) {
    const o = this.giants.get(g.id);
    const { ring, fill, beam, hand, butter, candy } = o.userData.parts as Record<string, THREE.Mesh>;
    const p = clamp(g.age / g.fall, 0, 1);
    const bomb = g.kind === 'bomb';
    const r = bomb ? GIANT_BLAST_RADIUS : OIL_RADIUS + 0.6;
    const color = bomb ? '#ff2d55' : '#ffc93c';
    for (const m of [ring, fill, beam]) {
      m.position.set(g.x, g.y + 0.16, g.z);
      (m.material as THREE.MeshBasicMaterial).color.set(color);
    }
    ring.scale.setScalar(r * (1 + Math.sin(t * 16) * 0.04));
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.35 * Math.abs(Math.sin(t * 9));
    fill.scale.setScalar(r * Math.max(0.04, p));

    const low = g.y + 11;
    const high = g.y + 50;
    const handY = p < 0.45 ? lerp(high, low, easeOut(p / 0.45)) : p < 0.55 ? low : lerp(low, high, easeOut((p - 0.55) / 0.45));
    // The beam narrows onto the spot as it comes down.
    beam.scale.set(r * lerp(0.55, 0.25, p), Math.max(1, handY - g.y), r * lerp(0.55, 0.25, p));
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.12 * Math.abs(Math.sin(t * 9));
    hand.position.set(g.x, handY + 2.6, g.z);
    hand.rotation.set(0, (g.id * 2.39) % (Math.PI * 2), 0);
    (hand.userData.sleeve as THREE.MeshStandardMaterial).color.set(PLAYER_COLORS[g.slot] ?? '#ffffff');

    const held = bomb ? candy : butter;
    (bomb ? butter : candy).visible = false;
    held.visible = true;
    const groundY = g.y + (bomb ? 1.5 : 0);
    const fallP = clamp((p - 0.5) / 0.5, 0, 1);
    held.position.set(g.x, p < 0.5 ? handY : lerp(low, groundY, fallP * fallP), g.z);
    held.rotation.set(t * 3, t * 2, 0);
  }

  dispose() {
    for (const pool of this.pools()) pool.clear();
    // The item boxes and orbiting balls, which are made for each race.
    disposeTree(this.group);
  }
}

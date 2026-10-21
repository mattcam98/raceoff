/**
 * What items look like in the world: spinning item boxes, balls, bees, bombs,
 * paper jets, oil slicks and blast rings, and the Giant's Hand reaching in.
 * Models are pooled by id so nothing is built or thrown away mid-race except
 * when something new appears.
 */
import * as THREE from 'three';
import { PLAYER_COLORS } from '@raceoff/shared';
import { clamp, GIANT_BLAST_RADIUS, lerp, OIL_RADIUS, type Race } from '@raceoff/game';
import { at, ball, box, cone, cyl, disposeTree, group, mat } from './kit';
import { tex } from './textures';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

function ballModel() {
  const t = tex.stripes('#3ddc84', '#ffffff', 6);
  return ball(0.9, mat('#ffffff', { map: t, shiny: 80 }), 16);
}

function beeModel() {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10).scale(0.85, 0.85, 1.2), mat('#ffffff', { map: tex.stripes('#ffd23f', '#1b1b1f', 6), shiny: 40 })), 0, 0, 0, Math.PI / 2, 0, 0));
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    wing.position.set(s * 0.6, 0.6, -0.1);
    wing.rotation.set(-Math.PI / 2.4, 0, s * 0.5);
    wing.userData.wing = s;
    g.add(wing);
  }
  g.add(at(ball(0.18, '#111', 6), 0.3, 0.3, 0.95), at(ball(0.18, '#111', 6), -0.3, 0.3, 0.95));
  g.add(at(cone(0.15, 0.5, '#1b1b1f', 6), 0, 0, -1.2, -Math.PI / 2, 0, 0));
  return g;
}

function bombModel() {
  const g = group(at(ball(1.1, mat('#1d1d26', { shiny: 90 }), 16), 0, 1.1, 0), at(cyl(0.35, 0.35, 0.5, mat('#9aa0ab', { shiny: 60 }), 10), 0, 2.2, 0));
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd23f' }));
  spark.position.y = 2.7;
  spark.userData.spark = true;
  g.add(spark);
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
  const m = new THREE.Mesh(shape, new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
  m.castShadow = true;
  const g = group(m);
  g.add(at(box(0.05, 0.4, 1.2, '#ff4d6d'), 0, -0.3, -0.6));
  g.scale.setScalar(1.4);
  return g;
}

function oilModel() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(OIL_RADIUS * 2.3, OIL_RADIUS * 2.3).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ map: tex.puddle('#16161d'), transparent: true, shininess: 120, specular: new THREE.Color('#8a7dff'), depthWrite: false }));
  m.renderOrder = 3;
  return m;
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
    new THREE.MeshPhongMaterial({ map: tex.puddle('#f5c938'), transparent: true, shininess: 140, specular: new THREE.Color('#fff6c8'), depthWrite: false }),
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
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.9, 6, 18).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
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
  private boxes: THREE.InstancedMesh;
  private boxCores: THREE.InstancedMesh;
  private balls: Pool;
  private bees: Pool;
  private bombs: Pool;
  private planes: Pool;
  private oils: Pool;
  private butters: Pool;
  private giants: Pool;
  private blasts: Pool;
  private orbits: THREE.InstancedMesh;
  private boxSpin = 0;

  constructor(race: Race) {
    const n = race.boxes.length;
    this.boxes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.4, 2.4, 2.4),
      new THREE.MeshPhongMaterial({ map: tex.itemBox(), transparent: true, opacity: 0.88, shininess: 90, emissive: new THREE.Color('#40306a'), emissiveIntensity: 0.4 }),
      Math.max(1, n),
    );
    this.boxCores = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.75), new THREE.MeshBasicMaterial({ color: '#fff6c8' }), Math.max(1, n));
    this.boxes.castShadow = false;
    this.group.add(this.boxes, this.boxCores);
    this.balls = new Pool(this.group, ballModel);
    this.bees = new Pool(this.group, beeModel);
    this.bombs = new Pool(this.group, bombModel);
    this.planes = new Pool(this.group, planeModel);
    this.oils = new Pool(this.group, oilModel);
    this.butters = new Pool(this.group, butterModel);
    this.giants = new Pool(this.group, giantModel);
    this.blasts = new Pool(this.group, () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      return m;
    });
    this.orbits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 14, 10), mat('#ffffff', { map: tex.stripes('#3ddc84', '#ffffff', 6), shiny: 80 }), 32);
    this.orbits.count = 0;
    this.group.add(this.orbits);
  }

  update(race: Race, alpha: number, dt: number) {
    const t = race.time;
    this.boxSpin += dt;
    // Item boxes: bob and spin, pop back in with a grow.
    race.boxes.forEach((b, i) => {
      const respawning = b.respawn > 0;
      const grow = respawning ? Math.max(0, 1 - b.respawn / 0.35) * (b.respawn < 0.35 ? 1 : 0) : 1;
      const s = respawning ? grow : 1;
      tmpE.set(this.boxSpin * 0.9 + i, this.boxSpin * 1.3 + i * 0.7, 0.4);
      tmpQ.setFromEuler(tmpE);
      tmpP.set(b.x, b.y + 1.9 + Math.sin(this.boxSpin * 2 + i) * 0.3, b.z);
      tmpS.setScalar(Math.max(0.0001, s));
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.boxes.setMatrixAt(i, tmpM);
      tmpS.setScalar(Math.max(0.0001, s * (0.9 + Math.sin(this.boxSpin * 6 + i) * 0.1)));
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.boxCores.setMatrixAt(i, tmpM);
    });
    this.boxes.instanceMatrix.needsUpdate = true;
    this.boxCores.instanceMatrix.needsUpdate = true;

    for (const pool of this.pools()) pool.begin();
    for (const p of race.projectiles) {
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      const z = p.pz + (p.z - p.pz) * alpha;
      if (p.kind === 'ball') {
        const o = this.balls.get(p.id);
        o.position.set(x, y, z);
        o.rotation.x += dt * 12;
      } else if (p.kind === 'seeker') {
        const o = this.bees.get(p.id);
        o.position.set(x, y + 0.3 + Math.sin(t * 20 + p.id) * 0.15, z);
        o.rotation.y = p.h;
        for (const c of o.children) if (c.userData.wing) c.rotation.z = c.userData.wing * (0.4 + Math.sin(t * 60) * 0.5);
      } else if (p.kind === 'bomb') {
        const o = this.bombs.get(p.id);
        o.position.set(x, y - 1.1, z);
        o.rotation.x += dt * 6;
      } else if (p.kind === 'plane') {
        const o = this.planes.get(p.id);
        o.position.set(x, y, z);
        o.rotation.set(p.diving ? 0.6 : Math.sin(t * 3) * 0.1, p.h, Math.sin(t * 4) * 0.25);
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
        const flash = d.fuse < 1 && Math.floor(d.fuse * 10) % 2 === 0;
        for (const c of o.children) if (c.userData.spark) (c as THREE.Mesh).scale.setScalar(flash ? 1.8 : 1);
      }
    }
    for (const b of race.blasts) {
      const o = this.blasts.get(b.id);
      const f = Math.min(1, b.age / 0.4);
      o.position.set(b.x, b.y + 1, b.z);
      o.scale.setScalar(b.r * (0.3 + f * 0.8));
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - b.age / 0.8);
    }
    for (const g of race.giants) this.giant(g, t);
    for (const pool of this.pools()) pool.end();

    // Orbiting balls around Triple Balls holders.
    let n = 0;
    for (const k of race.karts) {
      for (const o of race.orbitOf(k)) {
        if (n >= 32) break;
        tmpP.set(o.x, k.y + 1, o.z);
        tmpQ.identity();
        tmpS.setScalar(1);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.orbits.setMatrixAt(n++, tmpM);
      }
    }
    this.orbits.count = n;
    this.orbits.instanceMatrix.needsUpdate = true;
  }

  private pools() {
    return [this.balls, this.bees, this.bombs, this.planes, this.oils, this.butters, this.blasts, this.giants];
  }

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
    (hand.userData.sleeve as THREE.MeshLambertMaterial).color.set(PLAYER_COLORS[g.slot] ?? '#ffffff');

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

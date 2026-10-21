/**
 * What items look like in the world: spinning item boxes, balls, bees, bombs,
 * paper jets, oil slicks and blast rings. Models are pooled by id so nothing
 * is built or thrown away mid-race except when something new appears.
 */
import * as THREE from 'three';
import { BLAST_RADIUS, OIL_RADIUS, type Race } from '@raceoff/game';
import { at, ball, box, cone, cyl, group, mat } from './kit';
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
      this.live.delete(id);
    }
  }

  clear() {
    for (const p of this.live.values()) this.parent.remove(p.obj);
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

    for (const pool of [this.balls, this.bees, this.bombs, this.planes, this.oils, this.blasts]) pool.begin();
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
      o.scale.setScalar(BLAST_RADIUS * (0.3 + f * 0.8));
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - b.age / 0.8);
    }
    for (const pool of [this.balls, this.bees, this.bombs, this.planes, this.oils, this.blasts]) pool.end();

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

  dispose() {
    for (const pool of [this.balls, this.bees, this.bombs, this.planes, this.oils, this.blasts]) pool.clear();
  }
}

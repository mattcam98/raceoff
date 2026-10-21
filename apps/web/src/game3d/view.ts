/**
 * The 3D view of a race. One WebGL renderer lives for the whole session; a
 * track's world and karts are swapped in when a race starts. It can draw one
 * camera full screen, a split screen with a chase camera per player, or one
 * shared table-top camera that keeps everyone in shot.
 */
import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS, PLAYER_LABELS, characterById } from '@raceoff/shared';
import { clamp, damp, fwdX, fwdZ, lerp, wrapAngle, SURF, type Kart, type Race, type RaceEvent, type Track } from '@raceoff/game';
import { Fx } from './fx';
import { ItemsView } from './items3d';
import { buildKart, shieldUniforms, type KartRig } from './kartModel';
import { Skids } from './skids';
import { tex } from './textures';
import { buildWorld, type World } from './world';

export type CameraMode = 'chase' | 'intro' | 'cinema' | 'podium';
export type Layout = 'split' | 'shared' | 'cinema';

export interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The kart this viewport follows, or -1 for an overview. */
  kart: number;
}

interface Chase {
  camera: THREE.PerspectiveCamera;
  kart: number;
  heading: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  shake: number;
  fov: number;
  init: boolean;
}

const SPARK_COLORS = ['#fff4d6', '#5ec8ff', '#ffa630', '#c77dff'];
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpColor = new THREE.Color();

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private extraLights: THREE.Light[] = [];
  private world: World | null = null;
  private items: ItemsView | null = null;
  private rigs: KartRig[] = [];
  private race: Race | null = null;
  private track: Track | null = null;
  readonly fx = new Fx();
  readonly skids = new Skids();
  private chases: Chase[] = [];
  private overview = new THREE.PerspectiveCamera(50, 1, 1, 3000);
  private overviewPos = new THREE.Vector3();
  private overviewLook = new THREE.Vector3();
  private cinema = new THREE.PerspectiveCamera(55, 1, 0.5, 3000);
  private cinemaKart = 0;
  private cinemaT = 0;
  private cinemaAngle = 0;
  private introT = 0;
  layout: Layout = 'cinema';
  cameraMode: CameraMode = 'cinema';
  private rects: ViewportRect[] = [];
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private frameTimes: number[] = [];
  private time = 0;
  private podiumGroup: THREE.Group | null = null;
  private podiumCenter: THREE.Vector3 | null = null;
  private hidden = new Set<number>();
  /** Draw the shadow map on the next frame: a new track, or the podium. */
  private shadowsDirty = true;
  private confettiT = 0;
  /** Fired when the viewport layout changes, so the HUD can follow. */
  onLayout: (rects: ViewportRect[]) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fx.group, this.skids.mesh);
    this.resize();
  }

  // ---------------------------------------------------------------- setup

  /** Swap in a race on a track. `viewers` are the kart indexes that get a viewport. */
  setRace(race: Race, viewers: number[], layout: Layout) {
    const track = race.track;
    if (this.track !== track) {
      if (this.world) {
        this.scene.remove(this.world.group);
        this.world.dispose();
      }
      this.track = track;
      this.world = buildWorld(track);
      this.shadowsDirty = true;
      this.scene.add(this.world.group);
      const th = this.world.theme;
      this.scene.background = tex.sky(th.sky[0], th.sky[1]);
      this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
      this.hemi.color.set(th.hemi.sky);
      this.hemi.groundColor.set(th.hemi.ground);
      this.hemi.intensity = th.hemi.intensity;
      this.sun.color.set(th.sun.color);
      this.sun.intensity = th.sun.intensity;
      const b = track.bounds;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      this.sun.position.set(cx + th.sun.x, track.def.floorY + th.sun.y, cz + th.sun.z);
      this.sun.target.position.set(cx, track.def.floorY, cz);
      const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 20;
      const cam = this.sun.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 10;
      cam.far = 900;
      cam.updateProjectionMatrix();
      for (const l of this.extraLights) this.scene.remove(l);
      this.extraLights = [];
      if (th.night) {
        for (const [x, z, c] of [[-80, -40, '#ffcf8a'], [90, 50, '#8ad4ff'], [0, 0, '#ffffff']] as [number, number, string][]) {
          const pl = new THREE.PointLight(c, 3500, 260, 1.6);
          pl.position.set(cx + x, track.def.floorY + 60, cz + z);
          this.scene.add(pl);
          this.extraLights.push(pl);
        }
      }
    }
    this.race = race;
    if (this.podiumGroup) {
      this.scene.remove(this.podiumGroup);
      this.podiumGroup = null;
    }
    this.podiumCenter = null;
    this.hidden.clear();
    for (const r of this.rigs) {
      this.scene.remove(r.root, r.shadow);
    }
    if (this.items) {
      this.scene.remove(this.items.group);
      this.items.dispose();
    }
    this.items = new ItemsView(race);
    this.scene.add(this.items.group);
    this.rigs = race.karts.map((k) => {
      const ch = characterById(k.character) ?? CHARACTERS[0];
      const player = k.slot >= 0 ? { label: PLAYER_LABELS[k.slot], color: PLAYER_COLORS[k.slot] } : null;
      const rig = buildKart(ch, k.body, player, k.slot >= 0 ? 1 + k.slot : 0);
      this.scene.add(rig.root, rig.shadow);
      return rig;
    });
    this.fx.clear();
    this.skids.clear();
    this.layout = layout;
    this.chases = viewers.map((kart) => this.makeChase(kart));
    this.cinemaKart = viewers[0] ?? 0;
    this.cinemaT = 0;
    this.introT = 0;
    this.shadowsDirty = true;
    this.relayout();
  }

  private makeChase(kart: number): Chase {
    const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 2400);
    const k = this.race!.karts[kart];
    // Each player's camera hides only their own tag.
    camera.layers.enableAll();
    if (k.slot >= 0) camera.layers.disable(1 + k.slot);
    return { camera, kart, heading: k.h, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, fov: 68, init: false };
  }

  setCamera(mode: CameraMode) {
    this.cameraMode = mode;
    if (mode === 'intro') this.introT = 0;
    if (mode === 'chase') for (const c of this.chases) c.init = false;
    if (mode === 'cinema' || mode === 'podium') this.cinemaT = 0;
    this.relayout();
  }

  /** Line the top three up on a winners' podium by the start line, and hide everyone else. */
  showPodium(top: number[]) {
    const race = this.race;
    const track = this.track;
    if (!race || !track) return;
    const base = track.pointAt(-12, 0);
    const g = new THREE.Group();
    const heights = [3.2, 2.1, 1.3];
    // Seen from the front, as the camera sees them: second on the left, third on the right.
    const offsets = [0, 5.2, -5.2];
    const colors = ['#ffd23f', '#d6dbe6', '#e0975a'];
    top.forEach((ki, i) => {
      const off = offsets[i];
      const x = base.x + Math.cos(base.h) * -off;
      const z = base.z - Math.sin(base.h) * -off;
      const block = new THREE.Mesh(new THREE.BoxGeometry(5, heights[i], 5), new THREE.MeshPhongMaterial({ color: colors[i], shininess: 60 }));
      block.position.set(x, base.y + heights[i] / 2, z);
      block.rotation.y = base.h;
      block.castShadow = block.receiveShadow = true;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(3, 3 * 0.375), new THREE.MeshBasicMaterial({ map: tex.label(String(i + 1), colors[i], '#1b1740', 128, 48), transparent: true }));
      label.position.set(x + Math.sin(base.h + Math.PI) * 2.55, base.y + heights[i] / 2, z + Math.cos(base.h + Math.PI) * 2.55);
      label.rotation.y = base.h + Math.PI;
      g.add(block, label);
      const k = race.karts[ki];
      if (k) {
        k.place3(x, base.y + heights[i], z, base.h + Math.PI);
        k.stun = null;
        k.driftDir = 0;
        k.steer = 0;
        k.respawnT = 0;
        k.invuln = 0;
        k.vx = k.vz = 0;
      }
    });
    this.scene.add(g);
    this.podiumGroup = g;
    this.podiumCenter = new THREE.Vector3(base.x, base.y + 2, base.z);
    this.hidden = new Set(race.karts.map((k) => k.index).filter((i) => !top.includes(i)));
    this.cinemaKart = top[0] ?? 0;
    this.shadowsDirty = true;
  }

  /** Point the cinematic camera at a kart, for results and the podium. */
  focus(kart: number) {
    this.cinemaKart = kart;
    this.cinemaT = 0;
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.relayout();
  }

  private relayout() {
    const W = this.width;
    const H = this.height;
    const n = this.chases.length;
    const rects: ViewportRect[] = [];
    if (this.layout === 'split' && this.cameraMode === 'chase' && n > 0) {
      if (n === 1) rects.push({ x: 0, y: 0, w: W, h: H, kart: this.chases[0].kart });
      else if (n === 2) {
        rects.push({ x: 0, y: 0, w: W / 2, h: H, kart: this.chases[0].kart }, { x: W / 2, y: 0, w: W / 2, h: H, kart: this.chases[1].kart });
      } else {
        const q = [
          { x: 0, y: 0 },
          { x: W / 2, y: 0 },
          { x: 0, y: H / 2 },
          { x: W / 2, y: H / 2 },
        ];
        for (let i = 0; i < 4; i++) rects.push({ ...q[i], w: W / 2, h: H / 2, kart: i < n ? this.chases[i].kart : -1 });
      }
    } else if (this.layout === 'shared' && this.cameraMode === 'chase') {
      rects.push({ x: 0, y: 0, w: W, h: H, kart: -1 });
    } else {
      rects.push({ x: 0, y: 0, w: W, h: H, kart: -2 });
    }
    this.rects = rects;
    this.onLayout(rects);
  }

  get viewports() {
    return this.rects;
  }

  // ---------------------------------------------------------------- events

  /** Sounds are elsewhere; this turns race events into effects and camera shake. */
  event(e: RaceEvent) {
    const race = this.race;
    if (!race) return;
    const shakeFor = (k: number, amount: number) => {
      for (const c of this.chases) if (c.kart === k) c.shake = Math.max(c.shake, amount);
    };
    switch (e.t) {
      case 'box':
        this.fx.burst(e.x, e.y, e.z, ['#ff5fa2', '#ffd23f', '#3ddc84', '#3d9bff', '#ffffff'], 26, 12, 0.5, 0.5);
        break;
      case 'hit': {
        const k = race.karts[e.k];
        this.fx.burst(k.x, k.y + 2, k.z, ['#ffffff', '#ffd23f'], 18, 8, 0.6, 0.6);
        shakeFor(e.k, 0.6);
        break;
      }
      case 'blast':
        this.fx.explosion(e.x, e.y, e.z);
        for (const c of this.chases) {
          const k = race.karts[c.kart];
          const d = Math.hypot(k.x - e.x, k.z - e.z);
          if (d < 40) c.shake = Math.max(c.shake, 1 - d / 40);
        }
        break;
      case 'fall': {
        const k = race.karts[e.k];
        if (e.water) this.fx.splash(k.x, k.y + 0.5, k.z);
        break;
      }
      case 'land': {
        const k = race.karts[e.k];
        for (let i = 0; i < (e.hard ? 12 : 5); i++) this.fx.dust(k.x, k.y, k.z, '#d8cfc0', 1.4);
        if (e.hard) shakeFor(e.k, 0.35);
        break;
      }
      case 'wall':
        if (e.strength > 10) shakeFor(e.k, Math.min(0.5, e.strength / 40));
        break;
      case 'bump':
        shakeFor(e.a, 0.2);
        shakeFor(e.b, 0.2);
        break;
      case 'boost': {
        const k = race.karts[e.k];
        const rig = this.rigs[e.k];
        for (const ex of rig.exhausts) {
          tmpV.copy(ex).applyMatrix4(rig.body.matrixWorld);
          for (let i = 0; i < 8; i++) this.fx.flame(tmpV.x, tmpV.y, tmpV.z, -fwdX(k.h) * 10, -fwdZ(k.h) * 10, e.level >= 3);
        }
        break;
      }
      case 'pop':
        this.fx.burst(e.x, e.y, e.z, ['#3ddc84', '#ffffff'], 14, 7, 0.5, 0.4);
        break;
      case 'finish': {
        const k = race.karts[e.k];
        if (!k.cpu) this.fx.confetti(k.x, k.y + 3, k.z, 120);
        break;
      }
      case 'respawn': {
        const k = race.karts[e.k];
        this.fx.burst(k.x, k.y + 1, k.z, ['#ffffff', '#bde0fe'], 16, 6, 0.6, 0.5);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- frame

  render(alpha: number, dt: number) {
    this.time += dt;
    const race = this.race;
    if (!race || !this.world) {
      this.renderer.setScissorTest(false);
      this.renderer.setClearColor('#14183a');
      this.renderer.clear();
      return;
    }
    this.world.update(race.time, dt, race.hazards);
    this.items!.update(race, alpha, dt);
    shieldUniforms.uTime.value = this.time;
    race.karts.forEach((k, i) => this.updateKart(k, this.rigs[i], alpha));
    this.fx.update(dt);
    this.skids.update(dt);

    // The sun's shadows are drawn once per frame, shared by every viewport.
    // Only the scenery casts real shadows (karts and hazards carry soft blobs), so the shadow map is drawn once
    // per track rather than every frame.
    this.renderer.setScissorTest(true);
    let first = true;
    for (const r of this.rects) {
      const cam = this.cameraFor(r, dt);
      const x = r.x;
      const y = this.height - r.y - r.h;
      this.renderer.setViewport(x, y, r.w, r.h);
      this.renderer.setScissor(x, y, r.w, r.h);
      cam.aspect = r.w / r.h;
      cam.updateProjectionMatrix();
      this.fx.setScale(r.h * this.pixelRatio, cam.fov);
      this.renderer.shadowMap.needsUpdate = first && this.shadowsDirty;
      if (first) this.shadowsDirty = false;
      first = false;
      this.renderer.render(this.scene, cam);
    }
    this.renderer.setScissorTest(false);
    this.adapt(dt);
  }

  /**
   * Keep the frame rate up on slower machines by rendering at a lower resolution. It goes by the time between
   * frames, not the time spent drawing, because a struggling graphics card shows up there and not here.
   */
  private adapt(dt: number) {
    if (dt <= 0 || document.hidden) return;
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length < 60) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    // The median, so one hitch (a tab switch, a garbage collection) does not count.
    const typical = sorted[Math.floor(sorted.length / 2)];
    this.frameTimes = [];
    const max = Math.min(window.devicePixelRatio || 1, 1.5);
    let next = this.pixelRatio;
    if (typical > 21 && this.pixelRatio > 0.6) next = Math.max(0.6, this.pixelRatio - 0.15);
    else if (typical < 17.5 && this.pixelRatio < max) next = Math.min(max, this.pixelRatio + 0.15);
    if (next !== this.pixelRatio) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }

  private cameraFor(r: ViewportRect, dt: number): THREE.PerspectiveCamera {
    if (r.kart >= 0) {
      const c = this.chases.find((c) => c.kart === r.kart)!;
      this.updateChase(c, dt);
      return c.camera;
    }
    if (r.kart === -1) {
      this.updateOverview(dt);
      return this.overview;
    }
    if (this.cameraMode === 'intro') this.updateIntro(dt);
    else this.updateCinema(dt);
    return this.cinema;
  }

  private kartPos(k: Kart, alpha = 1, out = tmpV) {
    return out.set(lerp(k.px, k.x, alpha), lerp(k.py, k.y, alpha), lerp(k.pz, k.z, alpha));
  }

  private updateChase(c: Chase, dt: number) {
    const k = this.race!.karts[c.kart];
    const rig = this.rigs[c.kart];
    const kp = rig.root.position;
    // Follow the direction of travel more than the nose, so drifts swing the kart, not the world.
    const moving = Math.hypot(k.vx, k.vz) > 4;
    const travel = moving && k.speed > -1 ? Math.atan2(k.vx, k.vz) : k.h;
    const wantHeading = k.driftDir ? wrapAngle(k.h + wrapAngle(travel - k.h) * 0.6) : travel;
    if (!c.init) {
      c.heading = k.h;
    } else if (!k.stun && k.respawnT === 0) {
      c.heading += wrapAngle(wantHeading - c.heading) * (1 - Math.exp(-5.5 * dt));
    }
    const speed = Math.max(0, k.speed);
    const boost = k.boost > 0 || k.rocket > 0;
    const dist = 7.2 + speed * 0.05 + (boost ? 1.2 : 0);
    const height = 3.1 + speed * 0.02;
    const want = tmpV2.set(kp.x - Math.sin(c.heading) * dist, kp.y + height, kp.z - Math.cos(c.heading) * dist);
    // Keep the camera above the ground it is over.
    const g = this.track!.grid.heightAt(want.x, want.z, this.track!.def.floorY);
    want.y = Math.max(want.y, g + 1.5);
    if (!c.init) {
      c.pos.copy(want);
      c.look.set(kp.x, kp.y + 1.4, kp.z);
      c.init = true;
    }
    c.pos.x = damp(c.pos.x, want.x, 12, dt);
    c.pos.z = damp(c.pos.z, want.z, 12, dt);
    c.pos.y = damp(c.pos.y, want.y, 6, dt);
    const lookAhead = 3.5;
    c.look.set(
      damp(c.look.x, kp.x + Math.sin(c.heading) * lookAhead, 16, dt),
      damp(c.look.y, kp.y + 1.5, 8, dt),
      damp(c.look.z, kp.z + Math.cos(c.heading) * lookAhead, 16, dt),
    );
    c.fov = damp(c.fov, boost ? 80 : 66 + speed * 0.08, 4, dt);
    c.camera.fov = c.fov;
    c.camera.position.copy(c.pos);
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 1.8);
      const s = c.shake * c.shake * 0.8;
      c.camera.position.x += (Math.random() - 0.5) * s;
      c.camera.position.y += (Math.random() - 0.5) * s;
    }
    c.camera.lookAt(c.look);
  }

  /** One camera over the table that keeps every human in shot. */
  private updateOverview(dt: number) {
    const race = this.race!;
    const humans = race.karts.filter((k) => !k.cpu);
    const focus = humans.length ? humans : race.karts.filter((k) => k.place <= 3);
    let cx = 0;
    let cz = 0;
    let cy = 0;
    for (const k of focus) {
      cx += k.x;
      cz += k.z;
      cy += k.y;
    }
    cx /= focus.length;
    cz /= focus.length;
    cy /= focus.length;
    let spread = 30;
    for (const k of focus) spread = Math.max(spread, Math.hypot(k.x - cx, k.z - cz) + 18);
    spread = Math.min(spread, 150);
    const height = spread * 1.35 + 20;
    const back = spread * 0.75 + 12;
    const want = tmpV2.set(cx, cy + height, cz + back);
    if (this.overviewPos.lengthSq() === 0) {
      this.overviewPos.copy(want);
      this.overviewLook.set(cx, cy, cz);
    }
    this.overviewPos.set(damp(this.overviewPos.x, want.x, 3, dt), damp(this.overviewPos.y, want.y, 2, dt), damp(this.overviewPos.z, want.z, 3, dt));
    this.overviewLook.set(damp(this.overviewLook.x, cx, 4, dt), damp(this.overviewLook.y, cy, 4, dt), damp(this.overviewLook.z, cz - 4, 4, dt));
    this.overview.fov = 50;
    this.overview.position.copy(this.overviewPos);
    this.overview.lookAt(this.overviewLook);
  }

  /** Swoop along the track toward the start line, ending behind the grid. */
  private updateIntro(dt: number) {
    const track = this.track!;
    this.introT += dt;
    const t = clamp(this.introT / 4.2, 0, 1);
    const e = t * t * (3 - 2 * t);
    const s = lerp(-150, -40, e);
    const p = track.pointAt(s, 0);
    const ahead = track.pointAt(s + 40, 0);
    const h = lerp(46, 12, e);
    const side = Math.sin(e * Math.PI) * 25;
    this.cinema.position.set(p.x + Math.cos(p.h) * side, p.y + h, p.z - Math.sin(p.h) * side);
    this.cinema.lookAt(ahead.x, ahead.y + 2, ahead.z);
    this.cinema.fov = 60;
  }

  /** Development aid: pin the cinematic camera somewhere, looking at something. */
  debugCamera: { from: [number, number, number]; to: [number, number, number] } | null = null;

  /** Slow orbits around one kart at a time, cutting between them. */
  private updateCinema(dt: number) {
    const race = this.race!;
    if (this.debugCamera) {
      this.cinema.position.set(...this.debugCamera.from);
      this.cinema.lookAt(...this.debugCamera.to);
      this.cinema.fov = 55;
      return;
    }
    this.cinemaT += dt;
    if (this.cameraMode === 'cinema' && this.cinemaT > 7) {
      this.cinemaT = 0;
      // Cut to whoever is near the front, but not always the leader.
      const pool = race.karts.filter((k) => k.respawnT === 0).sort((a, b) => a.place - b.place).slice(0, 4);
      this.cinemaKart = pool[Math.floor(Math.random() * pool.length)]?.index ?? 0;
      this.cinemaAngle = Math.random() * Math.PI * 2;
    }
    const k = race.karts[this.cinemaKart];
    if (!k) return;
    const podium = this.cameraMode === 'podium';
    const kp = podium && this.podiumCenter ? this.podiumCenter : this.rigs[this.cinemaKart].root.position;
    if (podium && this.podiumCenter) {
      this.confettiT -= dt;
      if (this.confettiT <= 0) {
        this.confettiT = 0.6;
        this.fx.confetti(kp.x + (Math.random() - 0.5) * 10, kp.y + 8, kp.z + (Math.random() - 0.5) * 10, 40);
      }
    }
    this.cinemaAngle += dt * (podium ? 0.35 : 0.18);
    const radius = podium ? 15 : 13 + Math.sin(this.cinemaT * 0.4) * 3;
    const a = k.h + Math.PI + Math.sin(this.cinemaAngle) * 1.1;
    const want = tmpV2.set(kp.x + Math.sin(a) * radius, kp.y + (podium ? 3.5 : 4.5), kp.z + Math.cos(a) * radius);
    if (this.cinemaT < dt * 1.5) this.cinema.position.copy(want);
    this.cinema.position.set(damp(this.cinema.position.x, want.x, 5, dt), damp(this.cinema.position.y, want.y, 4, dt), damp(this.cinema.position.z, want.z, 5, dt));
    this.cinema.lookAt(kp.x, kp.y + 1.2, kp.z);
    this.cinema.fov = podium ? 45 : 55;
  }

  // ---------------------------------------------------------------- karts

  private updateKart(k: Kart, rig: KartRig, alpha: number) {
    const p = this.kartPos(k, alpha);
    const h = k.ph + wrapAngle(k.h - k.ph) * alpha;
    rig.root.position.copy(p);
    rig.root.rotation.y = h;
    rig.tilt.rotation.x = -k.pitch;
    rig.tilt.rotation.z = -k.roll;
    const sp = clamp(Math.abs(k.speed) / k.params.maxSpeed, 0, 1.3);
    // Body: drift angle, spins, flips, squash, lean and a little engine shiver.
    let yaw = -k.driftDir * 0.32;
    let pitch = 0;
    if (k.stun === 'spin') yaw += k.spinAngle;
    if (k.stun === 'tumble') pitch = k.spinAngle * 0.5;
    rig.body.rotation.set(pitch, yaw, -k.steer * 0.06 * sp);
    if (k.stun === 'squash') rig.body.scale.set(1.35, 0.35, 1.35);
    else rig.body.scale.set(1, 1, 1);
    rig.body.position.y = k.speed < 1 && !k.stun ? Math.sin(this.time * 40 + k.index) * 0.025 : 0;
    for (const w of rig.wheels) w.rotation.x = k.wheel / rig.wheelRadius;
    for (const f of rig.front) f.rotation.y = -k.steer * 0.45;

    // Blinking while untouchable after a hit; hidden while being carried back.
    const blink = k.invuln > 0 && k.star === 0 && Math.floor(this.time * 14) % 2 === 0;
    rig.root.visible = !blink && !this.hidden.has(k.index);
    rig.shield.visible = k.shield > 0;
    if (k.shield > 0 && k.shield < 2) rig.shield.visible = Math.floor(this.time * 10) % 2 === 0;
    rig.rocket.visible = k.rocket > 0;
    if (k.star > 0) {
      tmpColor.setHSL((this.time * 1.5) % 1, 1, 0.5);
      for (const m of rig.paint) {
        m.emissive.copy(tmpColor);
        m.emissiveIntensity = 0.7;
      }
    } else if (rig.paint[0].emissiveIntensity !== 0) {
      for (const m of rig.paint) m.emissiveIntensity = 0;
    }
    if (rig.ring) rig.ring.visible = k.respawnT === 0;

    // Shadow on whatever is underneath.
    const ground = k.groundY;
    const above = p.y - ground;
    const overVoid = ground < (this.track?.def.floorY ?? 0) - 5;
    rig.shadow.visible = !overVoid && k.respawnT === 0 && !this.hidden.has(k.index);
    rig.shadow.position.set(p.x, ground + 0.13, p.z);
    rig.shadow.rotation.y = h;
    const ss = clamp(1 - above / 12, 0.3, 1);
    rig.shadow.scale.set(ss, 1, ss);

    if (k.respawnT > 0) {
      for (let w = 0; w < 2; w++) this.skids.mark(`${k.index}:${w}`, 0, 0, 0, false);
      return;
    }
    rig.root.updateMatrixWorld();
    // Rubber on the road: drifting, hard braking or spinning.
    const onRoad = k.surface === SURF.road || k.surface === SURF.boost || k.surface === SURF.slick;
    const skidding = k.grounded && onRoad && (k.driftDir !== 0 || (k.input.brake && k.speed > 10) || (k.stun === 'spin' && Math.hypot(k.vx, k.vz) > 6));
    rig.rearWheels.forEach((w, wi) => {
      tmpV.copy(w).applyMatrix4(rig.body.matrixWorld);
      this.skids.mark(`${k.index}:${wi}`, tmpV.x, k.groundY, tmpV.z, skidding, k.driftDir ? 0.32 + k.driftLevel * 0.05 : 0.4);
    });
    // Drift sparks from the rear wheels.
    if (k.driftDir && k.grounded) {
      const level = k.driftLevel;
      const n = level === 0 ? 1 : 2 + level;
      for (const w of rig.rearWheels) {
        tmpV.copy(w).applyMatrix4(rig.body.matrixWorld);
        for (let i = 0; i < n; i++) if (Math.random() < 0.7) this.fx.spark(tmpV.x, tmpV.y + 0.15, tmpV.z, SPARK_COLORS[level], 0.6 + level * 0.25);
        if (level === 0 && Math.random() < 0.3) this.fx.dust(tmpV.x, tmpV.y, tmpV.z, '#e8e4dc', 0.8);
      }
    }
    // Exhaust flames while boosting.
    if (k.boost > 0 || k.rocket > 0) {
      for (const ex of rig.exhausts) {
        tmpV.copy(ex).applyMatrix4(rig.body.matrixWorld);
        for (let i = 0; i < (k.rocket > 0 ? 3 : 2); i++) this.fx.flame(tmpV.x, tmpV.y, tmpV.z, -fwdX(k.h) * 8, -fwdZ(k.h) * 8, k.boostMul > 1.4);
      }
      if (k.rocket > 0) {
        tmpV.set(0, 1.2, -2.1).applyMatrix4(rig.body.matrixWorld);
        for (let i = 0; i < 4; i++) this.fx.flame(tmpV.x, tmpV.y, tmpV.z, -fwdX(k.h) * 14, -fwdZ(k.h) * 14, false);
      }
    }
    // Dust kicked up off-road.
    if (k.grounded && sp > 0.25 && (k.surface === SURF.rough || k.surface === SURF.sand) && Math.random() < sp * 0.7) {
      const c = this.dustColor();
      this.fx.dust(p.x - fwdX(h) * 1.2, p.y, p.z - fwdZ(h) * 1.2, c, 1.1);
    }
    if (k.star > 0 && Math.random() < 0.6) {
      tmpColor.setHSL(Math.random(), 1, 0.65);
      this.fx.spark(p.x + (Math.random() - 0.5) * 2, p.y + 1 + Math.random() * 1.5, p.z + (Math.random() - 0.5) * 2, `#${tmpColor.getHexString()}`, 0.5);
    }
  }

  private dustColor() {
    switch (this.track?.def.id) {
      case 'sandbox':
        return '#e8cc8e';
      case 'garage':
        return '#9a9da5';
      case 'toybox':
        return '#b6a9ff';
      default:
        return '#efe7dc';
    }
  }

  /** Project a world point into a viewport's CSS pixels, or null when behind the camera. */
  project(r: ViewportRect, x: number, y: number, z: number): { x: number; y: number } | null {
    const cam = r.kart >= 0 ? this.chases.find((c) => c.kart === r.kart)?.camera : r.kart === -1 ? this.overview : this.cinema;
    if (!cam) return null;
    tmpV.set(x, y, z).project(cam);
    if (tmpV.z > 1) return null;
    return { x: r.x + ((tmpV.x + 1) / 2) * r.w, y: r.y + ((1 - tmpV.y) / 2) * r.h };
  }

  dispose() {
    this.world?.dispose();
    this.items?.dispose();
    this.renderer.dispose();
  }
}

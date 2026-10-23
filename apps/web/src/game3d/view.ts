/**
 * The 3D view of a race. One WebGL renderer lives for the whole session; a
 * track's world and karts are swapped in when a race starts. It can draw one
 * camera full screen, a split screen with a chase camera per player, or one
 * shared table-top camera that keeps everyone in shot.
 */
import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS, PLAYER_LABELS, characterById } from '@raceoff/shared';
import { clamp, damp, fwdX, fwdZ, lerp, rightX, rightZ, wrapAngle, SURF, type Kart, type Race, type RaceEvent, type Track } from '@raceoff/game';
import { Fx } from './fx';
import { emitEvent, emitKart } from './fxKart';
import { environmentFor } from './env';
import { disposeTree, mat } from './kit';
import { ItemsView } from './items3d';
import { animateKart } from './kartAnim';
import { buildKart, shieldUniforms, type KartRig } from './kartModel';
import { Post, type PostView } from './post';
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
  /** Whose view this is: its viewport, dashboard and screen shake. */
  kart: number;
  /** Which kart the camera follows: that player's own, or, once they are the giant, someone still racing. */
  follow: number;
  heading: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  shake: number;
  fov: number;
  /** Camera roll into a turn, radians. */
  roll: number;
  /** A dip that springs back: landings and hits push the camera down. */
  dip: number;
  dipV: number;
  /** Speed blur at the edges of the view, eased. */
  blur: number;
  init: boolean;
}

const SPARK_COLORS = ['#fff4d6', '#5ec8ff', '#ffa630', '#c77dff'];
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpColor = new THREE.Color();

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private extraLights: THREE.Light[] = [];
  private post: Post;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private postViews: PostView[] = [];
  /** Slow machines lose depth of field and multisampling once lowering the resolution is not enough. */
  private highQuality = true;
  private world: World | null = null;
  private items: ItemsView | null = null;
  private rigs: KartRig[] = [];
  /** Each kart's drift spark level last frame, to burst when it goes up. */
  private sparkLevels: number[] = [];
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
  private onContextRestored = () => {
    this.shadowsDirty = true;
  };
  private confettiT = 0;
  /** Fired when the viewport layout changes, so the HUD can follow. */
  onLayout: (rects: ViewportRect[]) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.post = new Post(this.renderer);
    this.renderer.shadowMap.autoUpdate = false;
    // The shadow map is drawn only when the scene changes; a restored context starts with it empty.
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.35;
    // Soft-edged shadows, like a window's light rather than a spotlight's.
    this.sun.shadow.radius = 3;
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
      this.envTarget?.dispose();
      this.envTarget = environmentFor(this.renderer, th);
      this.scene.environment = this.envTarget.texture;
      this.scene.environmentIntensity = th.look.env;
      this.hemi.color.set(th.hemi.sky);
      this.hemi.groundColor.set(th.hemi.ground);
      this.hemi.intensity = th.hemi.intensity * th.look.hemi;
      this.sun.color.set(th.sun.color);
      this.sun.intensity = th.sun.intensity * th.look.sun;
      this.post.setGrade(th.look.grade);
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
      disposeTree(this.podiumGroup);
      this.podiumGroup = null;
    }
    this.podiumCenter = null;
    this.hidden.clear();
    for (const r of this.rigs) {
      this.scene.remove(r.root, r.shadow);
      disposeTree(r.root);
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
    this.sparkLevels = race.karts.map(() => 0);
    if (!this.highQuality) this.movingShadows(false);
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
    return { camera, kart, follow: kart, heading: k.h, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, fov: 68, roll: 0, dip: 0, dipV: 0, blur: 0, init: false };
  }

  /** Point player `kart`'s camera at `target` (their own kart to go back). A change of kart is a cut. */
  follow(kart: number, target: number) {
    const c = this.chases.find((x) => x.kart === kart);
    if (!c || c.follow === target) return;
    c.follow = target;
    c.init = false;
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
      const block = new THREE.Mesh(new THREE.BoxGeometry(5, heights[i], 5), mat(colors[i], { shiny: 60 }));
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

  /** The last resort for slow machines (and headless tests): no depth of field, multisampling or moving shadows. */
  dropQuality() {
    this.highQuality = false;
    this.post.setQuality(false);
    this.movingShadows(false);
  }

  /** A shadow map drawn once cannot hold moving things: on slow machines, karts and hazards stop casting. */
  private movingShadows(on: boolean) {
    for (const r of this.rigs) r.root.traverse((o) => (o.castShadow &&= on));
    this.items?.group.traverse((o) => (o.castShadow &&= on));
    this.world?.group.traverse((o) => {
      if (!o.userData.static) o.castShadow &&= on;
    });
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
    this.post.setSize(w, h, this.pixelRatio);
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
    emitEvent(this.fx, e, race, this.rigs, this.dustColor());
    const shakeFor = (k: number, amount: number) => {
      for (const c of this.chases) if (c.kart === k) c.shake = Math.max(c.shake, amount);
    };
    const dipFor = (k: number, v: number) => {
      for (const c of this.chases) if (c.follow === k) c.dipV -= v;
    };
    switch (e.t) {
      case 'hit':
        shakeFor(e.k, 0.6);
        dipFor(e.k, 5);
        break;
      case 'blast':
        for (const c of this.chases) {
          const k = race.karts[c.follow];
          const d = Math.hypot(k.x - e.x, k.z - e.z);
          if (d < 40) c.shake = Math.max(c.shake, 1 - d / 40);
        }
        break;
      case 'land':
        if (e.hard) shakeFor(e.k, 0.35);
        dipFor(e.k, e.hard ? 7 : 3);
        break;
      case 'wall':
        if (e.strength > 10) shakeFor(e.k, Math.min(0.5, e.strength / 40));
        break;
      case 'bump':
        shakeFor(e.a, 0.2);
        shakeFor(e.b, 0.2);
        break;
    }
  }

  // ---------------------------------------------------------------- frame

  render(alpha: number, dt: number) {
    this.time += dt;
    const race = this.race;
    if (!race || !this.world) {
      this.renderer.setRenderTarget(null);
      this.renderer.setScissorTest(false);
      this.renderer.setClearColor('#14183a');
      this.renderer.clear();
      return;
    }
    this.world.update(race.time, dt, race.hazards);
    this.items!.update(race, alpha, dt);
    shieldUniforms.uTime.value = this.time;
    race.karts.forEach((k, i) => this.updateKart(k, this.rigs[i], alpha, dt));
    this.fx.update(dt);
    this.skids.update(dt);

    // The sun's shadows are drawn once per frame, shared by every viewport.
    this.post.begin();
    const views = this.postViews;
    views.length = 0;
    let first = true;
    const pr = this.pixelRatio;
    for (const r of this.rects) {
      const cam = this.cameraFor(r, dt);
      // Drawing-buffer pixels, from the bottom left.
      const v: PostView = {
        x: Math.round(r.x * pr), y: Math.round((this.height - r.y - r.h) * pr), w: Math.round(r.w * pr), h: Math.round(r.h * pr),
        near: cam.near, far: cam.far, focus: this.focusFor(r, cam), speed: this.speedFor(r),
      };
      views.push(v);
      this.post.viewport(v);
      cam.aspect = r.w / r.h;
      cam.updateProjectionMatrix();
      this.fx.setScale(r.h * pr, cam.fov);
      // Karts and hazards cast real shadows, so the map is redrawn each frame; slow machines keep it for scenery only.
      this.renderer.shadowMap.needsUpdate = first && (this.shadowsDirty || this.highQuality);
      if (first) this.shadowsDirty = false;
      first = false;
      this.renderer.render(this.scene, cam);
    }
    this.post.end(views, this.time);
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
    if (typical > 21 && this.pixelRatio <= 0.75 && this.highQuality) return this.dropQuality();
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
    const k = this.race!.karts[c.follow];
    const rig = this.rigs[c.follow];
    const kp = rig.root.position;
    // Follow the direction of travel, not the nose, so drifts swing the kart, not the world. In a drift the
    // camera trails a little more, so the kart's slide shows.
    const moving = Math.hypot(k.vx, k.vz) > 4;
    const wantHeading = moving && k.speed > -1 ? Math.atan2(k.vx, k.vz) : k.h;
    const before = c.heading;
    if (!c.init) {
      c.heading = k.h;
    } else if (!k.stun && k.respawnT === 0) {
      c.heading += wrapAngle(wantHeading - c.heading) * (1 - Math.exp(-(k.driftDir ? 4.2 : 6) * dt));
    }
    const sp = clamp(Math.max(0, k.speed) / k.params.maxSpeed, 0, 1.6);
    const boost = k.boost > 0 || k.rocket > 0;
    // Faster pulls the camera back and up a touch; a boost pulls it further, so the kart surges away from it.
    const dist = 5.7 + sp * 1.1 + (boost ? 1 : 0) + (k.rocket > 0 ? 0.8 : 0);
    const height = 2.55 + sp * 0.45;
    // A drift's hop is a little bounce under a steady camera: hold the height of the ground through it, so the
    // view does not bob on every drift. Real jumps are followed as before.
    const baseY = k.hopping ? Math.min(kp.y, k.groundY) : kp.y;
    const want = tmpV2.set(kp.x - Math.sin(c.heading) * dist, baseY + height, kp.z - Math.cos(c.heading) * dist);
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
    // Look a little ahead, and into the corner while drifting, so the way out of the bend is in view.
    const lookAhead = 3.5 + sp * 1.5;
    const inside = k.driftDir * 1.3;
    c.look.set(
      damp(c.look.x, kp.x + Math.sin(c.heading) * lookAhead + rightX(c.heading) * inside, 14, dt),
      damp(c.look.y, baseY + 1.45, 8, dt),
      damp(c.look.z, kp.z + Math.cos(c.heading) * lookAhead + rightZ(c.heading) * inside, 14, dt),
    );
    // Field of view widens with speed, and kicks out on a boost then settles: the rush of speed.
    const fovWant = 62 + sp * 6 + (boost ? 8 : 0) + (k.rocket > 0 ? 5 : 0);
    c.fov = damp(c.fov, fovWant, fovWant > c.fov ? 7 : 2.5, dt);
    c.camera.fov = c.fov;
    // A spring for dips from landings and hits.
    if (dt > 0) {
      c.dipV += (-c.dip * 110 - c.dipV * 13) * dt;
      c.dip += c.dipV * dt;
    }
    c.camera.position.copy(c.pos);
    c.camera.position.y += c.dip * 0.12;
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 1.8);
      const s = c.shake * c.shake * 0.8;
      c.camera.position.x += (Math.random() - 0.5) * s;
      c.camera.position.y += (Math.random() - 0.5) * s;
    }
    c.camera.lookAt(c.look);
    // Bank gently into turns, by how fast the camera is swinging round.
    const swing = dt > 0 ? wrapAngle(c.heading - before) / dt : 0;
    c.roll = damp(c.roll, clamp(swing * 0.03, -0.07, 0.07), 5, dt);
    c.camera.rotateZ(c.roll);
    c.blur = damp(c.blur, k.rocket > 0 ? 1 : boost ? 0.6 : clamp((sp - 1) * 2, 0, 0.4), boost ? 8 : 3, dt);
  }

  /** How far a viewport stays sharp before the depth of field starts. */
  private focusFor(r: ViewportRect, cam: THREE.PerspectiveCamera) {
    if (r.kart >= 0) return 70;
    if (r.kart === -1) return cam.position.distanceTo(this.overviewLook) * 1.25;
    // The wide shot of the table is a miniature: focus on the table, the room around it melts away.
    if (this.cameraMode === 'intro') return this.introT < 2 ? cam.position.distanceTo(tmpV3.set(...this.trackCentre())) * 1.1 : 70;
    const target = this.podiumCenter && this.cameraMode === 'podium' ? this.podiumCenter : this.rigs[this.cinemaKart]?.root.position;
    // Close on the kart and the room melts away behind it: the miniature look.
    return target ? cam.position.distanceTo(target) * 1.6 : 60;
  }

  private trackCentre(): [number, number, number] {
    const b = this.track!.bounds;
    return [(b.minX + b.maxX) / 2, this.track!.def.floorY, (b.minZ + b.maxZ) / 2];
  }

  private speedFor(r: ViewportRect) {
    if (r.kart < 0) return 0;
    return this.chases.find((c) => c.kart === r.kart)?.blur ?? 0;
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

  /**
   * The intro: a high, slow crane round the whole table to show where we are and how small the karts are, then
   * a swoop down the start straight that lands just behind the grid, close to where the chase cameras start.
   */
  private updateIntro(dt: number) {
    const track = this.track!;
    this.introT += dt;
    const T = 4.2;
    const t = clamp(this.introT / T, 0, 1);
    const smooth = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
    const b = track.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const ext = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const start = track.pointAt(0, 0);
    // The wide shot circles from behind the start line's side of the table.
    const a = Math.atan2(start.x - cx, start.z - cz) + 0.9 - smooth(Math.min(1, t / 0.6)) * 0.8;
    const wide = tmpV.set(cx + Math.sin(a) * ext * 0.62, track.def.floorY + ext * 0.42, cz + Math.cos(a) * ext * 0.62);
    const wideLook = tmpV2.set(cx, track.def.floorY, cz);
    // The landing: behind the grid and a little above it, looking down the straight.
    const grid = track.pointAt(-22, 0);
    const ahead = track.pointAt(6, 0);
    const land = new THREE.Vector3(grid.x, grid.y + 5, grid.z);
    const landLook = new THREE.Vector3(ahead.x, ahead.y + 1.5, ahead.z);
    const k = smooth(clamp((t - 0.45) / 0.55, 0, 1));
    // Arc over rather than cutting through: lift the path in the middle of the swoop.
    const lift = Math.sin(k * Math.PI) * ext * 0.08;
    this.cinema.position.lerpVectors(wide, land, k);
    this.cinema.position.y += lift;
    this.cinema.lookAt(wideLook.lerp(landLook, k));
    this.cinema.fov = lerp(42, 62, k);
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

  private updateKart(k: Kart, rig: KartRig, alpha: number, dt: number) {
    const p = this.kartPos(k, alpha);
    const h = k.ph + wrapAngle(k.h - k.ph) * alpha;
    const sp = clamp(Math.abs(k.speed) / k.params.maxSpeed, 0, 1.3);
    animateKart(rig, k, p, h, this.time, dt);

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
    emitKart(this.fx, this.skids, k, rig, p, h, sp, this.sparkLevels, this.track?.def.id ?? '', this.dustColor());
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
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.world?.dispose();
    this.items?.dispose();
    for (const r of this.rigs) disposeTree(r.root);
    if (this.podiumGroup) disposeTree(this.podiumGroup);
    this.envTarget?.dispose();
    this.post.dispose();
    this.renderer.dispose();
  }
}

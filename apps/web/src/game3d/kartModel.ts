/**
 * Karts and their drivers, built from primitives. A kart faces +z with its
 * origin on the ground between the wheels.
 *
 *   root   position and heading
 *   tilt   pitch and roll to match the ground
 *   body   drift yaw, spins, squash and bounce
 */
import * as THREE from 'three';
import { at, bake, ball, box, cone, cyl, mat, scaled, shareResource, slab, torus } from './kit';
import { tex } from './textures';

export interface KartRig {
  root: THREE.Group;
  tilt: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Object3D[];
  front: THREE.Object3D[];
  /** Local positions of exhaust tips and rear wheels, for flames and sparks. */
  exhausts: THREE.Vector3[];
  rearWheels: THREE.Vector3[];
  shield: THREE.Mesh;
  shadow: THREE.Mesh;
  ring: THREE.Mesh | null;
  tag: THREE.Sprite | null;
  rocket: THREE.Object3D;
  /** Body materials that flash during a Sugar Rush. */
  paint: THREE.MeshPhongMaterial[];
  wheelRadius: number;
}

const DARK = mat('#22232b', { shiny: 8 });
const CHROME = mat('#d7dce4', { shiny: 120 });
const SEAT = mat('#2b2d3a', { shiny: 10 });

function paintMat(color: string) {
  return new THREE.MeshPhongMaterial({ color: new THREE.Color(color), shininess: 70, specular: new THREE.Color('#555555') });
}

/** A wheel in one draw: tyre, hub and a notch that shows it turning, all in the same finish so they merge. */
function wheel(r: number, width: number, hubColor: string) {
  const w = new THREE.Group();
  const finish = (c: string) => new THREE.MeshPhongMaterial({ color: c, shininess: 30 });
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 18), finish('#22232b'));
  tire.rotation.z = Math.PI / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, width + 0.04, 12), finish(hubColor));
  cap.rotation.z = Math.PI / 2;
  const notch = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, r * 0.18, r * 0.9), finish('#d7dce4'));
  w.add(tire, cap, notch);
  const baked = bake(w, 'wheel');
  baked.traverse((o) => (o.castShadow = false));
  return baked;
}

// ---------------------------------------------------------------- drivers

function eyes(y: number, z: number, spread = 0.17, size = 0.11) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(at(ball(size, '#ffffff', 10), s * spread, y, z));
    g.add(at(ball(size * 0.55, '#15151c', 8), s * spread, y + 0.01, z + size * 0.75));
  }
  return g;
}

function head(id: string, color: string, accent: string): THREE.Group {
  const c = paintMat(color);
  const a = mat(accent, { shiny: 30 });
  const nose = mat('#1b1b22', { shiny: 60 });
  const g = new THREE.Group();
  switch (id) {
    case 'zip': {
      g.add(ball(0.5, c, 16));
      g.add(at(scaled(ball(0.26, a, 12), 1, 0.75, 1.25), 0, -0.12, 0.38));
      g.add(at(ball(0.08, nose, 8), 0, -0.06, 0.68));
      for (const s of [-1, 1]) {
        g.add(at(cone(0.18, 0.42, c, 8), s * 0.28, 0.36, -0.02, 0, 0, -s * 0.35));
        g.add(at(cone(0.09, 0.26, a, 6), s * 0.28, 0.4, 0.04, 0, 0, -s * 0.35));
      }
      g.add(eyes(0.1, 0.38));
      break;
    }
    case 'bonk': {
      g.add(ball(0.54, c, 16));
      for (const s of [-1, 1]) g.add(at(ball(0.18, c, 10), s * 0.38, 0.4, -0.02), at(ball(0.1, a, 8), s * 0.38, 0.4, 0.06));
      g.add(at(scaled(ball(0.26, a, 12), 1.1, 0.8, 1), 0, -0.14, 0.42));
      g.add(at(ball(0.09, nose, 8), 0, -0.06, 0.66));
      g.add(eyes(0.12, 0.42, 0.18, 0.1));
      break;
    }
    case 'volt': {
      g.add(at(box(0.84, 0.74, 0.76, c), 0, -0.37, 0));
      g.add(at(box(0.7, 0.26, 0.05, mat('#101820', { shiny: 90 })), 0, -0.04, 0.38));
      for (const s of [-1, 1]) g.add(at(ball(0.07, mat('#7df9ff', { emissive: '#7df9ff', emissiveIntensity: 1 }), 8), s * 0.16, 0.09, 0.41));
      g.add(at(cyl(0.03, 0.03, 0.34, CHROME, 6), 0, 0.37, 0));
      g.add(at(ball(0.08, mat('#ff4d6d', { emissive: '#ff4d6d', emissiveIntensity: 1 }), 8), 0, 0.74, 0));
      for (const s of [-1, 1]) g.add(at(cyl(0.12, 0.12, 0.1, a, 10), s * 0.45, 0, 0, 0, 0, Math.PI / 2));
      break;
    }
    case 'duckie': {
      g.add(ball(0.5, c, 16));
      g.add(at(scaled(ball(0.22, mat(accent, { shiny: 40 }), 10), 1.4, 0.45, 1.4), 0, -0.08, 0.5));
      g.add(at(cone(0.08, 0.28, c, 6), 0, 0.46, 0, -0.4, 0, 0));
      g.add(eyes(0.14, 0.38, 0.18, 0.1));
      break;
    }
    case 'mochi': {
      g.add(ball(0.5, c, 16));
      for (const s of [-1, 1]) {
        g.add(at(cone(0.2, 0.36, c, 4), s * 0.3, 0.36, 0, 0, Math.PI / 4, -s * 0.3));
        for (const k of [-1, 1]) g.add(at(box(0.3, 0.015, 0.015, '#ffffff'), s * 0.36, -0.08 + k * 0.05, 0.38, 0, 0, s * k * 0.15));
      }
      g.add(at(scaled(ball(0.2, a, 10), 1.2, 0.7, 1), 0, -0.14, 0.4));
      g.add(at(ball(0.06, mat('#ff4d8d'), 6), 0, -0.06, 0.55));
      g.add(eyes(0.1, 0.4));
      break;
    }
    case 'hopper': {
      g.add(scaled(ball(0.55, c, 16), 1.15, 0.72, 1));
      for (const s of [-1, 1]) {
        g.add(at(ball(0.2, c, 10), s * 0.26, 0.34, 0.14));
        g.add(at(ball(0.15, '#ffffff', 10), s * 0.26, 0.38, 0.26));
        g.add(at(ball(0.08, '#111', 8), s * 0.26, 0.4, 0.38));
      }
      g.add(at(torus(0.3, 0.025, '#1b4d1b', Math.PI, 12), 0, -0.08, 0.42, 0, 0, Math.PI));
      g.add(at(scaled(ball(0.3, a, 10), 1.3, 0.5, 1), 0, -0.25, 0.25));
      break;
    }
    case 'pebble': {
      g.add(ball(0.52, c, 16));
      g.add(at(scaled(ball(0.4, a, 14), 1, 1, 0.75), 0, -0.06, 0.2));
      g.add(at(cone(0.1, 0.32, mat('#ff9f1c', { shiny: 40 }), 8), 0, -0.04, 0.52, Math.PI / 2, 0, 0));
      g.add(eyes(0.12, 0.44, 0.16, 0.09));
      break;
    }
    case 'ember': {
      g.add(ball(0.5, c, 16));
      g.add(at(scaled(ball(0.28, c, 12), 1, 0.75, 1.3), 0, -0.1, 0.38));
      for (const s of [-1, 1]) {
        g.add(at(cone(0.08, 0.36, a, 6), s * 0.24, 0.4, -0.12, -0.5, 0, -s * 0.3));
        g.add(at(ball(0.03, nose, 6), s * 0.08, -0.04, 0.72));
      }
      g.add(eyes(0.14, 0.38));
      break;
    }
    default:
      g.add(ball(0.5, c, 16), eyes(0.1, 0.4));
  }
  return g;
}

function driver(id: string, color: string, accent: string) {
  const g = new THREE.Group();
  g.add(at(scaled(ball(0.42, paintMat(color), 14), 1, 1.05, 0.85), 0, 0.42, 0));
  g.add(at(head(id, color, accent), 0, 1.25, 0.05));
  // Arms out to the wheel.
  for (const s of [-1, 1]) g.add(at(scaled(ball(0.13, paintMat(color), 8), 1, 1, 3), s * 0.32, 0.5, 0.32, -0.3, 0, 0));
  // Little wings for the dragon.
  if (id === 'ember') for (const s of [-1, 1]) g.add(at(scaled(cone(0.3, 0.6, mat(accent), 3), 1, 1, 0.2), s * 0.35, 0.75, -0.35, 0.6, 0, s * 0.9));
  return g;
}

// ---------------------------------------------------------------- bodies

interface BodyParts {
  shell: THREE.Group;
  wheelR: number;
  front: [number, number];
  rear: [number, number];
  seatY: number;
  exhausts: THREE.Vector3[];
}

function racer(main: THREE.Material, trim: THREE.Material): BodyParts {
  const shell = new THREE.Group();
  shell.add(at(slab(1.5, 0.42, 2.6, 0.35, main), 0, 0.22, 0));
  shell.add(at(slab(1.05, 0.32, 1.0, 0.3, main), 0, 0.3, 1.25, -0.12, 0, 0));
  shell.add(at(box(1.2, 0.12, 0.25, trim), 0, 0.3, 1.78));
  for (const s of [-1, 1]) shell.add(at(slab(0.42, 0.36, 1.2, 0.15, trim), s * 0.86, 0.25, -0.1));
  // Rear wing on struts.
  shell.add(at(box(1.75, 0.08, 0.42, trim), 0, 1.0, -1.2));
  for (const s of [-1, 1]) shell.add(at(box(0.07, 0.4, 0.2, DARK), s * 0.5, 0.62, -1.18));
  shell.add(at(box(0.9, 0.55, 0.15, SEAT), 0, 0.62, -0.62, -0.15, 0, 0));
  shell.add(at(torus(0.2, 0.04, DARK, Math.PI * 2, 14), 0, 0.98, 0.46, -0.9, 0, 0));
  const exhausts = [new THREE.Vector3(-0.32, 0.45, -1.45), new THREE.Vector3(0.32, 0.45, -1.45)];
  for (const e of exhausts) shell.add(at(cyl(0.1, 0.12, 0.42, CHROME, 8), e.x, e.y, e.z + 0.2, Math.PI / 2, 0, 0));
  return { shell, wheelR: 0.42, front: [0.86, 0.95], rear: [0.9, -0.95], seatY: 0.52, exhausts };
}

function buggy(main: THREE.Material, trim: THREE.Material): BodyParts {
  const shell = new THREE.Group();
  shell.add(at(slab(1.3, 0.45, 2.2, 0.4, main), 0, 0.42, 0));
  shell.add(at(slab(1.1, 0.25, 0.7, 0.3, trim), 0, 0.55, 1.15, -0.3, 0, 0));
  // Roll cage.
  for (const s of [-1, 1]) {
    shell.add(at(cyl(0.05, 0.05, 1.1, trim, 6), s * 0.5, 0.85, -0.55, 0, 0, 0));
    shell.add(at(cyl(0.05, 0.05, 1.25, trim, 6), s * 0.5, 0.85, 0.15, -0.5, 0, 0));
  }
  shell.add(at(cyl(0.05, 0.05, 1.0, trim, 6), 0, 1.95, -0.55, 0, 0, Math.PI / 2));
  shell.add(at(box(0.85, 0.5, 0.14, SEAT), 0, 0.85, -0.6, -0.15, 0, 0));
  shell.add(at(torus(0.18, 0.04, DARK, Math.PI * 2, 14), 0, 1.15, 0.38, -0.9, 0, 0));
  for (const s of [-1, 1]) shell.add(at(ball(0.12, mat('#fff4c2', { emissive: '#fff4c2', emissiveIntensity: 0.8 }), 8), s * 0.4, 0.75, 1.35));
  const exhausts = [new THREE.Vector3(0, 0.6, -1.25)];
  shell.add(at(cyl(0.12, 0.14, 0.5, CHROME, 8), 0, 0.6, -1.05, Math.PI / 2 - 0.4, 0, 0));
  return { shell, wheelR: 0.55, front: [0.85, 0.85], rear: [0.9, -0.85], seatY: 0.75, exhausts };
}

function truck(main: THREE.Material, trim: THREE.Material): BodyParts {
  const shell = new THREE.Group();
  shell.add(at(slab(1.7, 0.6, 2.6, 0.25, main), 0, 0.85, 0));
  shell.add(at(box(1.8, 0.18, 0.3, trim), 0, 0.9, 1.4));
  shell.add(at(box(1.8, 0.18, 0.3, trim), 0, 0.9, -1.4));
  for (const s of [-1, 1]) {
    shell.add(at(slab(0.35, 0.25, 1.0, 0.1, trim), s * 0.95, 1.2, 0.95));
    shell.add(at(slab(0.35, 0.25, 1.0, 0.1, trim), s * 0.95, 1.2, -0.95));
    shell.add(at(ball(0.11, mat('#fff4c2', { emissive: '#fff4c2', emissiveIntensity: 0.8 }), 8), s * 0.55, 1.15, 1.32));
  }
  shell.add(at(box(0.9, 0.55, 0.15, SEAT), 0, 1.4, -0.6, -0.15, 0, 0));
  shell.add(at(torus(0.2, 0.04, DARK, Math.PI * 2, 14), 0, 1.75, 0.42, -0.9, 0, 0));
  const exhausts = [new THREE.Vector3(-0.6, 1.9, -1.0), new THREE.Vector3(0.6, 1.9, -1.0)];
  for (const e of exhausts) shell.add(at(cyl(0.09, 0.09, 1.0, CHROME, 8), e.x, 1.0, e.z));
  return { shell, wheelR: 0.7, front: [0.98, 1.0], rear: [0.98, -1.0], seatY: 1.3, exhausts };
}

// ---------------------------------------------------------------- shield

const shieldMaterial = shareResource(new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#7fd8ff') } },
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
      float swirl = 0.5 + 0.5 * sin(vNormal.y * 8.0 + uTime * 3.0 + vNormal.x * 5.0);
      vec3 col = mix(uColor, vec3(1.0, 0.6, 1.0), swirl * 0.5);
      gl_FragColor = vec4(col * (rim * 1.4 + 0.06), 1.0);
    }`,
}));
export const shieldUniforms = shieldMaterial.uniforms;

// Shared by every kart, so never freed with one.
const shadowMaterial = shareResource(new THREE.MeshBasicMaterial({ map: tex.blob(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
const shadowGeometry = shareResource(new THREE.PlaneGeometry(3.4, 4.2).rotateX(-Math.PI / 2));
const ringGeometry = shareResource(new THREE.RingGeometry(1.55, 1.95, 32).rotateX(-Math.PI / 2));

function rocketBooster() {
  const g = new THREE.Group();
  const body = paintMat('#e8eaf0');
  g.add(at(cyl(0.38, 0.38, 1.6, body, 14), 0, 0, 0, Math.PI / 2, 0, 0));
  g.add(at(cone(0.38, 0.6, mat('#e63946', { shiny: 50 }), 14), 0, 0, 0.8, Math.PI / 2, 0, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(at(box(0.05, 0.5, 0.5, mat('#e63946')), Math.cos(a) * 0.45, Math.sin(a) * 0.45, -0.6, 0, 0, a));
  }
  g.position.set(0, 1.2, -1.2);
  g.visible = false;
  return g;
}

// ---------------------------------------------------------------- build

export function buildKart(character: { id: string; color: string; accent: string }, bodyId: string, player: { label: string; color: string } | null, tagLayer = 0): KartRig {
  const main = paintMat(character.color);
  const trim = paintMat(character.accent);
  const parts = bodyId === 'buggy' ? buggy(main, trim) : bodyId === 'truck' ? truck(main, trim) : racer(main, trim);

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const body = new THREE.Group();
  root.add(tilt);
  tilt.add(body);
  body.add(parts.shell);
  const d = at(driver(character.id, character.color, character.accent), 0, parts.seatY, -0.3);
  body.add(d);

  const wheels: THREE.Object3D[] = [];
  const front: THREE.Object3D[] = [];
  const rearWheels: THREE.Vector3[] = [];
  const r = parts.wheelR;
  for (const [x, z, isFront] of [
    [-parts.front[0], parts.front[1], true],
    [parts.front[0], parts.front[1], true],
    [-parts.rear[0], parts.rear[1], false],
    [parts.rear[0], parts.rear[1], false],
  ] as [number, number, boolean][]) {
    const holder = new THREE.Group();
    holder.position.set(x, r, z);
    const w = wheel(isFront ? r : r * 1.08, isFront ? 0.36 : 0.46, character.accent);
    holder.add(w);
    body.add(holder);
    wheels.push(w);
    if (isFront) front.push(holder);
    else rearWheels.push(new THREE.Vector3(x, 0.05, z));
  }
  const rocket = rocketBooster();
  body.add(rocket);
  // Everything that never moves relative to the body is merged, leaving the wheels and the rocket separate:
  // a kart goes from about forty draw calls to about fifteen.
  for (const f of body.children) if (f !== parts.shell && f !== d) f.userData.dynamic = true;
  body.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false;
  });
  const baked = bake(body, 'kart');
  body.clear();
  for (const c of [...baked.children]) body.add(c);
  // Everything that can glow during a Sugar Rush.
  const paint: THREE.MeshPhongMaterial[] = [];
  body.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshPhongMaterial | undefined;
    if (m && (o as THREE.Mesh).isMesh && m.isMeshPhongMaterial && !paint.includes(m)) paint.push(m);
  });

  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 16), shieldMaterial);
  shield.position.y = 1;
  shield.visible = false;
  root.add(shield);

  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.renderOrder = 1;

  let ring: THREE.Mesh | null = null;
  let tag: THREE.Sprite | null = null;
  if (player) {
    ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: player.color, transparent: true, opacity: 0.75, depthWrite: false }));
    ring.position.y = 0.08;
    root.add(ring);
    // The same size on screen however far away, so a tag never fills the view of the kart right behind.
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.tag(player.label, player.color), depthTest: false, transparent: true, sizeAttenuation: false }));
    tag.scale.set(0.075, 0.056, 1);
    tag.position.y = parts.seatY + 3.1;
    tag.renderOrder = 10;
    tag.layers.set(tagLayer);
    root.add(tag);
  }

  return {
    root, tilt, body, wheels, front, exhausts: parts.exhausts, rearWheels, shield, shadow, ring, tag, rocket,
    paint, wheelRadius: r,
  };
}

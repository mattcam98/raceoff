/**
 * Image-based lighting: a simple stand-in of each theme's room (walls, floor,
 * ceiling, a bright window where the sun comes from, a few lamps) is blurred
 * into an environment map. Every material picks up soft ambient light and
 * reflections that match the room, which is most of what makes plastic,
 * ceramic and paint read as real.
 */
import * as THREE from 'three';
import type { Theme } from './themes';

function panel(w: number, h: number, color: THREE.Color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  return m;
}

/** The environment for a theme; the caller frees the target when the track changes. */
export function environmentFor(renderer: THREE.WebGLRenderer, theme: Theme): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const c = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
  const night = !!theme.night;
  scene.background = c(theme.fog, night ? 0.08 : 0.32);
  const S = 20;
  // Floor and ceiling: light bouncing up off the floor is the colour of the floor.
  const floor = panel(S * 2, S * 2, c(theme.hemi.ground, night ? 0.06 : 0.28));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -S * 0.5;
  const ceiling = panel(S * 2, S * 2, c(theme.hemi.sky, night ? 0.06 : 0.5));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = S;
  scene.add(floor, ceiling);
  // The window or lamp the sun comes from: a big bright panel in its direction, so highlights line up.
  const sun = new THREE.Vector3(theme.sun.x, theme.sun.y, theme.sun.z).normalize();
  const win = panel(S * 0.9, S * 0.7, c(theme.sun.color, night ? 2.5 : 5));
  win.position.copy(sun).multiplyScalar(S * 0.95);
  win.lookAt(0, 0, 0);
  scene.add(win);
  // A softer second source opposite, as from a doorway or a second window.
  const fill = panel(S * 0.8, S * 0.5, c(theme.hemi.sky, night ? 0.6 : 1.2));
  fill.position.set(-sun.x * S * 0.95, S * 0.25, -sun.z * S * 0.95);
  fill.lookAt(0, 0, 0);
  scene.add(fill);
  if (night) {
    // Strip lights overhead.
    for (const x of [-8, 0, 8]) {
      const l = panel(6, 0.8, c('#fff6e0', 5));
      l.rotation.x = Math.PI / 2;
      l.position.set(x, S * 0.98, 0);
      scene.add(l);
    }
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return rt;
}

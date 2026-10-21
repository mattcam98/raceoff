/**
 * Household objects at kart scale. Each builder returns a model standing on
 * the ground at its origin, sized to match the footprint the physics uses
 * (packages/game/src/track/props.ts), so what you see is what you hit.
 */
import * as THREE from 'three';
import { at, ball, box, cone, cyl, decal, group, lathe, mat, scaled, slab, torus } from './kit';
import { tex } from './textures';

type Builder = (v?: string | number) => THREE.Object3D;

const CERAMIC = (c: string) => mat(c, { shiny: 60 });
const PLASTIC = (c: string) => mat(c, { shiny: 30 });
const METAL = mat('#c9ced6', { shiny: 90 });

const labels = new Map<string, THREE.Texture>();

function labelTex(text: string, bg: string, fg: string, w = 256, h = 256, sub = '') {
  const key = `${text}${bg}${fg}${sub}${w}`;
  const known = labels.get(key);
  if (known) return known;
  const c =document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.round(w * 0.2)}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
  g.fillText(text, w / 2, h * 0.38);
  if (sub) {
    g.font = `700 ${Math.round(w * 0.09)}px system-ui, sans-serif`;
    g.fillText(sub, w / 2, h * 0.58);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.name = key;
  labels.set(key, t);
  return t;
}

const once = <T,>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};
const cerealFront = once(() => labelTex('CRUNCH-O', '#ffcc33', '#d62828', 256, 256, 'honey loops'));
const cartonSide = once(() => labelTex('MILK', '#ffffff', '#2a6fdb', 256, 256, 'fresh & whole'));

// ---------------------------------------------------------------- kitchen

const kitchen: Record<string, Builder> = {
  bowl: (v) => {
    const g = group(lathe([[0.1, 0], [9, 0], [12, 2], [14.5, 6], [15.2, 8.5], [14.6, 8.6], [13.6, 6.2], [11, 2.6], [0.1, 1.2]], CERAMIC('#f4f1ea'), 40));
    g.add(at(torus(14.9, 0.45, CERAMIC('#3d7be0'), Math.PI * 2, 48), 0, 7.6, 0, Math.PI / 2));
    if (v === 'cereal') {
      g.add(at(cyl(13.4, 13.4, 0.2, mat('#fffaf0', { shiny: 80 }), 40), 0, 6.4, 0));
      const colors = ['#ff9f1c', '#ffd166', '#ef476f', '#8ac926'];
      for (let i = 0; i < 26; i++) {
        const a = i * 2.4;
        const r = 2 + ((i * 37) % 11);
        g.add(at(torus(0.9, 0.35, colors[i % 4], Math.PI * 2, 12), Math.cos(a) * r, 6.8, Math.sin(a) * r, Math.PI / 2 + (i % 3) * 0.3, 0, i));
      }
    }
    return g;
  },
  mug: (v) => {
    const color = typeof v === 'string' ? v : '#e76f51';
    const g = group(cyl(5, 4.6, 10, CERAMIC(color), 28), at(cyl(4.4, 4.4, 0.3, mat('#3b2416', { shiny: 80 }), 24), 0, 8.8, 0));
    g.add(at(torus(2.6, 0.7, CERAMIC(color), Math.PI * 2, 16), 5.2, 5, 0, 0, 0, 0));
    return g;
  },
  glass: (v) => {
    const juice = v === 'water' ? '#bfe6ff' : '#ffa62b';
    return group(
      at(cyl(4.2, 3.8, 9, mat(juice, { opacity: 0.85, shiny: 60 }), 24), 0, 0.3, 0),
      cyl(4.5, 4.1, 13, mat('#dff4ff', { opacity: 0.3, shiny: 120 }), 24),
    );
  },
  cereal: () => {
    const side = mat('#ffcc33');
    const front = mat('#ffffff', { map: cerealFront() });
    const g = group(box(28, 40, 10, [side, side, mat('#f4b400'), side, front, front]));
    return g;
  },
  carton: () => {
    const side = mat('#ffffff', { map: cartonSide() });
    const g = group(box(11, 18, 11, [side, side, mat('#ffffff'), mat('#ffffff'), side, side]));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 7.8, 5, 4, 1), mat('#2a6fdb'));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 20.5;
    roof.scale.set(1, 1, 0.99);
    roof.castShadow = true;
    g.add(roof);
    return g;
  },
  butter: () => group(slab(14, 1.4, 9, 2, CERAMIC('#ffffff')), at(box(9, 4, 5.5, mat('#ffe58a')), 0, 1.4, 0)),
  shaker: (v) => {
    const c = v === 'pepper' ? '#2d2d33' : '#ffffff';
    return group(cyl(2.4, 2.6, 6, mat(c, { opacity: 0.9, shiny: 60 }), 16), at(cyl(2.5, 2.5, 1.6, METAL, 16), 0, 6, 0), at(ball(1.2, METAL, 10), 0, 7.6, 0));
  },
  jar: (v) => {
    const c = v === 'honey' ? '#f2a516' : '#b3122e';
    return group(cyl(4.8, 4.8, 9, mat(c, { shiny: 70, opacity: 0.92 }), 24), at(cyl(5, 5, 1.8, mat('#e0e0e0', { shiny: 40 }), 24), 0, 9, 0), at(cyl(5.02, 5.02, 3, mat('#fff3d6'), 24), 0, 3, 0));
  },
  apple: () => group(at(scaled(ball(4.5, CERAMIC('#d62828'), 20), 1, 0.92, 1), 0, 4.1, 0), at(cyl(0.3, 0.3, 2, '#6b4226', 6), 0, 7.6, 0), at(scaled(ball(1, '#3a8f3a', 8), 1.6, 0.3, 0.8), 1.4, 9, 0, 0, 0, 0.5)),
  orange: () => group(at(ball(4.5, CERAMIC('#ff8c1a'), 20), 0, 4.4, 0), at(scaled(ball(0.8, '#3a8f3a', 8), 1.5, 0.4, 0.8), 0.6, 8.8, 0)),
  teapot: () => {
    const c = CERAMIC('#5fb8c9');
    const g = group(lathe([[0.1, 0], [6, 0], [8.6, 3], [9, 6], [7.6, 10], [4, 11.6], [0.1, 11.8]], c, 32));
    g.add(at(cyl(0.8, 1.6, 9, c, 10), 8, 4, 0, 0, 0, -0.9));
    g.add(at(torus(3.2, 0.8, c, Math.PI * 1.2, 16), -8.6, 6.5, 0, 0, 0, Math.PI * 0.4));
    g.add(at(ball(1.5, c, 12), 0, 12.4, 0));
    return g;
  },
  toaster: () => {
    const g = group(slab(24, 14, 14, 3.5, mat('#d9dde4', { shiny: 110 })));
    g.add(at(box(16, 0.4, 2.2, '#222'), 0, 14, -3));
    g.add(at(box(16, 0.4, 2.2, '#222'), 0, 14, 3));
    g.add(at(box(14, 6, 1.6, mat('#d6a15a', { map: tex.toast() })), 0, 11.5, -3));
    g.add(at(box(2, 2, 2, '#333'), 12.6, 7, 0));
    return g;
  },
  sugar: () => box(3.2, 3.2, 3.2, mat('#fbfbfb', { shiny: 20 })),
  plate: () => group(lathe([[0.1, 0], [10, 0], [12.5, 0.8], [14, 1.4], [13.6, 1.5], [10, 0.7], [0.1, 0.6]], CERAMIC('#ffffff'), 40),
    at(scaled(ball(4, '#ffffff', 14), 1, 0.18, 1), -3, 0.8, 1), at(scaled(ball(1.8, '#ffc300', 12), 1, 0.5, 1), -3, 1.3, 1),
    at(box(10, 0.6, 2.4, '#b5452a'), 4, 0.8, -3, 0, 0.3, 0), at(box(10, 0.6, 2.4, '#c8553a'), 4.5, 0.8, 0.5, 0, 0.1, 0)),
  spoon: () => group(at(box(1.2, 0.4, 18, METAL), 0, 0.2, 0), at(scaled(ball(2.4, METAL, 12), 1, 0.25, 1.4), 0, 0.4, 10)),
  fork: () => group(at(box(1.2, 0.4, 16, METAL), 0, 0.2, 0), ...[-1.2, -0.4, 0.4, 1.2].map((x) => at(box(0.4, 0.4, 6, METAL), x, 0.2, 10.5))),
  knife: () => group(at(box(1.6, 0.6, 9, '#3b3b44'), 0, 0.3, -6), at(box(2.4, 0.3, 14, METAL), 0, 0.15, 5)),
  napkin: () => slab(22, 1, 22, 1, mat('#ffd23f')),
  toast: () => box(13, 1.4, 13, mat('#ffffff', { map: tex.toast() })),
};

// ---------------------------------------------------------------- desk

const BOOK_COLORS = ['#3d5a80', '#ee6c4d', '#2a9d8f', '#8d5bc1', '#e9c46a', '#d62828'];
const desk: Record<string, Builder> = {
  books: (v) => {
    const g = new THREE.Group();
    const n = typeof v === 'number' ? v : 3;
    for (let i = 0; i < n; i++) {
      const color = BOOK_COLORS[(i * 2 + n) % BOOK_COLORS.length];
      const b = box(28, 3.4, 20, [mat(color), mat(color), mat(color), mat(color), mat('#ffffff', { map: tex.book(color) }), mat('#ffffff', { map: tex.book(color) })]);
      b.position.y = i * 3.4;
      b.rotation.y = (i % 2 ? 0.06 : -0.04) * i;
      g.add(b);
    }
    return g;
  },
  pencilcup: () => {
    const g = group(cyl(5, 4.6, 11, PLASTIC('#2a9d8f'), 20));
    const colors = ['#ffd23f', '#ef476f', '#3d9bff', '#8ac926'];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const p = group(cyl(0.6, 0.6, 16, colors[i % 4], 6), at(cone(0.6, 1.6, '#f5d6a8', 6), 0, 16, 0));
      g.add(at(p, Math.cos(a) * 2, 2, Math.sin(a) * 2, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25));
    }
    return g;
  },
  lamp: () => {
    const c = PLASTIC('#ff6b6b');
    const g = group(cyl(7, 7, 1.6, c, 24));
    g.add(at(cyl(0.7, 0.7, 22, METAL, 8), 0, 1, 0, 0, 0, 0.3));
    g.add(at(cyl(0.7, 0.7, 18, METAL, 8), -6.5, 21.5, 0, 0, 0, -1.1));
    const head = group(at(cone(5, 7, c, 20), 0, 0, 0, Math.PI, 0, 0), at(ball(2.2, mat('#fff7cc', { emissive: '#fff2a8', emissiveIntensity: 1.2 }), 12), 0, -6, 0));
    g.add(at(head, 9, 29, 0, 0, 0, 0.5));
    return g;
  },
  mouse: () => group(at(scaled(ball(3.5, PLASTIC('#e6e8ee'), 18), 1, 0.5, 1.55), 0, 0.2, 0), at(box(0.3, 0.3, 3, '#999'), 0, 1.7, 2.5)),
  eraser: (v) => slab(6, 2.6, 12, 1, mat(typeof v === 'string' ? v : '#ff8fab')),
  globe: () => {
    const g = group(cyl(4, 5, 1.5, PLASTIC('#2b2d42'), 20), at(cyl(0.6, 0.6, 6, METAL, 8), 0, 1.5, 0));
    const earth = at(ball(8, CERAMIC('#3a86ff'), 24), 0, 14, 0);
    g.add(earth);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      g.add(at(scaled(ball(3, '#5cb85c', 10), 1, 0.5, 1), Math.cos(a) * 6.5, 14 + Math.sin(i * 2.3) * 4, Math.sin(a) * 6.5, 0, -a, Math.PI / 2));
    }
    g.add(at(torus(9, 0.4, METAL, Math.PI, 24), 0, 14, 0, 0, Math.PI / 2, 0.3));
    return g;
  },
  plant: () => {
    const g = group(cyl(7, 5.5, 9, CERAMIC('#e07a5f'), 20), at(cyl(6.4, 6.4, 0.4, '#5c3d2e', 20), 0, 8.4, 0));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.add(at(scaled(ball(3, '#4caf50', 10), 0.6, 2.4, 0.3), Math.cos(a) * 2.5, 13, Math.sin(a) * 2.5, Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5));
    }
    return g;
  },
  calculator: () => {
    const g = group(slab(14, 1.8, 20, 1.5, PLASTIC('#3a3f51')));
    g.add(at(box(11, 0.4, 5, mat('#a8c69f', { emissive: '#3a5a33', emissiveIntensity: 0.4 })), 0, 1.8, -6));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.add(at(box(2.2, 0.6, 2.2, c === 3 ? '#ff9f1c' : '#e0e3ea'), -4.5 + c * 3, 1.8, -0.5 + r * 3));
    return g;
  },
  pencil: (v) => {
    const c = typeof v === 'string' ? v : '#ffcc00';
    const p = group(at(cyl(0.9, 0.9, 30, mat(c, { flat: true }), 6), 0, 0, 0), at(cone(0.9, 4, '#f3d2a2', 6), 0, 30, 0), at(cone(0.3, 4.1, '#333', 6), 0, 30, 0), at(cyl(0.92, 0.92, 2.4, '#ff8fab', 6), 0, -2.4, 0), at(cyl(0.95, 0.95, 1.2, METAL, 6), 0, -0.6, 0));
    return at(group(p), 0, 0.9, 0, Math.PI / 2, 0, 0);
  },
  ruler: () => box(6, 0.6, 60, mat('#ffe082', { opacity: 0.85 })),
  notepad: () => box(30, 1.2, 40, [mat('#fff'), mat('#fff'), mat('#ffffff', { map: tex.paper() }), mat('#fff'), mat('#fff'), mat('#fff')]),
  laptop: () => {
    const c = mat('#b8bec9', { shiny: 80 });
    const g = group(slab(64, 2, 44, 3, c));
    g.add(at(box(56, 0.4, 20, '#2b2f3a'), 0, 2, -6));
    const lid = group(at(slab(64, 2, 44, 3, c), 0, 0, 0), at(box(58, 0.3, 38, mat('#1d3557', { emissive: '#3d7be0', emissiveIntensity: 0.5 })), 0, 2.05, 0));
    g.add(at(lid, 0, 2, -22, -1.85, 0, 0));
    return g;
  },
  paperclip: () => at(scaled(torus(3, 0.25, METAL, Math.PI * 2, 20), 1, 2.2, 1), 0, 0.3, 0, Math.PI / 2, 0, 0),
  stickies: (v) => box(9, 2, 9, mat(typeof v === 'string' ? v : '#fff176')),
};

// ---------------------------------------------------------------- bathroom

const bath: Record<string, Builder> = {
  soap: (v) => slab(10, 3.5, 7, 3, mat(typeof v === 'string' ? v : '#ffb3c6', { shiny: 50 })),
  duck: (v) => {
    const c = typeof v === 'string' ? v : '#ffd23f';
    const g = group(at(scaled(ball(3.2, PLASTIC(c), 18), 1.15, 0.85, 1), 0, 2.6, 0), at(ball(2, PLASTIC(c), 16), 0, 6, 1.6));
    g.add(at(scaled(ball(1, PLASTIC('#ff8a1f'), 10), 1.2, 0.5, 1.4), 0, 5.8, 3.6));
    g.add(at(ball(0.4, '#111', 8), 0.9, 6.6, 3.1), at(ball(0.4, '#111', 8), -0.9, 6.6, 3.1));
    return g;
  },
  bottle: (v) => {
    const c = typeof v === 'string' ? v : '#7b2cbf';
    return group(slab(7.6, 14, 5, 2.4, PLASTIC(c)), at(cyl(1.2, 1.4, 2.6, '#f1f1f1', 12), 0, 14, 0), at(box(5, 5, 0.3, '#ffffff'), 0, 4, 2.6));
  },
  cup: () => {
    const g = group(cyl(3.4, 3, 9, mat('#a0e7e5', { shiny: 60, opacity: 0.9 }), 18));
    const cols = ['#ff595e', '#1982c4'];
    cols.forEach((c, i) => g.add(at(group(cyl(0.5, 0.5, 15, PLASTIC(c), 8), at(box(1.2, 2.6, 1.2, '#ffffff'), 0, 15, 0.3)), i ? 1 : -1, 1, 0, 0, 0, i ? -0.2 : 0.2)));
    return g;
  },
  roll: () => group(cyl(5.2, 5.2, 9, mat('#ffffff'), 24), at(cyl(1.8, 1.8, 9.05, '#c8a27a', 16), 0, 0, 0)),
  sponge: (v) => group(box(12, 3, 8, mat(typeof v === 'string' ? v : '#ffe66d')), at(box(12, 1.2, 8, '#2ec27e'), 0, 3, 0)),
  towel: (v) => slab(30, 2, 20, 2, mat(typeof v === 'string' ? v : '#7fc8f8')),
  bathmat: () => slab(60, 0.8, 36, 6, mat('#ffffff', { map: tex.stripes('#9ee1ff', '#ffffff', 10) })),
};

// ---------------------------------------------------------------- garden

const garden: Record<string, Builder> = {
  castle: () => {
    const sand = mat('#e8c27a', { flat: true });
    const g = group(cyl(13, 13, 8, sand, 10));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const tower = group(cyl(4, 4.6, 16, sand, 8));
      for (let k = 0; k < 6; k++) tower.add(at(box(1.4, 1.6, 1.4, sand), Math.cos((k / 6) * 6.28) * 3.6, 16, Math.sin((k / 6) * 6.28) * 3.6));
      g.add(at(tower, Math.cos(a) * 10, 0, Math.sin(a) * 10));
    }
    g.add(at(cyl(5, 6, 22, sand, 10), 0, 0, 0));
    g.add(at(cyl(0.3, 0.3, 10, '#8d6e63', 6), 0, 22, 0));
    g.add(at(box(0.2, 3, 5, '#ff4d6d'), 0, 29, 2.5));
    return g;
  },
  bucket: (v) => {
    const c = typeof v === 'string' ? v : '#3d9bff';
    const g = group(lathe([[0.1, 0], [5, 0], [6.5, 12], [6.2, 12], [4.6, 0.6], [0.1, 0.6]], PLASTIC(c), 28));
    g.add(at(torus(6.4, 0.3, PLASTIC(c), Math.PI, 20), 0, 12, 0, 0, 0, 0));
    return g;
  },
  gnome: () => {
    const g = group(cone(3.8, 7, PLASTIC('#3d5a80'), 16), at(ball(2.2, '#ffcfa8', 14), 0, 8, 0), at(cone(2.4, 6, PLASTIC('#e63946'), 14), 0, 9.2, 0));
    g.add(at(scaled(cone(2, 4, '#ffffff', 12), 1, 1, 0.6), 0, 4.2, 1.2, Math.PI, 0, 0));
    g.add(at(ball(0.7, '#ff8f8f', 8), 0, 8, 2.1));
    return g;
  },
  pot: (v) => {
    const g = group(lathe([[0.1, 0], [4.4, 0], [6, 9], [6.6, 9], [6.6, 10.6], [0.1, 10.6]], mat('#c8643b', { flat: true }), 20));
    const c = typeof v === 'string' ? v : '#ff5d8f';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const f = group(cyl(0.3, 0.3, 8, '#3f8f3f', 6), at(ball(1.8, c, 10), 0, 8.5, 0), at(ball(0.8, '#ffd23f', 8), 0, 8.8, 1.2));
      g.add(at(f, Math.cos(a) * 2.8, 10, Math.sin(a) * 2.8, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3));
    }
    return g;
  },
  stone: (v) => at(scaled(new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 0), mat(typeof v === 'string' ? v : '#9a9a9a', { flat: true })), 1, 0.7, 1), 0, 1.8, 0),
  can: () => {
    const c = PLASTIC('#2ec27e');
    const g = group(cyl(5.5, 6, 10, c, 20));
    g.add(at(cyl(0.8, 1.4, 12, c, 8), 7, 5, 0, 0, 0, -0.9));
    g.add(at(torus(4, 0.7, c, Math.PI, 14), -1, 10, 0, 0, 0, 0));
    return g;
  },
  mushroom: () => group(cyl(1.4, 1.8, 4, '#f5f0e1', 12), at(scaled(ball(3.4, CERAMIC('#e63946'), 16), 1, 0.6, 1), 0, 4.4, 0),
    ...[0, 1.6, 3.2, 4.8].map((a) => at(ball(0.6, '#ffffff', 6), Math.cos(a) * 2.4, 5.6, Math.sin(a) * 2.4))),
  flower: (v) => {
    const c = typeof v === 'string' ? v : '#ff70a6';
    const g = group(cyl(0.6, 0.8, 34, '#3f8f3f', 8));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(at(scaled(ball(3, c, 10), 1, 0.3, 0.55), Math.cos(a) * 3.4, 34, Math.sin(a) * 3.4, 0, -a, 0));
    }
    g.add(at(ball(2.2, '#ffd23f', 12), 0, 34.4, 0));
    g.add(at(scaled(ball(3, '#4caf50', 8), 1.4, 0.2, 0.6), 2.6, 14, 0, 0, 0, 0.4));
    return g;
  },
  spade: () => group(at(box(1.4, 1.4, 22, PLASTIC('#ff9f1c')), 0, 0.7, 0), at(slab(9, 0.8, 9, 2, PLASTIC('#ff9f1c')), 0, 0.2, 14)),
  hose: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) g.add(at(torus(10 + i * 2.2, 1, PLASTIC('#2ec27e'), Math.PI * 2, 36), 0, 1 + i * 0.4, 0, Math.PI / 2, 0, 0));
    return g;
  },
  fence: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) g.add(at(box(6, 40, 1.5, mat('#f1e3c8', { flat: true })), i * 7 - 17.5, 0, 0));
    g.add(at(box(44, 3, 1, '#e3d1ad'), 0, 10, -1.2), at(box(44, 3, 1, '#e3d1ad'), 0, 30, -1.2));
    return g;
  },
  tree: () => group(cyl(6, 9, 60, mat('#7a5230', { flat: true }), 8), at(ball(32, mat('#4c9a37', { flat: true }), 8), 0, 78, 0), at(ball(24, mat('#5fae45', { flat: true }), 8), 18, 64, 10)),
};

// ---------------------------------------------------------------- playroom

const LETTERS = 'ABCDEFGHJKLMNOPRSTUVWXYZ';
const BLOCK_COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f77f00'];
const blockFace = (letter: string, color: string) => labelTex(letter, color, '#ffffff', 128, 128);
const toys: Record<string, Builder> = {
  block: (v) => {
    const i = typeof v === 'number' ? v : 0;
    const color = BLOCK_COLORS[i % BLOCK_COLORS.length];
    const face = mat('#ffffff', { map: blockFace(LETTERS[i % LETTERS.length], color) });
    return box(6, 6, 6, [face, face, mat(color), mat(color), face, face]);
  },
  bigblock: (v) => {
    const i = typeof v === 'number' ? v : 0;
    const color = BLOCK_COLORS[(i + 2) % BLOCK_COLORS.length];
    const face = mat('#ffffff', { map: blockFace(LETTERS[(i * 3) % LETTERS.length], color) });
    return box(10, 10, 10, [face, face, mat(color), mat(color), face, face]);
  },
  teddy: () => {
    const fur = mat('#b5835a');
    const light = mat('#e8c39e');
    const g = group(at(scaled(ball(7, fur, 18), 1, 1.1, 0.9), 0, 7, 0), at(ball(5.2, fur, 18), 0, 17, 0));
    g.add(at(ball(2, fur, 10), 3.8, 21, 0), at(ball(2, fur, 10), -3.8, 21, 0));
    g.add(at(scaled(ball(2.2, light, 12), 1.1, 0.8, 1), 0, 16, 4.4), at(ball(0.8, '#2b1b10', 8), 0, 16.8, 6.4));
    g.add(at(ball(0.6, '#111', 8), 1.8, 18.4, 4.4), at(ball(0.6, '#111', 8), -1.8, 18.4, 4.4));
    for (const s of [-1, 1]) {
      g.add(at(scaled(ball(2.6, fur, 10), 1, 1, 1.6), s * 5.5, 2.6, 4));
      g.add(at(scaled(ball(2.4, fur, 10), 1, 1.6, 1), s * 7, 9, 1.5, 0, 0, s * 0.5));
    }
    g.add(at(torus(3.6, 0.6, '#e63946', Math.PI * 2, 16), 0, 12.6, 0, Math.PI / 2, 0, 0));
    return g;
  },
  toyball: () => {
    const t = tex.stripes('#ef476f', '#ffd166', 6);
    return at(ball(6, mat('#ffffff', { map: t, shiny: 60 }), 22), 0, 6, 0);
  },
  rings: () => {
    const g = group(cyl(5, 5, 1.6, PLASTIC('#8d5bc1'), 20), at(cyl(0.9, 0.9, 16, PLASTIC('#ffd166'), 10), 0, 1.6, 0));
    const cols = ['#ef476f', '#f77f00', '#ffd166', '#06d6a0', '#118ab2'];
    cols.forEach((c, i) => g.add(at(torus(4.4 - i * 0.6, 1.3, PLASTIC(c), Math.PI * 2, 20), 0, 3 + i * 2.6, 0, Math.PI / 2, 0, 0)));
    g.add(at(ball(1.8, PLASTIC('#ef476f'), 12), 0, 17.6, 0));
    return g;
  },
  cube: () => {
    const g = new THREE.Group();
    const cols = ['#ffffff', '#ffd500', '#c41e3a', '#ff5800', '#0051ba', '#009e60'];
    g.add(box(10, 10, 10, '#111'));
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++) {
        g.add(at(box(2.9, 2.9, 0.2, mat(cols[(x + y) % 6], { shiny: 60 })), -3.2 + x * 3.2, 0.2 + y * 3.2, 5));
        g.add(at(box(0.2, 2.9, 2.9, mat(cols[(x + y + 2) % 6], { shiny: 60 })), 5, 0.2 + y * 3.2, -3.2 + x * 3.2));
        g.add(at(box(2.9, 0.2, 2.9, mat(cols[(x * 2 + y + 4) % 6], { shiny: 60 })), -3.2 + x * 3.2, 10, -3.2 + y * 3.2));
      }
    return g;
  },
  fort: () => {
    const wall = mat('#9db4c0', { flat: true });
    const g = group(box(36, 12, 24, wall));
    for (const [x, z] of [[-18, -12], [18, -12], [-18, 12], [18, 12]]) {
      g.add(at(cyl(4, 4, 20, wall, 8), x, 0, z), at(cone(5, 7, mat('#e63946', { flat: true }), 8), x, 20, z));
    }
    for (let i = 0; i < 9; i++) g.add(at(box(2.2, 2.4, 2.2, wall), -16 + i * 4, 12, -12), at(box(2.2, 2.4, 2.2, wall), -16 + i * 4, 12, 12));
    g.add(at(box(9, 9, 0.4, '#5c3d2e'), 0, 0, 12.1));
    return g;
  },
  crayon: (v) => {
    const c = typeof v === 'string' ? v : '#ef476f';
    return at(group(cyl(1.1, 1.1, 16, mat(c), 10), at(cone(1.1, 3, mat(c), 10), 0, 16, 0), at(cyl(1.15, 1.15, 10, mat('#ffffff', { map: tex.stripes(c, '#ffffff', 4) }), 10), 0, 3, 0)), 0, 1.1, 0, Math.PI / 2, 0, 0);
  },
  toycar: (v) => {
    const c = typeof v === 'string' ? v : '#3d9bff';
    const g = group(at(slab(8, 3, 16, 2, PLASTIC(c)), 0, 1.6, 0), at(slab(7, 3, 8, 2, mat('#bde0fe', { opacity: 0.8 })), 0, 4.6, -1));
    for (const [x, z] of [[-4, -5], [4, -5], [-4, 5], [4, 5]]) g.add(at(cyl(2, 2, 1.4, '#222', 12), x, 2, z, 0, 0, Math.PI / 2));
    return g;
  },
  dominoes: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) g.add(at(box(5, 10, 1.6, mat('#1b1b1f', { shiny: 40 })), i * 4, 0, 0, 0, 0, i === 5 ? 0.5 : 0));
    return g;
  },
};

// ---------------------------------------------------------------- garage

const garage: Record<string, Builder> = {
  toolbox: () => {
    const red = mat('#d62828', { shiny: 50 });
    const g = group(box(26, 12, 14, red));
    g.add(at(box(26.4, 1, 14.4, '#a4161a'), 0, 6, 0));
    g.add(at(box(2, 4, 2, METAL), -7, 12, 0), at(box(2, 4, 2, METAL), 7, 12, 0), at(box(16, 1.2, 2, METAL), 0, 15.5, 0));
    return g;
  },
  tire: (v) => {
    const g = new THREE.Group();
    const n = typeof v === 'number' ? v : 1;
    for (let i = 0; i < n; i++) g.add(at(torus(4.4, 2.1, mat('#22232a', { shiny: 10 }), Math.PI * 2, 24), 0, 2.1 + i * 4.2, 0, Math.PI / 2, 0, 0));
    return g;
  },
  paint: (v) => {
    const c = typeof v === 'string' ? v : '#3d9bff';
    const g = group(cyl(4.5, 4.5, 9, METAL, 24), at(cyl(4.55, 4.55, 5, mat('#ffffff', { map: tex.label('PAINT', c, '#ffffff', 256, 64) }), 24), 0, 2, 0));
    g.add(at(cyl(4.6, 4.6, 0.6, mat(c), 24), 0, 9, 0));
    g.add(at(box(1, 4, 0.5, mat(c)), 4.4, 6, 0));
    return g;
  },
  drum: (v) => {
    const c = typeof v === 'string' ? v : '#2a9d8f';
    const g = group(cyl(6, 6, 18, mat(c, { shiny: 30 }), 24));
    for (const y of [4, 9, 14]) g.add(at(torus(6.05, 0.35, mat(c, { shiny: 30 }), Math.PI * 2, 28), 0, y, 0, Math.PI / 2, 0, 0));
    return g;
  },
  cone: () => group(box(5.2, 0.6, 5.2, '#ff6b00'), cone(2.1, 9, PLASTIC('#ff6b00'), 16), at(cyl(1.15, 1.45, 1.6, '#ffffff', 16), 0, 4.2, 0)),
  battery: () => group(cyl(2.6, 2.6, 13, PLASTIC('#222222'), 18), at(cyl(2.62, 2.62, 4, PLASTIC('#c58b2c'), 18), 0, 9, 0), at(cyl(0.9, 0.9, 1, METAL, 10), 0, 13, 0)),
  crate: () => {
    const wood = mat('#ffffff', { map: tex.wood('#c79a5d', '#8a6233', 4) });
    const g = group(box(16, 14, 16, wood));
    for (const z of [-8.05, 8.05]) g.add(at(box(16, 2, 0.4, '#8a6233'), 0, 6, z, 0, 0, 0.7));
    return g;
  },
  wrench: () => group(at(box(3, 1, 30, METAL), 0, 0.5, 0), at(torus(3, 1, METAL, Math.PI * 1.6, 16), 0, 0.8, 16, Math.PI / 2, 0, 0)),
  screwdriver: () => group(at(cyl(1.6, 1.6, 10, PLASTIC('#ffd23f'), 10), 0, 1.6, 0, Math.PI / 2, 0, 0), at(cyl(0.5, 0.5, 14, METAL, 8), 0, 1.6, 10, Math.PI / 2, 0, 0)),
  shelf: () => {
    const wood = mat('#ffffff', { map: tex.wood('#a3774a', '#6e4b2a', 2) });
    const g = new THREE.Group();
    for (const y of [0, 30, 60, 90]) g.add(at(box(90, 3, 30, wood), 0, y, 0));
    for (const x of [-44, 44]) g.add(at(box(3, 93, 30, wood), x, 0, 0));
    return g;
  },
};

// ---------------------------------------------------------------- table furniture

const room: Record<string, Builder> = {
  chair: () => {
    const wood = mat('#ffffff', { map: tex.wood('#a26b3c', '#6b3e1e', 3) });
    const g = group(at(box(60, 5, 60, wood), 0, 60, 0));
    for (const [x, z] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) g.add(at(box(5, 60, 5, wood), x, 0, z));
    g.add(at(box(60, 70, 5, wood), 0, 65, -28));
    return g;
  },
  window: () => {
    const g = group(box(160, 120, 4, '#f5f5f5'));
    g.add(at(box(150, 110, 2, mat('#bfe3ff', { emissive: '#bfe3ff', emissiveIntensity: 0.9 })), 0, 5, 2));
    g.add(at(box(4, 110, 3, '#f5f5f5'), 0, 5, 3), at(box(150, 4, 3, '#f5f5f5'), 0, 58, 3));
    return g;
  },
};

// ---------------------------------------------------------------- big set pieces

/** An oval wall: the rim of a bathtub, sized to the water inside it. */
function ovalRim(rx: number, rz: number, thick: number, h: number, m: THREE.Material) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx + thick, rz + thick, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, rx, rz, 0, Math.PI * 2, true, 0);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2, curveSegments: 64 });
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

const sets: Record<string, Builder> = {
  tub: () => {
    const g = new THREE.Group();
    g.add(ovalRim(72, 52, 3, 1.4, CERAMIC('#ffffff')));
    // Chrome taps at the far end.
    g.add(at(cyl(1.2, 1.2, 8, METAL, 12), 0, 0, -58), at(cyl(0.8, 0.8, 6, METAL, 10), 0, 7.4, -55.5, Math.PI / 2, 0, 0));
    g.add(at(cyl(1.6, 1.6, 1.2, mat('#e63946', { shiny: 60 }), 12), -5, 7.5, -58), at(cyl(1.6, 1.6, 1.2, mat('#3d9bff', { shiny: 60 }), 12), 5, 7.5, -58));
    // Bubbles floating on the water.
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39;
      const r = 12 + ((i * 41) % 40);
      g.add(at(ball(1 + (i % 4) * 0.7, mat('#ffffff', { opacity: 0.75, shiny: 90 }), 10), Math.cos(a) * r * 1.2, 0.5, Math.sin(a) * r * 0.85));
    }
    return g;
  },
  gate: () => {
    const wall = mat('#9db4c0', { flat: true });
    const roof = mat('#e63946', { flat: true });
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      g.add(at(box(26, 12, 3, wall), 0, 0, side * 8));
      for (let i = 0; i < 6; i++) g.add(at(box(2.4, 2.4, 3.2, wall), -11 + i * 4.4, 12, side * 8));
      for (const end of [-1, 1]) g.add(at(cyl(3.6, 3.6, 18, wall, 8), end * 14, 0, side * 8), at(cone(4.4, 7, roof, 8), end * 14, 18, side * 8));
    }
    // The arch over the road, with a flag.
    g.add(at(box(4, 3, 19, wall), 0, 12, 0));
    g.add(at(cyl(0.3, 0.3, 9, '#8d6e63', 6), 0, 15, 0), at(box(0.2, 3, 5, mat('#ffd166')), 0, 21, 2.5));
    return g;
  },
  bench: () => {
    const wood = mat('#ffffff', { map: tex.wood('#b5835a', '#7a5130', 3) });
    const legs = mat('#3a3f51', { shiny: 40 });
    const g = group(at(box(92, 4, 30, wood), 0, 34, 0));
    for (const [x, z] of [[-43, -13], [43, -13], [-43, 13], [43, 13]]) g.add(at(box(3, 34, 3, legs), x, 0, z));
    g.add(at(box(86, 2, 2, legs), 0, 10, -13), at(box(86, 2, 2, legs), 0, 10, 13));
    // A vice on the edge and some tools on top.
    g.add(at(box(8, 6, 8, mat('#3d9bff', { shiny: 50 })), 36, 38, 10));
    g.add(at(box(3, 2, 20, METAL), -10, 38, 0, 0, 0.4, 0), at(cyl(3, 3, 5, mat('#ffd23f'), 12), 20, 38, -6));
    return g;
  },
};

const LIBRARY: Record<string, Builder> = { ...kitchen, ...desk, ...bath, ...garden, ...toys, ...garage, ...room, ...sets };

/** Build a prop by kind. Unknown kinds become a small magenta cube so they show up in testing. */
export function buildProp(kind: string, v?: string | number): THREE.Object3D {
  const b = LIBRARY[kind];
  if (!b) return box(4, 4, 4, '#ff00ff');
  return b(v);
}

export function hasProp(kind: string) {
  return kind in LIBRARY;
}

export { decal };

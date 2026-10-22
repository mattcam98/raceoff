/**
 * The breakfast table and the kitchen around it. Table-top props are in world units at kart scale (a kart
 * is about 2.6 long); each stands on y = 0 at its origin and fills the footprint in
 * packages/game/src/track/props.ts. Room pieces (chair, window, counter, fridge) are at room scale, about
 * 0.5 cm to the unit, the table top being 158 above the room's floor.
 */
import * as THREE from 'three';
import { at, group } from './kit';
import { type Builder, chrome, cloth, extrude, glass, glaze, matte, mesh, plastic, printed, rbox, rubber, satin, steel, sweep, topUV, turn, v3, BRASS } from './propKit';
import {
  appleSkin, bacon, badgeTex, butcherBlock, butterFoil, cartonTex, cell, cerealBox, CH, crumbBumps, curtainTex, CW, dots, fridgeArt, jarLabel, latte, napkinTex,
  orangeSlice, peel, peelBumps, subway, subwayBumps, sugarBumps, sugarTex, toastTex, weave, windowView,
} from './propKitchenTex';
import { tex } from './textures';

// ---------------------------------------------------------------- shared pieces

/** Clear glass: a lathe with an outer and an inner wall and a thick base. */
function tumbler(rBase: number, rTop: number, h: number, wall: number, base: number) {
  const prof: [number, number][] = [
    [0, 0],
    [rBase - 0.3, 0],
    [rBase, 0.25],
    [rTop, h - 0.15],
    [rTop - wall * 0.5, h],
    [rTop - wall, h - 0.15],
    [rBase - wall, base + 0.3],
    [rBase - wall - 0.4, base],
    [0, base],
  ];
  const m = turn(prof, glass(), 48);
  m.renderOrder = 3;
  return m;
}

/** A slice of bread, 14 x 13.6, as an outline in x/y: square bottom, domed top. */
const BREAD = (() => {
  const s = new THREE.Shape();
  s.moveTo(-5.6, -6.6);
  s.lineTo(5.6, -6.6);
  s.quadraticCurveTo(6.1, -6.6, 6.05, -6.0);
  s.lineTo(5.8, 2.2);
  s.bezierCurveTo(7.6, 3.1, 7.2, 6.6, 3.6, 6.4);
  s.quadraticCurveTo(0, 7.4, -3.6, 6.4);
  s.bezierCurveTo(-7.2, 6.6, -7.6, 3.1, -5.8, 2.2);
  s.lineTo(-6.05, -6.0);
  s.quadraticCurveTo(-6.1, -6.6, -5.6, -6.6);
  return s;
})();
const BREAD_SIZE = 16;

/** A slice of toast lying flat, `t` thick: crumb on the faces, crust round the edge. */
function toastSlice(t = 1.4) {
  const m = extrude(BREAD, t, 0.35, printed(toastTex(BREAD.getPoints(16), BREAD_SIZE), { rough: 0.8, normalMap: crumbBumps(), normalScale: 0.6 }), { lie: true, curve: 16 });
  const pos = m.geometry.attributes.position;
  const nor = m.geometry.attributes.normal;
  const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.6) uv.setXY(i, 0.5 * (x / BREAD_SIZE + 0.5), 0.5 - z / BREAD_SIZE);
    else uv.setXY(i, 0.55 + 0.4 * (((x + z) / 30 + 10) % 1), 0.1 + 0.8 * (pos.getY(i) / t));
  }
  return m;
}

/** A spoon lying on its back, 23 long, bowl towards +z. */
function spoon() {
  const s = new THREE.Shape();
  s.moveTo(-1.05, 10);
  s.quadraticCurveTo(-1.2, 11.4, 0, 11.4);
  s.quadraticCurveTo(1.2, 11.4, 1.05, 10);
  s.lineTo(0.38, -4.6);
  s.lineTo(-0.38, -4.6);
  s.closePath();
  const g = group(at(extrude(s, 0.36, 0.12, steel(), { lie: true }), 0, 0.15, 0, -0.05, 0, 0));
  const bowl = turn([[0, 0], [1.4, 0.1], [2.2, 0.45], [2.45, 0.9], [2.3, 0.98], [1.4, 0.45], [0, 0.32]], steel(), 32, 0);
  bowl.scale.set(1, 1, 1.5);
  g.add(at(bowl, 0, 0, 8.2));
  return g;
}

// ---------------------------------------------------------------- the table

export const kitchen: Record<string, Builder> = {
  /** Cereal bowl, radius 15 x 8.7 tall: white glaze, a blue rim; `cereal` fills it with milk, loops and a spoon. */
  bowl: (v) => {
    const g = group(
      turn([[0, 0.55], [8.2, 0.55], [8.4, 0], [9.4, 0], [9.7, 0.6], [11.6, 1.7], [13.4, 3.6], [14.6, 6], [15, 7.8]], glaze('#3f74c4'), 64, 40),
      turn([[15, 7.8], [15.05, 8.4], [14.85, 8.72], [14.45, 8.62], [14.2, 8.0]], glaze('#1f4f9e'), 64, 12),
      turn([[14.2, 8.0], [13.0, 5.4], [11.0, 3.0], [8.0, 1.6], [0, 1.2]], glaze('#fbf8f2'), 64, 30),
    );
    if (v === 'cereal') {
      const milkY = 6.3;
      g.add(at(mesh(new THREE.CircleGeometry(13.4, 64).rotateX(-Math.PI / 2), glaze('#fbf7ee')), 0, milkY, 0));
      const colors = ['#ff9f1c', '#ffd166', '#ef476f', '#8ac926', '#f4a259'];
      const ring = new THREE.TorusGeometry(0.95, 0.42, 8, 16);
      for (let i = 0; i < 46; i++) {
        const a = i * 2.39996;
        const r = 1.5 + Math.sqrt(i / 46) * 10.6;
        const o = mesh(ring, satin(colors[i % colors.length]));
        g.add(at(o, Math.cos(a) * r, milkY + 0.15 + (i % 3) * 0.18, Math.sin(a) * r, Math.PI / 2 + Math.sin(i * 1.7) * 0.5, 0, Math.cos(i * 2.3) * 0.5));
      }
      // A spoon dipped in, leaning on the rim.
      g.add(at(group(at(spoon(), 0, 0, 0, 0.45)), 4.4, 10.2, 2, 0, -Math.PI / 2, 0));
    }
    return g;
  },

  /** Mug, 10 tall, radius 5 (handle reaches 8.6): coloured glaze outside, cream inside, a latte with a heart. */
  mug: (v) => {
    const color = typeof v === 'string' ? v : '#e76f51';
    const g = group();
    g.add(turn([[0, 0.15], [3.9, 0], [4.45, 0.15], [4.6, 0.9]], matte('#d8c8ac'), 48));
    g.add(turn([[4.6, 0.9], [4.75, 1.4], [4.95, 5], [5.05, 9.4], [5.0, 9.85]], glaze(color), 48, 24));
    g.add(turn([[5.0, 9.85], [4.82, 10.05], [4.55, 9.95], [4.45, 9.5], [4.3, 2], [3.8, 1.25], [0, 1.15]], glaze('#f6efe2'), 48, 24));
    g.add(at(mesh(new THREE.CircleGeometry(4.42, 48).rotateX(-Math.PI / 2), printed(latte(), { rough: 0.25, clearcoat: 1 })), 0, 8.6, 0));
    g.add(sweep([v3(4.7, 8.3, 0), v3(7.4, 8.4, 0), v3(8.6, 6.4, 0), v3(7.9, 3.8, 0), v3(4.8, 2.6, 0)], (t) => 0.95 - Math.sin(t * Math.PI) * 0.2, glaze(color), 40, 12));
    return g;
  },

  /** Tumbler, 13 tall, radius 4.5: orange juice with a slice on the rim and a straw, or water. */
  glass: (v) => {
    const g = group(tumbler(3.75, 4.5, 13, 0.32, 1.1));
    const water = v === 'water';
    const fill = water ? 9.5 : 10;
    const r0 = 3.75 - 0.32;
    const r1 = r0 + ((4.5 - 3.75) * (fill - 1.1)) / 13;
    const liquid: [number, number][] = [[0, 1.15], [r0 - 0.35, 1.15], [r0 - 0.02, 1.4], [r1, fill], [0, fill]];
    if (water) {
      const w = turn(liquid, glass('#bfe8ff', 0.22, 0.02), 40);
      w.renderOrder = 2;
      g.add(w);
    } else {
      g.add(turn(liquid, glaze('#ff9a14'), 40));
      const slice = mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.7, 28, 1, false, 0, Math.PI), printed(orangeSlice(), { rough: 0.35, clearcoat: 1 }));
      g.add(at(slice, 3.6, 12.6, 1.2, Math.PI / 2, -0.5, 0));
      g.add(sweep([v3(-1.2, 1.3, 0.4), v3(-2.2, 12, 0.8), v3(-2.5, 15.2, 0.9), v3(-3.6, 16.6, 1)], 0.32, plastic('#ef476f'), 16, 8));
    }
    return g;
  },

  /** Cereal box, 28 wide x 40 tall x 10 deep. */
  cereal: () =>
    rbox(28, 40, 10, 0.45, printed(cerealBox(), { rough: 0.5 }), {
      pz: cell(0, 0, 700, 1000, CW, CH),
      nz: cell(700, 0, 700, 1000, CW, CH),
      px: cell(1400, 0, 250, 1000, CW, CH),
      nx: cell(1650, 0, 250, 1000, CW, CH),
      py: cell(0, 1000, 700, 280, CW, CH),
      ny: cell(700, 1000, 700, 280, CW, CH),
    }),

  /** Milk carton, 11 x 11, 18 to the shoulders and 23.5 to the top of the gable. */
  carton: () => {
    const print = printed(cartonTex(), { rough: 0.5 });
    const W = 1024;
    const H = 512;
    const g = group(rbox(11, 18, 11, 0.35, print, { pz: cell(0, 0, 256, 420, W, H), px: cell(256, 0, 256, 420, W, H), nz: cell(512, 0, 256, 420, W, H), nx: cell(768, 0, 256, 420, W, H), rest: cell(0, 430, 1024, 70, W, H) }));
    // The gable: two printed slopes meeting at a sealed fin, white ends.
    const slope = Math.hypot(5.5, 4.4);
    for (const s of [-1, 1]) {
      const p = rbox(11.1, 0.3, slope, 0.1, print, { py: cell(0, 425, 1024, 85, W, H), rest: cell(0, 430, 1024, 70, W, H) });
      p.position.set(0, 17.85 + 2.2, s * 2.75);
      p.rotation.x = s * Math.atan2(4.4, 5.5);
      p.geometry.translate(0, -0.15, 0);
      g.add(p);
    }
    const end = new THREE.Shape();
    end.moveTo(-5.5, 0);
    end.lineTo(5.5, 0);
    end.lineTo(0, 4.4);
    end.closePath();
    for (const s of [-1, 1]) g.add(at(extrude(end, 0.3, 0, satin('#f4f7fb')), s * 5.25 - 0.15, 17.95, 0, 0, Math.PI / 2, 0));
    g.add(at(rbox(11.1, 2.2, 0.6, 0.15, satin('#2a6fdb')), 0, 22.2, 0));
    return g;
  },

  /** Butter dish, 14 x 9 (footprint 14 x 9): a glazed tray, a block of butter on its gold foil. */
  butter: () => {
    const g = group(rbox(14, 0.9, 9, 0.45, glaze('#f7f3ea')));
    g.add(at(rbox(13, 0.5, 8, 0.25, glaze('#fbf8f2')), 0, 0.9, 0));
    // The rim.
    for (const [w, d, x, z] of [[14, 0.7, 0, 4.15], [14, 0.7, 0, -4.15], [0.7, 9, 6.65, 0], [0.7, 9, -6.65, 0]] as const) g.add(at(rbox(w, 1.6, d, 0.3, glaze('#f7f3ea')), x, 0, z));
    g.add(at(rbox(11, 0.12, 6.8, 0.05, printed(butterFoil(), { rough: 0.3, metal: 0.6 }), { py: [0, 0, 1, 1] }), 0, 1.35, 0, 0, 0.05, 0));
    const butter = rbox(8.6, 3.8, 5.2, 0.45, satin('#ffe28a'));
    butter.geometry.translate(0.4, 0, 0);
    g.add(at(butter, -0.5, 1.45, 0, 0, -0.04, 0));
    // A curl scraped off the end.
    g.add(at(mesh(new THREE.TorusGeometry(0.7, 0.32, 8, 14, Math.PI * 1.4), satin('#ffe28a')), 4.6, 5.6, 0.6, 0, 0.4, 0));
    return g;
  },

  /** Salt or pepper shaker, radius 2.6, 8 tall: a glass body half full, a chrome cap with holes. */
  shaker: (v) => {
    const pepper = v === 'pepper';
    const g = group();
    const body = turn([[0, 0], [2.3, 0], [2.55, 0.3], [2.6, 1], [2.45, 3.4], [2.5, 5.3], [2.25, 5.3], [2.2, 3.4], [2.32, 1], [2.1, 0.55], [0, 0.55]], glass(), 32);
    body.renderOrder = 3;
    g.add(body);
    g.add(turn([[0, 0.58], [2.1, 0.58], [2.3, 1], [2.2, 3.2], [0, 3.35]], pepper ? satin('#2f2a26') : satin('#fbfbf8'), 28, 0));
    g.add(turn([[2.42, 5.1], [2.58, 5.2], [2.6, 6.2], [2.4, 6.9], [1.7, 7.6], [0.7, 7.95], [0, 8.0]], chrome(), 32, 16));
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = i === 6 ? 0 : 0.85;
      g.add(at(mesh(new THREE.SphereGeometry(0.2, 8, 6), rubber('#141414')), Math.cos(a) * r, 7.86 - r * 0.15, Math.sin(a) * r));
    }
    return g;
  },

  /** Jar of jam (or `honey`), radius 5, 11.6 tall: glass, a paper label, a gingham cloth tied over the lid. */
  jar: (v) => {
    const honey = v === 'honey';
    const g = group();
    const jar = turn([[0, 0], [4.3, 0], [4.75, 0.4], [4.8, 1], [4.8, 7.2], [4.5, 8.0], [4.1, 8.4], [4.1, 9.6], [3.85, 9.6], [3.85, 8.4], [4.25, 7.9], [4.5, 7.1], [4.5, 1.0], [4.1, 0.6], [0, 0.6]], glass(), 48);
    g.add(jar);
    g.add(turn([[0, 0.62], [4.1, 0.62], [4.45, 1], [4.45, 6.9], [4.1, 7.6], [0, 7.7]], glaze(honey ? '#e8960f' : '#8e0c22'), 40));
    const label = mesh(new THREE.CylinderGeometry(4.84, 4.84, 4.4, 40, 1, true, -1.35, 2.7), printed(jarLabel(honey), { rough: 0.7 }));
    g.add(at(label, 0, 3.9, 0));
    // The cloth: lathed over the lid, its hem pinked into a wave.
    const cl = new THREE.LatheGeometry([[0, 11.5], [2.5, 11.45], [3.9, 11.15], [4.5, 10.6], [4.7, 9.8], [4.95, 9.1], [5.35, 8.4]].map(([r, y]) => new THREE.Vector2(r, y)), 64);
    const pos = cl.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 9.6) continue;
      const a = Math.atan2(pos.getX(i), pos.getZ(i));
      const k = (9.6 - y) / 1.2;
      const f = 1 + Math.sin(a * 9) * 0.05 * k;
      pos.setXYZ(i, pos.getX(i) * f, y + Math.sin(a * 18) * 0.25 * k, pos.getZ(i) * f);
    }
    cl.computeVertexNormals();
    g.add(mesh(cl, printed(tex.gingham(honey ? '#f2a516' : '#e8414b', '#ffffff'), { rough: 0.95, normalMap: weave(), normalScale: 0.4, side: THREE.DoubleSide })));
    g.add(at(mesh(new THREE.TorusGeometry(4.78, 0.13, 6, 48), cloth('#efe3cb')), 0, 9.75, 0, Math.PI / 2, 0, 0));
    return g;
  },

  /** Apple, radius 4.5, 8.5 tall to the top of its stem, with a leaf. */
  apple: () => {
    const prof: [number, number][] = [[0, 0.7], [0.9, 0.35], [2.3, 0.3], [3.5, 1.0], [4.3, 2.4], [4.5, 4.0], [4.35, 5.4], [3.8, 6.6], [2.7, 7.35], [1.4, 7.45], [0.5, 6.9], [0, 6.7]];
    const g = group(turn(prof, printed(appleSkin(), { rough: 0.32, clearcoat: 1 }), 48, 44));
    g.add(sweep([v3(0, 6.7, 0), v3(0.12, 7.7, 0), v3(0.55, 8.7, 0.1)], (t) => 0.3 - t * 0.1, satin('#5b3a1e'), 8, 6));
    const leaf = new THREE.Shape();
    leaf.moveTo(0, 0);
    leaf.quadraticCurveTo(1.2, 1.1, 3.4, 0);
    leaf.quadraticCurveTo(1.2, -1.1, 0, 0);
    g.add(at(extrude(leaf, 0.12, 0, glaze('#4f9a2a'), { curve: 10 }), 0.45, 8.2, 0, -0.4, 0.3, 0.35));
    return g;
  },

  /** Orange, radius 4.5: dimpled peel, a green star where the stem was. */
  orange: () => {
    const geo = new THREE.SphereGeometry(4.5, 48, 32);
    geo.scale(1, 0.95, 1);
    const g = group(at(mesh(geo, printed(peel(), { rough: 0.42, normalMap: peelBumps(), normalScale: 0.35, clearcoat: 0.5 })), 0, 4.28, 0));
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.35 : 0.9;
      i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(r, 0);
    }
    g.add(at(extrude(star, 0.2, 0.05, satin('#5a7a22'), { lie: true }), 0, 8.45, 0));
    g.add(at(turn([[0.3, 0], [0.25, 0.4], [0, 0.45]], satin('#6b5a2a'), 8), 0, 8.6, 0));
    return g;
  },

  /** Teapot, body radius 9 x 14.4 tall to the knob (spout and handle reach 13.5 either side): spotty glaze, gold trim. */
  teapot: () => {
    const body = printed(dots(), { rough: 0.35, clearcoat: 1 });
    const teal = glaze('#4fb3c4');
    const gold = chrome(BRASS);
    const g = group(
      turn([[0, 0], [5.4, 0], [5.8, 0.5], [5.9, 1.0]], glaze('#f4f0e8'), 48),
      turn([[5.9, 1.0], [7.6, 2.4], [8.7, 4.6], [8.9, 6.4], [8.2, 8.6], [6.6, 10.2], [4.8, 10.8], [4.6, 11.0]], body, 48, 40),
      turn([[4.75, 10.9], [4.75, 11.2], [3.6, 11.9], [1.6, 12.4], [0.6, 12.5], [0.5, 12.8], [1.2, 13.2], [1.3, 13.8], [0.9, 14.3], [0, 14.4]], teal, 40, 30),
    );
    g.add(at(mesh(new THREE.TorusGeometry(5.9, 0.16, 6, 48), gold), 0, 1.05, 0, Math.PI / 2, 0, 0));
    g.add(at(mesh(new THREE.TorusGeometry(4.8, 0.14, 6, 48), gold), 0, 11.12, 0, Math.PI / 2, 0, 0));
    g.add(sweep([v3(6.8, 3.6, 0), v3(9.8, 5.2, 0), v3(11.8, 8.4, 0), v3(13.4, 10.8, 0)], (t) => 1.9 - t * 1.3, teal, 30, 14));
    g.add(sweep([v3(-7.8, 9.2, 0), v3(-11.2, 9.8, 0), v3(-12.6, 6.6, 0), v3(-11.2, 3.4, 0), v3(-8.2, 2.6, 0)], 0.75, teal, 36, 10));
    return g;
  },

  /** Retro toaster, 24 wide x 14 deep x 14 tall, two slices popping up to 18. */
  toaster: () => {
    const g = group(at(rbox(23, 1.2, 13, 0.5, rubber('#2a2a2e')), 0, 0, 0));
    g.add(at(rbox(24, 13, 14, 4, glaze('#9fd8cb')), 0, 0.8, 0));
    g.add(at(rbox(24.25, 1.4, 14.25, 0.6, chrome()), 0, 5.6, 0));
    for (const z of [-3, 3]) {
      g.add(at(rbox(17, 0.6, 2.6, 0.9, chrome()), 0, 13.55, z));
      g.add(at(rbox(15.4, 0.4, 1.4, 0.2, rubber('#151515')), 0, 13.9, z));
      g.add(at(toastSlice(1.2), 0, 11, z - 0.6, Math.PI / 2, 0, 0));
    }
    // Lever and browning dial on the end.
    g.add(at(rbox(0.8, 6, 1.6, 0.3, rubber('#1d1d20')), 12.1, 4, 0));
    g.add(at(rbox(1.6, 1.2, 3.2, 0.5, chrome()), 12.7, 8.8, 0));
    g.add(at(turn([[0, 0], [1.4, 0], [1.4, 0.8], [1.1, 1.1], [0, 1.1]], plastic('#f4efe6'), 24), 12, 3.4, -4.2, 0, 0, -Math.PI / 2));
    return g;
  },

  /** Sugar cube, 3.2 on a side. */
  sugar: () => rbox(3.2, 3.2, 3.2, 0.3, printed(sugarTex(), { rough: 0.7, normalMap: sugarBumps(), normalScale: 0.8 }), { rest: [0, 0, 1, 1] }),

  /** Breakfast plate, radius 14: a fried egg and two rashers of bacon. */
  plate: () => {
    const g = group(turn([[0, 0.15], [8.5, 0], [9, 0.4], [11, 0.9], [13, 1.5], [14, 1.7], [14.1, 1.9], [13.8, 2.0], [12.8, 1.75], [11, 1.25], [9.3, 0.75], [0, 0.7]], glaze('#fbf8f2'), 64));
    g.add(at(mesh(new THREE.TorusGeometry(13.35, 0.12, 4, 64), glaze('#2f6fd6')), 0, 1.86, 0, Math.PI / 2, 0, 0));
    const white = new THREE.Shape();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 4.6 + Math.sin(a * 3) * 0.5 + Math.sin(a * 5 + 1) * 0.3;
      i ? white.lineTo(Math.cos(a) * r, Math.sin(a) * r) : white.moveTo(r, 0);
    }
    g.add(at(extrude(white, 0.5, 0.22, glaze('#fffdf6'), { lie: true }), -3, 0.75, 1));
    g.add(at(scaledY(mesh(new THREE.SphereGeometry(1.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glaze('#ffb703')), 0.6), -2.6, 1.2, 0.6));
    for (const [x, z, ry] of [[4.2, -3, 0.35], [4.6, 1, 0.12]] as const) {
      const strip = new THREE.BoxGeometry(10, 0.4, 2.4, 30, 1, 1);
      const p = strip.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 1.3 + z) * 0.35 + 0.2);
      strip.computeVertexNormals();
      g.add(at(mesh(strip, printed(bacon(), { rough: 0.45, clearcoat: 0.6 })), x, 1.1, z, 0, ry, 0));
    }
    return g;
  },

  spoon,

  /** Fork lying flat, 23 long, tines towards +z. */
  fork: () => {
    const s = new THREE.Shape();
    s.moveTo(-1.05, 10);
    s.quadraticCurveTo(-1.2, 11.4, 0, 11.4);
    s.quadraticCurveTo(1.2, 11.4, 1.05, 10);
    s.lineTo(0.35, -2.5);
    s.quadraticCurveTo(1.3, -4.5, 1.3, -6.5);
    const tw = 0.45;
    const gap = (2.6 - 4 * tw) / 3;
    let x = 1.3;
    s.lineTo(x, -11.5);
    for (let t = 0; t < 4; t++) {
      s.lineTo(x - tw, -11.5);
      x -= tw;
      if (t < 3) {
        s.lineTo(x, -7.2);
        s.lineTo(x - gap, -7.2);
        x -= gap;
        s.lineTo(x, -11.5);
      }
    }
    s.lineTo(-1.3, -6.5);
    s.quadraticCurveTo(-1.3, -4.5, -0.35, -2.5);
    s.closePath();
    return group(at(extrude(s, 0.36, 0.1, steel(), { lie: true }), 0, 0.05, 0));
  },

  /** Table knife lying flat, 25 long: steel blade towards +z, black handle with rivets. */
  knife: () => {
    const s = new THREE.Shape();
    s.moveTo(-0.9, 0.5);
    s.lineTo(-0.9, -11);
    s.quadraticCurveTo(-0.9, -13.4, 0.7, -13.6);
    s.quadraticCurveTo(1.1, -12.6, 1.05, -11);
    s.lineTo(1.05, 0.5);
    s.closePath();
    const g = group(at(extrude(s, 0.26, 0.08, steel(), { lie: true }), 0, 0.3, 0));
    g.add(at(rbox(1.9, 0.9, 1.4, 0.3, steel()), 0.07, 0, -0.9));
    g.add(at(rbox(2.2, 1.3, 10, 0.55, plastic('#24242a')), 0.07, 0, -6.6));
    for (const z of [-3.6, -6.6, -9.6]) g.add(at(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10), chrome()), 0.07, 1.3, z));
    return g;
  },

  /** Cloth napkin, 22 x 22, folded corner to corner on top. */
  napkin: () => {
    const m = printed(napkinTex(), { rough: 0.95, normalMap: weave(), normalScale: 0.5 });
    const g = group(rbox(22, 0.6, 22, 0.3, m, { rest: [0, 0, 1, 1] }));
    const tri = new THREE.Shape();
    tri.moveTo(-10.6, -10.6);
    tri.lineTo(10.6, -10.6);
    tri.lineTo(-10.6, 10.6);
    tri.closePath();
    const fold = extrude(tri, 0.5, 0.2, m, { lie: true });
    topUV(fold.geometry, 22, 22);
    g.add(at(fold, 0, 0.6, 0));
    return g;
  },

  /** A slice of toast lying flat, 14 x 13.6 x 1.4. */
  toast: () => toastSlice(1.4),

  // ---------------------------------------------------------------- the room

  /** Kitchen chair at room scale: 60 x 60, seat 65 high, back 135 high. Front faces +z. */
  chair: () => {
    const wood = printed(tex.wood('#a26b3c', '#6b3e1e', 3), { rough: 0.55 });
    const turned = satin('#9a6236');
    const leg = (h: number) => turn([[2.2, 0], [2.6, 3], [2.0, 8], [2.8, 12], [2.2, 16], [2.0, h * 0.6], [2.6, h - 3], [2.4, h]], turned, 16, 30);
    const g = group(at(rbox(60, 5, 58, 2, wood), 0, 60, 0));
    for (const [x, z] of [[-25, -24], [25, -24], [-25, 24], [25, 24]]) g.add(at(leg(60), x, 0, z));
    for (const [w, d, x, z, ry] of [[50, 2, 0, 24, 0], [50, 2, 0, -24, 0], [48, 2, 25, 0, Math.PI / 2], [48, 2, -25, 0, Math.PI / 2]] as const) g.add(at(mesh(new THREE.CylinderGeometry(1, 1, w, 10).rotateZ(Math.PI / 2), turned), x, 18, z, 0, ry, 0));
    // The back: two posts carrying a curved top rail over four spindles.
    for (const x of [-25, 25]) g.add(at(turn([[2.6, 0], [2.4, 40], [2.6, 66], [1.8, 70]], turned, 16), x, 65, -24, -0.08, 0, 0));
    g.add(at(rbox(56, 12, 4, 1.5, wood, { rest: [0, 0, 1, 0.3] }), 0, 120, -26.8, -0.08, 0, 0));
    g.add(at(rbox(52, 4, 3, 1, wood, { rest: [0, 0, 1, 0.2] }), 0, 80, -25.5, -0.08, 0, 0));
    for (const x of [-15, -5, 5, 15]) g.add(at(turn([[1.2, 0], [1.6, 12], [1.2, 24], [1.2, 37]], turned, 10, 12), x, 82, -25.8, -0.08, 0, 0));
    return g;
  },

  /** Window at room scale: 160 wide x 120 tall, its back on the wall (z = -2), a sill along y = 0 sticking out 16. */
  window: () => {
    const paint = satin('#f6f4ef');
    const g = group(at(mesh(new THREE.PlaneGeometry(156, 116), printed(windowView(), { rough: 0.15, emissive: 1.05 })), 0, 60, -1.5));
    for (const [w, h, x, y] of [[164, 8, 0, 116], [164, 8, 0, -2], [8, 124, -78, -2], [8, 124, 78, -2], [5, 116, 0, 2], [156, 5, 0, 78]] as const) g.add(at(rbox(w, h, 6, 1.2, paint), x, y, 1));
    for (const x of [-39, 39]) g.add(at(rbox(3, 36, 3, 0.8, paint), x, 80, 0));
    g.add(at(rbox(176, 4, 18, 1.5, paint), 0, -4, 7));
    return g;
  },

  /**
   * A pair of curtains at room scale, standing on y = 0: each 60 wide x 260 tall, pleated and gathered at a
   * tie-back 90 up, hanging from a brass rod at y = 266. v = the gap between them (default 160, a window's
   * width); the pair is centred on x = 0, hanging in the plane z = 0 (put it a little in front of the wall).
   */
  curtains: (v) => {
    const gap = typeof v === 'number' ? v : 160;
    const m = printed(curtainTex(), { rough: 0.95, normalMap: weave(), normalScale: 0.5, side: THREE.DoubleSide });
    const g = group();
    const W = 60;
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(W, 260, 44, 30);
      const p = geo.attributes.position;
      const outer = side * (gap / 2 + W);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i) + 130;
        // 1 at the rod, pulled in to about half its width at the tie-back.
        const gather = 1 - 0.5 * Math.exp(-(((y - 90) / 55) ** 2));
        const edge = side * (W / 2);
        p.setXYZ(i, outer + (x - edge) * gather, y, Math.sin(((x + W / 2) / W) * Math.PI * 9) * 2.6 * (1.3 - gather * 0.5));
      }
      geo.computeVertexNormals();
      g.add(mesh(geo, m));
      g.add(at(mesh(new THREE.TorusGeometry(5, 1, 6, 18), m), outer - side * 15, 90, 0, Math.PI / 2, 0, 0));
    }
    const len = gap + W * 2 + 24;
    g.add(at(mesh(new THREE.CylinderGeometry(1.4, 1.4, len, 12).rotateZ(Math.PI / 2), chrome(BRASS)), 0, 266, 0));
    for (const s of [-1, 1]) g.add(at(mesh(new THREE.SphereGeometry(2.8, 12, 8), chrome(BRASS)), (s * len) / 2, 266, 0));
    return g;
  },

  /** A pot of herbs for a windowsill at room scale: terracotta, radius 5.8, 10 tall, leaves up to about 22. */
  herbs: () => {
    const pot = group(turn([[0, 0], [4, 0], [5.2, 8], [5.8, 8], [5.8, 10], [0, 10]], matte('#c8643b'), 24), at(mesh(new THREE.CircleGeometry(5.3, 24).rotateX(-Math.PI / 2), matte('#4a3326')), 0, 9.4, 0));
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996;
      const r = 1 + Math.sqrt(i / 26) * 4.5;
      const leaf = mesh(new THREE.SphereGeometry(1.5, 10, 6), glaze(i % 3 ? '#4f9a2a' : '#65b23a'));
      leaf.scale.set(1, 0.35, 1.5);
      pot.add(at(leaf, Math.cos(a) * r, 12 + (26 - i) * 0.32, Math.sin(a) * r, 0.5 * Math.sin(a), -a, 0.5 * Math.cos(a)));
    }
    return pot;
  },

  /**
   * Kitchen counter at room scale: v = length (default 400, in 100-wide door modules) x 190 tall x 124
   * deep, front facing +z, back at z = -62. Sage shaker doors and drawers with chrome bars, a butcher-block
   * top, a tiled splashback 110 tall on the back edge, and a steel sink and kettle on lengths of 300 or more.
   */
  counter: (v) => {
    const L = Math.max(100, Math.round((typeof v === 'number' ? v : 400) / 100) * 100);
    const door = glaze('#8fb39a');
    const g = group(at(rbox(L, 12, 108, 1, rubber('#2b2b2e')), 0, 0, -6), at(rbox(L, 170, 116, 1, satin('#eef0ea')), 0, 12, -4));
    const bar = (x: number, y: number, w: number, vert = false) => {
      const h = group(at(rbox(vert ? 1.6 : w, vert ? w : 1.6, 1.6, 0.7, chrome()), 0, 0, 3.6));
      for (const s of [-1, 1]) h.add(at(mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.2, 8).rotateX(Math.PI / 2), chrome()), vert ? 0 : (s * w) / 2.6, vert ? (w / 2) * (1 + s * 0.8) : 0.8, 1.6));
      return at(h, x, y, 56);
    };
    for (let i = 0; i < L / 100; i++) {
      const x = -L / 2 + 50 + i * 100;
      // Shaker door: a flat panel with a raised frame.
      g.add(at(rbox(97, 124, 2.5, 1, door), x, 15, 55));
      for (const [w, h, dx, y] of [[97, 10, 0, 15], [97, 10, 0, 129], [10, 124, -43.5, 15], [10, 124, 43.5, 15]] as const) g.add(at(rbox(w, h, 1.6, 0.8, door), x + dx, y, 57));
      g.add(bar(x + (i % 2 ? -38 : 38), 75, 28, true));
      g.add(at(rbox(97, 36, 4, 1.2, door), x, 144, 56));
      g.add(bar(x, 162, 30));
    }
    // The worktop, cut round the sink.
    const top = printed(butcherBlock(), { rough: 0.5, clearcoat: 0.3 });
    const sink = L >= 300;
    const sx = 0;
    const sw = 70;
    const sd = 46;
    const slab = (w: number, d: number, x: number, z: number) => at(rbox(w, 7, d, 1, top, { py: [0, 0, w / 400, 1], rest: [0, 0, 1, 0.1] }), x, 182, z);
    if (sink) {
      g.add(slab((L + 4) / 2 - sw / 2, 124, -(L + 4) / 4 - sw / 4, 0), slab((L + 4) / 2 - sw / 2, 124, (L + 4) / 4 + sw / 4, 0));
      g.add(slab(sw, (124 - sd) / 2, sx, 62 - (124 - sd) / 4), slab(sw, (124 - sd) / 2, sx, -62 + (124 - sd) / 4));
      // Steel basin and rim.
      const st = steel('#d4d8de');
      g.add(at(rbox(sw - 2, 1.5, sd - 2, 0.5, steel('#b8bdc4')), sx, 162, 0));
      for (const [w, d, x, z] of [[sw, 1.5, 0, sd / 2 - 0.75], [sw, 1.5, 0, -sd / 2 + 0.75], [1.5, sd, sw / 2 - 0.75, 0], [1.5, sd, -sw / 2 + 0.75, 0]] as const) g.add(at(rbox(w, 27, d, 0.5, st), sx + x, 162, z));
      for (const [w, d, x, z] of [[sw + 6, 3, 0, sd / 2 + 1.5], [sw + 6, 3, 0, -sd / 2 - 1.5], [3, sd + 6, sw / 2 + 1.5, 0], [3, sd + 6, -sw / 2 - 1.5, 0]] as const) g.add(at(rbox(w, 1.2, d, 0.5, st), sx + x, 189, z));
      g.add(at(mesh(new THREE.CylinderGeometry(3, 3, 0.4, 16), chrome()), sx, 163.6, 0));
      // A gooseneck mixer tap.
      g.add(at(turn([[3.2, 0], [3, 2], [1.8, 4], [1.8, 10], [0, 10]], chrome(), 20), sx, 189, -36));
      g.add(sweep([v3(sx, 197, -36), v3(sx, 222, -36), v3(sx, 232, -28), v3(sx, 226, -18), v3(sx, 214, -16)], 1.4, chrome(), 30, 10));
      g.add(at(rbox(1.6, 1.6, 9, 0.7, chrome()), sx + 2.5, 205, -36, 0, 0, -0.5));
      // A kettle at the end.
      const k = group(
        turn([[0, 0], [10, 0], [11, 1.5], [11.2, 14], [9.6, 22], [5, 25], [0, 25]], chrome(), 32, 24),
        at(turn([[0, 0], [5.6, 0], [5.6, 1], [2, 2.6], [1.2, 4], [0, 4]], plastic('#1e1e22'), 20), 0, 24.6, 0),
        at(turn([[0, 0], [10.4, 0], [10.4, 1.2], [0, 1.2]], plastic('#1e1e22'), 32), 0, -1, 0),
      );
      k.add(sweep([v3(-8, 21, 0), v3(-12, 28, 0), v3(-4, 31, 0), v3(5, 25, 0)], 1.6, plastic('#1e1e22'), 24, 8));
      k.add(sweep([v3(9, 8, 0), v3(14, 14, 0), v3(16, 19, 0)], (t) => 2.6 - t * 1.2, chrome(), 12, 10));
      g.add(at(k, L / 2 - 50, 190, -20, 0, 2.4, 0));
    } else g.add(slab(L + 4, 124, 0, 0));
    // Splashback tiles along the back.
    const tiles = new THREE.PlaneGeometry(L, 110);
    const uv = tiles.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (L / 64), uv.getY(i) * (110 / 64));
    g.add(at(mesh(tiles, printed(subway(), { rough: 0.25, normalMap: subwayBumps(), normalScale: 1, clearcoat: 1 })), 0, 244, -61.5));
    return g;
  },

  /**
   * Fridge-freezer at room scale: 140 wide x 360 tall x 135 deep, front facing +z, back at z = -62. Cream
   * enamel, freezer door on top, chrome handles, a badge, magnets holding a child's drawing and a shopping list.
   */
  fridge: () => {
    const enamel = glaze('#f2ead8');
    const g = group(at(rbox(130, 12, 116, 2, rubber('#2a2a2e')), 0, 0, -4), at(rbox(140, 346, 124, 12, enamel), 0, 10, 0));
    g.add(at(rbox(136, 236, 10, 6, enamel), 0, 14, 62), at(rbox(136, 102, 10, 6, enamel), 0, 252, 62));
    for (const [y, h] of [[60, 150], [262, 80]] as const) {
      g.add(at(rbox(4, h, 4, 1.8, chrome()), 58, y, 77));
      for (const s of [0.08, 0.92]) g.add(at(mesh(new THREE.CylinderGeometry(1.3, 1.3, 8, 10).rotateX(Math.PI / 2), chrome()), 58, y + h * s, 71));
    }
    // Grille at the foot.
    for (let i = 0; i < 6; i++) g.add(at(rbox(110, 1.4, 2, 0.5, rubber('#3a3a3e')), 0, 3 + i * 1.8, 60));
    g.add(at(rbox(36, 9, 1, 0.8, printed(badgeTex(), { rough: 0.25, metal: 0.7 }), { pz: [0, 0, 1, 1], rest: [0, 0, 0.02, 0.02] }), 0, 230, 67));
    const art = printed(fridgeArt(), { rough: 0.85 });
    const paper = (w: number, h: number, r: [number, number, number, number]) => {
      const p = new THREE.PlaneGeometry(w, h);
      const uv = p.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + (r[2] - r[0]) * uv.getX(i), r[1] + (r[3] - r[1]) * uv.getY(i));
      return mesh(p, art, false);
    };
    g.add(at(paper(44, 44, [0, 0, 0.5, 1]), -24, 160, 67.2, 0, 0, 0.05));
    g.add(at(paper(30, 36, [0.5, 0, 1, 1]), 22, 120, 67.2, 0, 0, -0.06));
    for (const [x, y, c] of [[-40, 180, '#e63946'], [-6, 178, '#3d9bff'], [22, 136, '#ffd23f'], [-30, 296, '#06d6a0'], [10, 290, '#ef476f']] as const)
      g.add(at(mesh(new THREE.CylinderGeometry(3, 3, 1.6, 16).rotateX(Math.PI / 2), plastic(c)), x, y, 68));
    return g;
  },
};

function scaledY<T extends THREE.Object3D>(o: T, s: number): T {
  o.scale.y = s;
  return o;
}

/**
 * Household objects, by kind. Each builder returns a model standing on the ground at its origin. Table-top
 * props are at kart scale and sized to the footprint the physics uses (packages/game/src/track/props.ts), so
 * what you see is what you hit; room pieces (fridge, bookshelf, bathtub, shed, bed, workbench...) are at
 * room scale, about 0.5 cm to the unit. Each room's props live in its own prop*.ts module.
 */
import type * as THREE from 'three';
import { box, decal } from './kit';
import { bath } from './propBath';
import { desk } from './propDesk';
import { garage } from './propGarage';
import { garden } from './propGarden';
import type { Builder } from './propKit';
import { kitchen } from './propKitchen';
import { toys } from './propToys';

const LIBRARY: Record<string, Builder> = { ...kitchen, ...desk, ...bath, ...garden, ...toys, ...garage };

/** Build a prop by kind. Unknown kinds become a small magenta cube so they show up in testing. */
export function buildProp(kind: string, v?: string | number): THREE.Object3D {
  const b = LIBRARY[kind];
  if (!b) return box(4, 4, 4, '#ff00ff');
  return b(v);
}

export { decal };

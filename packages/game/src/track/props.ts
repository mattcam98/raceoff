/**
 * The solid footprint of each prop kind at scale 1, so the physics knows what
 * a cereal box or a toolbox blocks without knowing what it looks like. The
 * renderer builds each kind to match these sizes. A kind that is missing here
 * is decoration only: karts drive through or over it.
 */

export type Footprint = { c: number } | { b: [halfWidth: number, halfDepth: number] };

export const FOOTPRINTS: Record<string, Footprint> = {
  // kitchen
  bowl: { c: 15 },
  mug: { c: 5.5 },
  glass: { c: 4.5 },
  cereal: { b: [14, 5] },
  carton: { b: [5.5, 5.5] },
  butter: { b: [7, 4.5] },
  shaker: { c: 2.6 },
  jar: { c: 5 },
  apple: { c: 4.5 },
  orange: { c: 4.5 },
  teapot: { c: 9 },
  toaster: { b: [12, 7] },
  sugar: { b: [1.6, 1.6] },
  // desk
  books: { b: [14, 10] },
  pencilcup: { c: 5 },
  lamp: { c: 7 },
  mouse: { b: [3.5, 5.5] },
  eraser: { b: [3, 6] },
  globe: { c: 9 },
  plant: { c: 7 },
  calculator: { b: [7, 10] },
  // bathroom
  soap: { b: [5, 3.5] },
  duck: { c: 3.2 },
  bottle: { c: 3.8 },
  cup: { c: 3.4 },
  roll: { c: 5.2 },
  sponge: { b: [6, 4] },
  // garden
  castle: { c: 13 },
  bucket: { c: 6.5 },
  gnome: { c: 4.2 },
  pot: { c: 6 },
  stone: { c: 3 },
  can: { c: 6 },
  mushroom: { c: 3 },
  // playroom
  block: { b: [3, 3] },
  bigblock: { b: [5, 5] },
  teddy: { c: 10 },
  toyball: { c: 6 },
  rings: { c: 5 },
  cube: { b: [5, 5] },
  fort: { b: [18, 12] },
  // garage
  toolbox: { b: [13, 7] },
  tire: { c: 6.5 },
  paint: { c: 4.5 },
  drum: { c: 6 },
  cone: { c: 2.2 },
  battery: { c: 2.6 },
  crate: { b: [8, 8] },
};

export function footprintOf(kind: string): Footprint | undefined {
  return FOOTPRINTS[kind];
}

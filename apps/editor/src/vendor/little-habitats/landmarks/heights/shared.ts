// Ports index-BwioI7A7.js 29668-29714: constants and detect helpers shared by the heights landmarks
// (bell tower, kite, lookout tower, rope swing, windmill).
import * as THREE from 'three';
import type { LandmarkDetectContext } from '../types';

/** The default facing of a heights landmark: 45 degrees. */
export const BASE_YAW = Math.PI / 4; // bm (29668)

export const vec3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z); // xm (29669)

export const WOOD_DARK = `#7d5234`; // Sm (29670)
export const WOOD = `#a8744a`; // Cm (29671)
export const WOOD_LIGHT = `#c99a6b`; // wm (29672)
export const ROPE = `#d8c396`; // Tm (29673)

/** True when a habitat tree (other than `exceptPlantId`) stands within r of (x, z). */
export function treeWithin( // Em (29674)
  ctx: LandmarkDetectContext,
  x: number,
  z: number,
  r: number,
  exceptPlantId?: string,
): boolean {
  for (const tree of ctx.habitat.trees)
    if (tree.plantId !== exceptPlantId && (tree.base.x - x) ** 2 + (tree.base.z - z) ** 2 < r * r) return true;
  return false;
}

/** Distance from (x, z) to the nearest habitat tree (Infinity when there is none). */
export function nearestTreeDistance(ctx: LandmarkDetectContext, x: number, z: number): number { // Dm (29678)
  let best = 1 / 0;
  for (const tree of ctx.habitat.trees) best = Math.min(best, Math.hypot(tree.base.x - x, tree.base.z - z));
  return best;
}

/** True for an unsown soil corner that the seeded hash marks as a wild-growth spot. */
export function isWildSpot(ctx: LandmarkDetectContext, corner: number): boolean { // Om (29683)
  return ctx.mat(corner) !== `soil` || ctx.sown(corner) || ctx.h(corner) < 1
    ? false
    : ctx.h01(corner, 4) < (ctx.h(corner) >= 3 ? 0.3 : 0.22);
}

/** Distance from (x, z) to the highest land corner (Infinity when there is no land). */
export function distanceToPeak(ctx: LandmarkDetectContext, x: number, z: number): number { // km (29686)
  const peak = ctx.highest();
  if (peak < 0) return 1 / 0;
  const c = ctx.grid.corners[peak];
  return Math.hypot(c.x - x, c.z - z);
}

/** BASE_YAW with a seeded offset of up to +-spread / 2. */
export function seededYaw(ctx: LandmarkDetectContext, corner: number, spread = 0.5): number { // Am (29692)
  return BASE_YAW + (ctx.h01(corner, 77) - 0.5) * spread;
}

/** The corner and every corner within `steps` neighbour steps of it. */
export function cornersWithin(ctx: LandmarkDetectContext, corner: number, steps: number): number[] { // jm (29695)
  const seen = new Set([corner]);
  let front = [corner];
  for (let s = 0; s < steps; s++) {
    const next: number[] = [];
    for (const c of front)
      for (const n of ctx.nbrs(c))
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
    front = next;
  }
  return [...seen];
}

/** Smooth bump: 1 at x = 0, falling to 0 at |x| >= width. */
export function bump(x: number, width: number): number { // Mm (29705)
  const t = Math.max(0, 1 - Math.abs(x) / width);
  return t * t * (3 - 2 * t);
}

/** Disposes the geometry of every mesh under `root`. */
export function disposeMeshes(root: THREE.Object3D): void { // Nm (29709)
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}

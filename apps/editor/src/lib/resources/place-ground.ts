// Ground height of library places (environment entries such as the desert and the alley arena).
// A place is not an editable terrain, so the island height function does not know it. Its
// builder registers a height function in the place's own coordinates; placement code (the
// layout solver, water fitting, puddles) asks for the ground at a world point.
// Read only and pure math: no raycasts, so a call costs microseconds.
import * as THREE from "three";

type PlaceGround = {
  object: THREE.Object3D;
  /** Ground height at a point in the place's own coordinates; null outside the place. */
  heightAt: (x: number, z: number) => number | null;
};

const grounds = new Set<PlaceGround>();
const v = new THREE.Vector3();

/** Registers the ground of a place object. Call the returned function in dispose. */
export function registerPlaceGround(object: THREE.Object3D, heightAt: PlaceGround["heightAt"]): () => void {
  const ground = { object, heightAt };
  grounds.add(ground);
  return () => {
    grounds.delete(ground);
  };
}

/** True when the object is part of a rendered scene (not a detached or hidden copy). */
function live(object: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = object;
  while (o) {
    if (!o.visible) return false;
    if ((o as THREE.Scene).isScene) return true;
    o = o.parent;
  }
  return false;
}

export function hasPlaceGround(): boolean {
  for (const g of grounds) if (live(g.object)) return true;
  return false;
}

/** Ground height of the places at a world point (the highest one when places overlap); null outside all places. */
export function placeGroundAt(x: number, z: number): number | null {
  let best: number | null = null;
  for (const g of grounds) {
    if (!live(g.object)) continue;
    g.object.updateWorldMatrix(true, false);
    v.set(x, 0, z);
    g.object.worldToLocal(v);
    const h = g.heightAt(v.x, v.z);
    if (h === null || !Number.isFinite(h)) continue;
    v.y = h;
    g.object.localToWorld(v);
    best = best === null ? v.y : Math.max(best, v.y);
  }
  return best;
}

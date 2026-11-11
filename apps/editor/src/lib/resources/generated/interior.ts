// Parametric library entry: interior. "gen:interior" builds the fit-out of one room from
// InteriorParams (src/lib/generators/interior): floor finish, ceiling with light panels, walls or
// a lift core, furniture and lamps. It reveals itself stage by stage like a generated building,
// and it adds a few modest point lights. It is placed by the interior generator
// (src/lib/copilot/director/generators/interior.ts), not by search. Without params it shows a
// 10 x 8 lobby.
import * as THREE from "three";
import { buildInterior, normalizeInteriorParams, paletteOf, type InteriorParams } from "@/lib/generators/interior";
import type { ResourceEntry, ResourceInstance } from "../types";
import { stagedInstance } from "./architecture";

/** Point light strength (three.js physical units, candela). The preview has a sun and no tone mapping. */
export const INTERIOR_LIGHT_INTENSITY = 8;
/** Light reach as a factor of the room height. */
export const INTERIOR_LIGHT_REACH = 2.2;
/**
 * Bounce light: the lamps hang just under the ceiling, so they light it at a flat angle and it
 * looked dark from below (the sky light of the scene comes from above and never reaches it).
 * One or two soft lights low in the room stand in for the light that a real floor reflects.
 */
export const INTERIOR_BOUNCE_INTENSITY = 4;

function paramsOf(seed: number, raw?: Record<string, unknown>): InteriorParams {
  const p = normalizeInteriorParams(raw ?? { seed });
  if (typeof p !== "string") return p;
  return normalizeInteriorParams({ seed }) as InteriorParams;
}

function interiorInstance(p: InteriorParams, appear: boolean): ResourceInstance {
  const built = buildInterior(p);
  const inst = stagedInstance(built.stages, appear);
  const lights: THREE.PointLight[] = [];
  if (p.lights) {
    const color = new THREE.Color(paletteOf(p.finish).light);
    for (const at of built.plan.lights.slice(0, 4)) {
      const light = new THREE.PointLight(color, INTERIOR_LIGHT_INTENSITY, INTERIOR_LIGHT_REACH * p.height, 2);
      light.castShadow = false;
      light.position.set(at.x, at.y, at.z);
      light.name = "Interior light";
      inst.object.add(light);
      lights.push(light);
    }
    // Bounce light, in the color of the floor mixed with the lamp color.
    const bounce = new THREE.Color(paletteOf(p.finish).floor).lerp(color, 0.5);
    const long = Math.max(p.width, p.depth);
    const spots = long > 16 ? [-0.25, 0.25] : [0];
    for (const t of spots) {
      const light = new THREE.PointLight(bounce, INTERIOR_BOUNCE_INTENSITY, Math.max(8, 3 * p.height, long * 0.6), 2);
      light.castShadow = false;
      // At about half height: near the floor it made one bright spot on the floor under it.
      const y = Math.min(2.2, Math.max(1.2, p.height * 0.45));
      light.position.set(p.width >= p.depth ? t * p.width : 0, y, p.width >= p.depth ? 0 : t * p.depth);
      light.name = "Interior bounce light";
      inst.object.add(light);
      lights.push(light);
    }
  }
  return {
    ...inst,
    dispose: () => {
      inst.dispose?.();
      for (const l of lights) {
        l.removeFromParent();
        l.dispose();
      }
    }
  };
}

export const INTERIOR_ENTRIES: ResourceEntry[] = [
  {
    id: "gen:interior",
    name: "Room interior",
    kind: "feature",
    source: "local",
    origin: "Theras AI interior generator",
    license: "Owned by the Theras AI author",
    category: "Generated",
    tags: ["generated", "interior"],
    description:
      "The fit-out of one room (lobby, office, cafe lounge or apartment): floor finish, ceiling with lights and the furniture of its use, sized to the room. Placed by the interior generator, not by search.",
    // The real size depends on the params; the generator stores it in the node metadata.
    footprint: 6,
    selfAnimates: true,
    create: (seed, opts) => interiorInstance(paramsOf(seed, opts?.params), Boolean(opts?.appear))
  }
];

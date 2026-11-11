// Parametric library entries: architecture. Each entry builds its object from opts.params (the node's
// metadata.params), so one entry can be a river of any shape or an object of any parts list.
//
// "gen:architecture": one landmark building (Japanese castle keep, pagoda, shrine with torii,
// medieval keep, modern tower) from ArchParams (src/lib/generators/architecture). It reveals
// itself bottom-up: stone base, then each tier, then the roof ornaments (selfAnimates).
// "gen:architecture-yard": the stone yard or garden around it (params = ArchParams + half).
// Both are placed by the architecture generator (src/lib/copilot/director/generators/architecture.ts),
// not by search. Without params (library card) they show a 5-tier Japanese castle.
import * as THREE from "three";
import {
  buildArchitecture,
  buildSurroundings,
  resolveArchParams,
  stageTimeline,
  type ArchStage
} from "@/lib/generators/architecture";
import type { MatId } from "@/lib/generators/architecture/mesh";
import { patchWorldMaterial } from "@/vendor/little-habitats/fx/pokefx";
import type { ResourceEntry, ResourceInstance } from "../types";

let mats: Record<MatId, THREE.Material> | null = null;

/** Shared materials: vertex colors and flat facets, like the Island kit props. */
function materials(): Record<MatId, THREE.Material> {
  mats ??= {
    base: patchWorldMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide }),
      { snow: 1 }
    ),
    gold: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.32, metalness: 0.65, side: THREE.DoubleSide }),
    // Tower glass: smooth and a little metallic, so it reflects the sky; the tint comes from the vertex colors.
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.1, metalness: 0.45, side: THREE.DoubleSide }),
    // Lit windows: a soft warm glow (cheap: one material for all lit cells).
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0, emissive: new THREE.Color("#ffcf8a"), emissiveIntensity: 0.45 })
  };
  return mats;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Group of stage groups. appear = true: each stage grows up from its own base line in order
 * (stageTimeline), so the user sees the building rise tier by tier.
 */
export function stagedInstance(stages: ArchStage[], appear: boolean): ResourceInstance {
  const m = materials();
  const root = new THREE.Group();
  const groups: THREE.Group[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  for (const stage of stages) {
    const g = new THREE.Group();
    g.name = stage.label;
    for (const [id, geo] of Object.entries(stage.geometries) as [MatId, THREE.BufferGeometry][]) {
      const mesh = new THREE.Mesh(geo, m[id]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      geometries.push(geo);
    }
    groups.push(g);
    root.add(g);
  }
  const timeline = stageTimeline(stages);
  let t0: number | null = null;
  let done = !appear;
  const apply = (elapsed: number) => {
    let all = true;
    stages.forEach((stage, k) => {
      const { start, duration } = timeline[k];
      const t = Math.max(0, Math.min(1, (elapsed - start) / duration));
      const s = Math.max(1e-4, easeOut(t));
      const g = groups[k];
      g.visible = t > 0;
      g.scale.set(1, s, 1);
      g.position.y = stage.minY * (1 - s);
      if (t < 1) all = false;
    });
    return all;
  };
  if (appear) apply(0);
  // Resolves when the reveal is over, so the viewport measures the selection box of the whole building.
  let finished: () => void = () => {};
  const ready = done ? undefined : new Promise<void>((resolve) => (finished = resolve));
  return {
    object: root,
    ready,
    update: () => {
      if (done) return;
      const now = performance.now();
      t0 ??= now;
      done = apply(now - t0);
      if (done) finished();
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
    }
  };
}

const ORIGIN = "Theras AI architecture generator";
const LICENSE = "Owned by the Theras AI author";

export const ARCHITECTURE_ENTRIES: ResourceEntry[] = [
  {
    id: "gen:architecture",
    name: "Landmark building",
    kind: "landmark",
    source: "local",
    origin: ORIGIN,
    license: LICENSE,
    category: "Generated",
    tags: ["generated", "architecture"],
    description:
      "A parametric landmark building (Japanese castle keep, pagoda, shrine with torii gate, medieval keep, modern tower). Placed by the architecture generator, not by search.",
    // The real footprint depends on the params; the generator stores it in the node metadata (footprint).
    footprint: 5,
    selfAnimates: true,
    create: (seed, opts) => {
      const p = resolveArchParams(opts?.params ?? { style: "japanese-castle", seed });
      return stagedInstance(buildArchitecture(p).stages, Boolean(opts?.appear));
    }
  },
  {
    id: "gen:architecture-yard",
    name: "Stone yard",
    kind: "feature",
    source: "local",
    origin: ORIGIN,
    license: LICENSE,
    category: "Generated",
    tags: ["generated", "architecture"],
    description: "The stone yard or garden around a generated landmark building, with front steps and stone lanterns. Placed by the architecture generator.",
    footprint: 6,
    create: (seed, opts) => {
      const params = opts?.params ?? { style: "japanese-castle", seed, surround: "stone-yard" };
      const p = resolveArchParams(params);
      if (p.surround === "none") p.surround = "stone-yard";
      const half = Array.isArray(params.half) && params.half.length === 2 && params.half.every((v) => typeof v === "number" && v > 0) ? (params.half as [number, number]) : buildArchitecture(p).half;
      const yard = buildSurroundings(p, { half });
      return stagedInstance(yard?.stages ?? [], false);
    }
  }
];

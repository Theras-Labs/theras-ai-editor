// Island kit landmarks and ecology features as library entries.
// Landmarks use their own build(placement, seed); features use the ecology model builders
// with the same materials as Island kit' featureView.
import * as THREE from "three";
import { PALETTE } from "@/vendor/little-habitats/core/palette";
import {
  buildBeehive,
  buildBench,
  buildBirdbath,
  buildBirdhouse,
  buildBridge,
  buildFence,
  buildInsectHotel,
  buildLantern,
  buildLeafPile,
  buildLogPile,
  buildRoseArch,
  buildRowboat
} from "@/vendor/little-habitats/ecology/models";
import type { FeatureModel } from "@/vendor/little-habitats/ecology/types";
import { patchWorldMaterial } from "@/vendor/little-habitats/fx/pokefx";
import { LANDMARKS } from "@/vendor/little-habitats/landmarks/catalog";
import type { LandmarkDef, LandmarkPlacement } from "@/vendor/little-habitats/landmarks/types";
import type { ResourceEntry, ResourceInstance } from "../types";
import { tickLittleHabitats } from "./runtime";

const ORIGIN = "Island kit";
const LICENSE = "Owned by the Theras AI author";

// ── Landmarks ────────────────────────────────────────────────

/** The context of the current frame, set by the ResourceTicker before resource updates run. */
let currentContext: ReturnType<typeof tickLittleHabitats> | null = null;
export function setFrameContext(ctx: ReturnType<typeof tickLittleHabitats>) {
  currentContext = ctx;
}
function frameContext() {
  return currentContext ?? tickLittleHabitats(0);
}

function landmarkInstance(def: LandmarkDef, seed: number): ResourceInstance {
  const placement: LandmarkPlacement = { key: `${def.id}:${seed}`, x: 0, y: 0, z: 0, rotY: 0, radius: 2 };
  const inst = def.build(placement, seed);
  let failed = false;
  return {
    object: inst.object,
    update: inst.update
      ? () => {
          if (failed) return;
          try {
            inst.update!(frameContext());
          } catch (error) {
            failed = true; // Island kit also stops updating a landmark after it throws once.
            console.warn(`[resources] ${def.id} update stopped:`, error);
          }
        }
      : undefined,
    dispose: inst.dispose
  };
}

const LANDMARK_TAGS: Record<string, string[]> = {
  weather_vane: ["roof", "wind", "metal"],
  lighthouse: ["water", "coast", "tower", "light"],
  island_shrine: ["water", "shrine", "gate", "torii"],
  fountain: ["water", "stone", "plaza"],
  water_wheel: ["water", "wood", "mill"],
  wishing_well: ["water", "stone", "well"],
  windmill: ["hill", "wood", "mill", "wind"],
  kite: ["hill", "sky", "toy"],
  lookout_tower: ["hill", "tower", "wood"],
  bell_tower: ["hill", "tower", "bell"],
  rope_swing: ["tree", "toy", "rope"],
  standing_stones: ["stone", "circle", "ancient"],
  gazebo: ["stone", "garden", "shelter"],
  sundial: ["stone", "garden", "time"],
  campfire: ["fire", "camp", "light", "night"],
  hot_spring: ["water", "stone", "steam"],
  garden_shed: ["garden", "wood", "house", "shed"],
  greenhouse: ["garden", "glass", "house"],
  maypole: ["garden", "festival", "ribbon"],
  scarecrow: ["garden", "farm"],
  treehouse: ["tree", "wood", "house"],
  snowman: ["winter", "snow"],
  friendship_lantern: ["light", "lantern", "night", "festival"]
};

const LANDMARK_SIZE: Record<string, number> = {
  lighthouse: 2.5, windmill: 2.5, lookout_tower: 2.2, bell_tower: 2, greenhouse: 2.4, garden_shed: 2,
  gazebo: 2.2, hot_spring: 2.4, standing_stones: 2.4, water_wheel: 2, island_shrine: 2.2, fountain: 1.8
};

export const LH_LANDMARK_ENTRIES: ResourceEntry[] = LANDMARKS.map((def) => ({
  id: `lh:landmark:${def.id}`,
  name: def.name,
  kind: "landmark",
  source: "local",
  origin: ORIGIN,
  license: LICENSE,
  tags: ["little-habitats", "landmark", ...(LANDMARK_TAGS[def.id] ?? [])],
  description: def.blurb,
  footprint: LANDMARK_SIZE[def.id] ?? 1.5,
  create: (seed) => landmarkInstance(def, seed)
}));

// ── Ecology features ─────────────────────────────────────────

let featureMats: { base: THREE.Material; glow: THREE.Material; leaf: THREE.Material; bloom: THREE.Material } | null = null;

function featureMaterials() {
  featureMats ??= {
    base: patchWorldMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 }),
      { snow: 1 }
    ),
    glow: patchWorldMaterial(
      new THREE.MeshStandardMaterial({
        color: "#ffe6bd",
        emissive: new THREE.Color(PALETTE.lanternGlow),
        emissiveIntensity: 3.2,
        roughness: 0.7,
        flatShading: true
      }),
      {
        fragment: `
  float scNight = 1.0 - smoothstep(0.08, 0.6, uDaylight);
  float scFlick = 0.9 + 0.1 * sin(uTime * 6.3 + vScWorldPos.x * 5.0) * sin(uTime * 3.7 + vScWorldPos.z * 3.0);
  totalEmissiveRadiance *= mix(0.06, 1.0, scNight) * scFlick;`
      }
    ),
    leaf: patchWorldMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), {
      snow: 1,
      wind: { amount: 0.025, height: 1.4 },
      fragment: `diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.25, 0.95, 0.55), uAutumn * 0.8);`
    }),
    bloom: patchWorldMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }), {
      wind: { amount: 0.025, height: 1.4 }
    })
  };
  return featureMats;
}

function featureInstance(model: FeatureModel): ResourceInstance {
  const mats = featureMaterials();
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry | undefined, material: THREE.Material, shadow = true) => {
    if (!geometry || !geometry.attributes.position?.count) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(model.geometry, mats.base);
  add(model.moving, mats.base);
  add(model.glow, mats.glow, false);
  add(model.leaves, mats.leaf, false);
  add(model.blooms, mats.bloom, false);
  if (model.light) {
    const light = new THREE.PointLight(PALETTE.lanternGlow, 0.6, 4.2, 1.6);
    light.position.copy(model.light);
    group.add(light);
  }
  return {
    object: group,
    dispose: () => {
      model.geometry.dispose();
      model.moving?.dispose();
      model.glow?.dispose();
      model.leaves?.dispose();
      model.blooms?.dispose();
    }
  };
}

type FeatureSpec = { id: string; name: string; tags: string[]; footprint: number; description: string; build: (seed: number) => FeatureModel };

const FEATURES: FeatureSpec[] = [
  { id: "bench", name: "Bench", tags: ["seat", "wood", "garden"], footprint: 0.8, description: "A small wooden bench.", build: buildBench },
  { id: "birdbath", name: "Birdbath", tags: ["stone", "water", "garden", "bird"], footprint: 0.5, description: "A stone birdbath.", build: buildBirdbath },
  { id: "beehive", name: "Beehive", tags: ["garden", "bee", "farm"], footprint: 0.5, description: "A wooden beehive on a stand.", build: buildBeehive },
  { id: "birdhouse", name: "Birdhouse", tags: ["wood", "bird", "post"], footprint: 0.4, description: "A birdhouse on a post.", build: buildBirdhouse },
  { id: "lantern", name: "Lantern", tags: ["light", "night", "post"], footprint: 0.4, description: "A lantern post that glows at night.", build: buildLantern },
  {
    id: "bridge",
    name: "Bridge",
    tags: ["wood", "water", "crossing"],
    footprint: 1.6,
    description: "An arched wooden footbridge about 3 m long.",
    build: (seed) => buildBridge(seed, 1.5, 0, 0)
  },
  { id: "log_pile", name: "Log pile", tags: ["wood", "forest"], footprint: 0.6, description: "A stack of cut logs.", build: buildLogPile },
  { id: "leaf_pile", name: "Leaf pile", tags: ["autumn", "forest"], footprint: 0.5, description: "A heap of fallen leaves.", build: buildLeafPile },
  { id: "insect_hotel", name: "Insect hotel", tags: ["wood", "garden", "bug"], footprint: 0.5, description: "A wooden insect hotel.", build: buildInsectHotel },
  {
    id: "fence",
    name: "Fence",
    tags: ["wood", "garden", "border"],
    footprint: 1.2,
    description: "A short picket fence, about 2.4 m.",
    build: (seed) =>
      buildFence(seed, [
        { ax: -1.2, az: 0, bx: 0, bz: 0, y: 0 },
        { ax: 0, az: 0, bx: 1.2, bz: 0, y: 0 }
      ])
  },
  { id: "rose_arch", name: "Rose arch", tags: ["garden", "flower", "gate", "arch"], footprint: 0.9, description: "A wooden arch covered in roses.", build: (seed) => buildRoseArch(seed, 0.7) },
  {
    id: "rowboat",
    name: "Rowboat",
    tags: ["water", "boat", "wood"],
    footprint: 1.2,
    description: "A small rowboat tied to a post.",
    build: (seed) => buildRowboat(seed, new THREE.Vector3(1.2, 0, 0))
  }
];

export const LH_FEATURE_ENTRIES: ResourceEntry[] = FEATURES.map((f) => ({
  id: `lh:feature:${f.id}`,
  name: f.name,
  kind: "feature",
  source: "local",
  origin: ORIGIN,
  license: LICENSE,
  tags: ["little-habitats", "feature", ...f.tags],
  description: f.description,
  footprint: f.footprint,
  create: (seed) => featureInstance(f.build(seed))
}));

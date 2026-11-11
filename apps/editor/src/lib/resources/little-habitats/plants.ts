// Island kit plants as library entries. Each placed plant is one instance in its own
// SpeciesBatch, with the Island kit flora shader: wind, seasonal leaves, blossom, flowers
// and fruit, and the growth animation (a new plant grows from 0 to full size in 1.2 s).
import * as THREE from "three";
import { Rng } from "@/vendor/little-habitats/core/rng";
import { NEVER, SpeciesBatch, type FloraInstance } from "@/vendor/little-habitats/flora/batch";
import { updateSeasonState } from "@/vendor/little-habitats/flora/look";
import { SPECIES, SPECIES_IDS, type SpeciesId } from "@/vendor/little-habitats/flora/species";
import { UNIFORMS } from "@/vendor/little-habitats/fx/pokefx";
import type { ResourceEntry, ResourceInstance } from "../types";
import { clockState } from "./runtime";

const ORIGIN = "Island kit";
const LICENSE = "Owned by the Theras AI author";

function plantInstance(id: SpeciesId, seed: number, grow: boolean): ResourceInstance {
  const group = new THREE.Group();
  const batch = new SpeciesBatch(id, group);
  const rng = new Rng(seed);
  const now = UNIFORMS.uTime.value;
  const plant: FloraInstance = {
    id: `${id}:${seed}`,
    sp: id,
    slot: -1,
    x: 0,
    y: 0,
    z: 0,
    rotY: rng.next() * Math.PI * 2,
    scale: 0.86 + rng.next() * 0.28,
    variant: rng.next(),
    gFrom: grow ? 0 : 1,
    gTo: 1,
    gT0: grow ? now : now - 10,
    birth: grow ? now : now - 10,
    death: NEVER,
    seen: 0
  };
  batch.add(plant);
  batch.flush();
  let lastYear = -1;
  return {
    object: group,
    update: () => {
      const year = clockState().yearFrac;
      if (Math.abs(year - lastYear) > 1e-4) {
        updateSeasonState(id, batch.uni, year, batch.state);
        lastYear = year;
      }
    },
    dispose: () => {
      batch.mesh.geometry.dispose();
      batch.mesh.dispose();
      batch.mat.dispose();
      batch.depth?.dispose();
      batch.base.dispose();
    }
  };
}

const CATEGORY_TAGS: Record<string, string[]> = {
  tree: ["tree", "forest", "shade"],
  shrub: ["shrub", "bush", "garden", "hedge"],
  flower: ["flower", "garden", "meadow", "color"],
  ground: ["ground", "cover", "meadow", "grass"],
  water: ["water", "pond", "lake"],
  stone: ["stone", "rock", "dry"]
};

export const LH_PLANT_ENTRIES: ResourceEntry[] = SPECIES_IDS.map((id) => {
  const species = SPECIES[id];
  return {
    id: `lh:plant:${id}`,
    name: species.name,
    kind: "plant",
    source: "local",
    origin: ORIGIN,
    license: LICENSE,
    tags: ["little-habitats", "plant", species.category, ...(CATEGORY_TAGS[species.category] ?? [])],
    description: `${species.name}: a ${species.category} plant that sways in the wind and changes with the seasons.`,
    footprint: Math.max(0.15, species.radius),
    selfAnimates: true,
    create: (seed, opts) => plantInstance(id, seed, opts?.appear ?? false)
  };
});

/** The Seeds slot: a land plant chosen by the seed, mostly flowers and small plants. */
const SEED_MIX: SpeciesId[] = SPECIES_IDS.filter((id) => SPECIES[id].category !== "water");
const SEED_WEIGHTS = SEED_MIX.map((id) => {
  const c = SPECIES[id].category;
  return c === "flower" ? 4 : c === "ground" ? 3 : c === "shrub" ? 2 : 1;
});

function pickSeedSpecies(seed: number): SpeciesId {
  const total = SEED_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = new Rng(seed ^ 0x5eed).next() * total;
  for (let i = 0; i < SEED_MIX.length; i++) {
    r -= SEED_WEIGHTS[i]!;
    if (r <= 0) return SEED_MIX[i]!;
  }
  return SEED_MIX[0]!;
}

export const LH_SEED_MIX_ENTRY: ResourceEntry = {
  id: "lh:plant:seed_mix",
  name: "Seed mix",
  kind: "plant",
  source: "local",
  origin: ORIGIN,
  license: LICENSE,
  tags: ["little-habitats", "plant", "seeds", "random", "flower", "meadow"],
  description: "Sows one land plant chosen at random: mostly flowers and ground plants, some shrubs and trees.",
  footprint: 0.6,
  selfAnimates: true,
  nameFor: (seed) => SPECIES[pickSeedSpecies(seed)].name,
  create: (seed, opts) => plantInstance(pickSeedSpecies(seed), seed, opts?.appear ?? false)
};

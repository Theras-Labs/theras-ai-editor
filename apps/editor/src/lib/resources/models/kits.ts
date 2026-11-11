// Modular model kits (CC0 1.0, kenney.nl): castle, city, modular buildings and a fantasy village,
// in public/library/models/<category>. Each kit keeps one scale so its pieces still fit together.
// Whole buildings (city kits) are ready to place; the other kits are building blocks: walls,
// towers, roofs, stairs, gates. The AI uses them as reference parts for quick builds.
import type { ResourceEntry, ResourceKind } from "../types";
import { KIT_MODELS } from "./kits.generated";
import { LIBRARY_BASE, modelInstance, titleCase } from "./gltf-model";

type KitInfo = {
  /** Display category in the library. */
  category: string;
  /** World meters per model unit. */
  scale: number;
  tags: string[];
  /** Name prefix for whole buildings, so "Building A" from two kits stays distinct. */
  buildingPrefix?: string;
  about: string;
};

const KITS: Record<string, KitInfo> = {
  castle: {
    category: "Castle",
    scale: 2,
    tags: ["castle", "medieval", "stone", "fort", "kingdom"],
    about: "a modular castle piece (walls, towers, gates, bridges, siege engines). Pieces snap on a 2 m grid"
  },
  building: {
    category: "Buildings: modular",
    scale: 1.5,
    tags: ["building", "house", "modular", "interior", "architecture"],
    about: "a modular building piece (walls, doors, windows, floors, roofs, stairs). Pieces snap on a grid"
  },
  "city-commercial": {
    category: "City: commercial",
    scale: 3,
    tags: ["city", "town", "urban", "commercial", "shop", "modern"],
    buildingPrefix: "Shop",
    about: "a city building or street detail"
  },
  "city-industrial": {
    category: "City: industrial",
    scale: 3,
    tags: ["city", "industrial", "factory", "urban", "modern"],
    buildingPrefix: "Factory",
    about: "an industrial building or yard detail"
  },
  fantasy: {
    category: "Fantasy village",
    scale: 2,
    tags: ["fantasy", "medieval", "village", "rpg", "timber"],
    about: "a fantasy village piece (timber walls, fortified walls, towers, roofs, docks, props). Pieces snap on a 2 m grid"
  }
};

const PLANT = /\b(tree|shrub|bush|hedge|flower|grass)\b/;
const FEATURE =
  /\b(rocks?|fence|flag|banner|pennant|siege|ballista|catapult|trebuchet|ram|barrels?|crate|cart|detail|ladder|pulley|chimney|tank|container|solar|parasol|awning|overhang|log|trunk|water|dock|barricade|gutter|pipe|plating)\b/;

function kindFor(set: string, slug: string): ResourceKind {
  const words = slug.replace(/-/g, " ");
  if (PLANT.test(words) && !/\b(log|trunk)\b/.test(words)) return "plant";
  if (set.startsWith("city") && /^(low-detail-)?building/.test(slug)) return "building";
  if (/\b(windmill|water tower)\b/.test(words)) return "landmark";
  if (FEATURE.test(words)) return "feature";
  return "building";
}

function nameFor(info: KitInfo, slug: string) {
  if (info.buildingPrefix && /^(low-detail-)?building-/.test(slug)) {
    const lowDetail = slug.startsWith("low-detail-");
    const rest = slug.replace(/^(low-detail-)?building-/, "").replace(/-/g, " ").toUpperCase();
    return `${info.buildingPrefix} building ${rest}${lowDetail ? " (low detail)" : ""}`;
  }
  return titleCase(slug);
}

export const KIT_ENTRIES: ResourceEntry[] = Object.entries(KIT_MODELS).flatMap(([set, kit]) => {
  const info = KITS[set];
  if (!info) return [];
  return kit.models.map(([slug, w, d, h]) => {
    const name = nameFor(info, slug);
    const size = `${(w * info.scale).toFixed(1)} x ${(d * info.scale).toFixed(1)} x ${(h * info.scale).toFixed(1)} m`;
    return {
      id: `model:${set}:${slug}`,
      name,
      kind: kindFor(set, slug),
      source: "local",
      origin: "Kenney",
      license: "CC0 1.0 (kenney.nl)",
      category: info.category,
      preview: `${LIBRARY_BASE}/models/${kit.folder}/previews/${slug}.png`,
      tags: [...info.tags, ...slug.split("-").filter((t) => t.length > 1)],
      description: `${name}: ${info.about}. About ${size} (w x d x h).`,
      footprint: Math.max(0.3, (Math.max(w, d) * info.scale) / 2),
      create: () => modelInstance(`${LIBRARY_BASE}/models/${kit.folder}/${slug}.glb`, { scale: info.scale })
    } satisfies ResourceEntry;
  });
});

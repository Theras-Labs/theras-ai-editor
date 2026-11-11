// Measured building data for the city generator (pure, no three.js).
//
// Footprints and heights: KIT_MODELS in src/lib/resources/models/kits.generated.ts. That file is
// generated from the bounding boxes of the GLB files in public/library/models/city/, in model
// units (width x, depth z, height y). The library places each model centered on its bounding box,
// standing on y = 0, at the kit scale (kits.ts: city kits use scale 3).
//
// Facades: FACADE_TRIS below. Measured 2026-11-11 from the same GLB files with a one-shot script:
// for each model, the count of triangles in the lowest 35 % of the height whose normal points
// along -z, +z, -x, +x. The street facade (shop windows, doors, balconies) has many more
// triangles than a plain back wall. Result: every Kenney city building has its front on local -z.
// A second detailed facade on -x or +x marks a corner building (two street faces).
import { KIT_MODELS } from "../../resources/models/kits.generated";

/** Kit scale of the city kits in the library (kits.ts, "city-commercial" and "city-industrial"). */
export const KIT_SCALE = 3;
/** Meters per model unit in the city: one storey of the kit (0.43 units) is about 3.4 m. */
export const UNIT_METERS = 8;
/** Node scale for city buildings (on top of the kit scale). */
export const BUILDING_NODE_SCALE = UNIT_METERS / KIT_SCALE;

export type Zone = "commercial" | "industrial";

/** Ground-floor triangle counts by normal direction: [-z, +z, -x, +x]. */
const FACADE_TRIS: Record<string, [number, number, number, number]> = {
  "city-commercial:building-a": [85, 21, 28, 29],
  "city-commercial:building-b": [81, 22, 33, 31],
  "city-commercial:building-c": [80, 29, 74, 39],
  "city-commercial:building-d": [84, 18, 26, 27],
  "city-commercial:building-e": [142, 104, 64, 58],
  "city-commercial:building-f": [146, 64, 76, 75],
  "city-commercial:building-g": [158, 54, 83, 66],
  "city-commercial:building-h": [91, 25, 37, 37],
  "city-commercial:building-i": [175, 89, 81, 80],
  "city-commercial:building-j": [364, 364, 247, 247],
  "city-commercial:building-k": [185, 97, 60, 61],
  "city-commercial:building-l": [256, 152, 89, 90],
  "city-commercial:building-m": [348, 272, 185, 184],
  "city-commercial:building-n": [304, 310, 191, 189],
  "city-commercial:building-skyscraper-a": [148, 60, 60, 60],
  "city-commercial:building-skyscraper-b": [158, 70, 70, 70],
  "city-commercial:building-skyscraper-c": [153, 67, 77, 78],
  "city-commercial:building-skyscraper-d": [156, 72, 82, 75],
  "city-commercial:building-skyscraper-e": [138, 62, 51, 50],
  "city-industrial:building-a": [121, 43, 48, 48],
  "city-industrial:building-b": [169, 76, 75, 67],
  "city-industrial:building-c": [146, 127, 181, 151],
  "city-industrial:building-d": [43, 39, 40, 40],
  "city-industrial:building-e": [136, 107, 112, 82],
  "city-industrial:building-f": [210, 93, 104, 97],
  "city-industrial:building-g": [102, 77, 70, 61],
  "city-industrial:building-h": [46, 49, 43, 35],
  "city-industrial:building-i": [81, 32, 46, 36],
  "city-industrial:building-j": [46, 38, 50, 36],
  "city-industrial:building-k": [52, 35, 28, 23],
  "city-industrial:building-l": [233, 190, 135, 131],
  "city-industrial:building-m": [150, 150, 142, 142],
  "city-industrial:building-n": [113, 51, 81, 98],
  "city-industrial:building-o": [23, 15, 23, 23],
  "city-industrial:building-p": [90, 46, 53, 53],
  "city-industrial:building-q": [80, 60, 58, 62],
  "city-industrial:building-r": [125, 96, 101, 68],
  "city-industrial:building-s": [130, 33, 49, 49],
  "city-industrial:building-t": [166, 58, 71, 67]
};

export type BuildingModel = {
  /** Library id, for example "model:city-commercial:building-a". */
  id: string;
  zone: Zone;
  /** Size in city meters at BUILDING_NODE_SCALE: w along local x (the street front), d along local z (depth). */
  w: number;
  d: number;
  h: number;
  /** A second street facade on local -x or +x (a corner building), or null. */
  side: "-x" | "+x" | null;
  /** Kit height in model units (for the height gradient). */
  units: number;
};

function sideFacade(t: [number, number, number, number]): "-x" | "+x" | null {
  const [front, , mx, px] = t;
  if (mx >= front * 0.7 && mx >= px * 1.3) return "-x";
  if (px >= front * 0.7 && px >= mx * 1.3) return "+x";
  return null;
}

function modelsOf(zone: Zone): BuildingModel[] {
  const set = `city-${zone}`;
  const kit = KIT_MODELS[set];
  if (!kit) return [];
  return kit.models
    .filter(([slug]) => /^building-/.test(slug) && FACADE_TRIS[`${set}:${slug}`])
    .map(([slug, w, d, h]) => ({
      id: `model:${set}:${slug}`,
      zone,
      w: w * UNIT_METERS,
      d: d * UNIT_METERS,
      h: h * UNIT_METERS,
      side: sideFacade(FACADE_TRIS[`${set}:${slug}`]),
      units: h
    }));
}

export const BUILDING_MODELS: Record<Zone, BuildingModel[]> = {
  commercial: modelsOf("commercial"),
  industrial: modelsOf("industrial")
};

/** Size in city meters of a kit detail model at a node scale factor (1 = building scale). */
export function detailSize(zone: Zone, slug: string, factor = 1): { w: number; d: number; h: number } | null {
  const row = KIT_MODELS[`city-${zone}`]?.models.find((m) => m[0] === slug);
  if (!row) return null;
  return { w: row[1] * UNIT_METERS * factor, d: row[2] * UNIT_METERS * factor, h: row[3] * UNIT_METERS * factor };
}

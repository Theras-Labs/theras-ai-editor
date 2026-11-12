// The resource library: every entry the editor and the AI can use, local and external.
import { CREATURE_ENTRIES, VEHICLE_ENTRIES } from "./models/creatures";
import { PEOPLE_ENTRIES } from "./models/people";
import { GAME_MARKER_ENTRIES } from "./game/player-start";
import { KIT_ENTRIES } from "./models/kits";
import { FOLIO_TREE_ENTRIES } from "./nature/folio-trees";
import { VEGETATION_ENTRIES } from "./nature/vegetation";
import { WATER_ENTRIES } from "./water/stylized-water";
import { PUDDLE_ENTRIES } from "./water/puddle";
import { DEFAULT_SLOTS, THERAS_TREE_SLOT } from "@/lib/build-slots/presets";
import { LH_SKY_ENTRIES } from "./little-habitats/environment";
import { LH_PLANT_ENTRIES, LH_SEED_MIX_ENTRY } from "./little-habitats/plants";
import { LH_FEATURE_ENTRIES, LH_LANDMARK_ENTRIES } from "./little-habitats/props";
import { GENERATED_ENTRIES } from "./generated";
import { ALLEY_ARENA_ENTRIES } from "./environments/alley-arena";
import { DESERT_WORLD_ENTRIES } from "./environments/desert-world";
import { PORT_PLACE_ENTRIES, PORT_PROP_ENTRIES, PORT_SKY_ENTRIES } from "./port";
import { PORT_ACTOR_ENTRIES } from "./port/actors";
import { getScannedEntry, scannedEntries, scannedScore } from "./external/scanned";
import type { ResourceEntry, ResourceKind, ResourceSource } from "./types";

const THERAS_RECIPES: ResourceEntry[] = [...DEFAULT_SLOTS, THERAS_TREE_SLOT].filter((slot) => slot.recipe).map((slot) => ({
  id: `theras:recipe:${slot.id}`,
  name: slot.label,
  kind: "recipe",
  source: "local",
  origin: "Theras",
  license: "MIT",
  tags: ["block", "blockout", "primitive", slot.id],
  category: "Blocks (primitives)",
  description: `${slot.label} blockout made of editor primitives. Prefer a model from the library for a finished look.`,
  footprint: 0.5,
  recipe: slot.recipe
}));

/** External skies: CC0 HDR images from Poly Haven (polyhaven.com), loaded when used. */
const POLY_HAVEN = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k";
const EXTERNAL_HDRIS: ResourceEntry[] = [
  { slug: "kloofendal_48d_partly_cloudy_puresky", name: "Partly cloudy sky", tags: ["day", "clouds", "blue"] },
  { slug: "qwantani_dusk_2_puresky", name: "Dusk sky", tags: ["evening", "warm", "sunset"] },
  { slug: "satara_night_no_lamps", name: "Night sky", tags: ["night", "stars"] }
].map((h) => ({
  id: `polyhaven:hdri:${h.slug}`,
  name: h.name,
  kind: "hdri" as const,
  source: "external" as const,
  origin: "Poly Haven",
  license: "CC0",
  tags: ["sky", "hdri", "photo", ...h.tags],
  description: `Photographic sky image (${h.slug}) from Poly Haven, used as background and lighting.`,
  footprint: 0,
  url: `${POLY_HAVEN}/${h.slug}_1k.hdr`
}));

const LH_TERRAIN: ResourceEntry = {
  id: "lh:terrain:island",
  name: "Island terrain",
  kind: "terrain",
  source: "local",
  origin: "Island kit",
  license: "Owned by the Theras AI author",
  tags: ["little-habitats", "island", "terrain", "water", "land", "ground"],
  description: "An editable island on a lake. Soil, Stone and Water in the dock raise, paint and lower it.",
  footprint: 16
};

/** Browsing category for entries that do not set one. */
function defaultCategory(entry: ResourceEntry): string {
  const island = entry.id.startsWith("lh:");
  if (entry.id.startsWith("nature:")) {
    const group = entry.id.split(":")[1] ?? "plant";
    return `Nature: ${group === "grass" ? "grass" : `${group}s`}`;
  }
  switch (entry.kind) {
    case "terrain":
      return "Island";
    case "landmark":
      return island ? "Island: landmarks" : "Landmarks";
    case "feature":
      return island ? "Island: features" : "Features";
    case "plant":
      return island ? "Plants: garden" : "Plants";
    case "sky":
      return "Skies";
    case "hdri":
      return "Skies: photo";
    case "water":
      return "Water";
    default:
      return "Other";
  }
}

const ALL_RESOURCES: ResourceEntry[] = [
  LH_TERRAIN,
  ...LH_LANDMARK_ENTRIES,
  ...LH_FEATURE_ENTRIES,
  // The base trees come before every other plant: a question such as "Which trees?" lists its
  // options in this order.
  ...FOLIO_TREE_ENTRIES,
  LH_SEED_MIX_ENTRY,
  ...LH_PLANT_ENTRIES,
  ...VEGETATION_ENTRIES,
  ...LH_SKY_ENTRIES,
  ...WATER_ENTRIES,
  ...PUDDLE_ENTRIES,
  ...ALLEY_ARENA_ENTRIES,
  ...DESERT_WORLD_ENTRIES,
  ...PORT_PLACE_ENTRIES,
  ...PORT_SKY_ENTRIES,
  ...PORT_PROP_ENTRIES,
  ...PORT_ACTOR_ENTRIES,
  ...KIT_ENTRIES,
  ...VEHICLE_ENTRIES,
  // The rigged human comes before the creatures: "a person" or "a character" finds it first.
  ...PEOPLE_ENTRIES,
  ...CREATURE_ENTRIES,
  ...GAME_MARKER_ENTRIES,
  ...THERAS_RECIPES,
  ...GENERATED_ENTRIES,
  ...EXTERNAL_HDRIS
];

export const RESOURCES: ResourceEntry[] = ALL_RESOURCES.map((entry) => (entry.category ? entry : { ...entry, category: defaultCategory(entry) }));

const byId = new Map(RESOURCES.map((entry) => [entry.id, entry]));

/** Old ids from before the library was organized by category; saved scenes still use them. */
function currentId(id: string) {
  if (id === "desert:ship:caravan-a") return "vehicle:caravan-ship";
  if (id.startsWith("desert:creature:")) return `creature:${id.slice("desert:creature:".length)}`;
  return id;
}

/**
 * Adds entries at run time (models of an imported project). An entry with the same id is
 * replaced. Search and lookups see them at once; the system prompt's index does not list them.
 */
export function registerRuntimeEntries(entries: ResourceEntry[]) {
  for (const entry of entries) {
    const i = RESOURCES.findIndex((e) => e.id === entry.id);
    if (i >= 0) RESOURCES[i] = entry;
    else RESOURCES.push(entry);
    byId.set(entry.id, entry);
  }
}

export function getResource(id: string): ResourceEntry | undefined {
  // Scanned objects ("scan:<id>", external/scanned.ts) are not in RESOURCES: only the ones that
  // a search found or that a scene of this viewer used are known.
  return byId.get(id) ?? byId.get(currentId(id)) ?? getScannedEntry(id);
}

/** Simple word match over name, tags, kind, origin and description. */
export function searchResources(query: string, filter: { kind?: ResourceKind; source?: ResourceSource } = {}, limit = 12) {
  return searchResourcesScored(query, filter, limit).map((r) => r.entry);
}

/** "benches" -> "bench", "berries" -> "berry", "trees" -> "tree". */
export function singularWord(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Common words that the library names differently. A synonym hit scores 0.5 less than a direct hit. */
const SYNONYMS: Record<string, string[]> = {
  boat: ["rowboat", "ship"],
  canoe: ["rowboat"],
  ship: ["boat"],
  fire: ["campfire"],
  bonfire: ["campfire"],
  seat: ["bench"],
  chair: ["bench"],
  lamp: ["lantern"],
  light: ["lantern"],
  torch: ["lantern"],
  house: ["building", "cottage", "shed"],
  home: ["building", "house"],
  hut: ["shed", "building"],
  shop: ["building"],
  rock: ["stone", "rocks"],
  boulder: ["rocks", "stone"],
  bush: ["shrub", "hedge"],
  shrub: ["bush", "hedge"],
  flower: ["tulip", "daisy", "poppy", "rose", "sunflower", "bluebell"],
  tree: ["oak", "pine", "birch"],
  sea: ["ocean", "water"],
  lake: ["water", "lagoon"],
  pond: ["water", "pond"],
  river: ["water"],
  well: ["wishing_well"],
  mill: ["windmill", "water_wheel"],
  temple: ["shrine"],
  bees: ["beehive"],
  bee: ["beehive"],
  hive: ["beehive"],
  dock: ["dock", "pier"],
  pier: ["dock"],
  jetty: ["dock"],
  sky: ["sky"],
  monster: ["creature"],
  animal: ["creature"],
  dog: ["hound"],
  wall: ["wall"],
  fortress: ["castle"],
  fort: ["castle"],
  barrel: ["barrels"]
};

/** Search variants of a query word: [word, weight]. The word itself, its singular, then synonyms. */
function wordVariants(word: string): [string, number][] {
  const out: [string, number][] = [[word, 0]];
  const single = singularWord(word);
  if (single !== word) out.push([single, 0]);
  for (const w of [word, single]) for (const syn of SYNONYMS[w] ?? []) if (!out.some(([v]) => v === syn)) out.push([syn, 0.5]);
  return out;
}

/**
 * searchResources with the score of each result: 3 for each word in the name, 2 in a tag, 1
 * elsewhere. A plural word also matches its singular; a synonym match scores 0.5 less.
 *
 * Scanned objects (external photo scans, external/scanned.ts) come after every entry of
 * RESOURCES, whatever their match: their score is scaled to less than 0.5, the lowest score
 * of a local match.
 */
export function searchResourcesScored(query: string, filter: { kind?: ResourceKind; source?: ResourceSource } = {}, limit = 12) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(wordVariants);
  const local = scoreEntries(RESOURCES, words, filter);
  if (local.length >= limit) return local.slice(0, limit);
  const scanned = scoreEntries(scannedEntries(), words, filter).map((r) => ({ entry: r.entry, score: scannedScore(r.score) }));
  return [...local, ...scanned].slice(0, limit);
}

function scoreEntries(entries: ResourceEntry[], words: [string, number][][], filter: { kind?: ResourceKind; source?: ResourceSource }) {
  const scored = entries.filter((e) => (!filter.kind || e.kind === filter.kind) && (!filter.source || e.source === filter.source))
    .map((entry) => {
      const name = entry.name.toLowerCase();
      const hay = `${entry.id} ${entry.kind} ${entry.category ?? ""} ${entry.tags.join(" ")} ${entry.description}`.toLowerCase();
      let score = words.length === 0 ? 1 : 0;
      for (const variants of words) {
        let best = 0;
        for (const [w, minus] of variants) {
          const hit = name.includes(w) ? 3 : entry.tags.some((t) => t.startsWith(w)) ? 2 : hay.includes(w) ? 1 : 0;
          if (hit > 0) best = Math.max(best, hit - (hit > 1 ? minus : 0));
        }
        score += best;
      }
      // Real models and code-built objects come before blocks made of editor primitives.
      if (score > 0 && entry.kind === "recipe") score = Math.max(0.5, score - 2.5);
      // The base set (tag "basic") wins a tie: "a tree" finds the oak before the treehouse.
      if (score > 0 && entry.tags.includes("basic")) score += 0.4;
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored;
}

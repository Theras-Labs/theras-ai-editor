// Scanned objects: photo scans of real household products (Google Scanned Objects by Google
// Research, CC BY 4.0), as GLB files in the Hugging Face dataset codepawl/scanned-objects-glb.
// Plan: docs/plans/realtime-ai-harness.md, section 6.
//
// - The Theras server holds the index (server/data/assets-index.json) and searches it
//   (GET /api/assets/search). external/scanned-search.ts asks it; this file makes no request.
// - A search result becomes a library entry here ("scan:<id>", tag "scanned"). These entries are
//   not in RESOURCES: the catalog puts them after every local entry in a search, and the library
//   index of the AI prompts does not list them.
// - The GLB loads from the Hugging Face host when an object is built (placed), not before.
//   gltf-model.ts keeps a loaded file, so each file loads one time in a session.
// - An entry that was built is remembered for this viewer (localStorage), so a saved scene
//   shows its scanned objects after a reload with no request to the server.
import { modelInstance } from "../models/gltf-model";
import type { ResourceEntry } from "../types";

export const SCANNED_PREFIX = "scan:";
export const SCANNED_TAG = "scanned";
/** The editor loads scanned files only from this dataset on this host. */
export const SCANNED_URL_PREFIX = "https://huggingface.co/datasets/codepawl/scanned-objects-glb/resolve/";

/** One result of GET /api/assets/search (AssetEntry in server/src/assets.ts, plus the search score). */
export type ScannedAsset = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  /** Width (x), height (y) and depth (z) in meters. */
  size_metres: [number, number, number];
  triangles: number;
  bytes: number;
  thumb: string;
  glb: string;
  license: string;
  attribution: string;
  source: string;
  /** Search result only: 3 for each query word in the name, 2 in a tag, 1 for the start of a word. */
  score?: number;
  /** Search result only: how many of the query words this model matches. */
  matched?: number;
};

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** True for a complete record whose files are on the source host. Other records are not used. */
export function isScannedAsset(value: unknown): value is ScannedAsset {
  const a = value as Partial<ScannedAsset> | null;
  return (
    !!a &&
    typeof a === "object" &&
    typeof a.id === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(a.id) &&
    typeof a.name === "string" &&
    a.name.length > 0 &&
    typeof a.category === "string" &&
    Array.isArray(a.tags) &&
    a.tags.every((t) => typeof t === "string") &&
    Array.isArray(a.size_metres) &&
    a.size_metres.length === 3 &&
    a.size_metres.every(positive) &&
    typeof a.glb === "string" &&
    a.glb.startsWith(SCANNED_URL_PREFIX) &&
    a.glb.endsWith(".glb") &&
    typeof a.thumb === "string" &&
    a.thumb.startsWith(SCANNED_URL_PREFIX) &&
    typeof a.attribution === "string" &&
    typeof a.source === "string" &&
    a.source.startsWith("https://")
  );
}

const meters = (m: number) => (m < 0.995 ? m.toFixed(2) : m.toFixed(1));

/** "0.08 x 0.08 x 0.29 m (w x d x h)": the real size of the scan. */
export function scannedSizeText(asset: Pick<ScannedAsset, "size_metres">): string {
  const [w, h, d] = asset.size_metres;
  return `${meters(w)} x ${meters(d)} x ${meters(h)} m (w x d x h)`;
}

// ── Registry ──────────────────────────────────────────────────

const assets = new Map<string, ScannedAsset>();
const entries = new Map<string, ResourceEntry>();
let entryList: ResourceEntry[] = [];

const USED_KEY = "theras:scanned-used";
const USED_MAX = 200;
const used = new Map<string, ScannedAsset>();

/** Remembers an asset that was built in a scene, so the scene shows it after a reload. */
function rememberUsed(asset: ScannedAsset) {
  if (used.has(asset.id)) return;
  const { score: _score, matched: _matched, ...record } = asset;
  used.set(asset.id, record);
  try {
    localStorage.setItem(USED_KEY, JSON.stringify([...used.values()].slice(-USED_MAX)));
  } catch {
    // No storage (a test, a private window): the object still works in this session.
  }
}

/** The library entry of a scanned asset. Real size: the file is in meters, so the scale is 1. */
export function scannedEntry(asset: ScannedAsset): ResourceEntry {
  const [w, , d] = asset.size_metres;
  return {
    id: `${SCANNED_PREFIX}${asset.id}`,
    name: asset.name,
    kind: "feature",
    source: "external",
    origin: "Google Research (Google Scanned Objects)",
    license: "CC BY 4.0",
    credit: asset.attribution,
    creditUrl: asset.source,
    category: `Scanned: ${asset.category}`,
    preview: asset.thumb,
    tags: [SCANNED_TAG, "realistic", "photo", ...asset.tags],
    description: `${asset.name}: a photo scan of a real product (${asset.category}) at its real size, ${scannedSizeText(asset)}.`,
    footprint: Math.max(0.05, Math.max(w, d) / 2),
    create: () => {
      rememberUsed(asset);
      return modelInstance(asset.glb, { scale: 1 });
    }
  };
}

/** Adds search results to the registry. Returns their entries in the same order. Bad records are left out. */
export function registerScanned(found: unknown[]): ResourceEntry[] {
  const out: ResourceEntry[] = [];
  let added = false;
  for (const asset of found) {
    if (!isScannedAsset(asset)) continue;
    const id = `${SCANNED_PREFIX}${asset.id}`;
    let entry = entries.get(id);
    if (!entry) {
      entry = scannedEntry(asset);
      entries.set(id, entry);
      assets.set(id, asset);
      added = true;
    }
    out.push(entry);
  }
  if (added) entryList = [...entries.values()];
  return out;
}

/** Every scanned entry that this session knows (search results and remembered objects). */
export function scannedEntries(): ResourceEntry[] {
  return entryList;
}

export function getScannedEntry(id: string): ResourceEntry | undefined {
  return entries.get(id);
}

/** The index record of a registered entry (size, triangles, bytes). */
export function scannedAssetOf(entryId: string): ScannedAsset | undefined {
  return assets.get(entryId);
}

export function isScannedId(id: string): boolean {
  return id.startsWith(SCANNED_PREFIX);
}

/**
 * The search score of a scanned entry. A local match scores 0.5 or more; this stays under
 * 0.45, so a scanned entry comes after every local entry, also when a caller sorts again.
 * A better match still comes before a weaker one.
 */
export function scannedScore(score: number): number {
  return score > 0 ? (0.45 * score) / (score + 1) : 0;
}

/** True when the words ask for a realistic object ("a realistic mug", "a real shoe", "a scanned toy"). */
export function wantsRealistic(prompt: string): boolean {
  return /\b(realistic|photo-?realistic|photoreal|lifelike|life-like|real|real-life|real-world|scanned|photo-?scan(ned)?|3d scan)\b/i.test(prompt);
}

// At start: the assets that this viewer built before. No request; the data is in localStorage.
try {
  if (typeof localStorage !== "undefined") {
    const saved = JSON.parse(localStorage.getItem(USED_KEY) ?? "[]") as unknown;
    if (Array.isArray(saved)) {
      for (const asset of saved) if (isScannedAsset(asset)) used.set(asset.id, asset);
      registerScanned([...used.values()]);
    }
  }
} catch {
  // Broken saved data: start with no remembered objects.
}

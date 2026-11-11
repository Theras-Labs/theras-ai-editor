// External asset index (plan docs/plans/realtime-ai-harness.md, section 6).
// The file server/data/assets-index.json is written by hand with scripts/build-asset-index.ts.
// The server reads it one time at start and searches it in memory. Nothing in this file makes
// a network request, and nothing here runs on a timer.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ASSET_DATASET = "codepawl/scanned-objects-glb";
export const ASSET_HOST = "https://huggingface.co";
/** Licenses that allow a copy to be given to other people. Lower case, as on a dataset card. */
export const REDISTRIBUTABLE_LICENSES = ["cc-by-4.0", "cc0-1.0"];
/** Largest GLB file after packing (the column pack_bytes). */
export const MAX_ASSET_BYTES = 1_000_000;
/** Most triangles for one model. The scans are not simplified; 20,000 keeps 69% of them. */
export const MAX_ASSET_TRIANGLES = 20_000;
/** Columns of metadata.jsonl that the index needs. */
export const REQUIRED_COLUMNS = ["id", "name", "category", "license", "file", "thumb", "size_metres", "triangles", "pack_bytes", "source"] as const;

/** One line of metadata.jsonl in the dataset (only the columns that the index reads). */
export type DatasetRow = {
  id: string;
  name: string;
  category: string;
  brand?: string | null;
  license: string;
  /** Path of the GLB in the dataset repository. */
  file: string;
  /** Path of the thumbnail in the dataset repository. */
  thumb: string;
  /** Width (x), height (y) and depth (z) in meters. Y is up. */
  size_metres: [number, number, number];
  triangles: number;
  pack_bytes: number;
  /** Page of the original scan. */
  source: string;
};

export type AssetEntry = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  styleTags: string[];
  size_metres: [number, number, number];
  triangles: number;
  bytes: number;
  thumb: string;
  glb: string;
  license: string;
  attribution: string;
  /** Page of the original work (CC BY asks for a link to the source). */
  source: string;
};

export type AssetIndex = {
  dataset: string;
  /** Commit of the dataset that the URLs point to. The files of a commit do not change. */
  revision: string;
  generatedAt: string;
  license: string;
  limits: { maxBytes: number; maxTriangles: number };
  counts: { source: number; kept: number; license: number; bytes: number; triangles: number; invalid: number };
  assets: AssetEntry[];
};

export type AssetLimits = { maxBytes: number; maxTriangles: number };
export const ASSET_LIMITS: AssetLimits = { maxBytes: MAX_ASSET_BYTES, maxTriangles: MAX_ASSET_TRIANGLES };

// ── Filter (used by the index script) ─────────────────────────

export type RowVerdict = "keep" | "invalid" | "license" | "bytes" | "triangles";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
/** Each part of a path starts with a letter or a digit, so "." and ".." are not parts. */
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9_.-]*(\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** "CC-BY-4.0", "cc-by-4.0" and "CC BY 4.0" are the same license. */
export function normalLicense(license: unknown): string {
  return typeof license === "string" ? license.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
}

/**
 * The filter of the index. A row is kept only when all of these are true:
 * its columns are complete, its license allows redistribution, its GLB is at most
 * limits.maxBytes and it has at most limits.maxTriangles triangles.
 */
export function judgeRow(row: unknown, limits: AssetLimits = ASSET_LIMITS): RowVerdict {
  const r = row as Partial<DatasetRow> | null;
  if (!r || typeof r !== "object") return "invalid";
  if (typeof r.id !== "string" || !SAFE_ID.test(r.id)) return "invalid";
  if (typeof r.name !== "string" || !r.name.trim()) return "invalid";
  if (typeof r.category !== "string" || !r.category.trim()) return "invalid";
  if (typeof r.file !== "string" || !SAFE_PATH.test(r.file) || !r.file.endsWith(".glb")) return "invalid";
  if (typeof r.thumb !== "string" || !SAFE_PATH.test(r.thumb)) return "invalid";
  if (typeof r.source !== "string" || !/^https:\/\//.test(r.source)) return "invalid";
  if (!Array.isArray(r.size_metres) || r.size_metres.length !== 3 || !r.size_metres.every(positive)) return "invalid";
  if (!positive(r.triangles) || !positive(r.pack_bytes)) return "invalid";
  if (!REDISTRIBUTABLE_LICENSES.includes(normalLicense(r.license))) return "license";
  if (r.pack_bytes > limits.maxBytes) return "bytes";
  if (r.triangles > limits.maxTriangles) return "triangles";
  return "keep";
}

export function assetFileUrl(revision: string, path: string): string {
  return `${ASSET_HOST}/datasets/${ASSET_DATASET}/resolve/${revision}/${path}`;
}

/** The credit that CC BY 4.0 asks for: author, copyright, license, and that the file was changed. */
export const ASSET_ATTRIBUTION = "Scan by Google Research (Copyright 2020 Google LLC), CC BY 4.0. Converted to GLB by codepawl.";

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && w !== "and");

export function toAssetEntry(row: DatasetRow, revision: string): AssetEntry {
  const brand = typeof row.brand === "string" ? words(row.brand) : [];
  return {
    id: row.id,
    name: row.name.trim(),
    category: row.category.trim(),
    tags: [...new Set([...words(row.category), ...brand])],
    styleTags: ["scanned"],
    size_metres: row.size_metres,
    triangles: row.triangles,
    bytes: row.pack_bytes,
    thumb: assetFileUrl(revision, row.thumb),
    glb: assetFileUrl(revision, row.file),
    license: "CC-BY-4.0",
    attribution: ASSET_ATTRIBUTION,
    source: row.source
  };
}

/** Builds the index from the rows of the dataset. Pure: the script gives the rows and the time. */
export function buildAssetIndex(rows: unknown[], revision: string, generatedAt: string, limits: AssetLimits = ASSET_LIMITS): AssetIndex {
  const counts = { source: rows.length, kept: 0, license: 0, bytes: 0, triangles: 0, invalid: 0 };
  const assets: AssetEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    let verdict = judgeRow(row, limits);
    if (verdict === "keep" && seen.has((row as DatasetRow).id)) verdict = "invalid";
    if (verdict !== "keep") {
      counts[verdict] += 1;
      continue;
    }
    seen.add((row as DatasetRow).id);
    assets.push(toAssetEntry(row as DatasetRow, revision));
  }
  assets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  counts.kept = assets.length;
  return { dataset: ASSET_DATASET, revision, generatedAt, license: "CC-BY-4.0", limits, counts, assets };
}

// ── Load (one time at server start) ───────────────────────────

export const ASSET_INDEX_FILE = fileURLToPath(new URL("../data/assets-index.json", import.meta.url));

const EMPTY_INDEX: AssetIndex = {
  dataset: ASSET_DATASET,
  revision: "",
  generatedAt: "",
  license: "CC-BY-4.0",
  limits: ASSET_LIMITS,
  counts: { source: 0, kept: 0, license: 0, bytes: 0, triangles: 0, invalid: 0 },
  assets: []
};

/** Reads the index file. A missing or broken file gives an empty index and one log line. */
export function loadAssetIndex(file: string = ASSET_INDEX_FILE): AssetIndex {
  try {
    const index = JSON.parse(readFileSync(file, "utf8")) as AssetIndex;
    if (!Array.isArray(index.assets)) throw new Error("assets is not a list");
    return index;
  } catch (error) {
    console.warn(`[assets] no index at ${file} (${error instanceof Error ? error.message : String(error)}). Run: bun scripts/build-asset-index.ts`);
    return EMPTY_INDEX;
  }
}

// ── Search (in memory) ────────────────────────────────────────

/** Words that do not name an object. Every model in the index is a scan, so "realistic" selects nothing. */
const STOP_WORDS = new Set(
  (
    "a an the of to in on at by for from with and or some any my me add place put spawn create make build give show find please " +
    "realistic real scanned scan photo photoreal photorealistic lifelike object objects model models thing things item items"
  ).split(" ")
);

/** "mugs" -> "mug", "batteries" -> "battery", "boxes" -> "box". */
export function singularWord(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** The search words of a query: lower case, singular, no stop words, each word one time. */
export function assetQueryWords(query: string): string[] {
  const out: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOP_WORDS.has(raw)) continue;
    const word = singularWord(raw);
    if (!STOP_WORDS.has(word) && !out.includes(word)) out.push(word);
  }
  return out.slice(0, 12);
}

type SearchKeys = { name: Set<string>; tags: Set<string>; all: string[] };
const keysOf = new WeakMap<AssetEntry, SearchKeys>();

function searchKeys(asset: AssetEntry): SearchKeys {
  let keys = keysOf.get(asset);
  if (!keys) {
    // "TablePurple" is two words; "3DS" stays one.
    const split = (text: string) =>
      text
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .map(singularWord);
    const name = new Set(split(asset.name));
    const tags = new Set(asset.tags.flatMap(split));
    keys = { name, tags, all: [...name, ...tags] };
    keysOf.set(asset, keys);
  }
  return keys;
}

export type AssetHit = { asset: AssetEntry; score: number; matched: number };

/** Score of one query word: 3 = a word of the name, 2 = a tag (category, brand), 1 = the start of a word. */
function wordScore(keys: SearchKeys, word: string): number {
  if (keys.name.has(word)) return 3;
  if (keys.tags.has(word)) return 2;
  return word.length >= 3 && keys.all.some((k) => k.startsWith(word)) ? 1 : 0;
}

const browseOrders = new WeakMap<AssetEntry[], AssetEntry[]>();

/** Order for an empty query: one model of each category in turn, so the first page shows every kind. */
function browseOrder(assets: AssetEntry[]): AssetEntry[] {
  let order = browseOrders.get(assets);
  if (!order) {
    const groups = new Map<string, AssetEntry[]>();
    for (const asset of assets) {
      const group = groups.get(asset.category);
      if (group) group.push(asset);
      else groups.set(asset.category, [asset]);
    }
    const lists = [...groups.values()];
    order = [];
    for (let i = 0; order.length < assets.length; i++) for (const list of lists) if (i < list.length) order.push(list[i]!);
    browseOrders.set(assets, order);
  }
  return order;
}

export const ASSET_SEARCH_MAX = 50;

/**
 * Searches the index. Results that match more of the query words come first, then the higher
 * score, then the smaller file. An empty query (or only stop words) lists the index by category.
 */
export function searchAssets(assets: AssetEntry[], query: string, limit = 12): { words: string[]; hits: AssetHit[] } {
  const max = Math.min(ASSET_SEARCH_MAX, Math.max(1, Math.floor(limit) || 12));
  const queryWords = assetQueryWords(query);
  if (queryWords.length === 0) {
    return { words: [], hits: browseOrder(assets).slice(0, max).map((asset) => ({ asset, score: 0, matched: 0 })) };
  }
  const hits: AssetHit[] = [];
  for (const asset of assets) {
    const keys = searchKeys(asset);
    let score = 0;
    let matched = 0;
    for (const word of queryWords) {
      const s = wordScore(keys, word);
      if (s > 0) matched += 1;
      score += s;
    }
    if (matched > 0) hits.push({ asset, score, matched });
  }
  hits.sort((a, b) => b.matched - a.matched || b.score - a.score || a.asset.bytes - b.asset.bytes || (a.asset.id < b.asset.id ? -1 : 1));
  return { words: queryWords, hits: hits.slice(0, max) };
}

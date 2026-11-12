// How an entry is made: by code only, or from asset files that load at run time.
// The library shows it on each card and has a filter for each, and the AI sees it in search
// results, so the user can tell a procedural object from an external sample file.
import { PROCEDURAL_TAG } from "./port";
import type { ResourceEntry } from "./types";

export type AssetMake = "code" | "files";

/**
 * Id prefixes of the families whose look comes from a model file:
 * - "model:", "creature:", "vehicle:": GLB files in public/library/models (models/kits.ts,
 *   models/creatures.ts). "creature:person" also loads a GLB (models/people.ts).
 * - "project:": GLB or glTF files of an imported project (lib/projects/projects.ts).
 * - "scan:": external photo scans (external/scanned.ts).
 * These entries have no `url` field (the file path is inside `create`), so the id is the
 * only data that marks them.
 */
const FILE_PREFIXES = ["model:", "creature:", "vehicle:", "project:", "scan:", "polyhaven:"];

/**
 * Entries built in code that still take their look from picture files. The alley arena loads
 * painted atlases and posters from public/library/environments/alley-arena, and its walls and
 * props are drawn with them.
 */
const FILE_IDS = new Set(["env:alley-arena"]);

/**
 * "files" when the look of the entry comes from an asset file at run time (a model, an HDR
 * image, painted pictures, an external download). "code" when code builds it.
 *
 * Small tiling masks do not count: the water surfaces (water/stylized-water.ts, also used by
 * the generated river) load noise and normal maps, and the base trees use one leaf mask that
 * is inline in the code. Their shapes and colors are code, so they are "code".
 */
export function assetMake(entry: ResourceEntry): AssetMake {
  if (entry.tags.includes(PROCEDURAL_TAG)) return "code";
  if (entry.source === "external" || entry.url) return "files";
  if (FILE_IDS.has(entry.id) || FILE_PREFIXES.some((p) => entry.id.startsWith(p))) return "files";
  return "code";
}

export function makeLabel(make: AssetMake): string {
  return make === "code" ? "Procedural" : "Sample file";
}

export function countByMake(entries: ResourceEntry[]): { code: number; files: number } {
  let code = 0;
  for (const entry of entries) if (assetMake(entry) === "code") code++;
  return { code, files: entries.length - code };
}

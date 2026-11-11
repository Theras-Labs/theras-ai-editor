// Asks the Theras server for scanned objects: GET /api/assets/search (server/src/main.ts). The
// server searches its index in memory; it makes no request to Hugging Face.
//
// One request for each new query, sent only when the user does something (types in the library
// search, opens the "Scanned" filter, sends a prompt). No timer, no retry, no request when the
// editor is idle. An answer is kept in memory, so the same query does not go out again.
import { getTherasApiUrl } from "@/lib/copilot/server-provider";
import { isScannedAsset, registerScanned, type ScannedAsset } from "./scanned";

export type ScannedSearch = {
  /** Models in the server's index (0 when the server did not answer). */
  total: number;
  /** Results, best first. Their library entries are registered ("scan:<id>"). */
  assets: ScannedAsset[];
};

const EMPTY: ScannedSearch = { total: 0, assets: [] };
const answers = new Map<string, Promise<ScannedSearch>>();
let knownTotal = 0;

/** Models in the server's index, as the last answer said (0 before the first answer). */
export function scannedTotal(): number {
  return knownTotal;
}

/**
 * Searches the server's index and registers the results as library entries. A failure (no
 * server, a timeout) gives an empty result; the next action of the user asks again.
 */
export function searchScanned(query: string, limit = 12, timeoutMs = 1500): Promise<ScannedSearch> {
  const base = getTherasApiUrl();
  if (!base) return Promise.resolve(EMPTY);
  const q = query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
  const key = `${limit}|${q}`;
  let pending = answers.get(key);
  if (!pending) {
    pending = fetch(`${base}/api/assets/search?q=${encodeURIComponent(q)}&limit=${limit}`, { signal: AbortSignal.timeout(timeoutMs) })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { total?: unknown; results?: unknown };
        const found = (Array.isArray(body.results) ? body.results : []).filter(isScannedAsset);
        registerScanned(found);
        if (typeof body.total === "number") knownTotal = body.total;
        return { total: knownTotal, assets: found };
      })
      .catch((error) => {
        answers.delete(key);
        console.info(`[scanned] the asset search did not answer: ${error instanceof Error ? error.message : String(error)}`);
        return EMPTY;
      });
    answers.set(key, pending);
  }
  return pending;
}

// Scanned objects for the director (plan docs/plans/realtime-ai-harness.md, section 6).
// The director sees scanned objects only in two cases:
//   1. the user's words ask for a realistic object ("add a realistic mug"), or
//   2. a simple "add <thing>" request names a thing that the local library does not have.
// In every other case this file makes no request and adds nothing to the context.
// The rule that tells the director when it may use one is in brief.ts ("Scanned objects").
import { SCANNED_PREFIX, scannedSizeText, wantsRealistic, type ScannedAsset } from "@/lib/resources/external/scanned";
import { searchScanned, type ScannedSearch } from "@/lib/resources/external/scanned-search";
import { contentWords, parseInstantPrompt } from "../instant-path";
import { NOT_NOUNS, type NounMatch } from "./brief";

/** Words that describe a thing, or stand in for one, and do not name it. */
const ATTRIBUTES = new Set(
  (
    "realistic photorealistic photoreal lifelike real scanned scan photo " +
    "red blue green yellow orange purple pink black white brown grey gray golden gold silver wooden metal plastic old modern " +
    "one ones thing things object objects item items model models something anything stuff"
  ).split(" ")
);

/** "make the tower taller", "put the bench there": a change to a thing that exists, not a new thing. */
const NAMES_AN_EXISTING_THING = /^\W*(?:(?:please|pls|hey|ok|okay)\s+)?(?:(?:can|could|would) you\s+)?[a-z]+\s+(?:the|this|that|these|those|my|it)\b/i;

export const SCANNED_CONTEXT_REALISTIC = 6;
export const SCANNED_CONTEXT_NO_MATCH = 4;

export type ScannedQuery = {
  /** The user's words ask for a realistic object. */
  realistic: boolean;
  /** The words that name the thing. */
  words: string[];
};

/**
 * The search words for the scanned index, or null when this prompt gets no scanned objects.
 * local = the library matches of the same prompt (resolveNouns).
 */
export function scannedQuery(prompt: string, local: NounMatch[]): ScannedQuery | null {
  const realistic = wantsRealistic(prompt);
  const parsed = parseInstantPrompt(prompt);
  if (!realistic && (!parsed || NAMES_AN_EXISTING_THING.test(prompt))) return null;
  const raw = parsed ? contentWords(parsed.thing) : prompt.toLowerCase().split(/[^a-z0-9]+/);
  const words = [...new Set(raw.filter((w) => w.length > 2 && !NOT_NOUNS.has(w) && !ATTRIBUTES.has(w) && !/^\d+$/.test(w)))].slice(0, 6);
  if (words.length === 0) return null;
  if (!realistic) {
    // The library has the thing: local entries win, and no request is made.
    const covered = new Set(local.flatMap((m) => m.term.split(" ")));
    if (words.every((w) => covered.has(w))) return null;
  }
  return { realistic, words };
}

/**
 * The results that go to the director. Realistic request: the results that match the most
 * words, by name or by category. No local match: only results whose name has every word.
 */
export function pickScanned(found: ScannedAsset[], query: ScannedQuery): ScannedAsset[] {
  if (query.realistic) {
    const best = Math.max(0, ...found.map((a) => a.matched ?? 0));
    if (best === 0) return [];
    return found.filter((a) => (a.matched ?? 0) === best && (a.score ?? 0) >= 2 * best).slice(0, SCANNED_CONTEXT_REALISTIC);
  }
  const n = query.words.length;
  return found.filter((a) => (a.matched ?? 0) === n && (a.score ?? 0) >= 3 * n).slice(0, SCANNED_CONTEXT_NO_MATCH);
}

export function scannedMatchesToText(picked: ScannedAsset[], query: ScannedQuery): string {
  if (picked.length === 0) return query.realistic ? "[Scanned objects: none match this request]" : "";
  return [
    "[Scanned objects: photo scans of real products at real size, from an external source. Use one only by the Scanned objects rule.]",
    ...picked.map((a) => `${SCANNED_PREFIX}${a.id} (${a.name}; ${a.category}; ${scannedSizeText(a)})`)
  ].join("\n");
}

/**
 * The context block for the director, or "". At most one request to the Theras server, and
 * only in the two cases at the top of this file. The results become library entries, so the
 * compose generator can place them by id.
 */
export async function scannedContext(
  prompt: string,
  local: NounMatch[],
  search: (query: string, limit: number) => Promise<ScannedSearch> = searchScanned
): Promise<string> {
  const query = scannedQuery(prompt, local);
  if (!query) return "";
  const { assets } = await search(query.words.join(" "), 24);
  return scannedMatchesToText(pickScanned(assets, query), query);
}

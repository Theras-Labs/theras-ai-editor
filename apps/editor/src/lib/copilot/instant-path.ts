// Tier 0, the instant library path (plan 4.7). Before any model call, a simple prompt such as
// "add a lighthouse" or "place 3 lanterns near the windmill" is parsed in code. When the
// library has one clear match, the editor places it at once through the same tools as the
// AI (place_resource, apply_template, generate_island, set_environment), so undo, the build
// reveal and the chat trace work the same. When the strict rule does not match, the prompt
// goes to the model. This file never guesses.
import type { EditorCore } from "@theras/editor-core";
import type { Vec3 } from "@theras/shared";
import { searchResourcesScored } from "@/lib/resources/catalog";
import { SCENE_TEMPLATES } from "@/lib/resources/templates";
import { findSpots, sceneGroundAt, type LayoutNode, type PlacementScene, type Spot, type SpotAnchor } from "@/lib/resources/layout";
import type { ResourceKind } from "@/lib/resources/types";
import { cityGroundAt, readSites, rectContains, siteNodeIds, siteObstacles } from "./director/site";
import type { BuiltSite } from "./director/types";
import { digestNodes } from "./scene-digest";
import type { CopilotToolCall } from "./types";

// ── Parser ────────────────────────────────────────────────────

export type InstantRelation = "near" | "around" | "on";

export type InstantParse = {
  verb: string;
  count: number;
  /** The object words, without the count and the article. */
  thing: string;
  relation?: InstantRelation;
  anchor?: string;
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, another: 1, single: 1,
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  "a couple of": 2, "a pair of": 2
};
export const INSTANT_MAX_COUNT = 20;

/** Words that make a count or an object vague: the model decides those. */
const VAGUE = /\b(some|few|several|many|more|lots?|bunch|various|random|nicer|better|prettier|cool|interesting|something|anything|stuff|things)\b/;
/** More than one object, or an order of steps. */
const MULTI = /,|;|&|\+|\b(and|with|then|plus|also|but|or|while|after|before)\b/;
const PRONOUN_THING = /^(it|this|that|them|these|those|everything|the scene|scene|all)\b/;

const PATTERN =
  /^(add|place|put|spawn|create|make)\s+(?:(a couple of|a pair of|a|an|one|another|single|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3})\s+)?(.+?)(?:\s+(near|next to|beside|around|on|onto)\s+(.+))?$/;

function normalize(prompt: string) {
  return prompt
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(please|pls|hey|ok|okay)\s+/, "")
    .replace(/^(can|could|would) you\s+/, "")
    .replace(/\s+(please|pls)$/, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

/** Parses "(add|place|put|spawn|create|make) [count] <thing> [near|next to|on|around <anchor>]". */
export function parseInstantPrompt(prompt: string): InstantParse | null {
  const text = normalize(prompt);
  if (!text || text.length > 80 || text.includes("\n")) return null;
  if (MULTI.test(text) || VAGUE.test(text)) return null;
  const m = PATTERN.exec(text);
  if (!m) return null;
  const [, verb, countWord, rawThing, rawRelation, rawAnchor] = m;
  let count = 1;
  if (countWord) count = /^\d+$/.test(countWord) ? Number(countWord) : NUMBER_WORDS[countWord] ?? NaN;
  if (!Number.isInteger(count) || count < 1 || count > INSTANT_MAX_COUNT) return null;
  const thing = rawThing.replace(/^(the|a|an)\s+/, "").trim();
  if (!thing || PRONOUN_THING.test(thing)) return null;
  const relation: InstantRelation | undefined = !rawRelation
    ? undefined
    : rawRelation === "around"
      ? "around"
      : rawRelation === "on" || rawRelation === "onto"
        ? "on"
        : "near";
  const anchor = rawAnchor?.replace(/^(the|a|an|my)\s+/, "").trim();
  if (relation && !anchor) return null;
  return { verb, count, thing, relation, anchor };
}

// ── Match rule ────────────────────────────────────────────────

export type InstantCandidate = {
  type: "resource" | "template";
  id: string;
  name: string;
  kind: ResourceKind | "template";
  footprint: number;
  score: number;
};

const STOP_WORDS = new Set(["a", "an", "the", "of", "new", "little", "small", "tiny"]);

/** Content words of the object phrase (articles out, "small" etc. do not need to match). */
export function contentWords(thing: string): string[] {
  return thing.split(/[^a-z0-9]+/).filter((w) => w && !STOP_WORDS.has(w));
}

function singular(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function scoreTemplate(words: string[], t: (typeof SCENE_TEMPLATES)[number]) {
  const name = t.name.toLowerCase();
  const tags = t.id.split("-");
  const hay = `${t.id} template scene ${t.description}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (name.includes(w)) score += 3;
    else if (tags.some((tag) => tag.startsWith(w))) score += 2;
    else if (hay.includes(w)) score += 1;
  }
  return score;
}

/** Library entries and templates ranked for the words, with the same scores as searchResources. */
export function rankCandidates(words: string[]): InstantCandidate[] {
  const query = words.join(" ");
  const exact = (name: string) => (name.toLowerCase() === query ? 2 : 0);
  // A piece of a themed model kit (model:castle:*, model:city-industrial:*, ...) needs a word of
  // its kit in the prompt: "windmill" is the island windmill, "industrial windmill" the city one.
  const kitPenalty = (id: string, category: string | undefined) => {
    if (!id.startsWith("model:")) return 0;
    const kitWords = `${id.split(":")[1] ?? ""} ${category ?? ""}`.toLowerCase();
    return words.some((w) => kitWords.includes(w)) ? 0 : 2;
  };
  const resources: InstantCandidate[] = searchResourcesScored(query, {}, 50).map(({ entry, score }) => ({
    type: "resource",
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    footprint: entry.footprint,
    score: score + exact(entry.name) - kitPenalty(entry.id, entry.category)
  }));
  const templates: InstantCandidate[] = SCENE_TEMPLATES.map((t) => ({
    type: "template" as const,
    id: t.id,
    name: t.name,
    kind: "template" as const,
    footprint: 0,
    score: scoreTemplate(words, t) + exact(t.name)
  })).filter((c) => c.score > 0);
  return [...resources, ...templates].sort((a, b) => b.score - a.score);
}

/**
 * The strict rule: the best result scores 3 or more for each content word (every word is in
 * its name) and at least 2 points more than the second result. An exact full-name match gets
 * 2 extra points, so "lantern" picks "Lantern" over "Friendship lantern". Plural words are
 * tried in the singular when the words as written do not match.
 */
export function matchThing(thing: string, rank: (words: string[]) => InstantCandidate[] = rankCandidates): InstantCandidate | null {
  const words = contentWords(thing);
  if (words.length === 0 || words.length > 4) return null;
  const variants = [words];
  const singularWords = words.map(singular);
  if (singularWords.join(" ") !== words.join(" ")) variants.push(singularWords);
  for (const variant of variants) {
    const [best, second] = rank(variant);
    if (!best) continue;
    if (best.score >= 3 * variant.length && best.score - (second?.score ?? 0) >= 2) return best;
  }
  return null;
}

// ── Placement (pure) ──────────────────────────────────────────

export type InstantAnchor = SpotAnchor;

// The placement scene and findSpots live in the layout solver (shared with place_resources).
export { findSpots };
export type { PlacementScene };

const CAMERA_WORDS = new Set(["me", "here", "camera", "the camera", "view", "the view", "center", "the center"]);
const SELECTION_WORDS = new Set(["it", "this", "that", "selection", "the selection", "selected", "the selected object"]);
const GROUND_WORDS = new Set(["island", "land", "ground", "the island", "the land", "the ground", "terrain"]);

/** Finds the node that the anchor words name. Ambiguous or unknown anchors give null. */
export function resolveAnchor(anchor: string, scene: PlacementScene): InstantAnchor | null {
  const a = anchor.trim();
  if (CAMERA_WORDS.has(a)) {
    const t = scene.cameraTarget ?? { x: 0, y: 0, z: 0 };
    return { x: t.x, z: t.z, radius: 0, name: "the camera target" };
  }
  const placeable = scene.nodes.filter((n) => !n.kind.startsWith("sky"));
  const pick = (n: LayoutNode): InstantAnchor => ({ x: n.position.x, z: n.position.z, radius: n.radius ?? 0.5, terrain: n.terrain, name: n.name });
  if (SELECTION_WORDS.has(a)) {
    const selected = placeable.filter((n) => scene.selection.includes(n.id));
    return selected.length === 1 ? pick(selected[0]) : null;
  }
  if (GROUND_WORDS.has(a)) {
    const terrains = placeable.filter((n) => n.terrain);
    return terrains.length === 1 ? pick(terrains[0]) : null;
  }
  const exact = placeable.filter((n) => n.name.toLowerCase() === a);
  if (exact.length === 1) return pick(exact[0]);
  if (exact.length > 1) return null;
  const words = contentWords(a).map(singular);
  if (words.length === 0) return null;
  const partial = placeable.filter((n) => {
    const name = n.name.toLowerCase();
    return words.every((w) => name.includes(w));
  });
  return partial.length === 1 ? pick(partial[0]) : null;
}

export type InstantSpot = Spot;

const round = (n: number) => Math.round(n * 100) / 100;

export type InstantPlan = {
  calls: CopilotToolCall[];
  match: InstantCandidate;
  parse: InstantParse;
  /** Assistant text for the chat. */
  summary: string;
};

let callCounter = 0;
function callId() {
  callCounter += 1;
  return `inst_${Date.now().toString(36)}_${callCounter}`;
}

/** Tool calls for a prompt, or null when the strict rule does not match. Pure except ids and seeds. */
export function planInstant(prompt: string, scene: PlacementScene, rank: (words: string[]) => InstantCandidate[] = rankCandidates): InstantPlan | null {
  const parse = parseInstantPrompt(prompt);
  if (!parse) return null;
  const match = matchThing(parse.thing, rank);
  if (!match) return null;

  // Whole-scene results: one only, and no anchor.
  if (match.type === "template" || match.kind === "terrain" || match.kind === "sky" || match.kind === "hdri") {
    if (parse.count !== 1 || parse.anchor) return null;
    const call: CopilotToolCall =
      match.type === "template"
        ? { id: callId(), name: "apply_template", args: { id: match.id } }
        : match.kind === "terrain"
          ? { id: callId(), name: "generate_island", args: {} }
          : { id: callId(), name: "set_environment", args: { id: match.id } };
    const what = match.type === "template" ? `the ${match.name} template` : match.name;
    return { calls: [call], match, parse, summary: `Applied ${what} from the library.` };
  }

  const anchor = parse.anchor ? resolveAnchor(parse.anchor, scene) : null;
  if (parse.anchor && !anchor) return null;
  if (parse.relation === "on" && anchor && !anchor.terrain) return null; // "on top of" needs heights we do not know yet
  if (parse.relation === "around" && anchor?.terrain) return null;

  const spots = findSpots(parse.count, match.footprint, scene, anchor, parse.relation, { needsLand: match.kind !== "water" && match.kind !== "creature" });
  if (!spots) return null;

  const calls = spots.map<CopilotToolCall>((spot) => ({
    id: callId(),
    name: "place_resource",
    args: {
      id: match.id,
      x: round(spot.x),
      y: round(spot.y),
      z: round(spot.z),
      rotationY: round(Math.random() * Math.PI * 2),
      seed: Math.floor(Math.random() * 1e6)
    }
  }));
  const where = anchor ? ` ${parse.relation === "around" ? "around" : parse.relation === "on" ? "on" : "near"} ${anchor.name}` : "";
  const what = parse.count === 1 ? match.name : `${parse.count} x ${match.name}`;
  return { calls, match, parse, summary: `Placed ${what}${where} from the library.` };
}

// ── Editor glue (browser) ─────────────────────────────────────

/** The scene as the layout solver sees it: digest nodes, selection, camera target, island ground. */
export function placementSceneOf(editor: EditorCore, cameraTarget?: Vec3): PlacementScene {
  return {
    nodes: digestNodes(editor),
    selection: [...editor.selection.ids],
    cameraTarget,
    groundAt: sceneGroundAt()
  };
}

/**
 * The placement scene for small things (props, plants): the same scene, plus the street surfaces
 * and river water of built sites as obstacles, and the sidewalk height inside a city. A bench
 * or a tree then never lands on a road. Generators that route by the city plan themselves
 * (river, architecture) use placementSceneOf.
 */
export function propPlacementSceneOf(editor: EditorCore, cameraTarget?: Vec3): PlacementScene {
  const scene = placementSceneOf(editor, cameraTarget);
  const sites = readSites(editor);
  if (sites.length === 0) return scene;
  return withSites(scene, sites, (id) => siteNodeIds(editor, id));
}

/**
 * The site part of propPlacementSceneOf (pure). Inside an interior (the anchor is in the rect
 * of an interior site) the host building and the interior folder are no obstacles, the
 * furniture is, and the ground in the room is the interior floor. A building with no interior
 * stays an obstacle.
 */
export function withSites(scene: PlacementScene, sites: BuiltSite[], nodesOfSite: (siteId: string) => string[]): PlacementScene {
  const extra = siteObstacles(sites);
  const base = scene.groundAt;
  const hasCity = sites.some((s) => s.facts.city);
  const anchor = scene.cameraTarget;
  const room = anchor ? sites.find((s) => s.facts.interior && rectContains(s.facts.rect, anchor.x, anchor.z)) : undefined;
  const free = new Set<string>();
  if (room?.facts.interior) {
    for (const id of nodesOfSite(room.id)) free.add(id);
    if (room.facts.interior.host) for (const id of nodesOfSite(room.facts.interior.host)) free.add(id);
  }
  // The model names a built thing by its folder id. A building folder gets the radius of its
  // site, so "around the tower" is a ring outside it. A city or a river folder stays a point.
  const byId = new Map(sites.map((s) => [s.id, s]));
  const nodes = scene.nodes
    .filter((n) => !free.has(n.id))
    .map((n) => {
      const site = byId.get(n.id);
      if (!site || site.facts.city || site.facts.river || n.radius !== undefined) return n;
      const r = site.facts.rect;
      return { ...n, position: { ...n.position, x: site.facts.center.x, z: site.facts.center.z }, radius: Math.max(r.x1 - r.x0, r.z1 - r.z0) / 2 };
    });
  // Without a terrain the ground is y = 0; inside a city it is the sidewalk level.
  let groundAt = hasCity ? (x: number, z: number) => cityGroundAt(sites, x, z) ?? (base ? base(x, z) : 0) : base;
  if (room?.facts.interior) {
    const outside = groundAt;
    const { rect, interior } = room.facts;
    groundAt = (x, z) => (rectContains(rect, x, z) ? interior.floorY : outside ? outside(x, z) : 0);
  }
  return { ...scene, nodes: extra.length ? [...nodes, ...extra] : nodes, groundAt };
}

/** Builds the Tier 0 plan for the current scene, or null (then the prompt goes to the model). */
export function buildInstantPlan(editor: EditorCore, prompt: string, cameraTarget?: Vec3): InstantPlan | null {
  if (!parseInstantPrompt(prompt)) return null;
  return planInstant(prompt, propPlacementSceneOf(editor, cameraTarget));
}

// The built-in "compose" generator: library objects placed by the layout solver, through the
// same executor path as the AI tools (set_environment, place_resource, place_resources).
// Params follow the place_resources contract of plan 5.7.
import { RESOURCES, getResource } from "@/lib/resources/catalog";
import { LAYOUT_MAX_COUNT, LAYOUT_PATTERNS } from "@/lib/resources/layout";
import type { ResourceEntry } from "@/lib/resources/types";
import type { EditorCore } from "@theras/editor-core";
import type { CopilotToolCall, CopilotToolResult } from "../types";
import type { Brief, ChoiceAnswers, ChoiceOption, ChoiceQuestion, Generator, GeneratorResult } from "./types";

export type ComposeItem = {
  id: string;
  count?: number;
  layout?: { pattern: string; anchor?: unknown; to?: unknown; radius?: number; facing?: string };
  seed?: number;
};

export type ComposeParams = {
  folder?: string;
  items: ComposeItem[];
  /** Sky id (kind sky or hdri). */
  environment?: string;
  /** Water surface id (kind water). */
  water?: string;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ── Tool execution with the build reveal ─────────────────────

let callCounter = 0;
/** Runs one editor tool and starts the build reveal for each node it created. */
// The executor and the reveal load on first use: they pull in the whole editor runtime, which
// the unit tests of the choices and the validation do not need.
export async function executeWithReveal(editor: EditorCore, name: string, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const [{ executeTool }, { hasPendingReveal, markBuildReveal }] = await Promise.all([import("../tool-executor"), import("@/lib/build-reveal")]);
  callCounter += 1;
  const call: CopilotToolCall = { id: `cmp_${Date.now().toString(36)}_${callCounter}`, name, args };
  const before = new Set(editor.scene.nodes.keys());
  const result = executeTool(editor, call);
  const added: string[] = [];
  for (const id of editor.scene.nodes.keys()) if (!before.has(id) && !hasPendingReveal(id)) added.push(id);
  if (added.length > 0) markBuildReveal(added);
  return result;
}

function parseResult(result: CopilotToolResult): Record<string, unknown> {
  try {
    const parsed = JSON.parse(result.result);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ── Validation ────────────────────────────────────────────────

/** Returns valid ComposeParams, or an error text. */
export function validateCompose(params: Record<string, unknown>): ComposeParams | string {
  const out: ComposeParams = { items: [] };
  const dropped: string[] = [];
  if (typeof params.folder === "string" && params.folder.trim()) out.folder = params.folder.trim().slice(0, 60);
  const env = typeof params.environment === "string" ? getResource(params.environment) : undefined;
  if (env && (env.kind === "sky" || env.kind === "hdri")) out.environment = env.id;
  const water = typeof params.water === "string" ? getResource(params.water) : undefined;
  if (water && water.kind === "water") out.water = water.id;
  for (const raw of Array.isArray(params.items) ? params.items.slice(0, 24) : []) {
    if (!isRecord(raw)) continue;
    const entry = typeof raw.id === "string" ? getResource(raw.id) : undefined;
    if (!entry) {
      dropped.push(String(raw.id ?? "?"));
      continue;
    }
    // A sky or a water surface in items: move it to its own field.
    if (entry.kind === "sky" || entry.kind === "hdri") {
      out.environment ??= entry.id;
      continue;
    }
    if (entry.kind === "water") {
      out.water ??= entry.id;
      continue;
    }
    if (entry.kind === "terrain") continue;
    const item: ComposeItem = { id: entry.id };
    if (typeof raw.count === "number" && Number.isFinite(raw.count)) item.count = Math.min(LAYOUT_MAX_COUNT, Math.max(1, Math.floor(raw.count)));
    if (isRecord(raw.layout) && typeof raw.layout.pattern === "string" && (LAYOUT_PATTERNS as string[]).includes(raw.layout.pattern)) {
      item.layout = raw.layout as ComposeItem["layout"];
    }
    if (typeof raw.seed === "number") item.seed = raw.seed;
    out.items.push(item);
  }
  if (out.items.length === 0 && !out.environment && !out.water) {
    return dropped.length ? `No library entry for ${dropped.slice(0, 4).join(", ")}.` : "No library objects to place.";
  }
  return out;
}

// ── Choices ───────────────────────────────────────────────────

type Family = { question: string; title: string; members: (e: ResourceEntry) => boolean };

const hasTag = (e: ResourceEntry, tag: string) => e.tags.some((t) => t.toLowerCase() === tag);
const notKit = (e: ResourceEntry) => !e.id.startsWith("model:");

/** Plant families that get a "Which ...?" question when the library has 3 or more of the kind. */
const PLANT_FAMILIES: Family[] = [
  { question: "tree", title: "Which trees?", members: (e) => e.kind === "plant" && notKit(e) && hasTag(e, "tree") },
  { question: "bush", title: "Which bushes?", members: (e) => e.kind === "plant" && notKit(e) && (hasTag(e, "shrub") || hasTag(e, "bush")) && !hasTag(e, "tree") },
  { question: "flower", title: "Which flowers?", members: (e) => e.kind === "plant" && notKit(e) && hasTag(e, "flower") && !hasTag(e, "water") }
];

/** Whole buildings of a city kit ("building-*" pieces). */
function buildingFamily(id: string): Family | null {
  const m = /^model:(city-[a-z]+):building-/.exec(id);
  if (!m) return null;
  const prefix = `model:${m[1]}:building-`;
  return { question: "buildings", title: "Which buildings?", members: (e) => e.id.startsWith(prefix) };
}

export const MAX_OPTIONS = 6;
export const MAX_COMPOSE_QUESTIONS = 3;

/** Lower-case words of an entry for a vegetation match. */
const entryWords = (e: ResourceEntry) => `${e.id} ${e.name} ${e.tags.join(" ")}`.toLowerCase();

/** True when an entry fits one of the vegetation words ("cherry blossom" fits Cherry blossom). */
function fitsVegetation(e: ResourceEntry, vegetation: string[]): boolean {
  const hay = entryWords(e);
  return vegetation.some((v) => v.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).some((w) => hay.includes(w)));
}

function familyOf(id: string): Family | null {
  const entry = getResource(id);
  if (!entry) return null;
  return PLANT_FAMILIES.find((f) => f.members(entry)) ?? buildingFamily(id);
}

/**
 * Questions for the popup: one for each plant family (or city building kit) in the items that
 * has 3 or more alternatives. Suggested = the brief's pick, unless style.vegetation names another
 * option and not the pick. 3 questions maximum, 2 to 6 options each.
 */
export function composeChoices(params: ComposeParams, brief: Pick<Brief, "style">): ChoiceQuestion[] {
  const vegetation = brief.style?.vegetation ?? [];
  const questions: ChoiceQuestion[] = [];
  for (const item of params.items) {
    if (questions.length >= MAX_COMPOSE_QUESTIONS) break;
    const family = familyOf(item.id);
    if (!family || questions.some((q) => q.id === family.question)) continue;
    const pick = getResource(item.id)!;
    const members = RESOURCES.filter(family.members);
    if (members.length < 3) continue;
    let suggested = pick;
    if (vegetation.length && family.question !== "buildings" && !fitsVegetation(pick, vegetation)) {
      suggested = members.find((m) => fitsVegetation(m, vegetation)) ?? pick;
    }
    // Order: suggested, the brief's pick, other picks of this family, vegetation fits, the rest.
    const ordered: ResourceEntry[] = [];
    const add = (e: ResourceEntry | undefined) => {
      if (e && !ordered.some((o) => o.id === e.id || o.name.toLowerCase() === e.name.toLowerCase())) ordered.push(e);
    };
    add(suggested);
    add(pick);
    for (const other of params.items) if (familyOf(other.id)?.question === family.question) add(getResource(other.id));
    for (const m of members) if (vegetation.length && fitsVegetation(m, vegetation)) add(m);
    for (const m of members) add(m);
    const options: ChoiceOption[] = ordered.slice(0, MAX_OPTIONS).map((e) => ({ id: e.id, label: e.name, resourceId: e.id }));
    if (options.length < 2) continue;
    questions.push({ id: family.question, title: family.title, options, suggested: suggested.id, multiple: true });
  }
  return questions;
}

/**
 * Items after the answers. An item whose family question was answered with something other
 * than the item's own id is replaced by the chosen ids; its count is shared between them.
 */
export function applyComposeAnswers(params: ComposeParams, answers: ChoiceAnswers): ComposeItem[] {
  const out: ComposeItem[] = [];
  for (const item of params.items) {
    const family = familyOf(item.id);
    const chosen = (family ? answers[family.question]?.optionIds ?? [] : []).filter((id) => getResource(id));
    if (chosen.length === 0 || (chosen.length === 1 && chosen[0] === item.id)) {
      out.push(item);
      continue;
    }
    const count = item.count ?? 1;
    const ids = chosen.slice(0, count);
    ids.forEach((id, i) => {
      const share = Math.floor(count / ids.length) + (i < count % ids.length ? 1 : 0);
      out.push({ ...item, id, count: share, ...(item.seed !== undefined ? { seed: item.seed + i } : {}) });
    });
  }
  return out;
}

// ── The generator ─────────────────────────────────────────────

export const COMPOSE_DESCRIBE =
  'Library objects placed by code (terrain height, spacing, no overlap). params {folder?: string, items: [{id: library id, count?: 1-24, layout?: {pattern: "single"|"cluster"|"ring"|"row"|"scatter"|"shore"|"path", anchor?: node id|"camera"|"selection", to?: node id, radius?: m, facing?: "anchor"|"away"|"random"|"along"}}], environment?: sky id (lh:sky:*), water?: water id (water:*)}. For props, plants, landmarks, camps, gardens, harbors and the vegetation of a scene.';

function nameOf(id: string) {
  return getResource(id)?.name ?? id;
}

function waterExists(editor: EditorCore) {
  for (const node of editor.scene.nodes.values()) {
    const res = node.metadata?.resource;
    if (typeof res === "string" && getResource(res)?.kind === "water") return true;
  }
  return false;
}

function terrainCenter(editor: EditorCore): { x: number; z: number } | null {
  for (const node of editor.scene.nodes.values()) {
    if (node.metadata?.terrain === true) return { x: node.transform.position.x, z: node.transform.position.z };
  }
  return null;
}

export const composeGenerator: Generator = {
  id: "compose",
  describe: COMPOSE_DESCRIBE,
  validate: (params) => validateCompose(params),
  choices: (params, ctx) => composeChoices(params as ComposeParams, ctx.brief),
  run: async (rawParams, answers, ctx): Promise<GeneratorResult> => {
    const params = rawParams as ComposeParams;
    const nodeIds: string[] = [];
    const skipped: string[] = [];
    const done: string[] = [];

    if (params.environment) {
      const res = parseResult(await executeWithReveal(ctx.editor, "set_environment", { id: params.environment }));
      if (res.success === false) skipped.push(`sky ${params.environment}: ${String(res.error)}`);
      else {
        ctx.step("Sky", nameOf(params.environment));
        done.push(`the ${nameOf(params.environment)} sky`);
        if (Array.isArray(res.nodeIds)) nodeIds.push(...(res.nodeIds as string[]));
      }
    }

    if (params.water) {
      if (waterExists(ctx.editor)) skipped.push(`${nameOf(params.water)}: the scene already has water`);
      else {
        const at = terrainCenter(ctx.editor) ?? ctx.anchor;
        const res = parseResult(await executeWithReveal(ctx.editor, "place_resource", { id: params.water, x: at.x, y: 0, z: at.z }));
        if (res.success === false) skipped.push(`${nameOf(params.water)}: ${String(res.error)}`);
        else {
          ctx.step("Water", nameOf(params.water));
          done.push(nameOf(params.water).toLowerCase());
          if (Array.isArray(res.nodeIds)) nodeIds.push(...(res.nodeIds as string[]));
        }
      }
    }

    // An anchor on what an earlier task built: "@1" (task number), or a node id that does not
    // exist (the director wrote the brief before the castle was there). Both mean the largest
    // object of that task (its yard or the building), so trees go around it, not into it.
    const sceneIds = new Set([...ctx.editor.scene.nodes.keys()]);
    const builtAnchor = (index: number): string | undefined => {
      const ids = ctx.built?.[index]?.nodeIds ?? [];
      let best: string | undefined;
      let bestR = -1;
      for (const id of ids) {
        const node = ctx.editor.scene.getNode(id);
        if (!node || typeof node.metadata?.resource !== "string") continue;
        const r = typeof node.metadata.footprint === "number" ? node.metadata.footprint : 1;
        if (r > bestR) {
          bestR = r;
          best = id;
        }
      }
      return best;
    };
    const lastBuilt = () => {
      for (let i = (ctx.built?.length ?? 0) - 1; i >= 0; i--) {
        const id = builtAnchor(i);
        if (id) return id;
      }
      return undefined;
    };
    const resolveAnchor = (anchor: unknown): unknown => {
      if (typeof anchor !== "string" || anchor === "camera" || anchor === "origin" || anchor === "selection") return anchor;
      const ref = /^@(\d+)$/.exec(anchor);
      if (ref) return builtAnchor(Number(ref[1]) - 1) ?? lastBuilt() ?? { x: ctx.anchor.x, z: ctx.anchor.z };
      if (sceneIds.has(anchor)) return anchor;
      return lastBuilt() ?? { x: ctx.anchor.x, z: ctx.anchor.z };
    };
    const items = applyComposeAnswers(params, answers).map((item) => ({
      ...item,
      // No anchor: what the task before built (trees around the castle), else the director's
      // anchor (named node, selection or camera target).
      layout: {
        pattern: "cluster",
        ...item.layout,
        anchor: item.layout?.anchor !== undefined ? resolveAnchor(item.layout.anchor) : (lastBuilt() ?? { x: ctx.anchor.x, z: ctx.anchor.z }),
        ...(item.layout?.to !== undefined ? { to: resolveAnchor(item.layout.to) } : {})
      }
    }));
    let placedCount = 0;
    if (items.length > 0) {
      if (params.environment || params.water) await ctx.pause(140);
      const res = parseResult(await executeWithReveal(ctx.editor, "place_resources", { folder: params.folder, items }));
      const placed = Array.isArray(res.placed) ? (res.placed as { id: string; nodeId: string }[]) : [];
      const skippedItems = Array.isArray(res.skipped) ? (res.skipped as { id: string; reason: string }[]) : [];
      placedCount = placed.length;
      const byId = new Map<string, number>();
      for (const p of placed) {
        byId.set(p.id, (byId.get(p.id) ?? 0) + 1);
        if (p.nodeId) nodeIds.push(p.nodeId);
      }
      if (typeof res.folderId === "string") nodeIds.push(res.folderId);
      for (const [id, n] of byId) ctx.step(n > 1 ? `${n} x ${nameOf(id)}` : nameOf(id));
      for (const s of skippedItems) skipped.push(`${nameOf(s.id)}: ${s.reason}`);
      if (res.success === false && placed.length === 0 && skippedItems.length === 0) skipped.push(`objects: ${String(res.error ?? "not placed")}`);
      if (placed.length) done.push(`${placed.length} library object${placed.length === 1 ? "" : "s"}${params.folder ? ` in "${params.folder}"` : ""}`);
    }

    const summary = done.length ? `Placed ${done.join(", ")}.` : placedCount === 0 && skipped.length ? "Nothing was placed." : "Done.";
    return { nodeIds, summary, ...(skipped.length ? { skipped } : {}) };
  }
};

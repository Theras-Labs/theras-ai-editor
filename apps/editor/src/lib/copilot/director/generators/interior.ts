// Generator "interior": the fit-out of ONE room inside a building that a generator built (the
// podium hall of a modern tower), or a room that stands alone when there is no building.
// Code finds the host building, fits the room to its hall, and builds a floor, a ceiling with
// lights and the furniture of the use (src/lib/generators/interior). One folder with a site
// record (site.ts), ONE undo step. One interior for each host: a second request rebuilds it.
// No model call, no timers.
import { makeTransform, vec3, type GroupNode } from "@theras/shared";
import type { EditorCore } from "@theras/editor-core";
import { markBuildReveal } from "@/lib/build-reveal";
import { gameStore, playerPose } from "@/lib/game/game-store";
import { resolveArchParams, toStoredParams } from "@/lib/generators/architecture";
import { towerLobby } from "@/lib/generators/architecture/tower";
import {
  INTERIOR_FINISHES,
  INTERIOR_USES,
  PASSABLE_KINDS,
  interiorThumb,
  itemHalf,
  normalizeInteriorParams,
  planInterior,
  suggestUse,
  type InteriorFinish,
  type InteriorParams,
  type InteriorPlan,
  type InteriorUse
} from "@/lib/generators/interior";
import { nodeBatchCommand } from "@/lib/outliner";
import { islandGroundAt } from "@/lib/resources/layout";
import { cityNear, rectContains, rectDistance, siteMembership, siteMetadata, siteNodeIds } from "../site";
import type { Brief, BuiltSite, ChoiceAnswers, ChoiceQuestion, DirectorContext, Generator, InteriorSiteFacts, NextStep, SiteRecord, SiteRect } from "../types";

const INTERIOR_ID = "gen:interior";
const ARCH_ID = "gen:architecture";
/** A building this near to the anchor (meters) is the host when nothing closer names one. */
const HOST_REACH = 25;
/** Plan items lower than this (rugs, mats) are no obstacles for later things. */
const OBSTACLE_MIN_H = 0.3;

type HostCtx = Pick<DirectorContext, "editor" | "sites" | "anchor" | "replace" | "ask" | "prompt" | "brief">;

const isBuilding = (s: BuiltSite) => Boolean(s.facts.building) && s.generator !== "interior";
const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Host ─────────────────────────────────────────────────────

/** The building that the room is in, or undefined (then the room stands alone). */
export function findHost(ctx: HostCtx, params: Record<string, unknown>): BuiltSite | undefined {
  const sites = ctx.sites ?? [];
  const buildings = sites.filter(isBuilding);
  // 1. A site id from the brief (or the stored params of a replace). An interior id means its host.
  const id = typeof params.host === "string" ? params.host.trim() : "";
  if (id) {
    const named = sites.find((s) => s.id === id);
    if (named && isBuilding(named)) return named;
    const via = named?.facts.interior?.host;
    const viaHost = via ? buildings.find((s) => s.id === via) : undefined;
    if (viaHost) return viaHost;
  }
  // 2. Game mode: the building that the player stands in.
  if (gameStore.active && playerPose.valid) {
    const { x, z } = playerPose.position;
    const inside = buildings.find((s) => rectContains(s.facts.rect, x, z, 0.5));
    if (inside) return inside;
  }
  // 3. A selected node that belongs to a building site.
  const selected = selectionIds(ctx.editor);
  if (selected.length && buildings.length) {
    const membership = siteMembership(ctx.editor, buildings);
    for (const n of selected) {
      const siteId = membership.get(n);
      const site = siteId ? buildings.find((s) => s.id === siteId) : undefined;
      if (site) return site;
    }
  }
  // 4. The anchor inside a building.
  const a = ctx.anchor;
  const under = buildings.find((s) => rectContains(s.facts.rect, a.x, a.z));
  if (under) return under;
  // 5. The only building of the scene.
  if (buildings.length === 1) return buildings[0];
  // 6. The nearest building within reach of the anchor.
  let best: BuiltSite | undefined;
  let bestD = HOST_REACH;
  for (const s of buildings) {
    const d = rectDistance(s.facts.rect, a.x, a.z);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

function selectionIds(editor: EditorCore | undefined): string[] {
  try {
    const ids = (editor as unknown as { selection?: { ids?: Iterable<string> } })?.selection?.ids;
    return ids ? [...ids] : [];
  } catch {
    return [];
  }
}

// ── Fit: the room inside the host ────────────────────────────

type SceneNode = {
  id: string;
  parentId?: string;
  transform?: { position: { x: number; y: number; z: number }; rotation?: { y: number }; scale?: { x: number; y: number; z: number } };
  metadata?: Record<string, unknown>;
};

/** World position and turn about y of a node (the parents turn about y only). */
function worldPose(editor: EditorCore, nodeId: string): { x: number; y: number; z: number; rotY: number } | null {
  const nodes = editor?.scene?.nodes as unknown as Map<string, SceneNode> | undefined;
  const node = nodes?.get(nodeId);
  if (!nodes || !node) return null;
  let x = node.transform?.position.x ?? 0;
  let y = node.transform?.position.y ?? 0;
  let z = node.transform?.position.z ?? 0;
  let rotY = node.transform?.rotation?.y ?? 0;
  let parent = node.parentId ? nodes.get(node.parentId) : undefined;
  for (let guard = 0; parent && guard < 32; guard++) {
    const t = parent.transform;
    if (t) {
      const sx = x * (t.scale?.x ?? 1);
      const sy = y * (t.scale?.y ?? 1);
      const sz = z * (t.scale?.z ?? 1);
      const a = t.rotation?.y ?? 0;
      x = t.position.x + sx * Math.cos(a) + sz * Math.sin(a);
      y = t.position.y + sy;
      z = t.position.z - sx * Math.sin(a) + sz * Math.cos(a);
      rotY += a;
    }
    parent = parent.parentId ? nodes.get(parent.parentId) : undefined;
  }
  return { x, y, z, rotY };
}

export type RoomFit =
  | { kind: "tower"; width: number; depth: number; height: number; storey: number; plates: number; at: { x: number; y: number; z: number; rotY: number } }
  | { kind: "no-hall" }
  | { kind: "shell" };

/** The room that fits the hall of a host, or "no-hall" for a building that has none. */
export function fitRoom(editor: EditorCore, host: BuiltSite | undefined): RoomFit {
  if (!host) return { kind: "shell" };
  if (host.params.style !== "modern-tower") return { kind: "no-hall" };
  const nodes = editor?.scene?.nodes as unknown as Map<string, SceneNode> | undefined;
  let archParams: Record<string, unknown> = host.params;
  let pose: { x: number; y: number; z: number; rotY: number } | null = null;
  if (nodes) {
    for (const id of siteNodeIds(editor, host.id)) {
      const node = nodes.get(id);
      if (node?.metadata?.resource !== ARCH_ID) continue;
      pose = worldPose(editor, id);
      if (typeof node.metadata.params === "string") {
        try {
          archParams = JSON.parse(node.metadata.params) as Record<string, unknown>;
        } catch {
          // The stored site params are used instead.
        }
      }
      break;
    }
  }
  const p = toStoredParams(resolveArchParams(archParams));
  if (!pose) {
    // No building node: the place from the site params.
    const at = p.at ?? host.facts.center;
    pose = { x: at.x, y: p.y ?? 0, z: at.z, rotY: ((p.facing ?? 0) * Math.PI) / 180 };
  }
  const lobby = towerLobby(p);
  const height = lobby.storeys === 1 ? lobby.height - 0.15 : clamp(lobby.storey - lobby.floorY - 0.45, 3, 4.4);
  return {
    kind: "tower",
    width: round2(2 * lobby.halfX),
    depth: round2(2 * lobby.halfZ),
    height: round2(height),
    storey: round2(lobby.storey),
    plates: Math.min(4, Math.max(0, lobby.storeys - 1)),
    at: { x: round2(pose.x), y: round2(pose.y + lobby.floorY), z: round2(pose.z), rotY: pose.rotY }
  };
}

// ── Room: host, earlier interior, fit, the params ────────────

type Room = {
  host?: BuiltSite;
  /** The interior that this build replaces (a replace task, or the earlier interior of the host). */
  existing?: BuiltSite;
  fit: RoomFit;
  /** Raw params: the stored params under the task's, the fit on top. normalizeInteriorParams reads it. */
  raw: Record<string, unknown>;
  given: Set<string>;
  suggestedUse: InteriorUse;
  suggestedFinish: InteriorFinish;
};

/** The params that the task gave (validate keeps only those, so a merge keeps the stored ones). */
function ownParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  delete out.given;
  delete out.title;
  return out;
}

function hostLook(host: BuiltSite | undefined): string {
  return typeof host?.params.look === "string" ? host.params.look : "";
}

function suggestFinish(host: BuiltSite | undefined, ctx: HostCtx): InteriorFinish {
  const look = hostLook(host);
  if (look === "setback") return "stone-brass";
  if (look === "glass") return "light-minimal";
  const city = cityNear(ctx.sites ?? [], host?.facts.center ?? ctx.anchor);
  if (look === "needle" || /industrial/i.test(city?.facts.city.kit ?? "")) return "dark-industrial";
  return "warm-wood";
}

function roomOf(params: Record<string, unknown>, ctx: HostCtx): Room {
  const host = findHost(ctx, params);
  const existing = ctx.replace ?? (host ? (ctx.sites ?? []).find((s) => s.generator === "interior" && s.facts.interior?.host === host.id) : undefined);
  // A replace task has its params merged already (run.ts); a second request merges here.
  const raw: Record<string, unknown> = existing && !ctx.replace ? { ...ownParams(existing.params), ...ownParams(params) } : ownParams(params);
  const fit = fitRoom(ctx.editor, host);
  if (fit.kind === "tower") Object.assign(raw, { width: fit.width, depth: fit.depth, height: fit.height, storey: fit.storey, plates: fit.plates, at: fit.at, front: "+z", shell: false });
  else if (fit.kind === "shell") {
    raw.shell = true;
    raw.plates = 0;
    if (!raw.at || typeof raw.at !== "object") {
      const ground = islandGroundAt();
      const y = ground ? (ground(ctx.anchor.x, ctx.anchor.z) ?? 0) : 0;
      raw.at = { x: round2(ctx.anchor.x), y: round2(y), z: round2(ctx.anchor.z), rotY: 0 };
    }
  }
  if (host) raw.host = host.id;
  else delete raw.host;
  const norm = normalizeInteriorParams(raw);
  const given = new Set(typeof norm === "string" ? [] : norm.given);
  const ask = new Set((ctx.ask ?? []).map((a) => a.trim().toLowerCase()));
  for (const name of ["use", "finish"]) if (ask.has(name)) given.delete(name);
  const width = typeof norm === "string" ? 10 : norm.width;
  const depth = typeof norm === "string" ? 8 : norm.depth;
  const hostStyle = typeof host?.params.style === "string" ? host.params.style : host?.facts.building?.style;
  return { host, existing, fit, raw, given, suggestedUse: suggestUse(hostStyle, width, depth), suggestedFinish: suggestFinish(host, ctx) };
}

/** The final params: the answers for what was not given, else the suggestion. */
function finalParams(room: Room, answers: ChoiceAnswers): InteriorParams {
  const raw = { ...room.raw };
  const useAnswer = answers.use?.optionIds?.[0];
  const finishAnswer = answers.finish?.optionIds?.[0];
  if (!room.given.has("use")) raw.use = INTERIOR_USES.some((u) => u.id === useAnswer) ? useAnswer : room.suggestedUse;
  if (!room.given.has("finish")) raw.finish = INTERIOR_FINISHES.some((f) => f.id === finishAnswer) ? finishAnswer : room.suggestedFinish;
  // A new use or finish gets its own seed unless the seed was stored.
  const norm = normalizeInteriorParams(raw);
  if (typeof norm === "string") throw new Error(norm);
  return norm;
}

// ── World geometry of the room ───────────────────────────────

/** Local room point (x, z) to world, by the room place. */
function toWorld(at: { x: number; z: number; rotY: number }, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(at.rotY);
  const s = Math.sin(at.rotY);
  return { x: at.x + x * c + z * s, z: at.z - x * s + z * c };
}

/** World box of the turned room. */
export function roomRect(p: Pick<InteriorParams, "width" | "depth">, at: { x: number; z: number; rotY: number }): SiteRect {
  const hx = p.width / 2;
  const hz = p.depth / 2;
  const pts = [toWorld(at, -hx, -hz), toWorld(at, hx, -hz), toWorld(at, -hx, hz), toWorld(at, hx, hz)];
  return {
    x0: round2(Math.min(...pts.map((q) => q.x))),
    z0: round2(Math.min(...pts.map((q) => q.z))),
    x1: round2(Math.max(...pts.map((q) => q.x))),
    z1: round2(Math.max(...pts.map((q) => q.z)))
  };
}

/** Furniture footprints in world x, z with a radius (not rugs and mats). */
export function planObstacles(plan: InteriorPlan, at: { x: number; z: number; rotY: number }): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const item of plan.items) {
    if (item.h <= OBSTACLE_MIN_H || PASSABLE_KINDS.has(item.kind) || /\b(rug|mat)s?\b/i.test(`${item.kind} ${item.label}`)) continue;
    const [hx, hz] = itemHalf(item);
    const w = toWorld(at, item.x, item.z);
    out.push([round2(w.x), round2(w.z), round2(Math.max(hx, hz))]);
  }
  return out;
}

// ── Text ─────────────────────────────────────────────────────

const useLabel = (use: InteriorUse) => INTERIOR_USES.find((u) => u.id === use)?.label ?? use;
const finishWords = (finish: InteriorFinish) => (INTERIOR_FINISHES.find((f) => f.id === finish)?.label ?? finish).toLowerCase();
const useWord = (use: InteriorUse) => (use === "lounge" ? "cafe lounge" : use);

function listText(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function adjustableText(p: InteriorParams): string {
  return `use ${INTERIOR_USES.map((u) => u.id).join("|")} (now ${p.use}); finish ${INTERIOR_FINISHES.map((f) => f.id).join("|")} (now ${p.finish}); floor, ceiling, furniture, lights true|false (now ${[p.floor, p.ceiling, p.furniture, p.lights].map(String).join(", ")})`;
}

function nextSteps(p: InteriorParams): NextStep[] {
  const other: Record<InteriorUse, InteriorUse> = { lobby: "office", office: "lounge", lounge: "apartment", apartment: "lobby" };
  const to = other[p.use];
  return [
    { label: "Another finish", prompt: "Give the interior another finish" },
    { label: `Make it ${article(useWord(to))} ${useWord(to)}`, prompt: `Make the interior ${article(useWord(to))} ${useWord(to)}` },
    { label: "Another use", prompt: "Give the interior another use" }
  ];
}

function taskTitle(params: Record<string, unknown>, brief: Brief | undefined): string | undefined {
  if (typeof params.title === "string" && params.title.trim()) return params.title.trim();
  return brief?.tasks.find((t) => t.params === params)?.title;
}

// ── The generator ────────────────────────────────────────────

const PARAM_KEYS = ["use", "finish", "width", "depth", "height", "front", "floor", "ceiling", "furniture", "lights", "shell", "plates", "storey", "seed", "host", "at"] as const;

export const interiorGenerator: Generator = {
  id: "interior",
  taste: {
    use: /lobby|reception|office|work|desk|cafe|coffee|\bbar\b|lounge|restaurant|apartment|living|bedroom|home|kitchen/i,
    finish: /wood|warm|cozy|stone|marble|brass|luxury|minimal|white|light|dark|industrial|concrete|loft/i
  },
  describe:
    'The inside of a building (an interior, a floor and a ceiling inside, furniture, a lobby, an office floor). Code finds the building, fits the room to its hall and builds floor, ceiling, lights and furniture. params: host = the building id from [Built] (leave it out for "here", "this building", "inside": code finds it); use "lobby"|"office"|"lounge"|"apartment"; finish "warm-wood"|"stone-brass"|"light-minimal"|"dark-industrial"; floor, ceiling, furniture, lights = false only to switch a part off. Leave use and finish out unless the words decide them.',

  validate(params, brief) {
    const norm = normalizeInteriorParams(params);
    if (typeof norm === "string") return norm;
    const out: Record<string, unknown> = {};
    const rec = norm as unknown as Record<string, unknown>;
    for (const k of PARAM_KEYS) if (k in params && params[k] !== undefined && params[k] !== null && rec[k] !== undefined) out[k] = rec[k];
    const title = taskTitle(params, brief);
    return { ...out, given: norm.given, ...(title ? { title } : {}) };
  },

  choices(params, ctx) {
    const room = roomOf(params, ctx);
    if (room.fit.kind === "no-hall") return [];
    const base = finalParams(room, {});
    const questions: ChoiceQuestion[] = [];
    if (!room.given.has("use")) {
      questions.push({
        id: "use",
        title: "Which interior?",
        kind: "taste",
        options: INTERIOR_USES.map((u) => ({ id: u.id, label: u.label, hint: u.hint, image: interiorThumb({ ...base, use: u.id }) })),
        suggested: room.suggestedUse
      });
    }
    if (!room.given.has("finish")) {
      const use = room.given.has("use") ? base.use : room.suggestedUse;
      questions.push({
        id: "finish",
        title: "Which finish?",
        kind: "taste",
        options: INTERIOR_FINISHES.map((f) => ({ id: f.id, label: f.label, hint: f.hint, image: interiorThumb({ ...base, use, finish: f.id }) })),
        suggested: room.suggestedFinish
      });
    }
    return questions;
  },

  async run(params, answers, ctx) {
    if (ctx.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const room = roomOf(params, ctx);
    const host = room.host;

    if (room.fit.kind === "no-hall" && host) {
      return {
        nodeIds: [],
        summary: `No interior was built: "${host.title}" has no hall that an interior fits into. Only a modern tower has one.`,
        next: [
          { label: "Build a modern tower", prompt: "Build a modern tower with a glass lobby" },
          { label: "A room on its own", prompt: "Build a lobby room that stands alone" }
        ]
      };
    }

    const p = finalParams(room, answers);
    const at = p.at ?? { x: ctx.anchor.x, y: 0, z: ctx.anchor.z, rotY: 0 };
    const plan = planInterior(p);
    const editor = ctx.editor;
    const scene = editor.scene;

    const taken = new Set<string>();
    const uniqueId = (base: string) => {
      let i = 1;
      while (scene.nodes.has(`${base}:${i}`) || taken.has(`${base}:${i}`)) i++;
      taken.add(`${base}:${i}`);
      return `${base}:${i}`;
    };
    // The earlier interior of this host (or the replace site) goes in the same command.
    const old = room.existing;
    const removeOld = old ? siteNodeIds(editor, old.id) : [];
    const oldFolderName = old ? (scene.nodes.get(old.id)?.name ?? old.title) : undefined;
    const names = new Set([...scene.nodes.values()].filter((n) => !n.parentId && n.id !== old?.id).map((n) => n.name));
    // A rebuild keeps a name that the user or the brief gave. A default name ("Lobby interior")
    // follows the use, so the scene tree does not show "Lobby interior" for an office.
    const defaultNames = new Set(INTERIOR_USES.map((u) => `${u.label} interior`));
    const kept = oldFolderName && !defaultNames.has(oldFolderName) ? oldFolderName : undefined;
    const base = kept ?? (oldFolderName ? undefined : taskTitle(params, ctx.brief)) ?? `${useLabel(p.use)} interior`;
    let folderName = base;
    if (!oldFolderName) for (let k = 2; names.has(folderName); k++) folderName = `${base} ${k}`;

    const folderId = uniqueId("node:group");
    const folderTransform = makeTransform(vec3(at.x, at.y, at.z));
    folderTransform.rotation.y = at.rotY;
    const child: GroupNode = {
      id: uniqueId("node:resource:interior"),
      kind: "group",
      name: `${useLabel(p.use)} interior`,
      parentId: folderId,
      transform: makeTransform(vec3(0, 0, 0)),
      data: {},
      metadata: { resource: INTERIOR_ID, seed: p.seed, params: JSON.stringify(p) }
    };

    const rect = roomRect(p, at);
    const center = { x: round2(at.x), z: round2(at.z) };
    const floorY = round2(at.y);
    const ceilingY = round2(at.y + p.height);
    const interior: InteriorSiteFacts = { host: host?.id ?? "", use: p.use, finish: p.finish, floorY, ceilingY, obstacles: p.furniture ? planObstacles(plan, at) : [] };
    const where = host ? `in "${host.title}" (${host.id})` : `standing alone at ${f1(at.x)},${f1(at.z)}`;
    const record: SiteRecord = {
      v: 1,
      generator: "interior",
      title: folderName,
      params: p as unknown as Record<string, unknown>,
      facts: {
        center,
        rect,
        height: ceilingY,
        style: `${finishWords(p.finish)} ${useWord(p.use)} interior`,
        summary: `${useWord(p.use)} interior, ${finishWords(p.finish)}, ${where}, ${f1(p.width)} x ${f1(p.depth)} m, ceiling ${f1(p.height)} m${p.plates ? `, ${p.plates} floor plates above` : ""}`,
        adjustable: adjustableText(p),
        interior
      }
    };
    const folder: GroupNode = { id: folderId, kind: "group", name: folderName, data: {}, transform: folderTransform, metadata: siteMetadata(record) };
    editor.execute(nodeBatchCommand(scene, `${old ? "rebuild" : "build"} ${folder.name}`, { add: [folder, child], ...(removeOld.length ? { remove: removeOld } : {}) }));
    markBuildReveal([child.id], 0);

    // The chat trace: one line for each part that is switched on.
    if (p.floor) {
      ctx.step("Floor", `${f1(p.width)} x ${f1(p.depth)} m, ${finishWords(p.finish)}`);
      await ctx.pause(300);
    }
    if (p.ceiling || p.lights) {
      ctx.step("Ceiling and lights", `${p.ceiling ? `${f1(p.height)} m above the floor` : "no ceiling"}${p.lights ? `, ${plan.lights.length} lights` : ""}`);
      await ctx.pause(300);
    }
    if (p.furniture) {
      ctx.step("Furniture", plan.summary);
      await ctx.pause(300);
    }

    // Summary: only the parts that are switched on.
    const verb = old ? "Rebuilt" : "Built";
    const what = `${article(useWord(p.use))} ${useWord(p.use)} interior`;
    const lead = host ? `${verb} ${what} in "${host.title}"` : `${verb} ${what} as a room that stands alone at ${f1(at.x)}, ${f1(at.z)}, with walls, a door and windows, because there is no building here`;
    const parts: string[] = [];
    const size = `${f1(p.width)} x ${f1(p.depth)} m`;
    parts.push(p.floor ? `a ${size} ${finishWords(p.finish)} floor` : `a ${size} room with no new floor`);
    if (p.ceiling) parts.push(`a ceiling ${f1(p.height)} m above it${p.lights ? " with light panels" : ""}`);
    else if (p.lights && plan.lights.length) parts.push(`${plan.lights.length} lights`);
    // The plan summary names the furniture ("a reception desk, 2 seating groups, ... and 6 plants").
    const furniture = p.furniture ? plan.summary : "";
    // The furniture text is a list of its own: it comes last, after a comma.
    let summary = `${lead}: ${furniture ? `${parts.join(", ")}, ${furniture}` : listText(parts)}.`;
    if (p.plates > 0) summary += ` ${p.plates} floor plate${p.plates === 1 ? "" : "s"} above it fill${p.plates === 1 ? "s" : ""} the podium.`;
    if (old && !ctx.replace) summary += " The earlier interior of this building was removed.";
    return { nodeIds: [folderId, child.id], summary, next: nextSteps(p) };
  }
};

// Modeled objects as things the director can change (plan docs/plans/realtime-ai-harness.md 5E).
//
// The object generator makes "gen:parts" nodes. Before 2026-11-11 it kept no record of them, so
// "make the cactus bigger" had nothing to change: the director named the node, run.ts looked
// only at the site records, and the answer was "is not in the scene".
//
// This file reads every modeled object back from the scene as a BuiltSite with generator
// "object". The list is SEPARATE from readSites (site.ts): other generators route and place by
// sites, and a cactus must not become a "building" for them. Two shapes:
//   - one object: the node itself is the record (id = node id). Works for objects that were
//     modeled before this file existed, because everything is read from the node.
//   - copies of one object (a ring, a row, a group): a folder with metadata.objectGroup, and
//     the copies as its children (id = folder id).
import type { EditorCore } from "@theras/editor-core";
import type { BuiltSite } from "./types";

export const OBJECT_ENTRY = "gen:parts";

export type ObjectStyle = "toy" | "realistic";
export type ObjectArrange = "cluster" | "ring" | "row";

/** metadata.object of a modeled node (JSON text): the words it was modeled from. */
export type ObjectNote = { subject: string; style: ObjectStyle };

/** metadata.objectGroup of a folder of copies (JSON text). */
export type ObjectGroupNote = ObjectNote & {
  arrange: ObjectArrange;
  /** What the copies stand around or beside: a node id, or left out for a point. */
  around?: string;
  /** A ring with no gaps (a wall, a fence): code sets the count from the ring length. */
  closed?: boolean;
  /** Each copy has its own turn and a small size change (plants, rocks). */
  vary?: boolean;
  /** The point the copies were laid out from (kept when the anchor node is gone). */
  center?: { x: number; z: number };
};

type MetaValue = string | number | boolean;
type NodeLike = {
  id: string;
  name: string;
  parentId?: string;
  transform?: { position?: { x: number; y: number; z: number }; scale?: { x: number; y: number; z: number } };
  metadata?: Record<string, unknown>;
};

export function objectMetadata(note: ObjectNote): Record<string, MetaValue> {
  return { object: JSON.stringify(note) };
}

export function objectGroupMetadata(note: ObjectGroupNote): Record<string, MetaValue> {
  return { generated: "object", objectGroup: JSON.stringify(note) };
}

function parseJson<T>(text: unknown): T | null {
  if (typeof text !== "string") return null;
  try {
    const v = JSON.parse(text) as T;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** What can be read from the params of one modeled node, with no three.js. */
export type ObjectFacts = {
  /** Name the modeler gave. */
  specName: string;
  parts: number;
  /** World size in meters: width x, height y, depth z, and the longest of them. */
  width: number;
  height: number;
  depth: number;
  longest: number;
  /** World footprint radius. */
  footprint: number;
  /** Palette roles with their colors. */
  palette: Record<string, string>;
};

/** Size and parts of a modeled node from its metadata, or null when it is not one. */
export function objectFactsOf(node: NodeLike): ObjectFacts | null {
  if (node.metadata?.resource !== OBJECT_ENTRY) return null;
  const params = parseJson<{ spec?: { name?: unknown; size?: unknown; palette?: unknown; stages?: unknown }; sizeMeters?: unknown }>(node.metadata.params);
  const spec = params?.spec;
  if (!spec || !Array.isArray(spec.size) || spec.size.length < 3) return null;
  const [sx, sy, sz] = spec.size.map((v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 1)) as [number, number, number];
  const base = Math.max(sx, sy, sz);
  const asked = typeof params.sizeMeters === "number" && Number.isFinite(params.sizeMeters) && params.sizeMeters > 0 ? params.sizeMeters : base;
  const s = node.transform?.scale;
  const nodeScale = s ? Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) || 1 : 1;
  const k = (asked / base) * nodeScale;
  const stored = typeof node.metadata.footprint === "number" && Number.isFinite(node.metadata.footprint) ? node.metadata.footprint : undefined;
  const stages = Array.isArray(spec.stages) ? spec.stages : [];
  const parts = stages.reduce((n: number, st) => n + (Array.isArray((st as { parts?: unknown })?.parts) ? (st as { parts: unknown[] }).parts.length : 0), 0);
  const palette: Record<string, string> = {};
  if (spec.palette && typeof spec.palette === "object" && !Array.isArray(spec.palette)) {
    for (const [role, hex] of Object.entries(spec.palette as Record<string, unknown>)) if (typeof hex === "string") palette[role] = hex;
  }
  return {
    specName: typeof spec.name === "string" && spec.name.trim() ? spec.name.trim() : node.name,
    parts,
    width: sx * k,
    height: sy * k,
    depth: sz * k,
    longest: asked * nodeScale,
    footprint: stored !== undefined ? stored * nodeScale : (Math.hypot(sx, sz) / 2) * k,
    palette
  };
}

/** World x, z of a node: its position plus the positions of its folders (folders are not turned or scaled). */
function worldXZ(node: NodeLike, nodes: Map<string, NodeLike>) {
  let x = 0;
  let y = 0;
  let z = 0;
  let cur: NodeLike | undefined = node;
  for (let depth = 0; cur && depth < 8; depth++) {
    x += cur.transform?.position?.x ?? 0;
    y += cur.transform?.position?.y ?? 0;
    z += cur.transform?.position?.z ?? 0;
    cur = cur.parentId ? nodes.get(cur.parentId) : undefined;
  }
  return { x, y, z };
}

function noteOf(node: NodeLike, facts: ObjectFacts): ObjectNote {
  const stored = parseJson<Partial<ObjectNote>>(node.metadata?.object);
  return {
    subject: typeof stored?.subject === "string" && stored.subject.trim() ? stored.subject.trim() : facts.specName,
    style: stored?.style === "realistic" ? "realistic" : "toy"
  };
}

const colorsText = (palette: Record<string, string>) =>
  Object.entries(palette)
    .slice(0, 6)
    .map(([role, hex]) => `${role} ${hex}`)
    .join(", ");

/** The change list of [Built] for a modeled object. */
function adjustableText(longest: number, palette: Record<string, string>, group?: { count: number; arrange: ObjectArrange; closed?: boolean }) {
  const colors = colorsText(palette);
  return [
    `sizeMeters ${r1(longest)} (0.1-60, the longest side${group ? " of each copy" : ""})`,
    group ? `count ${group.count} (1-24)` : "count 1 (1-24: copies of this same model)",
    `arrange ${group ? group.arrange : "single"} (cluster | ring | row), around (a node id), closed${group?.closed ? " true" : ""} (a ring with no gaps: a wall)`,
    colors ? `colors (${colors})` : "colors",
    "change (words for another shape or more detail: the modeler changes this model)"
  ].join(", ");
}

/**
 * Every modeled object in the scene, in scene order: single objects and groups of copies.
 * Pure over the scene nodes (no three.js), so it is cheap enough to run once per prompt.
 */
export function readObjects(editor: EditorCore): BuiltSite[] {
  const scene = editor?.scene?.nodes as Map<string, NodeLike> | undefined;
  if (!scene) return [];
  const groups = new Map<string, { folder: NodeLike; note: ObjectGroupNote; children: NodeLike[] }>();
  for (const node of scene.values()) {
    const note = parseJson<ObjectGroupNote>(node.metadata?.objectGroup);
    if (note) groups.set(node.id, { folder: node, note, children: [] });
  }
  const out: BuiltSite[] = [];
  const singles: NodeLike[] = [];
  for (const node of scene.values()) {
    if (node.metadata?.resource !== OBJECT_ENTRY) continue;
    const group = node.parentId ? groups.get(node.parentId) : undefined;
    if (group) group.children.push(node);
    else singles.push(node);
  }

  const order = new Map<string, number>();
  let i = 0;
  for (const id of scene.keys()) order.set(id, i++);

  for (const node of singles) {
    const facts = objectFactsOf(node);
    if (!facts) continue;
    const at = worldXZ(node, scene);
    const note = noteOf(node, facts);
    out.push({
      v: 1,
      id: node.id,
      generator: "object",
      title: node.name,
      params: { subject: note.subject, style: note.style, sizeMeters: r1(facts.longest), count: 1 },
      facts: {
        center: { x: at.x, z: at.z },
        rect: { x0: at.x - facts.width / 2, z0: at.z - facts.depth / 2, x1: at.x + facts.width / 2, z1: at.z + facts.depth / 2 },
        height: facts.height,
        summary: `modeled object "${note.subject}", ${facts.parts} parts, ${r1(facts.width)} x ${r1(facts.height)} x ${r1(facts.depth)} m`,
        adjustable: adjustableText(facts.longest, facts.palette)
      }
    });
  }

  for (const { folder, note, children } of groups.values()) {
    const rows = children.map((c) => ({ node: c, facts: objectFactsOf(c), at: worldXZ(c, scene) })).filter((r): r is { node: NodeLike; facts: ObjectFacts; at: { x: number; y: number; z: number } } => Boolean(r.facts));
    if (rows.length === 0) continue;
    const rect = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    for (const r of rows) {
      rect.x0 = Math.min(rect.x0, r.at.x - r.facts.footprint);
      rect.z0 = Math.min(rect.z0, r.at.z - r.facts.footprint);
      rect.x1 = Math.max(rect.x1, r.at.x + r.facts.footprint);
      rect.z1 = Math.max(rect.z1, r.at.z + r.facts.footprint);
    }
    // The size of the group is the median copy (copies vary a little).
    const sorted = [...rows].sort((a, b) => a.facts.longest - b.facts.longest);
    const mid = sorted[Math.floor(sorted.length / 2)]!.facts;
    const center = note.center ?? { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
    const arrange: ObjectArrange = note.arrange === "ring" || note.arrange === "row" ? note.arrange : "cluster";
    out.push({
      v: 1,
      id: folder.id,
      generator: "object",
      title: folder.name,
      params: {
        subject: note.subject,
        style: note.style === "realistic" ? "realistic" : "toy",
        sizeMeters: r1(mid.longest),
        count: rows.length,
        arrange,
        ...(note.around ? { around: note.around } : {}),
        ...(note.closed ? { closed: true } : {}),
        ...(note.vary ? { vary: true } : {})
      },
      facts: {
        center,
        rect,
        height: Math.max(...rows.map((r) => r.facts.height)),
        summary: `${rows.length} copies of the modeled object "${note.subject}" in a ${note.closed ? "closed " : ""}${arrange}${note.around ? ` around ${note.around}` : ""}, each about ${r1(mid.width)} x ${r1(mid.height)} x ${r1(mid.depth)} m`,
        adjustable: adjustableText(mid.longest, mid.palette, { count: rows.length, arrange, closed: note.closed })
      }
    });
  }
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** The nodes of a modeled object: the node itself, or the copies and then their folder. */
export function objectNodeIds(editor: EditorCore, id: string): string[] {
  const scene = editor.scene.nodes as Map<string, NodeLike>;
  const node = scene.get(id);
  if (!node) return [];
  if (typeof node.metadata?.objectGroup !== "string") return [id];
  const children = [...scene.values()].filter((n) => n.parentId === id).map((n) => n.id);
  return [...children, id];
}

/** Node id -> object id, for every copy in a group folder and for the folders and single objects. */
export function objectMembership(editor: EditorCore, objects: BuiltSite[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of objects) for (const id of objectNodeIds(editor, o.id)) out.set(id, o.id);
  return out;
}

// ── The subject is the object alone ───────────────────────────

/**
 * Where the object stands or what it stands beside is not part of the object. On 2026-11-11 the
 * subject "cactus ... beside the rain puddle" made the modeler put a puddle into the cactus
 * model, and each copy of the cactus then had its own puddle.
 */
const PLACE_CLAUSE =
  /[,;]?\s+\b(beside|next to|near|nearby|close to|around|surrounding|by the|in front of|behind|along|at the edge of|on the (?:ground|sand|shore|bank|hill|island|street|grass|floor)|in the (?:desert|scene|city|garden|park|puddle|water|sand|forest|field))\b.*$/i;

/** The subject without the words for its place ("a cactus beside the puddle" = "a cactus"). */
export function subjectAlone(subject: string): string {
  const cut = subject.replace(PLACE_CLAUSE, "").trim();
  return cut.length >= 3 ? cut : subject.trim();
}

// ── What a change task asks for ───────────────────────────────

/** Words that say size or arrangement, not what the thing is. */
const NOT_SUBJECT = new Set(
  (
    "a an the of and with as for in on at to from by it its this that one some my our " +
    "giant huge big bigger biggest large larger enormous massive colossal towering tall taller high small smaller tiny little mini short low wide wider long longer thick " +
    "wall walls ring rings row rows line lines circle fence hedge border cluster clusters group groups patch clump stand copies copy many several more " +
    "around near beside behind puddle pond lake make build made built new same existing present"
  ).split(" ")
);

/** One form for singular and plural ("cacti" and "cactus", "bushes" and "bush"); used on both sides of a compare. */
const singular = (w: string) =>
  w.endsWith("ies") && w.length > 4
    ? `${w.slice(0, -3)}y`
    : w.endsWith("es") && w.length > 4 && /(s|x|ch|sh)es$/.test(w)
      ? w.slice(0, -2)
      : w.endsWith("us") && w.length > 4
        ? w
        : w.endsWith("i") && w.length > 4
          ? `${w.slice(0, -1)}us`
          : w.endsWith("s") && !w.endsWith("ss") && w.length > 3
            ? w.slice(0, -1)
            : w;

export function subjectWords(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !NOT_SUBJECT.has(w)).map(singular))].filter((w) => !NOT_SUBJECT.has(w));
}

/**
 * True when the new subject names another thing or new traits ("cactus" -> "cactus with pink
 * flowers", "barrel cactus"), false when it only adds size or arrangement words
 * ("cactus cluster" -> "giant cactus wall"). Then the same model is used again.
 */
export function subjectChanged(before: string, next: string, title = ""): boolean {
  const known = new Set([...subjectWords(before), ...subjectWords(title)]);
  const words = subjectWords(next);
  if (words.length === 0) return false;
  return words.some((w) => !known.has(w));
}

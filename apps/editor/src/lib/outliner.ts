// Scene tree operations (group, ungroup, move into a folder, rename, organize).
// Each operation is ONE undo step and keeps every object where it is in the world.
import type { Command, EditorCore, SceneDocument } from "@theras/editor-core";
import {
  localizeTransform,
  makeTransform,
  resolveSceneGraph,
  vec3,
  type GeometryNode,
  type GroupNode,
  type Transform
} from "@theras/shared";

/** Adds, changes and removes nodes in one undoable step. Order: add, change, remove. */
export function nodeBatchCommand(
  scene: SceneDocument,
  label: string,
  changes: { add?: GeometryNode[]; update?: GeometryNode[]; remove?: string[] }
): Command {
  const added = (changes.add ?? []).map((n) => structuredClone(n));
  const updates = (changes.update ?? [])
    .map((next) => ({ before: scene.getNode(next.id), next }))
    .filter((u): u is { before: GeometryNode; next: GeometryNode } => Boolean(u.before))
    .map((u) => ({ before: structuredClone(u.before), next: structuredClone(u.next) }));
  const removed = (changes.remove ?? [])
    .map((id) => scene.getNode(id))
    .filter((n): n is GeometryNode => Boolean(n))
    .map((n) => structuredClone(n));
  return {
    label,
    execute(s) {
      added.forEach((n) => s.addNode(structuredClone(n)));
      updates.forEach((u) => s.addNode(structuredClone(u.next)));
      removed.forEach((n) => s.removeNode(n.id));
    },
    undo(s) {
      removed.forEach((n) => s.addNode(structuredClone(n)));
      updates.forEach((u) => s.addNode(structuredClone(u.before)));
      added.forEach((n) => s.removeNode(n.id));
    }
  };
}

function worldTransforms(scene: SceneDocument) {
  return resolveSceneGraph(scene.nodes.values(), scene.entities.values()).nodeWorldTransforms;
}

export function uniqueNodeId(scene: SceneDocument, base: string, taken: Set<string> = new Set()) {
  let i = 1;
  while (scene.nodes.has(`${base}:${i}`) || taken.has(`${base}:${i}`)) i++;
  const id = `${base}:${i}`;
  taken.add(id);
  return id;
}

function isAncestor(scene: SceneDocument, ancestorId: string, nodeId: string) {
  for (let p = scene.getNode(nodeId)?.parentId; p; p = scene.getNode(p)?.parentId) if (p === ancestorId) return true;
  return false;
}

/** Drops ids whose ancestor is also in the list. */
function topLevel(scene: SceneDocument, ids: string[]) {
  const set = new Set(ids);
  return ids.filter((id) => scene.getNode(id) && ![...set].some((other) => other !== id && isAncestor(scene, other, id)));
}

function centroid(transforms: Transform[]) {
  const n = Math.max(1, transforms.length);
  return makeTransform(
    vec3(
      transforms.reduce((s, t) => s + t.position.x, 0) / n,
      Math.min(...transforms.map((t) => t.position.y)),
      transforms.reduce((s, t) => s + t.position.z, 0) / n
    )
  );
}

/** Plans a new folder around ids (shared parent, centered on them). */
function planGroup(scene: SceneDocument, ids: string[], name: string, taken: Set<string>, world = worldTransforms(scene)) {
  const top = topLevel(scene, ids);
  if (top.length === 0) return null;
  const parents = new Set(top.map((id) => scene.getNode(id)!.parentId));
  const parentId = parents.size === 1 ? [...parents][0] : undefined;
  const groupWorld = centroid(top.map((id) => world.get(id) ?? scene.getNode(id)!.transform));
  const parentWorld = parentId ? world.get(parentId) : undefined;
  const groupId = uniqueNodeId(scene, "node:group", taken);
  const group: GroupNode = {
    id: groupId,
    kind: "group",
    name,
    parentId,
    data: {},
    transform: localizeTransform(groupWorld, parentWorld)
  };
  const children = top.map((id) => {
    const node = scene.getNode(id)!;
    return { ...structuredClone(node), parentId: groupId, transform: localizeTransform(world.get(id) ?? node.transform, groupWorld) } as GeometryNode;
  });
  return { group, children };
}

export function groupNodes(
  editor: EditorCore,
  ids: string[],
  name = "Folder",
  metadata?: GroupNode["metadata"]
): string | null {
  const plan = planGroup(editor.scene, ids, name, new Set());
  if (!plan) return null;
  if (metadata) plan.group.metadata = { ...metadata };
  editor.execute(nodeBatchCommand(editor.scene, `group ${name}`, { add: [plan.group], update: plan.children }));
  return plan.group.id;
}

/** Moves nodes into a folder (or to the top level when parentId is undefined). */
export function moveNodesTo(editor: EditorCore, ids: string[], parentId: string | undefined): boolean {
  const scene = editor.scene;
  const top = topLevel(scene, ids).filter((id) => id !== parentId && !(parentId && isAncestor(scene, id, parentId)));
  if (top.length === 0) return false;
  const world = worldTransforms(scene);
  const parentWorld = parentId ? world.get(parentId) : undefined;
  const update = top
    .map((id) => scene.getNode(id)!)
    .filter((node) => node.parentId !== parentId)
    .map((node) => ({ ...structuredClone(node), parentId, transform: localizeTransform(world.get(node.id) ?? node.transform, parentWorld) }) as GeometryNode);
  if (update.length === 0) return false;
  editor.execute(nodeBatchCommand(scene, "move in tree", { update }));
  return true;
}

/** Removes a folder and keeps its contents (they move up one level). */
export function ungroup(editor: EditorCore, groupId: string): boolean {
  const scene = editor.scene;
  const group = scene.getNode(groupId);
  if (!group || group.kind !== "group") return false;
  const world = worldTransforms(scene);
  const parentWorld = group.parentId ? world.get(group.parentId) : undefined;
  const children = [...scene.nodes.values()].filter((n) => n.parentId === groupId);
  const update = children.map(
    (node) => ({ ...structuredClone(node), parentId: group.parentId, transform: localizeTransform(world.get(node.id) ?? node.transform, parentWorld) }) as GeometryNode
  );
  editor.execute(nodeBatchCommand(scene, `ungroup ${group.name}`, { update, remove: [groupId] }));
  return true;
}

export function renameNode(editor: EditorCore, id: string, name: string) {
  const node = editor.scene.getNode(id);
  const next = name.trim();
  if (!node || !next || next === node.name) return;
  editor.execute(nodeBatchCommand(editor.scene, "rename", { update: [{ ...structuredClone(node), name: next } as GeometryNode] }));
}

/** Nodes that should stay at the top level (environment and terrain). */
function isSceneLevel(node: GeometryNode) {
  return node.metadata?.environment === true || node.metadata?.terrain === true || typeof node.metadata?.lakeOf === "string";
}

/** "Bridge Plank 3" -> "Bridge"; "North Wall" -> "Wall"; "Point Light 2" -> "Lights"; "Wooden Crate" -> "Crate". */
const SKIP_WORDS = new Set([
  "north", "south", "east", "west", "left", "right", "front", "back", "top", "bottom", "center", "middle",
  "small", "large", "big", "tiny", "tall", "short", "long", "inner", "outer", "upper", "lower", "main", "old", "new",
  "wooden", "wood", "metal", "iron", "glass", "red", "green", "blue", "yellow", "white", "black", "dark", "bright", "warm"
]);
const LIGHT_WORDS = new Set(["light", "lamp", "spotlight", "sun"]);

function nameStem(name: string) {
  const words = name.replace(/[0-9_:#()-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (LIGHT_WORDS.has(words[words.length - 1]!.toLowerCase())) return "Lights";
  const word = words.find((w) => !SKIP_WORDS.has(w.toLowerCase())) ?? words[0]!;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Groups loose top-level objects into folders by the main word of their name
 * (all "Bridge ..." parts into "Bridge", "North Wall" and "South Wall" into "Wall").
 * Only names shared by 2 or more objects get a folder. One undo step.
 */
export function organizeByName(editor: EditorCore): number {
  const scene = editor.scene;
  // Library objects are group nodes too, but they are objects, not folders.
  const isFolder = (n: GeometryNode) => n.kind === "group" && typeof n.metadata?.resource !== "string";
  const roots = [...scene.nodes.values()].filter((n) => !n.parentId && !isFolder(n) && !isSceneLevel(n));
  const byStem = new Map<string, string[]>();
  for (const node of roots) {
    const stem = nameStem(node.name);
    if (!stem) continue;
    byStem.set(stem, [...(byStem.get(stem) ?? []), node.id]);
  }
  const taken = new Set<string>();
  const world = worldTransforms(scene);
  const add: GeometryNode[] = [];
  const update: GeometryNode[] = [];
  for (const [stem, ids] of byStem) {
    if (ids.length < 2) continue;
    const plan = planGroup(scene, ids, stem, taken, world);
    if (!plan) continue;
    add.push(plan.group);
    update.push(...plan.children);
  }
  if (add.length === 0) return 0;
  editor.execute(nodeBatchCommand(scene, "organize by name", { add, update }));
  return add.length;
}

/** The outermost folder that was made by one placement (dock slot or AI run), or the node itself. */
export function placementRoot(scene: SceneDocument, id: string): string {
  let current = id;
  for (let p = scene.getNode(id)?.parentId; p; p = scene.getNode(p)?.parentId) {
    if (scene.getNode(p)?.metadata?.placement === true) current = p;
  }
  return current;
}

/** A short folder name from an AI prompt: "make a cozy castle with a moat" -> "Cozy castle with a moat". */
export function folderNameFromPrompt(prompt: string) {
  const cleaned = prompt
    .replace(/^(please\s+)?(make|build|create|add|generate|place|put|design)\s+(me\s+)?(a|an|the|some)?\s*/i, "")
    .replace(/[.!?].*$/s, "")
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  const name = words.length > 36 ? `${words.slice(0, 35)}...` : words;
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "AI build";
}

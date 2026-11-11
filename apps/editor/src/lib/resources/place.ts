// Puts library entries into the scene document.
// - Objects (landmarks, features) become a group node with metadata { resource, seed }.
//   The viewport builds the object from the library, so save, undo, select and erase work.
// - Recipes become editor primitives (build-slots runner).
// - Skies and HDR images become one "Environment" group node; a new one replaces the old one.
import type { Command, EditorCore } from "@theras/editor-core";
import { createDeleteSelectionCommand, createSetNodeCommand } from "@theras/editor-core";
import { localizeTransform, makeTransform, resolveSceneGraph, vec3, type GeometryNode, type GroupNode } from "@theras/shared";
import { markBuildReveal } from "@/lib/build-reveal";
import { placeRecipe } from "@/lib/build-slots/runner";
import { nodeBatchCommand } from "@/lib/outliner";
import { getResource } from "./catalog";

let editorRef: EditorCore | null = null;
export function registerResourceEditor(editor: EditorCore | null) {
  editorRef = editor;
}
function requireEditor() {
  if (!editorRef) throw new Error("Editor is not ready");
  return editorRef;
}

function newNodeId(editor: EditorCore, base: string) {
  let i = 1;
  while (editor.scene.nodes.has(`${base}:${i}`)) i++;
  return `${base}:${i}`;
}

function addNodeCommand(node: GroupNode): Command {
  return {
    label: `place ${node.name}`,
    execute(scene) {
      scene.addNode(structuredClone(node));
    },
    undo(scene) {
      scene.removeNode(node.id);
    }
  };
}

/** The lake of an island: a separate node, so land and water can be hidden on their own. */
export function lakeNodeFor(editor: EditorCore, terrainNodeId: string): GroupNode {
  return {
    id: newNodeId(editor, "node:lake"),
    kind: "group",
    name: "Lake water",
    transform: makeTransform(vec3(0, 0, 0)),
    data: {},
    metadata: { lakeOf: terrainNodeId }
  };
}

/**
 * Islands made before the lake was split get their lake node now, and "Island terrain"
 * becomes "Island land". One undo step, only when something is missing.
 */
export function migrateIslandLakes(editor: EditorCore) {
  const nodes = [...editor.scene.nodes.values()];
  const terrains = nodes.filter((n) => n.metadata?.terrain === true);
  const missing = terrains.filter((t) => !nodes.some((n) => n.metadata?.lakeOf === t.id));
  if (missing.length === 0) return;
  for (const terrain of missing) editor.execute(addNodeCommand(lakeNodeFor(editor, terrain.id)));
  for (const terrain of missing) {
    if (terrain.name === "Island terrain") editor.execute(createSetNodeCommand(editor.scene, terrain.id, { ...terrain, name: "Island land" }));
  }
}

export function isEnvironmentNode(node: { metadata?: Record<string, unknown> }) {
  return node.metadata?.environment === true;
}

/** Places an entry. Returns the new node ids. */
export function placeResource(
  id: string,
  at: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  options: { rotationY?: number; seed?: number; revealDelayMs?: number; scale?: number; params?: Record<string, unknown>; name?: string } = {}
): string[] {
  const editor = requireEditor();
  const entry = getResource(id);
  if (!entry) throw new Error(`No resource "${id}". Use search_resources to find ids.`);

  if (entry.recipe) {
    return placeRecipe(structuredClone(entry.recipe), at, Math.round((options.rotationY ?? 0) / (Math.PI / 2)), options.revealDelayMs ?? 0, 70, entry.name, options.scale ?? 1);
  }

  if (entry.kind === "terrain") {
    const old = [...editor.scene.nodes.values()]
      .filter((n) => n.metadata?.terrain === true || typeof n.metadata?.lakeOf === "string")
      .map((n) => n.id);
    if (old.length) editor.execute(createDeleteSelectionCommand(editor.scene, old));
    const node: GroupNode = {
      id: newNodeId(editor, "node:terrain"),
      kind: "group",
      name: "Island land",
      transform: makeTransform(vec3(at.x, 0, at.z)),
      data: {},
      metadata: { resource: entry.id, terrain: true, seed: Math.round(options.seed ?? Math.random() * 1e6) }
    };
    editor.execute(addNodeCommand(node));
    const lake = lakeNodeFor(editor, node.id);
    editor.execute(addNodeCommand(lake));
    return [node.id, lake.id];
  }

  if (entry.kind === "sky" || entry.kind === "hdri") {
    const old = [...editor.scene.nodes.values()].filter((n) => isEnvironmentNode(n)).map((n) => n.id);
    if (old.length) editor.execute(createDeleteSelectionCommand(editor.scene, old));
    const node: GroupNode = {
      id: newNodeId(editor, "node:environment"),
      kind: "group",
      name: `Environment: ${entry.name}`,
      transform: makeTransform(vec3(0, 0, 0)),
      data: {},
      metadata: { resource: entry.id, environment: true }
    };
    editor.execute(addNodeCommand(node));
    return [node.id];
  }

  if (!entry.create) throw new Error(`Resource "${id}" cannot be placed`);
  const seed = Math.round(options.seed ?? Math.random() * 1e6);
  const transform = makeTransform(vec3(at.x, at.y, at.z));
  transform.rotation.y = options.rotationY ?? 0;
  if (options.scale && options.scale !== 1) transform.scale = vec3(options.scale, options.scale, options.scale);
  const node: GroupNode = {
    id: newNodeId(editor, `node:resource:${entry.id.split(":").pop()}`),
    kind: "group",
    name: options.name ?? entry.nameFor?.(seed) ?? entry.name,
    transform,
    data: {},
    // Scene metadata holds text, numbers and booleans only, so params are stored as JSON text.
    metadata: options.params ? { resource: entry.id, seed, params: JSON.stringify(options.params) } : { resource: entry.id, seed }
  };
  editor.execute(addNodeCommand(node));
  markBuildReveal([node.id], options.revealDelayMs ?? 0);
  return [node.id];
}

/** Time between two objects of one batch in the build reveal (plan: 80 to 150 ms). */
export const BATCH_REVEAL_STAGGER_MS = 120;

export type BatchPlacement = { id: string; x: number; y: number; z: number; rotationY?: number; scale?: number; seed?: number };

/**
 * Places many library objects (place_resources). Objects and their folder are ONE undo step.
 * Recipe entries (primitive blocks) use the recipe runner and get their own undo steps.
 * Each object starts its build reveal BATCH_REVEAL_STAGGER_MS after the one before it.
 * folder: put the objects in a top-level folder with this name (an existing top-level folder
 * with the same name is reused). Returns the node id of each placement (recipes: the first part)
 * and the folder id.
 */
export function placeResourceBatch(
  placements: BatchPlacement[],
  options: { folder?: string; startDelayMs?: number } = {}
): { nodeIds: string[]; folderId?: string } {
  const editor = requireEditor();
  const scene = editor.scene;
  const taken = new Set<string>();
  const uniqueId = (base: string) => {
    let i = 1;
    while (scene.nodes.has(`${base}:${i}`) || taken.has(`${base}:${i}`)) i++;
    taken.add(`${base}:${i}`);
    return `${base}:${i}`;
  };
  const start = options.startDelayMs ?? 0;
  const nodes: GroupNode[] = [];
  const nodeIds: string[] = [];
  const reveal: { id: string; delay: number }[] = [];
  const recipes: { index: number; placement: BatchPlacement; delay: number }[] = [];

  placements.forEach((p, index) => {
    const entry = getResource(p.id);
    const delay = start + index * BATCH_REVEAL_STAGGER_MS;
    if (!entry) throw new Error(`No resource "${p.id}". Use search_resources to find ids.`);
    if (entry.recipe) {
      recipes.push({ index, placement: p, delay });
      nodeIds.push("");
      return;
    }
    if (!entry.create) throw new Error(`Resource "${p.id}" cannot be placed with place_resources`);
    const seed = Math.round(p.seed ?? Math.random() * 1e6);
    const transform = makeTransform(vec3(p.x, p.y, p.z));
    transform.rotation.y = p.rotationY ?? 0;
    if (p.scale && p.scale !== 1) transform.scale = vec3(p.scale, p.scale, p.scale);
    const node: GroupNode = {
      id: uniqueId(`node:resource:${entry.id.split(":").pop()}`),
      kind: "group",
      name: entry.nameFor?.(seed) ?? entry.name,
      transform,
      data: {},
      metadata: { resource: entry.id, seed }
    };
    nodes.push(node);
    nodeIds.push(node.id);
    reveal.push({ id: node.id, delay });
  });

  let folderId: string | undefined;
  const folderName = options.folder?.trim();
  if (nodes.length > 0) {
    const add: GeometryNode[] = [];
    if (folderName) {
      const existing = [...scene.nodes.values()].find(
        (n) => n.kind === "group" && !n.parentId && n.name === folderName && typeof n.metadata?.resource !== "string" && n.metadata?.environment !== true && n.metadata?.terrain !== true
      );
      let folderWorld;
      if (existing) {
        folderId = existing.id;
        folderWorld = resolveSceneGraph(scene.nodes.values(), scene.entities.values()).nodeWorldTransforms.get(existing.id) ?? existing.transform;
      } else {
        const n = nodes.length;
        folderWorld = makeTransform(
          vec3(nodes.reduce((s, x) => s + x.transform.position.x, 0) / n, Math.min(...nodes.map((x) => x.transform.position.y)), nodes.reduce((s, x) => s + x.transform.position.z, 0) / n)
        );
        folderId = uniqueId("node:group");
        add.push({ id: folderId, kind: "group", name: folderName, data: {}, transform: folderWorld } as GroupNode);
      }
      for (const node of nodes) {
        node.parentId = folderId;
        node.transform = localizeTransform(node.transform, folderWorld);
      }
    }
    add.push(...nodes);
    editor.execute(nodeBatchCommand(scene, `place ${nodes.length} objects`, { add }));
    for (const r of reveal) markBuildReveal([r.id], r.delay);
  }

  for (const r of recipes) {
    const p = r.placement;
    const ids = placeResource(p.id, { x: p.x, y: p.y, z: p.z }, { rotationY: p.rotationY, seed: p.seed, scale: p.scale, revealDelayMs: r.delay });
    nodeIds[r.index] = ids[0] ?? "";
  }
  return { nodeIds, folderId };
}

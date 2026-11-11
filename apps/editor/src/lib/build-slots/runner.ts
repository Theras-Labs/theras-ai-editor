// Places slot recipes into the scene document with normal editor commands, so undo,
// save, export and physics all work. Each new node gets the build reveal.
import type { EditorCore } from "@theras/editor-core";
import { createDeleteSelectionCommand, createUpsertMaterialCommand } from "@theras/editor-core";
import { makeTransform, vec3, type GeometryNode, type GroupNode, type Material, type PrimitiveNode } from "@theras/shared";
import { nodeBatchCommand, placementRoot, uniqueNodeId } from "@/lib/outliner";
import { createPrimitiveNodeData } from "@/lib/authoring";
import { markBuildReveal } from "@/lib/build-reveal";
import type { BuildSlot, RecipeMaterial, RecipePart, SlotRecipe } from "./types";
import { selectSlot, upsertSlot } from "./store";

let currentEditor: EditorCore | null = null;

/** The editor shell registers its editor so the viewport and the copilot can place slots. */
export function registerSlotEditor(editor: EditorCore | null) {
  currentEditor = editor;
}

function requireEditor(): EditorCore {
  if (!currentEditor) throw new Error("Editor is not ready");
  return currentEditor;
}

export function materialIdFor(key: string) {
  return `material:island:${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function ensureMaterials(editor: EditorCore, materials: RecipeMaterial[]) {
  for (const m of materials) {
    const id = materialIdFor(m.key);
    if (editor.scene.materials.has(id)) continue;
    const material: Material = {
      id,
      name: m.name,
      color: m.color,
      category: "custom",
      metalness: m.metalness ?? 0,
      roughness: m.roughness ?? 0.8
    };
    editor.execute(createUpsertMaterialCommand(editor.scene, material));
  }
}

/**
 * Places a recipe at `base` (y = surface height) in ONE undo step. Several parts go into
 * one folder named `name` (marked as a placement, so Erase removes the whole object).
 * The parts reveal one after another, `partStepMs` apart. Returns [folderId, ...partIds],
 * or [partId] for a one-part recipe.
 */
export function placeRecipe(
  recipe: SlotRecipe,
  base: { x: number; y: number; z: number },
  quarterTurns = 0,
  startDelayMs = 0,
  partStepMs = 70,
  name = "Object",
  scale = 1
): string[] {
  const editor = requireEditor();
  const scene = editor.scene;
  ensureMaterials(editor, recipe.materials);
  const angle = (quarterTurns % 4) * (Math.PI / 2);
  const taken = new Set<string>();
  const single = recipe.parts.length === 1 && scale === 1;
  const groupId = single ? undefined : uniqueNodeId(scene, "node:group", taken);

  const parts: PrimitiveNode[] = recipe.parts.map((part) => {
    const data = createPrimitiveNodeData("brush", part.shape, vec3(part.sizeX, part.sizeY, part.sizeZ));
    data.materialId = materialIdFor(part.material);
    if (part.segments && part.shape !== "cube") data.radialSegments = Math.max(3, Math.min(48, Math.round(part.segments)));
    // In a folder the part keeps its recipe offset; the folder carries position and turn.
    const transform = single
      ? makeTransform(vec3(base.x + part.x, base.y + part.y, base.z + part.z))
      : makeTransform(vec3(part.x, part.y, part.z));
    transform.rotation.y = (single ? angle : 0) + (part.rotationY ?? 0);
    return {
      id: uniqueNodeId(scene, `node:brush:${part.shape}`, taken),
      kind: "primitive",
      name: part.name ?? "Part",
      parentId: groupId,
      transform,
      data
    };
  });

  const add: GeometryNode[] = [...parts];
  if (groupId) {
    const transform = makeTransform(vec3(base.x, base.y, base.z));
    transform.rotation.y = angle;
    transform.scale = vec3(scale, scale, scale);
    add.unshift({ id: groupId, kind: "group", name, data: {}, transform, metadata: { placement: true } } as GroupNode);
  }
  editor.execute(nodeBatchCommand(scene, `place ${name}`, { add }));
  parts.forEach((part, i) => markBuildReveal([part.id], startDelayMs + i * partStepMs));
  return groupId ? [groupId, ...parts.map((p) => p.id)] : parts.map((p) => p.id);
}

/** Erases the tapped objects; a part of a placed object erases the whole object (its folder). */
export function eraseNodes(nodeIds: string[]) {
  if (nodeIds.length === 0) return;
  const editor = requireEditor();
  const roots = [...new Set(nodeIds.map((id) => placementRoot(editor.scene, id)))].filter((id) => editor.scene.nodes.has(id));
  if (roots.length > 0) editor.execute(createDeleteSelectionCommand(editor.scene, roots));
}

/**
 * Makes a dock slot from the selected scene object. A library object becomes a "resource" slot
 * (it keeps working in every project); anything else becomes a "copy" slot that copies that
 * node. Returns the new slot index, or null with a reason.
 */
export function slotFromSelection(): { index: number; label: string } | { error: string } {
  const editor = requireEditor();
  const scene = editor.scene;
  const ids = [...editor.selection.ids].filter((id) => scene.getNode(id));
  if (ids.length === 0) return { error: "Select an object in the scene or the scene tree first." };
  // A part of a placed object stands for the whole object (its folder).
  const id = placementRoot(scene, ids[0]!);
  const node = scene.getNode(id);
  if (!node) return { error: "The selected object is not in the scene." };
  const resourceId = (node.metadata as { resource?: unknown } | undefined)?.resource;
  const label = (node.name || "Object").replace(/\s+Copy$/, "").slice(0, 18);
  const slot: BuildSlot =
    typeof resourceId === "string"
      ? { id: `slot:${Date.now().toString(36)}`, label, icon: "landmark", kind: "resource", resourceId, scale: 1 }
      : { id: `slot:${Date.now().toString(36)}`, label, icon: "landmark", kind: "copy", copyOf: id };
  const index = upsertSlot(slot);
  selectSlot(index);
  return { index, label };
}

/**
 * Places a copy of `sourceId` (with its children) so that its bottom is at `base`.
 * bottomOffset = source position y minus its lowest point. ONE undo step.
 */
export function placeCopy(sourceId: string, base: { x: number; y: number; z: number }, bottomOffset: number, quarterTurns = 0): string[] {
  const editor = requireEditor();
  const scene = editor.scene;
  const source = scene.getNode(sourceId);
  if (!source) throw new Error("The object that this slot copies is not in this scene any more.");
  const taken = new Set<string>();
  const idMap = new Map<string, string>();
  const add: GeometryNode[] = [];
  const all = [...scene.nodes.values()];
  const walk = (nodeId: string) => {
    const node = scene.getNode(nodeId);
    if (!node) return;
    const copy = structuredClone(node) as GeometryNode;
    copy.id = uniqueNodeId(scene, nodeId.replace(/:\d+$/, ""), taken);
    idMap.set(nodeId, copy.id);
    if (nodeId === sourceId) {
      copy.parentId = undefined;
      copy.transform = structuredClone(node.transform);
      copy.transform.position = vec3(base.x, base.y + bottomOffset, base.z);
      copy.transform.rotation.y = node.transform.rotation.y + (quarterTurns % 4) * (Math.PI / 2);
    } else {
      copy.parentId = node.parentId ? idMap.get(node.parentId) : undefined;
    }
    add.push(copy);
    for (const child of all) if (child.parentId === nodeId) walk(child.id);
  };
  walk(sourceId);
  editor.execute(nodeBatchCommand(scene, `place ${source.name || "copy"}`, { add }));
  markBuildReveal(add.map((n) => n.id), 0);
  return add.map((n) => n.id);
}

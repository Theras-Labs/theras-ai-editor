import type { EditorCore } from "@theras/editor-core";
import {
  createAssignMaterialCommand,
  createAssignMaterialToBrushesCommand,
  createDeleteSelectionCommand,
  createDuplicateNodesCommand,
  createExtrudeBrushNodesCommand,
  createMeshInflateCommand,
  createMirrorNodesCommand,
  createOffsetBrushFaceCommand,
  createPlaceBlockoutPlatformCommand,
  createPlaceBlockoutRoomCommand,
  createPlaceBlockoutStairCommand,
  createPlaceEntityCommand,
  createPlaceLightNodeCommand,
  createPlaceMeshNodeCommand,
  createPlacePrimitiveNodeCommand,
  createReplaceNodesCommand,
  createSetEntityCommand,
  createSetMeshDataCommand,
  createSetNodeCommand,
  createSetNodeTransformCommand,
  createSetSceneSettingsCommand,
  createSetUvScaleCommand,
  createSplitBrushNodeAtCoordinateCommand,
  createSplitBrushNodesCommand,
  createTranslateNodesCommand,
  createUpsertMaterialCommand
} from "@theras/editor-core";
import {
  arcEditableMeshEdges,
  bevelEditableMeshEdges,
  computePolygonNormal,
  convertBrushToEditableMesh,
  createAxisAlignedBrushFromBounds,
  cutEditableMeshFace,
  deleteEditableMeshFaces,
  extrudeEditableMeshEdge,
  extrudeEditableMeshFaces,
  fillEditableMeshFaceFromVertices,
  getFaceVertices,
  invertEditableMeshNormals,
  mergeEditableMeshFaces,
  mergeEditableMeshVertices,
  scaleEditableMeshVertices,
  translateEditableMeshVertices,
  subdivideEditableMeshFace
} from "@theras/geometry-kernel";
import { isBrushNode, isMeshNode, localizeTransform, makeTransform, resolveSceneGraph, vec3 } from "@theras/shared";
import type { EditableMesh, GeometryNode, GameplayObject, GameplayValue, Material, SceneHook, ScenePathDefinition, SceneSettings, Vec3 } from "@theras/shared";
import {
  createDefaultEntity,
  createDefaultLightData,
  createLightNodeLabel,
  createPrimitiveNodeData,
  createPrimitiveNodeLabel
} from "@/lib/authoring";
import { createSceneHook, HOOK_DEFINITION_MAP, HOOK_DEFINITIONS, resolveGameplayEvents, setGameplayValue } from "@/lib/gameplay";
import type { CopilotToolCall, CopilotToolResult } from "./types";
import { buildSlotStore, removeSlot, upsertSlot } from "@/lib/build-slots/store";
import { placeRecipe } from "@/lib/build-slots/runner";
import { isSlotIcon, type RecipeMaterial, type RecipePart } from "@/lib/build-slots/types";
import { getResource, searchResourcesScored } from "@/lib/resources/catalog";
import { placeResource, placeResourceBatch, BATCH_REVEAL_STAGGER_MS } from "@/lib/resources/place";
import { mediumOf, solveLayout, LAYOUT_MAX_COUNT, type LayoutItem, type LayoutSpec } from "@/lib/resources/layout";
import { presetValues } from "@/lib/post-fx";
import { markBuildReveal } from "@/lib/build-reveal";
import { uiStore } from "@/state/ui-store";
import { enterGameMode, exitGameMode, gameStore, playerFocusPoint, setBodyMode, type BodyMode } from "@/lib/game/game-store";
import { paletteColor } from "./palettes";
import { propPlacementSceneOf } from "./instant-path";
import { applyTemplate, projectTemplates, templateAvailable } from "@/lib/resources/templates";
import { findProject } from "@/lib/projects/projects";
import { groupNodes, moveNodesTo, nodeBatchCommand, renameNode, ungroup } from "@/lib/outliner";
import type { ResourceKind, ResourceSource } from "@/lib/resources/types";

type Args = Record<string, unknown>;

export type CopilotToolExecutionContext = {
  requestScenePush?: (options: {
    forceSwitch?: boolean;
    gameId?: string;
    projectName?: string;
    projectSlug?: string;
  }) => void;
};

function num(args: Args, key: string, fallback = 0): number {
  const v = args[key];
  return typeof v === "number" ? v : fallback;
}

function str(args: Args, key: string, fallback = ""): string {
  const v = args[key];
  return typeof v === "string" ? v : fallback;
}

function strArray(args: Args, key: string): string[] {
  const v = args[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function bool(args: Args, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === "boolean" ? v : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function gameplayObject(value: unknown): GameplayObject | undefined {
  return isRecord(value) ? value as GameplayObject : undefined;
}

function mergeGameplayObject(base: GameplayObject, patch: unknown): GameplayObject {
  if (!isRecord(patch)) {
    return structuredClone(base);
  }

  const next: GameplayObject = structuredClone(base);

  Object.entries(patch).forEach(([key, value]) => {
    const current = next[key];

    next[key] =
      isRecord(current) && isRecord(value)
        ? mergeGameplayObject(current as GameplayObject, value)
        : structuredClone(value) as GameplayValue;
  });

  return next;
}

function pointFromUnknown(value: unknown): Vec3 | undefined {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value;

    if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
      return { x, y, z };
    }
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (isRecord(value.position)) {
    const { x, y, z } = value.position;

    if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
      return { x, y, z };
    }
  }

  const { x, y, z } = value;

  if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
    return { x, y, z };
  }

  return undefined;
}

function pointArray(value: unknown): Vec3[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const point = pointFromUnknown(entry);
    return point ? [point] : [];
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A search with no name or tag match (best score below 2) counts as "no result" for the asset-first gate. */
export const SEARCH_MATCH_SCORE = 2;

/** Library items with a layout relation -> positions from the layout solver, then one batch placement. */
function placeWithLayout(editor: EditorCore, rawItems: unknown[], folder: string | undefined) {
  const skipped: { id: string; reason: string }[] = [];
  const items: LayoutItem[] = [];
  for (const raw of rawItems.slice(0, 40)) {
    const item = isRecord(raw) ? raw : {};
    const id = typeof item.id === "string" ? item.id : "";
    const entry = getResource(id);
    if (!entry) {
      skipped.push({ id, reason: "unknown library id" });
      continue;
    }
    if (entry.kind === "sky" || entry.kind === "hdri") {
      skipped.push({ id, reason: "a sky: use set_environment" });
      continue;
    }
    if (entry.kind === "terrain") {
      skipped.push({ id, reason: "the island: use generate_island" });
      continue;
    }
    const layout = isRecord(item.layout) ? (item.layout as unknown as LayoutSpec) : undefined;
    items.push({
      id: entry.id,
      footprint: entry.footprint,
      medium: mediumOf(entry),
      vary: entry.kind === "plant",
      count: typeof item.count === "number" ? Math.min(LAYOUT_MAX_COUNT, Math.max(1, Math.floor(item.count))) : 1,
      layout,
      seed: typeof item.seed === "number" ? item.seed : undefined
    });
  }
  const viewport = uiStore.viewports[uiStore.activeViewportId];
  // Game mode: the "camera" anchor is the point in front of the walking player.
  const anchor = (gameStore.active ? playerFocusPoint() : undefined) ?? viewport?.camera.target;
  const result = solveLayout(items, propPlacementSceneOf(editor, anchor));
  const { nodeIds, folderId } = placeResourceBatch(
    result.placed.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, rotationY: p.rotationY, scale: p.scale, seed: p.seed })),
    { folder }
  );
  return {
    placed: result.placed.map((p, i) => ({ id: p.id, nodeId: nodeIds[i], x: round2(p.x), y: round2(p.y), z: round2(p.z) })),
    skipped: [...skipped, ...result.skipped.map(({ id, reason }) => ({ id, reason }))],
    folderId
  };
}

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, ...data });
}

function fail(error: string): string {
  return JSON.stringify({ success: false, error });
}

function buildSceneOutline(editor: EditorCore) {
  const scene = editor.scene;
  const graph = resolveSceneGraph(scene.nodes.values(), scene.entities.values());

  const buildEntityOutline = (entityId: string) => {
    const entity = scene.getEntity(entityId);

    if (!entity) {
      return { id: entityId, missing: true };
    }

    return {
      id: entity.id,
      name: entity.name,
      type: entity.type
    };
  };

  const buildNodeOutline = (nodeId: string): Record<string, unknown> => {
    const node = scene.getNode(nodeId);

    if (!node) {
      return { id: nodeId, missing: true };
    }

    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      children: (graph.nodeChildrenByParentId.get(nodeId) ?? []).map(buildNodeOutline),
      entities: (graph.entityChildrenByParentId.get(nodeId) ?? []).map(buildEntityOutline)
    };
  };

  return {
    graph,
    outline: {
      totalNodes: scene.nodes.size,
      totalEntities: scene.entities.size,
      rootNodes: graph.rootNodeIds.map(buildNodeOutline),
      rootEntities: graph.rootEntityIds.map(buildEntityOutline)
    }
  };
}

function buildHookCatalog() {
  return HOOK_DEFINITIONS.map((definition) => ({
    ...definition,
    defaultConfig: structuredClone(HOOK_DEFINITION_MAP.get(definition.type)?.defaultConfig ?? {})
  }));
}

function resolvePathId(paths: ScenePathDefinition[], requestedId: string, requestedName: string) {
  const slugSource = requestedId || requestedName || `path_${paths.length + 1}`;
  const baseId = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `path_${paths.length + 1}`;
  let nextId = baseId;
  let suffix = 2;

  while (paths.some((pathDefinition) => pathDefinition.id === nextId)) {
    nextId = `${baseId}_${suffix++}`;
  }

  return nextId;
}

function updateHooksOnTarget(
  editor: EditorCore,
  targetKind: "entity" | "node",
  targetId: string,
  update: (hooks: SceneHook[]) => { hooks: SceneHook[]; result: Record<string, unknown> }
): string {
  if (targetKind === "node") {
    const node = editor.scene.getNode(targetId);

    if (!node) {
      return fail("Node not found");
    }

    const currentHooks = structuredClone(node.hooks ?? []);
    const { hooks, result } = update(currentHooks);
    editor.execute(createSetNodeCommand(editor.scene, targetId, { ...structuredClone(node), hooks }));
    return ok(result);
  }

  const entity = editor.scene.getEntity(targetId);

  if (!entity) {
    return fail("Entity not found");
  }

  const currentHooks = structuredClone(entity.hooks ?? []);
  const { hooks, result } = update(currentHooks);
  editor.execute(createSetEntityCommand(editor.scene, targetId, { ...structuredClone(entity), hooks }));
  return ok(result);
}

export function executeTool(
  editor: EditorCore,
  toolCall: CopilotToolCall,
  context: CopilotToolExecutionContext = {}
): CopilotToolResult {
  const { name, args } = toolCall;

  try {
    const result = executeToolInner(editor, name, args, context);
    return { callId: toolCall.id, name, result };
  } catch (error) {
    return {
      callId: toolCall.id,
      name,
      result: fail(error instanceof Error ? error.message : "Unknown error")
    };
  }
}

function executeToolInner(editor: EditorCore, name: string, args: Args, context: CopilotToolExecutionContext): string {
  const scene = editor.scene;

  switch (name) {
    // ── Build dock (slots) and island ─────────────────────────
    case "list_slots": {
      return ok({
        activeIndex: buildSlotStore.activeIndex,
        slots: buildSlotStore.slots.map((slot, index) => ({
          index,
          label: slot.label,
          icon: slot.icon,
          kind: slot.kind,
          resourceId: slot.resourceId,
          scale: slot.scale ?? 1,
          parts: slot.recipe?.parts.length ?? 0
        }))
      });
    }

    case "set_slot": {
      const icon = str(args, "icon", "box");
      const kindArg = str(args, "kind", "recipe");
      const kind = kindArg === "erase" ? "erase" : kindArg === "resource" ? "resource" : "recipe";
      const resourceId = str(args, "resourceId");
      if (kind === "resource" && !getResource(resourceId)) return fail(`No library entry "${resourceId}". Use search_resources.`);
      const materials = (Array.isArray(args.materials) ? args.materials : []) as RecipeMaterial[];
      const parts = (Array.isArray(args.parts) ? args.parts : []) as RecipePart[];
      if (kind === "recipe" && parts.length === 0) return fail("A recipe slot needs at least one part");
      if (parts.length > 40) return fail("Too many parts (max 40)");
      const keys = new Set(materials.map((m) => m.key));
      const missing = parts.find((part) => !keys.has(part.material));
      if (missing) return fail(`Part material "${missing.material}" is not in materials`);
      const label = str(args, "label", "Slot").slice(0, 18);
      const index = upsertSlot(
        {
          id: `ai-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
          label,
          icon: isSlotIcon(icon) ? icon : "box",
          kind,
          recipe: kind === "recipe" ? { materials, parts } : undefined,
          resourceId: kind === "resource" ? resourceId : undefined,
          scale: typeof args.scale === "number" && args.scale > 0 ? Math.min(8, args.scale) : undefined,
          iconSvg: str(args, "iconSvg") || undefined
        },
        typeof args.index === "number" ? args.index : undefined
      );
      return ok({ index });
    }

    case "select_slot": {
      const index = num(args, "index", -1);
      if (index >= buildSlotStore.slots.length) return fail("No slot at that index");
      buildSlotStore.activeIndex = index < 0 ? null : index;
      return ok({ activeIndex: buildSlotStore.activeIndex });
    }

    case "remove_slot": {
      removeSlot(num(args, "index", -1));
      return ok({ slots: buildSlotStore.slots.length });
    }

    case "place_slot": {
      const slot = buildSlotStore.slots[num(args, "index", -1)];
      if (!slot?.recipe) return fail("That slot has no recipe to place");
      const nodeIds = placeRecipe(
        structuredClone(slot.recipe) as never,
        { x: num(args, "x"), y: num(args, "y"), z: num(args, "z") },
        Math.round(num(args, "quarterTurns", 0)),
        0,
        70,
        slot.label
      );
      return ok({ nodeIds });
    }

    case "load_project": {
      const project = findProject(str(args, "project"));
      if (!project) return fail("No imported project with that name or path. The user must give the folder path in a message first.");
      const template = projectTemplates([project])[0];
      if (!template) return fail(`${project.name} has no environment. Its ${project.models.length} models are in the library: search_resources "${project.name}".`);
      if (!templateAvailable(template)) return fail(`The place builder ${template.environment?.resource} is not in the library.`);
      const result = applyTemplate(editor, template.id, args.replace !== false);
      return ok({ ...result, project: project.name, environment: template.environment?.name ?? template.name });
    }

    case "set_physics": {
      const ids = strArray(args, "ids").filter((id) => scene.getNode(id));
      if (ids.length === 0) return fail("No known node ids. Use ids from the digest.");
      const mode = str(args, "mode") as BodyMode | "default";
      if (!["loose", "solid", "ghost", "default"].includes(mode)) return fail("mode must be loose, solid, ghost or default");
      setBodyMode(ids, mode);
      return ok({
        ids,
        mode,
        note: gameStore.active ? "Applied in the running game." : "Applies when the user presses Play (game mode)."
      });
    }

    case "game_mode": {
      const action = str(args, "action");
      const view = str(args, "view");
      if (view === "first" || view === "third") gameStore.view = view;
      if (action === "enter") enterGameMode();
      else if (action === "exit") exitGameMode();
      return ok({ active: gameStore.active, view: gameStore.view });
    }

    case "apply_template": {
      const result = applyTemplate(editor, str(args, "id"), args.replace !== false);
      return ok({ ...result, note: "The template is in the scene. Its objects are in a folder named after the template." });
    }

    case "search_resources": {
      const query = str(args, "query");
      const results = searchResourcesScored(
        query,
        { kind: (str(args, "kind") || undefined) as ResourceKind | undefined, source: (str(args, "source") || undefined) as ResourceSource | undefined },
        20
      );
      // score: 3 per query word in the name, 2 in a tag, 1 in the description (synonyms 0.5 less).
      const noMatch = query.trim() !== "" && !results.some((r) => r.score >= SEARCH_MATCH_SCORE);
      return ok({
        results: results.map(({ entry: e, score }) => ({
          id: e.id,
          name: e.name,
          kind: e.kind,
          score,
          source: e.source,
          origin: e.origin,
          footprint: e.footprint,
          description: e.description
        })),
        ...(noMatch ? { noMatch: true, note: "No library entry matches by name or tag. place_primitives is available now for this object." } : {})
      });
    }

    case "place_resource": {
      const hasXyz = typeof args.x === "number" && typeof args.z === "number";
      // A water surface at given x, z still goes through the layout: it is fitted into the
      // hollow of the ground there (level and size), so its edge never hangs in the air.
      const waterEntry = getResource(str(args, "id"));
      if (hasXyz && !isRecord(args.layout) && waterEntry && mediumOf(waterEntry) === "cover") {
        args = { ...args, layout: { pattern: "single", anchor: { x: num(args, "x"), z: num(args, "z") } } };
      }
      if (isRecord(args.layout) || !hasXyz) {
        // Layout (or no coordinates): code computes the position.
        const layout = isRecord(args.layout) ? args.layout : { pattern: "single" };
        const out = placeWithLayout(editor, [{ id: args.id, layout, seed: args.seed }], undefined);
        if (out.placed.length === 0) return fail(out.skipped[0]?.reason ?? "No free place");
        const p = out.placed[0];
        return ok({ nodeIds: [p.nodeId], x: p.x, y: p.y, z: p.z });
      }
      const nodeIds = placeResource(
        str(args, "id"),
        { x: num(args, "x"), y: num(args, "y"), z: num(args, "z") },
        { rotationY: num(args, "rotationY", 0), seed: typeof args.seed === "number" ? args.seed : undefined }
      );
      return ok({ nodeIds });
    }

    case "place_resources": {
      const items = Array.isArray(args.items) ? args.items : [];
      if (items.length === 0) return fail("items is empty");
      const folder = str(args, "folder") || undefined;
      const out = placeWithLayout(editor, items, folder);
      return JSON.stringify({ success: out.placed.length > 0, ...out });
    }

    case "set_environment": {
      const entry = getResource(str(args, "id"));
      if (!entry || (entry.kind !== "sky" && entry.kind !== "hdri")) return fail("Not a sky entry. Use search_resources with kind sky.");
      return ok({ nodeIds: placeResource(entry.id) });
    }

    case "generate_island": {
      const nodeIds = placeResource(
        "lh:terrain:island",
        { x: num(args, "x", 0), y: 0, z: num(args, "z", 0) },
        { seed: typeof args.seed === "number" ? args.seed : undefined }
      );
      return ok({
        nodeIds,
        note: "Island kit island: water level y=0, land levels at y=0.25, 0.75, 1.25. It is about 16 m across. Place objects on land at about y=0.3 to 1.3 within 7 m of its center."
      });
    }

    // ── Placement ─────────────────────────────────────────────
    case "place_blockout_room": {
      const { command, groupId, nodeIds } = createPlaceBlockoutRoomCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        size: vec3(num(args, "sizeX", 10), num(args, "sizeY", 4), num(args, "sizeZ", 10)),
        openSides: strArray(args, "openSides") as Array<"bottom" | "east" | "north" | "south" | "top" | "west">,
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ groupId, nodeIds });
    }

    case "place_blockout_platform": {
      const { command, nodeId } = createPlaceBlockoutPlatformCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        size: vec3(num(args, "sizeX", 8), num(args, "sizeY", 0.5), num(args, "sizeZ", 8)),
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_blockout_stairs": {
      const { command, groupId, nodeIds, topLandingCenter } = createPlaceBlockoutStairCommand(scene, {
        position: vec3(num(args, "x"), num(args, "y"), num(args, "z")),
        stepCount: num(args, "stepCount", 10),
        stepHeight: num(args, "stepHeight", 0.2),
        treadDepth: num(args, "treadDepth", 0.3),
        width: num(args, "width", 2),
        direction: (str(args, "direction") || "north") as "east" | "north" | "south" | "west",
        materialId: str(args, "materialId") || undefined,
        name: str(args, "name") || undefined
      });
      editor.execute(command);
      return ok({ groupId, nodeIds, topLandingCenter });
    }

    case "place_primitive": {
      const role = str(args, "role", "brush") as "brush" | "prop";
      const shape = str(args, "shape", "cube") as "cone" | "cube" | "cylinder" | "sphere";
      const size = vec3(num(args, "sizeX", 2), num(args, "sizeY", shape === "cylinder" || shape === "cone" ? 3 : 2), num(args, "sizeZ", 2));
      const data = createPrimitiveNodeData(role, shape, size);
      const matId = str(args, "materialId");
      if (matId) {
        data.materialId = matId;
      }
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      const label = str(args, "name") || createPrimitiveNodeLabel(role, shape);
      const { command, nodeId } = createPlacePrimitiveNodeCommand(scene, transform, { data, name: label });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_primitives": {
      const items = (Array.isArray(args.items) ? args.items : []).filter(isRecord).slice(0, 60);
      if (items.length === 0) return fail("items is empty");
      const taken = new Set<string>();
      const uniqueId = (base: string) => {
        let i = 1;
        while (scene.nodes.has(`${base}:${i}`) || taken.has(`${base}:${i}`)) i++;
        taken.add(`${base}:${i}`);
        return `${base}:${i}`;
      };
      const nodes = items.map((item) => {
        const role = (str(item, "role", "brush") === "prop" ? "prop" : "brush") as "brush" | "prop";
        const shapeArg = str(item, "shape", "cube");
        const shape = (["cube", "sphere", "cylinder", "cone"].includes(shapeArg) ? shapeArg : "cube") as "cone" | "cube" | "cylinder" | "sphere";
        const size = vec3(num(item, "sizeX", 2), num(item, "sizeY", shape === "cylinder" || shape === "cone" ? 3 : 2), num(item, "sizeZ", 2));
        const data = createPrimitiveNodeData(role, shape, size);
        const matId = str(item, "materialId");
        if (matId) data.materialId = matId;
        return {
          id: uniqueId(`node:${role}:${shape}:copy`),
          kind: "primitive" as const,
          name: str(item, "name") || createPrimitiveNodeLabel(role, shape),
          transform: makeTransform(vec3(num(item, "x"), num(item, "y"), num(item, "z"))),
          data
        };
      });
      const add: GeometryNode[] = [...nodes];
      const folderName = str(args, "folder").trim();
      let folderId: string | undefined;
      if (folderName) {
        const n = nodes.length;
        const folderWorld = makeTransform(
          vec3(nodes.reduce((t, x) => t + x.transform.position.x, 0) / n, Math.min(...nodes.map((x) => x.transform.position.y)), nodes.reduce((t, x) => t + x.transform.position.z, 0) / n)
        );
        folderId = uniqueId("node:group");
        for (const node of nodes) {
          (node as GeometryNode).parentId = folderId;
          node.transform = localizeTransform(node.transform, folderWorld);
        }
        add.unshift({ id: folderId, kind: "group", name: folderName, data: {}, transform: folderWorld } as GeometryNode);
      }
      editor.execute(nodeBatchCommand(scene, `place ${nodes.length} primitives`, { add }));
      nodes.forEach((node, i) => markBuildReveal([node.id], i * BATCH_REVEAL_STAGGER_MS));
      return ok({ nodeIds: nodes.map((node) => node.id), folderId });
    }

    case "place_brush": {
      const halfX = num(args, "sizeX", 4) * 0.5;
      const halfY = num(args, "sizeY", 3) * 0.5;
      const halfZ = num(args, "sizeZ", 4) * 0.5;
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));
      const brushData = createAxisAlignedBrushFromBounds({
        x: { min: -halfX, max: halfX },
        y: { min: -halfY, max: halfY },
        z: { min: -halfZ, max: halfZ }
      });
      const meshData = convertBrushToEditableMesh(brushData);

      if (!meshData) {
        return fail("Failed to create mesh box");
      }

      const { command, nodeId } = createPlaceMeshNodeCommand(scene, transform, {
        data: meshData,
        name: str(args, "name") || "Mesh Box"
      });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_light": {
      const lightType = str(args, "type", "point") as "ambient" | "directional" | "hemisphere" | "point" | "spot";
      const data = createDefaultLightData(lightType);
      data.castShadow = false;

      if (args.color && typeof args.color === "string") {
        data.color = args.color;
      }

      if (typeof args.intensity === "number") {
        data.intensity = args.intensity;
      }

      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));

      if (lightType === "directional" || lightType === "spot") {
        data.target = vec3(
          num(args, "targetX", transform.position.x),
          num(args, "targetY", 0),
          num(args, "targetZ", transform.position.z)
        );
      }

      const label = str(args, "name") || createLightNodeLabel(lightType);
      const { command, nodeId } = createPlaceLightNodeCommand(scene, transform, { data, name: label });
      editor.execute(command);
      return ok({ nodeId });
    }

    case "place_entity": {
      const entityType = str(args, "type", "player-spawn") as "npc-spawn" | "player-spawn" | "smart-object" | "vfx-object";
      const entityCount = Array.from(scene.entities.values()).filter((e) => e.type === entityType).length;
      const entity = createDefaultEntity(entityType, vec3(num(args, "x"), num(args, "y"), num(args, "z")), entityCount);

      if (typeof args.rotationY === "number") {
        entity.transform.rotation.y = args.rotationY as number;
      }

      if (str(args, "name")) {
        entity.name = str(args, "name");
      }

      const command = createPlaceEntityCommand(entity);
      editor.execute(command);
      return ok({ entityId: entity.id });
    }

    case "place_player_spawn": {
      const entityCount = Array.from(scene.entities.values()).filter((e) => e.type === "player-spawn").length;
      const entity = createDefaultEntity("player-spawn", vec3(num(args, "x"), num(args, "y"), num(args, "z")), entityCount);

      if (typeof args.rotationY === "number") {
        entity.transform.rotation.y = args.rotationY as number;
      }

      if (str(args, "name")) {
        entity.name = str(args, "name");
      }

      editor.execute(createPlaceEntityCommand(entity));
      return ok({ entityId: entity.id });
    }

    // ── Transform ─────────────────────────────────────────────
    case "translate_nodes": {
      const nodeIds = strArray(args, "nodeIds");
      const delta = vec3(num(args, "dx"), num(args, "dy"), num(args, "dz"));
      const command = createTranslateNodesCommand(nodeIds, delta);
      editor.execute(command);
      return ok({});
    }

    case "set_node_transform": {
      const nodeId = str(args, "nodeId");
      const transform = makeTransform(vec3(num(args, "x"), num(args, "y"), num(args, "z")));

      if (typeof args.rotationX === "number") transform.rotation.x = args.rotationX as number;
      if (typeof args.rotationY === "number") transform.rotation.y = args.rotationY as number;
      if (typeof args.rotationZ === "number") transform.rotation.z = args.rotationZ as number;
      if (typeof args.scaleX === "number") transform.scale.x = args.scaleX as number;
      if (typeof args.scaleY === "number") transform.scale.y = args.scaleY as number;
      if (typeof args.scaleZ === "number") transform.scale.z = args.scaleZ as number;

      const command = createSetNodeTransformCommand(scene, nodeId, transform);
      editor.execute(command);
      return ok({});
    }

    case "duplicate_nodes": {
      const nodeIds = strArray(args, "nodeIds");
      const offset = vec3(num(args, "offsetX"), num(args, "offsetY"), num(args, "offsetZ"));
      const { command, duplicateIds } = createDuplicateNodesCommand(scene, nodeIds, offset);
      editor.execute(command);
      return ok({ duplicateIds });
    }

    case "mirror_nodes": {
      const command = createMirrorNodesCommand(strArray(args, "nodeIds"), str(args, "axis", "x") as "x" | "y" | "z");
      editor.execute(command);
      return ok({});
    }

    case "delete_nodes": {
      const command = createDeleteSelectionCommand(scene, strArray(args, "ids"));
      editor.execute(command);
      return ok({});
    }

    // ── Brush ─────────────────────────────────────────────────
    case "split_brush": {
      const { command, splitIds } = createSplitBrushNodesCommand(
        scene,
        strArray(args, "nodeIds"),
        str(args, "axis", "x") as "x" | "y" | "z"
      );
      editor.execute(command);
      return ok({ splitIds });
    }

    case "extrude_brush": {
      const command = createExtrudeBrushNodesCommand(
        scene,
        strArray(args, "nodeIds"),
        str(args, "axis", "y") as "x" | "y" | "z",
        num(args, "amount", 1),
        (String(args.direction ?? "1") === "-1" ? -1 : 1) as -1 | 1
      );
      editor.execute(command);
      return ok({});
    }

    case "offset_brush_face": {
      const command = createOffsetBrushFaceCommand(
        scene,
        str(args, "nodeId"),
        str(args, "axis", "y") as "x" | "y" | "z",
        str(args, "side", "max") as "max" | "min",
        num(args, "amount")
      );
      editor.execute(command);
      return ok({});
    }

    case "assign_material_to_brushes": {
      const command = createAssignMaterialToBrushesCommand(scene, strArray(args, "nodeIds"), str(args, "materialId"));
      editor.execute(command);
      return ok({});
    }

    // ── Materials ─────────────────────────────────────────────
    case "create_material": {
      const materialName = str(args, "name", "Custom Material");
      const slug = materialName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const id = str(args, "id") || `material:custom:${slug}`;
      const color = typeof args.color === "string" && args.color ? args.color : paletteColor(String(args.palette ?? ""), String(args.role ?? ""));
      if (!color) {
        return fail("Give color, or palette and role (palettes: meadow, harbor, ember, blossom, moss, frost; roles: ground, wood, stone, roof, accent, light)");
      }
      const material: Material = {
        id,
        name: materialName,
        color,
        category: (str(args, "category") || "custom") as "blockout" | "custom" | "flat",
        metalness: num(args, "metalness", 0),
        roughness: num(args, "roughness", 0.8)
      };
      const command = createUpsertMaterialCommand(scene, material);
      editor.execute(command);
      return ok({ materialId: id });
    }

    case "assign_material": {
      const targets = (args.targets as Array<{ nodeId: string; faceIds?: string[] }>) ?? [];
      const materialId = str(args, "materialId");
      const command = createAssignMaterialCommand(scene, targets, materialId);
      editor.execute(command);
      return ok({});
    }

    case "set_uv_scale": {
      const targets = (args.targets as Array<{ nodeId: string; faceIds?: string[] }>) ?? [];
      const uvScale = { x: num(args, "scaleX", 1), y: num(args, "scaleY", 1) };
      const command = createSetUvScaleCommand(scene, targets, uvScale);
      editor.execute(command);
      return ok({});
    }

    // ── Scene management ──────────────────────────────────────
    case "group_nodes": {
      const groupId = groupNodes(editor, strArray(args, "ids"), str(args, "name", "Folder"));
      if (!groupId) return fail("No valid nodes to group");
      const parentId = str(args, "parentId");
      if (parentId && scene.getNode(parentId)?.kind === "group") moveNodesTo(editor, [groupId], parentId);
      return ok({ groupId });
    }

    case "move_to_group": {
      const groupId = str(args, "groupId") || undefined;
      if (groupId && scene.getNode(groupId)?.kind !== "group") return fail("groupId is not a folder");
      return ok({ moved: moveNodesTo(editor, strArray(args, "ids"), groupId) });
    }

    case "rename_node": {
      renameNode(editor, str(args, "id"), str(args, "name"));
      return ok({});
    }

    case "ungroup": {
      return ungroup(editor, str(args, "groupId")) ? ok({}) : fail("Not a folder");
    }

    case "select_nodes": {
      editor.select(strArray(args, "ids"), "object");
      return ok({});
    }

    case "clear_selection": {
      editor.clearSelection();
      return ok({});
    }

    case "undo": {
      editor.undo();
      return ok({});
    }

    case "set_screen_effects": {
      const next: SceneSettings = structuredClone(scene.settings);
      next.world.postFx = presetValues(str(args, "preset") || "none");
      editor.execute(createSetSceneSettingsCommand(scene, next));
      return ok({ preset: next.world.postFx.preset, enabled: next.world.postFx.enabled });
    }

    case "set_scene_settings": {
      const current = scene.settings;
      const next: SceneSettings = structuredClone(current);

      if (typeof args.gravityX === "number" || typeof args.gravityY === "number" || typeof args.gravityZ === "number") {
        next.world.gravity = vec3(
          num(args, "gravityX", current.world.gravity.x),
          num(args, "gravityY", current.world.gravity.y),
          num(args, "gravityZ", current.world.gravity.z)
        );
      }

      if (typeof args.physicsEnabled === "boolean") next.world.physicsEnabled = args.physicsEnabled;
      if (typeof args.ambientColor === "string") next.world.ambientColor = args.ambientColor as string;
      if (typeof args.ambientIntensity === "number") next.world.ambientIntensity = args.ambientIntensity;
      if (typeof args.fogColor === "string") next.world.fogColor = args.fogColor as string;
      if (typeof args.fogNear === "number") next.world.fogNear = args.fogNear;
      if (typeof args.fogFar === "number") next.world.fogFar = args.fogFar;
      if (typeof args.toneMapping === "string") next.world.toneMapping = args.toneMapping as SceneSettings["world"]["toneMapping"];
      if (typeof args.cameraMode === "string") next.player.cameraMode = args.cameraMode as "fps" | "third-person" | "top-down";
      if (typeof args.playerHeight === "number") next.player.height = args.playerHeight;
      if (typeof args.movementSpeed === "number") next.player.movementSpeed = args.movementSpeed;
      if (typeof args.jumpHeight === "number") next.player.jumpHeight = args.jumpHeight;
      if (typeof args.postFx === "string") next.world.postFx = presetValues(args.postFx);

      const command = createSetSceneSettingsCommand(scene, next);
      editor.execute(command);
      return ok({});
    }

    case "push_scene_to_connected_game": {
      if (!context.requestScenePush) {
        return fail("Editor-to-game sync is unavailable in this session.");
      }

      context.requestScenePush({
        forceSwitch: bool(args, "forceSwitch") ?? true,
        gameId: str(args, "gameId") || undefined,
        projectName: str(args, "projectName") || undefined,
        projectSlug: str(args, "projectSlug") || undefined
      });
      return ok({ queued: true });
    }

    // ── Read-only queries ─────────────────────────────────────
    case "list_nodes": {
      return JSON.stringify(buildSceneOutline(editor).outline);
    }

    case "list_entities": {
      const entities = Array.from(scene.entities.values()).map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        parentId: e.parentId ?? null
      }));
      return JSON.stringify({ entities });
    }

    case "list_materials": {
      const materials = Array.from(scene.materials.values()).map((m) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        category: m.category
      }));
      return JSON.stringify({ materials });
    }

    case "list_scene_paths": {
      return JSON.stringify({ paths: scene.settings.paths ?? [] });
    }

    case "list_scene_events": {
      return JSON.stringify({ events: resolveGameplayEvents(scene.settings.events ?? []) });
    }

    case "list_hook_types": {
      return JSON.stringify({ hookTypes: buildHookCatalog() });
    }

    case "get_node_details": {
      const node = scene.getNode(str(args, "nodeId"));

      if (!node) {
        return fail("Node not found");
      }

      const { graph } = buildSceneOutline(editor);

      return JSON.stringify({
        id: node.id,
        name: node.name,
        kind: node.kind,
        parentId: node.parentId ?? null,
        childIds: graph.nodeChildrenByParentId.get(node.id) ?? [],
        attachedEntityIds: graph.entityChildrenByParentId.get(node.id) ?? [],
        transform: node.transform,
        worldTransform: graph.nodeWorldTransforms.get(node.id) ?? node.transform,
        tags: node.tags,
        metadata: node.metadata,
        hooks: node.hooks,
        data: node.data
      });
    }

    case "get_entity_details": {
      const entity = scene.getEntity(str(args, "entityId"));

      if (!entity) {
        return fail("Entity not found");
      }

      const { graph } = buildSceneOutline(editor);

      return JSON.stringify({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        parentId: entity.parentId ?? null,
        transform: entity.transform,
        worldTransform: graph.entityWorldTransforms.get(entity.id) ?? entity.transform,
        properties: entity.properties,
        hooks: entity.hooks
      });
    }

    case "get_scene_settings": {
      return JSON.stringify(scene.settings);
    }

    case "create_scene_path": {
      const currentPaths = scene.settings.paths ?? [];
      const points = pointArray(args.points);

      if (points.length === 0) {
        return fail("Path must include at least one valid point");
      }

      const nextPath: ScenePathDefinition = {
        id: resolvePathId(currentPaths, str(args, "id"), str(args, "name")),
        loop: bool(args, "loop") ?? false,
        name: str(args, "name", "Path"),
        points
      };
      const nextSettings: SceneSettings = {
        ...structuredClone(scene.settings),
        paths: [...currentPaths, nextPath]
      };
      editor.execute(createSetSceneSettingsCommand(scene, nextSettings));
      return ok({ path: nextPath });
    }

    case "update_scene_path": {
      const pathId = str(args, "pathId");
      const currentPaths = scene.settings.paths ?? [];
      const existingPath = currentPaths.find((pathDefinition) => pathDefinition.id === pathId);

      if (!existingPath) {
        return fail("Path not found");
      }

      const nextPoints = Array.isArray(args.points) ? pointArray(args.points) : undefined;

      if (Array.isArray(args.points) && (nextPoints?.length ?? 0) === 0) {
        return fail("Path must include at least one valid point");
      }

      const nextPath: ScenePathDefinition = {
        ...structuredClone(existingPath),
        ...(str(args, "name") ? { name: str(args, "name") } : {}),
        ...(typeof args.loop === "boolean" ? { loop: args.loop as boolean } : {}),
        ...(nextPoints ? { points: nextPoints } : {})
      };
      const nextSettings: SceneSettings = {
        ...structuredClone(scene.settings),
        paths: currentPaths.map((pathDefinition) => (pathDefinition.id === pathId ? nextPath : pathDefinition))
      };
      editor.execute(createSetSceneSettingsCommand(scene, nextSettings));
      return ok({ path: nextPath });
    }

    case "delete_scene_path": {
      const pathId = str(args, "pathId");
      const currentPaths = scene.settings.paths ?? [];

      if (!currentPaths.some((pathDefinition) => pathDefinition.id === pathId)) {
        return fail("Path not found");
      }

      const nextSettings: SceneSettings = {
        ...structuredClone(scene.settings),
        paths: currentPaths.filter((pathDefinition) => pathDefinition.id !== pathId)
      };
      editor.execute(createSetSceneSettingsCommand(scene, nextSettings));
      return ok({ pathId });
    }

    case "add_hook": {
      const targetKind = str(args, "targetKind") as "entity" | "node";
      const targetId = str(args, "targetId");
      const hookType = str(args, "hookType");
      const hook = createSceneHook(hookType, {
        defaultPathId: str(args, "defaultPathId") || undefined,
        targetId
      });

      if (!hook) {
        return fail("Unknown hook type");
      }

      const configPatch = gameplayObject(args.config);
      if (configPatch) {
        hook.config = mergeGameplayObject(hook.config, configPatch);
      }

      if (typeof args.enabled === "boolean") {
        hook.enabled = args.enabled as boolean;
      }

      return updateHooksOnTarget(editor, targetKind, targetId, (hooks) => ({
        hooks: [...hooks, hook],
        result: { hook, hookId: hook.id, targetId, targetKind }
      }));
    }

    case "set_hook_value": {
      const targetKind = str(args, "targetKind") as "entity" | "node";
      const targetId = str(args, "targetId");
      const hookId = str(args, "hookId");
      const path = str(args, "path");

      return updateHooksOnTarget(editor, targetKind, targetId, (hooks) => {
        const hookIndex = hooks.findIndex((hook) => hook.id === hookId);

        if (hookIndex === -1) {
          throw new Error("Hook not found");
        }

        const nextHooks = structuredClone(hooks);
        const nextHook = structuredClone(nextHooks[hookIndex]);
        nextHook.config = setGameplayValue(nextHook.config, path, structuredClone(args.value) as GameplayValue);
        nextHooks[hookIndex] = nextHook;

        return {
          hooks: nextHooks,
          result: { hook: nextHook, hookId, path, targetId, targetKind }
        };
      });
    }

    case "remove_hook": {
      const targetKind = str(args, "targetKind") as "entity" | "node";
      const targetId = str(args, "targetId");
      const hookId = str(args, "hookId");

      return updateHooksOnTarget(editor, targetKind, targetId, (hooks) => {
        if (!hooks.some((hook) => hook.id === hookId)) {
          throw new Error("Hook not found");
        }

        return {
          hooks: hooks.filter((hook) => hook.id !== hookId),
          result: { hookId, targetId, targetKind }
        };
      });
    }

    // ── Mesh topology query ─────────────────────────────────
    case "get_mesh_topology": {
      const node = scene.getNode(str(args, "nodeId"));

      if (!node || !isMeshNode(node)) {
        return fail("Node is not a mesh");
      }

      const mesh = node.data;
      const faces = mesh.faces.map((f) => {
        const vIds: string[] = [];
        let he = mesh.halfEdges.find((h) => h.id === f.halfEdge);

        if (he) {
          const startId = he.id;
          do {
            vIds.push(he!.vertex);
            he = mesh.halfEdges.find((h) => h.id === he!.next);
          } while (he && he.id !== startId);
        }

        const faceVertices = getFaceVertices(mesh, f.id);
        const center = faceVertices.reduce(
          (acc, vertex) => ({
            x: acc.x + vertex.position.x,
            y: acc.y + vertex.position.y,
            z: acc.z + vertex.position.z
          }),
          { x: 0, y: 0, z: 0 }
        );
        const normal = faceVertices.length >= 3
          ? computePolygonNormal(faceVertices.map((vertex) => vertex.position))
          : vec3(0, 0, 0);
        const vertexCount = faceVertices.length || 1;

        return {
          id: f.id,
          vertexIds: vIds,
          materialId: f.materialId,
          center: {
            x: center.x / vertexCount,
            y: center.y / vertexCount,
            z: center.z / vertexCount
          },
          normal
        };
      });

      const vertices = mesh.vertices.map((v) => ({
        id: v.id,
        position: v.position
      }));

      const edgeSet = new Set<string>();
      const edges: [string, string][] = [];

      for (const he of mesh.halfEdges) {
        const twin = he.twin ? mesh.halfEdges.find((h) => h.id === he.twin) : undefined;

        if (twin) {
          const key = [he.vertex, twin.vertex].sort().join(":");

          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push([he.vertex, twin.vertex]);
          }
        }
      }

      return JSON.stringify({ faces, vertices, edges });
    }

    // ── Mesh editing ──────────────────────────────────────────
    case "extrude_mesh_faces":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        extrudeEditableMeshFaces(mesh, strArray(args, "faceIds"), num(args, "amount")),
        "Extrude faces"
      );

    case "extrude_mesh_edge":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        extrudeEditableMeshEdge(mesh, [str(args, "vertexId1"), str(args, "vertexId2")], num(args, "amount")),
        "Extrude edge"
      );

    case "bevel_mesh_edges": {
      const edges = (args.edges as string[][] ?? []).map((e) => [e[0], e[1]] as [string, string]);
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        bevelEditableMeshEdges(mesh, edges, num(args, "width"), num(args, "steps", 1),
          (str(args, "profile") || "flat") as "flat" | "round"),
        "Bevel edges"
      );
    }

    case "subdivide_mesh_face":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        subdivideEditableMeshFace(mesh, str(args, "faceId"), num(args, "cuts", 1)),
        "Subdivide face"
      );

    case "cut_mesh_face":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        cutEditableMeshFace(mesh, str(args, "faceId"),
          vec3(num(args, "pointX"), num(args, "pointY"), num(args, "pointZ")),
          num(args, "snapSize", 1)),
        "Cut face"
      );

    case "delete_mesh_faces":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        deleteEditableMeshFaces(mesh, strArray(args, "faceIds")),
        "Delete faces"
      );

    case "merge_mesh_faces":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        mergeEditableMeshFaces(mesh, strArray(args, "faceIds")),
        "Merge faces"
      );

    case "merge_mesh_vertices":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        mergeEditableMeshVertices(mesh, strArray(args, "vertexIds")),
        "Merge vertices"
      );

    case "translate_mesh_vertices":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        translateEditableMeshVertices(
          mesh,
          strArray(args, "vertexIds"),
          vec3(num(args, "offsetX"), num(args, "offsetY"), num(args, "offsetZ"))
        ),
        "Translate vertices"
      );

    case "scale_mesh_vertices": {
      const hasPivot = ["pivotX", "pivotY", "pivotZ"].some((key) => typeof args[key] === "number");
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        scaleEditableMeshVertices(
          mesh,
          strArray(args, "vertexIds"),
          vec3(num(args, "scaleX", 1), num(args, "scaleY", 1), num(args, "scaleZ", 1)),
          hasPivot ? vec3(num(args, "pivotX"), num(args, "pivotY"), num(args, "pivotZ")) : undefined
        ),
        "Scale vertices"
      );
    }

    case "fill_mesh_face":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        fillEditableMeshFaceFromVertices(mesh, strArray(args, "vertexIds")),
        "Fill face"
      );

    case "invert_mesh_normals":
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        invertEditableMeshNormals(mesh, strArray(args, "faceIds").length > 0 ? strArray(args, "faceIds") : undefined),
        "Invert normals"
      );

    case "arc_mesh_edges": {
      const arcEdges = (args.edges as string[][] ?? []).map((e) => [e[0], e[1]] as [string, string]);
      return executeMeshOp(editor, str(args, "nodeId"), (mesh) =>
        arcEditableMeshEdges(mesh, arcEdges, num(args, "offset"), num(args, "segments", 2)),
        "Arc edges"
      );
    }

    case "inflate_mesh": {
      const command = createMeshInflateCommand(scene, strArray(args, "nodeIds"), num(args, "factor"));
      editor.execute(command);
      return ok({});
    }

    case "convert_brush_to_mesh": {
      const nodeId = str(args, "nodeId");
      const node = scene.getNode(nodeId);

      if (!node || !isBrushNode(node)) {
        return fail("Node is not a brush");
      }

      const meshData = convertBrushToEditableMesh(node.data);

      if (!meshData) {
        return fail("Failed to convert brush to mesh");
      }

      const meshNode = {
        ...structuredClone(node),
        kind: "mesh" as const,
        data: meshData
      };

      const command = createReplaceNodesCommand(scene, [meshNode], "convert brush to mesh");
      editor.execute(command);
      return ok({ nodeId });
    }

    case "split_brush_at_coordinate": {
      const { command, splitIds } = createSplitBrushNodeAtCoordinateCommand(
        scene,
        str(args, "nodeId"),
        str(args, "axis", "x") as "x" | "y" | "z",
        num(args, "coordinate")
      );
      editor.execute(command);
      return ok({ splitIds });
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

function executeMeshOp(
  editor: EditorCore,
  nodeId: string,
  op: (mesh: EditableMesh) => EditableMesh | undefined,
  label: string
): string {
  const node = editor.scene.getNode(nodeId);

  if (!node || !isMeshNode(node)) {
    return fail("Node is not a mesh");
  }

  const result = op(node.data);

  if (!result) {
    return fail(`${label} failed`);
  }

  // Preserve physics and role metadata from the original mesh
  result.physics = node.data.physics;
  result.role = node.data.role;

  editor.execute(createSetMeshDataCommand(editor.scene, nodeId, result, node.data));
  return ok({});
}

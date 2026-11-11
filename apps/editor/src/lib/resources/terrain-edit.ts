// Live island terrains in the viewport, and tool edits that are saved back to the node.
// An edit burst is saved as one undo step after a short pause.
import { createSetNodeCommand, type EditorCore } from "@theras/editor-core";
import * as THREE from "three";
import type { Tool } from "@/vendor/little-habitats/core/world";
import type { IslandTerrain } from "./little-habitats/terrain";

type Handle = { terrain: IslandTerrain; lastSaved: string | undefined };

const handles = new Map<string, Handle>();
let editorRef: EditorCore | null = null;

export function registerTerrainEditor(editor: EditorCore | null) {
  editorRef = editor;
}

export function registerTerrain(nodeId: string, terrain: IslandTerrain, savedState: string | undefined) {
  handles.set(nodeId, { terrain, lastSaved: savedState });
  return () => {
    if (handles.get(nodeId)?.terrain === terrain) handles.delete(nodeId);
  };
}

/** Called when the node metadata changes (load, undo, redo): loads it unless it is our own save. */
export function syncTerrainState(nodeId: string, state: string | undefined) {
  const handle = handles.get(nodeId);
  if (!handle || !state || state === handle.lastSaved) return;
  handle.lastSaved = state;
  handle.terrain.load(state);
}

export function getTerrain(nodeId: string): IslandTerrain | undefined {
  return handles.get(nodeId)?.terrain;
}

export function hasTerrain() {
  return handles.size > 0;
}

export function terrainNodeIds() {
  return [...handles.keys()];
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(nodeId: string) {
  clearTimeout(saveTimers.get(nodeId));
  saveTimers.set(
    nodeId,
    setTimeout(() => {
      saveTimers.delete(nodeId);
      const handle = handles.get(nodeId);
      const editor = editorRef;
      const node = editor?.scene.getNode(nodeId);
      if (!handle || !editor || !node) return;
      const state = handle.terrain.serialize();
      if (state === node.metadata?.world) return;
      handle.lastSaved = state;
      editor.execute(createSetNodeCommand(editor.scene, nodeId, { ...node, metadata: { ...node.metadata, world: state } }));
    }, 450)
  );
}

const local = new THREE.Vector3();

/**
 * Applies a terrain tool at a world point on the first terrain that contains it.
 * Returns true when a terrain changed.
 */
export function applyTerrainTool(tool: Tool, worldPoint: THREE.Vector3, alt: boolean, radius = 0): boolean {
  for (const [nodeId, handle] of handles) {
    local.copy(worldPoint);
    handle.terrain.object.worldToLocal(local);
    if (handle.terrain.apply(tool, local.x, local.z, alt, radius)) {
      scheduleSave(nodeId);
      return true;
    }
  }
  return false;
}

/** True for an island node or its lake node (taps on either shape the island). */
export function isTerrainSurface(nodeId: string): boolean {
  if (handles.has(nodeId)) return true;
  const lakeOf = editorRef?.scene.getNode(nodeId)?.metadata?.lakeOf;
  return typeof lakeOf === "string" && handles.has(lakeOf);
}

const terrainRay = new THREE.Raycaster();

/**
 * Hits only island land and lake meshes, straight through anything on top of them, so
 * terrain tools always shape the island (never the old box blocks). Falls back to the
 * water plane height (y = 0) inside the island area.
 */
export function raycastTerrain(ray: THREE.Ray): THREE.Vector3 | null {
  terrainRay.ray.copy(ray);
  let best: THREE.Intersection | null = null;
  for (const handle of handles.values()) {
    const objects = [...handle.terrain.pickables, handle.terrain.water];
    const hit = terrainRay.intersectObjects(objects, true)[0];
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  if (best) return best.point.clone();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  return terrainRay.ray.intersectPlane(plane, point) ? point : null;
}

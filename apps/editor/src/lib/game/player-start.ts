// Player start marker in the scene document: find it, set it.
// The marker is a library group node (resources/game/player-start.ts) with
// metadata { resource: PLAYER_START_RESOURCE, seed: 0, [PLAYER_START_META]: true }.
import type { EditorCore } from "@theras/editor-core";
import { localizeTransform, makeTransform, resolveSceneGraph, vec3, type GeometryNode, type GroupNode } from "@theras/shared";
import { Euler, Vector3 } from "three";
import { nodeBatchCommand, uniqueNodeId } from "@/lib/outliner";
import type { PlayerStart } from "@/viewport/components/game/GameWorld";
import { PLAYER_START_META, PLAYER_START_RESOURCE } from "./game-store";

const isMarker = (node: { metadata?: Record<string, unknown> }) => node.metadata?.[PLAYER_START_META] === true;

/** Facing of a rotation (radians, 0 = toward -z): where local -z points, in the ground plane. */
function yawOf(rotation: { x: number; y: number; z: number }) {
  const forward = new Vector3(0, 0, -1).applyEuler(new Euler(rotation.x, rotation.y, rotation.z, "XYZ"));
  if (Math.hypot(forward.x, forward.z) < 1e-6) return rotation.y;
  return Math.atan2(-forward.x, -forward.z);
}

/** The marker of the scene (feet position, facing), or null when the scene has none. */
export function findPlayerStart(editor: EditorCore): (PlayerStart & { nodeId: string }) | null {
  const scene = editor.scene;
  let marker: GeometryNode | undefined;
  for (const node of scene.nodes.values()) {
    if (isMarker(node)) {
      marker = node;
      break;
    }
  }
  if (!marker) return null;
  const world = marker.parentId
    ? (resolveSceneGraph(scene.nodes.values(), scene.entities.values()).nodeWorldTransforms.get(marker.id) ?? marker.transform)
    : marker.transform;
  const { x, y, z } = world.position;
  return { nodeId: marker.id, x, y, z, yaw: yawOf(world.rotation) };
}

/**
 * Puts the marker at a point (feet, world meters) facing yaw (radians, 0 = toward -z).
 * Creates the marker node or moves the one the scene has. One undo step. Returns the node id.
 */
export function setPlayerStart(editor: EditorCore, point: { x: number; y: number; z: number }, yaw: number): string {
  const scene = editor.scene;
  const world = makeTransform(vec3(point.x, point.y, point.z));
  world.rotation.y = yaw;
  const existing = [...scene.nodes.values()].find(isMarker);
  if (existing) {
    const parentWorld = existing.parentId
      ? resolveSceneGraph(scene.nodes.values(), scene.entities.values()).nodeWorldTransforms.get(existing.parentId)
      : undefined;
    const transform = localizeTransform(world, parentWorld);
    const next = { ...structuredClone(existing), transform } as GeometryNode;
    editor.execute(nodeBatchCommand(scene, "move player start", { update: [next] }));
    return existing.id;
  }
  const node: GroupNode = {
    id: uniqueNodeId(scene, "node:resource:player-start"),
    kind: "group",
    name: "Player start",
    transform: world,
    data: {},
    metadata: { resource: PLAYER_START_RESOURCE, seed: 0, [PLAYER_START_META]: true }
  };
  editor.execute(nodeBatchCommand(scene, "set player start", { add: [node] }));
  return node.id;
}

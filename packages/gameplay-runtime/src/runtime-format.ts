import type { RuntimeScene } from "@theras/runtime-format";
import type { GameplayRuntimeScene } from "./types";

export function createGameplayRuntimeSceneFromRuntimeScene(
  scene: Pick<RuntimeScene, "entities" | "nodes">
): GameplayRuntimeScene {
  return {
    entities: scene.entities,
    nodes: scene.nodes
  };
}

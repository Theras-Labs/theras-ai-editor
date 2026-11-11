import type { Object3D } from "three";
import type { TherasEngineNode, TherasEngineScene } from "../types";
import type { CreateNodeObjectOverrides, TherasSceneObjectFactoryOptions, TherasSceneObjectFactoryResources } from "./types";
import { createObjectForNode, createInstancingObjects } from "./node-object";

export type TherasSceneObjectFactory = {
  createInstancingObjects: () => Promise<Object3D[]>;
  createNodeObject: (node: TherasEngineNode, overrides?: CreateNodeObjectOverrides) => Promise<Object3D>;
};

export function createTherasSceneObjectFactory(
  engineScene: Pick<TherasEngineScene, "assets" | "nodes" | "settings">,
  options: TherasSceneObjectFactoryOptions = {}
): TherasSceneObjectFactory {
  const resources: TherasSceneObjectFactoryResources = {
    assetsById: new Map(engineScene.assets.map((asset) => [asset.id, asset])),
    materialCache: new Map(),
    modelTemplateCache: new Map(),
    textureCache: new Map()
  };

  return {
    createInstancingObjects: () => createInstancingObjects(engineScene, resources, options),
    createNodeObject: (node, overrides) => createObjectForNode(node, resources, options, engineScene.settings.world.lod, overrides)
  };
}

export const createThreeRuntimeObjectFactory = createTherasSceneObjectFactory;

export { preloadLazyRuntimeModels } from "./lazy-model";
export { extractPhysics, findPrimaryLight } from "./scene-utils";

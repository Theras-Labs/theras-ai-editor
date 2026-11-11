import { BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import { resolveSceneGraph } from "@theras/shared";
import type { WorldLodSettings } from "@theras/shared";
import type { TherasEngineModelNode, TherasEngineNode, TherasExportModelLod } from "../types";
import type { TherasSceneObjectFactoryOptions, TherasSceneObjectFactoryResources } from "./types";
import { composeTransformMatrix, computeInstancedBatchCenter } from "./scene-utils";
import { loadModelTemplate, resolveModelReference } from "./model-object";
import {
  createLazyRuntimeModelGroup,
  resolveRuntimeModelLevelDescriptors
} from "./lazy-model";

const tempModelInstanceMatrix = new Matrix4();
const tempModelChildMatrix = new Matrix4();

export async function createInstancedModelObject(
  sourceNode: TherasEngineModelNode,
  instances: Array<Extract<TherasEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  resources: TherasSceneObjectFactoryResources,
  options: TherasSceneObjectFactoryOptions,
  lodLevel?: TherasExportModelLod
) {
  const group = new Group();
  const template = await loadModelTemplate(
    resolveModelReference(sourceNode, resources.assetsById, lodLevel),
    options,
    resources
  );
  const templateInstanceNodeIds = instances.map((instance) => instance.id);
  let modelMeshIndex = 0;

  template.updateMatrixWorld(true);

  template.traverse((child) => {
    if (!(child instanceof Mesh) || !(child.geometry instanceof BufferGeometry)) {
      return;
    }

    const instancedMesh = new InstancedMesh(child.geometry, child.material, instances.length);
    instancedMesh.castShadow = options.castShadow ?? true;
    instancedMesh.receiveShadow = options.receiveShadow ?? true;
    instancedMesh.frustumCulled = false;
    instancedMesh.name = `${sourceNode.name}:${lodLevel?.level ?? "high"}:${child.name || modelMeshIndex}:instanced`;
    instancedMesh.userData.theras = {
      instanceNodeIds: templateInstanceNodeIds,
      lodLevel: lodLevel?.level ?? "high",
      modelMeshIndex,
      sourceNodeId: sourceNode.id
    };

    tempModelChildMatrix.copy(child.matrixWorld);

    instances.forEach((instance, index) => {
      const worldTransform = sceneGraph.nodeWorldTransforms.get(instance.id) ?? instance.transform;
      tempModelInstanceMatrix.copy(composeTransformMatrix(worldTransform)).multiply(tempModelChildMatrix);
      instancedMesh.setMatrixAt(index, tempModelInstanceMatrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.computeBoundingBox();
    instancedMesh.computeBoundingSphere();
    group.add(instancedMesh);
    modelMeshIndex += 1;
  });

  group.name = `${sourceNode.name}:instances`;
  group.userData.theras = {
    instanceNodeIds: templateInstanceNodeIds,
    sourceNodeId: sourceNode.id
  };
  return group;
}

export async function createInstancedObjectForModelNode(
  sourceNode: TherasEngineModelNode,
  instances: Array<Extract<TherasEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  resources: TherasSceneObjectFactoryResources,
  options: TherasSceneObjectFactoryOptions,
  worldLodSettings: WorldLodSettings
) {
  const highReference = resolveModelReference(sourceNode, resources.assetsById);

  if (!highReference.modelPath) {
    return createInstancedModelObject(sourceNode, instances, sceneGraph, resources, options);
  }

  return createLazyInstancedModelObject(sourceNode, instances, sceneGraph, resources, options, worldLodSettings);
}

export function createLazyInstancedModelObject(
  sourceNode: TherasEngineModelNode,
  instances: Array<Extract<TherasEngineNode, { kind: "instancing" }>>,
  sceneGraph: ReturnType<typeof resolveSceneGraph>,
  resources: TherasSceneObjectFactoryResources,
  options: TherasSceneObjectFactoryOptions,
  worldLodSettings: WorldLodSettings
) {
  const descriptors = resolveRuntimeModelLevelDescriptors(sourceNode, options.lod, worldLodSettings);
  const fallback = new Group();
  const center = computeInstancedBatchCenter(instances, sceneGraph);

  fallback.userData.theras = {
    instanceNodeIds: instances.map((instance) => instance.id),
    sourceNodeId: sourceNode.id
  };

  return createLazyRuntimeModelGroup({
    descriptors,
    fallback,
    name: `${sourceNode.name}:InstancingLOD`,
    onLoadLevel: (descriptor) =>
      createInstancedModelObject(
        sourceNode,
        instances,
        sceneGraph,
        resources,
        options,
        descriptor.reference
      ),
    resolveDistance: (camera) => camera.position.distanceTo(center)
  });
}

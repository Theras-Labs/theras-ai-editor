import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LOD,
  Mesh
} from "three";
import type { TherasEngineGeometryNode, TherasEngineNode, TherasExportGeometry, TherasExportGeometryLod } from "../types";
import type { TherasSceneObjectFactoryOptions, TherasSceneObjectFactoryResources } from "./types";
import { createThreeMaterial } from "./scene-material";
import { resolveConfiguredSceneLodLevels } from "../loader/lod-config";
import type { WorldLodSettings } from "@theras/shared";

export async function createGeometryObject(
  geometry: TherasExportGeometry,
  node: Pick<TherasEngineNode, "id" | "name">,
  resources: TherasSceneObjectFactoryResources,
  options: TherasSceneObjectFactoryOptions,
  lodLevel?: TherasExportGeometryLod
) {
  const group = new Group();
  const meshes: Mesh[] = [];

  for (const primitive of geometry.primitives) {
    const primitiveGeometry = new BufferGeometry();
    primitiveGeometry.setAttribute("position", new Float32BufferAttribute(primitive.positions, 3));
    primitiveGeometry.setAttribute("normal", new Float32BufferAttribute(primitive.normals, 3));

    if (primitive.uvs.length > 0) {
      primitiveGeometry.setAttribute("uv", new Float32BufferAttribute(primitive.uvs, 2));
    }

    (primitive.blendLayers ?? (primitive.blend ? [primitive.blend] : [])).forEach((layer, layerIndex) => {
      if (layer.weights.length) {
        primitiveGeometry.setAttribute(`whBlendWeight${layerIndex}`, new Float32BufferAttribute(layer.weights, 1));
      }
    });

    primitiveGeometry.setIndex(primitive.indices);
    primitiveGeometry.computeBoundingBox();
    primitiveGeometry.computeBoundingSphere();

    const material = await createThreeMaterial(
      primitive.material,
      primitive.blendLayers ?? (primitive.blend ? [primitive.blend] : undefined),
      resources,
      options,
    );
    const mesh = new Mesh(primitiveGeometry, material);

    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.name = `${node.name}:${lodLevel?.level ?? "high"}:${primitive.material.name}`;
    mesh.userData.theras = {
      lodLevel: lodLevel?.level ?? "high",
      materialId: primitive.material.id,
      nodeId: node.id
    };

    meshes.push(mesh);
  }

  meshes.forEach((mesh) => {
    group.add(mesh);
  });

  return group;
}

export async function createLodObjectForGeometryNode(
  node: TherasEngineGeometryNode,
  resources: TherasSceneObjectFactoryResources,
  options: TherasSceneObjectFactoryOptions,
  worldLodSettings: WorldLodSettings
) {
  const baseGroup = await createGeometryObject(node.geometry, node, resources, options);
  const configuredLevels = resolveConfiguredSceneLodLevels(options.lod, worldLodSettings);

  if (!configuredLevels?.length || !node.lods?.length) {
    return baseGroup;
  }

  const lod = new LOD();
  lod.name = `${node.name}:LOD`;
  lod.autoUpdate = true;
  lod.addLevel(baseGroup, 0);

  for (const level of node.lods) {
    const levelGroup = await createGeometryObject(level.geometry, node, resources, options, level);
    const distance = configuredLevels.find((entry) => entry.level === level.level)?.distance;

    if (typeof distance === "number") {
      lod.addLevel(levelGroup, distance);
    }
  }

  lod.userData.theras = {
    levelOrder: ["high", ...(node.lods ?? []).map((level) => level.level)],
    nodeId: node.id
  };
  return lod;
}

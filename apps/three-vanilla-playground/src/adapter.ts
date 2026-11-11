import { deriveRenderScene, type DerivedRenderScene } from "@theras/render-pipeline";
import type { Material } from "@theras/shared";
import type { TherasEngineScene } from "@theras/three-runtime";

export function createPlaybackRenderScene(scene: TherasEngineScene): DerivedRenderScene {
  return deriveRenderScene(
    scene.nodes,
    scene.entities,
    scene.materials.map(toSharedMaterial),
    scene.assets
  );
}

function toSharedMaterial(material: TherasEngineScene["materials"][number]): Material {
  return {
    color: material.color,
    colorTexture: material.baseColorTexture,
    id: material.id,
    metalness: material.metallicFactor,
    metalnessTexture: material.metallicRoughnessTexture,
    name: material.name,
    normalTexture: material.normalTexture,
    roughness: material.roughnessFactor,
    roughnessTexture: material.metallicRoughnessTexture,
    side: material.side
  };
}

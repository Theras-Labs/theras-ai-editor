import type { SceneSkyboxSettings } from "@theras/shared";
import type { Scene } from "three";
import type { ToneMapping } from "three";
import type { TherasExportMaterial, TherasEngineNode } from "../types";
import type { Asset } from "@theras/shared";

export type TextureSlot = "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture";

export type TherasAssetResolverContext =
  | {
      kind: "model";
      node: Extract<TherasEngineNode, { kind: "model" }>;
      asset?: Asset;
      path: string;
      format: "gltf" | "obj";
    }
  | {
      kind: "texture";
      material: TherasExportMaterial;
      path: string;
      slot: TextureSlot;
    }
  | {
      kind: "skybox";
      path: string;
      skybox: SceneSkyboxSettings;
    };

export type TherasSceneLoaderOptions = {
  applyToScene?: Scene;
  applyToRenderer?: {
    toneMapping: ToneMapping;
  };
  castShadow?: boolean;
  lod?: TherasSceneLodOptions;
  receiveShadow?: boolean;
  resolveAssetUrl?: (context: TherasAssetResolverContext) => Promise<string> | string;
  /**
   * When true, materials with texture variation are created as
   * `MeshStandardNodeMaterial` (three/webgpu) with TSL-based voronoi variation
   * instead of using the WebGL `onBeforeCompile` hook. Required when the scene
   * is rendered with `WebGPURenderer`.
   */
  useNodeMaterials?: boolean;
};

export type TherasSceneLodOptions = {
  levels?: Array<{ distance: number; level: string }>;
  lowDistance?: number;
  midDistance?: number;
};

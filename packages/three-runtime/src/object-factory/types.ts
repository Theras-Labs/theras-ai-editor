import type { Asset, Vec3 } from "@theras/shared";
import type { MeshStandardMaterial, Object3D, Texture } from "three";
import type { TherasSceneLoaderOptions } from "../loader/types";
import type { TherasExportMaterial, TherasExportModelLod } from "../types";

export type TextureSlot = "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture";

export type TherasSceneObjectFactoryOptions = Pick<
  TherasSceneLoaderOptions,
  "castShadow" | "lod" | "receiveShadow" | "resolveAssetUrl" | "useNodeMaterials"
>;

export type CreateNodeObjectOverrides = {
  transform?: import("@theras/shared").Transform;
};

export type ModelReference = {
  asset?: Asset;
  assetId?: string;
  center?: Vec3;
  fallbackName: string;
  format: "gltf" | "obj";
  materialMtlText?: string;
  modelPath?: string;
  nodeId: string;
  nodeName: string;
  texturePath?: string;
};

export type RuntimeModelLevelDescriptor = {
  distance: number;
  key: "high" | TherasExportModelLod["level"];
  reference?: TherasExportModelLod;
};

export type TherasSceneObjectFactoryResources = {
  assetsById: Map<string, Asset>;
  materialCache: Map<string, MeshStandardMaterial>;
  modelTemplateCache: Map<string, Promise<Object3D>>;
  textureCache: Map<string, Promise<Texture>>;
};

import {
  createTherasEngineBundleZip as packTherasEngineBundle,
  externalizeTherasEngineScene as externalizeTherasEngineSceneAssets,
  parseTherasEngineBundleZip as unpackTherasEngineBundle
} from "@theras/runtime-build";
import type { RuntimeBundle, TherasEngineBundle } from "@theras/runtime-format";

export {
  buildRuntimeBundle,
  buildRuntimeScene,
  buildRuntimeWorldIndex,
  externalizeRuntimeAssets,
  packRuntimeBundle,
  unpackRuntimeBundle
} from "@theras/runtime-build";

export function createThreeAssetResolver(bundle: RuntimeBundle) {
  const urlByPath = new Map<string, string>();

  return {
    dispose() {
      urlByPath.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urlByPath.clear();
    },
    resolve(path: string) {
      const existing = urlByPath.get(path);

      if (existing) {
        return existing;
      }

      const file = bundle.files.find((entry) => entry.path === path);

      if (!file) {
        return path;
      }

      const bytes = new Uint8Array(file.bytes.byteLength);
      bytes.set(file.bytes);
      const url = URL.createObjectURL(new Blob([bytes.buffer], { type: file.mimeType }));
      urlByPath.set(path, url);
      return url;
    }
  };
}

export function createTherasBundleAssetResolver(bundle: TherasEngineBundle) {
  return createThreeAssetResolver(bundle);
}

export function createTherasEngineBundleZip(bundle: TherasEngineBundle, options?: Parameters<typeof packTherasEngineBundle>[1]) {
  return packTherasEngineBundle(bundle, options);
}

export function parseTherasEngineBundleZip(bundleBytes: Uint8Array, options?: Parameters<typeof unpackTherasEngineBundle>[1]) {
  return unpackTherasEngineBundle(bundleBytes, options);
}

export function externalizeTherasEngineScene(
  scene: TherasEngineBundle["manifest"],
  options?: Parameters<typeof externalizeTherasEngineSceneAssets>[1]
) {
  return externalizeTherasEngineSceneAssets(scene, options);
}

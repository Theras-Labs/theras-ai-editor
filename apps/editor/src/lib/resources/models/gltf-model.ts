// File-based library models (GLB in public/library/models). Each file loads once and is shared by
// every copy. The model stands on the ground (y = 0), centered on x and z. Either it is scaled to
// a set height (single props, creatures) or by a fixed factor (modular kits, so pieces still fit
// together).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ResourceInstance } from "../types";

export const LIBRARY_BASE = `${import.meta.env.BASE_URL}library`;

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

function loadModel(url: string): Promise<THREE.Object3D> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      return gltf.scene;
    });
    // A failed load can be tried again later.
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

export type ModelFit = { height: number } | { scale: number };

/** An empty group at once; the model is added when its file has loaded. */
export function modelInstance(url: string, fit: ModelFit): ResourceInstance {
  const holder = new THREE.Group();
  const ready = loadModel(url).then((source) => {
    const model = source.clone(true);
    if ("height" in fit) {
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.multiplyScalar(size.y > 0 ? fit.height / size.y : 1);
    } else {
      model.scale.multiplyScalar(fit.scale);
    }
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    holder.add(model);
  });
  ready.catch((error) => console.warn(`[library] could not load ${url}:`, error));
  return { object: holder, ready: ready.catch(() => undefined) };
}

export const titleCase = (slug: string) => {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

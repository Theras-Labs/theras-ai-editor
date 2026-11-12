// Slot icons are small renders of what the slot places (like Blender asset previews):
// a recipe's primitives or a library object, lit and framed at a three-quarter view.
// One shared offscreen renderer; results are cached by content, so a changed recipe
// gets a new icon automatically.
import * as THREE from "three";
import { getResource } from "@/lib/resources/catalog";
import { setPortTextureSize } from "@/lib/resources/port/kit";
import type { ResourceInstance } from "@/lib/resources/types";
import type { BuildSlot, SlotRecipe } from "./types";

const SIZE = 128;
let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, string>();

/** The shared offscreen renderer. Port surfaces drawn for it are small: an icon is 128 px. */
function getRenderer() {
  if (!renderer) {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    setPortTextureSize(renderer, 256);
  }
  return renderer;
}

function recipeObject(recipe: SlotRecipe): THREE.Object3D {
  const group = new THREE.Group();
  const colors = new Map(recipe.materials.map((m) => [m.key, m]));
  for (const part of recipe.parts) {
    const seg = Math.max(3, Math.min(32, part.segments ?? 16));
    let geometry: THREE.BufferGeometry;
    switch (part.shape) {
      case "cylinder":
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, seg);
        break;
      case "cone":
        geometry = new THREE.ConeGeometry(0.5, 1, seg);
        break;
      case "sphere":
        geometry = new THREE.SphereGeometry(0.5, seg, Math.max(3, Math.round(seg * 0.75)));
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }
    const m = colors.get(part.material);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: m?.color ?? "#9a9a9a", roughness: m?.roughness ?? 0.8, metalness: m?.metalness ?? 0, flatShading: seg < 10 })
    );
    mesh.position.set(part.x, part.y, part.z);
    mesh.rotation.y = part.rotationY ?? 0;
    mesh.scale.set(part.sizeX, part.sizeY, part.sizeZ);
    group.add(mesh);
  }
  return group;
}

/** Content key: the icon changes when this changes. */
export function slotPreviewKey(slot: BuildSlot): string | null {
  if (slot.kind === "resource" && slot.resourceId) return `res:${slot.resourceId}`;
  if (slot.recipe) return `rec:${JSON.stringify(slot.recipe)}`;
  return null;
}

// Previews of objects that build later (a GLB that loads, a port prop whose surfaces the
// graphics card draws) are empty at the first draw. They are drawn again when the instance is
// ready, and the listeners of that key hear about the new picture.
const listeners = new Map<string, Set<(url: string) => void>>();
/** Keys whose second picture is pending: a second call does not build the object again. */
const pending = new Set<string>();

/** Calls back once the late picture of this key is in the cache. Returns the unsubscribe. */
export function subscribeSlotPreview(key: string, callback: (url: string) => void): () => void {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0 && listeners.get(key) === set) listeners.delete(key);
  };
}

/** Draws the object framed at a three-quarter view. null when it has no visible bounds yet. */
function drawObject(object: THREE.Object3D): string | null {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#e8f2ff", "#5b5040", 1.6));
  const sun = new THREE.DirectionalLight("#fff2dc", 2.2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  scene.add(object);
  object.updateMatrixWorld(true);

  try {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.05;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
    const dir = new THREE.Vector3(1, 0.75, 1.25).normalize();
    camera.position.copy(center).addScaledVector(dir, radius / Math.sin(THREE.MathUtils.degToRad(15)));
    camera.lookAt(center);

    const r = getRenderer();
    r.setClearColor(0x000000, 0);
    r.render(scene, camera);
    return r.domElement.toDataURL("image/png");
  } finally {
    scene.remove(object);
  }
}

function disposeRecipeObject(object: THREE.Object3D) {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
}

/**
 * Renders a slot preview to a PNG data URL, or null when the slot has nothing to show yet.
 * A library object that builds later returns null now; subscribeSlotPreview hears its picture.
 */
export function renderSlotPreview(slot: BuildSlot): string | null {
  const key = slotPreviewKey(slot);
  if (!key) return null;
  const cached = cache.get(key);
  if (cached) return cached;
  if (pending.has(key)) return null;

  if (slot.kind === "resource" && slot.resourceId) {
    const entry = getResource(slot.resourceId);
    if (!entry?.create) return null;
    let instance: ResourceInstance;
    try {
      instance = entry.create(7, { appear: false, renderer: getRenderer() });
    } catch {
      return null;
    }
    const url = drawObject(instance.object);
    if (url || !instance.ready) {
      instance.dispose?.();
      if (url) cache.set(key, url);
      return url;
    }
    // Keep the instance until its second picture, then dispose it, also when ready fails.
    pending.add(key);
    const ready = instance.ready;
    void ready
      .then(() => {
        const late = drawObject(instance.object);
        if (!late) return;
        cache.set(key, late);
        for (const callback of [...(listeners.get(key) ?? [])]) callback(late);
      })
      .catch(() => undefined)
      .finally(() => {
        pending.delete(key);
        instance.dispose?.();
      });
    return null;
  }

  if (!slot.recipe) return null;
  const object = recipeObject(slot.recipe);
  const url = drawObject(object);
  disposeRecipeObject(object);
  if (url) cache.set(key, url);
  return url;
}

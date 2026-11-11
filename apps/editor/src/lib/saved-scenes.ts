// Saved scenes: the Scenes dialog saves the whole scene under a name in this browser, opens a
// saved one again, and also saves or opens a .whmap file (to keep a scene on disk or move it
// to another computer). App.tsx sets the bridge: it owns the world editor and the draft format.
import { proxy } from "valtio";
import {
  deleteNamedScene,
  listSavedScenes,
  loadNamedScene,
  savedSceneId,
  saveNamedScene,
  type SavedSceneCamera,
  type SavedSceneMeta,
  type StoredSceneEditorDraft
} from "./draft-storage";
import { uiStore } from "@/state/ui-store";

export const savedScenesStore = proxy({ open: false });

export type SceneBridge = {
  build: () => StoredSceneEditorDraft;
  restore: (draft: StoredSceneEditorDraft, camera?: SavedSceneCamera) => void;
  nodeCount: () => number;
  sceneName: () => string;
  saveFile: () => void;
  openFile: () => void;
};

let bridge: SceneBridge | null = null;

export function setSceneBridge(next: SceneBridge) {
  bridge = next;
}

function requireBridge(): SceneBridge {
  if (!bridge) throw new Error("The editor is not ready yet.");
  return bridge;
}

function currentCamera(): SavedSceneCamera | undefined {
  const camera = uiStore.viewports.perspective?.camera;
  if (!camera) return undefined;
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [camera.target.x, camera.target.y, camera.target.z]
  };
}

/** Name of a backup save made before another scene replaces the current one. */
export const BACKUP_NAME = "Backup before open";

export async function saveCurrentScene(name: string): Promise<SavedSceneMeta> {
  const b = requireBridge();
  const clean = name.trim() || b.sceneName() || "Untitled scene";
  const draft = { ...b.build(), projectName: clean };
  const meta: SavedSceneMeta = { id: savedSceneId(clean), name: clean, updatedAt: Date.now(), nodeCount: b.nodeCount(), camera: currentCamera() };
  await saveNamedScene(meta, draft);
  return meta;
}

/** Opens a saved scene. The current scene is kept first as "Backup before open". */
export async function openSavedScene(meta: SavedSceneMeta): Promise<void> {
  const b = requireBridge();
  const draft = await loadNamedScene(meta.id);
  if (!draft) throw new Error(`The save "${meta.name}" is missing or from an older version.`);
  if (meta.id !== savedSceneId(BACKUP_NAME)) await saveCurrentScene(BACKUP_NAME);
  b.restore(draft, meta.camera);
}

export { deleteNamedScene, listSavedScenes, type SavedSceneMeta };

export function saveSceneFile() {
  requireBridge().saveFile();
}

export function openSceneFile() {
  requireBridge().openFile();
}

export function sceneName(): string {
  return bridge?.sceneName() ?? "";
}

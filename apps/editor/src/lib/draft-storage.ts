import { createWorldBundleFromLegacyScene, type SceneDocumentSnapshot, type WorldPersistenceBundle } from "@theras/editor-core";

const DATABASE_NAME = "theras-editor-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_KEY = "world-editor:active";

type LegacyStoredSceneEditorDraft = {
  projectName: string;
  projectSlug: string;
  projectSlugDirty: boolean;
  snapshot: SceneDocumentSnapshot;
  updatedAt: number;
  version: 1;
};

export type StoredSceneEditorDraft = {
  projectName: string;
  projectSlug: string;
  projectSlugDirty: boolean;
  snapshot: WorldPersistenceBundle;
  updatedAt: number;
  version: 2;
};

export async function loadStoredSceneEditorDraft(): Promise<StoredSceneEditorDraft | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  const database = await openDraftDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(ACTIVE_DRAFT_KEY);

    request.onsuccess = () => {
      database.close();
      const result = request.result as LegacyStoredSceneEditorDraft | StoredSceneEditorDraft | undefined;

      if (!result) {
        resolve(null);
        return;
      }

      if (result.version === 1) {
        resolve({
          ...result,
          snapshot: createWorldBundleFromLegacyScene(result.snapshot),
          version: 2
        });
        return;
      }

      resolve(result.version === 2 ? result : null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Failed to load the Theras Editor draft."));
    };
  });
}

export async function saveSceneEditorDraft(draft: StoredSceneEditorDraft): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  const database = await openDraftDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Failed to save the Theras Editor draft."));
    };

    store.put(draft, ACTIVE_DRAFT_KEY);
  });
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open the Theras Editor draft database."));
  });
}

// ── Saved scenes ─────────────────────────────────────────────
// Named saves in the same IndexedDB store as the draft (this browser only). Each save is two
// records: "saved-meta:<id>" (name, date, counts, camera; small, for the list) and
// "saved:<id>" (the full scene). Use File > Export > World (.whmap) to move a scene to another
// browser or computer.

export type SavedSceneCamera = { position: [number, number, number]; target: [number, number, number] };

export type SavedSceneMeta = {
  id: string;
  name: string;
  updatedAt: number;
  nodeCount: number;
  camera?: SavedSceneCamera;
};

const META_PREFIX = "saved-meta:";
const SCENE_PREFIX = "saved:";

export function savedSceneId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "scene"
  );
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("This browser has no IndexedDB storage."));
  return openDraftDatabase().then(
    (database) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const req = run(transaction.objectStore(STORE_NAME));
        transaction.oncomplete = () => {
          database.close();
          resolve(req ? req.result : undefined);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("The scene storage failed."));
        };
      })
  );
}

export async function listSavedScenes(): Promise<SavedSceneMeta[]> {
  const rows = await request<SavedSceneMeta[]>("readonly", (store) => store.getAll(IDBKeyRange.bound(META_PREFIX, `${META_PREFIX}￿`)) as IDBRequest<SavedSceneMeta[]>);
  return (rows ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveNamedScene(meta: SavedSceneMeta, draft: StoredSceneEditorDraft): Promise<void> {
  await request("readwrite", (store) => {
    store.put(draft, `${SCENE_PREFIX}${meta.id}`);
    store.put(meta, `${META_PREFIX}${meta.id}`);
  });
}

export async function loadNamedScene(id: string): Promise<StoredSceneEditorDraft | null> {
  const draft = await request<StoredSceneEditorDraft>("readonly", (store) => store.get(`${SCENE_PREFIX}${id}`) as IDBRequest<StoredSceneEditorDraft>);
  return draft && draft.version === 2 ? draft : null;
}

export async function deleteNamedScene(id: string): Promise<void> {
  await request("readwrite", (store) => {
    store.delete(`${SCENE_PREFIX}${id}`);
    store.delete(`${META_PREFIX}${id}`);
  });
}

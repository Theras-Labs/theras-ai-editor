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

// Scene autosave, one per browser tab (lib/tab-session.ts). Each tab saves its scene under
// "world-editor:tab:<tab id>" with a small "world-editor:tab-meta:<tab id>" record (time,
// for pruning). "world-editor:active" is a pointer to the tab draft saved last, so a new tab
// starts from the latest scene. Before tabs had their own drafts, "world-editor:active" held
// the draft itself; that value still loads.
const TAB_DRAFT_PREFIX = "world-editor:tab:";
const TAB_META_PREFIX = "world-editor:tab-meta:";
/** Tab drafts kept: the newest ones, and none older than this. The pointed-to draft always stays. */
const MAX_TAB_DRAFTS = 12;
const TAB_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type ActivePointer = { pointer: string; updatedAt: number };
type TabDraftMeta = { id: string; updatedAt: number };

function upgradeDraft(result: unknown): StoredSceneEditorDraft | null {
  const draft = result as LegacyStoredSceneEditorDraft | StoredSceneEditorDraft | undefined;
  if (!draft || typeof draft !== "object") return null;
  if (draft.version === 1) {
    return { ...draft, snapshot: createWorldBundleFromLegacyScene(draft.snapshot), version: 2 };
  }
  return draft.version === 2 ? draft : null;
}

function isPointer(value: unknown): value is ActivePointer {
  return Boolean(value && typeof value === "object" && typeof (value as ActivePointer).pointer === "string");
}

/**
 * The draft to restore: this tab's own one (restoreId: the tab id at page load), else the
 * draft saved last by any tab.
 */
export async function loadStoredSceneEditorDraft(restoreId?: string | null): Promise<StoredSceneEditorDraft | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  const database = await openDraftDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    let own: unknown;
    let active: unknown;
    let latest: unknown;
    if (restoreId) {
      store.get(`${TAB_DRAFT_PREFIX}${restoreId}`).onsuccess = (e) => {
        own = (e.target as IDBRequest).result;
      };
    }
    store.get(ACTIVE_DRAFT_KEY).onsuccess = (e) => {
      active = (e.target as IDBRequest).result;
      if (isPointer(active)) {
        store.get(`${TAB_DRAFT_PREFIX}${active.pointer}`).onsuccess = (ev) => {
          latest = (ev.target as IDBRequest).result;
        };
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(upgradeDraft(own) ?? (isPointer(active) ? upgradeDraft(latest) : upgradeDraft(active)));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Failed to load the Theras Editor draft."));
    };
  });
}

/** Saves the scene of one tab, and points "latest" at it. */
export async function saveSceneEditorDraft(draft: StoredSceneEditorDraft, tabId: string): Promise<void> {
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

    store.put(draft, `${TAB_DRAFT_PREFIX}${tabId}`);
    store.put({ id: tabId, updatedAt: draft.updatedAt } satisfies TabDraftMeta, `${TAB_META_PREFIX}${tabId}`);
    store.put({ pointer: tabId, updatedAt: draft.updatedAt } satisfies ActivePointer, ACTIVE_DRAFT_KEY);
  });
}

/**
 * Deletes old tab drafts: keeps the newest MAX_TAB_DRAFTS that are younger than 14 days, this
 * tab's draft and the draft the "latest" pointer names. One transaction; run once at start.
 */
export async function pruneTabDrafts(keepId: string): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const database = await openDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    let removed = 0;
    // Requests of one transaction finish in order: the pointer is read before the list.
    const activeRequest = store.get(ACTIVE_DRAFT_KEY);
    const metasRequest = store.getAll(IDBKeyRange.bound(TAB_META_PREFIX, `${TAB_META_PREFIX}\uffff`));
    metasRequest.onsuccess = () => {
      const active = activeRequest.result;
      const keep = new Set([keepId, ...(isPointer(active) ? [active.pointer] : [])]);
      const now = Date.now();
      const metas = ((metasRequest.result ?? []) as TabDraftMeta[]).sort((a, b) => b.updatedAt - a.updatedAt);
      metas.forEach((meta, index) => {
        if (keep.has(meta.id)) return;
        if (index < MAX_TAB_DRAFTS && now - meta.updatedAt < TAB_DRAFT_MAX_AGE_MS) return;
        store.delete(`${TAB_DRAFT_PREFIX}${meta.id}`);
        store.delete(`${TAB_META_PREFIX}${meta.id}`);
        removed++;
      });
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(removed);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Failed to prune the Theras Editor drafts."));
    };
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

export async function loadNamedSceneMeta(id: string): Promise<SavedSceneMeta | null> {
  const meta = await request<SavedSceneMeta>("readonly", (store) => store.get(`${META_PREFIX}${id}`) as IDBRequest<SavedSceneMeta>);
  return meta ?? null;
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

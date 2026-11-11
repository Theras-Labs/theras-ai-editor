import { useEffect, useRef, useState } from "react";
import {
  loadNamedScene,
  loadNamedSceneMeta,
  loadStoredSceneEditorDraft,
  pruneTabDrafts,
  saveSceneEditorDraft,
  type SavedSceneCamera,
  type StoredSceneEditorDraft
} from "@/lib/draft-storage";
import { tabSession } from "@/lib/tab-session";

/** "?scene=<saved id>" opens that saved scene in this tab (Scenes dialog: open in a new tab). */
const SCENE_PARAM = "scene";

async function sceneFromAddress(): Promise<{ draft: StoredSceneEditorDraft; camera?: SavedSceneCamera } | null> {
  const url = new URL(window.location.href);
  const id = url.searchParams.get(SCENE_PARAM);
  if (!id) return null;
  // Once opened, the scene is this tab's own: a reload restores the tab's autosave, not the save.
  url.searchParams.delete(SCENE_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
  const [draft, meta] = await Promise.all([loadNamedScene(id), loadNamedSceneMeta(id)]);
  return draft ? { draft, camera: meta?.camera } : null;
}

type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: (deadline: IdleDeadline) => void, options?: { timeout: number }) => number;
};

type PendingSaveHandle =
  | { id: number; kind: "idle" }
  | { id: number; kind: "timeout" };

export function useSceneDraftPersistence({
  buildDraft,
  onRestoreDraft,
  saveKey
}: {
  buildDraft: () => StoredSceneEditorDraft;
  onRestoreDraft: (draft: StoredSceneEditorDraft, camera?: SavedSceneCamera) => void;
  saveKey: string;
}) {
  const [draftHydrated, setDraftHydrated] = useState(false);
  const buildDraftRef = useRef(buildDraft);
  const latestDraftRef = useRef<StoredSceneEditorDraft | null>(null);
  const onRestoreDraftRef = useRef(onRestoreDraft);
  const pendingDraftRef = useRef(false);
  const pendingSaveHandleRef = useRef<PendingSaveHandle | null>(null);

  buildDraftRef.current = buildDraft;
  onRestoreDraftRef.current = onRestoreDraft;

  const clearPendingSave = () => {
    const pendingSave = pendingSaveHandleRef.current;

    if (!pendingSave) {
      return;
    }

    if (pendingSave.kind === "idle") {
      (window as IdleWindow).cancelIdleCallback?.(pendingSave.id);
    } else {
      window.clearTimeout(pendingSave.id);
    }

    pendingSaveHandleRef.current = null;
  };

  const persistDraft = () => {
    const draft = buildDraftRef.current();

    latestDraftRef.current = draft;
    pendingDraftRef.current = false;

    void saveSceneEditorDraft(draft, tabSession.id).catch((error) => {
      console.warn("Failed to save the Theras Editor draft.", error);
    });
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const named = await sceneFromAddress();
        const draft = named?.draft ?? (await loadStoredSceneEditorDraft(tabSession.restoreId));
        void pruneTabDrafts(tabSession.id).catch(() => undefined);

        if (!draft || cancelled) {
          return;
        }

        onRestoreDraftRef.current(draft, named?.camera);
      } catch (error) {
        console.warn("Failed to restore the Theras Editor draft.", error);
      } finally {
        if (!cancelled) {
          setDraftHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    pendingDraftRef.current = true;
    clearPendingSave();

    const idleWindow = window as IdleWindow;

    if (typeof idleWindow.requestIdleCallback === "function") {
      pendingSaveHandleRef.current = {
        id: idleWindow.requestIdleCallback(() => {
          pendingSaveHandleRef.current = null;
          persistDraft();
        }, { timeout: 2000 }),
        kind: "idle"
      };
    } else {
      pendingSaveHandleRef.current = {
        id: window.setTimeout(() => {
          pendingSaveHandleRef.current = null;
          persistDraft();
        }, 1200),
        kind: "timeout"
      };
    }

    return () => {
      clearPendingSave();
    };
  }, [draftHydrated, saveKey]);

  useEffect(() => {
    return () => {
      clearPendingSave();

      if (pendingDraftRef.current) {
        persistDraft();
      }
    };
  }, []);

  return {
    draftHydrated
  };
}

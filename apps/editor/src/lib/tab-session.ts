// Each browser tab of the editor is its own session: it has its own scene autosave
// (lib/draft-storage.ts) and its own open chat (lib/copilot/chat-history.ts).
//
// The tab id is kept in sessionStorage, so it stays through a reload of the tab and goes away
// with the tab. "Duplicate tab" copies sessionStorage, so two tabs can start with one id: each
// tab holds a Web Lock named after its id, and a tab that cannot get the lock of its id takes
// a new one. It still starts from the scene of the tab it was copied from (restoreId).
//
// initTabSession runs one time before the app renders (main.tsx). It makes no request to a
// server and starts no timer except a 300 ms cap on the lock request.

const ID_KEY = "theras:tab-id";
const LOCK_PREFIX = "theras-tab:";

function newTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readId(): string | null {
  try {
    return sessionStorage.getItem(ID_KEY);
  } catch {
    return null;
  }
}

function writeId(id: string) {
  try {
    sessionStorage.setItem(ID_KEY, id);
  } catch {
    // no sessionStorage (private mode): the id lasts until a reload
  }
}

const initialId = readId();

export const tabSession = {
  /** This tab's id. Its scene autosave is saved under it. */
  id: initialId ?? newTabId(),
  /** The id this tab had when the page loaded; null in a new tab. Its autosave is restored. */
  restoreId: initialId,
  /** True when no other editor tab of this address was open when this tab loaded. */
  alone: true,
  /** True for a copy of another open tab ("Duplicate tab", or a tab opened with a copy of its storage). */
  duplicated: false
};

if (!initialId) writeId(tabSession.id);

/** Holds the lock of a tab id until the tab closes. False when another tab holds it. */
function holdLock(locks: LockManager, id: string): Promise<boolean> {
  return new Promise((resolve) => {
    locks
      .request(`${LOCK_PREFIX}${id}`, { ifAvailable: true }, (lock) => {
        resolve(Boolean(lock));
        // Keep the lock while the tab lives.
        return lock ? new Promise<void>(() => {}) : undefined;
      })
      .catch(() => resolve(true));
  });
}

async function claim() {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return;
  if (!(await holdLock(locks, tabSession.id))) {
    // A duplicated tab: another tab has this id. Take a new id, and drop the copied pointer to
    // the other tab's open chat (this tab starts its own chat).
    tabSession.duplicated = true;
    tabSession.id = newTabId();
    writeId(tabSession.id);
    try {
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("theras:chats:")) sessionStorage.removeItem(key);
    } catch {
      // no sessionStorage
    }
    await holdLock(locks, tabSession.id);
  }
  const state = await locks.query();
  tabSession.alone = !(state.held ?? []).some((l) => l.name?.startsWith(LOCK_PREFIX) && l.name !== `${LOCK_PREFIX}${tabSession.id}`);
}

/** Sets the tab id and finds other tabs. Resolves in at most 300 ms. */
export function initTabSession(): Promise<void> {
  return Promise.race([claim().catch(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 300))]);
}

/** True when another editor tab of this address was open when this tab loaded. */
export function otherTabsOpen(): boolean {
  return !tabSession.alone || tabSession.duplicated;
}

export type SelectionMode = "object" | "face" | "edge" | "vertex";

export type SelectionState = {
  mode: SelectionMode;
  ids: string[];
  revision: number;
  setMode: (mode: SelectionMode) => void;
  set: (ids: Iterable<string>, mode?: SelectionMode) => void;
  add: (...ids: string[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
};

export function createSelectionState(mode: SelectionMode = "object"): SelectionState {
  const state: SelectionState = {
    mode,
    ids: [],
    revision: 0,
    setMode(nextMode) {
      if (state.mode === nextMode) {
        return;
      }

      state.mode = nextMode;
      state.revision += 1;
    },
    set(ids, nextMode = state.mode) {
      const nextIds = Array.from(new Set(ids));
      const modeChanged = state.mode !== nextMode;
      const idsChanged =
        state.ids.length !== nextIds.length || state.ids.some((id, index) => id !== nextIds[index]);

      if (!modeChanged && !idsChanged) {
        return;
      }

      state.mode = nextMode;
      state.ids = nextIds;
      state.revision += 1;
    },
    add(...ids) {
      const nextIds = Array.from(new Set([...state.ids, ...ids]));

      if (nextIds.length === state.ids.length) {
        return;
      }

      state.ids = nextIds;
      state.revision += 1;
    },
    remove(id) {
      const nextIds = state.ids.filter((selectionId) => selectionId !== id);

      if (nextIds.length === state.ids.length) {
        return;
      }

      state.ids = nextIds;
      state.revision += 1;
    },
    clear() {
      if (state.ids.length === 0) {
        return;
      }

      state.ids = [];
      state.revision += 1;
    },
    has(id) {
      return state.ids.includes(id);
    }
  };

  return state;
}

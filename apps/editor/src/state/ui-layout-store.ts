// Panel layout preferences: unlocked (layout edit mode), panel offsets, scene tree sidebar.
// Per-viewer conveniences, kept in localStorage.
import { proxy, subscribe } from "valtio";

const KEY = "theras:ui-layout";

type Offsets = Record<string, { x: number; y: number }>;

type UiLayoutState = {
  /** Layout edit mode: panels show a handle and can be dragged anywhere. */
  unlocked: boolean;
  offsets: Offsets;
  treeOpen: boolean;
  treeWidth: number;
  treeMode: "docked" | "floating";
  dockOpen: boolean;
  toolbarCollapsed: boolean;
  /** Hide all panels (Figma Cmd+\). Not saved. */
  hideUi: boolean;
  /** The resource library panel. Not saved. */
  libraryOpen: boolean;
  /** The scene templates gallery. Not saved. */
  templatesOpen: boolean;
};

function load(): Omit<UiLayoutState, "unlocked" | "hideUi" | "libraryOpen" | "templatesOpen"> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      offsets: raw.offsets && typeof raw.offsets === "object" ? raw.offsets : {},
      treeOpen: raw.treeOpen !== false,
      treeWidth: typeof raw.treeWidth === "number" ? Math.min(520, Math.max(200, raw.treeWidth)) : 260,
      treeMode: raw.treeMode === "floating" ? "floating" : "docked",
      dockOpen: raw.dockOpen !== false,
      toolbarCollapsed: raw.toolbarCollapsed === true
    };
  } catch {
    return { offsets: {}, treeOpen: true, treeWidth: 260, treeMode: "docked", dockOpen: true, toolbarCollapsed: false };
  }
}

export const uiLayoutStore = proxy<UiLayoutState>({ unlocked: false, hideUi: false, libraryOpen: false, templatesOpen: false, ...load() });

subscribe(uiLayoutStore, () => {
  try {
    const { offsets, treeOpen, treeWidth, treeMode, dockOpen, toolbarCollapsed } = uiLayoutStore;
    localStorage.setItem(KEY, JSON.stringify({ offsets, treeOpen, treeWidth, treeMode, dockOpen, toolbarCollapsed }));
  } catch {
    // storage blocked: the layout still works for this session
  }
});

export function resetPanelLayout() {
  uiLayoutStore.offsets = {};
}

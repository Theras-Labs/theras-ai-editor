// The scene tree: docked on the left (resizable) or floating as a window.
import { PanelLeft, PictureInPicture2, X } from "lucide-react";
import { useSnapshot } from "valtio";
import { uiLayoutStore } from "@/state/ui-layout-store";
import { FloatingWindow } from "./FloatingWindow";
import { SceneOutliner, type SceneOutlinerProps } from "./SceneOutliner";

type Props = Omit<SceneOutlinerProps, "headerActions" | "onHeaderPointerDown">;

export function SceneTreeSidebar(props: Props) {
  const layout = useSnapshot(uiLayoutStore);
  if (!layout.treeOpen || layout.hideUi) return null;
  const floating = layout.treeMode === "floating";

  const headerButton = "flex size-6 items-center justify-center rounded-md text-foreground/45 hover:bg-white/8 hover:text-foreground";
  const actions = (
    <>
      <button
        className={headerButton}
        onClick={() => {
          uiLayoutStore.treeMode = floating ? "docked" : "floating";
        }}
        title={floating ? "Dock on the left" : "Float as a window"}
        type="button"
      >
        {floating ? <PanelLeft className="size-3.5" /> : <PictureInPicture2 className="size-3.5" />}
      </button>
      <button
        className={headerButton}
        onClick={() => {
          uiLayoutStore.treeOpen = false;
        }}
        title="Hide the scene tree (the tree button in the top bar shows it again)"
        type="button"
      >
        <X className="size-3.5" />
      </button>
    </>
  );

  if (floating) {
    return (
      <FloatingWindow defaultRect={{ x: 16, y: 64, w: 300, h: 520 }} storageKey="theras:tree-window">
        {(onHeaderPointerDown) => (
          <div className="h-full overflow-hidden rounded-2xl border border-white/15 bg-[#08110e]/55 shadow-[0_18px_50px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-2xl backdrop-saturate-150">
            <SceneOutliner {...props} headerActions={actions} onHeaderPointerDown={onHeaderPointerDown} />
          </div>
        )}
      </FloatingWindow>
    );
  }

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = uiLayoutStore.treeWidth;
    const onMove = (ev: PointerEvent) => {
      uiLayoutStore.treeWidth = Math.min(520, Math.max(200, startW + ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside className="relative z-30 flex shrink-0 flex-col border-r border-white/8 bg-[#08110e]/80 backdrop-blur-xl" style={{ width: layout.treeWidth }}>
      <SceneOutliner {...props} headerActions={actions} />
      <div className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize hover:bg-emerald-400/30" onPointerDown={startResize} title="Drag to resize" />
    </aside>
  );
}

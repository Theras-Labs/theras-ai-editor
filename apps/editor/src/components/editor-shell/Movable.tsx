// Wraps an absolutely positioned overlay panel so it can be moved when the UI is unlocked.
// The wrapper covers the same area as the panel's container and shifts it with a transform,
// so the panel keeps its own position classes. While unlocked, a drag handle sits on the
// panel's top edge; while locked, nothing changes for the panel.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useSnapshot } from "valtio";
import { uiLayoutStore } from "@/state/ui-layout-store";
import { gameHidesEditor, gameStore } from "@/lib/game/game-store";

type Box = { left: number; top: number; width: number };

export function Movable({
  id,
  label,
  leftInset = 0,
  children
}: {
  id: string;
  label: string;
  /** Pixels to leave free on the left (the scene tree sidebar). */
  leftInset?: number;
  children: ReactNode;
}) {
  const layout = useSnapshot(uiLayoutStore);
  const game = useSnapshot(gameStore);
  const offset = layout.offsets[id] ?? { x: 0, y: 0 };
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  // Measure the visible panel (the largest child box) so the handle can sit on top of it.
  useLayoutEffect(() => {
    if (!layout.unlocked) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const base = wrapper.getBoundingClientRect();
      let best: DOMRect | null = null;
      wrapper.querySelectorAll<HTMLElement>(":scope > *, :scope > * > *, :scope > * > * > *").forEach((el) => {
        if (el.dataset.movableHandle) return;
        // Panels take pointer input; their full-size layout containers do not.
        if (getComputedStyle(el).pointerEvents === "none") return;
        const r = el.getBoundingClientRect();
        if (r.width * r.height > 0 && (!best || r.width * r.height > best.width * best.height)) best = r;
      });
      const r = best as DOMRect | null;
      if (r) setBox({ left: r.left - base.left, top: r.top - base.top, width: r.width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [layout.unlocked, offset.x, offset.y]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { px: e.clientX, py: e.clientY, x: offset.x, y: offset.y };
    const onMove = (ev: PointerEvent) => {
      uiLayoutStore.offsets[id] = { x: start.x + ev.clientX - start.px, y: start.y + ev.clientY - start.py };
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Game mode hides the editor panels while the user plays (wrap phase and tools view show them).
  if (layout.hideUi || gameHidesEditor(game)) return null;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0"
      ref={wrapperRef}
      style={{ left: leftInset, transform: offset.x || offset.y ? `translate(${offset.x}px, ${offset.y}px)` : undefined }}
    >
      {children}
      {layout.unlocked && box ? (
        <div
          className="pointer-events-auto absolute z-[60] flex h-[22px] cursor-grab items-center gap-1.5 rounded-t-[14px] border border-b-0 border-white/14 bg-[#0d1714]/72 px-2.5 text-[10.5px] font-semibold tracking-wide text-emerald-200/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl active:cursor-grabbing"
          data-movable-handle="1"
          onPointerDown={startDrag}
          style={{ left: box.left + 10, top: Math.max(0, box.top - 21), width: Math.max(120, box.width - 20) }}
          title={`Drag to move ${label}`}
        >
          <GripVertical className="size-3.5 shrink-0 text-emerald-300/80" />
          <span className="truncate">{label}</span>
          <span className="ml-auto shrink-0 text-[9.5px] font-medium text-foreground/35">drag</span>
        </div>
      ) : null}
    </div>
  );
}

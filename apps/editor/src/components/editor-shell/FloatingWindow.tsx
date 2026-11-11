// A floating window: drag by the header (the child gets onHeaderPointerDown), resize from
// the bottom-right corner. Position and size are remembered per viewer.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

type Rect = { x: number; y: number; w: number; h: number };

const MIN_W = 280;
const MIN_H = 240;

function clampRect(r: Rect): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(MIN_W, Math.min(r.w, vw - 16));
  const h = Math.max(MIN_H, Math.min(r.h, vh - 16));
  return { w, h, x: Math.max(8, Math.min(r.x, vw - w - 8)), y: Math.max(8, Math.min(r.y, vh - h - 8)) };
}

function loadRect(key: string, fallback?: Rect): Rect {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const r = JSON.parse(raw) as Rect;
      if ([r.x, r.y, r.w, r.h].every((v) => typeof v === "number" && Number.isFinite(v))) return clampRect(r);
    }
  } catch {
    // use the default
  }
  return clampRect(fallback ?? { x: window.innerWidth - 400, y: 72, w: 370, h: Math.min(560, window.innerHeight - 160) });
}

export function FloatingWindow({
  storageKey,
  defaultRect,
  children
}: {
  storageKey: string;
  defaultRect?: Rect;
  children: (onHeaderPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void) => ReactNode;
}) {
  const [rect, setRect] = useState<Rect>(() => loadRect(storageKey, defaultRect));
  const rectRef = useRef(rect);
  rectRef.current = rect;

  useEffect(() => {
    const onResize = () => setRect((r) => clampRect(r));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const save = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(rectRef.current));
    } catch {
      // per-viewer convenience only
    }
  }, [storageKey]);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, mode: "move" | "resize") => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (mode === "move" && target.closest("button, input, textarea, select, a")) return;
      e.preventDefault();
      const start = { px: e.clientX, py: e.clientY, ...rectRef.current };
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - start.px;
        const dy = ev.clientY - start.py;
        setRect(
          clampRect(
            mode === "move"
              ? { ...start, x: start.x + dx, y: start.y + dy }
              : { ...start, w: start.w + dx, h: start.h + dy }
          )
        );
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        save();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [save]
  );

  return (
    <div className="fixed z-40" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      {children((e) => startDrag(e, "move"))}
      <div
        className="absolute bottom-0 right-0 size-4 cursor-nwse-resize"
        onPointerDown={(e) => startDrag(e, "resize")}
        style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.25) 50%)", borderBottomRightRadius: 16 }}
        title="Resize"
      />
    </div>
  );
}

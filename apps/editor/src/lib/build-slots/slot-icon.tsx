// The picture on a dock slot: an AI or user symbol (cleaned SVG), else a 3D render of the
// slot's object, else the built-in fallback icon while the render is not ready.
import { useEffect, useState, type ReactNode } from "react";
import { renderSlotPreview, slotPreviewKey, subscribeSlotPreview } from "./thumbnail";
import type { BuildSlot } from "./types";

const ALLOWED_TAGS = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"]);
const ALLOWED_ATTRS = new Set([
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform", "opacity"
]);

/** Keeps only plain shape elements and drawing attributes (no scripts, links or event handlers). */
export function sanitizeIconSvg(markup: string): string {
  try {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml");
    const out: string[] = [];
    const walk = (el: Element) => {
      for (const child of Array.from(el.children)) {
        const tag = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) continue;
        const attrs = Array.from(child.attributes)
          .filter((a) => ALLOWED_ATTRS.has(a.name.toLowerCase()) && !/url\(|javascript:/i.test(a.value))
          .map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
          .join(" ");
        if (tag === "g") {
          out.push(`<g ${attrs}>`);
          walk(child);
          out.push("</g>");
        } else out.push(`<${tag} ${attrs}/>`);
      }
    };
    walk(doc.documentElement);
    return out.join("").slice(0, 4000);
  } catch {
    return "";
  }
}

// Renders run one at a time when the browser is idle, so the dock never stalls.
const queue: Array<() => void> = [];
let running = false;
function schedule(job: () => void) {
  queue.push(job);
  if (running) return;
  running = true;
  const next = () => {
    const task = queue.shift();
    if (!task) {
      running = false;
      return;
    }
    task();
    (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 16)))(next);
  };
  (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 16)))(next);
}

export function SlotIcon({ slot, fallback, className }: { slot: BuildSlot; fallback: ReactNode; className?: string }) {
  const key = slotPreviewKey(slot);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (slot.iconSvg || !key) return;
    let cancelled = false;
    // An object that builds later (a model that loads, a port prop) sends its picture here.
    const unsubscribe = subscribeSlotPreview(key, (late) => {
      if (!cancelled) setUrl(late);
    });
    schedule(() => {
      if (cancelled) return;
      const result = renderSlotPreview(slot);
      if (!cancelled) setUrl(result);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // key covers the recipe or library id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slot.iconSvg]);

  if (slot.iconSvg) {
    return (
      <svg
        className={className}
        dangerouslySetInnerHTML={{ __html: sanitizeIconSvg(slot.iconSvg) }}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        viewBox="0 0 24 24"
      />
    );
  }
  if (url) return <img alt="" className={className} draggable={false} src={url} style={{ objectFit: "contain" }} />;
  return <>{fallback}</>;
}

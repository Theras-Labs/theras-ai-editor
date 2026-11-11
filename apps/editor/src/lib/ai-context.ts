// Drag anything (a dock slot, a scene tree row, a library card, a tool button) into the
// Ask Theras prompt: it becomes a context chip that is sent with your question.
import type { DragEvent } from "react";

export const AI_CONTEXT_MIME = "application/x-theras-context";

export type AiContextItem = {
  /** What it is: "slot", "object", "folder", "library", "ui". */
  kind: string;
  label: string;
  /** Extra facts for the AI: an id, a tooltip, a resource id. */
  detail?: string;
};

export function writeAiContext(dataTransfer: DataTransfer, item: AiContextItem) {
  dataTransfer.setData(AI_CONTEXT_MIME, JSON.stringify(item));
  if (!dataTransfer.getData("text/plain")) dataTransfer.setData("text/plain", item.label);
}

export function readAiContext(dataTransfer: DataTransfer): AiContextItem | null {
  try {
    const raw = dataTransfer.getData(AI_CONTEXT_MIME);
    return raw ? (JSON.parse(raw) as AiContextItem) : null;
  } catch {
    return null;
  }
}

/** Props that make an element draggable into the prompt. */
export function aiContextDrag(item: AiContextItem) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => writeAiContext(e.dataTransfer, item)
  };
}

export function contextToText(items: AiContextItem[]) {
  return items.map((c) => `[${c.kind}: ${c.label}${c.detail ? ` (${c.detail})` : ""}]`).join(" ");
}

/**
 * Lets every titled button in the editor chrome be dragged into the prompt (for questions
 * like "what does this do?"). Buttons stay clickable; a drag only starts when the mouse moves.
 */
export function installUiDragContext(root: HTMLElement = document.body) {
  const mark = () => {
    root.querySelectorAll<HTMLElement>("button[title]:not([draggable]), button[aria-label]:not([draggable])").forEach((el) => {
      if (el.closest("canvas, [data-no-ai-drag]")) return;
      el.draggable = true;
      el.dataset.aiUiDrag = "1";
    });
  };
  const onDragStart = (e: globalThis.DragEvent) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-ai-ui-drag]");
    if (!el || !e.dataTransfer || e.dataTransfer.types.includes(AI_CONTEXT_MIME)) return;
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent?.trim() || "control";
    writeAiContext(e.dataTransfer, { kind: "ui", label: label.slice(0, 60), detail: (el.getAttribute("title") ?? "").slice(0, 160) || undefined });
  };
  mark();
  const observer = new MutationObserver(mark);
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("dragstart", onDragStart);
  return () => {
    observer.disconnect();
    root.removeEventListener("dragstart", onDragStart);
  };
}

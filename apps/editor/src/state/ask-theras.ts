// Ask Theras: where the chat is shown and how it is opened. One place for the header prompt,
// Cmd+L, Cmd+K, game mode and the layout buttons, so each of them opens the same thing.
//
// Rule: the voice orb ("bubble") is never the default and is never what "open Ask Theras"
// shows. It has no text prompt, and a browser can block the microphone. The header prompt and
// Cmd+L open the last text layout. The orb is a mode the user turns on with the layout buttons;
// it is not saved, so a reload starts with the text layout again.
import { proxy } from "valtio";
import { uiStore } from "@/state/ui-store";

export type CopilotLayout = "docked" | "floating" | "bar" | "bubble";
/** Layouts with a text prompt. */
export type TextLayout = Exclude<CopilotLayout, "bubble">;

const KEY = "theras:copilot-layout";
/** Below this window width a docked chat takes too much of the viewport, so the prompt bar is the default. */
const NARROW_WINDOW = 1000;

/** The text layout for a viewer who has not chosen one: the docked chat, or the prompt bar in a narrow window. */
export function defaultTextLayout(): TextLayout {
  return typeof window !== "undefined" && window.innerWidth < NARROW_WINDOW ? "bar" : "docked";
}

const isTextLayout = (value: unknown): value is TextLayout => value === "docked" || value === "floating" || value === "bar";

function savedTextLayout(): TextLayout {
  try {
    const saved = localStorage.getItem(KEY);
    return isTextLayout(saved) ? saved : defaultTextLayout();
  } catch {
    return defaultTextLayout();
  }
}

const startLayout = savedTextLayout();

export const askTherasStore = proxy<{ layout: CopilotLayout; textLayout: TextLayout }>({
  layout: startLayout,
  textLayout: startLayout
});

/** Sets the layout. Only a text layout is saved for the next visit. */
export function setAskLayout(next: CopilotLayout) {
  askTherasStore.layout = next;
  if (next === "bubble") return;
  askTherasStore.textLayout = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // per-viewer convenience only
  }
}

/** Puts the cursor in the text prompt as soon as it is on screen (it can mount a few frames later). */
export function focusAskPrompt() {
  let tries = 0;
  const tick = () => {
    const prompt = document.querySelector<HTMLTextAreaElement>("textarea[data-theras-prompt]");
    if (prompt) return prompt.focus();
    if (++tries < 20) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Opens the text prompt and puts the cursor in it. From the voice orb, this goes to the text layout. */
export function openAskPrompt() {
  if (askTherasStore.layout === "bubble") askTherasStore.layout = askTherasStore.textLayout;
  uiStore.copilotPanelOpen = true;
  focusAskPrompt();
}

export function closeAskTheras() {
  uiStore.copilotPanelOpen = false;
}

/** Cmd+L and the View menu: hides the text prompt when it is open, else opens it. */
export function toggleAskTheras() {
  if (uiStore.copilotPanelOpen && askTherasStore.layout !== "bubble") closeAskTheras();
  else openAskPrompt();
}

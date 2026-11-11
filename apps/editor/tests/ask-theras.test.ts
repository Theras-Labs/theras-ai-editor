// Ask Theras open rules (state/ask-theras.ts): the voice orb is never the default and is never
// what "open Ask Theras" shows.
import { beforeEach, describe, expect, test } from "bun:test";

// A minimal browser for the state module: storage, a window width and one animation frame.
const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
g.requestAnimationFrame = () => 0;
g.document = { querySelector: () => null };
// The layout that an earlier build saved for a viewer who used the voice orb.
store.set("theras:copilot-layout", "bubble");

const { askTherasStore, closeAskTheras, defaultTextLayout, openAskPrompt, setAskLayout, toggleAskTheras } = await import("../src/state/ask-theras");
const { uiStore } = await import("../src/state/ui-store");

describe("Ask Theras open rules", () => {
  beforeEach(() => {
    uiStore.copilotPanelOpen = false;
    setAskLayout("docked");
  });

  test("a saved voice orb is not the start layout", () => {
    // The module read "bubble" from storage when it loaded and took the default text layout.
    expect(defaultTextLayout()).toBe("docked");
    expect(["docked", "floating", "bar"]).toContain(askTherasStore.textLayout);
  });

  test("the voice orb is a mode for this visit only: it is not saved", () => {
    setAskLayout("floating");
    expect(store.get("theras:copilot-layout")).toBe("floating");
    setAskLayout("bubble");
    expect(askTherasStore.layout).toBe("bubble");
    expect(askTherasStore.textLayout).toBe("floating");
    expect(store.get("theras:copilot-layout")).toBe("floating");
  });

  test("Cmd+L from the voice orb opens the text prompt in the last text layout", () => {
    setAskLayout("bar");
    setAskLayout("bubble");
    uiStore.copilotPanelOpen = true;
    toggleAskTheras();
    expect(uiStore.copilotPanelOpen).toBe(true);
    expect(askTherasStore.layout).toBe("bar");
  });

  test("Cmd+L shows the text prompt, then hides it", () => {
    toggleAskTheras();
    expect(uiStore.copilotPanelOpen).toBe(true);
    expect(askTherasStore.layout).toBe("docked");
    toggleAskTheras();
    expect(uiStore.copilotPanelOpen).toBe(false);
  });

  test("the header prompt opens the text prompt and never closes it", () => {
    openAskPrompt();
    openAskPrompt();
    expect(uiStore.copilotPanelOpen).toBe(true);
    // Closed while the orb was the layout: the header still opens text.
    setAskLayout("bubble");
    closeAskTheras();
    openAskPrompt();
    expect(uiStore.copilotPanelOpen).toBe(true);
    expect(askTherasStore.layout).toBe("docked");
  });

  test("a narrow window starts with the prompt bar", () => {
    g.window = { innerWidth: 700 };
    expect(defaultTextLayout()).toBe("bar");
    g.window = { innerWidth: 1440 };
    expect(defaultTextLayout()).toBe("docked");
    delete g.window;
  });
});

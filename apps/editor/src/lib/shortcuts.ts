// Keyboard shortcuts: one list, user-changeable, saved per viewer. "Mod" is Cmd on macOS
// and Ctrl elsewhere. The editor registers what each action does; the settings dialog
// lists every action and lets the user record a new key.
import { proxy, subscribe } from "valtio";

export type ShortcutAction = {
  id: string;
  label: string;
  group: string;
  defaultKeys: string;
  /** Fixed keys handled elsewhere (shown in the list, not rebindable). */
  fixed?: boolean;
};

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: "toggle-tree", label: "Show or hide the scene tree", group: "Panels", defaultKeys: "Mod+/" },
  { id: "toggle-dock", label: "Show or hide the build dock", group: "Panels", defaultKeys: "Mod+B" },
  { id: "toggle-toolbar", label: "Collapse or expand the tool bar", group: "Panels", defaultKeys: "Mod+Shift+T" },
  { id: "toggle-library", label: "Open or close the resource library", group: "Panels", defaultKeys: "Mod+Shift+B" },
  { id: "toggle-ui", label: "Hide or show all panels", group: "Panels", defaultKeys: "Mod+\\" },
  { id: "toggle-animate", label: "Play or pause scene animation (waves, wind)", group: "Panels", defaultKeys: "Mod+Shift+P" },
  { id: "toggle-game", label: "Play: game mode on or off (walk with physics)", group: "Game", defaultKeys: "Mod+P" },
  { id: "game-skip", label: "Game: skip the physics wrap", group: "Game", defaultKeys: "Enter or Space", fixed: true },
  { id: "game-move", label: "Game: walk, run, jump", group: "Game", defaultKeys: "WASD / arrows, Shift, Space", fixed: true },
  { id: "game-push", label: "Game: push a loose object (pointer captured)", group: "Game", defaultKeys: "Click", fixed: true },
  { id: "game-view", label: "Game: first person (default) or third person", group: "Game", defaultKeys: "V", fixed: true },
  { id: "game-tools", label: "Game: show the editor tools, resume play", group: "Game", defaultKeys: "Tab", fixed: true },
  { id: "game-chat", label: "Game: ask Theras (frees the mouse)", group: "Game", defaultKeys: "Enter or T", fixed: true },
  { id: "game-physics", label: "Game: pause physics, show colliders, reset loose objects", group: "Game", defaultKeys: "P, C, X", fixed: true },
  { id: "game-respawn", label: "Game: back to the start point", group: "Game", defaultKeys: "R", fixed: true },
  { id: "game-exit", label: "Game: free the mouse, then exit", group: "Game", defaultKeys: "Escape", fixed: true },
  { id: "unlock-ui", label: "Unlock or lock panel positions", group: "Panels", defaultKeys: "Mod+Shift+U" },
  { id: "ask-bar", label: "Ask Theras (prompt bar)", group: "Ask Theras", defaultKeys: "Mod+K" },
  { id: "new-chat", label: "New chat", group: "Ask Theras", defaultKeys: "Mod+Shift+K" },
  { id: "shortcuts", label: "Keyboard shortcuts", group: "Help", defaultKeys: "Mod+Shift+/" },
  { id: "undo", label: "Undo (also AI changes)", group: "Edit", defaultKeys: "Mod+Z", fixed: true },
  { id: "redo", label: "Redo", group: "Edit", defaultKeys: "Mod+Shift+Z", fixed: true },
  { id: "slot", label: "Pick dock slot 1 to 9", group: "Build", defaultKeys: "Alt+1 ... 9", fixed: true },
  { id: "tools", label: "Editor tools: select, transform, clip, extrude, mesh edit, brush", group: "Edit", defaultKeys: "1 ... 6", fixed: true },
  { id: "ai-panel", label: "Show or hide Ask Theras", group: "Ask Theras", defaultKeys: "Mod+L", fixed: true },
  { id: "logic", label: "Logic viewer", group: "Panels", defaultKeys: "Mod+Shift+L", fixed: true },
  { id: "group", label: "Group selection", group: "Edit", defaultKeys: "Mod+G", fixed: true },
  { id: "stop", label: "Stop placing", group: "Build", defaultKeys: "Escape", fixed: true },
  { id: "turn", label: "Turn the next placement 90 degrees", group: "Build", defaultKeys: "R", fixed: true }
];

const KEY = "theras:shortcuts";

function loadOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export const shortcutStore = proxy<{ overrides: Record<string, string>; dialogOpen: boolean }>({ overrides: loadOverrides(), dialogOpen: false });

subscribe(shortcutStore, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(shortcutStore.overrides));
  } catch {
    // per-viewer convenience only
  }
});

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function keysFor(id: string) {
  return shortcutStore.overrides[id] ?? SHORTCUT_ACTIONS.find((a) => a.id === id)?.defaultKeys ?? "";
}

/** "Mod+Shift+K" -> "Cmd Shift K" (macOS) or "Ctrl Shift K". */
export function displayKeys(keys: string) {
  return keys.replace(/Mod/g, isMac ? "Cmd" : "Ctrl").replace(/\+/g, " ");
}

/** The combination of a key event, in the same form as keysFor. */
export function eventToKeys(e: KeyboardEvent): string | null {
  if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return null;
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.key;
  if (e.code === "Slash") key = "/";
  if (e.code === "Backslash") key = "\\";
  if (e.code === "Period") key = ".";
  if (e.code === "Comma") key = ",";
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

/** Shortcut actions that still work in game mode. */
const GAME_MODE_ACTIONS = new Set(["toggle-game", "ask-bar", "new-chat", "toggle-animate"]);

/** Set by the game store module (kept as a callback so this file has no game import). */
let gameModeActive: () => boolean = () => false;
export function setGameModeProbe(probe: () => boolean) {
  gameModeActive = probe;
}

/** Installs the global handler. handlers maps an action id to what it does. */
export function installShortcuts(handlers: Record<string, () => void>) {
  const onKey = (e: KeyboardEvent) => {
    if (shortcutStore.dialogOpen) return;
    const keys = eventToKeys(e);
    // Game mode: the keys drive the player; only the chat and game toggles stay.
    const game = gameModeActive();
    if (!keys) return;
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    for (const action of SHORTCUT_ACTIONS) {
      if (action.fixed || !handlers[action.id]) continue;
      if (game && !GAME_MODE_ACTIONS.has(action.id)) continue;
      if (keysFor(action.id).toUpperCase() !== keys.toUpperCase()) continue;
      // While typing, only combinations with Mod run (plain keys type text).
      if (typing && !keys.includes("Mod")) continue;
      e.preventDefault();
      e.stopPropagation();
      handlers[action.id]!();
      return;
    }
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}

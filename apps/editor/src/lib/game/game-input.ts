// Game mode input: keys for walking, mouse look, chat. Keys go to the game only while the
// player has the controls (gameControlsActive: playing, editor tools not shown) and no text
// field has focus, so typing in Ask Theras never moves the player. Plain keys are taken in the
// capture phase, so editor shortcuts (tools, dock slots, delete) do not run while playing.
// Combinations with Cmd or Ctrl still reach the editor (Ask bar, new chat, game mode toggle).
//
// Other states:
// - wrap phase: Enter or Space finishes the wrap at once, Escape exits, other keys go to the editor.
// - tools view: Tab resumes play; every other key goes to the editor.
import { subscribe } from "valtio";
import { setGameModeProbe } from "@/lib/shortcuts";
import { openAskPrompt } from "@/state/ask-theras";
import { exitGameMode, gameControlsActive, gameStore, toggleGameTools, type GamePhase } from "./game-store";

export const gameInput = {
  forward: false,
  backward: false,
  leftward: false,
  rightward: false,
  run: false,
  jump: false,
  /** Mouse movement since the last frame (pixels). */
  lookX: 0,
  lookY: 0,
  /** Wheel steps since the last frame (third person distance). */
  zoom: 0
};

export type MoveField = "forward" | "backward" | "leftward" | "rightward" | "run" | "jump";

const MOVE_KEYS: Record<string, MoveField> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "leftward",
  ArrowLeft: "leftward",
  KeyD: "rightward",
  ArrowRight: "rightward",
  ShiftLeft: "run",
  ShiftRight: "run",
  Space: "jump"
};

// Editor shortcuts from the shared list (Mod+/ and so on) run again in the wrap phase and in
// the tools view. This replaces the probe set by game-store.ts (which tests only "active").
setGameModeProbe(() => gameControlsActive());

export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function clearGameInput() {
  gameInput.forward = gameInput.backward = gameInput.leftward = gameInput.rightward = false;
  gameInput.run = gameInput.jump = false;
}

/** Opens Ask Theras and puts the cursor in its prompt (frees the mouse first). */
export function focusGameChat() {
  clearGameInput();
  if (document.pointerLockElement) document.exitPointerLock();
  // The text prompt, also when the voice orb is the layout (the orb has no text field).
  openAskPrompt();
}

/** What one key press does in game mode. "pass" = the game leaves the key alone (editor, typing). */
export type GameKeyAction =
  | { kind: "pass" }
  | { kind: "swallow" }
  | { kind: "blur" }
  | { kind: "move"; field: MoveField }
  | { kind: "view" | "respawn" | "pause" | "colliders" | "reset" | "chat" | "exit" | "tools" | "skip" };

export type GameKeyState = { active: boolean; phase: GamePhase; tools: boolean };
export type GameKeyEvent = { code: string; repeat: boolean; mod: boolean; typing: boolean };

/** The key routing rules of game mode (pure: state + key -> action). */
export function routeGameKey(state: GameKeyState, key: GameKeyEvent): GameKeyAction {
  if (!state.active || state.phase === "off") return { kind: "pass" };
  const controls = gameControlsActive(state);
  if (key.typing) {
    // Escape in the chat gives the keys back to the player.
    return controls && key.code === "Escape" ? { kind: "blur" } : { kind: "pass" };
  }
  if (key.mod) return { kind: "pass" };

  if (state.phase === "wrapping") {
    if ((key.code === "Enter" || key.code === "NumpadEnter" || key.code === "Space") && !key.repeat) return { kind: "skip" };
    if (key.code === "Escape") return { kind: "exit" };
    return { kind: "pass" };
  }

  // Playing: Tab switches between the player and the editor tools, in both directions.
  if (key.code === "Tab") return key.repeat ? { kind: "swallow" } : { kind: "tools" };
  if (!controls) return { kind: "pass" };

  const move = MOVE_KEYS[key.code];
  if (move) return { kind: "move", field: move };
  if (key.repeat) {
    // Held keys repeat: keep them from the editor, but act once.
    return ["KeyV", "KeyR", "KeyP", "KeyC", "KeyX", "Enter", "KeyT", "Escape"].includes(key.code) ? { kind: "swallow" } : { kind: "pass" };
  }
  switch (key.code) {
    case "KeyV":
      return { kind: "view" };
    case "KeyR":
      return { kind: "respawn" };
    case "KeyP":
      return { kind: "pause" };
    case "KeyC":
      return { kind: "colliders" };
    case "KeyX":
      return { kind: "reset" };
    case "Enter":
    case "NumpadEnter":
    case "KeyT":
      return { kind: "chat" };
    case "Escape":
      return { kind: "exit" };
    default:
      return { kind: "pass" };
  }
}

function runAction(action: GameKeyAction, target: EventTarget | null) {
  switch (action.kind) {
    case "move":
      gameInput[action.field] = true;
      break;
    case "view":
      gameStore.view = gameStore.view === "third" ? "first" : "third";
      break;
    case "respawn":
      gameStore.respawnTick += 1;
      break;
    case "pause":
      gameStore.paused = !gameStore.paused;
      break;
    case "colliders":
      gameStore.showColliders = !gameStore.showColliders;
      break;
    case "reset":
      gameStore.resetTick += 1;
      break;
    case "chat":
      focusGameChat();
      break;
    case "exit":
      exitGameMode();
      break;
    case "tools":
      clearGameInput();
      toggleGameTools();
      break;
    case "skip":
      gameStore.skipWrapTick += 1;
      break;
    case "blur":
      (target as HTMLElement | null)?.blur?.();
      break;
    default:
      break;
  }
}

let installs = 0;
let uninstall: (() => void) | null = null;

function install() {
  const onKeyDown = (e: KeyboardEvent) => {
    const action = routeGameKey(gameStore, {
      code: e.code,
      repeat: e.repeat,
      mod: e.metaKey || e.ctrlKey || e.altKey,
      typing: isTypingTarget(e.target)
    });
    if (action.kind === "pass") return;
    runAction(action, e.target);
    e.preventDefault();
    e.stopPropagation();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const move = MOVE_KEYS[e.code];
    if (move) gameInput[move] = false;
  };
  // Focus in a text field (the chat) stops walking at once.
  const onFocusIn = (e: FocusEvent) => {
    if (isTypingTarget(e.target)) clearGameInput();
  };
  // The controls stop (tools view, exit, wrap): no key stays held.
  let controls = gameControlsActive();
  const unsubscribe = subscribe(gameStore, () => {
    const now = gameControlsActive();
    if (controls && !now) clearGameInput();
    controls = now;
  });
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", clearGameInput);
  window.addEventListener("focusin", onFocusIn);
  return () => {
    unsubscribe();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", clearGameInput);
    window.removeEventListener("focusin", onFocusIn);
    clearGameInput();
  };
}

/**
 * Installs the key handlers for game mode. Returns the cleanup. Several callers can install
 * (the HUD for the wrap phase, the player while playing): the handlers are added once.
 */
export function installGameKeys() {
  installs += 1;
  if (installs === 1) uninstall = install();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    installs -= 1;
    if (installs === 0) {
      uninstall?.();
      uninstall = null;
    }
  };
}

// Game mode: walk through the scene as a person (first person by default, third person as an
// option) with physics. Loose objects fall and get pushed in the physics world only, and go
// back to their places when game mode ends or on Reset. The only thing game mode writes to the
// scene document is the "Player start" marker, and only when the user sets it.
//
// Contract (who reads what):
// - phase: "wrapping" = the scene gets its colliders, a few objects at a time, and the user sees
//   it (sweep effect, progress, marks in the scene tree). Then "playing" = the player is in.
// - tools: the editor tools are shown inside game mode. The player stands still, the pointer is
//   free, keys and mouse go to the editor. The physics world keeps running.
// - bodies: the live colliders by node id. The scene tree shows them as marks.
// - gameControlsActive(): the one test for "keys and mouse drive the player".
import { proxy, subscribe } from "valtio";
import { setGameModeProbe } from "@/lib/shortcuts";
import { uiStore } from "@/state/ui-store";

export type GameView = "third" | "first";

/** off: no game. wrapping: colliders are being built, visibly. playing: the player is in the scene. */
export type GamePhase = "off" | "wrapping" | "playing";

/** The collider shape of one wrapped object. */
export type BodyShape = "trimesh" | "box" | "capsule" | "hull";

/** One live collider, for the scene tree marks and the wrap effect. "trunk" = a tree (capsule at the trunk). */
export type BodyInfo = { mode: BodyMode | "trunk"; shape: BodyShape };

/**
 * How one object takes part in physics.
 * solid: a fixed collider (walls, floors, rocks). loose: a dynamic body (falls, can be pushed).
 * ghost: no collider (the player walks through it).
 */
export type BodyMode = "solid" | "loose" | "ghost";

/** Which objects get colliders when they have no override. */
export type ColliderScope = "scene" | "targets";

/** Which objects are loose when they have no override. */
export type LooseDefault = "none" | "small";

type GameState = {
  active: boolean;
  phase: GamePhase;
  /** Editor tools are shown in game mode (the player stands still, the editor has the keys). */
  tools: boolean;
  /** Wrap progress, written by the physics world. current = the node id that was wrapped last. */
  wrap: { done: number; total: number; current: string | null };
  /** Bumped to finish the wrap at once (the Skip button, Enter). */
  skipWrapTick: number;
  /** Live colliders by editor node id. Empty while game mode is off. Written by the physics world. */
  bodies: Record<string, BodyInfo>;
  view: GameView;
  /** The physics panel is expanded. */
  panelOpen: boolean;
  paused: boolean;
  /** Downward gravity in m/s2. */
  gravity: number;
  showColliders: boolean;
  scope: ColliderScope;
  looseDefault: LooseDefault;
  /** Per-object overrides (targets): set from the selection on Play, from the panel, or by the AI. */
  overrides: Record<string, BodyMode>;
  /** The pointer is captured for mouse look. */
  pointerLocked: boolean;
  /** Counters for the panel (written by the physics world). */
  stats: { solid: number; loose: number; building: boolean };
  /** Bumped to put loose objects back. */
  resetTick: number;
  /** Bumped to put the player back at the spawn point. */
  respawnTick: number;
  /** The last push (left click while the pointer is captured): tick counts clicks, hit = a loose object was pushed. Written by the player. */
  fire: { tick: number; hit: boolean };
};

const KEY = "theras:game";
/**
 * Version of the saved settings. Version 2: first person is the main view. A setting saved
 * before that has "third" only because it was the old default, so its view is not taken.
 */
const SETTINGS_VERSION = 2;

function load(): Pick<GameState, "view" | "gravity" | "showColliders" | "scope" | "looseDefault"> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      // First person is the main view; third person is an option the user chose (version 2 or later).
      view: raw.v === SETTINGS_VERSION && raw.view === "third" ? "third" : "first",
      gravity: typeof raw.gravity === "number" ? Math.min(30, Math.max(0, raw.gravity)) : 9.81,
      showColliders: raw.showColliders === true,
      scope: raw.scope === "targets" ? "targets" : "scene",
      looseDefault: raw.looseDefault === "small" ? "small" : "none"
    };
  } catch {
    return { view: "first", gravity: 9.81, showColliders: false, scope: "scene", looseDefault: "none" };
  }
}

export const gameStore = proxy<GameState>({
  active: false,
  phase: "off",
  tools: false,
  wrap: { done: 0, total: 0, current: null },
  skipWrapTick: 0,
  bodies: {},
  panelOpen: false,
  paused: false,
  overrides: {},
  pointerLocked: false,
  stats: { solid: 0, loose: 0, building: false },
  resetTick: 0,
  respawnTick: 0,
  fire: { tick: 0, hit: false },
  ...load()
});

// Panel shortcuts (Mod+B, Mod+/) are off only while the player has the keys: the wrap phase and
// the tools view show the editor, so its shortcuts work there.
setGameModeProbe(() => gameControlsActive());

subscribe(gameStore, () => {
  try {
    const { view, gravity, showColliders, scope, looseDefault } = gameStore;
    localStorage.setItem(KEY, JSON.stringify({ v: SETTINGS_VERSION, view, gravity, showColliders, scope, looseDefault }));
  } catch {
    // per-viewer convenience only
  }
});

/** Starts game mode with the wrap phase. Targets (the selection) become loose objects. */
export function enterGameMode(targets: string[] = []) {
  for (const id of targets) gameStore.overrides[id] = "loose";
  gameStore.paused = false;
  gameStore.tools = false;
  gameStore.wrap = { done: 0, total: 0, current: null };
  gameStore.bodies = {};
  gameStore.phase = "wrapping";
  gameStore.active = true;
}

export function exitGameMode() {
  gameStore.active = false;
  gameStore.phase = "off";
  gameStore.tools = false;
  gameStore.bodies = {};
  gameStore.wrap = { done: 0, total: 0, current: null };
  gameStore.pointerLocked = false;
  if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
}

type GameFlags = Pick<GameState, "active" | "phase" | "tools">;

/** True while keys and mouse drive the player: the game runs and the editor tools are not shown. */
export function gameControlsActive(game: GameFlags = gameStore) {
  return game.active && game.phase === "playing" && !game.tools;
}

/** True while the editor panels are hidden: only while the user plays. The wrap phase and the tools view show them. */
export function gameHidesEditor(game: GameFlags = gameStore) {
  return gameControlsActive(game);
}

/**
 * Shows or hides the editor tools inside game mode. Shown: the pointer is free, the player
 * stands still, and the editor camera starts behind and above the player, so the user sees
 * where the player is. Hidden: the player has the keys again.
 */
export function setGameTools(on: boolean) {
  if (!gameStore.active || gameStore.phase !== "playing" || gameStore.tools === on) return;
  if (on) {
    if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
    gameStore.pointerLocked = false;
    if (playerPose.valid) {
      const camera = uiStore.viewports.perspective?.camera;
      const { position: p, forward: f } = playerPose;
      if (camera) {
        camera.target = { x: p.x, y: p.y + 1, z: p.z };
        camera.position = { x: p.x - f.x * 7, y: p.y + 4.5, z: p.z - f.z * 7 };
      }
    }
  }
  gameStore.tools = on;
}

export function toggleGameTools() {
  setGameTools(!gameStore.tools);
}

/** Metadata key of the "Player start" marker node. The game starts the player there when the scene has one. */
export const PLAYER_START_META = "playerStart";
/** Library id of the marker (resources/game/player-start.ts). */
export const PLAYER_START_RESOURCE = "game:player-start";

export function toggleGameMode(targets: string[] = []) {
  if (gameStore.active) exitGameMode();
  else enterGameMode(targets);
}

export function setBodyMode(ids: string[], mode: BodyMode | "default") {
  for (const id of ids) {
    if (mode === "default") delete gameStore.overrides[id];
    else gameStore.overrides[id] = mode;
  }
}

/**
 * Where the player is and looks (not reactive; written every frame while game mode runs).
 * The AI reads it so "here" and "in front of me" mean a place near the player.
 */
export const playerPose = {
  valid: false,
  position: { x: 0, y: 0, z: 0 },
  /** Horizontal facing direction (unit length). */
  forward: { x: 0, z: -1 }
};

/** A point about 4 m in front of the player, on the ground under the player's feet. */
export function playerFocusPoint() {
  if (!playerPose.valid) return undefined;
  return {
    x: playerPose.position.x + playerPose.forward.x * 4,
    y: playerPose.position.y,
    z: playerPose.position.z + playerPose.forward.z * 4
  };
}

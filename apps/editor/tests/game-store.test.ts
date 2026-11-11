// Game mode state (lib/game/game-store.ts): the wrap phase, the tools view and who has the keys.
import { beforeEach, describe, expect, test } from "bun:test";
import {
  enterGameMode,
  exitGameMode,
  gameControlsActive,
  gameHidesEditor,
  gameStore,
  playerPose,
  setGameTools,
  toggleGameTools
} from "../src/lib/game/game-store";
import { uiStore } from "../src/state/ui-store";

describe("game mode state", () => {
  beforeEach(() => {
    exitGameMode();
    for (const id of Object.keys(gameStore.overrides)) delete gameStore.overrides[id];
    playerPose.valid = false;
  });

  test("first person is the default view", () => {
    // No saved setting in the test run: the default applies.
    expect(gameStore.view).toBe("first");
  });

  test("Play starts with the wrap phase: the editor stays visible and the player has no keys yet", () => {
    enterGameMode(["node:a"]);
    expect(gameStore.active).toBe(true);
    expect(gameStore.phase).toBe("wrapping");
    expect(gameStore.overrides["node:a"]).toBe("loose");
    expect(gameControlsActive()).toBe(false);
    expect(gameHidesEditor()).toBe(false);
    expect(gameStore.wrap).toEqual({ done: 0, total: 0, current: null });
  });

  test("playing: the player has the keys and the editor panels are hidden", () => {
    enterGameMode();
    gameStore.phase = "playing";
    expect(gameControlsActive()).toBe(true);
    expect(gameHidesEditor()).toBe(true);
  });

  test("the tools view gives the keys to the editor and comes back", () => {
    enterGameMode();
    // Not while the scene is still being wrapped.
    setGameTools(true);
    expect(gameStore.tools).toBe(false);

    gameStore.phase = "playing";
    toggleGameTools();
    expect(gameStore.tools).toBe(true);
    expect(gameStore.active).toBe(true);
    expect(gameControlsActive()).toBe(false);
    expect(gameHidesEditor()).toBe(false);
    toggleGameTools();
    expect(gameControlsActive()).toBe(true);
  });

  test("the tools view puts the editor camera behind and above the player", () => {
    enterGameMode();
    gameStore.phase = "playing";
    playerPose.valid = true;
    Object.assign(playerPose.position, { x: 10, y: 2, z: -5 });
    Object.assign(playerPose.forward, { x: 0, z: -1 });
    setGameTools(true);
    const camera = uiStore.viewports.perspective.camera;
    expect(camera.target).toMatchObject({ x: 10, y: 3, z: -5 });
    expect(camera.position).toMatchObject({ x: 10, y: 6.5, z: 2 });
  });

  test("exit clears the game state", () => {
    enterGameMode();
    gameStore.phase = "playing";
    gameStore.bodies = { "node:a": { mode: "solid", shape: "trimesh" } };
    setGameTools(true);
    exitGameMode();
    expect(gameStore.active).toBe(false);
    expect(gameStore.phase).toBe("off");
    expect(gameStore.tools).toBe(false);
    expect(gameStore.bodies).toEqual({});
    expect(gameControlsActive()).toBe(false);
  });
});

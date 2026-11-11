// Game mode UI logic (pure, no DOM): the hint choice by width, the scene tree physics counts,
// the mark click cycle and the key routing of game-input.ts.
import { describe, expect, test } from "bun:test";

// A minimal browser for the modules: storage, one animation frame, and a document that takes
// the style tag of the toast library.
const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
g.requestAnimationFrame ??= () => 0;
const node = () => ({ appendChild: () => undefined, style: {} });
g.document ??= {
  querySelector: () => null,
  head: node(),
  createElement: () => node(),
  createTextNode: () => ({}),
  getElementsByTagName: () => [node()]
};

const { hintBudget, hintsWidth, hudMode, nextBodyMode, pickHints, tallyBodiesByAncestor, dominantMode, yawFromForward } = await import(
  "../src/components/editor-shell/GameHud"
);
const { routeGameKey } = await import("../src/lib/game/game-input");

describe("hints by width", () => {
  test("narrow (360 px): the two or three most useful stay, on one line", () => {
    const free = pickHints(360, true);
    expect(free).toEqual(["look", "move", "chat"]);
    expect(hintsWidth(free)).toBeLessThanOrEqual(hintBudget(360));
    const locked = pickHints(360, false);
    expect(locked).toContain("move");
    expect(locked).toContain("chat");
    expect(locked).not.toContain("look");
  });

  test("wide (1280 px): every hint, in display order", () => {
    expect(pickHints(1280, true)).toEqual(["look", "move", "run", "jump", "push", "view", "tools", "chat"]);
    expect(pickHints(1280, false)).toEqual(["move", "run", "jump", "push", "view", "tools", "chat"]);
  });

  test("never more than the budget, and fewer items as the width goes down", () => {
    let last = Infinity;
    for (let w = 2560; w >= 300; w -= 20) {
      const ids = pickHints(w, true);
      expect(hintsWidth(ids)).toBeLessThanOrEqual(hintBudget(w));
      expect(ids.length).toBeLessThanOrEqual(last);
      last = ids.length;
    }
  });
});

describe("hud mode", () => {
  test("states", () => {
    expect(hudMode({ active: false, phase: "off", tools: false })).toBe("off");
    expect(hudMode({ active: true, phase: "wrapping", tools: false })).toBe("wrapping");
    expect(hudMode({ active: true, phase: "playing", tools: false })).toBe("playing");
    expect(hudMode({ active: true, phase: "playing", tools: true })).toBe("tools");
  });

  test("yaw from forward: 0 faces -z", () => {
    expect(yawFromForward({ x: 0, z: -1 })).toBeCloseTo(0);
    expect(yawFromForward({ x: -1, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(yawFromForward({ x: 0, z: 1 }))).toBeCloseTo(Math.PI);
  });
});

describe("scene tree marks", () => {
  // root > town > (house, well), root > forest > (tree1, tree2), barrel at the top level.
  const parents: Record<string, string | undefined> = {
    town: "root",
    forest: "root",
    house: "town",
    well: "town",
    tree1: "forest",
    tree2: "forest",
    barrel: undefined,
    root: undefined
  };
  const parentOf = (id: string) => parents[id];

  test("folder counts in one pass", () => {
    const tally = tallyBodiesByAncestor(
      {
        house: { mode: "solid", shape: "trimesh" },
        well: { mode: "loose", shape: "hull" },
        tree1: { mode: "trunk", shape: "capsule" },
        tree2: { mode: "trunk", shape: "capsule" },
        barrel: { mode: "loose", shape: "hull" }
      },
      {},
      parentOf
    );
    expect(tally.get("town")).toEqual({ solid: 1, loose: 1, trunk: 0, ghost: 0, total: 2 });
    expect(tally.get("forest")?.trunk).toBe(2);
    expect(tally.get("root")?.total).toBe(4);
    expect(dominantMode(tally.get("forest")!)).toBe("trunk");
    // Objects with no children have no folder count.
    expect(tally.has("house")).toBe(false);
    expect(tally.has("barrel")).toBe(false);
  });

  test("a ghost override without a collider counts as ghost", () => {
    const tally = tallyBodiesByAncestor({ house: { mode: "solid", shape: "trimesh" } }, { well: "ghost" }, parentOf);
    expect(tally.get("town")).toEqual({ solid: 1, loose: 0, trunk: 0, ghost: 1, total: 2 });
  });

  test("a parent loop does not hang", () => {
    const loop: Record<string, string> = { a: "b", b: "a" };
    const tally = tallyBodiesByAncestor({ a: { mode: "solid", shape: "box" } }, {}, (id) => loop[id]);
    expect(tally.get("b")?.total).toBe(1);
  });

  test("a mark click cycles default, loose, ghost, solid", () => {
    expect(nextBodyMode(undefined)).toBe("loose");
    expect(nextBodyMode("loose")).toBe("ghost");
    expect(nextBodyMode("ghost")).toBe("solid");
    expect(nextBodyMode("solid")).toBe("default");
  });
});

describe("key routing", () => {
  const playing = { active: true, phase: "playing" as const, tools: false };
  const tools = { active: true, phase: "playing" as const, tools: true };
  const wrapping = { active: true, phase: "wrapping" as const, tools: false };
  const key = (code: string, extra: Partial<{ repeat: boolean; mod: boolean; typing: boolean }> = {}) => ({
    code,
    repeat: false,
    mod: false,
    typing: false,
    ...extra
  });

  test("off: nothing is taken", () => {
    expect(routeGameKey({ active: false, phase: "off", tools: false }, key("KeyW")).kind).toBe("pass");
  });

  test("playing: the player has the keys", () => {
    expect(routeGameKey(playing, key("KeyW"))).toEqual({ kind: "move", field: "forward" });
    expect(routeGameKey(playing, key("Space"))).toEqual({ kind: "move", field: "jump" });
    expect(routeGameKey(playing, key("KeyV")).kind).toBe("view");
    expect(routeGameKey(playing, key("Enter")).kind).toBe("chat");
    expect(routeGameKey(playing, key("Escape")).kind).toBe("exit");
    expect(routeGameKey(playing, key("Tab")).kind).toBe("tools");
    expect(routeGameKey(playing, key("KeyV", { repeat: true })).kind).toBe("swallow");
    // Cmd or Ctrl combinations go to the editor (Ask bar, game toggle).
    expect(routeGameKey(playing, key("KeyK", { mod: true })).kind).toBe("pass");
    // Typing in the chat: only Escape (blur) is taken.
    expect(routeGameKey(playing, key("KeyW", { typing: true })).kind).toBe("pass");
    expect(routeGameKey(playing, key("Escape", { typing: true })).kind).toBe("blur");
  });

  test("tools view: only Tab is a game key", () => {
    expect(routeGameKey(tools, key("Tab")).kind).toBe("tools");
    for (const code of ["KeyW", "Space", "KeyV", "KeyR", "Enter", "Escape", "Digit1", "Delete"]) {
      expect(routeGameKey(tools, key(code)).kind).toBe("pass");
    }
    // Typing targets are left alone, Tab too (focus moves between fields).
    expect(routeGameKey(tools, key("Tab", { typing: true })).kind).toBe("pass");
    expect(routeGameKey(tools, key("Escape", { typing: true })).kind).toBe("pass");
  });

  test("wrap phase: Enter or Space skips, Escape exits, the rest goes to the editor", () => {
    expect(routeGameKey(wrapping, key("Enter")).kind).toBe("skip");
    expect(routeGameKey(wrapping, key("Space")).kind).toBe("skip");
    expect(routeGameKey(wrapping, key("Escape")).kind).toBe("exit");
    expect(routeGameKey(wrapping, key("KeyW")).kind).toBe("pass");
    expect(routeGameKey(wrapping, key("Tab")).kind).toBe("pass");
    expect(routeGameKey(wrapping, key("Space", { typing: true })).kind).toBe("pass");
  });
});

// Unit tests for design playbooks, palettes and the ghost preview anchor
// (plan docs/plans/realtime-ai-harness.md, 5.8, 5.9, 5.10).
// Run: cd apps/editor && bun test tests/
import { describe, expect, test } from "bun:test";
import { RESOURCES } from "../src/lib/resources/catalog";
import { PLAYBOOKS, PLAYBOOK_MAX_TOKENS, approxTokens, pickPlaybook, playbookIds, playbookToText } from "../src/lib/copilot/playbooks";
import { PALETTES, PALETTE_IDS, PALETTE_ROLES, paletteColor } from "../src/lib/copilot/palettes";
import { getGhost, hideGhost, resolveGhostAnchor, showGhost, subscribeGhost, type GhostNode } from "../src/lib/copilot/ghost-preview";

const byId = new Map(RESOURCES.map((e) => [e.id, e]));
const PATTERNS = new Set(["single", "cluster", "ring", "row", "scatter", "shore", "path"]);
const FACINGS = new Set(["anchor", "away", "random", "along"]);

describe("playbooks: data", () => {
  test("at least harbor, camp and garden; unique ids", () => {
    const ids = PLAYBOOKS.map((p) => p.id);
    for (const id of ["harbor", "camp", "garden"]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every library id exists in RESOURCES", () => {
    for (const p of PLAYBOOKS) {
      const missing = playbookIds(p).filter((id) => !byId.has(id));
      expect({ playbook: p.id, missing }).toEqual({ playbook: p.id, missing: [] });
    }
  });

  test("environment is a sky, water is a water entry", () => {
    for (const p of PLAYBOOKS) {
      expect(byId.get(p.environment)?.kind).toBe("sky");
      if (p.water) expect(byId.get(p.water)?.kind).toBe("water");
    }
  });

  test("5 to 8 rules, palette exists, focal/support/accents not empty", () => {
    for (const p of PLAYBOOKS) {
      expect(p.rules.length).toBeGreaterThanOrEqual(5);
      expect(p.rules.length).toBeLessThanOrEqual(8);
      expect(PALETTES[p.palette]).toBeDefined();
      expect(p.focal.length).toBeGreaterThan(0);
      expect(p.support.length).toBeGreaterThan(0);
      expect(p.accents.length).toBeGreaterThan(0);
      expect(p.triggers.length).toBeGreaterThan(0);
    }
  });

  test("example has the place_resources shape of plan 5.7", () => {
    for (const p of PLAYBOOKS) {
      expect(p.example.items.length).toBeGreaterThan(0);
      for (const item of p.example.items) {
        expect(Object.keys(item).every((k) => ["id", "count", "layout", "seed"].includes(k))).toBe(true);
        if (item.count !== undefined) {
          expect(Number.isInteger(item.count)).toBe(true);
          expect(item.count).toBeGreaterThanOrEqual(1);
          expect(item.count).toBeLessThanOrEqual(24);
        }
        if (item.layout) {
          expect(Object.keys(item.layout).every((k) => ["pattern", "anchor", "to", "radius", "facing"].includes(k))).toBe(true);
          expect(PATTERNS.has(item.layout.pattern)).toBe(true);
          if (item.layout.facing) expect(FACINGS.has(item.layout.facing)).toBe(true);
        }
      }
      // JSON round trip: plain data only.
      expect(JSON.parse(JSON.stringify(p.example))).toEqual(p.example);
    }
  });
});

describe("playbookToText", () => {
  test(`${PLAYBOOK_MAX_TOKENS} tokens or less (chars / 4), also with an empty scene`, () => {
    for (const p of PLAYBOOKS) {
      for (const kinds of [[], ["sky", "water", "terrain"]]) {
        const text = playbookToText(p, kinds);
        expect({ id: p.id, tokens: approxTokens(text) <= PLAYBOOK_MAX_TOKENS }).toEqual({ id: p.id, tokens: true });
      }
    }
  });

  test("contains ids, rules, palette colors and the example", () => {
    const harbor = PLAYBOOKS.find((p) => p.id === "harbor")!;
    const text = playbookToText(harbor);
    expect(text).toContain("lh:landmark:lighthouse");
    expect(text).toContain(harbor.environment);
    expect(text).toContain(harbor.water!);
    expect(text).toContain(paletteColor("harbor", "wood")!);
    for (const rule of harbor.rules) expect(text).toContain(rule);
    expect(text).toContain(JSON.stringify(harbor.example));
  });

  test("leaves out sky and water when the scene has them", () => {
    const harbor = PLAYBOOKS.find((p) => p.id === "harbor")!;
    const text = playbookToText(harbor, ["sky", "water"]);
    expect(text).not.toContain(harbor.environment);
    expect(text).not.toContain(`water ${harbor.water}`);
  });
});

describe("pickPlaybook", () => {
  test("trigger words", () => {
    expect(pickPlaybook("build a small harbor with a lighthouse, a ship and some plants")?.id).toBe("harbor");
    expect(pickPlaybook("Make a fishing village by the docks")?.id).toBe("harbor");
    expect(pickPlaybook("build a small camp next to the windmill: a rowboat by the shore, a campfire, a bench and three plants")?.id).toBe("camp");
    expect(pickPlaybook("a cozy campsite in the woods")?.id).toBe("camp");
    expect(pickPlaybook("make a flower garden with a fountain")?.id).toBe("garden");
    expect(pickPlaybook("an orchard")?.id).toBe("garden");
    expect(pickPlaybook("a zen shrine with a hot spring")?.id).toBe("shrine");
  });

  test("null when nothing matches, and for remove / question prompts", () => {
    for (const p of [
      "add a lantern",
      "make it nicer",
      "bevel the selected cube",
      "when the player enters, open the door",
      "remove the garden",
      "what is in the camp?",
      "add a sparkle", // "park" must match a whole word only
      "",
      "an important portal" // "port" must match a whole word only
    ]) {
      expect({ p, id: pickPlaybook(p)?.id ?? null }).toEqual({ p, id: null });
    }
  });

  test("1 playbook maximum; scene kinds break a tie", () => {
    // harbor: "dock" (1 hit); camp: "camp" (1 hit). Earlier playbook wins without hints.
    expect(pickPlaybook("a camp at the dock")?.id).toBe("harbor");
    expect(pickPlaybook("a camp at the dock", ["water"])?.id).toBe("harbor");
    // More hits win over scene hints.
    expect(pickPlaybook("a camp with a campfire at the dock", ["water"])?.id).toBe("camp");
  });
});

describe("palettes", () => {
  test("4 to 6 palettes, every role is a hex color", () => {
    expect(PALETTE_IDS.length).toBeGreaterThanOrEqual(4);
    expect(PALETTE_IDS.length).toBeLessThanOrEqual(6);
    for (const id of PALETTE_IDS) {
      expect(PALETTES[id].id).toBe(id);
      for (const role of PALETTE_ROLES) expect(paletteColor(id, role)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("unknown palette or role", () => {
    expect(paletteColor("nope", "wood")).toBeUndefined();
    expect(paletteColor("harbor", "nope")).toBeUndefined();
    expect(paletteColor("harbor", "toString")).toBeUndefined();
    expect(paletteColor("constructor", "wood")).toBeUndefined();
  });
});

describe("ghost preview", () => {
  const n = (id: string, name: string, x: number, z: number, extra: Partial<GhostNode> = {}): GhostNode => ({
    id,
    name,
    kind: "resource x",
    position: { x, y: 0, z },
    radius: 2,
    ...extra
  });
  const nodes = [
    n("node:a", "Windmill", 10, 0),
    n("node:b", "Lantern", 0, 5),
    n("node:c", "Lantern", 0, 8),
    n("node:t", "Island land", 0, 0, { terrain: true, radius: 16 }),
    n("node:s", "Environment: Dusk", 0, 0, { kind: "sky lh:sky:dusk" }),
    n("node:f", "Camp", 0, 0, { kind: "folder" })
  ];
  const camera = { x: 1, y: 0, z: 2 };

  test("a named node first", () => {
    const a = resolveGhostAnchor("build a camp next to the windmill", nodes, ["node:b"], camera);
    expect(a.source).toBe("node");
    expect(a.position).toEqual({ x: 10, y: 0, z: 0 });
    expect(a.radius).toBe(3);
  });

  test("ambiguous names, folders, terrain and sky are not anchors", () => {
    expect(resolveGhostAnchor("near the lantern", nodes, [], camera).source).toBe("camera");
    expect(resolveGhostAnchor("add stuff to the camp", nodes, [], camera).source).toBe("camera");
    expect(resolveGhostAnchor("on the island land", nodes, [], camera).source).toBe("camera");
  });

  test("then the selection, then the camera target", () => {
    const s = resolveGhostAnchor("build a garden here", nodes, ["node:b", "node:c"], camera);
    expect(s.source).toBe("selection");
    expect(s.position).toEqual({ x: 0, y: 0, z: 6.5 });
    const c = resolveGhostAnchor("build a garden", nodes, [], camera);
    expect(c).toEqual({ position: camera, radius: 3, source: "camera" });
    expect(resolveGhostAnchor("x", [], []).position).toEqual({ x: 0, y: 0, z: 0 });
  });

  test("show / hide notify subscribers", () => {
    let calls = 0;
    const off = subscribeGhost(() => calls++);
    showGhost({ x: 1, y: 2, z: 3 }, 4);
    expect(getGhost()).toMatchObject({ visible: true, position: { x: 1, y: 2, z: 3 }, radius: 4 });
    hideGhost();
    expect(getGhost().visible).toBe(false);
    hideGhost(); // no change, no notify
    off();
    showGhost({ x: 0, y: 0, z: 0 }, 1);
    hideGhost();
    expect(calls).toBe(2);
  });
});

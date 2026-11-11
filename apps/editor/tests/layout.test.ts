// Unit tests for the layout solver (plan docs/plans/realtime-ai-harness.md, 5.1 and 5.7).
// Run: cd apps/editor && bun test tests/
import { describe, expect, test } from "bun:test";
import { LAYOUT_GAP, mediumOf, solveLayout, type LayoutItem, type LayoutNode, type LayoutPlacement, type PlacementScene } from "../src/lib/resources/layout";
import { getResource } from "../src/lib/resources/catalog";

/** A round island of radius 7 m at the origin: land at y 0.5, water outside. */
const ISLAND_R = 7;
const islandGround = (x: number, z: number) => (Math.hypot(x, z) <= ISLAND_R ? 0.5 : null);
const islandNode: LayoutNode = { id: "node:terrain:1", name: "Island land", kind: "terrain island", position: { x: 0, y: 0, z: 0 }, radius: 16, terrain: true };
const windmill: LayoutNode = { id: "node:resource:windmill:1", name: "Windmill", kind: "resource lh:landmark:windmill", position: { x: 2, y: 0.5, z: 1 }, radius: 2.5 };
const lagoon: LayoutNode = { id: "node:resource:lagoon:1", name: "Anime lagoon", kind: "resource water:lagoon", position: { x: 0, y: 0, z: 0 }, radius: 48 };

const islandScene: PlacementScene = { nodes: [islandNode, windmill, lagoon], selection: [], cameraTarget: { x: 0, y: 0, z: 0 }, groundAt: islandGround };

function item(id: string, extra: Partial<LayoutItem> = {}): LayoutItem {
  const entry = getResource(id)!;
  return { id, footprint: entry.footprint, medium: mediumOf(entry), vary: entry.kind === "plant", ...extra };
}

function expectNoOverlap(placed: LayoutPlacement[], fixed: LayoutNode[] = []) {
  const circles = [
    ...placed.map((p) => ({ x: p.x, z: p.z, r: Math.max(getResource(p.id)!.footprint, 0.3) * p.scale })),
    ...fixed.map((n) => ({ x: n.position.x, z: n.position.z, r: n.radius! }))
  ];
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i];
      const b = circles[j];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.r + b.r + LAYOUT_GAP - 1e-6);
    }
}

describe("mediumOf", () => {
  test("boats and water plants go on water, the rest on land", () => {
    expect(mediumOf(getResource("lh:feature:rowboat")!)).toBe("water");
    expect(mediumOf(getResource("vehicle:caravan-ship")!)).toBe("water");
    expect(mediumOf(getResource("lh:plant:lily_pad")!)).toBe("water");
    expect(mediumOf(getResource("lh:feature:bench")!)).toBe("land");
    expect(mediumOf(getResource("lh:plant:oak")!)).toBe("land");
    expect(mediumOf(getResource("water:lagoon")!)).toBe("cover");
  });
});

describe("solveLayout", () => {
  test("the camp prompt: one call, no overlaps, land objects on land, the boat on water at the shore", () => {
    const items = [
      item("lh:landmark:campfire", { layout: { pattern: "single", anchor: windmill.id } }),
      item("lh:feature:bench", { layout: { pattern: "single", anchor: windmill.id } }),
      item("lh:plant:fern", { count: 3, layout: { pattern: "cluster", anchor: windmill.id } }),
      item("lh:feature:rowboat", { layout: { pattern: "shore", anchor: windmill.id } })
    ];
    const { placed, skipped } = solveLayout(items, islandScene);
    expect(skipped).toEqual([]);
    expect(placed).toHaveLength(6);
    expectNoOverlap(placed, [windmill]);
    for (const p of placed) {
      if (p.id === "lh:feature:rowboat") {
        expect(islandGround(p.x, p.z)).toBeNull();
        expect(p.y).toBe(0);
        // At the shore: within 2 boat lengths of the coast.
        expect(Math.hypot(p.x, p.z)).toBeLessThan(ISLAND_R + 1.2 * 3 + 0.5);
      } else {
        expect(islandGround(p.x, p.z)).toBe(0.5);
        expect(p.y).toBe(0.5);
      }
    }
    // The campfire and the bench stand next to the windmill, not across the island.
    for (const p of placed.filter((q) => q.id !== "lh:feature:rowboat")) expect(Math.hypot(p.x - 2, p.z - 1)).toBeLessThan(9);
  });

  test("a rowboat with a plain cluster still goes on the water", () => {
    const { placed } = solveLayout([item("lh:feature:rowboat", { layout: { pattern: "cluster", anchor: windmill.id } })], islandScene);
    expect(placed).toHaveLength(1);
    expect(islandGround(placed[0].x, placed[0].z)).toBeNull();
  });

  test("shore for a land object is on land at the island edge nearest the anchor", () => {
    const { placed } = solveLayout([item("lh:feature:bench", { layout: { pattern: "shore", anchor: { x: 20, z: 0 } } })], islandScene);
    expect(placed).toHaveLength(1);
    const p = placed[0];
    expect(islandGround(p.x, p.z)).toBe(0.5);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(ISLAND_R - 3);
    expect(p.x).toBeGreaterThan(4); // the east side, toward the anchor
  });

  test("land only: nothing lands in the water, the rest goes to skipped", () => {
    const { placed, skipped } = solveLayout([item("lh:landmark:windmill", { count: 24, layout: { pattern: "scatter", anchor: "origin" } })], islandScene);
    for (const p of placed) expect(islandGround(p.x, p.z)).toBe(0.5);
    expectNoOverlap(placed, [windmill]);
    expect(placed.length).toBeLessThan(24);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain(`for ${24 - placed.length} of 24`);
  });

  test("skipped when the island is full", () => {
    const full: PlacementScene = { ...islandScene, nodes: [islandNode, { ...windmill, position: { x: 0, y: 0, z: 0 }, radius: 9 }] };
    const { placed, skipped } = solveLayout([item("lh:feature:bench", { count: 2, layout: { pattern: "cluster", anchor: "origin" } })], full);
    expect(placed).toHaveLength(0);
    expect(skipped).toEqual([{ item: 0, id: "lh:feature:bench", reason: "no free land near the anchor for 2 of 2" }]);
  });

  test("deterministic by seed", () => {
    const items = [item("lh:plant:tulip", { count: 5, layout: { pattern: "cluster", anchor: windmill.id }, seed: 42 })];
    const a = solveLayout(items, islandScene);
    const b = solveLayout(items, islandScene);
    expect(a).toEqual(b);
    const c = solveLayout([{ ...items[0], seed: 43 }], islandScene);
    expect(c.placed.map((p) => p.x)).not.toEqual(a.placed.map((p) => p.x));
  });

  test("plants in a cluster vary in scale (0.9 to 1.1) and yaw; features do not scale", () => {
    const { placed } = solveLayout([item("lh:plant:tulip", { count: 5, layout: { pattern: "cluster" } }), item("lh:feature:lantern", { count: 3, layout: { pattern: "cluster" } })], islandScene);
    const tulips = placed.filter((p) => p.id === "lh:plant:tulip");
    expect(tulips).toHaveLength(5);
    for (const t of tulips) {
      expect(t.scale).toBeGreaterThanOrEqual(0.9);
      expect(t.scale).toBeLessThanOrEqual(1.1);
    }
    expect(new Set(tulips.map((t) => t.scale)).size).toBeGreaterThan(1);
    for (const l of placed.filter((p) => p.id === "lh:feature:lantern")) expect(l.scale).toBe(1);
  });

  test("playbook shape: a focal single at the camera, then ring and cluster items around it", () => {
    const items = [
      item("lh:landmark:lighthouse", { layout: { pattern: "single" } }),
      item("lh:feature:lantern", { count: 4, layout: { pattern: "ring" } }),
      item("lh:plant:daisy", { count: 5, layout: { pattern: "cluster" } })
    ];
    const scene: PlacementScene = { nodes: [islandNode], selection: [], cameraTarget: { x: 0.5, y: 0, z: 0 }, groundAt: islandGround };
    const { placed, skipped } = solveLayout(items, scene);
    expect(skipped).toEqual([]);
    expectNoOverlap(placed);
    const focal = placed[0];
    expect(Math.hypot(focal.x - 0.5, focal.z)).toBeLessThan(0.01);
    for (const p of placed.slice(1)) expect(Math.hypot(p.x - focal.x, p.z - focal.z)).toBeGreaterThan(2.5);
  });

  test("ring, row and path", () => {
    const flat: PlacementScene = { nodes: [], selection: [] };
    const ring = solveLayout([item("lh:feature:lantern", { count: 6, layout: { pattern: "ring", anchor: { x: 0, z: 0 }, radius: 4 } })], flat).placed;
    expect(ring).toHaveLength(6);
    for (const p of ring) expect(Math.hypot(p.x, p.z)).toBeCloseTo(4, 5);
    const row = solveLayout([item("lh:feature:lantern", { count: 4, layout: { pattern: "row", anchor: { x: 0, z: 0 }, to: { x: 10, z: 0 } } })], flat).placed;
    expect(row.map((p) => Math.round(p.z * 100))).toEqual([0, 0, 0, 0]);
    expect(row[3].x).toBeGreaterThan(row[0].x);
    const path = solveLayout([item("lh:feature:lantern", { count: 5, layout: { pattern: "path", anchor: { x: 0, z: 0 }, to: { x: 0, z: 12 } } })], flat).placed;
    expect(path).toHaveLength(5);
    for (const p of path) expect(Math.abs(p.x)).toBeGreaterThan(0.3); // side offset
    expect(path[4].z).toBeGreaterThan(path[0].z);
    expect(solveLayout([item("lh:feature:lantern", { layout: { pattern: "path" } })], flat).skipped[0].reason).toContain("needs");
  });

  test("anchors: unknown anchor, selection, node name", () => {
    expect(solveLayout([item("lh:feature:bench", { layout: { pattern: "single", anchor: "node:nope" } })], islandScene).skipped[0].reason).toContain("unknown anchor");
    const sel = solveLayout([item("lh:feature:bench", { layout: { pattern: "single", anchor: "selection" } })], { ...islandScene, selection: [windmill.id] }).placed[0];
    expect(Math.hypot(sel.x - 2, sel.z - 1)).toBeLessThan(5);
    expect(solveLayout([item("lh:feature:bench", { layout: { pattern: "single", anchor: "windmill" } })], islandScene).placed).toHaveLength(1);
  });

  test("a water surface is a ground cover, not an obstacle", () => {
    const { placed } = solveLayout([item("lh:feature:lantern", { layout: { pattern: "single", anchor: "origin" } })], islandScene);
    expect(placed).toHaveLength(1);
  });
});

// Tests for the city zoning, sizes, site record and replace (src/lib/generators/city/,
// src/lib/copilot/director/generators/city.ts).
// Run: cd apps/editor && bun test tests/city-zoning.test.ts
import { describe, expect, test } from "bun:test";
import { SIZE_GRID, SIZE_IDS, blocksTouch, cityFacts, fitCity, normalizeCityParams, planCity, sizeOfGrid, type CityParams, type CityPlan } from "../src/lib/generators/city";
import { cityGenerator, suggestSize } from "../src/lib/copilot/director/generators/city";
import { readSites } from "../src/lib/copilot/director/site";
import type { Brief, BuiltSite } from "../src/lib/copilot/director/types";

const anyTree = (id: string) => /^nature:tree:|^lh:plant:(oak|cherry|birch|pine|willow|apple)$/.test(id);
function params(raw: Record<string, unknown>): CityParams {
  const p = normalizeCityParams(raw, anyTree);
  if (typeof p === "string") throw new Error(p);
  return p;
}
const SEEDS = [1, 2, 3, 42, 777];
const GRIDS: [number, number][] = [
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 4],
  [5, 5],
  [3, 2],
  [2, 5]
];
const ZONES = new Set(["downtown", "commercial", "low-rise", "industrial", "park"]);
const avg = (l: number[]) => l.reduce((a, b) => a + b, 0) / Math.max(1, l.length);
const nodeCount = (plan: CityPlan) => 2 + plan.streets.length + plan.buildings.length + plan.trees.length + plan.lamps.length + plan.details.length + plan.park.length;

describe("city sizes", () => {
  test("named sizes and aliases", () => {
    expect(SIZE_IDS.map((id) => SIZE_GRID[id])).toEqual([
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5]
    ]);
    const cases: Record<string, string> = {
      neighborhood: "neighborhood",
      small: "neighborhood",
      village: "neighborhood",
      town: "town",
      medium: "town",
      city: "city",
      large: "city",
      big: "city",
      metropolis: "metropolis",
      huge: "metropolis",
      "big city": "metropolis"
    };
    for (const [word, size] of Object.entries(cases)) expect(params({ size: word }).size, word).toBe(size as never);
    expect(params({ cols: 4, rows: 4 }).size).toBe("city");
    expect(params({ cols: 5, rows: 3 }).size).toBe("custom");
    expect(sizeOfGrid(3, 3)).toBe("town");
    expect(params({ at: { x: 12.5, z: -3 } }).at).toEqual({ x: 12.5, z: -3 });
    expect(params({}).at).toBeUndefined();
  });

  test("suggested size from the words", () => {
    const b = (understanding: string): Brief => ({ mode: "build", understanding, tasks: [] });
    expect(suggestSize(b(""), "create a city")).toBe("city");
    expect(suggestSize(b(""), "a small village")).toBe("neighborhood");
    expect(suggestSize(b(""), "build a town")).toBe("town");
    expect(suggestSize(b(""), "a downtown with towers")).toBe("city");
    expect(suggestSize(b("A huge metropolis"), "make something big")).toBe("metropolis");
    expect(suggestSize(b(""), "a large city")).toBe("metropolis");
    expect(suggestSize(b(""), "something nice")).toBe("city");
  });
});

describe("city zoning", () => {
  test("kit commercial: no industrial building or yard detail, valid zone names", () => {
    for (const [cols, rows] of GRIDS)
      for (const seed of SEEDS) {
        const plan = planCity(params({ cols, rows, seed, kit: "commercial" }));
        expect(plan.buildings.every((b) => b.id.startsWith("model:city-commercial:")), `${cols}x${rows}/${seed}`).toBe(true);
        expect([...plan.details, ...plan.park].some((d) => d.id.includes("industrial"))).toBe(false);
        expect(plan.blocks.some((b) => b.zone === "industrial")).toBe(false);
        for (const b of plan.blocks) expect(ZONES.has(b.zone)).toBe(true);
        expect(plan.blocks.filter((b) => b.zone === "downtown").length).toBeGreaterThanOrEqual(1);
      }
  });

  test("kit mixed: one compact district at the edge, never next to the core, none under 3 x 3", () => {
    for (const [cols, rows] of GRIDS)
      for (const seed of SEEDS) {
        const name = `${cols}x${rows}/${seed}`;
        const plan = planCity(params({ cols, rows, seed, kit: "mixed" }));
        const core = plan.blocks.filter((b) => b.zone === "downtown");
        const industry = plan.blocks.filter((b) => b.zone === "industrial");
        if (cols < 3 || rows < 3) {
          expect(industry.length, name).toBe(0);
          expect(plan.buildings.some((b) => b.zone === "industrial"), name).toBe(false);
          expect(plan.notes.some((n) => /industrial district/.test(n)), name).toBe(true);
          continue;
        }
        expect(industry.length, name).toBeGreaterThan(0);
        for (const b of industry) {
          expect(core.some((c) => blocksTouch(b, c) || c === b), name).toBe(false);
          expect(b.i === 0 || b.j === 0 || b.i === cols - 1 || b.j === rows - 1, name).toBe(true);
        }
        // Compact: every district block touches another one (or it is a single block).
        if (industry.length > 1) for (const b of industry) expect(industry.some((o) => o !== b && blocksTouch(o, b)), name).toBe(true);
        // Industrial models stand only on industrial blocks.
        for (const bd of plan.buildings) {
          const block = plan.blocks.find((b) => b.i === bd.block[0] && b.j === bd.block[1])!;
          expect(bd.id.includes("city-industrial") === (block.zone === "industrial"), name).toBe(true);
        }
        // The district is on the far side from the park.
        const park = plan.blocks.find((b) => b.kind === "park");
        if (park) {
          const c = (b: { lot: { x0: number; x1: number; z0: number; z1: number } }) => [(b.lot.x0 + b.lot.x1) / 2, (b.lot.z0 + b.lot.z1) / 2];
          const [px, pz] = c(park);
          const dist = (b: (typeof plan.blocks)[number]) => Math.hypot(c(b)[0] - px, c(b)[1] - pz);
          const lots = plan.blocks.filter((b) => b.kind === "lot");
          expect(avg(industry.map(dist)), name).toBeGreaterThan(avg(lots.map(dist)));
        }
      }
  });

  test("skyline: the core is taller than the edge", () => {
    for (const [cols, rows] of GRIDS.filter(([c, r]) => c >= 3 && r >= 3))
      for (const seed of SEEDS) {
        const plan = planCity(params({ cols, rows, seed }));
        const zoneOf = (bd: CityPlan["buildings"][number]) => plan.blocks.find((b) => b.i === bd.block[0] && b.j === bd.block[1])!.zone;
        const h = (zone: string) => avg(plan.buildings.filter((b) => zoneOf(b) === zone).map((b) => b.height));
        const name = `${cols}x${rows}/${seed}`;
        expect(h("downtown"), name).toBeGreaterThan(h("commercial"));
        expect(h("commercial"), name).toBeGreaterThan(h("low-rise"));
        // The tallest building stands downtown.
        const tallest = plan.buildings.reduce((a, b) => (b.height > a.height ? b : a));
        expect(zoneOf(tallest), name).toBe("downtown");
      }
  });

  test("open space: a park next to the core, a second one from 16 blocks up", () => {
    for (const [cols, rows] of GRIDS)
      for (const seed of SEEDS) {
        const plan = planCity(params({ cols, rows, seed, park: true }));
        const greens = plan.blocks.filter((b) => b.kind !== "lot");
        expect(greens.length).toBe(cols * rows >= 16 ? 2 : 1);
        for (const g of greens) expect(g.zone).toBe("park");
        expect(plan.greens.length).toBe(greens.length);
      }
  });

  test("node count stays under the viewport budget", () => {
    for (const id of SIZE_IDS) {
      const counts = SEEDS.map((seed) => nodeCount(planCity(params({ size: id, seed, lamps: true }))));
      expect(Math.max(...counts), id).toBeLessThan(700);
    }
  });
});

describe("site facts", () => {
  test("world meters: center plus plan times scale", () => {
    const plan = planCity(params({ size: "town", seed: 5 }));
    const fit = { plan, scale: 0.5, center: { x: 100, z: -40 }, y: 2 };
    const f = cityFacts(fit);
    expect(f.scale).toBe(0.5);
    expect(f.groundRect.x0).toBeCloseTo(100 + plan.groundRect.x0 * 0.5, 2);
    expect(f.groundRect.z1).toBeCloseTo(-40 + plan.groundRect.z1 * 0.5, 2);
    expect(f.blocks.length).toBe(9);
    const b = plan.blocks[4];
    expect(f.blocks[4].rect.x1).toBeCloseTo(100 + b.lot.x1 * 0.5, 2);
    expect(f.blocks[4].zone).toBe(b.zone);
    const tallest = Math.max(...plan.buildings.filter((x) => x.block[0] === b.i && x.block[1] === b.j).map((x) => x.height), 0);
    expect(f.blocks[4].tallest).toBeCloseTo(tallest * 0.5, 1);
    const st = plan.streets[0];
    expect(f.streets[0].pos).toBeCloseTo(st.axis === "x" ? -40 + st.pos * 0.5 : 100 + st.pos * 0.5, 2);
    expect(f.streets[0].width).toBeCloseTo((st.carriage + 2 * st.sidewalk) * 0.5, 2);
    expect(f.y).toBeGreaterThan(2);
  });
});

// ── Generator: choices, site record, replace ──

function mockEditor() {
  const nodes = new Map<string, { id: string; parentId?: string; name: string; metadata?: Record<string, unknown> }>();
  const scene = { nodes, addNode: (n: { id: string; name: string }) => nodes.set(n.id, n), removeNode: (id: string) => nodes.delete(id), getNode: (id: string) => nodes.get(id) };
  const commands: { execute: (s: typeof scene) => void; undo: (s: typeof scene) => void }[] = [];
  const editor = { scene, execute: (cmd: (typeof commands)[number]) => (commands.push(cmd), cmd.execute(scene)) };
  return { editor, nodes, commands, scene };
}

describe("city generator v2", () => {
  const brief: Brief = { mode: "build", understanding: "A city", tasks: [{ generator: "city", title: "City", params: {} }] };
  const ctxOf = (editor: unknown, prompt = "create a city") => ({
    editor: editor as never,
    prompt,
    brief,
    anchor: { x: 5, z: 5 },
    sites: [] as BuiltSite[],
    step: () => {},
    pause: async () => {},
    callModel: async () => ({ text: "" })
  });

  test("How big? comes first, as a map with the real plans", () => {
    const v = cityGenerator.validate({}, brief) as Record<string, unknown>;
    const qs = cityGenerator.choices!(v, ctxOf({}));
    expect(qs[0].id).toBe("size");
    expect(qs[0].kind).toBe("map");
    expect(qs[0].options.map((o) => o.id)).toEqual(["neighborhood", "town", "city", "metropolis"]);
    expect(qs[0].suggested).toBe("city");
    for (const o of qs[0].options) {
      expect(o.image!.startsWith("data:image/svg+xml")).toBe(true);
      expect(o.hint).toMatch(/^\d x \d blocks, about \d+ x \d+ m$/);
    }
    expect(qs[1].title).toBe("Which character?");
    expect(qs[1].options.map((o) => o.id)).toContain("mixed");
    // A neighborhood has no room for an industrial district: no Mixed option.
    const small = cityGenerator.choices!(v, ctxOf({}, "a small village"));
    expect(small[0].suggested).toBe("neighborhood");
    expect(small[1].options.map((o) => o.id)).not.toContain("mixed");
    expect(cityGenerator.choices!(v, ctxOf({}, "an industrial port city"))[1].suggested).toBe("industrial");
    expect(cityGenerator.describe).toContain("Leave size out unless the user states it: the editor asks with a map.");
  });

  test("run writes a site record; replace rebuilds in place in one undo step", async () => {
    const { editor, nodes, commands } = mockEditor();
    const v = cityGenerator.validate({ size: "town", streetTrees: "birch", kit: "commercial", seed: 3 }, brief) as Record<string, unknown>;
    const first = await cityGenerator.run(v, {}, ctxOf(editor));
    expect(first.summary).toMatch(/^Built a 3 x 3 block town \(downtown\)/);
    expect(first.next!.length).toBeGreaterThanOrEqual(2);
    expect(first.next!.length).toBeLessThanOrEqual(4);
    expect(first.next!.map((n) => n.label)).toContain("Make it bigger");
    expect(first.next!.map((n) => n.label)).toContain("Add an industrial district");

    const sites = readSites(editor as never);
    expect(sites.length).toBe(1);
    const site = sites[0];
    expect(site.generator).toBe("city");
    expect(site.params).toMatchObject({ size: "town", kit: "commercial", streetTrees: "nature:tree:birch", at: { x: 5, z: 5 } });
    expect(site.facts.center).toEqual({ x: 5, z: 5 });
    expect(site.facts.city!.blocks.length).toBe(9);
    expect(site.facts.summary).toMatch(/^3 x 3 blocks, downtown, birch street trees/);
    expect(site.facts.height).toBeGreaterThan(10);
    const oldIds = new Set(nodes.keys());
    const oldName = nodes.get(site.id)!.name;

    // Replace: stored params plus the patch, as run.ts merges them. The anchor differs on purpose.
    const ctx = { ...ctxOf(editor), anchor: { x: 0, z: 0 }, sites, replace: site };
    const raw = { ...site.params, size: "city" };
    const v2 = cityGenerator.validate(raw, brief) as Record<string, unknown>;
    expect(cityGenerator.choices!(v2, ctx)).toEqual([]);
    // ask: the tree question only (run.ts removes the asked keys first).
    const { streetTrees: _drop, ...withoutTrees } = raw;
    const v3 = cityGenerator.validate(withoutTrees, brief) as Record<string, unknown>;
    expect(cityGenerator.choices!(v3, { ...ctx, ask: ["streetTrees"] }).map((q) => q.id)).toEqual(["trees"]);
    expect(cityGenerator.choices!(v2, { ...ctx, ask: ["trees"] }).map((q) => q.id)).toEqual(["trees"]);

    const second = await cityGenerator.run(v2, {}, ctx);
    expect(commands.length).toBe(2);
    expect(second.summary).toMatch(/4 x 4 block city/);
    const after = readSites(editor as never);
    expect(after.length).toBe(1);
    expect(after[0].facts.center).toEqual({ x: 5, z: 5 });
    expect(after[0].params).toMatchObject({ size: "city", streetTrees: "nature:tree:birch" });
    expect(nodes.get(after[0].id)!.name).toBe(oldName);
    for (const id of oldIds) expect(nodes.has(id)).toBe(false);
    expect(second.nodeIds.length).toBe(nodes.size);

    // One undo brings the old city back.
    commands[1].undo(editor.scene as never);
    expect(new Set(nodes.keys())).toEqual(oldIds);
  });
});

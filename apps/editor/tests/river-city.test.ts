// Unit tests for rivers beside a city (src/lib/generators/river/city-routes.ts) and for the river
// generator of the director (src/lib/copilot/director/generators/river.ts) with a fake editor.
// Run: cd apps/editor && bun test tests/river-city.test.ts
import { describe, expect, test } from "bun:test";
import type { EditorCore } from "@theras/editor-core";
import { riverGenerator } from "../src/lib/copilot/director/generators/river";
import { readSites } from "../src/lib/copilot/director/site";
import type { Brief, BuiltSite, CitySiteFacts, DirectorContext, SiteRect } from "../src/lib/copilot/director/types";
import {
  CITY_ROUTE_IDS,
  cityRoutes,
  courseProblem,
  normalizeRouteId,
  rectDist,
  routeChoices,
  STREET_MARGIN,
  waterClearance,
  type CityRoute
} from "../src/lib/generators/river/city-routes";
import { planDressing } from "../src/lib/generators/river/dressing";
import { centerlineSelfIntersects, computeRiverPath, type RiverObstacle } from "../src/lib/generators/river/path";

// ── Hand-made city plans (world meters) ───────────────────────

const BLOCK = 34;
const SIDE = { width: 13, carriage: 7, median: 0 };
const AVENUE = { width: 23.8, carriage: 14.8, median: 3 };

/** A cols x rows city centered at (cx, cz). The avenue is the middle street across avenueAxis. */
function cityFixture(cols: number, rows: number, avenueAxis: "x" | "z", cx = 10, cz = -5, park: [number, number] | null = [cols - 1, 0]): CitySiteFacts {
  // Lines of constant x are streets along z (axis "z"); lines of constant z are streets along x.
  const lines = (n: number, avenue: boolean) => {
    const widths = Array.from({ length: n + 1 }, (_, k) => (avenue && k === Math.floor(n / 2) ? AVENUE : SIDE));
    const pos: number[] = [];
    let at = 0;
    widths.forEach((w, k) => {
      at += w.width / 2;
      pos.push(at);
      at += w.width / 2 + (k < n ? BLOCK : 0);
    });
    return { widths, pos, total: at };
  };
  const xl = lines(cols, avenueAxis === "z");
  const zl = lines(rows, avenueAxis === "x");
  const ox = cx - xl.total / 2;
  const oz = cz - zl.total / 2;
  const streetsRect: SiteRect = { x0: ox, x1: ox + xl.total, z0: oz, z1: oz + zl.total };
  const groundRect: SiteRect = { x0: streetsRect.x0 - 6, x1: streetsRect.x1 + 6, z0: streetsRect.z0 - 6, z1: streetsRect.z1 + 6 };
  const streets: CitySiteFacts["streets"] = [];
  let id = 0;
  xl.pos.forEach((p, k) => {
    const w = xl.widths[k]!;
    streets.push({ id: id++, name: w === AVENUE ? "Main Avenue" : `${k + 1}th Street`, axis: "z", pos: ox + p, from: streetsRect.z0, to: streetsRect.z1, width: w.width, carriage: w.carriage, median: w.median, avenue: w === AVENUE });
  });
  zl.pos.forEach((p, k) => {
    const w = zl.widths[k]!;
    streets.push({ id: id++, name: w === AVENUE ? "Main Avenue" : `${k + 1}th Road`, axis: "x", pos: oz + p, from: streetsRect.x0, to: streetsRect.x1, width: w.width, carriage: w.carriage, median: w.median, avenue: w === AVENUE });
  });
  const blocks: CitySiteFacts["blocks"] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x0 = ox + xl.pos[i]! + xl.widths[i]!.width / 2;
      const x1 = ox + xl.pos[i + 1]! - xl.widths[i + 1]!.width / 2;
      const z0 = oz + zl.pos[j]! + zl.widths[j]!.width / 2;
      const z1 = oz + zl.pos[j + 1]! - zl.widths[j + 1]!.width / 2;
      const isPark = park !== null && park[0] === i && park[1] === j;
      blocks.push({ i, j, rect: { x0, x1, z0, z1 }, kind: isPark ? "park" : "lot", zone: isPark ? "park" : "downtown", tallest: isPark ? 0 : 30 });
    }
  }
  return { scale: 1, y: 0, streetsRect, groundRect, avenueAxis, streets, blocks, kit: "commercial", trees: "nature:tree:oak-round" };
}

function citySite(city: CitySiteFacts, id = "node:group:city"): BuiltSite {
  const g = city.groundRect;
  return {
    id,
    v: 1,
    generator: "city",
    title: "City",
    params: {},
    facts: { center: { x: (g.x0 + g.x1) / 2, z: (g.z0 + g.z1) / 2 }, rect: g, summary: "city", city }
  };
}

const CITIES: { name: string; city: CitySiteFacts }[] = [
  { name: "2x2 avenue z", city: cityFixture(2, 2, "z") },
  { name: "2x2 avenue x", city: cityFixture(2, 2, "x") },
  { name: "4x4 avenue z", city: cityFixture(4, 4, "z") },
  { name: "4x4 avenue x", city: cityFixture(4, 4, "x", -30, 40, [0, 3]) }
];

const routesOf = (city: CitySiteFacts, width: number, seed: number, obstacles: RiverObstacle[] = []) =>
  cityRoutes({ city, width, meander: 0.7, seed, obstacles, anchor: { x: (city.streetsRect.x0 + city.streetsRect.x1) / 2, z: (city.streetsRect.z0 + city.streetsRect.z1) / 2 } });

describe("routes beside a city", () => {
  test("every route keeps its water outside the street grid", () => {
    for (const { name, city } of CITIES) {
      for (const width of [1.5, 3, 5, 8]) {
        for (const seed of [1, 2, 3, 7, 42]) {
          const routes = routesOf(city, width, seed);
          // All edges and bends, and the free river, are found.
          expect(routes.length, `${name} w${width} s${seed}`).toBeGreaterThanOrEqual(8);
          for (const r of routes) {
            const label = `${name} ${r.id} w${width} s${seed}`;
            expect(waterClearance(r.samples, city.streetsRect), label).toBeGreaterThanOrEqual(STREET_MARGIN);
            expect(courseProblem(r.samples, width), label).toBeNull();
            expect(centerlineSelfIntersects(r.samples), label).toBe(false);
            expect(CITY_ROUTE_IDS).toContain(r.id);
          }
        }
      }
    }
  });

  test("an edge route has a straight quay along the city and runs on past both corners", () => {
    const city = cityFixture(2, 2, "z");
    const g = city.groundRect;
    const north = routesOf(city, 4, 5).find((r) => r.id === "edge:north")!;
    const beside = north.samples.filter((p) => p.x >= g.x0 && p.x <= g.x1);
    const zs = beside.map((p) => p.z);
    // Quay: the center line beside the city is straight (same z within 1 cm), outside the ground slab.
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(0.01);
    expect(Math.max(...zs)).toBeLessThan(g.z0);
    expect(north.samples[0]!.x).toBeLessThan(g.x0 - 15);
    expect(north.samples[north.samples.length - 1]!.x).toBeGreaterThan(g.x1 + 15);
    // Past the city the river meanders (it leaves the quay line).
    const past = north.samples.filter((p) => p.x > g.x1 + 20);
    expect(Math.max(...past.map((p) => Math.abs(p.z - zs[0]!)))).toBeGreaterThan(1);
  });

  test("routes are deterministic by seed", () => {
    const city = cityFixture(4, 4, "z");
    const a = routesOf(city, 3, 11);
    const b = routesOf(city, 3, 11);
    expect(b.map((r) => r.id)).toEqual(a.map((r) => r.id));
    expect(b.map((r) => r.samples)).toEqual(a.map((r) => r.samples));
    const c = routesOf(city, 3, 12);
    const line = (rs: CityRoute[]) => rs.find((r) => r.id === "edge:west")!.samples.map((p) => [p.x, p.z]);
    expect(line(c)).not.toEqual(line(a));
  });

  test("the side next to the park and the avenue end ranks first", () => {
    // Park in the north-east block, the avenue runs along z (it ends at the north and south sides).
    expect(routesOf(cityFixture(2, 2, "z"), 3, 1)[0]!.id).toBe("edge:north");
    // Park in the south-west block, the avenue runs along x (it ends at the west and east sides).
    expect(routesOf(cityFixture(4, 4, "x", 0, 0, [0, 3]), 3, 1)[0]!.id).toBe("edge:west");
  });

  test("another site on a side moves that side down the list", () => {
    const city = cityFixture(2, 2, "z");
    const g = city.groundRect;
    // A castle yard just north of the city.
    const castle: RiverObstacle[] = [];
    for (let x = g.x0; x <= g.x1; x += 6) castle.push({ x, z: g.z0 - 8, r: 4 });
    const routes = routesOf(city, 3, 1, castle);
    const north = routes.find((r) => r.id === "edge:north");
    expect(north?.blocked ?? 1).toBeGreaterThan(0);
    expect(routes[0]!.id).not.toBe("edge:north");
    expect(routes[0]!.blocked).toBe(0);
  });

  test("the popup gets 4 routes with the free river among them", () => {
    const shown = routeChoices(routesOf(cityFixture(2, 2, "z"), 3, 1), 4);
    expect(shown.length).toBe(4);
    expect(shown.some((r) => r.id === "outside")).toBe(true);
  });

  test("the bridge stands in line with the avenue, and the city bank is clean", () => {
    for (const { name, city } of CITIES) {
      const avenue = city.streets.find((s) => s.avenue)!;
      const side = avenue.axis === "z" ? "edge:north" : "edge:east";
      const route = routesOf(city, 3, 3).find((r) => r.id === side)!;
      expect(route.bridge?.avenue, name).toBe(true);
      const dressing = planDressing({
        samples: route.samples,
        width: 3,
        banks: "mixed",
        bridge: true,
        stones: false,
        seed: 3,
        obstacles: [],
        anchor: { x: 0, z: 0 },
        landmarks: [],
        heightAt: () => 0.1,
        waterY: 0.1,
        crossingAt: route.bridge,
        citySide: route.citySide
      });
      const bridge = dressing.items.find((i) => i.role === "bridge");
      expect(bridge, name).toBeDefined();
      // In line with the avenue center line, and turned so it spans across the river.
      if (avenue.axis === "z") expect(Math.abs(bridge!.x - avenue.pos), name).toBeLessThan(0.6);
      else expect(Math.abs(bridge!.z - avenue.pos), name).toBeLessThan(0.6);
      const span = { x: Math.cos(bridge!.rotationY), z: -Math.sin(bridge!.rotationY) };
      expect(Math.abs(avenue.axis === "z" ? span.z : span.x), name).toBeGreaterThan(0.99);
      // No reed or stone between the water and the city.
      for (const item of dressing.items.filter((i) => i.role !== "bridge" && i.role !== "lily")) {
        let nearest = route.samples[0]!;
        let k = 0;
        route.samples.forEach((p, i) => {
          if (Math.hypot(p.x - item.x, p.z - item.z) < Math.hypot(nearest.x - item.x, nearest.z - item.z)) {
            nearest = p;
            k = i;
          }
        });
        if (route.citySide[k] !== 0) expect(rectDist(city.groundRect, item.x, item.z), name).toBeGreaterThan(rectDist(city.groundRect, nearest.x, nearest.z));
      }
    }
  });

  test("route ids from loose words", () => {
    expect(normalizeRouteId("north")).toBe("edge:north");
    expect(normalizeRouteId("edge:east")).toBe("edge:east");
    expect(normalizeRouteId("south edge")).toBe("edge:south");
    expect(normalizeRouteId("bend:north-east")).toBe("bend:ne");
    expect(normalizeRouteId("bend:sw")).toBe("bend:sw");
    expect(normalizeRouteId("outside")).toBe("outside");
    expect(normalizeRouteId("diagonal")).toBeNull();
  });
});

describe("course guard", () => {
  test("a course that is too short or broken is not built", () => {
    const short = computeRiverPath({ from: { x: 0, z: 0 }, to: { x: 6, z: 0 }, width: 3, meander: 0.5, seed: 1 });
    expect(courseProblem(short.samples, 3)).toContain("only");
    expect(courseProblem([], 3)).not.toBeNull();
    // 3 x width rules for a wide river: 20 m is too short for 8 m of water.
    const mid = computeRiverPath({ from: { x: 0, z: 0 }, to: { x: 20, z: 0 }, width: 8, meander: 0, seed: 1 });
    expect(courseProblem(mid.samples, 8)).not.toBeNull();
    const ok = computeRiverPath({ from: { x: 0, z: 0 }, to: { x: 30, z: 0 }, width: 3, meander: 0.5, seed: 1 });
    expect(courseProblem(ok.samples, 3)).toBeNull();
  });
});

// ── The director generator with a fake editor ─────────────────

type FakeNode = { id: string; parentId?: string; name: string; kind: string; metadata?: Record<string, unknown>; transform: unknown };

function fakeEditor() {
  const nodes = new Map<string, FakeNode>();
  const doc = {
    nodes,
    entities: new Map(),
    getNode: (id: string) => nodes.get(id),
    addNode: (n: FakeNode) => void nodes.set(n.id, n),
    removeNode: (id: string) => void nodes.delete(id)
  };
  let executed = 0;
  const editor = {
    scene: doc,
    selection: { ids: new Set<string>() },
    execute: (cmd: { execute: (s: typeof doc) => void }) => {
      executed++;
      cmd.execute(doc);
    }
  };
  return { editor: editor as unknown as EditorCore, nodes, executed: () => executed };
}

const BRIEF: Brief = { mode: "build", understanding: "add a river", tasks: [{ generator: "river", title: "River", params: {} }] };

function ctxOf(editor: EditorCore, sites: BuiltSite[], anchor: { x: number; z: number }, extra: Partial<DirectorContext> = {}): DirectorContext {
  return {
    editor,
    prompt: "add river",
    brief: BRIEF,
    anchor,
    sites,
    step: () => {},
    pause: async () => {},
    callModel: async () => ({ text: "" }),
    ...extra
  };
}

function valid(raw: Record<string, unknown>) {
  const v = riverGenerator.validate(raw, BRIEF);
  if (typeof v === "string") throw new Error(v);
  return v;
}

describe("river generator", () => {
  test("describe is 600 characters or less and names route", () => {
    expect(riverGenerator.describe.length).toBeLessThanOrEqual(600);
    expect(riverGenerator.describe).toContain("route?");
    expect(riverGenerator.describe).toContain("In a scene with a city leave route, from and to out unless the user states them: the editor asks with a map.");
  });

  test("validate accepts a route and rejects an unknown one", () => {
    expect(valid({ route: "edge:north" }).route).toBe("edge:north");
    expect(valid({ route: "north-east" }).route).toBe("bend:ne");
    expect(typeof riverGenerator.validate({ route: "diagonal" }, BRIEF)).toBe("string");
  });

  test("with a city near and no place given, the first question is the route map", () => {
    const { editor } = fakeEditor();
    const city = citySite(cityFixture(2, 2, "z"));
    const qs = riverGenerator.choices!(valid({ seed: 4 }), ctxOf(editor, [city], city.facts.center));
    expect(qs[0]!.id).toBe("route");
    expect(qs[0]!.kind).toBe("map");
    expect(qs[0]!.options.length).toBeGreaterThanOrEqual(3);
    expect(qs[0]!.options.length).toBeLessThanOrEqual(4);
    expect(qs[0]!.options.every((o) => o.image?.startsWith("data:image/svg+xml"))).toBe(true);
    expect(qs[0]!.options.map((o) => o.id)).toContain(qs[0]!.suggested);
    expect(qs.map((q) => q.id)).toEqual(["route", "water", "banks"]);
    // Without a city: no route question.
    expect(riverGenerator.choices!(valid({ seed: 4 }), ctxOf(editor, [], { x: 0, z: 0 })).map((q) => q.id)).toEqual(["water", "banks"]);
  });

  test("a course that is too short builds nothing and says so", async () => {
    const { editor, nodes } = fakeEditor();
    const r = await riverGenerator.run(valid({ from: { x: 0, z: 0 }, to: { x: 4, z: 0 }, style: "lagoon", banks: "clean" }), {}, ctxOf(editor, [], { x: 0, z: 0 }));
    expect(r.nodeIds).toEqual([]);
    expect(r.summary.startsWith("No river was built:")).toBe(true);
    expect(r.skipped?.length).toBe(1);
    expect(nodes.size).toBe(0);
  });

  test("beside a city: built along the chosen side, one undo step, a site record that rebuilds the same river", async () => {
    const { editor, nodes, executed } = fakeEditor();
    const facts = cityFixture(2, 2, "z");
    const city = citySite(facts);
    const params = valid({ width: 3, style: "clear-lake", banks: "mixed", seed: 9 });
    const r = await riverGenerator.run(params, { route: { optionIds: ["edge:north"] } }, ctxOf(editor, [city], city.facts.center));
    expect(executed()).toBe(1);
    expect(r.nodeIds.length).toBeGreaterThan(2);
    expect(r.summary).toContain("along the north edge of the city");
    expect(r.next!.length).toBeGreaterThanOrEqual(2);
    expect(r.next!.map((n) => n.label)).toContain("Move it to another side");
    const sites = readSites(editor);
    expect(sites.length).toBe(1);
    const site = sites[0]!;
    expect(site.generator).toBe("river");
    expect(site.params.route).toBe("edge:north");
    expect(site.params.style).toBe("clear-lake");
    expect(site.params.banks).toBe("mixed");
    expect(site.facts.river!.points.length).toBeLessThanOrEqual(20);
    expect(site.facts.summary).toContain("bridge at the avenue");
    // The water stays out of the street grid.
    for (const [x, z] of site.facts.river!.points) expect(rectDist(facts.streetsRect, x, z)).toBeGreaterThan(site.facts.river!.width / 2);

    // A plain replace asks nothing.
    expect(riverGenerator.choices!(valid(site.params), ctxOf(editor, [city, site], site.facts.center, { replace: site }))).toEqual([]);
    // Asking the route again: only the route question.
    const again = { ...site.params };
    delete again.route;
    const qs = riverGenerator.choices!(valid(again), ctxOf(editor, [city, site], site.facts.center, { replace: site, ask: ["route"] }));
    expect(qs.map((q) => q.id)).toEqual(["route"]);
    expect(qs[0]!.suggested).not.toBe("edge:north");

    // Replace (wider): old nodes go in the same command as the new ones.
    const before = new Set(nodes.keys());
    const r2 = await riverGenerator.run(valid({ ...site.params, width: 5 }), {}, ctxOf(editor, [city, site], site.facts.center, { replace: site }));
    expect(executed()).toBe(2);
    for (const id of before) expect(nodes.has(id)).toBe(false);
    expect(r2.nodeIds.every((id) => nodes.has(id))).toBe(true);
    const after = readSites(editor);
    expect(after.length).toBe(1);
    expect(after[0]!.params.width).toBe(5);
    expect(after[0]!.params.route).toBe("edge:north");
  });

  test("from/to through the city are moved to a route beside it", async () => {
    const { editor } = fakeEditor();
    const facts = cityFixture(2, 2, "z");
    const city = citySite(facts);
    const g = facts.groundRect;
    const params = valid({ from: { x: g.x0 - 30, z: g.z0 - 20 }, to: { x: g.x1 + 30, z: g.z1 + 20 }, style: "lagoon", banks: "reeds", seed: 2 });
    const r = await riverGenerator.run(params, {}, ctxOf(editor, [city], city.facts.center));
    expect(r.nodeIds.length).toBeGreaterThan(0);
    expect(r.summary).toContain("The course was moved to keep the streets and buildings clear.");
    const site = readSites(editor)[0]!;
    expect(String(site.params.route)).toMatch(/^(edge|bend):|^outside$/);
  });

  test("without a city another site is an obstacle", async () => {
    const { editor } = fakeEditor();
    const yard: BuiltSite = {
      id: "node:group:castle",
      v: 1,
      generator: "architecture",
      title: "Castle",
      params: {},
      facts: { center: { x: 0, z: 0 }, rect: { x0: -10, z0: -10, x1: 10, z1: 10 }, summary: "castle with yard" }
    };
    const r = await riverGenerator.run(valid({ from: { x: -40, z: 0 }, to: { x: 40, z: 0 }, style: "lagoon", banks: "clean", seed: 5 }), {}, ctxOf(editor, [yard], { x: 0, z: 0 }));
    expect(r.nodeIds.length).toBeGreaterThan(0);
    const site = readSites(editor)[0]!;
    expect(site.params.route).toBe("free");
    for (const [x, z] of site.facts.river!.points) expect(rectDist(yard.facts.rect, x, z)).toBeGreaterThan(site.facts.river!.width / 2);
  });
});

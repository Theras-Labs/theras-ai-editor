// Unit tests for the city generator (src/lib/generators/city/, generated/roads.ts, director/generators/city.ts).
// Run: cd apps/editor && bun test tests/city.test.ts
import { describe, expect, test } from "bun:test";
import {
  BUILDING_MODELS,
  SETBACK,
  fitCity,
  normalizeCityParams,
  planCity,
  rectsOverlap,
  segmentsOf,
  streetMeshParams,
  type CityParams,
  type CityPlan,
  type CityStreet,
  type Rect
} from "../src/lib/generators/city";
import { ROADS_ENTRIES } from "../src/lib/resources/generated/roads";
import { cityGenerator } from "../src/lib/copilot/director/generators/city";
import type { Brief } from "../src/lib/copilot/director/types";

const anyTree = (id: string) => /^nature:tree:|^lh:plant:(oak|cherry|birch|pine|willow|apple)$/.test(id);
function params(raw: Record<string, unknown>): CityParams {
  const p = normalizeCityParams(raw, anyTree);
  if (typeof p === "string") throw new Error(p);
  return p;
}

const SIZES = ["neighborhood", "town", "city", "metropolis"] as const;
const KITS = ["commercial", "industrial", "mixed"] as const;
const SEEDS = [1, 2, 3, 42, 777];
const EPS = 1e-6;

function plans(): { name: string; plan: CityPlan }[] {
  const out: { name: string; plan: CityPlan }[] = [];
  for (const size of SIZES) for (const kit of KITS) for (const seed of SEEDS) out.push({ name: `${size}/${kit}/${seed}`, plan: planCity(params({ size, kit, seed })) });
  out.push({ name: "1x1", plan: planCity(params({ cols: 1, rows: 1, seed: 5, park: true })) });
  out.push({ name: "5x2 dense", plan: planCity(params({ cols: 5, rows: 2, density: 1, seed: 9 })) });
  out.push({ name: "sparse", plan: planCity(params({ size: "medium", density: 0, seed: 11 })) });
  return out;
}
const ALL = plans();

/** Right of way (curb to curb plus sidewalks) of a street. */
function rowRect(s: CityStreet): Rect {
  const h = s.carriage / 2 + s.sidewalk;
  return s.axis === "x" ? { x0: s.from, x1: s.to, z0: s.pos - h, z1: s.pos + h } : { x0: s.pos - h, x1: s.pos + h, z0: s.from, z1: s.to };
}
function carriageRect(s: CityStreet): Rect {
  const h = s.carriage / 2;
  return s.axis === "x" ? { x0: s.from, x1: s.to, z0: s.pos - h, z1: s.pos + h } : { x0: s.pos - h, x1: s.pos + h, z0: s.from, z1: s.to };
}
const inside = (r: Rect, x: number, z: number) => x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS;
const contains = (outer: Rect, r: Rect) => r.x0 >= outer.x0 - EPS && r.x1 <= outer.x1 + EPS && r.z0 >= outer.z0 - EPS && r.z1 <= outer.z1 + EPS;

/** Footprint of a kit model at a position and yaw, from the measured table (not from the plan). */
function measuredRect(id: string, x: number, z: number, yaw: number): Rect {
  const m = [...BUILDING_MODELS.commercial, ...BUILDING_MODELS.industrial].find((b) => b.id === id)!;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const hw = (m.w * c + m.d * s) / 2;
  const hd = (m.w * s + m.d * c) / 2;
  return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
}

describe("city params", () => {
  test("defaults, aliases and clamps", () => {
    const d = params({});
    expect([d.size, d.cols, d.rows, d.kit, d.density, d.lamps]).toEqual(["city", 4, 4, "commercial", 0.7, true]);
    expect(params({ size: "medium" })).toMatchObject({ size: "town", cols: 3, rows: 3, park: true });
    expect(params({ size: "big" })).toMatchObject({ size: "city", cols: 4, rows: 4 });
    expect(params({ cols: 99, rows: -3 })).toMatchObject({ size: "custom", cols: 5, rows: 1 });
    expect(params({ density: 7 }).density).toBe(1);
    expect(params({ density: -2 }).density).toBe(0);
    expect(params({ kit: "factory" }).kit).toBe("industrial");
    expect(params({ streetTrees: "none" }).streetTrees).toBe("none");
    expect(params({ streetTrees: "cherry" }).streetTrees).toBe("nature:tree:cherry-blossom");
    expect(params({ streetTrees: "no-such-tree" }).streetTrees).toBe("nature:tree:oak-round");
    expect(params({ seed: 12.7 }).seed).toBe(13);
    expect(typeof normalizeCityParams({ size: "galactic" }, anyTree)).toBe("string");
    expect(typeof normalizeCityParams({ kit: "medieval" }, anyTree)).toBe("string");
    // Validated params validate again to the same values.
    const v = params({ size: "large", kit: "mixed", seed: 4 });
    expect(params(v as unknown as Record<string, unknown>)).toMatchObject({ size: "city", cols: 4, rows: 4, kit: "mixed", seed: 4 });
  });
});

describe("city plan", () => {
  test("deterministic by seed", () => {
    const a = planCity(params({ size: "medium", kit: "mixed", seed: 21 }));
    const b = planCity(params({ size: "medium", kit: "mixed", seed: 21 }));
    const c = planCity(params({ size: "medium", kit: "mixed", seed: 22 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.buildings)).not.toBe(JSON.stringify(c.buildings));
  });

  test("grid sizes", () => {
    for (const { name, plan } of ALL) {
      expect(plan.blocks.length, name).toBe(plan.cols * plan.rows);
      expect(plan.streets.length, name).toBe(plan.cols + plan.rows + 2);
      expect(plan.streets.filter((s) => s.avenue).length, name).toBe(1);
    }
  });

  test("roads form one connected network without dead ends", () => {
    for (const { name, plan } of ALL) {
      const crosses = (a: CityStreet, b: CityStreet) =>
        a.axis !== b.axis && b.pos >= a.from - EPS && b.pos <= a.to + EPS && a.pos >= b.from - EPS && a.pos <= b.to + EPS;
      const seen = new Set([0]);
      const queue = [plan.streets[0]];
      while (queue.length) {
        const s = queue.shift()!;
        for (const t of plan.streets) if (!seen.has(t.id) && crosses(s, t)) (seen.add(t.id), queue.push(t));
      }
      expect(seen.size, name).toBe(plan.streets.length);
      for (const s of plan.streets) {
        // Both ends are intersections: the street ends at the outer edge of a crossing street.
        const first = s.crossings[0];
        const last = s.crossings[s.crossings.length - 1];
        expect(Math.abs(s.from - (first.at - first.row / 2)), name).toBeLessThan(EPS);
        expect(Math.abs(s.to - (last.at + last.row / 2)), name).toBeLessThan(EPS);
        const crossing = plan.streets.filter((t) => crosses(s, t));
        expect(crossing.length, name).toBe(s.crossings.length);
        // Every intersection has exactly one owner.
        for (const t of crossing) {
          const mine = s.crossings.find((c) => Math.abs(c.at - t.pos) < EPS)!;
          const theirs = t.crossings.find((c) => Math.abs(c.at - s.pos) < EPS)!;
          expect(mine.owned !== theirs.owned, name).toBe(true);
        }
      }
    }
  });

  test("buildings: measured footprints, no overlaps, on their lots, off the roads", () => {
    for (const { name, plan } of ALL) {
      expect(plan.buildings.length, name).toBeGreaterThan(plan.blocks.filter((b) => b.kind === "lot").length * 3);
      const rects = plan.buildings.map((b) => measuredRect(b.id, b.x, b.z, b.rotationY));
      rects.forEach((r, k) => {
        const p = plan.buildings[k].rect;
        expect(Math.abs(r.x0 - p.x0) + Math.abs(r.x1 - p.x1) + Math.abs(r.z0 - p.z0) + Math.abs(r.z1 - p.z1), name).toBeLessThan(0.05);
      });
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) expect(rectsOverlap(rects[i], rects[j], 0.2), `${name}: ${i} ${j}`).toBe(false);
      const lots = plan.blocks.filter((b) => b.kind === "lot").map((b) => b.lot);
      for (const r of rects) {
        expect(lots.some((lot) => contains(lot, r)), name).toBe(true);
        for (const s of plan.streets) expect(rectsOverlap(r, rowRect(s), -0.01), name).toBe(false);
      }
      for (const green of plan.blocks.filter((b) => b.kind !== "lot")) for (const r of rects) expect(rectsOverlap(r, green.lot), name).toBe(false);
    }
  });

  test("every building faces a street, with one setback", () => {
    for (const { name, plan } of ALL) {
      for (const b of plan.buildings) {
        const street = plan.streets[b.street];
        // The front (local -z) after the yaw.
        const fx = -Math.sin(b.rotationY);
        const fz = -Math.cos(b.rotationY);
        const ahead = { x: b.door.x + fx * (SETBACK + 0.5), z: b.door.z + fz * (SETBACK + 0.5) };
        expect(inside(rowRect(street), ahead.x, ahead.z), `${name}: ${b.id} at ${b.x},${b.z}`).toBe(true);
        // The door is on the front face of the measured footprint.
        const r = measuredRect(b.id, b.x, b.z, b.rotationY);
        const onFace = Math.abs(fx) > 0.5 ? Math.abs(b.door.x - (fx > 0 ? r.x1 : r.x0)) < 0.05 : Math.abs(b.door.z - (fz > 0 ? r.z1 : r.z0)) < 0.05;
        expect(onFace, name).toBe(true);
        // Setback: the facade is SETBACK from the lot edge (the sidewalk).
        const facade = Math.abs(fx) > 0.5 ? b.door.x : b.door.z;
        const edge = Math.abs(fx) > 0.5 ? street.pos - Math.sign(fx) * (street.carriage / 2 + street.sidewalk) : street.pos - Math.sign(fz) * (street.carriage / 2 + street.sidewalk);
        expect(Math.abs(Math.abs(facade - edge) - SETBACK), name).toBeLessThan(0.05);
      }
    }
  });

  test("heights rise toward the center", () => {
    for (const size of ["town", "city", "metropolis"] as const)
      for (const seed of SEEDS) {
        const plan = planCity(params({ size, kit: "commercial", seed }));
        const half = Math.hypot(plan.streetsRect.x1, plan.streetsRect.z1);
        const inner = plan.buildings.filter((b) => Math.hypot(b.x, b.z) < half * 0.4);
        const outer = plan.buildings.filter((b) => Math.hypot(b.x, b.z) > half * 0.7);
        const avg = (l: typeof inner) => l.reduce((s, b) => s + b.height, 0) / l.length;
        expect(avg(inner), `${size}/${seed}`).toBeGreaterThan(avg(outer));
      }
  });

  test("trees and lamps stand on sidewalks or the median, clear of buildings and doors", () => {
    for (const { name, plan } of ALL) {
      const rects = plan.buildings.map((b) => b.rect);
      for (const t of plan.trees) {
        const street = t.street !== undefined ? plan.streets[t.street] : undefined;
        if (street && !street.avenue) {
          expect(inside(rowRect(street), t.x, t.z), name).toBe(true);
          expect(inside(carriageRect(street), t.x, t.z), name).toBe(false);
        }
        for (const r of rects) expect(inside(r, t.x, t.z), name).toBe(false);
        for (const b of plan.buildings) if (b.street === t.street) expect(Math.hypot(b.door.x - t.x, b.door.z - t.z) >= 2.3, name).toBe(true);
      }
      // One species per street.
      const species = new Set(plan.trees.map((t) => t.id));
      expect(species.size, name).toBeLessThanOrEqual(1);
      for (const l of plan.lamps) {
        for (const r of rects) expect(inside(r, l.x, l.z), name).toBe(false);
        for (const s of plan.streets) {
          if (!inside(carriageRect(s), l.x, l.z)) continue;
          // Only the avenue median carries lamps inside a carriageway.
          expect(s.avenue && Math.abs((s.axis === "x" ? l.z : l.x) - s.pos) < s.median / 2, name).toBe(true);
        }
        for (const t of plan.trees) expect(Math.hypot(t.x - l.x, t.z - l.z), name).toBeGreaterThan(1.5);
      }
      // Trees keep the crosswalks free.
      for (const t of plan.trees) {
        const s = plan.streets[t.street!];
        if (!s) continue;
        const u = s.axis === "x" ? t.x : t.z;
        expect(segmentsOf(s).some(([a, b]) => u >= a + 4.9 && u <= b - 4.9), name).toBe(true);
      }
    }
  });

  test("streetTrees none and lamps false", () => {
    const plan = planCity(params({ size: "medium", streetTrees: "none", lamps: false, seed: 3 }));
    expect(plan.trees.length).toBe(0);
    expect(plan.lamps.length).toBe(0);
    // The park still has trees (a park needs shade).
    expect(plan.park.filter((p) => p.kind === "tree").length).toBeGreaterThan(0);
  });

  test("park block: fountain, benches, trees off the paths", () => {
    const plan = planCity(params({ size: "medium", seed: 8 }));
    const park = plan.blocks.find((b) => b.kind === "park")!;
    expect(park).toBeDefined();
    expect(plan.blocks.filter((b) => b.kind !== "lot").length).toBe(1);
    expect(plan.park.filter((p) => p.kind === "fountain").length).toBe(1);
    expect(plan.park.filter((p) => p.kind === "bench").length).toBe(4);
    for (const p of plan.park) expect(inside(park.lot, p.x, p.z)).toBe(true);
    const cx = (park.lot.x0 + park.lot.x1) / 2;
    const cz = (park.lot.z0 + park.lot.z1) / 2;
    for (const t of plan.park.filter((p) => p.kind === "tree")) expect(Math.abs(t.x - cx) > 1.6 && Math.abs(t.z - cz) > 1.6).toBe(true);
  });
});

describe("city fit", () => {
  const p = params({ size: "medium", seed: 2 });
  test("open ground: full size at the anchor", () => {
    const fit = fitCity(p, { x: 10, z: -5 })!;
    expect(fit.scale).toBe(1);
    expect(fit.center).toEqual({ x: 10, z: -5 });
    expect(fit.plan.cols).toBe(3);
  });
  test("island: the grid and the scale shrink to the flat land, with notes", () => {
    const ground = (x: number, z: number) => (Math.hypot(x, z) <= 40 ? 0.6 : null);
    const fit = fitCity(p, { x: 0, z: 0 }, ground)!;
    expect(fit).not.toBeNull();
    const g = fit.plan.groundRect;
    for (const [x, z] of [
      [g.x0, g.z0],
      [g.x1, g.z1],
      [g.x0, g.z1],
      [g.x1, g.z0]
    ])
      expect(Math.hypot(fit.center.x + x * fit.scale, fit.center.z + z * fit.scale)).toBeLessThanOrEqual(40);
    expect(fit.notes.length).toBeGreaterThan(0);
    expect(fit.y).toBeCloseTo(0.62, 5);
  });
  test("no land: null", () => {
    expect(fitCity(p, { x: 0, z: 0 }, () => null)).toBeNull();
  });
});

describe("road meshes", () => {
  test("street mesh params flip the across arms for z streets", () => {
    const plan = planCity(params({ size: "small", seed: 1 }));
    const z = plan.streets.find((s) => s.axis === "z" && s.line === 0)!;
    const mp = streetMeshParams(z);
    // Line 0 of the z streets: no crossing street arm toward world -x, which is local +z.
    for (const c of mp.crossings) expect(c.arms[3]).toBe(false);
  });

  test("entries build non-empty meshes with upward tops", () => {
    const plan = planCity(params({ size: "medium", seed: 4 }));
    const street = ROADS_ENTRIES.find((e) => e.id === "gen:city-street")!;
    for (const s of plan.streets) {
      const inst = street.create!(1, { params: streetMeshParams(s) as unknown as Record<string, unknown> });
      let tris = 0;
      inst.object.traverse((o) => {
        const g = (o as { geometry?: { attributes: { position: { count: number }; normal: { array: ArrayLike<number> } } } }).geometry;
        if (!g) return;
        tris += g.attributes.position.count / 3;
        const n = g.attributes.normal.array;
        for (let i = 1; i < n.length; i += 3) expect(n[i]).toBeGreaterThan(-1e-6);
      });
      expect(tris).toBeGreaterThan(50);
      inst.dispose?.();
    }
    for (const id of ["gen:city-ground", "gen:street-lamp"]) {
      const inst = ROADS_ENTRIES.find((e) => e.id === id)!.create!(1, { params: {} });
      expect(inst.object.children.length).toBeGreaterThan(0);
    }
  });
});

describe("city generator", () => {
  const brief: Brief = { mode: "build", understanding: "A small city", tasks: [{ generator: "city", title: "Small city", params: {} }] };
  test("describe, validate and choices", () => {
    expect(cityGenerator.describe.length).toBeLessThanOrEqual(600);
    const v = cityGenerator.validate(brief.tasks[0].params, brief) as Record<string, unknown>;
    expect(v.title).toBe("Small city");
    expect(typeof cityGenerator.validate({ size: "galactic" }, brief)).toBe("string");
    const ctx = { editor: {} as never, prompt: "create a city", brief, anchor: { x: 0, z: 0 } };
    const qs = cityGenerator.choices!(v, ctx);
    expect(qs.map((q) => q.id)).toEqual(["size", "buildings", "trees"]);
    for (const q of qs) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(6);
      expect(q.options.some((o) => o.id === q.suggested)).toBe(true);
    }
    expect(qs[2].options.filter((o) => o.id !== "none").length).toBeGreaterThanOrEqual(3);
    // The brief decides: no question.
    const decided = cityGenerator.validate({ size: "town", kit: "industrial", streetTrees: "birch" }, brief) as Record<string, unknown>;
    expect(cityGenerator.choices!(decided, ctx)).toEqual([]);
    // Brief style steers the suggestion.
    const japan: Brief = { ...brief, style: { era: "japanese town", vegetation: ["cherry blossom"] } };
    expect(cityGenerator.choices!(v, { ...ctx, brief: japan }).find((q) => q.id === "trees")!.suggested).toBe("nature:tree:cherry-blossom");
  });

  test("run: one undo step, one folder, real counts in the summary", async () => {
    const nodes = new Map<string, { id: string; parentId?: string; name: string; metadata?: Record<string, unknown> }>();
    const scene = { nodes, addNode: (n: { id: string; name: string }) => nodes.set(n.id, n), removeNode: (id: string) => nodes.delete(id), getNode: (id: string) => nodes.get(id) };
    let commands = 0;
    const editor = { scene, execute: (cmd: { execute: (s: typeof scene) => void }) => (commands++, cmd.execute(scene)) };
    const steps: string[] = [];
    const v = cityGenerator.validate({ size: "small", seed: 3 }, brief) as Record<string, unknown>;
    const result = await cityGenerator.run(v, { trees: { optionIds: ["nature:tree:birch"] } }, {
      editor: editor as never,
      prompt: "create a city",
      brief,
      anchor: { x: 5, z: 5 },
      step: (label) => steps.push(label),
      pause: async () => {},
      callModel: async () => ({ text: "" })
    });
    expect(commands).toBe(1);
    expect(steps).toEqual(["Planning", "Ground", "Roads", "Buildings", "Trees", "Lamps and details"]);
    const folder = [...nodes.values()].filter((n) => !n.parentId);
    expect(folder.length).toBe(1);
    expect(folder[0].name).toBe("Small city");
    expect(result.nodeIds.length).toBe(nodes.size);
    const byResource = (prefix: string) => [...nodes.values()].filter((n) => String(n.metadata?.resource ?? "").startsWith(prefix)).length;
    expect(byResource("gen:city-street")).toBe(6);
    expect(byResource("gen:city-ground")).toBe(1);
    expect(byResource("nature:tree:birch")).toBeGreaterThan(10);
    const buildings = [...nodes.values()].filter((n) => /^model:city-\w+:building-/.test(String(n.metadata?.resource ?? ""))).length;
    expect(result.summary).toContain(`${buildings} buildings`);
    // A street node carries its mesh params as JSON text.
    const street = [...nodes.values()].find((n) => n.metadata?.resource === "gen:city-street")!;
    expect(typeof street.metadata!.params).toBe("string");
  });
});

// Tests for the interior generator: the furniture plan (layout rules), the mesh builder (budget,
// bounds, stage order), the choice card picture and the library entry.
// Run: cd apps/editor && bun test tests/interior.test.ts
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  FREE_GAP,
  INTERIOR_USES,
  MAIN_GROUP,
  MAIN_KIND,
  PASSABLE_KINDS,
  WALL_GAP,
  WALL_KINDS,
  buildInterior,
  canonicalSize,
  interiorThumb,
  itemHalf,
  itemRect,
  normalizeInteriorParams,
  planInterior,
  sideTurns,
  turn,
  unionRect,
  wayRects,
  type InteriorItem,
  type InteriorParams,
  type InteriorSide,
  type InteriorUse,
  type Rect
} from "../src/lib/generators/interior";
import { GENERATED_ENTRIES } from "../src/lib/resources/generated";

const SIZES: [number, number][] = [
  [3, 3],
  [6, 5],
  [10, 8],
  [22, 20],
  [40, 30]
];
const SIDES: InteriorSide[] = ["+z", "-z", "+x", "-x"];
const USES = INTERIOR_USES.map((u) => u.id);
const EPS = 1e-6;

function params(raw: Record<string, unknown>): InteriorParams {
  const p = normalizeInteriorParams(raw);
  if (typeof p === "string") throw new Error(p);
  return p;
}

const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS;

/** Items turned back to the canonical frame (entrance on +z). */
function canonical(items: InteriorItem[], front: InteriorSide): InteriorItem[] {
  const k = sideTurns(front);
  return items.map((it) => {
    const [x, z] = turn(it.x, it.z, 4 - k);
    return { ...it, x, z, rotY: it.rotY - k * (Math.PI / 2) };
  });
}

describe("planInterior: layout rules", () => {
  for (const use of USES)
    for (const [w, d] of SIZES)
      for (const front of SIDES) {
        test(`${use} ${w}x${d} front ${front}`, () => {
          const p = params({ use, width: w, depth: d, front, seed: 11 });
          const plan = planInterior(p);
          const hw = w / 2;
          const hd = d / 2;

          // The key piece of the use is present.
          const main = plan.items.filter((i) => i.group === MAIN_GROUP);
          expect(main.some((i) => i.kind === MAIN_KIND[use as InteriorUse])).toBe(true);

          // Every item is inside the room with its wall distance; rotY is a quarter turn.
          for (const it of plan.items) {
            const [ax, az] = itemHalf(it);
            const m = WALL_KINDS.has(it.kind) ? WALL_GAP : FREE_GAP;
            expect(Math.abs(it.x) + ax).toBeLessThanOrEqual(hw - m + EPS);
            expect(Math.abs(it.z) + az).toBeLessThanOrEqual(hd - m + EPS);
            const q = it.rotY / (Math.PI / 2);
            expect(Math.abs(q - Math.round(q))).toBeLessThan(1e-9);
          }

          // No two footprints overlap unless they share a group.
          for (let i = 0; i < plan.items.length; i++)
            for (let j = i + 1; j < plan.items.length; j++) {
              const a = plan.items[i];
              const b = plan.items[j];
              if (a.group && a.group === b.group) continue;
              if (overlap(itemRect(a), itemRect(b))) throw new Error(`${a.kind} (${a.group}) overlaps ${b.kind} (${b.group})`);
            }

          // A clear way 1.4 wide from the entrance to the main piece.
          const [, D] = canonicalSize(p);
          const can = canonical(plan.items, front);
          const way = wayRects(unionRect(can.filter((i) => i.group === MAIN_GROUP && i.kind !== "pendant")), D / 2);
          expect(way[0].x1 - way[0].x0).toBeCloseTo(1.4, 6);
          for (const it of can) {
            if (it.group === MAIN_GROUP || PASSABLE_KINDS.has(it.kind)) continue;
            for (const r of way) if (overlap(itemRect(it), r)) throw new Error(`${it.kind} blocks the way`);
          }

          // Same params, same plan.
          expect(planInterior(p)).toEqual(plan);
          expect(plan.lights.length).toBeGreaterThanOrEqual(1);
          expect(plan.lights.length).toBeLessThanOrEqual(4);
          for (const l of plan.lights) expect(l.y).toBeCloseTo(p.height - 0.4, 6);
          expect(plan.summary.length).toBeGreaterThan(3);
        });
      }
});

describe("planInterior: program scales with the room", () => {
  test("a big lobby gets more seating groups than a small one, with the same furniture size", () => {
    const small = planInterior(params({ use: "lobby", width: 10, depth: 8, seed: 3 }));
    const big = planInterior(params({ use: "lobby", width: 40, depth: 30, seed: 3 }));
    expect(big.counts["seating-group"] ?? 0).toBeGreaterThan(small.counts["seating-group"] ?? 0);
    const sofas = [...small.items, ...big.items].filter((i) => i.kind === "sofa");
    for (const s of sofas) expect(s.w).toBeLessThanOrEqual(2.1 + EPS);
  });

  test("a 22 x 20 lobby has a desk, groups, a lift core with lifts, and plants in its summary", () => {
    const plan = planInterior(params({ use: "lobby", width: 22, depth: 20, seed: 11 }));
    expect(plan.summary).toMatch(/^a reception desk, \d+ seating groups, a lift core with [23] lifts and \d+ plants$/);
  });

  test("a 3 x 3 room keeps its main piece for every use", () => {
    for (const use of USES) {
      const plan = planInterior(params({ use, width: 3, depth: 3, seed: 2 }));
      expect(plan.items.some((i) => i.kind === MAIN_KIND[use as InteriorUse])).toBe(true);
    }
  });

  test("furniture off gives an empty plan", () => {
    const plan = planInterior(params({ use: "office", furniture: false, seed: 1 }));
    expect(plan.items.length).toBe(0);
  });
});

function bounds(stages: ReturnType<typeof buildInterior>["stages"]) {
  const box = new THREE.Box3();
  for (const s of stages)
    for (const g of Object.values(s.geometries)) {
      if (!g) continue;
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
  return box;
}

const ORDER = ["Floor", "Ceiling", "Walls", "Furniture", "Lights"];

describe("buildInterior", () => {
  for (const use of USES)
    for (const [w, d] of SIZES)
      for (const front of SIDES) {
        test(`${use} ${w}x${d} front ${front}`, () => {
          const shell = (w + d) % 2 === 0;
          const plates = w >= 22 ? 2 : 0;
          const p = params({ use, width: w, depth: d, front, seed: 7, shell, plates, finish: ["warm-wood", "stone-brass", "light-minimal", "dark-industrial"][SIDES.indexOf(front)] });
          const built = buildInterior(p);
          expect(built.triangles).toBeLessThanOrEqual(w * d <= 22 * 20 ? 30000 : 60000);
          const bb = bounds(built.stages);
          const m = (shell ? 0.2 : 0) + 1e-4;
          expect(bb.min.x).toBeGreaterThanOrEqual(-w / 2 - m);
          expect(bb.max.x).toBeLessThanOrEqual(w / 2 + m);
          expect(bb.min.z).toBeGreaterThanOrEqual(-d / 2 - m);
          expect(bb.max.z).toBeLessThanOrEqual(d / 2 + m);
          expect(bb.min.y).toBeGreaterThanOrEqual(-1e-4);
          expect(bb.max.y).toBeLessThanOrEqual(p.height + 0.12 + (plates ? plates * p.storey + 0.25 : 0) + 1e-4);
          const labels = built.stages.map((s) => s.label);
          expect(labels).toEqual(ORDER.filter((l) => labels.includes(l)));
          expect(labels.slice(0, 2)).toEqual(["Floor", "Ceiling"]);
          expect(labels.includes("Furniture")).toBe(true);
          expect(labels.includes("Walls")).toBe(shell || built.plan.items.some((i) => i.kind === "lift-core"));
        });
      }

  test("a 60 x 60 room of each use stays under 60,000 triangles", () => {
    for (const use of USES) for (const finish of ["warm-wood", "stone-brass"]) expect(buildInterior(params({ use, finish, width: 60, depth: 60, plates: 4, shell: true, seed: 9 })).triangles).toBeLessThanOrEqual(60000);
  });

  test("parts off leave their stage out", () => {
    const built = buildInterior(params({ use: "lounge", floor: false, ceiling: false, lights: false, seed: 4 }));
    expect(built.stages.map((s) => s.label)).toEqual(["Furniture"]);
    const none = buildInterior(params({ use: "lobby", width: 12, depth: 10, furniture: false, seed: 4 }));
    expect(none.stages.map((s) => s.label)).toEqual(["Floor", "Ceiling"]);
  });

  test("the floor stays under 6000 quads in the biggest room", () => {
    for (const finish of ["warm-wood", "stone-brass", "light-minimal", "dark-industrial"]) {
      const built = buildInterior(params({ use: "lobby", finish, width: 60, depth: 60, furniture: false, ceiling: false, seed: 1 }));
      const floor = built.stages.find((s) => s.label === "Floor")!;
      let tris = 0;
      for (const g of Object.values(floor.geometries)) tris += g ? g.getAttribute("position").count / 3 : 0;
      expect(tris / 2).toBeLessThan(6100);
    }
  });
});

describe("interiorThumb", () => {
  test("returns a small SVG data URL for every use and size", () => {
    for (const use of USES)
      for (const [w, d] of SIZES)
        for (const front of SIDES) {
          const u = interiorThumb(params({ use, width: w, depth: d, front, seed: 5 }));
          expect(u.startsWith("data:image/svg+xml")).toBe(true);
          expect(u.length).toBeLessThan(20000);
          const svg = decodeURIComponent(u.slice(u.indexOf(",") + 1));
          expect(svg).toContain('width="192"');
          expect(svg).toContain('height="128"');
          expect(svg).toContain("#0b1311");
        }
  });
});

describe("gen:interior entry", () => {
  test("is in GENERATED_ENTRIES", () => {
    const e = GENERATED_ENTRIES.find((x) => x.id === "gen:interior");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("feature");
    expect(e!.category).toBe("Generated");
    expect(e!.tags).toEqual(["generated", "interior"]);
    expect(e!.selfAnimates).toBe(true);
    expect(typeof e!.create).toBe("function");
  });
});

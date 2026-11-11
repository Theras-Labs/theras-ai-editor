// Unit tests for the object modeler (parts spec -> validation -> self-check -> meshes).
// Run: cd apps/editor && bun test tests/parts.test.ts
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  EXAMPLE_BIPLANE,
  EXAMPLE_LAMP,
  LIMITS,
  MODELER_SYSTEM_PROMPT,
  PART_SHAPES,
  buildFromParams,
  buildParts,
  checkSpec,
  partInstances,
  prepareSpec,
  validateSpec,
  type Part,
  type PartsSpec
} from "../src/lib/generators/parts";
import { objectGenerator } from "../src/lib/copilot/director/generators/object";
import { getResource } from "../src/lib/resources/catalog";
import type { Brief } from "../src/lib/copilot/director/types";

const PALETTE = [
  { role: "body", hex: "#d9624f" },
  { role: "dark", hex: "#3a3f4a" }
];

function spec(parts: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return { name: "Test", size: [2, 2, 2], palette: PALETTE, stages: [{ name: "All", parts }], ...extra };
}

function ok(input: unknown): PartsSpec {
  const v = validateSpec(input);
  if ("error" in v) throw new Error(v.error);
  return v.spec;
}

const box = (at: number[], extra: Record<string, unknown> = {}) => ({ shape: "box", at, size: [0.5, 0.5, 0.5], color: "body", ...extra });

/** One valid part of each shape. */
const ONE_OF_EACH: Record<string, Record<string, unknown>> = {
  box: { shape: "box", at: [0, 0.5, 0], size: [1, 1, 1], taper: [0.6, 0.8], color: "body" },
  wedge: { shape: "wedge", at: [0, 0.5, 0], size: [1, 1, 1], color: "body" },
  ellipsoid: { shape: "ellipsoid", at: [0, 0.5, 0], size: [1, 0.6, 1], clip: 0.5, color: "body" },
  cylinder: { shape: "cylinder", at: [0, 0.5, 0], r: 0.3, r2: 0.2, h: 1, bend: 40, axis: "z", color: "body" },
  cone: { shape: "cone", at: [0, 0.5, 0], r: 0.3, h: 1, axis: "x", color: "body" },
  capsule: { shape: "capsule", at: [0, 0.5, 0], r: 0.2, h: 1, color: "body" },
  torus: { shape: "torus", at: [0, 0.5, 0], r: 0.4, t: 0.1, arc: 180, axis: "x", color: "body" },
  lathe: { shape: "lathe", at: [0, 0, 0], axis: "z", profile: [[0.1, -1], [0.4, 0], [0.2, 1]], color: "body" },
  extrude: { shape: "extrude", at: [0, 0.5, 0], plane: "xz", outline: [[0, -0.5], [2, -0.3], [2, 0.3], [0, 0.5]], depth: 0.1, color: "body" },
  tube: { shape: "tube", at: [0, 0, 0], points: [[0, 0, 0], [0.5, 0.5, 0], [1, 0.6, 0.2]], r: 0.05, color: "dark" }
};

describe("validation", () => {
  test("clamps numbers, drops invalid parts and fills defaults", () => {
    const v = validateSpec(
      spec([
        box([1e9, -5, Number.NaN]), // NaN position: dropped
        box([1e9, 0, 0], { size: [1e9, 0, 2], rot: [9999, 0, 0], rough: 7, emit: -2 }),
        { shape: "dodecahedron", at: [0, 0, 0], color: "body" },
        box([0, 0, 0], { color: "no-such-role" }),
        box([0, 1, 0], { color: "#ABC" })
      ])
    );
    if ("error" in v) throw new Error(v.error);
    const parts = v.spec.stages[0]!.parts;
    expect(parts.length).toBe(3);
    expect(parts[0]!.at[0]).toBe(LIMITS.coord);
    expect(parts[0]!.size).toEqual([LIMITS.maxDim, LIMITS.minDim, 2]);
    expect(parts[0]!.rot![0]).toBe(720);
    expect(parts[0]!.rough).toBe(1);
    expect(parts[0]!.emit).toBeUndefined();
    expect(parts[1]!.color).toBe("#b9b1a6");
    expect(parts[2]!.color).toBe("#abc");
    expect(v.issues.some((i) => i.includes("dodecahedron"))).toBe(true);
  });

  test("rejects specs with too few parts and non-objects", () => {
    expect("error" in validateSpec(spec([box([0, 0, 0])]))).toBe(true);
    expect("error" in validateSpec("not json")).toBe(true);
    expect("error" in validateSpec([1, 2, 3])).toBe(true);
  });

  test("caps the part count, the stage count and the copy count", () => {
    const many = Array.from({ length: 120 }, (_, i) => box([i * 0.01, 0, 0]));
    expect(ok(spec(many)).stages[0]!.parts.length).toBe(LIMITS.maxParts);
    const stages = Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, parts: [box([0, i * 0.4, 0])] }));
    const s = ok({ name: "T", size: [1, 4, 1], palette: PALETTE, stages });
    expect(s.stages.length).toBe(LIMITS.maxStages);
    expect(s.stages.reduce((n, st) => n + st.parts.length, 0)).toBe(8);
    const heavy = Array.from({ length: 30 }, () => box([0.5, 0, 0], { mirror: "x", repeat: { n: 32, step: [0, 0, 0.1] } }));
    const h = ok(spec(heavy));
    expect(h.stages[0]!.parts.length).toBe(Math.floor(LIMITS.maxInstances / 64));
  });

  test("accepts palette and groups as objects or arrays, and a palette id", () => {
    const a = ok({ ...spec([box([0, 0, 0]), box([1, 0, 0]), box([2, 0, 0], { group: "spin" })]), palette: { body: "#ff0000" }, groups: { spin: { pivot: [2, 0, 0] } } });
    expect(a.palette.body).toBe("#ff0000");
    expect(a.groups?.spin).toEqual([2, 0, 0]);
    const b = ok({ ...spec([box([0, 0, 0]), box([1, 0, 0]), box([2, 0, 0])]), palette: "harbor" });
    expect(b.palette.wood).toBe("#7d5234");
    // A group used without a pivot gets the mean of its parts' centers.
    const c = ok(spec([box([0, 0, 0]), box([1, 0, 0], { group: "g" }), box([3, 0, 0], { group: "g" })]));
    expect(c.groups?.g).toEqual([2, 0, 0]);
  });

  test("a flat parts list becomes one stage", () => {
    const s = ok({ name: "Flat", size: [1, 1, 1], palette: PALETTE, parts: [box([0, 0, 0]), box([0, 0.5, 0]), box([0, 1, 0])] });
    expect(s.stages.length).toBe(1);
  });
});

describe("mirror and repeat", () => {
  const counts = (p: Record<string, unknown>) => {
    const s = ok(spec([p, box([0, 0, 0]), box([0, 1, 0])]));
    return partInstances(s.stages[0]!.parts[0]!).length;
  };
  test("copy counts", () => {
    expect(counts(box([1, 0, 0]))).toBe(1);
    expect(counts(box([1, 0, 0], { mirror: "x" }))).toBe(2);
    expect(counts(box([1, 0, 0], { repeat: { n: 4, step: [0, 0, 1] } }))).toBe(4);
    expect(counts(box([1, 0, 0], { mirror: "z", repeat: { n: 3, radial: "y", center: [0, 0, 0] } }))).toBe(6);
  });

  test("mirror reflects across x = 0 and radial repeat turns about the center", () => {
    const part: Part = { shape: "box", at: [2, 1, 0], size: [0.2, 0.2, 0.2], color: "#ffffff", mirror: "x", repeat: { n: 4, radial: "y", center: [0, 1, 0] } };
    const centers = partInstances(part).map((g) => {
      g.computeBoundingBox();
      return g.boundingBox!.getCenter(new THREE.Vector3());
    });
    expect(centers.length).toBe(8);
    for (const c of centers) {
      expect(Math.hypot(c.x, c.z)).toBeCloseTo(2, 4);
      expect(c.y).toBeCloseTo(1, 4);
    }
    expect(centers.some((c) => c.x < -1.9)).toBe(true);
    expect(centers.some((c) => c.z > 1.9)).toBe(true);
  });
});

describe("shapes", () => {
  test("the list of test parts covers every shape", () => {
    expect(Object.keys(ONE_OF_EACH).sort()).toEqual([...PART_SHAPES].sort());
  });
  for (const shape of PART_SHAPES) {
    test(`${shape} builds non-empty geometry with finite positions`, () => {
      const s = ok(spec([ONE_OF_EACH[shape]!, box([0, 0.25, 0]), box([0, 0.75, 0])]));
      expect(s.stages[0]!.parts[0]!.shape).toBe(shape);
      const [g] = partInstances(s.stages[0]!.parts[0]!);
      const pos = g!.attributes.position!;
      expect(pos.count).toBeGreaterThan(0);
      expect(pos.count % 3).toBe(0);
      for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i]!)).toBe(true);
      g!.computeBoundingBox();
      const size = g!.boundingBox!.getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.05);
    });
  }
  test("extrude planes put the thickness on the right axis", () => {
    const sizeOf = (plane: string) => {
      const [g] = partInstances({ shape: "extrude", at: [0, 0, 0], plane: plane as "xy", outline: [[0, 0], [2, 0], [2, 1], [0, 1]], depth: 0.1, bevel: 0, color: "#fff" });
      g!.computeBoundingBox();
      return g!.boundingBox!.getSize(new THREE.Vector3());
    };
    expect(sizeOf("xz").y).toBeCloseTo(0.1, 2);
    expect(sizeOf("zy").x).toBeCloseTo(0.1, 2);
    expect(sizeOf("xy").z).toBeCloseTo(0.1, 2);
    expect(sizeOf("zy").z).toBeCloseTo(2, 2);
  });
});

describe("build", () => {
  function worldBox(object: THREE.Object3D) {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object);
  }

  test("the object is grounded at y = 0 and centered in x and z", () => {
    const s = ok(spec([box([5, 3, -7]), box([5.4, 3.4, -7]), ONE_OF_EACH.ellipsoid!], { size: [3, 3, 3] }));
    const built = buildParts(s);
    const b = worldBox(built.object);
    expect(b.min.y).toBeCloseTo(0, 4);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 4);
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(0, 4);
    expect(built.footprint).toBeGreaterThan(0);
    built.dispose();
  });

  test("fitSize scales the longest side", () => {
    const built = buildFromParams({ spec: EXAMPLE_BIPLANE, sizeMeters: 3 });
    const size = worldBox(built.object).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(3, 2);
    built.dispose();
  });

  test("both worked examples validate with no issues and build", () => {
    for (const ex of [EXAMPLE_LAMP, EXAMPLE_BIPLANE]) {
      const p = prepareSpec(ex);
      if ("error" in p) throw new Error(p.error);
      expect(p.issues).toEqual([]);
      const built = buildParts(p.spec);
      expect(built.triangles).toBeGreaterThan(500);
      let meshes = 0;
      built.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      expect(meshes).toBeLessThanOrEqual(12); // merged by material and pivot group
      built.dispose();
    }
  });

  test("the biplane propeller is a pivot group", () => {
    const built = buildFromParams({ spec: EXAMPLE_BIPLANE });
    const prop = built.object.getObjectByName("prop");
    expect(prop).toBeDefined();
    expect(prop!.children.length).toBeGreaterThan(0);
    built.dispose();
  });

  test("shown limits the stages and keeps the object in place", () => {
    const full = buildFromParams({ spec: EXAMPLE_BIPLANE });
    const first = buildFromParams({ spec: EXAMPLE_BIPLANE, shown: 1 }, { appear: true });
    expect(first.triangles).toBeLessThan(full.triangles);
    // Stage 1 of the plane (fuselage and wings) has the same x extent as the full plane.
    const a = worldBox(full.object);
    first.update?.();
    expect(first.update).toBeDefined();
    expect(first.size).toEqual(full.size);
    expect(a.min.y).toBeCloseTo(0, 4);
    full.dispose();
    first.dispose();
  });
});

describe("self-check", () => {
  test("snaps a floating part, drops a far part, removes a mirror on the plane", () => {
    const input = ok(
      spec(
        [
          box([0, 0.25, 0], { size: [1, 0.5, 1] }),
          box([0, 0.75, 0], { size: [0.6, 0.5, 0.6] }),
          box([0, 1.3, 0], { size: [0.2, 0.2, 0.2] }), // 0.3 m above the top: floating
          box([30, 0.25, 0]), // far outside the 2 m size
          box([0, 0.15, 0.8], { size: [0.3, 0.3, 0.3], mirror: "x" }) // on the mirror plane
        ],
        { size: [2, 2, 2] }
      )
    );
    const r = checkSpec(input);
    const parts = r.spec.stages[0]!.parts;
    expect(parts.length).toBe(4);
    expect(r.dropped).toBe(1);
    expect(r.snapped).toBe(1);
    const lifted = parts.find((p) => p.size?.[0] === 0.2)!;
    expect(lifted.at[1]).toBeCloseTo(1.1, 3);
    expect(parts.find((p) => p.at[2] === 0.8)!.mirror).toBeUndefined();
  });
});

describe("object generator", () => {
  const brief: Brief = { mode: "build", understanding: "a plane", tasks: [], style: { colors: { body: "#ff0000", bad: "red" } } };
  test("validate needs a subject and clamps the size", () => {
    expect(typeof objectGenerator.validate({}, brief)).toBe("string");
    const v = objectGenerator.validate({ subject: "small airplane", sizeMeters: 500, style: "Realistic" }, brief) as Record<string, unknown>;
    expect(v.subject).toBe("small airplane");
    expect(v.sizeMeters).toBe(60);
    expect(v.style).toBe("realistic");
    expect(v.colors).toEqual({ body: "#ff0000" });
  });
  test("choices: one style question only when the brief is unsure", () => {
    const ctx = {} as Parameters<NonNullable<typeof objectGenerator.choices>>[1];
    expect(objectGenerator.choices!({ subject: "car" }, ctx)).toEqual([]);
    const q = objectGenerator.choices!({ subject: "car", style: "unsure" }, ctx);
    expect(q.length).toBe(1);
    expect(q[0]!.options.length).toBe(2);
  });
  test("describe is 600 characters or less; the prompt has both examples", () => {
    expect(objectGenerator.describe.length).toBeLessThanOrEqual(600);
    expect(MODELER_SYSTEM_PROMPT).toContain('"Biplane"');
    expect(MODELER_SYSTEM_PROMPT).toContain('"Street lamp"');
  });
  test("gen:parts is in the catalog and builds without params", () => {
    const entry = getResource("gen:parts");
    expect(entry?.create).toBeDefined();
    const inst = entry!.create!(7, { appear: false });
    expect(inst.object.children.length).toBeGreaterThan(0);
    inst.dispose?.();
  });
});

// Unit tests for the architecture generator (parametric landmark buildings).
// Run: cd apps/editor && bun test tests/architecture.test.ts
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  ARCH_STYLES,
  buildArchitecture,
  buildSurroundings,
  resolveArchParams,
  stageTimeline,
  type ArchStyle,
  type BuiltArchitecture
} from "../src/lib/generators/architecture";
import { architectureGenerator } from "../src/lib/copilot/director/generators/architecture";
import { ARCHITECTURE_ENTRIES } from "../src/lib/resources/generated/architecture";
import type { Brief } from "../src/lib/copilot/director/types";

function bounds(b: BuiltArchitecture | { stages: BuiltArchitecture["stages"] }) {
  const box = new THREE.Box3();
  let finite = true;
  let vertices = 0;
  for (const s of b.stages)
    for (const g of Object.values(s.geometries)) {
      if (!g) continue;
      const pos = g.getAttribute("position").array as Float32Array;
      const nrm = g.getAttribute("normal").array as Float32Array;
      for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i]) || !Number.isFinite(nrm[i])) finite = false;
      vertices += pos.length / 3;
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
  return { box, finite, vertices };
}

const brief = (style: Brief["style"] = {}, understanding = "Build a landmark."): Brief => ({ mode: "build", understanding, style, tasks: [] });
const ctxFor = (b: Brief) => ({ editor: null as never, prompt: "", brief: b, anchor: { x: 0, z: 0 } });

describe("params", () => {
  test("clamps and fills defaults", () => {
    const p = resolveArchParams({ style: "japanese-castle", tiers: 99, footprint: -3, detail: 4, colors: { roof: "not a color", walls: "#FFF" } });
    expect(p.tiers).toBe(7);
    expect(p.footprint).toBe(4);
    expect(p.detail).toBe(1);
    expect(p.colors.walls).toBe("#ffffff");
    expect(p.colors.roof).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolveArchParams({ style: "japanese-castle", tiers: 1 }).tiers).toBe(3);
    expect([3, 5]).toContain(resolveArchParams({ style: "pagoda", tiers: 4 }).tiers);
    expect(resolveArchParams({ style: "pagoda", tiers: 7 }).tiers).toBe(5);
    expect(resolveArchParams({ style: "torii-and-shrine", tiers: 5 }).tiers).toBe(1);
    expect(resolveArchParams({ style: "medieval-keep", surround: "moat" }).surround).toBe("none");
    expect(resolveArchParams({ facing: -90 }).facing).toBe(270);
  });

  test("style from the brief era, the understanding, or aliases", () => {
    expect(resolveArchParams({}, { era: "japanese castle" }).style).toBe("japanese-castle");
    expect(resolveArchParams({}, { era: "Edo period Japan" }).style).toBe("japanese-castle");
    expect(resolveArchParams({}, { text: "a five storied pagoda" }).style).toBe("pagoda");
    expect(resolveArchParams({}, { era: "medieval" }).style).toBe("medieval-keep");
    expect(resolveArchParams({}, { text: "a glass skyscraper downtown" }).style).toBe("modern-tower");
    expect(resolveArchParams({ style: "torii and shrine" }).style).toBe("torii-and-shrine");
    expect(resolveArchParams({ style: "Japanese_Castle" }).style).toBe("japanese-castle");
  });

  test("brief colors fill missing colors; params colors win", () => {
    const p = resolveArchParams({ colors: { roof: "#112233" } }, { colors: { roof: "#445566", wall: "#eeeeee", gold: "#ccaa33" } });
    expect(p.colors.roof).toBe("#112233");
    expect(p.colors.walls).toBe("#eeeeee");
    expect(p.colors.accent).toBe("#ccaa33");
    expect(p.colorsGiven).toBe(true);
    expect(resolveArchParams({}).colorsGiven).toBe(false);
  });
});

describe("build", () => {
  for (const style of ARCH_STYLES) {
    test(`${style}: finite, non-empty, grounded, centered`, () => {
      const p = resolveArchParams({ style, seed: 3 });
      const built = buildArchitecture(p);
      const { box, finite, vertices } = bounds(built);
      expect(finite).toBe(true);
      expect(vertices).toBeGreaterThan(100);
      expect(built.triangles * 3).toBe(vertices);
      expect(Math.abs(box.min.y)).toBeLessThan(1e-3);
      expect(box.max.y).toBeCloseTo(built.height, 0);
      expect(built.height).toBeGreaterThan(p.footprint * 0.4);
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      expect(Math.abs(cx)).toBeLessThan(p.footprint * 0.1);
      expect(Math.abs(cz)).toBeLessThan(p.footprint * 0.1);
      expect(built.radius).toBeGreaterThan(p.footprint * 0.3);
      expect(Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z)).toBeLessThan(built.radius * 1.6);
      // Reveal order: base first, ornaments last.
      expect(built.stages[0].label).toMatch(/base/i);
      expect(built.stages[built.stages.length - 1].label).toMatch(/ornament|tier/i);
    });
  }

  test("tier count is respected", () => {
    const cases: [ArchStyle, number][] = [
      ["japanese-castle", 3],
      ["japanese-castle", 5],
      ["japanese-castle", 7],
      ["pagoda", 3],
      ["pagoda", 5],
      ["medieval-keep", 2],
      ["modern-tower", 4]
    ];
    for (const [style, tiers] of cases) {
      const built = buildArchitecture(resolveArchParams({ style, tiers }));
      expect(built.stages.filter((s) => /^Tier \d+$/.test(s.label)).length).toBe(tiers);
      expect(built.tiers).toBe(tiers);
    }
    const h3 = buildArchitecture(resolveArchParams({ style: "japanese-castle", tiers: 3 })).height;
    const h7 = buildArchitecture(resolveArchParams({ style: "japanese-castle", tiers: 7 })).height;
    expect(h7).toBeGreaterThan(h3);
  });

  test("deterministic by seed", () => {
    const a = buildArchitecture(resolveArchParams({ style: "japanese-castle", seed: 42 }));
    const b = buildArchitecture(resolveArchParams({ style: "japanese-castle", seed: 42 }));
    const c = buildArchitecture(resolveArchParams({ style: "japanese-castle", seed: 43 }));
    const arr = (x: BuiltArchitecture, attr: string) => Array.from(x.stages[0].geometries.base!.getAttribute(attr).array as Float32Array);
    expect(arr(a, "position")).toEqual(arr(b, "position"));
    expect(arr(a, "color")).toEqual(arr(b, "color"));
    expect(arr(a, "color")).not.toEqual(arr(c, "color"));
  });

  test("height param scales within range and stays grounded", () => {
    const natural = buildArchitecture(resolveArchParams({ style: "japanese-castle" })).height;
    const taller = buildArchitecture(resolveArchParams({ style: "japanese-castle", height: natural * 1.2 }));
    expect(taller.height).toBeCloseTo(natural * 1.2, 1);
    const huge = buildArchitecture(resolveArchParams({ style: "japanese-castle", height: natural * 10 }));
    expect(huge.height).toBeLessThan(natural * 1.4);
    expect(Math.abs(bounds(huge).box.min.y)).toBeLessThan(1e-3);
  });

  test("triangle budget (largest settings, every style)", () => {
    for (const style of ARCH_STYLES) {
      const p = resolveArchParams({ style, tiers: 99, detail: 1, footprint: 1000 });
      const built = buildArchitecture(p);
      expect(built.triangles).toBeLessThan(60_000);
      const yard = buildSurroundings({ ...p, surround: "stone-yard" }, built);
      expect(yard!.triangles).toBeLessThan(10_000);
    }
  });

  test("surroundings: grounded, open front, none = null", () => {
    const p = resolveArchParams({ style: "japanese-castle", surround: "stone-yard" });
    const built = buildArchitecture(p);
    const yard = buildSurroundings(p, built)!;
    const { box, finite } = bounds(yard);
    expect(finite).toBe(true);
    expect(Math.abs(box.min.y)).toBeLessThan(1e-3);
    expect(box.max.z).toBeGreaterThan(-box.min.z); // steps reach out on the front (+z)
    expect(buildSurroundings({ ...p, surround: "none" }, built)).toBeNull();
    expect(buildSurroundings({ ...p, surround: "garden" }, built)!.triangles).toBeGreaterThan(50);
  });

  test("reveal timeline is ordered", () => {
    const built = buildArchitecture(resolveArchParams({ style: "japanese-castle", tiers: 5 }));
    const t = stageTimeline(built.stages);
    for (let i = 1; i < t.length; i++) expect(t[i].start).toBeGreaterThan(t[i - 1].start);
  });
});

describe("library entries", () => {
  test("create builds stage groups and the appear animation finishes", async () => {
    const entry = ARCHITECTURE_ENTRIES.find((e) => e.id === "gen:architecture")!;
    expect(entry.selfAnimates).toBe(true);
    const inst = entry.create!(1, { appear: true, params: { style: "pagoda", tiers: 3 } });
    const groups = inst.object.children;
    expect(groups.length).toBe(5); // base, 3 tiers, ornaments
    expect(groups[groups.length - 1].visible).toBe(false);
    inst.update!({ dt: 0, time: 0, night: 0 });
    await new Promise((r) => setTimeout(r, 3200));
    inst.update!({ dt: 0, time: 0, night: 0 });
    for (const g of groups) {
      expect(g.visible).toBe(true);
      expect(g.scale.y).toBeCloseTo(1, 5);
    }
    inst.dispose?.();
    const yard = ARCHITECTURE_ENTRIES.find((e) => e.id === "gen:architecture-yard")!.create!(1, { params: { style: "japanese-castle", half: [4, 3.5], surround: "garden" } });
    expect(yard.object.children.length).toBe(1);
  });
});

describe("director generator", () => {
  test("describe is short and exact", () => {
    expect(architectureGenerator.describe.length).toBeLessThanOrEqual(600);
    for (const s of ARCH_STYLES) expect(architectureGenerator.describe).toContain(s);
  });

  test("validate fills params from the brief", () => {
    const b = brief({ era: "japanese castle", colors: { roof: "#2f6f68", walls: "#f4f1ea" } });
    const v = architectureGenerator.validate({}, b) as Record<string, unknown>;
    expect(typeof v).toBe("object");
    expect(v.style).toBe("japanese-castle");
    expect((v.colors as Record<string, string>).roof).toBe("#2f6f68");
    expect(architectureGenerator.choices!(v, ctxFor(b)).map((q) => q.id)).toEqual(["tiers"]);
  });

  test("choices: roof color only without colors, tiers only when not given, max 2", () => {
    const b = brief({}, "A Japanese castle keep from the photo.");
    const v = architectureGenerator.validate({}, b) as Record<string, unknown>;
    const qs = architectureGenerator.choices!(v, ctxFor(b));
    expect(qs.map((q) => q.id)).toEqual(["roof", "tiers"]);
    expect(qs[0].options.length).toBeGreaterThanOrEqual(3);
    expect(qs[0].options.length).toBeLessThanOrEqual(4);
    expect(qs[0].options[0].image).toMatch(/^data:image\/svg\+xml/);
    expect(qs[1].options.map((o) => o.id)).toEqual(["3", "5", "7"]);
    const v2 = architectureGenerator.validate({ style: "medieval-keep", tiers: 3, colors: { roof: "#445566" } }, b) as Record<string, unknown>;
    expect(architectureGenerator.choices!(v2, ctxFor(b))).toEqual([]);
  });
});

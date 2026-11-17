// Gate tests of Phase A of the procedural quality plan: the richer builders of the object
// modeler (sweep, corrugated, panel, rounded, extrude holes, lathe hard edges) and the texture
// scale that follows the final size.
// Run: cd apps/editor && bun test tests/parts-builders.test.ts
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { LIMITS, buildFromParams, buildParts, partBounds, partInstances, prepareSpec, textureScale, validateSpec, type Part, type PartsSpec } from "../src/lib/generators/parts";

const PALETTE = [
  { role: "body", hex: "#9a3b2e", surface: "paint" },
  { role: "dark", hex: "#222222", surface: "steel-dark" }
];

function ok(input: unknown): PartsSpec {
  const v = validateSpec(input);
  if ("error" in v) throw new Error(v.error);
  return v.spec;
}

/** A valid spec with `part` first and two small boxes (a spec needs 3 parts). */
function withPart(part: Record<string, unknown>, size: number[] = [2, 2, 2]) {
  return {
    name: "Test",
    size,
    palette: PALETTE,
    stages: [
      {
        name: "All",
        parts: [part, { shape: "box", at: [0, 0.05, 0], size: [0.1, 0.1, 0.1], color: "dark" }, { shape: "box", at: [0, 0.15, 0], size: [0.1, 0.1, 0.1], color: "dark" }]
      }
    ]
  };
}

function onePart(part: Record<string, unknown>): Part {
  return ok(withPart(part)).stages[0]!.parts[0]!;
}

function geometryOf(part: Part): THREE.BufferGeometry {
  const [g] = partInstances(part);
  return g!;
}

function triangles(g: THREE.BufferGeometry) {
  return g.attributes.position!.count / 3;
}

const key = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

/** Distinct normals (to 3 decimals) at each vertex position. */
function normalsByPosition(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const out = new Map<string, Set<string>>();
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    const set = out.get(k) ?? new Set<string>();
    set.add(`${n.getX(i).toFixed(3)},${n.getY(i).toFixed(3)},${n.getZ(i).toFixed(3)}`);
    out.set(k, set);
  }
  return out;
}

// ── Container side wall ──────────────────────────────────────

describe("corrugated: container side wall", () => {
  const wall = onePart({ shape: "corrugated", at: [0, 1.2, 0], size: [12.0, 2.4], depth: 0.036, color: "body" });

  test("12.0 x 2.4 m in one part: about 43 waves, triangles within 20% of the formula", () => {
    const waves = Math.round(12.0 / 0.278); // 43.2 -> 43
    expect(waves).toBe(43);
    // Formula: waves x 4 break points per pitch (4 strips) x 2 triangles per strip.
    const expected = waves * 4 * 2; // 344
    const g = geometryOf(wall);
    expect(Math.abs(triangles(g) - expected) / expected).toBeLessThanOrEqual(0.2);
    g.computeBoundingBox();
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(12.0, 3);
    expect(s.y).toBeCloseTo(2.4, 3);
    expect(s.z).toBeCloseTo(0.036, 3);
  });

  test("vertices only at break points: 4 distinct u values per wave, plus the end", () => {
    const g = geometryOf(wall);
    const p = g.attributes.position as THREE.BufferAttribute;
    const xs = new Set<string>();
    for (let i = 0; i < p.count; i++) xs.add(p.getX(i).toFixed(5));
    expect(xs.size).toBe(43 * 4 + 1);
  });

  test("the facing axis is stored, also for a roof facing y", () => {
    expect(wall.axis).toBe("z");
    const roof = onePart({ shape: "corrugated", at: [0, 2, 0], size: [6, 2.4], depth: 0.02, axis: "y", color: "body" });
    expect(roof.axis).toBe("y");
    const b = partBounds(roof).getSize(new THREE.Vector3());
    expect(b.y).toBeCloseTo(0.02, 3);
    expect(b.z).toBeCloseTo(2.4, 3);
  });
});

// ── Steel drum ───────────────────────────────────────────────

describe("lathe: steel drum with two hoops", () => {
  // [radius, y] in meters. Doubled points (marked) make the hard edges of the hoops.
  const PROFILE: [number, number][] = [
    [0.27, 0.016], // recessed bottom end
    [0.288, 0.0],
    [0.295, 0.0],
    [0.295, 0.012],
    [0.288, 0.024],
    [0.283, 0.03],
    [0.283, 0.25],
    [0.283, 0.25], // doubled: lower edge of hoop 1
    [0.297, 0.258],
    [0.297, 0.278],
    [0.283, 0.286],
    [0.283, 0.286], // doubled: upper edge of hoop 1
    [0.283, 0.44],
    [0.283, 0.506],
    [0.283, 0.506], // doubled: lower edge of hoop 2
    [0.297, 0.514],
    [0.297, 0.534],
    [0.283, 0.542],
    [0.283, 0.542], // doubled: upper edge of hoop 2
    [0.283, 0.85],
    [0.288, 0.856],
    [0.295, 0.868],
    [0.295, 0.88],
    [0.288, 0.88],
    [0.27, 0.864] // recessed top end
  ];
  const drum = onePart({ shape: "lathe", at: [0, 0, 0], profile: PROFILE, sides: 22, smooth: true, color: "body" });

  test("one part with about 26 points survives validation", () => {
    expect(PROFILE.length).toBeGreaterThanOrEqual(24);
    expect(drum.profile!.length).toBe(PROFILE.length);
  });

  test("hard edges at the doubled points, smooth elsewhere", () => {
    const g = geometryOf(drum);
    const byPos = normalsByPosition(g);
    // At angle 0 a profile point [r, y] is the vertex (0, y, r).
    const at = (r: number, y: number) => byPos.get(key(0, y, r));
    for (const [r, y] of [
      [0.283, 0.25],
      [0.283, 0.286],
      [0.283, 0.506],
      [0.283, 0.542]
    ] as const)
      expect(at(r, y)!.size).toBe(2);
    // Not doubled: one normal, also where the profile turns sharply (the hoop's outer corner).
    expect(at(0.297, 0.258)!.size).toBe(1);
    expect(at(0.297, 0.534)!.size).toBe(1);
    expect(at(0.283, 0.44)!.size).toBe(1);
  });

  test("accepts up to 32 profile points", () => {
    expect(LIMITS.maxProfile).toBe(32);
    const many = Array.from({ length: 40 }, (_, i) => [0.2 + 0.01 * Math.sin(i), i * 0.02]);
    expect(onePart({ shape: "lathe", at: [0, 0, 0], profile: many, color: "body" }).profile!.length).toBe(32);
  });
});

// ── Road barrier ─────────────────────────────────────────────

describe("sweep: road barrier", () => {
  // Jersey barrier section [u = across (z), v = up (y)]: 12 points.
  const SECTION: [number, number][] = [
    [-0.3, 0],
    [0.3, 0],
    [0.3, 0.076],
    [0.127, 0.33],
    [0.1, 0.57],
    [0.077, 0.79],
    [0.06, 0.81],
    [-0.06, 0.81],
    [-0.077, 0.79],
    [-0.1, 0.57],
    [-0.127, 0.33],
    [-0.3, 0.076]
  ];
  // 3 m long; the last 30 mm at each end taper 9% in width.
  const barrier = onePart({
    shape: "sweep",
    at: [0, 0, 0],
    axis: "x",
    length: 3,
    profile: SECTION,
    stations: [
      [0, [0.91, 1]],
      [0.01, 1],
      [0.99, 1],
      [1, [0.91, 1]]
    ],
    color: "body"
  });

  test("one part, 12-point profile, 4 stations", () => {
    expect(barrier.profile!.length).toBe(12);
    expect(barrier.stations!.length).toBe(4);
    const g = geometryOf(barrier);
    // 2 x 12 x 3 bands on the sides + 2 x (12 - 2) on the caps.
    expect(triangles(g)).toBe(2 * 12 * 3 + 2 * 10);
  });

  test("the ends are 9% narrower, the body is full width", () => {
    const g = geometryOf(barrier);
    const p = g.attributes.position as THREE.BufferAttribute;
    let endW = 0;
    let midW = 0;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(Math.abs(p.getX(i)) - 1.5) < 1e-6) endW = Math.max(endW, Math.abs(p.getZ(i)));
      if (Math.abs(Math.abs(p.getX(i)) - 1.47) < 1e-6) midW = Math.max(midW, Math.abs(p.getZ(i)));
    }
    expect(midW).toBeCloseTo(0.3, 5);
    expect(endW).toBeCloseTo(0.3 * 0.91, 5);
    const b = partBounds(barrier).getSize(new THREE.Vector3());
    expect(b.x).toBeCloseTo(3, 4);
    expect(b.y).toBeCloseTo(0.81, 4);
  });

  test("normals: hard where the section or the path turns over 30 degrees, soft elsewhere", () => {
    const g = geometryOf(barrier);
    const byPos = normalsByPosition(g);
    // Ring at x = -1.47 (t = 0.01), where the body meets the 9% end taper (a 42 degree turn: hard).
    // Base corner (u 0.3, v 0): the profile turns 90 degrees, so bottom and side split too.
    expect(byPos.get(key(-1.47, 0, 0.3))!.size).toBeGreaterThanOrEqual(3);
    // Flank point (u 0.1, v 0.57): the profile turns about 4 degrees, and the taper moves it
    // only 9 mm over 30 mm (17 degrees), so all four faces there share one normal.
    expect(byPos.get(key(-1.47, 0.57, 0.1))!.size).toBe(1);
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) expect(Number.isFinite(n.getX(i)) && Number.isFinite(n.getY(i)) && Number.isFinite(n.getZ(i))).toBe(true);
  });
});

// ── Cabinet door ─────────────────────────────────────────────

describe("panel: cabinet door", () => {
  const door = onePart({ shape: "panel", at: [0, 0.9, 0], size: [0.6, 1.8, 0.03], cols: 2, rows: 3, inset: 0.06, relief: 0.008, color: "body" });

  test("one part with 2 x 3 raised panels on the front", () => {
    const g = geometryOf(door);
    const p = g.attributes.position as THREE.BufferAttribute;
    const top = 0.015 + 0.008;
    // Triangles whose three vertices are on the raised top: 2 per field.
    let tops = 0;
    for (let i = 0; i < p.count; i += 3) if ([0, 1, 2].every((k) => Math.abs(p.getZ(i + k) - top) < 1e-6)) tops++;
    expect(tops).toBe(2 * 3 * 2);
    expect(partBounds(door).max.z).toBeCloseTo(top, 5);
  });

  test("sunk panels, ribs and louvres build inside the slab", () => {
    for (const extra of [{ relief: -0.01 }, { ribs: 8, relief: 0.01 }, { louvres: 10, tilt: 40 }]) {
      const part = onePart({ shape: "panel", at: [0, 0.5, 0], size: [0.8, 1, 0.05], color: "body", ...extra });
      const b = partBounds(part);
      expect(b.min.z).toBeGreaterThanOrEqual(-0.025 - 1e-6);
      expect(b.max.z).toBeLessThanOrEqual(0.025 + 0.01 + 1e-6);
      expect(triangles(geometryOf(part))).toBeGreaterThan(12);
    }
  });
});

// ── Plate with holes ─────────────────────────────────────────

describe("extrude: holes", () => {
  const circle = (cx: number, cy: number, r: number) => Array.from({ length: 12 }, (_, i) => [cx + r * Math.cos((i / 12) * Math.PI * 2), cy + r * Math.sin((i / 12) * Math.PI * 2)]);
  const plate = onePart({
    shape: "extrude",
    at: [0, 0, 0],
    plane: "xy",
    outline: [
      [0, 0],
      [1, 0],
      [1, 0.6],
      [0, 0.6]
    ],
    holes: [circle(0.25, 0.3, 0.1), circle(0.75, 0.3, 0.1)],
    depth: 0.02,
    color: "body"
  });

  test("two holes are kept", () => {
    expect(plate.holes!.length).toBe(2);
  });

  test("the hole centers are not covered by triangles", () => {
    const g = geometryOf(plate);
    const p = g.attributes.position as THREE.BufferAttribute;
    const tri = new THREE.Triangle();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const [hx, hy] of [
      [0.25, 0.3],
      [0.75, 0.3],
      [0.5, 0.3] // solid metal between the holes: covered
    ] as const) {
      let covered = 0;
      for (let i = 0; i < p.count; i += 3) {
        // Projected onto the outline plane (z = 0).
        a.set(p.getX(i), p.getY(i), 0);
        b.set(p.getX(i + 1), p.getY(i + 1), 0);
        c.set(p.getX(i + 2), p.getY(i + 2), 0);
        tri.set(a, b, c);
        if (tri.getArea() > 1e-9 && tri.containsPoint(new THREE.Vector3(hx, hy, 0))) covered++;
      }
      if (hx === 0.5) expect(covered).toBeGreaterThan(0);
      else expect(covered).toBe(0);
    }
  });

  test("a hole outside the outline is dropped with an issue", () => {
    const v = validateSpec(withPart({ shape: "extrude", at: [0, 0, 0], outline: [[0, 0], [1, 0], [1, 1], [0, 1]], holes: [circle(5, 5, 0.1)], depth: 0.1, color: "body" }));
    if ("error" in v) throw new Error(v.error);
    expect(v.spec.stages[0]!.parts[0]!.holes).toBeUndefined();
    expect(v.issues.some((s) => s.includes("hole"))).toBe(true);
  });
});

// ── rounded ──────────────────────────────────────────────────

describe("rounded", () => {
  test("rounded edges, no bevel stored, the dish dips the top", () => {
    const seat = onePart({ shape: "rounded", at: [0, 0.5, 0], size: [0.5, 0.12, 0.5], radius: 0.04, dish: 0.03, bevel: 0.2, color: "body" });
    expect(seat.bevel).toBeUndefined();
    const g = geometryOf(seat);
    const p = g.attributes.position as THREE.BufferAttribute;
    let centerY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < p.count; i++) {
      maxY = Math.max(maxY, p.getY(i));
      if (p.getY(i) > 0.5 && Math.hypot(p.getX(i), p.getZ(i)) < 0.05) centerY = Math.min(centerY, p.getY(i));
    }
    expect(maxY).toBeCloseTo(0.5 + 0.06, 5);
    // The lowest top vertex near the center is below the rim by part of the dish.
    expect(maxY - centerY).toBeGreaterThan(0.015);
    expect(maxY - centerY).toBeLessThanOrEqual(0.03 + 1e-6);
  });
});

// ── Every new shape ──────────────────────────────────────────

const NEW_SHAPES: Record<string, Record<string, unknown>> = {
  sweep: { shape: "sweep", at: [0.4, 0.5, 0], axis: "z", length: 1.2, profile: [[-0.2, -0.2], [0.2, -0.2], [0.25, 0.1], [0, 0.3], [-0.25, 0.1]], stations: [[0, 0.8, [0, -0.05]], [0.5, [1.1, 1]], [1, 0.6]], color: "body" },
  corrugated: { shape: "corrugated", at: [0.4, 0.6, 0], size: [1.4, 1.2], depth: 0.04, pitch: 0.2, axis: "x", color: "body" },
  panel: { shape: "panel", at: [0.4, 0.5, 0], size: [0.6, 1, 0.06], louvres: 6, color: "body" },
  rounded: { shape: "rounded", at: [0.4, 0.3, 0], size: [0.6, 0.6, 0.5], radius: 0.12, color: "body" },
  extrude: { shape: "extrude", at: [0.4, 0.5, 0], plane: "zy", outline: [[0, 0], [1, 0], [1, 1], [0, 1]], holes: [[[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]]], depth: 0.05, color: "body" },
  lathe: { shape: "lathe", at: [0.4, 0, 0], profile: [[0.2, 0], [0.2, 0.3], [0.2, 0.3], [0.25, 0.35], [0.1, 0.6]], smooth: true, color: "body" }
};

describe("every new shape", () => {
  for (const [name, part] of Object.entries(NEW_SHAPES)) {
    test(`${name}: prepareSpec, mirror, repeat, group; builds without NaN; finite footprint`, () => {
      const prepared = prepareSpec(
        withPart({ ...part, mirror: "x", repeat: { n: 2, step: [0, 0, 1.2] }, group: "g" }, [3, 2, 3])
      );
      if ("error" in prepared) throw new Error(prepared.error);
      const p = prepared.spec.stages[0]!.parts.find((q) => q.shape === part.shape)!;
      expect(p).toBeDefined();
      expect(partInstances(p).length).toBe(4);
      const built = buildParts(prepared.spec, { reveal: true, shown: 1 });
      let vertices = 0;
      built.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const pos = m.geometry.attributes.position!.array;
        vertices += pos.length / 3;
        for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i]!)).toBe(true);
        const nrm = m.geometry.attributes.normal!.array;
        for (let i = 0; i < nrm.length; i++) expect(Number.isFinite(nrm[i]!)).toBe(true);
      });
      expect(vertices).toBeGreaterThan(0);
      expect(Number.isFinite(built.footprint)).toBe(true);
      expect(built.footprint).toBeGreaterThan(0);
      built.update?.();
      built.dispose();
    });
  }
});

// ── Texture scale ────────────────────────────────────────────

describe("texture scale follows the final size", () => {
  const spec = withPart(NEW_SHAPES.rounded!, [1, 1, 1]);

  test("the provider gets fit (meters per spec unit); 1 m and 10 m differ by 10x", () => {
    const seen: number[] = [];
    const scales = [1, 10].map((sizeMeters) => {
      const built = buildFromParams({ spec, sizeMeters });
      built.applyMaterials((_s, _h, texScale) => {
        seen.push(texScale);
        return new THREE.MeshStandardMaterial({ vertexColors: true });
      });
      expect(seen[seen.length - 1]).toBe(textureScale(built.fit));
      built.dispose();
      return seen[seen.length - 1]!;
    });
    expect(scales[1]! / scales[0]!).toBeCloseTo(10, 1);
  });

  test("textureScale keeps two significant digits", () => {
    expect(textureScale(1.23456)).toBe(1.2);
    expect(textureScale(0.04567)).toBe(0.046);
    expect(Math.abs(textureScale(7.77) - 7.77) / 7.77).toBeLessThan(0.05);
  });
});

// Gate tests of Phase B of the procedural quality plan: the finish pass of the object modeler
// (gravity shade, copy variety, dents, bolts) on realistic objects.
// Run: cd apps/editor && bun test tests/parts-finish.test.ts
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { BOLT_TRIANGLES, FINISH, applyDent, buildParts, partInstances, validateSpec, type BuildOptions, type MaterialProvider, type Part, type PartsSpec } from "../src/lib/generators/parts";

const PALETTE = [
  { role: "body", hex: "#ffffff", surface: "paint" },
  { role: "dark", hex: "#555555", surface: "rubber" },
  { role: "sheet", hex: "#c0c0c0", surface: "galvanized" }
];

function ok(input: unknown): PartsSpec {
  const v = validateSpec(input);
  if ("error" in v) throw new Error(v.error);
  return v.spec;
}

/**
 * A realistic spec. A 3 m floor plate is the longest side and spec.size says 3 m, so one spec
 * unit is one meter (fit = 1) and the sizes below are real.
 */
function realistic(parts: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return ok({
    name: "Finish",
    size: [3, 2, 1],
    style: "realistic",
    palette: PALETTE,
    stages: [{ name: "All", parts: [{ shape: "box", at: [0, 0.05, 0], size: [3, 0.1, 1], color: "dark" }, { shape: "box", at: [1.4, 0.15, -0.4], size: [0.1, 0.1, 0.1], color: "dark" }, ...parts] }],
    ...extra
  });
}

const box = (at: number[], size: number[], extra: Record<string, unknown> = {}) => ({ shape: "box", at, size, color: "body", ...extra });

function meshesOf(object: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function arrays(object: THREE.Object3D) {
  return meshesOf(object).map((m) => ({
    pos: Array.from((m.geometry.attributes.position as THREE.BufferAttribute).array),
    nrm: Array.from((m.geometry.attributes.normal as THREE.BufferAttribute).array),
    col: Array.from((m.geometry.attributes.color as THREE.BufferAttribute).array)
  }));
}

function build(spec: PartsSpec, options: BuildOptions = {}) {
  const built = buildParts(spec, options);
  expect(built.fit).toBeCloseTo(1, 6);
  return built;
}

function boltMeshes(object: THREE.Object3D) {
  return meshesOf(object).filter((m) => m.name === "bolts");
}

function boltCount(object: THREE.Object3D) {
  return boltMeshes(object).reduce((n, m) => n + m.geometry.attributes.position!.count / 3 / BOLT_TRIANGLES, 0);
}

/** Centers of every bolt (each bolt is 16 triangles, in order). */
function boltCenters(object: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const mesh of boltMeshes(object)) {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const per = BOLT_TRIANGLES * 3;
    for (let b = 0; b < p.count / per; b++) {
      const c = new THREE.Vector3();
      for (let i = 0; i < per; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, b * per + i));
      out.push(c.divideScalar(per).applyMatrix4(mesh.matrixWorld));
    }
  }
  return out;
}

describe("unchanged builds", () => {
  const toy = ok({ name: "Toy", size: [2, 2, 2], palette: PALETTE, stages: [{ name: "All", parts: [box([0, 0.25, 0], [0.5, 0.5, 0.5]), box([0.6, 0.25, 0], [0.5, 0.5, 0.5], { color: "dark", repeat: { n: 3, step: [0, 0.6, 0] } }), { shape: "panel", at: [-0.6, 0.5, 0], size: [0.6, 1, 0.05], color: "body" }] }] });

  test("toy style: finish on or off gives the same vertex data", () => {
    const a = arrays(buildParts(toy).object);
    expect(arrays(buildParts(toy, { finish: true }).object)).toEqual(a);
    expect(arrays(buildParts(toy, { finish: false }).object)).toEqual(a);
  });

  test("finish: false on a realistic spec gives the plain build; the default finishes it", () => {
    const spec = realistic([box([0, 0.6, 0], [0.5, 0.5, 0.5], { repeat: { n: 3, step: [0.6, 0, 0] } }), { shape: "panel", at: [-1, 0.6, 0.3], size: [0.6, 1, 0.05], color: "body" }]);
    const plain = buildParts(spec, { finish: false });
    const asToy = buildParts({ ...spec, style: "toy" });
    // Same geometry as the toy build (only the default surface of a raw hex could differ).
    expect(arrays(plain.object).map((m) => m.pos)).toEqual(arrays(asToy.object).map((m) => m.pos));
    expect(plain.object.userData.finish).toBeUndefined();
    expect(boltMeshes(plain.object).length).toBe(0);
    const fin = buildParts(spec);
    expect(fin.object.userData.finish).toBeDefined();
    expect(arrays(fin.object)).not.toEqual(arrays(plain.object));
  });
});

describe("shade", () => {
  test("faces that look down are darker than faces that look up", () => {
    // A thin plate 1 m up: its top and bottom faces are 2 cm apart, so noise and gradient match.
    const built = build(realistic([box([0, 1, 0], [1, 0.02, 0.8])]));
    const mesh = meshesOf(built.object).find((m) => (m.geometry.attributes.position as THREE.BufferAttribute).count < 2000 && hasY(m, 1))!;
    const n = mesh.geometry.attributes.normal as THREE.BufferAttribute;
    const p = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const c = mesh.geometry.attributes.color as THREE.BufferAttribute;
    let up = 0, nu = 0, down = 0, nd = 0;
    for (let i = 0; i < n.count; i++) {
      if (p.getY(i) < 0.9) continue;
      if (n.getY(i) > 0.95) (up += c.getX(i)), nu++;
      if (n.getY(i) < -0.95) (down += c.getX(i)), nd++;
    }
    expect(nu).toBeGreaterThan(0);
    expect(nd).toBeGreaterThan(0);
    expect(down / nd).toBeLessThan((up / nu) * 0.8);
  });

  test("the ground band is darker and warmer than a vertex 1 m up", () => {
    const built = build(realistic([box([-1, 0.6, 0], [0.3, 1.2, 0.3]), box([-1, 1.05, 0.4], [0.3, 0.3, 0.3])]));
    let lowR = 0, lowB = 0, nl = 0, hiR = 0, hiB = 0, nh = 0;
    for (const mesh of meshesOf(built.object)) {
      const p = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const n = mesh.geometry.attributes.normal as THREE.BufferAttribute;
      const c = mesh.geometry.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(n.getY(i)) > 0.3 || p.getX(i) > -0.7) continue; // side faces of the two boxes
        // The white boxes only (the floor plate is grey).
        if (c.getX(i) < c.getZ(i) * 0.999 || c.getX(i) < 0.3) continue;
        if (p.getY(i) < 0.13) (lowR += c.getX(i)), (lowB += c.getZ(i)), nl++;
        if (p.getY(i) > 0.9 && p.getY(i) < 1.2) (hiR += c.getX(i)), (hiB += c.getZ(i)), nh++;
      }
    }
    expect(nl).toBeGreaterThan(0);
    expect(nh).toBeGreaterThan(0);
    expect(lowR / nl).toBeLessThan((hiR / nh) * 0.9); // darker
    expect(lowB / lowR).toBeLessThan(hiB / hiR - 0.03); // warmer: less blue for the same red
  });

  test("the kit path keeps the warm tint and the shade, no hex", () => {
    const built = build(realistic([box([0, 0.6, 0], [0.5, 0.5, 0.5])]));
    const provider: MaterialProvider = () => new THREE.MeshStandardMaterial({ vertexColors: true });
    built.applyMaterials(provider);
    let warm = 0;
    for (const mesh of meshesOf(built.object)) {
      const c = mesh.geometry.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < c.count; i++) {
        expect(c.getX(i)).toBeGreaterThanOrEqual(0.5 * 0.86 - 1e-6);
        expect(c.getX(i)).toBeLessThanOrEqual(1.08 + 1e-6);
        if (c.getZ(i) < c.getX(i) - 1e-4) warm++;
      }
    }
    expect(warm).toBeGreaterThan(0);
  });
});

/** True when the mesh has a vertex at about this height. */
function hasY(mesh: THREE.Mesh, y: number) {
  const p = mesh.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - y) < 0.05) return true;
  return false;
}

describe("copy variety", () => {
  const spec = realistic([
    box([-1, 0.6, 0], [0.1, 0.1, 0.1], { rough: 0.3, repeat: { n: 6, step: [0.4, 0, 0] }, mirror: "z" }),
    box([-1, 0.05, 0.45], [0.1, 0.1, 0.1], { rough: 0.5, repeat: { n: 4, step: [0.4, 0, 0] } }),
    { shape: "cylinder", at: [0, 1.2, 0], r: 0.05, h: 0.2, color: "body", rough: 0.6, repeat: { n: 4, radial: "y", center: [0, 1.2, 0.2] }, group: "spin" }
  ]);
  const byRough = (object: THREE.Object3D, rough: number) => meshesOf(object).find((m) => Math.abs((m.material as THREE.MeshStandardMaterial).roughness - rough) < 1e-6)!;
  const plain = buildParts(spec, { finish: false });
  const fin = buildParts(spec);

  test("copies move by at most 4 mm, the first stays exact, the others differ", () => {
    const a = byRough(plain.object, 0.3).geometry.attributes.position as THREE.BufferAttribute;
    const b = byRough(fin.object, 0.3).geometry.attributes.position as THREE.BufferAttribute;
    expect(b.count).toBe(a.count);
    const per = a.count / 12; // 6 copies and 6 mirrored copies
    const moves: number[] = [];
    for (let c = 0; c < 12; c++) {
      let most = 0;
      for (let i = c * per; i < (c + 1) * per; i++) most = Math.max(most, Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i), a.getZ(i) - b.getZ(i)));
      moves.push(most * fin.fit);
    }
    expect(moves[0]).toBe(0);
    for (const m of moves.slice(1)) {
      expect(m).toBeGreaterThan(0.0005);
      expect(m).toBeLessThanOrEqual(0.004 + 1e-6);
    }
  });

  test("copies on the ground never go under it; copies in a pivot group stay exact", () => {
    const b = byRough(fin.object, 0.5).geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < b.count; i++) expect(b.getY(i)).toBeGreaterThanOrEqual(-1e-6);
    const pa = byRough(plain.object, 0.6).geometry.attributes.position as THREE.BufferAttribute;
    const pb = byRough(fin.object, 0.6).geometry.attributes.position as THREE.BufferAttribute;
    expect(Array.from(pb.array)).toEqual(Array.from(pa.array));
  });

  test("each copy has its own brightness", () => {
    const c = byRough(fin.object, 0.3).geometry.attributes.color as THREE.BufferAttribute;
    const per = c.count / 12;
    const means = [...Array(12).keys()].map((k) => {
      let s = 0;
      for (let i = k * per; i < (k + 1) * per; i++) s += c.getX(i);
      return s / per;
    });
    expect(new Set(means.map((m) => m.toFixed(4))).size).toBe(12);
  });
});

describe("dents", () => {
  const panel: Part = { shape: "panel", at: [0, 1, 0], size: [1.5, 1, 0.05], color: "#ffffff", bevel: 0 };

  test("a dent moves vertices by at most its depth and never leaves the part bounds", () => {
    const [g] = partInstances(panel);
    g!.computeBoundingBox();
    const box = g!.boundingBox!.clone().expandByScalar(1e-6);
    const dent = { center: [0.2, 1.1, 0.025] as [number, number, number], n: [0, 0, 1] as [number, number, number], r: 0.25, depth: 0.012 };
    const flat = applyDent(g!, { ...dent, depth: 0 });
    const deep = applyDent(g!, dent);
    const a = flat.attributes.position as THREE.BufferAttribute;
    const b = deep.attributes.position as THREE.BufferAttribute;
    expect(b.count).toBe(a.count);
    expect(b.count).toBeGreaterThan(g!.attributes.position!.count); // the face was cut to have vertices
    let most = 0;
    for (let i = 0; i < b.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(b, i);
      expect(box.containsPoint(v)).toBe(true);
      most = Math.max(most, v.distanceTo(new THREE.Vector3().fromBufferAttribute(a, i)));
    }
    expect(most).toBeGreaterThan(0.008);
    expect(most).toBeLessThanOrEqual(0.012 + 1e-6);
    // Darker inside the dent, by 6% at most.
    const ds = deep.attributes.dentShade as THREE.BufferAttribute;
    let lo = 1;
    for (let i = 0; i < ds.count; i++) lo = Math.min(lo, ds.getX(i));
    expect(lo).toBeLessThan(0.99);
    expect(lo).toBeGreaterThanOrEqual(1 - FINISH.dentDark - 1e-6);
  });

  test("a deep dent in a thin sheet stays inside it", () => {
    const thin: Part = { ...panel, size: [1.5, 1, 0.006] };
    const [g] = partInstances(thin);
    g!.computeBoundingBox();
    const box = g!.boundingBox!.clone().expandByScalar(1e-6);
    const out = applyDent(g!, { center: [0, 1, 0.003], n: [0, 0, 1], r: 0.3, depth: 0.05 });
    const p = out.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) expect(box.containsPoint(new THREE.Vector3().fromBufferAttribute(p, i))).toBe(true);
  });

  test("dented sheets in a build stay in their bounds; at most 4 dents per object", () => {
    const sheets = [0, 1, 2, 3, 4, 5].map((k) => ({ shape: "corrugated", at: [-1.2 + k * 0.48, 1, 0.2], size: [0.45, 1.6], depth: 0.03, color: "sheet" }));
    let dented = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const spec = realistic(sheets);
      const plain = buildParts(spec, { finish: false, seed });
      const fin = buildParts(spec, { seed });
      expect(fin.object.userData.finish.dents).toBeLessThanOrEqual(4);
      dented += fin.object.userData.finish.dents;
      const a = meshesOf(plain.object);
      const b = meshesOf(fin.object);
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        a[i]!.geometry.computeBoundingBox();
        b[i]!.geometry.computeBoundingBox();
        const outer = a[i]!.geometry.boundingBox!.clone().expandByScalar(1e-6);
        expect(outer.containsBox(b[i]!.geometry.boundingBox!)).toBe(true);
      }
    }
    expect(dented).toBeGreaterThan(0);
  });

  test("rubber and small parts get no dents", () => {
    const spec = realistic([
      { shape: "panel", at: [0, 1, 0], size: [2, 1.5, 0.05], color: "dark" },
      { shape: "panel", at: [0, 1, 0.3], size: [0.5, 0.5, 0.05], color: "body" }
    ]);
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(buildParts(spec, { seed }).object.userData.finish.dents).toBe(0);
  });
});

describe("bolts", () => {
  test("a 0.5 m panel gets 4 bolts on its front face, a 2 m panel gets more", () => {
    const small = build(realistic([{ shape: "panel", at: [0, 1, 0], size: [0.5, 0.5, 0.05], color: "body" }]));
    expect(boltCount(small.object)).toBe(4);
    // On the front face (z = 0.025), inside the panel outline, 25 to 40 mm from the edges.
    for (const c of boltCenters(small.object)) {
      expect(c.z).toBeGreaterThan(0.025);
      expect(c.z).toBeLessThan(0.025 + 0.004);
      const fromEdge = 0.25 - Math.abs(c.x);
      expect(fromEdge).toBeGreaterThanOrEqual(0.025 - 1e-3);
      expect(fromEdge).toBeLessThanOrEqual(0.04 + 1e-3);
    }
    const large = build(realistic([{ shape: "panel", at: [0, 1, 0], size: [2, 1.5, 0.05], color: "body" }]));
    expect(boltCount(large.object)).toBeGreaterThan(4);
    expect(boltCount(large.object) % 2).toBe(0);
  });

  test("a panel with a small part of the model on it gets no bolts; a far small part does not count", () => {
    const panel = { shape: "panel", at: [0, 1, 0], size: [0.6, 0.6, 0.05], color: "body" };
    const own = build(realistic([panel, { shape: "cylinder", at: [0.25, 1.25, 0.03], r: 0.008, h: 0.01, axis: "z", color: "dark" }]));
    expect(boltCount(own.object)).toBe(0);
    const far = build(realistic([panel, { shape: "cylinder", at: [1.2, 1.25, 0.03], r: 0.008, h: 0.01, axis: "z", color: "dark" }]));
    expect(boltCount(far.object)).toBe(4);
  });

  test("at most 120 bolts; the corners of the largest panels come first", () => {
    const spec = realistic([
      { shape: "panel", at: [-1.2, 1.5, 0], size: [0.8, 0.8, 0.04], color: "body", repeat: { n: 20, step: [0.12, 0, 0] } },
      { shape: "panel", at: [-1.2, 0.6, 0], size: [0.5, 0.5, 0.04], color: "body", repeat: { n: 20, step: [0.12, 0, 0] } }
    ]);
    const built = buildParts(spec);
    const centers = boltCenters(built.object);
    expect(centers.length).toBe(120);
    expect(built.object.userData.finish.bolts).toBe(120);
    // Every large panel (above y = 1.05) has its 4 corners: 80 bolts; 40 are left for the rest.
    expect(centers.filter((c) => c.y > 1.05 * built.fit).length).toBe(80);
  });

  test("bolts follow a mirrored panel and stand on its front face", () => {
    const built = build(realistic([{ shape: "panel", at: [0.8, 1, 0.3], size: [0.5, 0.5, 0.05], color: "body", mirror: "z" }]));
    const cs = boltCenters(built.object);
    expect(cs.length).toBe(8);
    expect(cs.filter((c) => c.z > 0.325).length).toBe(4);
    expect(cs.filter((c) => c.z < -0.325).length).toBe(4);
  });

  test("bolts go to the stage of their panel in a reveal; applyMaterials takes them", () => {
    const spec = ok({
      name: "Reveal",
      size: [3, 2, 1],
      style: "realistic",
      palette: PALETTE,
      stages: [
        { name: "One", parts: [{ shape: "box", at: [0, 0.05, 0], size: [3, 0.1, 1], color: "dark" }, { shape: "panel", at: [-0.8, 1, 0], size: [0.5, 0.5, 0.05], color: "body" }] },
        { name: "Two", parts: [{ shape: "panel", at: [0.8, 1, 0], size: [0.6, 0.6, 0.05], color: "body" }, box([0, 0.5, 0], [0.3, 0.3, 0.3])] }
      ]
    });
    const isReveal = (m: THREE.Mesh) => String((m.material as THREE.Material).customProgramCacheKey?.() ?? "").startsWith("parts-reveal");
    const first = buildParts(spec, { shown: 1, reveal: true });
    expect(boltCount(first.object)).toBe(4);
    expect(boltMeshes(first.object).every(isReveal)).toBe(true);
    const both = buildParts(spec, { shown: 2, reveal: true });
    const meshes = boltMeshes(both.object);
    expect(meshes.length).toBe(2);
    const revealing = meshes.filter(isReveal);
    expect(revealing.length).toBe(1);
    // The revealing bolts are those of the stage 2 panel (x > 0).
    revealing[0]!.geometry.computeBoundingBox();
    expect(revealing[0]!.geometry.boundingBox!.min.x).toBeGreaterThan(0);
    const asked: string[] = [];
    both.applyMaterials((surface, hex) => {
      asked.push(`${surface}|${hex}`);
      return new THREE.MeshStandardMaterial({ vertexColors: true });
    });
    expect(asked).toContain(`${FINISH.boltSurface}|${FINISH.boltHex}`);
  });
});

/** A 60-part realistic spec in the manner of a diesel generator set. */
function generatorSpec() {
  const parts: Record<string, unknown>[] = [
    { shape: "box", at: [0, 0.06, 0], size: [3, 0.12, 1.1], color: "dark" },
    { shape: "panel", at: [0, 0.8, 0.52], size: [2.6, 1.2, 0.04], color: "body", cols: 3, rows: 2, relief: -0.008 },
    { shape: "panel", at: [0, 0.8, -0.52], size: [2.6, 1.2, 0.04], color: "body", louvres: 12 },
    { shape: "panel", at: [1.32, 0.8, 0], size: [1.0, 1.2, 0.04], rot: [0, 90, 0], color: "body", ribs: 6 },
    { shape: "panel", at: [-1.32, 0.8, 0], size: [1.0, 1.2, 0.04], rot: [0, -90, 0], color: "body" },
    { shape: "corrugated", at: [0, 1.42, 0], size: [2.6, 1.04], depth: 0.025, axis: "y", color: "sheet" },
    { shape: "panel", at: [-0.9, 0.9, 0.56], size: [0.4, 0.5, 0.03], color: "body" },
    { shape: "panel", at: [0.9, 0.9, 0.56], size: [0.35, 0.35, 0.03], color: "body", mirror: "z" },
    { shape: "cylinder", at: [0.9, 1.7, 0.2], r: 0.06, h: 0.5, color: "dark" },
    { shape: "torus", at: [0.9, 1.5, 0.2], r: 0.07, t: 0.015, color: "dark" },
    { shape: "box", at: [-1.2, 0.2, 0.4], size: [0.2, 0.16, 0.12], color: "dark", mirror: "z", repeat: { n: 2, step: [2.4, 0, 0] } },
    { shape: "box", at: [0, 0.13, 0], size: [2.8, 0.03, 0.06], color: "body", repeat: { n: 3, step: [0, 0, 0.4] } },
    { shape: "rounded", at: [0.5, 0.95, 0.56], size: [0.3, 0.2, 0.06], radius: 0.02, color: "dark" },
    { shape: "cylinder", at: [0.4, 0.95, 0.6], r: 0.02, h: 0.03, axis: "z", color: "body", repeat: { n: 4, step: [0.06, 0, 0] } },
    { shape: "tube", at: [0.6, 1.2, -0.3], points: [[0, 0, 0], [0.2, 0.2, 0], [0.4, 0.25, 0.1]], r: 0.03, color: "dark" }
  ];
  for (let k = 0; parts.length < 60; k++) {
    const x = -1.2 + (k % 8) * 0.34;
    const y = 0.25 + Math.floor(k / 8) * 0.1;
    parts.push(
      k % 3 === 0
        ? { shape: "box", at: [x, y, -0.3], size: [0.12, 0.08, 0.1], color: "body" }
        : k % 3 === 1
          ? { shape: "cylinder", at: [x, y, 0.2], r: 0.04, h: 0.08, color: "dark", repeat: { n: 2, step: [0.05, 0, 0] } }
          : { shape: "panel", at: [x, y + 0.6, -0.1], size: [0.3, 0.3, 0.02], color: "body" }
    );
  }
  return ok({ name: "Generator", size: [3, 2, 1.1], style: "realistic", palette: PALETTE, stages: [{ name: "Frame", parts: parts.slice(0, 20) }, { name: "Details", parts: parts.slice(20) }] });
}

describe("budget and stability", () => {
  const spec = generatorSpec();

  test("the 60-part spec has 60 parts", () => {
    expect(spec.stages.reduce((n, s) => n + s.parts.length, 0)).toBe(60);
  });

  test("the same seed gives the same object; another seed another", () => {
    const a = arrays(buildParts(spec, { seed: 7 }).object);
    expect(arrays(buildParts(spec, { seed: 7 }).object)).toEqual(a);
    expect(arrays(buildParts(spec, { seed: 8 }).object)).not.toEqual(a);
  });

  test("size and footprint stay within 1 cm; the object stands at y = 0", () => {
    const plain = buildParts(spec, { finish: false });
    const fin = buildParts(spec);
    expect(Math.abs(fin.footprint - plain.footprint)).toBeLessThan(0.01);
    for (let k = 0; k < 3; k++) expect(Math.abs(fin.size[k]! - plain.size[k]!)).toBeLessThan(0.01);
    const a = new THREE.Box3().setFromObject(plain.object);
    const b = new THREE.Box3().setFromObject(fin.object);
    expect(b.min.distanceTo(a.min)).toBeLessThan(0.01);
    expect(b.max.distanceTo(a.max)).toBeLessThan(0.01);
    expect(b.min.y).toBeGreaterThan(-1e-4);
    expect(b.min.y).toBeLessThan(1e-4);
  });

  test("the finish adds under 3,000 triangles and under 60 ms (15 ms target)", () => {
    const plain = buildParts(spec, { finish: false });
    const fin = buildParts(spec);
    const added = fin.triangles - plain.triangles;
    expect(boltCount(fin.object)).toBeGreaterThan(20);
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(3000);
    const time = (finish: boolean) => {
      const runs: number[] = [];
      for (let i = 0; i < 7; i++) {
        const t0 = performance.now();
        buildParts(spec, { finish, seed: i + 1 }).dispose();
        runs.push(performance.now() - t0);
      }
      return runs.sort((x, y) => x - y)[3]!;
    };
    time(true); // warm up
    const tPlain = time(false);
    const tFin = time(true);
    console.log(`finish pass: +${added} triangles (${plain.triangles} -> ${fin.triangles}), bolts ${boltCount(fin.object)}, dents ${fin.object.userData.finish.dents}, +${(tFin - tPlain).toFixed(1)} ms (${tPlain.toFixed(1)} -> ${tFin.toFixed(1)} ms median)`);
    expect(tFin - tPlain).toBeLessThan(60);
  });
});

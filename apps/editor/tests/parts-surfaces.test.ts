// Unit tests for the surfaces of the object modeler: the surface table, the spec field, the
// material swap after the build (applyMaterials) and the default chamfer.
// Run: cd apps/editor && bun test tests/parts-surfaces.test.ts
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  EXAMPLE_BIPLANE,
  EXAMPLE_LAMP,
  MODELER_SYSTEM_PROMPT,
  SUBMIT_PARTS_TOOL,
  SURFACES,
  SURFACE_IDS,
  buildParts,
  defaultBevel,
  defaultSurface,
  partInstances,
  prepareSpec,
  specForModeler,
  validateSpec,
  type MaterialProvider,
  type PartsSpec,
  type SurfaceId
} from "../src/lib/generators/parts";

function ok(input: unknown): PartsSpec {
  const v = validateSpec(input);
  if ("error" in v) throw new Error(v.error);
  return v.spec;
}

const box = (at: number[], extra: Record<string, unknown> = {}) => ({ shape: "box", at, size: [0.5, 0.5, 0.5], color: "body", ...extra });

/** body = paint, dark = rubber, one raw hex part, one glowing part. */
const SPEC = {
  name: "Test",
  size: [2, 2, 2],
  palette: [
    { role: "body", hex: "#d9624f", surface: "paint" },
    { role: "dark", hex: "#3a3f4a", surface: "rubber" },
    { role: "lamp", hex: "#ffd98a" }
  ],
  stages: [
    { name: "One", parts: [box([0, 0.25, 0]), box([0.6, 0.25, 0], { color: "dark" }), { shape: "cylinder", at: [-0.6, 0.25, 0], r: 0.2, h: 0.5, color: "#aabbcc" }] },
    { name: "Two", parts: [box([0, 0.75, 0], { color: "lamp", emit: 1.5 }), box([0.6, 0.75, 0], { color: "body" })] }
  ]
};

/** A provider that returns one material per (surface, hex) and remembers each. */
function fakeProvider(skip: SurfaceId[] = []) {
  const made = new Map<string, THREE.MeshStandardMaterial>();
  const provider: MaterialProvider = (surface, hex) => {
    if (skip.includes(surface)) return null;
    const key = `${surface}|${hex}`;
    let m = made.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ vertexColors: true });
      m.userData.key = key;
      made.set(key, m);
    }
    return m;
  };
  return { provider, made };
}

function meshesOf(object: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

/** [min, max] of the color components and whether every vertex is grey (r = g = b). */
function colorStats(mesh: THREE.Mesh) {
  const c = mesh.geometry.attributes.color as THREE.BufferAttribute;
  let lo = Infinity;
  let hi = -Infinity;
  let grey = true;
  for (let i = 0; i < c.count; i++) {
    const r = c.getX(i);
    const g = c.getY(i);
    const b = c.getZ(i);
    lo = Math.min(lo, r, g, b);
    hi = Math.max(hi, r, g, b);
    if (Math.abs(r - g) > 1e-6 || Math.abs(g - b) > 1e-6) grey = false;
  }
  return { lo, hi, grey };
}

const isEmissive = (m: THREE.Material) => ((m as THREE.MeshStandardMaterial).emissiveIntensity ?? 0) > 0 && (m as THREE.MeshStandardMaterial).emissive?.getHex() !== 0;

describe("surface table", () => {
  test("ids are unique and every id has a preset", () => {
    expect(new Set(SURFACE_IDS).size).toBe(SURFACES.length);
    for (const s of SURFACES) expect(s.preset.length).toBeGreaterThan(0);
  });

  test("default surface from the role name, else by style", () => {
    const cases: [string, SurfaceId][] = [
      ["windshield", "glass"],
      ["Lens", "glass"],
      ["tyre", "tire"],
      ["grip", "rubber"],
      ["shoe sole", "rubber"],
      ["planks", "wood"],
      ["gold trim", "brass"],
      ["chrome", "aluminium"],
      ["alu frame", "aluminium"],
      ["steel", "metal"],
      ["rusty iron", "rust"],
      ["stone", "concrete"],
      ["brick", "brick"],
      ["sail", "fabric"],
      ["cable", "rope"]
    ];
    for (const [role, id] of cases) expect(`${role} -> ${defaultSurface(role, "#888888", "toy")}`).toBe(`${role} -> ${id}`);
    expect(defaultSurface("body", "#d9624f", "realistic")).toBe("paint");
    expect(defaultSurface("body", "#d9624f", "toy")).toBe("plastic");
    // Words inside other words do not count.
    expect(defaultSurface("console", "#333333", "toy")).toBe("plastic");
    expect(defaultSurface("rocket", "#ffffff", "realistic")).toBe("paint");
  });
});

describe("spec surfaces", () => {
  test("validation keeps known surfaces and drops unknown ones with an issue", () => {
    const v = validateSpec({
      ...SPEC,
      palette: [
        { role: "body", hex: "#d9624f", surface: "paint" },
        { role: "dark", hex: "#3a3f4a", surface: "lava" },
        { role: "lamp", hex: "#ffd98a", surface: "GLASS" }
      ]
    });
    if ("error" in v) throw new Error(v.error);
    expect(v.spec.surfaces).toEqual({ body: "paint", lamp: "glass" });
    expect(v.spec.palette).toEqual({ body: "#d9624f", dark: "#3a3f4a", lamp: "#ffd98a" });
    expect(v.issues.some((i) => i.includes('unknown surface "lava"'))).toBe(true);
  });

  test("a stored surfaces map and a style survive validation; roles not in the palette are ignored", () => {
    const s = ok({ ...SPEC, palette: { body: "#d9624f", dark: "#3a3f4a", lamp: "#ffd98a" }, surfaces: { body: "hull", ghost: "wood" }, style: "realistic" });
    expect(s.surfaces).toEqual({ body: "hull" });
    expect(s.style).toBe("realistic");
    // Validating the stored spec again gives the same spec (files on disk).
    expect(ok(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  test("an old spec has no surfaces and no style", () => {
    const s = ok({ ...SPEC, palette: { body: "#d9624f", dark: "#3a3f4a", lamp: "#ffd98a" } });
    expect(s.surfaces).toBeUndefined();
    expect(s.style).toBeUndefined();
  });

  test("the modeler sees stored surfaces on the palette items, not the style", () => {
    const text = specForModeler(ok({ ...SPEC, style: "toy" }));
    expect(text).toContain('{"role":"body","hex":"#d9624f","surface":"paint"}');
    expect(text).toContain('{"role":"lamp","hex":"#ffd98a"}');
    expect(text).not.toContain('"surfaces"');
    expect(text).not.toContain('"style"');
  });

  test("the prompt and the tool schema list the surfaces; the examples carry them", () => {
    expect(MODELER_SYSTEM_PROMPT).toContain("SURFACES:");
    for (const id of SURFACE_IDS) expect(MODELER_SYSTEM_PROMPT).toContain(id);
    const item = SUBMIT_PARTS_TOOL.parameters.properties.palette.items as { properties: { surface: { enum: string[] } } };
    expect(item.properties.surface.enum).toEqual([...SURFACE_IDS]);
    for (const ex of [EXAMPLE_LAMP, EXAMPLE_BIPLANE]) {
      const p = prepareSpec(ex);
      if ("error" in p) throw new Error(p.error);
      expect(Object.keys(p.spec.surfaces ?? {}).sort()).toEqual(Object.keys(p.spec.palette).sort());
    }
  });
});

describe("applyMaterials", () => {
  test("before: the flat look with tinted vertex colors", () => {
    const built = buildParts(ok(SPEC));
    for (const mesh of meshesOf(built.object)) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      expect(m.vertexColors).toBe(true);
      expect(m.flatShading).toBe(true);
    }
    expect(meshesOf(built.object).some((mesh) => !colorStats(mesh).grey)).toBe(true);
    built.dispose();
  });

  test("each bucket gets the material of its surface and hex; colors become shade only", () => {
    const s = ok(SPEC);
    const built = buildParts(s);
    const { provider, made } = fakeProvider();
    const n = built.applyMaterials(provider);
    // body (two stages, one bucket), dark, the raw hex part; the lamp glows and is not swapped.
    expect([...made.keys()].sort()).toEqual(["paint|#d9624f", "plastic|#aabbcc", "rubber|#3a3f4a"]);
    expect(n).toBe(3);
    let glowing = 0;
    for (const mesh of meshesOf(built.object)) {
      const m = mesh.material as THREE.Material;
      if (isEmissive(m)) {
        glowing++;
        expect([...made.values()]).not.toContain(m as THREE.MeshStandardMaterial);
        continue;
      }
      expect([...made.values()]).toContain(m as THREE.MeshStandardMaterial);
      const st = colorStats(mesh);
      expect(st.grey).toBe(true);
      expect(st.lo).toBeGreaterThan(0.5);
      expect(st.hi).toBeLessThan(1.2);
    }
    expect(glowing).toBe(1);
    built.dispose();
  });

  test("the style picks the surface of a raw hex color", () => {
    const built = buildParts(ok({ ...SPEC, style: "realistic" }));
    const { provider, made } = fakeProvider();
    built.applyMaterials(provider);
    expect(made.has("paint|#aabbcc")).toBe(true);
    built.dispose();
  });

  test("a null from the provider keeps the flat material and the tinted colors", () => {
    const built = buildParts(ok(SPEC));
    const { provider, made } = fakeProvider(["rubber"]);
    built.applyMaterials(provider);
    const kept = meshesOf(built.object).filter((mesh) => ![...made.values()].includes(mesh.material as THREE.MeshStandardMaterial));
    // The rubber bucket and the glowing lamp.
    expect(kept.length).toBe(2);
    for (const mesh of kept) {
      expect((mesh.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
      expect(colorStats(mesh).grey).toBe(false);
    }
    built.dispose();
  });

  test("a revealing stage keeps the scan-line material, then ends on the provider's", async () => {
    const built = buildParts(ok(SPEC), { reveal: true });
    const { provider, made } = fakeProvider();
    built.applyMaterials(provider);
    const kit = new Set<THREE.Material>(made.values());
    const meshes = meshesOf(built.object).filter((mesh) => !isEmissive(mesh.material as THREE.Material));
    const during = meshes.filter((mesh) => !kit.has(mesh.material as THREE.Material));
    // Stage 2 (the newest) has its own bucket of body while it reveals.
    expect(during.length).toBe(1);
    expect(colorStats(during[0]!).grey).toBe(false);
    await new Promise((r) => setTimeout(r, 1000));
    built.update!();
    for (const mesh of meshes) {
      expect(kit.has(mesh.material as THREE.Material)).toBe(true);
      expect(colorStats(mesh).grey).toBe(true);
    }
    built.dispose();
  });

  test("without applyMaterials the reveal ends on the flat material", async () => {
    const built = buildParts(ok(SPEC), { reveal: true });
    await new Promise((r) => setTimeout(r, 1000));
    built.update!();
    for (const mesh of meshesOf(built.object)) expect((mesh.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    built.dispose();
  });

  test("an old spec with no surfaces builds as before in flat mode", () => {
    const s = ok({ ...SPEC, palette: { body: "#d9624f", dark: "#3a3f4a", lamp: "#ffd98a" } });
    const built = buildParts(s);
    const meshes = meshesOf(built.object);
    expect(meshes.length).toBe(4);
    for (const mesh of meshes) expect((mesh.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    // The body color is in the vertex colors: red is the strongest channel.
    const body = meshes.find((mesh) => {
      const c = mesh.geometry.attributes.color as THREE.BufferAttribute;
      return c.getX(0) > c.getY(0) * 1.5;
    });
    expect(body).toBeDefined();
    // Toy is the default style: the raw hex part is plastic.
    const { provider, made } = fakeProvider();
    built.applyMaterials(provider);
    expect(made.has("plastic|#aabbcc")).toBe(true);
    expect(made.has("plastic|#d9624f")).toBe(true);
    built.dispose();
  });
});

describe("edges and normals", () => {
  test("default bevel: 6% of the thinnest side, 4 to 30 mm, none under 12 mm", () => {
    expect(defaultBevel(0.005)).toBe(0);
    expect(defaultBevel(0.0119)).toBe(0);
    expect(defaultBevel(0.012)).toBeCloseTo(0.004, 6);
    expect(defaultBevel(0.2)).toBeCloseTo(0.012, 6);
    expect(defaultBevel(0.5)).toBeCloseTo(0.03, 6);
    expect(defaultBevel(3)).toBeCloseTo(0.03, 6);
  });

  test("a box without bevel gets a chamfer; a thin plate and bevel 0 stay sharp", () => {
    const tris = (extra: Record<string, unknown>) => {
      const [g] = partInstances({ shape: "box", at: [0, 0, 0], size: [0.5, 0.5, 0.5], color: "#ffffff", ...extra } as never);
      const n = g!.attributes.position!.count / 3;
      g!.dispose();
      return n;
    };
    expect(tris({})).toBeGreaterThan(12);
    expect(tris({ bevel: 0 })).toBe(12);
    expect(tris({ size: [0.5, 0.008, 0.5] })).toBe(12);
  });

  test("an extrude without bevel gets a chamfer", () => {
    const outline: [number, number][] = [[0, 0], [1, 0], [1, 0.5], [0, 0.5]];
    const [a] = partInstances({ shape: "extrude", at: [0, 0, 0], plane: "xy", outline, depth: 0.1, color: "#ffffff" });
    const [b] = partInstances({ shape: "extrude", at: [0, 0, 0], plane: "xy", outline, depth: 0.1, bevel: 0, color: "#ffffff" });
    expect(a!.attributes.position!.count).toBeGreaterThan(b!.attributes.position!.count);
    a!.dispose();
    b!.dispose();
  });

  test("flat parts get face normals; a bevelled box keeps soft normals on its chamfer", () => {
    const s = ok({
      name: "N",
      size: [2, 2, 2],
      palette: [
        { role: "a", hex: "#ff0000" },
        { role: "b", hex: "#00ff00" },
        { role: "c", hex: "#0000ff" }
      ],
      stages: [
        {
          name: "S",
          parts: [
            { shape: "cylinder", at: [-0.6, 0.25, 0], r: 0.2, h: 0.5, color: "a" },
            box([0.6, 0.25, 0], { color: "b" }),
            { shape: "ellipsoid", at: [0, 0.25, 0], size: [0.4, 0.4, 0.4], color: "c", smooth: true }
          ]
        }
      ]
    });
    const built = buildParts(s);
    const byRed = (r: number, g: number) =>
      meshesOf(built.object).find((mesh) => {
        const c = mesh.geometry.attributes.color as THREE.BufferAttribute;
        return Math.sign(c.getX(0)) === r && Math.sign(c.getY(0)) === g;
      })!;
    /** Share of triangles whose three normals differ (a curved shading across the face). */
    const curved = (mesh: THREE.Mesh) => {
      const n = mesh.geometry.attributes.normal as THREE.BufferAttribute;
      let k = 0;
      for (let i = 0; i < n.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(n, i);
        const b = new THREE.Vector3().fromBufferAttribute(n, i + 1);
        const c = new THREE.Vector3().fromBufferAttribute(n, i + 2);
        if (a.distanceTo(b) > 1e-4 || a.distanceTo(c) > 1e-4) k++;
      }
      return k / (n.count / 3);
    };
    expect(curved(byRed(1, 0))).toBe(0); // flat cylinder: hard facets
    expect(curved(byRed(0, 1))).toBeGreaterThan(0.2); // bevelled box: the chamfer turns smoothly
    expect(curved(byRed(0, 0))).toBeGreaterThan(0.8); // smooth ellipsoid keeps vertex normals
    built.dispose();
  });
});

// Mesh builder of the object modeler: a validated PartsSpec becomes one THREE.Group.
// - Each shape becomes a low-poly geometry with soft bevels (nothing looks like a raw cube).
// - mirror and repeat copy the part; mirrored copies are reflected, not rotated.
// - Parts are merged by material (one draw call per material and pivot group).
// - Vertex colors follow the Island kit look (src/vendor/little-habitats/ecology/meshKit.ts):
//   a soft top-to-bottom gradient, a small per-part jitter and darkening near the ground,
//   flat-shaded facets by default.
// - The object stands on the ground (lowest point at y = 0) and is centered in x and z.
// - Staged reveal: `shown` limits the stages; with `reveal` the newest stage grows in with a
//   scan-line shader (a glowing front that rises through the new parts).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { patchWorldMaterial } from "@/vendor/little-habitats/fx/pokefx";
import { resolveColor, type Axis, type Part, type PartsSpec, type Vec3 } from "./spec";

const DEG = Math.PI / 180;

// ── Shapes ────────────────────────────────────────────────────

/** Rotates a geometry whose long axis is +Y so that it lies along `axis`. */
function alongAxis(g: THREE.BufferGeometry, axis: Axis | undefined) {
  if (axis === "z") g.rotateX(Math.PI / 2); // +Y -> +Z
  else if (axis === "x") g.rotateZ(-Math.PI / 2); // +Y -> +X
  return g;
}

/** Bends a +Y aligned geometry of height h by `deg` degrees toward +X (an arc of the axis). */
function bendY(g: THREE.BufferGeometry, h: number, deg: number) {
  const theta = deg * DEG;
  if (Math.abs(theta) < 1e-3) return g;
  const R = h / theta;
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const a = ((y + h / 2) / h) * theta; // angle along the arc
    const rr = R - x;
    p.setXY(i, R - rr * Math.cos(a), -h / 2 + rr * Math.sin(a));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function outlineShape(pts: [number, number][]) {
  const clean = pts.slice();
  const a = clean[0]!;
  const b = clean[clean.length - 1]!;
  if (clean.length > 3 && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) clean.pop();
  return new THREE.Shape(clean.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** Extrudes a 2D outline in `plane`, centered on the thickness. */
function extrudeIn(pts: [number, number][], plane: "xy" | "xz" | "zy", depth: number, bevel: number) {
  const span = Math.max(...pts.map((p) => Math.abs(p[0])), ...pts.map((p) => Math.abs(p[1])), 0.01);
  const b = Math.min(bevel, depth * 0.45, span * 0.2);
  const g = new THREE.ExtrudeGeometry(outlineShape(pts), {
    depth: Math.max(0.001, depth - 2 * b),
    bevelEnabled: b > 1e-4,
    bevelThickness: b,
    bevelSize: b * 0.7,
    bevelOffset: -b * 0.7, // keeps the outline at its written size
    bevelSegments: 1,
    curveSegments: 4
  });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  if (plane === "xz") g.rotateX(Math.PI / 2); // (u, v, w) -> (u, -w, v)
  else if (plane === "zy") g.rotateY(-Math.PI / 2); // (u, v, w) -> (-w, v, u)
  return g;
}

/** Geometry of one part in its own frame (before at / rot / scale). */
export function shapeGeometry(p: Part): THREE.BufferGeometry {
  const sides = p.sides;
  switch (p.shape) {
    case "box": {
      const [x, y, z] = p.size!;
      const m = Math.min(x, y, z);
      const bevel = Math.min(p.bevel ?? m * 0.12, m * 0.49);
      const g = bevel > 1e-4 ? new RoundedBoxGeometry(x, y, z, 1, bevel) : new THREE.BoxGeometry(x, y, z);
      if (p.taper) {
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const t = (pos.getY(i) + y / 2) / y;
          pos.setX(i, pos.getX(i) * (1 + (p.taper[0] - 1) * t));
          pos.setZ(i, pos.getZ(i) * (1 + (p.taper[1] - 1) * t));
        }
        pos.needsUpdate = true;
        g.computeVertexNormals();
      }
      return g;
    }
    case "wedge": {
      const [x, y, z] = p.size!;
      const pts: [number, number][] = [
        [-z / 2, -y / 2],
        [z / 2, -y / 2],
        [-z / 2, y / 2]
      ];
      return extrudeIn(pts, "zy", x, p.bevel ?? Math.min(x, y, z) * 0.06);
    }
    case "ellipsoid": {
      const s = sides ?? 14;
      const g = new THREE.SphereGeometry(1, s, Math.max(6, Math.round(s * 0.6)));
      const floor = -1 + 2 * (p.clip ?? 0);
      const pos = g.attributes.position as THREE.BufferAttribute;
      if (p.clip) for (let i = 0; i < pos.count; i++) if (pos.getY(i) < floor) pos.setY(i, floor);
      const [x, y, z] = p.size!;
      g.scale(x / 2, y / 2, z / 2);
      // A clipped ellipsoid keeps `at` as the center of the full ellipsoid.
      g.computeVertexNormals();
      return g;
    }
    case "cylinder":
    case "cone": {
      const r = p.r!;
      const h = p.h!;
      const top = p.r2 ?? (p.shape === "cone" ? 0 : r);
      const g = new THREE.CylinderGeometry(top, r, h, sides ?? 12, p.bend ? 8 : 1);
      if (p.bend) bendY(g, h, p.bend);
      return alongAxis(g, p.axis);
    }
    case "capsule": {
      const r = p.r!;
      const g = new THREE.CapsuleGeometry(r, Math.max(0, p.h! - 2 * r), 3, sides ?? 10, 1);
      return alongAxis(g, p.axis);
    }
    case "torus": {
      const g = new THREE.TorusGeometry(p.r!, p.t!, 6, sides ?? 20, (p.arc ?? 360) * DEG);
      // Torus hole is along Z; "y" lays it flat, "x" stands it up facing x (a wheel on an axle along x).
      const axis = p.axis ?? "y";
      if (axis === "y") g.rotateX(Math.PI / 2);
      else if (axis === "x") g.rotateY(Math.PI / 2);
      return g;
    }
    case "lathe": {
      let prof = p.profile!.slice();
      if (prof[0]![1] > prof[prof.length - 1]![1]) prof = prof.reverse();
      const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
      if (pts[0]!.x > 1e-4) pts.unshift(new THREE.Vector2(0, pts[0]!.y));
      if (pts[pts.length - 1]!.x > 1e-4) pts.push(new THREE.Vector2(0, pts[pts.length - 1]!.y));
      const g = new THREE.LatheGeometry(pts, sides ?? 14);
      return alongAxis(g, p.axis);
    }
    case "extrude": {
      const pts = p.outline!;
      const span = Math.max(...pts.map((q) => Math.abs(q[0])), ...pts.map((q) => Math.abs(q[1])));
      return extrudeIn(pts, p.plane ?? "xy", p.depth!, p.bevel ?? Math.min(p.depth! * 0.3, span * 0.05));
    }
    case "tube": {
      const pts = p.points!.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const r = p.r!;
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      const g = new THREE.TubeGeometry(curve, Math.max(2, (pts.length - 1) * 6), r, sides ?? 8, false);
      const parts: THREE.BufferGeometry[] = [clean(g)];
      for (const end of [pts[0]!, pts[pts.length - 1]!]) {
        const cap = new THREE.SphereGeometry(r, sides ?? 8, 5);
        cap.translate(end.x, end.y, end.z);
        parts.push(clean(cap));
      }
      return mergeGeometries(parts)!;
    }
  }
}

/** Keeps position and normal only, non-indexed (so all parts merge). */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals();
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (name !== "position" && name !== "normal") out.deleteAttribute(name);
  out.morphAttributes = {};
  out.clearGroups();
  if (out !== g) g.dispose();
  return out;
}

function flipWinding(g: THREE.BufferGeometry) {
  for (const name of ["position", "normal"]) {
    const a = g.attributes[name] as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const arr = a.array as Float32Array;
    for (let i = 0; i + 9 <= arr.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const t = arr[i + 3 + k]!;
        arr[i + 3 + k] = arr[i + 6 + k]!;
        arr[i + 6 + k] = t;
      }
    }
    a.needsUpdate = true;
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

function v(a: Vec3) {
  return new THREE.Vector3(a[0], a[1], a[2]);
}

function axisVector(a: Axis) {
  return a === "x" ? new THREE.Vector3(1, 0, 0) : a === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
}

/** World matrices (spec space) of every copy of a part: repeat, then mirror. */
export function partMatrices(p: Part): { m: THREE.Matrix4; mirrored: boolean }[] {
  tmpE.set((p.rot?.[0] ?? 0) * DEG, (p.rot?.[1] ?? 0) * DEG, (p.rot?.[2] ?? 0) * DEG, "XYZ");
  tmpQ.setFromEuler(tmpE);
  tmpS.set(p.scale?.[0] ?? 1, p.scale?.[1] ?? 1, p.scale?.[2] ?? 1);
  const base = new THREE.Matrix4().compose(v(p.at), tmpQ, tmpS);
  const copies: THREE.Matrix4[] = [];
  const n = p.repeat?.n ?? 1;
  for (let i = 0; i < n; i++) {
    if (i === 0 || !p.repeat) copies.push(base.clone());
    else if (p.repeat.radial) {
      const c = v(p.repeat.center ?? p.at);
      const rot = new THREE.Matrix4().makeRotationAxis(axisVector(p.repeat.radial), (i / n) * Math.PI * 2);
      const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)).multiply(base);
      copies.push(m);
    } else if (p.repeat.step) {
      const s = p.repeat.step;
      copies.push(new THREE.Matrix4().makeTranslation(s[0] * i, s[1] * i, s[2] * i).multiply(base));
    }
  }
  const out = copies.map((m) => ({ m, mirrored: false }));
  if (p.mirror) {
    const reflect = p.mirror === "x" ? new THREE.Matrix4().makeScale(-1, 1, 1) : new THREE.Matrix4().makeScale(1, 1, -1);
    for (const m of copies) out.push({ m: reflect.clone().multiply(m), mirrored: true });
  }
  return out;
}

/** Every copy of a part as a non-indexed geometry in spec space (position + normal). */
export function partInstances(p: Part): THREE.BufferGeometry[] {
  const local = clean(shapeGeometry(p));
  const out: THREE.BufferGeometry[] = [];
  for (const { m, mirrored } of partMatrices(p)) {
    const g = local.clone().applyMatrix4(m);
    if (mirrored) flipWinding(g);
    out.push(g);
  }
  local.dispose();
  return out;
}

/** Axis-aligned bounds of all copies of a part (spec space). */
export function partBounds(p: Part): THREE.Box3 {
  const box = new THREE.Box3();
  for (const g of partInstances(p)) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
    g.dispose();
  }
  return box;
}

// ── Materials ─────────────────────────────────────────────────

type MatKey = { flat: boolean; rough: number; metal: number; emit: number; emitColor?: string };

function matKeyOf(p: Part, palette: Record<string, string>): MatKey {
  const emit = p.emit ?? 0;
  return {
    flat: !p.smooth,
    rough: Math.round((p.rough ?? (p.metal ? 0.45 : 0.82)) * 10) / 10,
    metal: Math.round((p.metal ?? 0) * 10) / 10,
    emit: Math.round(emit * 4) / 4,
    emitColor: emit > 0 ? resolveColor(p.color, palette) : undefined
  };
}
function keyText(k: MatKey) {
  return `${k.flat ? "f" : "s"}|${k.rough}|${k.metal}|${k.emit}|${k.emitColor ?? ""}`;
}

function materialParams(k: MatKey): THREE.MeshStandardMaterialParameters {
  return {
    vertexColors: true,
    flatShading: k.flat,
    roughness: k.rough,
    metalness: k.metal,
    side: THREE.DoubleSide, // a wrong outline winding never makes a part disappear
    ...(k.emit > 0 ? { emissive: new THREE.Color(k.emitColor), emissiveIntensity: k.emit } : {})
  };
}

const baseMaterials = new Map<string, THREE.Material>();
/** Shared material of a key (one shader program per key for the whole session). */
function baseMaterial(k: MatKey): THREE.Material {
  const key = keyText(k);
  let m = baseMaterials.get(key);
  if (!m) {
    m = patchWorldMaterial(new THREE.MeshStandardMaterial(materialParams(k)), { snow: k.emit > 0 ? 0 : 1, cacheKey: `parts|${key}` });
    baseMaterials.set(key, m);
  }
  return m;
}

const REVEAL_SECONDS = 0.9;

/** A per-build material that hides fragments above a rising front and lights the front. */
type RevealUniforms = { uPFront: THREE.IUniform<number>; uPBand: THREE.IUniform<number>; uPColor: THREE.IUniform<THREE.Color> };

function revealMaterial(k: MatKey, uniforms: RevealUniforms) {
  const m = new THREE.MeshStandardMaterial(materialParams(k));
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vPWorldY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPWorldY = (modelMatrix * vec4(transformed, 1.0)).y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPWorldY;\nuniform float uPFront;\nuniform float uPBand;\nuniform vec3 uPColor;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  float pY = vPWorldY;
  if (pY > uPFront) discard;
  float pBand = 1.0 - smoothstep(0.0, uPBand, uPFront - pY);
  totalEmissiveRadiance += uPColor * pBand * 2.5;`
      );
  };
  m.customProgramCacheKey = () => `parts-reveal|${keyText(k)}`;
  return m;
}

// ── Colors ────────────────────────────────────────────────────

function hash01(a: number, b: number, seed: number) {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Writes vertex colors: base color, per-part jitter, top-to-bottom gradient, ground AO. */
function paint(g: THREE.BufferGeometry, hex: string, jitter: number, groundY: number, aoHeight: number, emissive: boolean) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  g.computeBoundingBox();
  const lo = g.boundingBox!.min.y;
  const span = Math.max(1e-4, g.boundingBox!.max.y - lo);
  const base = new THREE.Color(hex);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let f = 1 + jitter;
    if (!emissive) {
      f *= 1 - 0.16 * (1 - (y - lo) / span);
      const h = y - groundY;
      if (h < aoHeight) f *= 1 - 0.22 * (1 - Math.max(0, h) / aoHeight);
    }
    colors[i * 3] = base.r * f;
    colors[i * 3 + 1] = base.g * f;
    colors[i * 3 + 2] = base.b * f;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

// ── Build ─────────────────────────────────────────────────────

export type BuildOptions = {
  /** Number of stages to show (default: all). */
  shown?: number;
  /** Grow the newest shown stage in with the scan-line shader. */
  reveal?: boolean;
  /** Longest side of the final object in meters (default: the longest side of spec.size). */
  fitSize?: number;
  seed?: number;
};

export type BuiltParts = {
  object: THREE.Group;
  /** Footprint radius in meters (largest distance from the center axis, in x and z). */
  footprint: number;
  /** Final size [x, y, z] in meters. */
  size: Vec3;
  /** Scale applied to the spec coordinates. */
  fit: number;
  triangles: number;
  update?: () => void;
  dispose: () => void;
};

type Bucket = { key: MatKey; group?: string; reveal: boolean; geos: THREE.BufferGeometry[] };

/** Builds the object of a validated spec. */
export function buildParts(spec: PartsSpec, options: BuildOptions = {}): BuiltParts {
  const seed = options.seed ?? 1;
  const shown = Math.max(1, Math.min(spec.stages.length, options.shown ?? spec.stages.length));
  const newest = shown - 1;

  // Copies of every part (all stages: the bounds of the full object keep each stage in place).
  const perPart = spec.stages.map((s) => s.parts.map((p) => partInstances(p)));
  const bounds = new THREE.Box3();
  for (const stage of perPart)
    for (const list of stage)
      for (const g of list) {
        g.computeBoundingBox();
        bounds.union(g.boundingBox!);
      }
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 1e-3);
  const target = options.fitSize ?? Math.max(...spec.size);
  const fit = Math.min(20, Math.max(0.02, target / longest));
  const offset = new THREE.Vector3(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  const aoHeight = 0.18 / fit;

  const buckets = new Map<string, Bucket>();
  let footprint = 0;
  const revealBox = new THREE.Box3();
  spec.stages.forEach((stage, si) => {
    stage.parts.forEach((p, pi) => {
      const list = perPart[si]![pi]!;
      if (si >= shown) {
        list.forEach((g) => g.dispose());
        return;
      }
      const key = matKeyOf(p, spec.palette);
      const reveal = Boolean(options.reveal) && si === newest;
      const pivot = p.group ? spec.groups?.[p.group] : undefined;
      const bucketKey = `${p.group ?? ""}|${keyText(key)}|${reveal ? "r" : ""}`;
      let bucket = buckets.get(bucketKey);
      if (!bucket) buckets.set(bucketKey, (bucket = { key, group: pivot ? p.group : undefined, reveal, geos: [] }));
      const jitter = (hash01(si, pi, seed) - 0.5) * 0.08;
      for (const g of list) {
        g.translate(offset.x, offset.y, offset.z);
        paint(g, resolveColor(p.color, spec.palette), jitter, 0, aoHeight, (p.emit ?? 0) > 0);
        g.computeBoundingBox();
        const b = g.boundingBox!;
        footprint = Math.max(footprint, Math.hypot(Math.max(-b.min.x, b.max.x), Math.max(-b.min.z, b.max.z)));
        if (reveal) revealBox.union(b);
        if (pivot) g.translate(-(pivot[0] + offset.x), -(pivot[1] + offset.y), -(pivot[2] + offset.z));
        bucket.geos.push(g);
      }
    });
  });

  const root = new THREE.Group();
  root.name = spec.name;
  root.scale.setScalar(fit);
  const pivots = new Map<string, THREE.Group>();
  const pivotOf = (name: string) => {
    let g = pivots.get(name);
    if (!g) {
      const pv = spec.groups![name]!;
      g = new THREE.Group();
      g.name = name;
      g.position.set(pv[0] + offset.x, pv[1] + offset.y, pv[2] + offset.z);
      root.add(g);
      pivots.set(name, g);
    }
    return g;
  };

  const owned: THREE.BufferGeometry[] = [];
  const revealMats: THREE.Material[] = [];
  const revealMeshes: { mesh: THREE.Mesh; base: THREE.Material }[] = [];
  // Same edge color as the editor's build reveal (src/lib/build-reveal.ts).
  const uniforms: RevealUniforms = { uPFront: { value: -1e6 }, uPBand: { value: 0.12 }, uPColor: { value: new THREE.Color("#5cf2b0") } };
  let triangles = 0;
  for (const bucket of buckets.values()) {
    if (bucket.geos.length === 0) continue;
    const merged = bucket.geos.length === 1 ? bucket.geos[0]! : mergeGeometries(bucket.geos);
    if (bucket.geos.length > 1) bucket.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    if (!bucket.key.flat) merged.computeVertexNormals();
    merged.computeBoundingSphere();
    owned.push(merged);
    triangles += merged.attributes.position!.count / 3;
    const base = baseMaterial(bucket.key);
    let material = base;
    if (bucket.reveal) {
      material = revealMaterial(bucket.key, uniforms);
      revealMats.push(material);
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (bucket.reveal) revealMeshes.push({ mesh, base });
    (bucket.group ? pivotOf(bucket.group) : root).add(mesh);
  }

  const finalSize: Vec3 = [size.x * fit, size.y * fit, size.z * fit];
  root.userData.footprint = footprint * fit;
  root.userData.partsSize = finalSize;

  let update: (() => void) | undefined;
  if (revealMeshes.length > 0) {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const pad = 0.04 * (revealBox.max.y - revealBox.min.y) + 0.01;
    const local = revealBox.clone();
    const world = new THREE.Box3();
    let done = false;
    uniforms.uPBand.value = Math.max(0.05, 0.08 * fit * (revealBox.max.y - revealBox.min.y));
    update = () => {
      if (done) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const t = Math.min(1, (now - start) / (REVEAL_SECONDS * 1000));
      root.updateWorldMatrix(true, false);
      world.copy(local).applyMatrix4(root.matrixWorld);
      const e = 1 - Math.pow(1 - t, 2);
      uniforms.uPFront.value = world.min.y - pad * fit + (world.max.y - world.min.y + 2 * pad * fit) * e;
      if (t >= 1) {
        done = true;
        for (const r of revealMeshes) r.mesh.material = r.base;
        revealMats.forEach((m) => m.dispose());
      }
    };
    update();
  }

  return {
    object: root,
    footprint: footprint * fit,
    size: finalSize,
    fit,
    triangles,
    update,
    dispose: () => {
      owned.forEach((g) => g.dispose());
      revealMats.forEach((m) => m.dispose());
    }
  };
}

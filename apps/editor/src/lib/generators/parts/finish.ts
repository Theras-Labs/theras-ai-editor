// Finish pass of the object modeler (Phase B of the procedural quality plan). It runs on
// realistic objects only and adds what the port kit's hand-written props have and a clean
// mock-up lacks:
// - a shade that follows gravity: faces that look down are darker, the lowest 20 cm is darker
//   and warmer (ground dirt), two scales of value noise break up large flat areas;
// - repeated and mirrored copies are not exact clones: each gets a small shift, turn and
//   brightness of its own;
// - dents in large sheet metal and painted parts;
// - bolts at the corners and along the long edges of panels.
// All sizes are in real meters. Mesh positions are in spec units and the root is scaled by
// `fit`, so a real length L is L / fit in spec units.
// The pass is deterministic: the same spec and seed give the same geometry.
import * as THREE from "three";
import type { Part, PartsSpec } from "./spec";
import type { SurfaceId } from "./surfaces";
import { panelFrame } from "./builders";

type V3 = [number, number, number];

/** Numbers of the finish pass (real meters, fractions of the shade). */
export const FINISH = {
  /** Value noise: large and small period (m) and amplitude. */
  noiseLarge: { period: 1.3, amp: 0.09 },
  noiseSmall: { period: 0.25, amp: 0.04 },
  /** Faces that look down: darkening at -normal.y = 1, starting at -normal.y = 0.3. */
  downDark: 0.24,
  downStart: 0.3,
  /** Ground band: height (m), darkening and warm tint at y = 0. */
  groundBand: 0.2,
  groundDark: 0.28,
  /** Multiplier of green and blue at y = 0 (red stays 1). */
  warmG: 0.94,
  warmB: 0.86,
  /** Top-to-bottom gradient over the whole object. */
  gradient: 0.08,
  shadeMin: 0.5,
  shadeMax: 1.08,
  /** Instance variety: shift (m), largest turn (degrees), largest total move (m), brightness. */
  shiftMin: 0.001,
  shiftMax: 0.003,
  turnDeg: 0.6,
  moveMax: 0.004,
  bright: 0.04,
  /** Dents. */
  dentMinSide: 0.6,
  dentRadius: [0.12, 0.3] as const,
  dentDepth: [0.005, 0.012] as const,
  dentDark: 0.06,
  dentsPerPart: 2,
  dentsPerObject: 4,
  /**
   * Triangles the dents may add to one object. With the bolt limit (120 x 16 = 1,920) the
   * finish pass adds fewer than 3,000 triangles to any object. A dent that would go over is
   * left out (in stage and part order, so a partial build keeps the same dents).
   */
  dentTriangles: 1000,
  /** Bolts. */
  boltMinSide: 0.25,
  boltInset: [0.025, 0.04] as const,
  boltRadius: 0.01,
  boltRadiusLarge: 0.014,
  boltLargePanel: 1.0,
  boltHeight: 0.006,
  boltEdgePanel: 1.2,
  boltPitch: 0.4,
  boltLimit: 120,
  /** A part under this real size is a fastener the model made itself. */
  smallPart: 0.04,
  boltHex: "#3a3d42",
  boltSurface: "steel-dark" as SurfaceId
} as const;

/**
 * Surfaces that are sheet metal or paint on metal, the only ones that get dents. Cast or thick
 * surfaces (diamond plate, concrete), soft ones (rubber, fabric) and non-metal ones (wood,
 * plastic, glass, ceramic, carbon) do not dent this way.
 */
export const DENT_SURFACES: readonly SurfaceId[] = ["paint", "metal", "steel-dark", "aluminium", "anodized", "hull", "galvanized", "rust"];

/** Triangles of one bolt: 6 side quads and a hexagon top (no bottom, it sits on the face). */
export const BOLT_TRIANGLES = 16;

// ── Random numbers and noise ──────────────────────────────────

function hashInts(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

/** A small seeded generator (mulberry32), values in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The build seed as an integer (a seed can be any number). */
function seedInt(seed: number): number {
  return Math.floor(seed * 9973) | 0;
}

/** Hash of a lattice point in [0, 1). A fixed signature: the noise calls it 16 times a vertex. */
function lattice(x: number, y: number, z: number, s: number) {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f) ^ Math.imul(s, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** 3D value noise in [0, 1], smooth (trilinear with a smoothstep). */
function valueNoise(x: number, y: number, z: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = l(lattice(ix, iy, iz, s), lattice(ix + 1, iy, iz, s), ux);
  const x10 = l(lattice(ix, iy + 1, iz, s), lattice(ix + 1, iy + 1, iz, s), ux);
  const x01 = l(lattice(ix, iy, iz + 1, s), lattice(ix + 1, iy, iz + 1, s), ux);
  const x11 = l(lattice(ix, iy + 1, iz + 1, s), lattice(ix + 1, iy + 1, iz + 1, s), ux);
  return l(l(x00, x10, uy), l(x01, x11, uy), uz);
}

// ── Shade ─────────────────────────────────────────────────────

export type FinishShadeOptions = {
  /** Per-part jitter (as in the plain shade). */
  jitter: number;
  emissive: boolean;
  /** Meters per spec unit. */
  fit: number;
  /** Height of the whole object in spec units (the object stands at y = 0). */
  height: number;
  seed: number;
  /** Brightness of this instance (1 for the first copy). */
  bright: number;
};

/**
 * The shade of a finished build. Sets a "shade" attribute (one value per vertex) and a "warm"
 * attribute (0..1: how much of the warm ground tint the vertex gets). Reads and removes the
 * "dentShade" attribute that a dent leaves. The geometry must already stand on y = 0.
 */
export function finishShade(g: THREE.BufferGeometry, o: FinishShadeOptions) {
  const pos = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
  const nrm = (g.attributes.normal as THREE.BufferAttribute).array as Float32Array;
  const dentAttr = g.attributes.dentShade as THREE.BufferAttribute | undefined;
  const dent = dentAttr ? (dentAttr.array as Float32Array) : null;
  if (dentAttr) g.deleteAttribute("dentShade");
  const count = pos.length / 3;
  const shade = new Float32Array(count);
  const warm = new Float32Array(count);
  const s = seedInt(o.seed);
  const F = FINISH;
  const kL = o.fit / F.noiseLarge.period;
  const kS = o.fit / F.noiseSmall.period;
  const height = Math.max(1e-6, o.height);
  for (let i = 0; i < count; i++) {
    let f = 1 + o.jitter;
    if (!o.emissive) {
      const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
      f *= o.bright;
      f *= 1 + (valueNoise(x * kL, y * kL, z * kL, s) - 0.5) * 2 * F.noiseLarge.amp;
      f *= 1 + (valueNoise(x * kS + 31.7, y * kS + 17.3, z * kS + 5.1, s + 1) - 0.5) * 2 * F.noiseSmall.amp;
      const down = Math.min(1, Math.max(0, (-nrm[i * 3 + 1]! - F.downStart) / (1 - F.downStart)));
      f *= 1 - F.downDark * down;
      const h = Math.max(0, y * o.fit);
      if (h < F.groundBand) {
        const t = 1 - h / F.groundBand;
        f *= 1 - F.groundDark * t;
        warm[i] = t;
      }
      f *= 1 - F.gradient * (1 - Math.min(1, Math.max(0, y / height)));
      if (dent) f *= dent[i]!;
      f = Math.min(F.shadeMax, Math.max(F.shadeMin, f));
    }
    shade[i] = f;
  }
  g.setAttribute("shade", new THREE.BufferAttribute(shade, 1));
  g.setAttribute("warm", new THREE.BufferAttribute(warm, 1));
}

/** The warm tint of a vertex: (1, g, b) multipliers for a warm value 0..1. */
export function warmTint(w: number): [number, number, number] {
  return [1, 1 - (1 - FINISH.warmG) * w, 1 - (1 - FINISH.warmB) * w];
}

// ── Instance variety ──────────────────────────────────────────

export type Variety = { m: THREE.Matrix4 | null; bright: number };

/**
 * Variety of copy j of a part: a shift of 1 to 3 mm in a seeded direction and a turn about the
 * copy's own center, limited so that no vertex moves more than 4 mm in all. The first copy
 * stays exact. A copy that stands on the ground only turns about the vertical and never moves
 * down, so the object still stands at y = 0.
 */
export function instanceVariety(seed: number, si: number, pi: number, j: number, box: THREE.Box3, groundY: number, fit: number): Variety {
  if (j === 0) return { m: null, bright: 1 };
  const F = FINISH;
  const r = rng(hashInts(seedInt(seed), si, pi, j, 0x7a11));
  const bright = 1 + (r() * 2 - 1) * F.bright;
  const shiftReal = F.shiftMin + r() * (F.shiftMax - F.shiftMin);
  const onGround = (box.min.y - groundY) * fit < 0.005;
  // A seeded direction on the sphere.
  const phi = r() * Math.PI * 2;
  const cz = r() * 2 - 1;
  const sz = Math.sqrt(1 - cz * cz);
  const dir = new THREE.Vector3(sz * Math.cos(phi), cz, sz * Math.sin(phi));
  if (onGround) dir.y = Math.abs(dir.y);
  const shift = dir.multiplyScalar(shiftReal / fit);
  // The turn moves a vertex by at most angle x radius; the radius is half the box diagonal.
  const center = box.getCenter(new THREE.Vector3());
  const radiusReal = (box.getSize(new THREE.Vector3()).length() / 2) * fit;
  const room = F.moveMax - shiftReal - 0.0002;
  const cap = Math.min(F.turnDeg * (Math.PI / 180), radiusReal > 1e-6 ? room / radiusReal : 0);
  const angle = (r() * 2 - 1) * cap;
  const axis = onGround
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
  if (axis.lengthSq() < 0.5) axis.set(0, 1, 0);
  const m = new THREE.Matrix4()
    .makeTranslation(center.x + shift.x, center.y + shift.y, center.z + shift.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  return { m, bright };
}

// ── Dents ─────────────────────────────────────────────────────

/** A dent in spec space: center on the face, outward face normal, radius and depth. */
export type Dent = { center: V3; n: V3; r: number; depth: number };

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** A vertex while slicing: x, y, z, nx, ny, nz, dentShade. */
type Vtx = number[];

function lerpVtx(a: Vtx, b: Vtx, t: number): Vtx {
  const out = new Array<number>(7);
  for (let k = 0; k < 7; k++) out[k] = a[k]! + (b[k]! - a[k]!) * t;
  return out;
}

/** Splits a convex polygon by the plane dot(p, ax) = c into the two sides. */
function splitPoly(poly: Vtx[], ax: V3, c: number): [Vtx[], Vtx[]] {
  const a: Vtx[] = [];
  const b: Vtx[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = dot(p, ax) - c;
    const sq = dot(q, ax) - c;
    if (sp <= 0) a.push(p);
    if (sp >= 0) b.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const m = lerpVtx(p, q, sp / (sp - sq));
      a.push(m);
      b.push(m);
    }
  }
  return [a, b];
}

function basisOf(n: V3): [V3, V3] {
  const helper: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = new THREE.Vector3(...helper).cross(new THREE.Vector3(...n)).normalize();
  const v = new THREE.Vector3(...n).cross(u).normalize();
  return [[u.x, u.y, u.z], [v.x, v.y, v.z]];
}

/**
 * Pushes the vertices inside the dent radius toward the inside of the part (against the face
 * normal), with the falloff (1 - d^2)^2 of the port kit's container dents. The triangles under
 * the dent are first cut by a 5 x 5 grid of planes, so a flat face has vertices to move. A cut
 * is a function of the position only, so two triangles that share an edge cut it at the same
 * points and no crack opens. A vertex moves in proportion to how near it is to the front of
 * the part, so the back stays put and the dent is never deeper than 80% of the thickness. The
 * result is clamped to the part's own bounding box. Touched triangles keep their look: their
 * normals turn with the face (a flat face gets the new face normal). Darkens by up to 6%.
 * Returns a new geometry; the input is not changed.
 */
export function applyDent(g: THREE.BufferGeometry, dent: Dent): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const ds = g.attributes.dentShade as THREE.BufferAttribute | undefined;
  const N = dent.n;
  const [U, V] = basisOf(N);
  g.computeBoundingBox();
  const box = g.boundingBox!.clone();
  let back = Infinity;
  let front = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d = pos.getX(i) * N[0] + pos.getY(i) * N[1] + pos.getZ(i) * N[2];
    back = Math.min(back, d);
    front = Math.max(front, d);
  }
  const thick = Math.max(1e-9, front - back);
  const depth = Math.min(dent.depth, thick * 0.8);
  const frontness = (p: ArrayLike<number>) => Math.min(1, Math.max(0, (dot(p, N) - back) / thick));
  const cu = dot(dent.center, U);
  const cv = dot(dent.center, V);
  const r = dent.r;
  const cuts = [-2, -1, 0, 1, 2].map((k) => (k * r) / 3);

  const out: number[] = [];
  const emit = (a: Vtx) => out.push(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!, a[6]!);
  for (let t = 0; t < pos.count; t += 3) {
    const tri: Vtx[] = [0, 1, 2].map((k) => {
      const i = t + k;
      return [pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i), ds ? ds.getX(i) : 1];
    });
    const us = tri.map((p) => dot(p, U));
    const vs = tri.map((p) => dot(p, V));
    const touches =
      Math.max(...tri.map(frontness)) > 1e-4 &&
      Math.max(...us) > cu - r && Math.min(...us) < cu + r && Math.max(...vs) > cv - r && Math.min(...vs) < cv + r;
    if (!touches) {
      tri.forEach(emit);
      continue;
    }
    let polys: Vtx[][] = [tri];
    for (const [ax, c0] of [[U, cu], [V, cv]] as [V3, number][])
      for (const c of cuts) {
        const next: Vtx[][] = [];
        for (const poly of polys) {
          const s = poly.map((p) => dot(p, ax) - (c0 + c));
          if (Math.min(...s) < 0 && Math.max(...s) > 0) {
            for (const half of splitPoly(poly, ax, c0 + c)) if (half.length >= 3) next.push(half);
          } else next.push(poly);
        }
        polys = next;
      }
    for (const poly of polys)
      for (let k = 1; k + 1 < poly.length; k++) {
        const a = poly[0]!, b = poly[k]!, c = poly[k + 1]!;
        const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
        const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
        const cx = e1[1]! * e2[2]! - e1[2]! * e2[1]!, cy = e1[2]! * e2[0]! - e1[0]! * e2[2]!, cz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
        if (cx * cx + cy * cy + cz * cz < 1e-24) continue; // a sliver with no area
        emit(a);
        emit(b);
        emit(c);
      }
  }

  // Move the vertices, then turn the normals of the triangles that moved.
  const n = out.length / 7;
  const P = new Float32Array(n * 3);
  const Nn = new Float32Array(n * 3);
  const D = new Float32Array(n);
  const moved = new Uint8Array(n);
  const old = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    const p: V3 = [out[o]!, out[o + 1]!, out[o + 2]!];
    old.set(p, i * 3);
    let shade = out[o + 6]!;
    const rel: V3 = [p[0] - dent.center[0], p[1] - dent.center[1], p[2] - dent.center[2]];
    const along = dot(rel, N);
    const dist = Math.hypot(rel[0] - along * N[0], rel[1] - along * N[1], rel[2] - along * N[2]) / r;
    if (dist < 1) {
      const w = (1 - dist * dist) ** 2;
      const f = frontness(p);
      const push = depth * w * f;
      if (push > 1e-9) {
        p[0] = Math.min(box.max.x, Math.max(box.min.x, p[0] - N[0] * push));
        p[1] = Math.min(box.max.y, Math.max(box.min.y, p[1] - N[1] * push));
        p[2] = Math.min(box.max.z, Math.max(box.min.z, p[2] - N[2] * push));
        moved[i] = 1;
      }
      shade *= 1 - FINISH.dentDark * w * f;
    }
    P.set(p, i * 3);
    Nn.set([out[o + 3]!, out[o + 4]!, out[o + 5]!], i * 3);
    D[i] = shade;
  }
  const fo = new THREE.Vector3();
  const fn = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const nv = new THREE.Vector3();
  const face = (arr: Float32Array, t: number, into: THREE.Vector3) => {
    e1.set(arr[t * 9 + 3]! - arr[t * 9]!, arr[t * 9 + 4]! - arr[t * 9 + 1]!, arr[t * 9 + 5]! - arr[t * 9 + 2]!);
    e2.set(arr[t * 9 + 6]! - arr[t * 9]!, arr[t * 9 + 7]! - arr[t * 9 + 1]!, arr[t * 9 + 8]! - arr[t * 9 + 2]!);
    into.crossVectors(e1, e2);
    const l = into.length();
    if (l < 1e-18) return false;
    into.divideScalar(l);
    return true;
  };
  for (let t = 0; t < n / 3; t++) {
    if (!moved[t * 3] && !moved[t * 3 + 1] && !moved[t * 3 + 2]) continue;
    if (!face(old, t, fo) || !face(P, t, fn)) continue;
    q.setFromUnitVectors(fo, fn);
    for (let k = 0; k < 3; k++) {
      const i = (t * 3 + k) * 3;
      nv.set(Nn[i]!, Nn[i + 1]!, Nn[i + 2]!).applyQuaternion(q).normalize();
      Nn[i] = nv.x;
      Nn[i + 1] = nv.y;
      Nn[i + 2] = nv.z;
    }
  }
  const res = new THREE.BufferGeometry();
  res.setAttribute("position", new THREE.BufferAttribute(P, 3));
  res.setAttribute("normal", new THREE.BufferAttribute(Nn, 3));
  res.setAttribute("dentShade", new THREE.BufferAttribute(D, 1));
  return res;
}

// ── Bolts ─────────────────────────────────────────────────────

/** Bolts of one panel copy, in the panel's own frame. */
type BoltSet = { si: number; pi: number; j: number; corner: boolean; area: number; order: number; pts: [number, number][]; rx: number; ry: number; h: number; z0: number };

/**
 * Bolt geometry of one panel copy: a low hexagonal prism per point, standing on the front face
 * (z0) of the panel's own frame, then moved by the copy's matrix. The radius is divided by the
 * panel's scale so that a bolt is round on a scaled panel. Each bolt is turned by a seeded angle.
 */
function boltGeometry(set: BoltSet, m: THREE.Matrix4, seed: number): THREE.BufferGeometry {
  const r = rng(hashInts(seedInt(seed), set.si, set.pi, set.j, 0xb017));
  const pos: number[] = [];
  for (const [x, y] of set.pts) {
    const a0 = r() * (Math.PI / 3);
    const ring: [number, number][] = [];
    for (let k = 0; k < 6; k++) {
      const a = a0 + (k * Math.PI) / 3;
      ring.push([x + Math.cos(a) * set.rx, y + Math.sin(a) * set.ry]);
    }
    const zb = set.z0;
    const zt = set.z0 + set.h;
    for (let k = 0; k < 6; k++) {
      const [ax, ay] = ring[k]!;
      const [bx, by] = ring[(k + 1) % 6]!;
      pos.push(ax, ay, zb, bx, by, zb, bx, by, zt);
      pos.push(ax, ay, zb, bx, by, zt, ax, ay, zt);
    }
    for (let k = 1; k < 5; k++) pos.push(...ring[0]!, zt, ...ring[k]!, zt, ...ring[k + 1]!, zt);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.applyMatrix4(m);
  if (m.determinant() < 0) {
    // A mirrored copy: swap two vertices of each triangle so that faces still point out.
    const arr = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i + 9 <= arr.length; i += 9)
      for (let k = 0; k < 3; k++) {
        const t = arr[i + 3 + k]!;
        arr[i + 3 + k] = arr[i + 6 + k]!;
        arr[i + 6 + k] = t;
      }
  }
  g.computeVertexNormals(); // non-indexed: face normals, hard facets
  return g;
}

// ── Plan ──────────────────────────────────────────────────────

export type FinishContext = {
  fit: number;
  seed: number;
  /** Lowest y of the object in spec space (before the build moves it to y = 0). */
  groundY: number;
  /** Copies of every part, per stage, as partInstances() made them (bounding boxes set). */
  perPart: THREE.BufferGeometry[][][];
  matricesOf: (p: Part) => { m: THREE.Matrix4; mirrored: boolean }[];
  surfaceOf: (p: Part) => SurfaceId;
  bevelOf: (p: Part) => number;
};

export type FinishedInstance = {
  geometry: THREE.BufferGeometry;
  /** The bolts of this copy (spec space, same frame as the geometry), or null. */
  bolts: THREE.BufferGeometry | null;
  bright: number;
};

export type FinishPlan = {
  /** Dents, variety and bolts of copy j of part pi in stage si. Disposes `g` if it replaces it. */
  instance: (si: number, pi: number, j: number, p: Part, g: THREE.BufferGeometry) => FinishedInstance;
  /** Dents and bolts placed so far (after the build: in the stages that were built). */
  readonly dents: number;
  readonly bolts: number;
};

const absScale = (p: Part): V3 => [Math.abs(p.scale?.[0] ?? 1), Math.abs(p.scale?.[1] ?? 1), Math.abs(p.scale?.[2] ?? 1)];

/** Local axes of a sheet: width, height and front (corrugated maps them by its axis). */
function sheetAxes(p: Part): { u: number; v: number; n: number } {
  if (p.shape === "corrugated") {
    if (p.axis === "x") return { u: 2, v: 1, n: 0 };
    if (p.axis === "y") return { u: 0, v: 2, n: 1 };
  }
  return { u: 0, v: 1, n: 2 };
}

function frontNormal(m: THREE.Matrix4, axis: number): V3 {
  const e = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
  e.applyMatrix3(new THREE.Matrix3().getNormalMatrix(m)).normalize();
  return [e.x, e.y, e.z];
}

/**
 * Plans the finish of a whole spec (all stages, so that a partial build with `shown` places the
 * same dents and bolts as the full build). Dents and the bolt limit are decided here; the
 * geometry work happens per copy in `instance`.
 */
export function planFinish(spec: PartsSpec, ctx: FinishContext): FinishPlan {
  const F = FINISH;
  const { fit, seed } = ctx;
  const s0 = seedInt(seed);
  const dents = new Map<string, Dent[]>();
  const keyOf = (si: number, pi: number, j: number) => `${si}:${pi}:${j}`;
  const boxOf = (g: THREE.BufferGeometry) => {
    if (!g.boundingBox) g.computeBoundingBox();
    return g.boundingBox!;
  };

  // Dents: in stage and part order, so earlier stages keep theirs in a partial build.
  let dentCount = 0;
  spec.stages.forEach((stage, si) =>
    stage.parts.forEach((p, pi) => {
      if (dentCount >= F.dentsPerObject) return;
      if (p.shape !== "corrugated" && p.shape !== "panel") return;
      if ((p.emit ?? 0) > 0 || !DENT_SURFACES.includes(ctx.surfaceOf(p))) return;
      const ax = sheetAxes(p);
      const sc = absScale(p);
      // Width and height are size[0] and size[1] in both shapes; the axes say where they point.
      const W = p.size![0] * sc[ax.u]!;
      const H = p.size![1] * sc[ax.v]!;
      if (Math.max(W, H) * fit < F.dentMinSide) return;
      const r = rng(hashInts(s0, si, pi, 0xde47));
      const want = Math.floor(r() * (F.dentsPerPart + 1));
      const mats = ctx.matricesOf(p);
      for (let k = 0; k < want && dentCount < F.dentsPerObject; k++) {
        const j = Math.min(mats.length - 1, Math.floor(r() * mats.length));
        const radiusReal = Math.min(F.dentRadius[0] + r() * (F.dentRadius[1] - F.dentRadius[0]), 0.45 * Math.min(W, H) * fit);
        const depthReal = F.dentDepth[0] + r() * (F.dentDepth[1] - F.dentDepth[0]);
        const tu = r() * 2 - 1;
        const tv = r() * 2 - 1;
        if (radiusReal < F.dentRadius[0]) continue;
        const rs = radiusReal / fit;
        const local = [0, 0, 0];
        local[ax.u] = tu * Math.max(0, p.size![0] / 2 - rs / sc[ax.u]!);
        local[ax.v] = tv * Math.max(0, p.size![1] / 2 - rs / sc[ax.v]!);
        const { m } = mats[j]!;
        const c = new THREE.Vector3(local[0], local[1], local[2]).applyMatrix4(m);
        const key = keyOf(si, pi, j);
        const list = dents.get(key) ?? [];
        list.push({ center: [c.x, c.y, c.z], n: frontNormal(m, ax.n), r: rs, depth: depthReal / fit });
        dents.set(key, list);
        dentCount++;
      }
    })
  );

  // Fasteners the model made itself: copies under 4 cm.
  const small: THREE.Box3[] = [];
  spec.stages.forEach((stage, si) =>
    stage.parts.forEach((_, pi) => {
      for (const g of ctx.perPart[si]![pi]!) {
        const b = boxOf(g);
        const sz = b.getSize(new THREE.Vector3());
        if (Math.max(sz.x, sz.y, sz.z) * fit < F.smallPart) small.push(b);
      }
    })
  );

  // Bolt sets of every panel copy.
  const sets: BoltSet[] = [];
  spec.stages.forEach((stage, si) =>
    stage.parts.forEach((p, pi) => {
      if (p.shape !== "panel" || (p.emit ?? 0) > 0) return;
      const [X, Y] = p.size!;
      const sc = absScale(p);
      const Xr = X * sc[0] * fit;
      const Yr = Y * sc[1] * fit;
      if (Xr < F.boltMinSide || Yr < F.boltMinSide) return;
      const copies = ctx.perPart[si]![pi]!;
      const union = new THREE.Box3();
      for (const g of copies) union.union(boxOf(g));
      union.expandByScalar(0.002 / fit);
      if (small.some((b) => b.intersectsBox(union))) return;
      const longest = Math.max(Xr, Yr);
      const rReal = longest > F.boltLargePanel ? F.boltRadiusLarge : F.boltRadius;
      const rx = rReal / fit / sc[0];
      const ry = rReal / fit / sc[1];
      const { z0, b, margin } = panelFrame(p, ctx.bevelOf(p));
      // With no relief (and no louvres) the whole face is flat; else stay on the frame.
      const relief = p.louvres ? 1 : (p.relief ?? (p.ribs ? 0.015 : 0.012));
      const flatAll = !p.louvres && Math.abs(relief) < 1e-5;
      const r = rng(hashInts(s0, si, pi, 0xb0175));
      const insetReal = F.boltInset[0] + r() * (F.boltInset[1] - F.boltInset[0]);
      const fitIn = (want: number, rr: number, half: number) => {
        const lo = b + rr;
        const hi = flatAll ? half - rr : margin - rr;
        return hi < lo ? null : Math.min(hi, Math.max(lo, want));
      };
      const dx = fitIn(insetReal / fit / sc[0], rx, X / 2);
      const dy = fitIn(insetReal / fit / sc[1], ry, Y / 2);
      if (dx === null || dy === null) return;
      const cx = X / 2 - dx;
      const cy = Y / 2 - dy;
      const corners: [number, number][] = [[-cx, -cy], [cx, -cy], [cx, cy], [-cx, cy]];
      const edges: [number, number][] = [];
      if (longest > F.boltEdgePanel) {
        const alongX = Xr >= Yr;
        const span = alongX ? 2 * cx : 2 * cy;
        const spanReal = span * (alongX ? sc[0] : sc[1]) * fit;
        const k = Math.max(1, Math.round(spanReal / F.boltPitch));
        for (let i = 1; i < k; i++) {
          const t = -span / 2 + (span * i) / k;
          for (const side of [-1, 1]) edges.push(alongX ? [t, side * cy] : [side * cx, t]);
        }
      }
      const h = F.boltHeight / fit / sc[2];
      ctx.matricesOf(p).forEach(({ m }, j) => {
        // Bolts on a face that looks down are never seen and would go under the ground.
        if (frontNormal(m, 2)[1] < -0.7) return;
        const base = { si, pi, j, area: Xr * Yr, rx, ry, h, z0 };
        sets.push({ ...base, corner: true, order: sets.length, pts: corners });
        if (edges.length) sets.push({ ...base, corner: false, order: sets.length, pts: edges });
      });
    })
  );
  // The limit: corner bolts of the largest panels first, then edge bolts; whole sets only.
  sets.sort((a, c) => Number(c.corner) - Number(a.corner) || c.area - a.area || a.order - c.order);
  const bolts = new Map<string, BoltSet[]>();
  let boltCount = 0;
  for (const set of sets) {
    if (boltCount + set.pts.length > F.boltLimit) continue;
    boltCount += set.pts.length;
    const key = keyOf(set.si, set.pi, set.j);
    bolts.set(key, [...(bolts.get(key) ?? []), set]);
  }

  let dentTris = 0;
  let dentsPlaced = 0;
  let boltsPlaced = 0;
  return {
    get dents() {
      return dentsPlaced;
    },
    get bolts() {
      return boltsPlaced;
    },
    instance: (si, pi, j, p, g0) => {
      let g = g0;
      const key = keyOf(si, pi, j);
      for (const d of dents.get(key) ?? []) {
        const next = applyDent(g, d);
        const added = (next.attributes.position!.count - g.attributes.position!.count) / 3;
        if (dentTris + added > F.dentTriangles) {
          next.dispose();
          continue;
        }
        dentTris += added;
        dentsPlaced++;
        if (g !== g0) g.dispose();
        g = next;
      }
      if (g !== g0) g0.dispose();
      // Parts in a pivot group move; they keep their exact copies.
      const multi = (p.repeat?.n ?? 1) > 1 || Boolean(p.mirror);
      g.computeBoundingBox();
      const variety = !p.group && multi ? instanceVariety(seed, si, pi, j, g.boundingBox!, ctx.groundY, fit) : { m: null, bright: 1 };
      if (variety.m) g.applyMatrix4(variety.m);
      const sets = bolts.get(key);
      let boltGeo: THREE.BufferGeometry | null = null;
      if (sets) {
        const m = ctx.matricesOf(p)[j]!.m.clone();
        if (variety.m) m.premultiply(variety.m);
        const geos = sets.map((s) => boltGeometry(s, m, seed));
        for (const s of sets) boltsPlaced += s.pts.length;
        boltGeo = geos.length === 1 ? geos[0]! : joinGeometries(geos);
      }
      return { geometry: g, bolts: boltGeo, bright: variety.bright };
    }
  };
}

/** Joins non-indexed position + normal geometries. */
function joinGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of geos) n += g.attributes.position!.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set((g.attributes.position as THREE.BufferAttribute).array as Float32Array, o * 3);
    nrm.set((g.attributes.normal as THREE.BufferAttribute).array as Float32Array, o * 3);
    o += g.attributes.position!.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  return out;
}

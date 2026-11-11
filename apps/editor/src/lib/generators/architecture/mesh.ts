// Mesh builder for the architecture generator. Pure geometry: no scene, no DOM, no network.
// Triangles go into buckets by stage (base, tier 1, tier 2, ..., ornaments) and by material
// (plain, gold, glass, lit windows). Each triangle has its own color (vertex colors), so the look is the
// flat-shaded, soft-colored facet style of the Island kit props.
import * as THREE from "three";

export type V3 = [number, number, number];
/** Linear RGB, 0..1 (three.js working color space). */
export type RGB = [number, number, number];
export type MatId = "base" | "gold" | "glass" | "lit";

export const MAT_IDS: MatId[] = ["base", "gold", "glass", "lit"];

type Bucket = { pos: number[]; col: number[] };

export type StageData = {
  label: string;
  buckets: Record<MatId, Bucket>;
  /** Lowest y of the stage (its reveal starts there). */
  minY: number;
};

/** sRGB hex ("#aabbcc") to linear RGB. */
export function rgb(hex: string): RGB {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function shade(c: RGB, f: number): RGB {
  return [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Deterministic random numbers (mulberry32). */
export class Rand {
  private s: number;
  constructor(seed: number) {
    this.s = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
}

export class MeshBuilder {
  readonly stages: StageData[] = [];
  private cur: StageData | null = null;
  mat: MatId = "base";
  private stack: THREE.Matrix4[] = [];
  private tmp = new THREE.Vector3();

  stage(label: string) {
    this.cur = { label, buckets: { base: { pos: [], col: [] }, gold: { pos: [], col: [] }, glass: { pos: [], col: [] }, lit: { pos: [], col: [] } }, minY: Infinity };
    this.stages.push(this.cur);
    this.mat = "base";
  }

  /** Runs fn with a transform applied to every vertex (nested transforms compose). */
  with(m: THREE.Matrix4, fn: () => void) {
    const top = this.stack.length ? this.stack[this.stack.length - 1].clone().multiply(m) : m.clone();
    this.stack.push(top);
    try {
      fn();
    } finally {
      this.stack.pop();
    }
  }

  withMat(mat: MatId, fn: () => void) {
    const before = this.mat;
    this.mat = mat;
    try {
      fn();
    } finally {
      this.mat = before;
    }
  }

  private push(p: V3, c: RGB) {
    const st = this.cur!;
    const b = st.buckets[this.mat];
    let x = p[0];
    let y = p[1];
    let z = p[2];
    if (this.stack.length) {
      this.tmp.set(x, y, z).applyMatrix4(this.stack[this.stack.length - 1]);
      x = this.tmp.x;
      y = this.tmp.y;
      z = this.tmp.z;
    }
    b.pos.push(x, y, z);
    b.col.push(c[0], c[1], c[2]);
    if (y < st.minY) st.minY = y;
  }

  /** Counter-clockwise seen from the front side. */
  tri(a: V3, b: V3, c: V3, col: RGB) {
    if (!this.cur) this.stage("main");
    this.push(a, col);
    this.push(b, col);
    this.push(c, col);
  }

  /** a, b, c, d counter-clockwise seen from the front side. */
  quad(a: V3, b: V3, c: V3, d: V3, col: RGB) {
    this.tri(a, b, c, col);
    this.tri(a, c, d, col);
  }

  triangleCount() {
    let n = 0;
    for (const s of this.stages) for (const m of MAT_IDS) n += s.buckets[m].pos.length / 9;
    return n;
  }
}

/** Turns stage buckets into BufferGeometries (flat normals: each triangle has its own vertices). */
export function stageGeometries(stage: StageData): Partial<Record<MatId, THREE.BufferGeometry>> {
  const out: Partial<Record<MatId, THREE.BufferGeometry>> = {};
  for (const m of MAT_IDS) {
    const b = stage.buckets[m];
    if (b.pos.length === 0) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    out[m] = g;
  }
  return out;
}

// ── Primitives ───────────────────────────────────────────────

/**
 * Box with chamfered (bevelled) edges. c = chamfer size (0 = sharp box).
 * colors: side faces, top and bottom (top/bottom default to side).
 */
export function box(
  b: MeshBuilder,
  min: V3,
  max: V3,
  col: RGB,
  opts: { chamfer?: number; top?: RGB; bottom?: RGB | false } = {}
) {
  const c = Math.max(0, Math.min(opts.chamfer ?? 0, (max[0] - min[0]) * 0.45, (max[1] - min[1]) * 0.45, (max[2] - min[2]) * 0.45));
  const top = opts.top ?? shade(col, 1.04);
  const bot = opts.bottom === false ? null : (opts.bottom ?? shade(col, 0.8));
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  if (c <= 1e-5) {
    b.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col); // +z
    b.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col); // -z
    b.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col); // +x
    b.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col); // -x
    b.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top); // +y
    if (bot) b.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], bot); // -y
    return;
  }
  // Chamfered box: 6 inset faces, 12 edge strips, 8 corner triangles.
  // Main faces (inset by c on both in-plane axes).
  const fx = (s: number) => (s > 0 ? x1 : x0);
  const fy = (s: number) => (s > 0 ? y1 : y0);
  const fz = (s: number) => (s > 0 ? z1 : z0);
  const ix0 = x0 + c, ix1 = x1 - c, iy0 = y0 + c, iy1 = y1 - c, iz0 = z0 + c, iz1 = z1 - c;
  b.quad([ix0, iy0, z1], [ix1, iy0, z1], [ix1, iy1, z1], [ix0, iy1, z1], col);
  b.quad([ix1, iy0, z0], [ix0, iy0, z0], [ix0, iy1, z0], [ix1, iy1, z0], col);
  b.quad([x1, iy0, iz1], [x1, iy0, iz0], [x1, iy1, iz0], [x1, iy1, iz1], col);
  b.quad([x0, iy0, iz0], [x0, iy0, iz1], [x0, iy1, iz1], [x0, iy1, iz0], col);
  b.quad([ix0, y1, iz1], [ix1, y1, iz1], [ix1, y1, iz0], [ix0, y1, iz0], top);
  if (bot) b.quad([ix0, y0, iz0], [ix1, y0, iz0], [ix1, y0, iz1], [ix0, y0, iz1], bot);
  const edge = shade(col, 1.08);
  // Vertical edges (4).
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
    const a: V3 = [fx(sx) - sx * c, iy0, fz(sz)];
    const bb: V3 = [fx(sx), iy0, fz(sz) - sz * c];
    const cc: V3 = [fx(sx), iy1, fz(sz) - sz * c];
    const d: V3 = [fx(sx) - sx * c, iy1, fz(sz)];
    if (sx * sz > 0) b.quad(a, bb, cc, d, edge);
    else b.quad(bb, a, d, cc, edge);
  }
  // Horizontal edges along x (4) and along z (4).
  for (const sy of [1, -1]) {
    if (sy < 0 && !bot) continue;
    const ec = sy > 0 ? shade(top, 1.02) : (bot as RGB);
    for (const sz of [1, -1]) {
      const a: V3 = [ix0, fy(sy), fz(sz) - sz * c];
      const bb: V3 = [ix1, fy(sy), fz(sz) - sz * c];
      const cc: V3 = [ix1, fy(sy) - sy * c, fz(sz)];
      const d: V3 = [ix0, fy(sy) - sy * c, fz(sz)];
      if (sy * sz > 0) b.quad(d, cc, bb, a, ec);
      else b.quad(a, bb, cc, d, ec);
    }
    for (const sx of [1, -1]) {
      const a: V3 = [fx(sx) - sx * c, fy(sy), iz0];
      const bb: V3 = [fx(sx) - sx * c, fy(sy), iz1];
      const cc: V3 = [fx(sx), fy(sy) - sy * c, iz1];
      const d: V3 = [fx(sx), fy(sy) - sy * c, iz0];
      if (sy * sx > 0) b.quad(a, bb, cc, d, ec);
      else b.quad(d, cc, bb, a, ec);
    }
    // Corner triangles.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
      const p1: V3 = [fx(sx) - sx * c, fy(sy), fz(sz) - sz * c];
      const p2: V3 = [fx(sx), fy(sy) - sy * c, fz(sz) - sz * c];
      const p3: V3 = [fx(sx) - sx * c, fy(sy) - sy * c, fz(sz)];
      if (sx * sy * sz > 0) b.tri(p1, p3, p2, ec);
      else b.tri(p1, p2, p3, ec);
    }
  }
}

/** Box rotated about y by angle, centered at (cx, cy, cz) with half sizes. */
export function boxAt(b: MeshBuilder, center: V3, half: V3, rotY: number, col: RGB, opts: { chamfer?: number; top?: RGB; bottom?: RGB | false } = {}) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(center[0], center[1], center[2]);
  b.with(m, () => box(b, [-half[0], -half[1], -half[2]], [half[0], half[1], half[2]], col, opts));
}

/**
 * Surface of revolution around the y axis. profile: [radius, y] from bottom to top.
 * Caps: a radius of 0 closes the shape at that end.
 */
export function lathe(b: MeshBuilder, profile: [number, number][], segs: number, col: RGB | ((i: number, j: number) => RGB), center: V3 = [0, 0, 0], phase = 0) {
  const cf = typeof col === "function" ? col : () => col;
  for (let j = 0; j < profile.length - 1; j++) {
    const [r0, y0] = profile[j];
    const [r1, y1] = profile[j + 1];
    for (let i = 0; i < segs; i++) {
      const a0 = phase + (i / segs) * Math.PI * 2;
      const a1 = phase + ((i + 1) / segs) * Math.PI * 2;
      const p = (r: number, y: number, a: number): V3 => [center[0] + Math.sin(a) * r, center[1] + y, center[2] + Math.cos(a) * r];
      const A = p(r0, y0, a0);
      const B = p(r0, y0, a1);
      const C = p(r1, y1, a1);
      const D = p(r1, y1, a0);
      const c = cf(i, j);
      if (r0 < 1e-6) b.tri(A, C, D, c);
      else if (r1 < 1e-6) b.tri(A, B, C, c);
      else b.quad(A, B, C, D, c);
    }
  }
}

/** Square-section bar along a polyline (rails, ridges, bargeboards). up = section "up" direction. */
export function bar(b: MeshBuilder, pts: V3[], halfW: number, halfH: number, col: RGB, up: V3 = [0, 1, 0], caps = true) {
  const n = pts.length;
  if (n < 2) return;
  const U = new THREE.Vector3(...up);
  const rings: V3[][] = [];
  for (let i = 0; i < n; i++) {
    const prev = new THREE.Vector3(...pts[Math.max(0, i - 1)]);
    const next = new THREE.Vector3(...pts[Math.min(n - 1, i + 1)]);
    const t = next.sub(prev).normalize();
    const side = new THREE.Vector3().crossVectors(t, U).normalize();
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    const u2 = new THREE.Vector3().crossVectors(side, t).normalize();
    const p = new THREE.Vector3(...pts[i]);
    const corner = (sx: number, sy: number): V3 => {
      const v = p.clone().addScaledVector(side, sx * halfW).addScaledVector(u2, sy * halfH);
      return [v.x, v.y, v.z];
    };
    rings.push([corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)]);
  }
  const top = shade(col, 1.06);
  for (let i = 0; i < n - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      b.quad(r0[k], r1[k], r1[k2], r0[k2], k === 0 ? top : col);
    }
  }
  if (caps) {
    const s = rings[0];
    const e = rings[n - 1];
    b.quad(s[0], s[1], s[2], s[3], col);
    b.quad(e[3], e[2], e[1], e[0], col);
  }
}

/** Tube along a path with a radius per point (ornaments). Ends close to a point when radius is 0. */
export function tube(b: MeshBuilder, pts: V3[], radii: number[], segs: number, col: RGB | ((i: number) => RGB)) {
  const cf = typeof col === "function" ? col : () => col;
  const n = pts.length;
  const rings: V3[][] = [];
  let ref = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const prev = new THREE.Vector3(...pts[Math.max(0, i - 1)]);
    const next = new THREE.Vector3(...pts[Math.min(n - 1, i + 1)]);
    const t = next.sub(prev).normalize();
    if (Math.abs(t.dot(ref)) > 0.95) ref = new THREE.Vector3(1, 0, 0);
    const s1 = new THREE.Vector3().crossVectors(t, ref).normalize();
    const s2 = new THREE.Vector3().crossVectors(s1, t).normalize();
    const ring: V3[] = [];
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const v = new THREE.Vector3(...pts[i]).addScaledVector(s1, Math.cos(a) * radii[i]).addScaledVector(s2, Math.sin(a) * radii[i]);
      ring.push([v.x, v.y, v.z]);
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      b.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2], cf(i));
    }
  }
  // End caps (fan).
  const capS = pts[0];
  const capE = pts[n - 1];
  if (radii[0] > 1e-6) for (let k = 0; k < segs; k++) b.tri(capS, rings[0][k], rings[0][(k + 1) % segs], cf(0));
  if (radii[n - 1] > 1e-6) for (let k = 0; k < segs; k++) b.tri(capE, rings[n - 1][(k + 1) % segs], rings[n - 1][k], cf(n - 2));
}

/** Flat polygon (convex, counter-clockwise from the front side) as a triangle fan. */
export function poly(b: MeshBuilder, pts: V3[], col: RGB) {
  for (let i = 1; i < pts.length - 1; i++) b.tri(pts[0], pts[i], pts[i + 1], col);
}

/**
 * A grid surface: f(u, v) for u, v in 0..1. The front side is the side where
 * (df/du x df/dv) points.
 */
export function surface(b: MeshBuilder, nu: number, nv: number, f: (u: number, v: number) => V3, col: (i: number, j: number) => RGB) {
  const g: V3[][] = [];
  for (let i = 0; i <= nu; i++) {
    const row: V3[] = [];
    for (let j = 0; j <= nv; j++) row.push(f(i / nu, j / nv));
    g.push(row);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) b.quad(g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1], col(i, j));
}

export type WindowRect = { u0: number; u1: number; v0: number; v1: number };

/**
 * A flat wall face with rectangular openings, inset by depth. origin = lower left corner seen
 * from outside, dir = unit vector along the wall (horizontal), length and height in meters.
 * Windows: one row (all share v0 and v1), sorted by u. Outward = dir x up.
 */
export function wallWithOpenings(
  b: MeshBuilder,
  origin: V3,
  dir: [number, number],
  length: number,
  height: number,
  wins: WindowRect[],
  depth: number,
  colors: { wall: RGB; recess: RGB; back: RGB; bands?: { v0: number; v1: number; col: RGB }[] }
) {
  const out: [number, number] = [-dir[1], dir[0]]; // dir x up, in the xz plane
  const P = (u: number, v: number, d = 0): V3 => [origin[0] + dir[0] * u - out[0] * d, origin[1] + v, origin[2] + dir[1] * u - out[1] * d];
  const rect = (u0: number, u1: number, v0: number, v1: number, c: RGB) => {
    if (u1 - u0 < 1e-5 || v1 - v0 < 1e-5) return;
    b.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), c);
  };
  // Horizontal colored bands split the wall into strips; each strip is drawn around the windows.
  const cuts = new Set<number>([0, height]);
  for (const band of colors.bands ?? []) {
    cuts.add(Math.max(0, Math.min(height, band.v0)));
    cuts.add(Math.max(0, Math.min(height, band.v1)));
  }
  const wv0 = wins.length ? wins[0].v0 : 0;
  const wv1 = wins.length ? wins[0].v1 : 0;
  if (wins.length) {
    cuts.add(wv0);
    cuts.add(wv1);
  }
  const ys = [...cuts].sort((p, q) => p - q);
  for (let k = 0; k < ys.length - 1; k++) {
    const v0 = ys[k];
    const v1 = ys[k + 1];
    const mid = (v0 + v1) / 2;
    const band = (colors.bands ?? []).find((bd) => mid >= bd.v0 && mid <= bd.v1);
    const c = band ? band.col : colors.wall;
    if (wins.length && mid > wv0 && mid < wv1) {
      let u = 0;
      for (const w of wins) {
        rect(u, w.u0, v0, v1, c);
        u = w.u1;
      }
      rect(u, length, v0, v1, c);
    } else rect(0, length, v0, v1, c);
  }
  // Recesses.
  for (const w of wins) {
    const { u0, u1, v0, v1 } = w;
    b.quad(P(u0, v0, depth), P(u1, v0, depth), P(u1, v1, depth), P(u0, v1, depth), colors.back);
    b.quad(P(u1, v0, 0), P(u1, v0, depth), P(u0, v0, depth), P(u0, v0, 0), shade(colors.recess, 1.1)); // sill (faces up)
    b.quad(P(u1, v1, depth), P(u1, v1, 0), P(u0, v1, 0), P(u0, v1, depth), shade(colors.recess, 0.7)); // head (faces down)
    b.quad(P(u0, v1, depth), P(u0, v1, 0), P(u0, v0, 0), P(u0, v0, depth), colors.recess); // left jamb
    b.quad(P(u1, v1, 0), P(u1, v1, depth), P(u1, v0, depth), P(u1, v0, 0), colors.recess); // right jamb
  }
}

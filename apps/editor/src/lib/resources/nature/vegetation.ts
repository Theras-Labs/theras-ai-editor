// Procedural vegetation for the resource library: trees, a bush, ferns, reeds, water lilies,
// mushrooms, wildflowers, grass tufts and rocks. Ported from the author's own vegetation
// generator (same species builders, leaf atlas, wind sway and lighting) and rewritten for
// WebGLRenderer: MeshLambertMaterial / MeshStandardMaterial patched with onBeforeCompile.
//
// Scale: 1 unit = 1 m. Each object stands on y = 0 with its origin at the base.
// Shared geometry (per species variant), shared depth materials and the leaf atlas are cached
// for the life of the page. Per-instance materials (tints) and per-instance geometry (flowers,
// grass) are released in dispose(). Wind sway reads frame.time (scene time).
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ResourceEntry, ResourceFrame, ResourceInstance } from "../types";

const ORIGIN = "Theras nature";
const LICENSE = "Owned by the Theras AI author";
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Random numbers and noise
// ---------------------------------------------------------------------------------------------

/** Seeded generator from a string key (string hash + small fast counter generator). */
function hashRng(key: string): () => number {
  const s = String(key);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const mix = (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a = mix();
  let b = mix();
  let c = mix();
  let d = mix();
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

type Rand = {
  next: () => number;
  range: (a: number, b: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
};

function makeRand(next: () => number): Rand {
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length) % arr.length] as T,
    chance: (p) => next() < p
  };
}

const rand = (key: string): Rand => makeRand(hashRng(key));

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
const normSeed = (seed: number): number => Math.abs(Math.floor(Number.isFinite(seed) ? seed : 0));

const GRAD3 = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];

function permutation(next: () => number): Uint8Array {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 0; i < 255; i++) {
    const r = i + Math.floor(next() * (256 - i));
    const t = p[i] as number;
    p[i] = p[r] as number;
    p[r] = t;
  }
  for (let i = 256; i < 512; i++) p[i] = p[i - 256] as number;
  return p;
}

/** Seeded 2D simplex noise, about -1..1. */
function simplex2(next: () => number): (x: number, y: number) => number {
  const p = permutation(next);
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const corner = (gi: number, x: number, y: number): number => {
    let t = 0.5 - x * x - y * y;
    if (t < 0) return 0;
    const g = ((p[gi] as number) % 12) * 3;
    t *= t;
    return t * t * ((GRAD3[g] as number) * x + (GRAD3[g + 1] as number) * y);
  };
  return (x, y) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const ii = i & 255;
    const jj = j & 255;
    return (
      70 *
      (corner(ii + (p[jj] as number), x0, y0) +
        corner(ii + i1 + (p[jj + j1] as number), x0 - i1 + G2, y0 - j1 + G2) +
        corner(ii + 1 + (p[jj + 1] as number), x0 - 1 + 2 * G2, y0 - 1 + 2 * G2))
    );
  };
}

/** Seeded 3D simplex noise, about -1..1. */
function simplex3(next: () => number): (x: number, y: number, z: number) => number {
  const p = permutation(next);
  const G3 = 1 / 6;
  const perm = (i: number): number => p[i] as number;
  const corner = (gi: number, x: number, y: number, z: number): number => {
    let t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    const g = (perm(gi) % 12) * 3;
    t *= t;
    return t * t * ((GRAD3[g] as number) * x + (GRAD3[g + 1] as number) * y + (GRAD3[g + 2] as number) * z);
  };
  return (x, y, z) => {
    const s = (x + y + z) / 3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    let i1 = 0, j1 = 0, k1 = 0, i2 = 0, j2 = 0, k2 = 0;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    return (
      32 *
      (corner(ii + perm(jj + perm(kk)), x0, y0, z0) +
        corner(ii + i1 + perm(jj + j1 + perm(kk + k1)), x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3) +
        corner(ii + i2 + perm(jj + j2 + perm(kk + k2)), x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3) +
        corner(ii + 1 + perm(jj + 1 + perm(kk + 1)), x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3))
    );
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

type V3 = THREE.Vector3;
const v3 = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z);
const col = (hex: string): THREE.Color => new THREE.Color(hex);

/**
 * Vertex soup with the vegetation attributes:
 * aVeg = (random, flex, bark u, bark v), aCenter = card or part centre (for colour noise).
 */
class VegMesh {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  veg: number[] = [];
  cen: number[] = [];
  idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vert(p: V3, n: V3, u: number, v: number, c: THREE.Color | number, veg: readonly number[], center: V3): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    if (typeof c === "number") this.col.push(c, c, c);
    else this.col.push(c.r, c.g, c.b);
    this.veg.push(veg[0] ?? 0, veg[1] ?? 0, veg[2] ?? 0, veg[3] ?? 0);
    this.cen.push(center.x, center.y, center.z);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Builds the geometry; scale converts the generator's units to meters. */
  build(scale = 1): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const pos = scale === 1 ? this.pos : this.pos.map((v) => v * scale);
    const cen = scale === 1 ? this.cen : this.cen.map((v) => v * scale);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aVeg", new THREE.Float32BufferAttribute(this.veg, 4));
    g.setAttribute("aCenter", new THREE.Float32BufferAttribute(cen, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const catmull = (points: V3[], n: number): V3[] => new THREE.CatmullRomCurve3(points, false, "centripetal").getPoints(n);

type TubeOpts = {
  rand?: number;
  flex?: (c: number) => number;
  vScale?: number;
  v0?: number;
  capTop?: boolean;
};

const _tT = new THREE.Vector3();
const _tN = new THREE.Vector3();
const _tB = new THREE.Vector3();
const _tP = new THREE.Vector3();
const _tQ = new THREE.Quaternion();

/** A tube along a polyline with parallel-transport frames (trunks, branches, stems). */
function tube(
  m: VegMesh,
  pts: V3[],
  radial: number,
  radiusAt: (c: number, ang: number) => number,
  colorAt: (c: number, ang: number) => THREE.Color | number,
  o: TubeOpts = {}
): void {
  const n = pts.length;
  const base = m.count;
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push((lens[i - 1] as number) + (pts[i] as V3).distanceTo(pts[i - 1] as V3));
  const total = (lens[n - 1] as number) || 1;
  const tangent = (i: number, out: V3): V3 =>
    out.subVectors(pts[Math.min(n - 1, i + 1)] as V3, pts[Math.max(0, i - 1)] as V3).normalize();
  tangent(0, _tT);
  const normal = v3(1, 0, 0);
  if (Math.abs(_tT.x) > 0.9) normal.set(0, 0, 1);
  normal.sub(_tB.copy(_tT).multiplyScalar(normal.dot(_tT))).normalize();
  const prev = _tT.clone();
  const vScale = o.vScale ?? 1;
  for (let i = 0; i < n; i++) {
    tangent(i, _tT);
    _tQ.setFromUnitVectors(prev, _tT);
    normal.applyQuaternion(_tQ).normalize();
    prev.copy(_tT);
    const binormal = _tB.crossVectors(_tT, normal).normalize().clone();
    const c = (lens[i] as number) / total;
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * TAU;
      const r = radiusAt(c, ang);
      _tN.copy(normal).multiplyScalar(Math.cos(ang)).addScaledVector(binormal, Math.sin(ang)).normalize();
      _tP.copy(pts[i] as V3).addScaledVector(_tN, r);
      m.vert(_tP, _tN, j / radial, c, colorAt(c, ang), [o.rand ?? 0, o.flex ? o.flex(c) : 0, j / radial, (o.v0 ?? 0) + (lens[i] as number) * vScale], _tP);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = base + i * (radial + 1) + j;
      const b = a + radial + 1;
      m.tri(a, a + 1, b);
      m.tri(a + 1, b + 1, b);
    }
  if (o.capTop) {
    const last = pts[n - 1] as V3;
    const tip = m.vert(last, _tT, 0.5, 1, colorAt(1, 0), [o.rand ?? 0, 0, 0.5, total * vScale], last);
    const s = base + (n - 1) * (radial + 1);
    for (let j = 0; j < radial; j++) m.tri(s + j, s + j + 1, tip);
  }
}

type Rect = readonly [number, number, number, number];

/** Leaf atlas cells (u0, v0, u1, v1). */
const ATLAS_RECT = {
  broadleaf: [0, 0.5, 0.5, 1] as Rect,
  birch: [0.5, 0.5, 1, 1] as Rect,
  fern: [0, 0, 0.5, 0.5] as Rect,
  palm: [0.5, 0, 1, 0.5] as Rect
};
const ATLAS_SIZE = 1024;

type CardOpts = {
  rect: Rect;
  size: number;
  normal: V3;
  color: THREE.Color | number;
  rand: number;
  flex: number;
  facing: V3;
  roll: number;
  aoBottom?: number;
};

const _cA = new THREE.Vector3();
const _cB = new THREE.Vector3();
const _cP = new THREE.Vector3();
const _cC = new THREE.Color();

/** One textured leaf card (a quad from the atlas). */
function card(m: VegMesh, c: V3, o: CardOpts): void {
  const f = o.facing;
  const up = Math.abs(f.y) > 0.95 ? v3(1, 0, 0) : v3(0, 1, 0);
  _cA.crossVectors(up, f).normalize();
  _cB.crossVectors(f, _cA).normalize();
  const cr = Math.cos(o.roll);
  const sr = Math.sin(o.roll);
  const ax = _cA.clone().multiplyScalar(cr).addScaledVector(_cB, sr);
  const ay = _cB.clone().multiplyScalar(cr).addScaledVector(_cA, -sr);
  const h = o.size * 0.5;
  const [u0, v0, u1, v1] = o.rect;
  const corners: Array<[number, number, number, number]> = [
    [-1, -1, u0, v0],
    [1, -1, u1, v0],
    [1, 1, u1, v1],
    [-1, 1, u0, v1]
  ];
  const base = m.count;
  for (const [sx, sy, u, v] of corners) {
    _cP.copy(c).addScaledVector(ax, sx * h).addScaledVector(ay, sy * h);
    const ao = o.aoBottom === undefined ? 1 : lerp(o.aoBottom, 1, (_cP.y - (c.y - h)) / (2 * h));
    if (typeof o.color === "number") _cC.setScalar(o.color * ao);
    else _cC.copy(o.color).multiplyScalar(ao);
    m.vert(_cP, o.normal, u, v, _cC, [o.rand, o.flex, 0, 0], c);
  }
  m.tri(base, base + 1, base + 2);
  m.tri(base, base + 2, base + 3);
}

/** A drooping, slightly folded frond strip (fern and palm leaves). */
function frond(
  m: VegMesh,
  start: V3,
  dir: V3,
  len: number,
  width: number,
  droop: number,
  segs: number,
  rect: Rect,
  colorAt: (s: number) => THREE.Color | number,
  rnd: number,
  upBlend = 0.6,
  fold = 0.45
): void {
  const p = dir.clone().normalize();
  const side = new THREE.Vector3().crossVectors(p, v3(0, 1, 0));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const [u0, v0, u1, v1] = rect;
  const um = (u0 + u1) * 0.5;
  const base = m.count;
  const x = new THREE.Vector3();
  const S = new THREE.Vector3();
  const up = v3(0, 1, 0);
  const cw = Math.cos(fold);
  const sw = Math.sin(fold);
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    x.copy(start).addScaledVector(p, s * len);
    x.y -= droop * s * s * len;
    const tan = p.clone();
    tan.y -= 2 * droop * s;
    tan.normalize();
    S.crossVectors(side, tan).normalize();
    if (S.y < 0) S.negate();
    S.lerp(up, upBlend).normalize();
    const hw = width * 0.5;
    const v = v0 + (v1 - v0) * s;
    const c = colorAt(s);
    const D = S.clone().multiplyScalar(-hw * sw);
    m.vert(x.clone().addScaledVector(side, -hw * cw).add(D), S, u0, v, c, [rnd, s, 0, 0], start);
    m.vert(x.clone(), S, um, v, c, [rnd, s, 0, 0], start);
    m.vert(x.clone().addScaledVector(side, hw * cw).add(D), S, u1, v, c, [rnd, s, 0, 0], start);
  }
  for (let k = 0; k < segs; k++) {
    const n = base + k * 3;
    m.tri(n, n + 1, n + 3);
    m.tri(n + 3, n + 1, n + 4);
    m.tri(n + 1, n + 2, n + 4);
    m.tri(n + 4, n + 2, n + 5);
  }
}

function randDir(next: () => number, out = new THREE.Vector3()): V3 {
  const z = next() * 2 - 1;
  const a = next() * TAU;
  const r = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * r, z, Math.sin(a) * r);
}

type Cluster = { c: V3; r: number };
const _lsO = new THREE.Vector3();

/** Scatters leaf cards over a set of spherical clusters (canopies and bushes). */
function leafClusters(m: VegMesh, rnd: Rand, clusters: Cluster[], center: V3, extent: V3, rect: Rect, sizeMul: number, density: number): void {
  for (const cl of clusters) {
    const count = Math.max(5, Math.round(cl.r * cl.r * density));
    for (let k = 0; k < count; k++) {
      const dir = randDir(rnd.next);
      dir.y = Math.abs(dir.y) * 0.8 + dir.y * 0.2;
      const off = _lsO.copy(cl.c).sub(center);
      if (off.lengthSq() > 1e-4) dir.addScaledVector(off.normalize(), 0.5).normalize();
      const p = cl.c.clone().addScaledVector(dir, cl.r * rnd.range(0.3, 0.95));
      const rel = p.clone().sub(center).divide(extent);
      const nrm = rel.clone().normalize().multiplyScalar(0.75).addScaledVector(dir, 0.4).add(v3(0, 0.15, 0)).normalize();
      const facing = dir.clone().multiplyScalar(0.55).add(randDir(rnd.next).multiplyScalar(0.45)).normalize();
      const up = clamp(rel.y * 0.5 + 0.5, 0, 1);
      const out = clamp(rel.length(), 0, 1.2);
      const shade = clamp(0.26 + 0.58 * up * up + 0.22 * out, 0.24, 1.05);
      card(m, p, {
        rect,
        size: rnd.range(0.85, 1.2) * cl.r * sizeMul,
        normal: nrm,
        color: shade,
        rand: rnd.next(),
        flex: 0.4 + 0.6 * Math.min(1, out),
        facing,
        roll: rnd.range(0, TAU),
        aoBottom: 0.8
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Leaf atlas (drawn once on a canvas)
// ---------------------------------------------------------------------------------------------

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawLeaf(ctx: Ctx2D, len: number, wid: number, lum: number, bulge: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.25, -wid * (0.9 + bulge), len * (0.7 + bulge * 0.2), -wid * 0.8, len, 0);
  ctx.bezierCurveTo(len * (0.7 + bulge * 0.2), wid * 0.8, len * 0.25, wid * (0.9 + bulge), 0, 0);
  const s = Math.round(clamp(lum, 0, 1) * 255);
  ctx.fillStyle = `rgb(${s},${s},${s})`;
  ctx.fill();
  const c = Math.round(clamp(lum * 1.12 + 0.04, 0, 1) * 255);
  ctx.strokeStyle = `rgba(${c},${c},${c},0.55)`;
  ctx.lineWidth = Math.max(1, wid * 0.12);
  ctx.beginPath();
  ctx.moveTo(len * 0.08, 0);
  ctx.lineTo(len * 0.85, 0);
  ctx.stroke();
}

function drawLeafCell(ctx: Ctx2D, x0: number, y0: number, size: number, key: string, count: number, leafLen: number, leafWid: number, bulge: number): void {
  const r = hashRng(key);
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  const R = size * 0.36;
  const leaves: Array<{ x: number; y: number; a: number; l: number; lum: number; d: number }> = [];
  for (let i = 0; i < count; i++) {
    const d = r() ** 0.6;
    const ang = r() * TAU;
    const x = cx + Math.cos(ang) * d * R;
    const y = cy + Math.sin(ang) * d * R;
    const a = ang + (r() - 0.5) * 1.3 * (0.4 + d);
    const l = leafLen * (0.7 + r() * 0.6) * (0.8 + 0.3 * d);
    const s = 0.5 - 0.5 * (Math.cos(ang) * 0.35 + Math.sin(ang) * 0.65) * d;
    const lum = 0.5 + 0.28 * d + 0.2 * s + (r() - 0.5) * 0.18;
    leaves.push({ x, y, a, l, lum, d });
  }
  leaves.sort((p, q) => p.d - q.d);
  for (const lf of leaves) {
    ctx.save();
    ctx.translate(lf.x, lf.y);
    ctx.rotate(lf.a);
    drawLeaf(ctx, lf.l, leafWid * (lf.l / leafLen), lf.lum, bulge);
    ctx.restore();
  }
}

function drawFrondCell(ctx: Ctx2D, x0: number, y0: number, size: number, key: string, count: number, leafLen: number, leafWid: number, angle: number, lum: number): void {
  const r = hashRng(key);
  const cx = x0 + size / 2;
  const yb = y0 + size * 0.97;
  const yt = y0 + size * 0.04;
  const g = Math.round(lum * 200);
  ctx.strokeStyle = `rgb(${g},${g},${g})`;
  ctx.lineWidth = size * 0.012;
  ctx.beginPath();
  ctx.moveTo(cx, yb);
  ctx.lineTo(cx, yt);
  ctx.stroke();
  for (let t = 0; t < count; t++) {
    const n = (t + 0.5) / count;
    const ry = yb + (yt - yb) * n;
    const len = leafLen * (1 - n * 0.85) * (0.72 + 0.28 * Math.min(1, n * 4)) * (0.88 + r() * 0.24);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx, ry);
      ctx.rotate(side < 0 ? Math.PI + angle : -angle);
      const l = lum + (r() - 0.5) * 0.14 + (1 - n) * 0.05;
      drawLeaf(ctx, len, leafWid * (0.8 + 0.3 * (1 - n)), l, -0.3);
      ctx.restore();
    }
  }
}

let atlasTex: THREE.Texture | null = null;

/** Grey leaf atlas: broadleaf, birch, fern and palm cells. Tinted by vertex and material colour. */
function leafAtlas(): THREE.Texture {
  if (atlasTex) return atlasTex;
  const n = ATLAS_SIZE;
  const half = n / 2;
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = n;
    canvas = c;
  } else canvas = new OffscreenCanvas(n, n);
  const ctx = canvas.getContext("2d") as Ctx2D | null;
  if (ctx) {
    ctx.clearRect(0, 0, n, n);
    drawLeafCell(ctx, 0, 0, half, "atlas-broadleaf", 330, half * 0.085, half * 0.034, 0.1);
    drawLeafCell(ctx, half, 0, half, "atlas-birch", 380, half * 0.06, half * 0.03, 0.35);
    drawFrondCell(ctx, 0, half, half, "atlas-fern", 19, half * 0.36, half * 0.075, 0.5, 0.74);
    drawFrondCell(ctx, half, half, half, "atlas-palm", 28, half * 0.4, half * 0.036, 0.55, 0.7);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  atlasTex = tex;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Shaders: wind, vegetation lighting, bark, leaf cards
// ---------------------------------------------------------------------------------------------

type Uni = { value: unknown };

/** Uniforms shared by every vegetation material. update() writes uTime and uVegDay. */
const SHARED: Record<string, Uni> = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindStrength: { value: 0.5 },
  uSkyColor: { value: new THREE.Color(0.55, 0.72, 0.92) },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uVegDay: { value: 1 }
};

function tick(frame: ResourceFrame): void {
  (SHARED.uTime as Uni).value = frame.time;
  (SHARED.uVegDay as Uni).value = 1 - 0.8 * clamp(frame.night, 0, 1);
}

const NOISE_GLSL = /* glsl */ `
float vegHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Value noise, 0..1
float vegNoise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vegHash12(i), vegHash12(i + vec2(1.0, 0.0)), u.x),
             mix(vegHash12(i + vec2(0.0, 1.0)), vegHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const VEG_COMMON = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec3 uSkyColor;
uniform vec3 uSunColor;
uniform float uVegDay;
varying float vVegTrans;
varying float vVegGloss;
varying float vVegAO;
${NOISE_GLSL}
vec2 vegWindDir() {
  float l = length(uWindDir);
  return l > 1e-4 ? uWindDir / l : vec2(1.0, 0.0);
}
// Rolling gust waves that travel with the wind (0..1).
float vegGust(vec2 xz) {
  vec2 wd = vegWindDir();
  vec2 pd = vec2(-wd.y, wd.x);
  float speed = 3.5 + uWindStrength * 6.0;
  float along = dot(xz, wd) - uTime * speed;
  float across = dot(xz, pd);
  float n1 = vegNoise2(vec2(along * 0.045, across * 0.018));
  float n2 = vegNoise2(vec2(along * 0.11, across * 0.06) + 13.7);
  float band = 0.5 + 0.5 * sin(along * 0.085 + n2 * 3.0);
  float g = n1 * 0.55 + band * band * 0.45 + (n2 - 0.5) * 0.25;
  return smoothstep(0.3, 0.85, g);
}
`;

/** Wrapped diffuse, light through thin leaves, and a small gloss term. Replaces Lambert RE_Direct. */
const VEG_LIGHT = /* glsl */ `
#ifndef VEG_WRAP
#define VEG_WRAP 0.5
#endif
#ifndef VEG_TRANS
#define VEG_TRANS 1.2
#endif
uniform vec3 uVegTransColor;
void RE_Direct_Veg( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot( geometryNormal, directLight.direction );
  float wrapD = saturate( ( ndl + VEG_WRAP ) / ( 1.0 + VEG_WRAP ) );
  reflectedLight.directDiffuse += wrapD * directLight.color * BRDF_Lambert( material.diffuseColor );
  float back = saturate( dot( -geometryViewDir, directLight.direction ) );
  float trans = ( pow( back, 3.0 ) * 0.85 + 0.15 * saturate( -ndl ) ) * vVegTrans * VEG_TRANS;
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uVegTransColor * trans * RECIPROCAL_PI;
  vec3 hv = normalize( directLight.direction + geometryViewDir );
  float spec = pow( saturate( dot( geometryNormal, hv ) ), 48.0 ) * vVegGloss;
  reflectedLight.directDiffuse += directLight.color * spec * 0.6;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Veg
`;

const VEG_RIM_GLSL = /* glsl */ `
#ifdef VEG_RIM
{
  vec3 vegVd = normalize(vViewPosition);
  float rim = pow(1.0 - saturate(dot(normal, vegVd)), 2.5);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * (uSkyColor * 0.35 + uSunColor * 0.35) * rim * VEG_RIM * uVegDay;
}
#endif
`;

const VEG_AO_POST = /* glsl */ `
reflectedLight.indirectDiffuse *= vVegAO;
`;

const TREE_VERT_PARS = /* glsl */ `
attribute vec4 aVeg;
attribute vec3 aCenter;
uniform float uVegSway;
uniform float uVegFlutter;
varying vec2 vBarkUv;
`;

const TREE_FRAG_PARS = /* glsl */ `
varying vec2 vBarkUv;
`;

/** Whole-plant sway (height squared), gust waves, and leaf-card flutter. Runs after begin_vertex. */
const TREE_SWAY = /* glsl */ `
{
  mat3 vegM = mat3(modelMatrix);
  vec3 treeO = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float ts2 = max(dot(vegM[0], vegM[0]), 1e-6);
  float tsc = sqrt(ts2);
  float phase = dot(treeO.xz, vec2(0.37, 0.61));
  #if defined(VEG_SOLID_NOISE) && !defined(VEG_DEPTH) && defined(USE_COLOR)
  {
    vec3 cW = (modelMatrix * vec4(aCenter, 1.0)).xyz;
    vColor.rgb *= 0.9 + 0.2 * vegNoise2(cW.xz * 1.7 + cW.y * 0.9);
  }
  #endif
  vBarkUv = aVeg.zw;
  vVegTrans = 1.0;
  float hy = position.y * tsc;
  vec3 offW = vec3(0.0);
  #ifdef VEG_CARDS
    float fl = sin(uTime * (2.6 + aVeg.x * 3.5) + aVeg.x * 40.0 + phase) * (0.02 + 0.07 * uWindStrength) * aVeg.y * uVegFlutter;
    offW += normalize(vegM * normal) * fl;
  #endif
  float gust = vegGust(treeO.xz);
  float k = hy * hy * uVegSway;
  float osc = sin(uTime * 1.05 + phase) * 0.6 + sin(uTime * 2.2 + phase * 1.7) * 0.4;
  vec2 wd = vegWindDir();
  vec2 off = wd * k * (uWindStrength * (0.45 + gust * 1.1) + osc * (0.1 + 0.3 * uWindStrength));
  off += vec2(-wd.y, wd.x) * k * sin(uTime * 0.83 + phase * 2.1) * (0.05 + 0.12 * uWindStrength);
  #ifdef VEG_CARDS
    off += wd * aVeg.y * gust * uWindStrength * 0.1 * uVegFlutter * sin(uTime * 4.5 + aVeg.x * 20.0);
  #endif
  offW += vec3(off.x, 0.0, off.y);
  transformed += (transpose(vegM) * offW) / ts2;
}
`;

/** Leaf cards: keep coverage at a distance, thin out cards seen edge-on. Runs after map_fragment. */
const CARD_ALPHA = /* glsl */ `
#ifdef USE_MAP
{
  vec2 vegDx = dFdx(vMapUv * ${ATLAS_SIZE.toFixed(1)});
  vec2 vegDy = dFdy(vMapUv * ${ATLAS_SIZE.toFixed(1)});
  float vegMip = max(0.0, 0.5 * log2(max(dot(vegDx, vegDx), dot(vegDy, vegDy))));
  diffuseColor.a *= 1.0 + min(vegMip, 3.0) * 0.3;
  #ifndef VEG_DEPTH
    vec3 vegFaceN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    float vegEdge = abs(dot(vegFaceN, normalize(vViewPosition)));
    diffuseColor.a *= smoothstep(0.1, 0.5, vegEdge);
  #endif
}
#endif
`;

/** Procedural bark: 0 = brown streaks, 1 = birch dashes, 2 = palm rings. Runs after color_fragment. */
const BARK_GLSL = /* glsl */ `
{
  vec3 c = diffuseColor.rgb;
  vec2 bu = vBarkUv;
  #if BARK_KIND == 0
    float st = vegNoise2(vec2(bu.x * 16.0, bu.y * 1.1));
    float st2 = vegNoise2(vec2(bu.x * 38.0, bu.y * 2.6) + 7.0);
    c *= 0.7 + 0.42 * smoothstep(0.2, 0.8, st) * (0.75 + 0.25 * st2);
  #elif BARK_KIND == 1
    float d = vegNoise2(vec2(bu.x * 5.0, bu.y * 6.0));
    float dash = smoothstep(0.66, 0.72, d) * smoothstep(0.35, 0.6, vegNoise2(vec2(bu.x * 3.0 + 5.0, bu.y * 20.0)));
    c = mix(c, vec3(0.05, 0.045, 0.04), dash * 0.9);
    c *= 0.9 + 0.12 * vegNoise2(vec2(bu.x * 30.0, bu.y * 8.0));
    c = mix(c * vec3(0.35, 0.3, 0.27), c, smoothstep(0.1, 1.0, bu.y));
  #else
    float ring = smoothstep(0.7, 0.95, fract(bu.y * 2.4));
    c *= 1.0 - ring * 0.32;
    c *= 0.85 + 0.15 * vegNoise2(vec2(bu.x * 12.0, bu.y * 4.0));
  #endif
  diffuseColor.rgb = c;
}
`;

type PatchOpts = {
  key: string;
  defines?: Record<string, string | number>;
  uniforms?: Record<string, Uni>;
  vertexPars?: string;
  fragmentPars?: string;
  /** After beginnormal_vertex (main materials only). */
  vertexNormal?: string;
  /** After begin_vertex. */
  vertexPosition?: string;
  fragmentMap?: string;
  fragmentColor?: string;
  fragmentPost?: string;
  noFaceFlip?: boolean;
  transColor?: string;
};

function inject(src: string, chunk: string, code: string | undefined, after = true): string {
  if (!code) return src;
  const tag = `#include <${chunk}>`;
  return src.includes(tag) ? src.replace(tag, after ? `${tag}\n${code}\n` : `${code}\n${tag}`) : src;
}

/** Adds the vegetation shader code to a Lambert or depth material. */
function patchVeg(mat: THREE.Material, o: PatchOpts): void {
  const depth = (mat as THREE.MeshDepthMaterial).isMeshDepthMaterial === true;
  const trans: Uni = { value: col(o.transColor ?? "#e6f07a") };
  mat.defines = { ...(mat.defines ?? {}), ...(o.defines ?? {}), ...(depth ? { VEG_DEPTH: 1 } : {}) };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED, o.uniforms ?? {}, { uVegTransColor: trans });
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs = vs.replace("#include <common>", `#include <common>\n${VEG_COMMON}\n${o.vertexPars ?? ""}\n`);
    vs = vs.replace("void main() {", "void main() {\n  vVegTrans = 0.5; vVegGloss = 0.0; vVegAO = 1.0;\n");
    fs = fs.replace("#include <common>", `#include <common>\n${VEG_COMMON}\n${o.fragmentPars ?? ""}\n`);
    if (!depth) vs = inject(vs, "beginnormal_vertex", o.vertexNormal);
    vs = inject(vs, "begin_vertex", o.vertexPosition);
    fs = inject(fs, "map_fragment", o.fragmentMap);
    if (!depth) {
      fs = inject(fs, "color_fragment", o.fragmentColor);
      // Keep the authored normal on back faces (leaf cards and blades light the same on both sides).
      if (o.noFaceFlip) fs = inject(fs, "normal_fragment_begin", "#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif");
      fs = inject(fs, "lights_lambert_pars_fragment", VEG_LIGHT);
      fs = inject(fs, "lights_fragment_end", o.fragmentPost);
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  const key = `nature-veg-${o.key}${depth ? "-depth" : ""}`;
  mat.customProgramCacheKey = () => key;
}

/** Sway settings for one species. Values are per meter of the scaled model. */
type SwayKit = { sway: Uni; flutter: Uni };
const swayKit = (sway: number, flutter: number): SwayKit => ({ sway: { value: sway }, flutter: { value: flutter } });
const swayUniforms = (k: SwayKit): Record<string, Uni> => ({ uVegSway: k.sway, uVegFlutter: k.flutter });

function cardMaterial(k: SwayKit, low: boolean, tint: THREE.Color): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: leafAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, color: tint });
  patchVeg(m, {
    key: low ? "cards-low" : "cards",
    defines: { VEG_CARDS: 1, VEG_WRAP: "0.55", VEG_TRANS: low ? "1.0" : "1.3", VEG_RIM: "0.9" },
    uniforms: swayUniforms(k),
    vertexPars: TREE_VERT_PARS,
    fragmentPars: TREE_FRAG_PARS,
    vertexPosition: TREE_SWAY,
    fragmentMap: CARD_ALPHA,
    fragmentPost: VEG_RIM_GLSL,
    noFaceFlip: true,
    transColor: "#f4f08a"
  });
  return m;
}

function cardDepth(k: SwayKit): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ map: leafAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
  patchVeg(m, {
    key: "cards",
    defines: { VEG_CARDS: 1 },
    uniforms: swayUniforms(k),
    vertexPars: TREE_VERT_PARS,
    fragmentPars: TREE_FRAG_PARS,
    vertexPosition: TREE_SWAY,
    fragmentMap: CARD_ALPHA
  });
  return m;
}

function barkMaterial(kind: 0 | 1 | 2, k: SwayKit, tint: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color().setScalar(tint) });
  patchVeg(m, {
    key: `bark${kind}`,
    defines: { BARK_KIND: kind, VEG_WRAP: "0.35", VEG_TRANS: "0.0", VEG_RIM: "0.4" },
    uniforms: swayUniforms(k),
    vertexPars: TREE_VERT_PARS,
    fragmentPars: TREE_FRAG_PARS,
    vertexPosition: TREE_SWAY,
    fragmentColor: BARK_GLSL,
    fragmentPost: VEG_RIM_GLSL
  });
  return m;
}

function solidMaterial(k: SwayKit, tint: THREE.Color): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, color: tint });
  patchVeg(m, {
    key: "solid",
    defines: { VEG_SOLID_NOISE: 1, VEG_WRAP: "0.6", VEG_TRANS: "0.8", VEG_RIM: "1.0" },
    uniforms: swayUniforms(k),
    vertexPars: TREE_VERT_PARS,
    fragmentPars: TREE_FRAG_PARS,
    vertexPosition: TREE_SWAY,
    fragmentPost: VEG_RIM_GLSL,
    transColor: "#b8d68a"
  });
  return m;
}

function reedMaterial(k: SwayKit): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  patchVeg(m, {
    key: "reed",
    defines: { VEG_WRAP: "0.6", VEG_TRANS: "1.0", VEG_RIM: "0.6" },
    uniforms: swayUniforms(k),
    vertexPars: TREE_VERT_PARS,
    fragmentPars: TREE_FRAG_PARS,
    vertexPosition: TREE_SWAY,
    fragmentPost: VEG_RIM_GLSL,
    noFaceFlip: true,
    transColor: "#e8ec9a"
  });
  return m;
}

/** Shadow depth for swaying solid parts (trunks, reeds, lily pads, mushrooms). */
function swayDepth(k: SwayKit, doubleSided = false): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  patchVeg(m, {
    key: "sway",
    uniforms: swayUniforms(k),
    vertexPars: TREE_VERT_PARS,
    fragmentPars: TREE_FRAG_PARS,
    vertexPosition: TREE_SWAY
  });
  return m;
}

function jitterTint(hex: string, r: Rand): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  col(hex).getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h + r.range(-0.02, 0.02), hsl.s * r.range(0.9, 1.08), hsl.l * r.range(0.92, 1.06));
}

// ---------------------------------------------------------------------------------------------
// Instance assembly
// ---------------------------------------------------------------------------------------------

type Part = {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  depth?: THREE.Material;
  /** Material made for this instance (disposed with it). */
  ownMat?: boolean;
  /** Geometry made for this instance (disposed with it). */
  ownGeo?: boolean;
  castShadow?: boolean;
};

function assemble(parts: Part[], yaw: number, scale: number, lift = 0, animated = true): ResourceInstance {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.y = yaw;
  inner.scale.setScalar(scale);
  inner.position.y = lift;
  for (const p of parts) {
    const mesh = new THREE.Mesh(p.geo, p.mat);
    mesh.castShadow = p.castShadow ?? true;
    mesh.receiveShadow = true;
    if (p.depth) mesh.customDepthMaterial = p.depth;
    inner.add(mesh);
  }
  root.add(inner);
  return {
    object: root,
    update: animated ? tick : undefined,
    dispose: () => {
      for (const p of parts) {
        if (p.ownMat) p.mat.dispose();
        if (p.ownGeo) p.geo.dispose();
      }
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------------------------

type TreeBuild = { trunk: VegMesh; leaves: VegMesh };

function buildBroadleaf(key: string): TreeBuild {
  const t = rand(key);
  const trunk = new VegMesh();
  const leaves = new VegMesh();
  const a = t.range(3, 4);
  const o = t.range(-0.6, 0.6);
  const s = t.range(-0.6, 0.6);
  const spine = catmull([v3(0, -0.3, 0), v3(o * 0.15, a * 0.35, s * 0.15), v3(o * 0.55, a * 0.72, s * 0.55), v3(o, a, s), v3(o * 1.1, a + 1.6, s * 1.1)], 14);
  const l = t.range(0.3, 0.38);
  const u = t.range(0, 6);
  const bark = col("#6b5443");
  tube(
    trunk,
    spine,
    9,
    (e, ang) => {
      const flare = Math.max(0, 1 - e / 0.14) ** 2 * (0.55 + 0.45 * Math.max(0, Math.cos(ang * 3 + u)));
      return l * (1 - e * 0.62) * (1 + flare * 0.9);
    },
    (e) => bark.clone().multiplyScalar(0.7 + 0.35 * e),
    { vScale: 1 }
  );
  const f = v3(o, a + t.range(1.9, 2.4), s);
  const p = t.range(3.1, 3.8);
  const mH = t.range(2.2, 2.7);
  const ext = v3(p, mH, p);
  const cl: Cluster[] = [];
  cl.push({ c: f.clone().add(v3(t.range(-0.4, 0.4), mH * 0.55, t.range(-0.4, 0.4))), r: t.range(1.7, 2) });
  const ring = t.pick([5, 6, 6, 7]);
  const b0 = t.range(0, 6.28);
  for (let e = 0; e < ring; e++) {
    const n = b0 + (e / ring) * TAU + t.range(-0.3, 0.3);
    const r = p * t.range(0.55, 0.72);
    cl.push({ c: f.clone().add(v3(Math.cos(n) * r, t.range(-0.1, 0.55) * mH, Math.sin(n) * r)), r: t.range(1.45, 1.95) });
  }
  const low = t.pick([3, 4, 4]);
  for (let e = 0; e < low; e++) {
    const n = b0 + 0.5 + (e / low) * TAU + t.range(-0.3, 0.3);
    const r = p * t.range(0.35, 0.55);
    cl.push({ c: f.clone().add(v3(Math.cos(n) * r, -mH * t.range(0.3, 0.5), Math.sin(n) * r)), r: t.range(1.3, 1.6) });
  }
  for (let e = 0; e < 4; e++) {
    const target = cl[1 + ((e * 2) % (cl.length - 1))] as Cluster;
    const at = t.range(0.55, 0.85);
    const from = (spine[Math.floor(at * (spine.length - 1))] as V3).clone();
    const to = target.c.clone().lerp(f, 0.25);
    tube(
      trunk,
      catmull([from, from.clone().lerp(to, 0.5).add(v3(0, 0.5, 0)), to], 5),
      5,
      (c) => 0.13 * (1 - c * 0.65),
      (c) => bark.clone().multiplyScalar(0.8 + 0.2 * c),
      { vScale: 1, v0: 3 }
    );
  }
  leafClusters(leaves, t, cl, f, ext, ATLAS_RECT.broadleaf, 1.35, 4.6);
  return { trunk, leaves };
}

function buildBirch(key: string): TreeBuild {
  const t = rand(key);
  const trunk = new VegMesh();
  const leaves = new VegMesh();
  const a = t.range(7.5, 10);
  const o = t.range(-0.7, 0.7);
  const s = t.range(-0.7, 0.7);
  const spine = catmull(
    [v3(0, -0.3, 0), v3(o * 0.2 + t.range(-0.15, 0.15), a * 0.3, s * 0.2), v3(o * 0.6, a * 0.65, s * 0.6 + t.range(-0.2, 0.2)), v3(o, a, s)],
    16
  );
  const l = t.range(0.14, 0.18);
  const bark = col("#ece6d8");
  tube(trunk, spine, 7, (e) => l * (1 - e * 0.7) * (1 + 0.5 * Math.max(0, 1 - e / 0.08) ** 2), () => bark, { vScale: 1 });
  const cl: Cluster[] = [];
  const count = t.pick([5, 6, 7]);
  for (let e = 0; e < count; e++) {
    const n = e / (count - 1);
    const y = a * (0.42 + 0.6 * n);
    const sp = spine[Math.min(spine.length - 1, Math.floor((y / a) * (spine.length - 1)))] as V3;
    const ang = t.range(0, 6.28);
    const d = (1 - n) * t.range(0.5, 1);
    cl.push({ c: v3(sp.x + Math.cos(ang) * d, y, sp.z + Math.sin(ang) * d), r: lerp(1.45, 0.95, n) * t.range(0.9, 1.1) });
  }
  for (let e = 0; e < 3; e++) {
    const c = cl[e] as Cluster;
    const at = c.c.y / a - 0.08;
    const from = (spine[Math.max(1, Math.floor(at * (spine.length - 1)))] as V3).clone();
    tube(trunk, [from, from.clone().lerp(c.c, 0.5).add(v3(0, 0.2, 0)), c.c.clone()], 4, (q) => 0.05 * (1 - q * 0.6), () => bark, { vScale: 1, v0: 2 });
  }
  leafClusters(leaves, t, cl, v3(o * 0.8, a * 0.62, s * 0.8), v3(2, a * 0.5, 2), ATLAS_RECT.birch, 1.3, 6.5);
  return { trunk, leaves };
}

function buildConifer(key: string): TreeBuild {
  const t = rand(key);
  const trunk = new VegMesh();
  const leaves = new VegMesh();
  const a = t.range(9, 13);
  const tr = t.range(0.24, 0.3);
  const bark = col("#5a4536");
  tube(trunk, catmull([v3(0, -0.3, 0), v3(0, a * 0.5, 0), v3(0, a * 0.85, 0)], 6), 7, (e) => tr * (1 - e * 0.8) * (1 + 0.6 * Math.max(0, 1 - e / 0.1) ** 2), () => bark, {
    vScale: 1
  });
  const tiers = t.pick([6, 7, 7, 8]);
  const dark = col("#2c5a42");
  const light = col("#5c8a50");
  const under = col("#10231a");
  const start = t.range(1.3, 1.8);
  for (let e = 0; e < tiers; e++) {
    const n = e / (tiers - 1);
    const i = start + (a - start - 2.2) * n ** 0.92;
    const radius = lerp(3, 0.7, n ** 0.85) * t.range(0.92, 1.08);
    const sH = lerp(2.6, 1.7, n);
    const top = i + sH;
    const h0 = t.range(0, 6.28);
    const g = t.next();
    const apex = leaves.vert(v3(0, top, 0), v3(0, 1, 0), 0.5, 1, dark.clone().multiplyScalar(0.75), [g, 1, 0, 0], v3(0, top, 0));
    const upper: number[] = [];
    const rim: number[] = [];
    const inner: number[] = [];
    for (let j = 0; j < 26; j++) {
      const ang = h0 + (j / 26) * TAU;
      const even = j % 2 === 0;
      const d = t.range(0.9, 1.1);
      const pp = radius * (even ? 1 : 0.74) * d;
      const cx = Math.cos(ang);
      const sz = Math.sin(ang);
      const drop = even ? t.range(0.35, 0.6) : 0.12;
      const S = v3(cx, 0, sz);
      const C = v3(cx * pp * 0.5, i + sH * 0.42, sz * pp * 0.5);
      const w = S.clone().multiplyScalar(0.8).add(v3(0, 0.75, 0)).normalize();
      upper.push(leaves.vert(C, w, j / 26, 0.6, dark.clone().multiplyScalar(0.8 + 0.25 * n), [g, 1, 0, 0], C));
      const T = v3(cx * pp, i - drop, sz * pp);
      const E = S.clone().multiplyScalar(0.9).add(v3(0, 0.45, 0)).normalize();
      rim.push(leaves.vert(T, E, j / 26, 0.2, even ? light.clone().multiplyScalar(t.range(0.9, 1.15)) : dark.clone().lerp(light, 0.3), [g, 1, 0, 0], T));
      const D = v3(cx * pp * 0.32, i + 0.35, sz * pp * 0.32);
      const O = S.clone().multiplyScalar(0.6).add(v3(0, -0.5, 0)).normalize();
      inner.push(leaves.vert(D, O, j / 26, 0, under, [g, 1, 0, 0], D));
    }
    for (let j = 0; j < 26; j++) {
      const q = (j + 1) % 26;
      const uj = upper[j] as number;
      const uq = upper[q] as number;
      const rj = rim[j] as number;
      const rq = rim[q] as number;
      const ij = inner[j] as number;
      const iq = inner[q] as number;
      leaves.tri(apex, uq, uj);
      leaves.tri(uj, uq, rj);
      leaves.tri(rj, uq, rq);
      leaves.tri(rj, rq, ij);
      leaves.tri(ij, rq, iq);
    }
  }
  return { trunk, leaves };
}

function buildPalm(key: string): TreeBuild {
  const t = rand(key);
  const trunk = new VegMesh();
  const leaves = new VegMesh();
  const a = t.range(6, 8.2);
  const o = t.range(1.4, 2.6);
  const spine = catmull([v3(0, -0.3, 0), v3(o * 0.1, a * 0.35, 0), v3(o * 0.45, a * 0.7, 0), v3(o, a, 0)], 16);
  const bark = col("#8f7a5e");
  tube(
    trunk,
    spine,
    8,
    (e) => 0.24 * (1 - e * 0.35) * (1 + 0.5 * Math.max(0, 1 - e / 0.08) ** 2),
    (e) => bark.clone().multiplyScalar(0.8 + 0.25 * e),
    { vScale: 1, capTop: true }
  );
  const top = v3(o, a, 0);
  const count = t.pick([10, 11, 12]);
  const white = col("#ffffff");
  for (let e = 0; e < count; e++) {
    const n = (e / count) * TAU + t.range(-0.2, 0.2);
    const rise = e % 2 === 0 ? t.range(0.35, 0.6) : t.range(0.05, 0.3);
    frond(
      leaves,
      top.clone().add(v3(0, 0.1, 0)),
      v3(Math.cos(n), rise, Math.sin(n)),
      t.range(3.4, 4.4),
      t.range(1.7, 2),
      t.range(0.28, 0.45),
      6,
      ATLAS_RECT.palm,
      (s) => white.clone().multiplyScalar(0.7 + 0.3 * s),
      t.next(),
      0.55,
      0.6
    );
  }
  for (let e = 0; e < 3; e++) {
    const ang = t.range(0, 6.28);
    frond(leaves, top.clone(), v3(Math.cos(ang) * 0.4, 1, Math.sin(ang) * 0.4), 1.8, 0.8, 0.1, 3, ATLAS_RECT.palm, () => 0.85, t.next(), 0.3);
  }
  return { trunk, leaves };
}

type TreeKind = {
  id: string;
  build: (key: string) => TreeBuild;
  /** Generator units to meters. */
  scale: number;
  bark: 0 | 1 | 2;
  cards: boolean;
  palette: readonly string[];
};

const TREE_VARIANTS = 8;

const TREES: Record<"broadleaf" | "conifer" | "birch" | "palm", TreeKind> = {
  broadleaf: {
    id: "broadleaf",
    build: buildBroadleaf,
    scale: 0.6,
    bark: 0,
    cards: true,
    palette: ["#86c653", "#94cc57", "#79bb5a", "#a3cd5c", "#80c04e", "#8fc463"]
  },
  conifer: { id: "conifer", build: buildConifer, scale: 0.5, bark: 0, cards: false, palette: ["#ffffff", "#e8f6ec", "#f6fbe6", "#dfeee8"] },
  birch: { id: "birch", build: buildBirch, scale: 0.58, bark: 1, cards: true, palette: ["#a8d85c", "#b6de66", "#9ed25e", "#c0e06a"] },
  palm: { id: "palm", build: buildPalm, scale: 0.62, bark: 2, cards: true, palette: ["#96c55a", "#a1c95e"] }
};

const treeGeoCache = new Map<string, { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry }>();
const treeKitCache = new Map<string, { k: SwayKit; barkDepth: THREE.Material; leafDepth: THREE.Material }>();

function treeGeometry(kind: TreeKind, variant: number): { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const key = `${kind.id}-${variant}`;
  let g = treeGeoCache.get(key);
  if (!g) {
    const b = kind.build(key);
    g = { trunk: b.trunk.build(kind.scale), leaves: b.leaves.build(kind.scale) };
    treeGeoCache.set(key, g);
  }
  return g;
}

function treeKit(kind: TreeKind): { k: SwayKit; barkDepth: THREE.Material; leafDepth: THREE.Material } {
  let kit = treeKitCache.get(kind.id);
  if (!kit) {
    // Sway grows with height squared; divide by the scale so a smaller tree bends in proportion.
    const k = swayKit(0.0035 / kind.scale, kind.scale);
    kit = { k, barkDepth: swayDepth(k), leafDepth: kind.cards ? cardDepth(k) : swayDepth(k) };
    treeKitCache.set(kind.id, kit);
  }
  return kit;
}

function treeInstance(kind: TreeKind, seed: number): ResourceInstance {
  const s = normSeed(seed);
  const geo = treeGeometry(kind, s % TREE_VARIANTS);
  const kit = treeKit(kind);
  const r = rand(`${kind.id}-instance-${s}`);
  const yaw = r.range(0, TAU);
  const scale = r.range(0.88, 1.12);
  const barkMat = barkMaterial(kind.bark, kit.k, r.range(0.85, 1.1));
  const tint = jitterTint(r.pick(kind.palette), r);
  const leafMat = kind.cards ? cardMaterial(kit.k, false, tint) : solidMaterial(kit.k, tint);
  return assemble(
    [
      { geo: geo.trunk, mat: barkMat, depth: kit.barkDepth, ownMat: true },
      { geo: geo.leaves, mat: leafMat, depth: kit.leafDepth, ownMat: true }
    ],
    yaw,
    scale,
    -0.03
  );
}

// ---------------------------------------------------------------------------------------------
// Bush, fern, reeds, water lily, mushrooms
// ---------------------------------------------------------------------------------------------

function buildBush(key: string): VegMesh {
  const t = rand(key);
  const m = new VegMesh();
  const cl: Cluster[] = [];
  const n = t.pick([3, 4, 5]);
  for (let e = 0; e < n; e++) {
    const ang = (e / n) * TAU + t.range(-0.4, 0.4);
    const d = e === 0 ? 0 : t.range(0.35, 0.6);
    const r = t.range(0.55, 0.8);
    cl.push({ c: v3(Math.cos(ang) * d, r * 0.75 + t.range(0, 0.25), Math.sin(ang) * d), r });
  }
  leafClusters(m, t, cl, v3(0, 0.55, 0), v3(1.1, 0.7, 1.1), ATLAS_RECT.broadleaf, 1.45, 9);
  return m;
}

function buildFern(key: string): VegMesh {
  const t = rand(key);
  const m = new VegMesh();
  const n = t.pick([7, 8, 9, 10]);
  const white = col("#ffffff");
  for (let e = 0; e < n; e++) {
    const a = (e / n) * TAU + t.range(-0.25, 0.25);
    const rise = t.range(0.55, 1);
    frond(
      m,
      v3(Math.cos(a) * 0.05, 0.02, Math.sin(a) * 0.05),
      v3(Math.cos(a) * 0.8, rise, Math.sin(a) * 0.8),
      t.range(0.8, 1.15),
      t.range(0.5, 0.62),
      t.range(0.5, 0.8),
      4,
      ATLAS_RECT.fern,
      (s) => white.clone().multiplyScalar(0.55 + 0.45 * s),
      t.next(),
      0.5
    );
  }
  return m;
}

/** A flat, tapering leaf blade that curves out from its base (reed leaves). */
function blade(m: VegMesh, base: V3, lean: V3, height: number, width: number, segs: number, c0: THREE.Color, c1: THREE.Color, rnd: number): void {
  const side = v3(-lean.z, 0, lean.x);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const nrm = new THREE.Vector3().crossVectors(side, v3(0, 1, 0)).normalize().lerp(v3(0, 1, 0), 0.5).normalize();
  const start = m.count;
  for (let d = 0; d <= segs; d++) {
    const f = d / segs;
    const p = base
      .clone()
      .addScaledVector(lean, f * f * height)
      .add(v3(0, f * height, 0));
    const w = width * (1 - f ** 1.3);
    const c = c0.clone().lerp(c1, f);
    m.vert(p.clone().addScaledVector(side, -w * 0.5), nrm, 0, f, c, [rnd, f, 0, 0], base);
    m.vert(p.clone().addScaledVector(side, w * 0.5), nrm, 1, f, c, [rnd, f, 0, 0], base);
  }
  for (let k = 0; k < segs; k++) {
    const n = start + k * 2;
    m.tri(n, n + 1, n + 2);
    m.tri(n + 2, n + 1, n + 3);
  }
}

function buildReeds(key: string): VegMesh {
  const t = rand(key);
  const m = new VegMesh();
  const leaves = 12 + Math.floor(t.next() * 7);
  const root = col("#3e5e33");
  const tip = col("#9db463");
  const pale = col("#c9bf7a");
  for (let e = 0; e < leaves; e++) {
    const ang = t.range(0, TAU);
    const d = Math.sqrt(t.next()) * 0.35;
    blade(
      m,
      v3(Math.cos(ang) * d, -0.05, Math.sin(ang) * d),
      v3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(t.range(0.05, 0.3)),
      t.range(1, 1.8),
      t.range(0.045, 0.07),
      4,
      root,
      t.chance(0.3) ? pale : tip,
      t.next()
    );
  }
  const heads = 2 + Math.floor(t.next() * 3);
  const stem = col("#5d7a3e");
  const brown = col("#6e4526");
  for (let e = 0; e < heads; e++) {
    const ang = t.range(0, TAU);
    const d = t.range(0, 0.25);
    const x = Math.cos(ang) * d;
    const z = Math.sin(ang) * d;
    const h = t.range(1.4, 1.9);
    const dx = t.range(-0.1, 0.1);
    const dz = t.range(-0.1, 0.1);
    tube(m, [v3(x, -0.05, z), v3(x + dx * 0.3, h * 0.5, z + dz * 0.3), v3(x + dx, h, z + dz)], 4, () => 0.012, () => stem, { rand: t.next(), flex: (c) => c });
    const f = v3(x + dx * 0.85, h * 0.8, z + dz * 0.85);
    const p = v3(x + dx * 0.97, h * 0.95, z + dz * 0.97);
    tube(m, [f, f.clone().lerp(p, 0.5), p], 6, (c) => 0.045 * (1 - (Math.abs(c - 0.5) * 2) ** 4 * 0.5), () => brown, {
      rand: t.next(),
      flex: () => 0.9,
      capTop: true
    });
  }
  return m;
}

function buildLily(key: string): VegMesh {
  const t = rand(key);
  const m = new VegMesh();
  const pads = t.pick([3, 4, 5, 6]);
  const up = v3(0, 1, 0);
  const padDark = col("#3c6a2e");
  const padLight = col("#6d9c45");
  const petal = col(t.chance(0.5) ? "#f7c3d9" : "#fff4ec");
  const centre = col("#f5c842");
  for (let e = 0; e < pads; e++) {
    const ang = t.range(0, TAU);
    const d = e === 0 ? 0 : t.range(0.45, 1.2);
    const u = Math.cos(ang) * d;
    const w = Math.sin(ang) * d;
    const radius = t.range(0.22, 0.45);
    const y = e * 0.004;
    const notch = t.range(0, TAU);
    const hub = m.vert(v3(u, y + 0.01, w), up, 0.5, 0.5, padLight, [t.next(), 0, 0, 0], v3(u, y, w));
    const ring: number[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = notch + 0.3 + (k / 16) * (TAU - 0.6);
      const rr = radius * (0.94 + 0.06 * Math.sin(a * 5 + e));
      const shade = k % 2 === 0 ? 0.92 : 1;
      ring.push(m.vert(v3(u + Math.cos(a) * rr, y, w + Math.sin(a) * rr), up, 0, 0, padDark.clone().multiplyScalar(shade), [0, 0, 0, 0], v3(u, y, w)));
    }
    for (let k = 0; k < 16; k++) m.tri(hub, ring[k + 1] as number, ring[k] as number);
    if (t.chance(0.35)) {
      const fc = v3(u + t.range(-0.08, 0.08), y + 0.02, w + t.range(-0.08, 0.08));
      for (let layer = 0; layer < 2; layer++) {
        const reach = layer === 0 ? 0.16 : 0.11;
        const lift = layer === 0 ? 0.05 : 0.1;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + layer * 0.4;
          const dir = v3(Math.cos(a), 0, Math.sin(a));
          const side = v3(-dir.z, 0, dir.x).multiplyScalar(0.035);
          const tipP = fc.clone().addScaledVector(dir, reach).add(v3(0, lift, 0));
          const mid = fc
            .clone()
            .addScaledVector(dir, reach * 0.5)
            .add(v3(0, lift * 0.3, 0));
          const n = dir.clone().multiplyScalar(-0.4).add(up).normalize();
          const i0 = m.vert(fc, up, 0, 0, petal.clone().multiplyScalar(0.85), [0, 0, 0, 0], fc);
          const i1 = m.vert(mid.clone().add(side), n, 0, 0, petal, [0, 0, 0, 0], fc);
          const i2 = m.vert(tipP, n, 0, 0, petal, [0, 0, 0, 0], fc);
          const i3 = m.vert(mid.clone().sub(side), n, 0, 0, petal, [0, 0, 0, 0], fc);
          m.tri(i0, i1, i2);
          m.tri(i0, i2, i3);
          m.tri(i0, i2, i1);
          m.tri(i0, i3, i2);
        }
      }
      const top = m.vert(fc.clone().add(v3(0, 0.06, 0)), up, 0, 0, centre, [0, 0, 0, 0], fc);
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * TAU;
        const a1 = ((k + 1) / 6) * TAU;
        const p0 = m.vert(fc.clone().add(v3(Math.cos(a0) * 0.035, 0.03, Math.sin(a0) * 0.035)), up, 0, 0, centre, [0, 0, 0, 0], fc);
        const p1 = m.vert(fc.clone().add(v3(Math.cos(a1) * 0.035, 0.03, Math.sin(a1) * 0.035)), up, 0, 0, centre, [0, 0, 0, 0], fc);
        m.tri(top, p1, p0);
      }
    }
  }
  return m;
}

const MUSHROOM_BROWNS = ["#c89660", "#b87d4b", "#e0b77a"];

function mushroomIsRed(key: string): boolean {
  const t = rand(key);
  t.pick([2, 3, 4, 5]);
  return t.chance(0.55);
}

function buildMushrooms(key: string): VegMesh {
  const t = rand(key);
  const m = new VegMesh();
  const count = t.pick([2, 3, 4, 5]);
  const red = t.chance(0.55);
  const cap = col(red ? "#d63d2a" : t.pick(MUSHROOM_BROWNS));
  const spot = col("#fbf4e6");
  const stem = col("#efe5cf");
  const gills = col("#d9c7a4");
  const noise = simplex2(hashRng(key));
  for (let e = 0; e < count; e++) {
    const ang = t.range(0, TAU);
    const d = e === 0 ? 0 : t.range(0.08, 0.28);
    const x = Math.cos(ang) * d;
    const z = Math.sin(ang) * d;
    const sz = e === 0 ? 1 : t.range(0.5, 0.85);
    const h = t.range(0.1, 0.2) * sz;
    const cr = t.range(0.07, 0.11) * sz;
    const lean = v3(t.range(-0.03, 0.03), 0, t.range(-0.03, 0.03));
    tube(m, [v3(x, -0.03, z), v3(x, h * 0.5, z).add(lean.clone().multiplyScalar(0.5)), v3(x, h, z).add(lean)], 6, (c) => cr * (0.32 - c * 0.08), () => stem, {
      rand: t.next()
    });
    const top = v3(x, h, z).add(lean);
    const first = m.count;
    const capH = cr * t.range(0.55, 0.8);
    for (let ring = 0; ring <= 5; ring++) {
      const f = ring / 5;
      const phi = f * Math.PI * 0.5;
      for (let k = 0; k <= 12; k++) {
        const th = (k / 12) * TAU;
        const rr = Math.cos(phi) * cr * (1 + 0.08 * (1 - f));
        const p = v3(top.x + Math.cos(th) * rr, top.y + Math.sin(phi) * capH - 0.01, top.z + Math.sin(th) * rr);
        const n = v3(Math.cos(th) * Math.cos(phi), Math.sin(phi) * 1.3, Math.sin(th) * Math.cos(phi)).normalize();
        const isSpot = red && ring > 0 && ring < 5 && noise(th * 2.2 + e * 7, f * 5) > 0.45;
        m.vert(p, n, 0, 0, isSpot ? spot : cap.clone().multiplyScalar(0.85 + 0.25 * f), [0, 0, 0, 0], top);
      }
    }
    for (let ring = 0; ring < 5; ring++)
      for (let k = 0; k < 12; k++) {
        const a = first + ring * 13 + k;
        const b = a + 13;
        m.tri(a, b, a + 1);
        m.tri(a + 1, b, b + 1);
      }
    const under = m.vert(top.clone().add(v3(0, -0.005, 0)), v3(0, -1, 0), 0, 0, gills, [0, 0, 0, 0], top);
    for (let k = 0; k < 12; k++) m.tri(under, first + k, first + k + 1);
  }
  return m;
}

type PlantSpec = {
  id: string;
  build: (key: string) => VegMesh;
  scale: number;
  variants: number;
  look: "cards-low" | "reed" | "solid";
  /** Generator sway constant (before scaling). */
  sway: number;
  /** Per-instance leaf tint (cards only). */
  palette?: readonly string[];
  scaleRange: readonly [number, number];
  lift?: number;
};

const PLANTS: Record<"bush" | "fern" | "reeds" | "lily" | "mushrooms", PlantSpec> = {
  bush: {
    id: "bush",
    build: buildBush,
    scale: 0.6,
    variants: 6,
    look: "cards-low",
    sway: 0.03,
    palette: ["#7fbd4f", "#8cc454", "#6fae52", "#99c65a"],
    scaleRange: [0.85, 1.2],
    lift: -0.06
  },
  fern: {
    id: "fern",
    build: buildFern,
    scale: 0.7,
    variants: 6,
    look: "cards-low",
    sway: 0.03,
    palette: ["#96d25e", "#86c85a", "#a4d866"],
    scaleRange: [0.85, 1.2],
    lift: -0.02
  },
  reeds: { id: "reeds", build: buildReeds, scale: 0.75, variants: 6, look: "reed", sway: 0.09, scaleRange: [0.85, 1.15] },
  lily: { id: "lily", build: buildLily, scale: 0.7, variants: 6, look: "solid", sway: 0.0035, scaleRange: [0.85, 1.15], lift: 0.01 },
  mushrooms: { id: "mush", build: buildMushrooms, scale: 1, variants: 8, look: "solid", sway: 0.0035, scaleRange: [0.85, 1.3] }
};

const plantGeoCache = new Map<string, THREE.BufferGeometry>();
const plantKitCache = new Map<string, { k: SwayKit; depth: THREE.Material; shared?: THREE.Material }>();

function plantKit(spec: PlantSpec): { k: SwayKit; depth: THREE.Material; shared?: THREE.Material } {
  let kit = plantKitCache.get(spec.id);
  if (!kit) {
    const k = swayKit(spec.sway / spec.scale, spec.scale);
    if (spec.look === "cards-low") kit = { k, depth: cardDepth(k) };
    else if (spec.look === "reed") kit = { k, depth: swayDepth(k, true), shared: reedMaterial(k) };
    else kit = { k, depth: swayDepth(k), shared: solidMaterial(k, new THREE.Color(1, 1, 1)) };
    plantKitCache.set(spec.id, kit);
  }
  return kit;
}

function plantInstance(spec: PlantSpec, seed: number): ResourceInstance {
  const s = normSeed(seed);
  const key = `${spec.id}-${s % spec.variants}`;
  let geo = plantGeoCache.get(key);
  if (!geo) {
    geo = spec.build(key).build(spec.scale);
    plantGeoCache.set(key, geo);
  }
  const kit = plantKit(spec);
  const r = rand(`${spec.id}-instance-${s}`);
  const yaw = r.range(0, TAU);
  const scale = r.range(spec.scaleRange[0], spec.scaleRange[1]);
  if (kit.shared) return assemble([{ geo, mat: kit.shared, depth: kit.depth }], yaw, scale, spec.lift ?? 0);
  const tint = jitterTint(r.pick(spec.palette ?? ["#ffffff"]), r);
  return assemble([{ geo, mat: cardMaterial(kit.k, true, tint), depth: kit.depth, ownMat: true }], yaw, scale, spec.lift ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Wildflowers (stems and petal heads shaped in the shader, bent by the wind)
// ---------------------------------------------------------------------------------------------

const FLOWER_SCALE = 0.48;
const FLOWER_PETAL = ["#f8f5ec", "#fff27a", "#ee3b24", "#a47fe0", "#4d7cf0", "#f58cc0"];
const FLOWER_CENTER = ["#f5b81c", "#f0c020", "#2b1a14", "#6a4bb0", "#2b3a8a", "#f7c531"];
const FLOWER_STEM_H = [0.58, 0.58, 0.72, 0.62, 0.58, 0.7];
const FLOWER_HEAD = [0.105, 0.08, 0.12, 0.09, 0.085, 0.105];

const FLOWER_UNIFORMS: Record<string, Uni> = {
  uFPetal: { value: FLOWER_PETAL.map(col) },
  uFCenter: { value: FLOWER_CENTER.map(col) },
  uFStem: { value: col("#4f8a33") },
  uFStemW: { value: 0.012 * FLOWER_SCALE }
};

const FLOWER_PARS = /* glsl */ `
uniform vec3 uFPetal[6];
uniform vec3 uFCenter[6];
uniform vec3 uFStem;
uniform float uFStemW;
varying vec2 vFUv;
varying float vFPart;
varying float vFSpecies;
varying float vFRand;
varying vec3 vFStemCol;
varying vec3 vFPetalC;
varying vec3 vFCenterC;
`;

const FLOWER_VERT_PARS = /* glsl */ `
attribute vec3 aTpl;   // template x, template y, part (0 stem, 1 head)
attribute vec3 aRoot;  // flower root, object space
attribute vec4 aFl;    // stem height, head size, species, petal phase
attribute vec4 aFl2;   // sway phase, sway speed, head tilt, stem shade
${FLOWER_PARS}
`;

const FLOWER_VERT = /* glsl */ `
vec3 vegPosO = position;
{
  mat3 vegM = mat3(modelMatrix);
  float tsc = sqrt(max(dot(vegM[0], vegM[0]), 1e-6));
  vec3 root = (modelMatrix * vec4(aRoot, 1.0)).xyz;
  int sp = int(aFl.z + 0.5);
  float stemH = aFl.x * tsc;
  float headS = aFl.y * tsc;
  vFUv = aTpl.xy; vFPart = aTpl.z; vFSpecies = aFl.z; vFRand = aFl.w;
  float gust = vegGust(root.xz);
  vec2 wd = vegWindDir();
  float ph = aFl2.x * 6.2831853;
  float fl = sin(uTime * (2.2 + aFl2.y * 1.5) + ph) * (0.04 + 0.06 * uWindStrength);
  vec2 bend = wd * (0.04 + uWindStrength * (0.12 + gust * 0.3)) * stemH + vec2(cos(ph), sin(ph)) * (0.06 * stemH + fl * stemH);
  float bl = min(length(bend), stemH * 0.9);
  bend = normalize(bend + vec2(1e-5, 0.0)) * bl;
  float tipY = sqrt(max(stemH * stemH - bl * bl, stemH * stemH * 0.05));
  vec3 p1 = vec3(bend.x * 0.15, tipY * 0.7, bend.y * 0.15);
  vec3 p2 = vec3(bend.x, tipY, bend.y);
  vec3 toCam = normalize(cameraPosition - root);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-4, 0.0, 0.0));
  vec3 vegPos;
  vec3 vegN;
  if (aTpl.z < 0.5) {
    float t = aTpl.y;
    float it = 1.0 - t;
    vec3 P = 2.0 * it * t * p1 + t * t * p2;
    vegPos = root + P + side * aTpl.x * uFStemW * tsc;
    vegN = normalize(toCam + vec3(0.0, 0.6, 0.0));
  } else {
    vec3 head = root + p2;
    vec3 hx; vec3 hy; vec3 hn;
    if (sp == 3) {
      // spike flower: an upright card that faces the camera
      hy = normalize(vec3(bend.x * 0.6, 1.0, bend.y * 0.6));
      hx = side;
      hn = normalize(toCam + vec3(0.0, 0.4, 0.0));
      head += hy * headS * 1.6;
      vegPos = head + hx * aTpl.x * headS * 0.55 + hy * aTpl.y * headS * 2.2;
    } else {
      float ta = aFl2.z * 6.2831853;
      vec2 tilt = vec2(cos(ta), sin(ta)) * 0.55 + bend / max(stemH, 0.05) * 0.8;
      // lean heads a little toward the viewer so they read from eye level
      tilt += toCam.xz * 0.35;
      hn = normalize(vec3(tilt.x, 1.0, tilt.y));
      hx = normalize(cross(hn, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.0, 1e-4));
      hy = cross(hx, hn);
      vegPos = head + (hx * aTpl.x + hy * aTpl.y) * headS;
    }
    vegN = normalize(hn + vec3(0.0, 0.5, 0.0));
  }
  vFStemCol = uFStem * mix(0.8, 1.1, aFl2.w);
  vFPetalC = uFPetal[sp];
  vFCenterC = uFCenter[sp];
  vVegTrans = aTpl.z > 0.5 ? 1.0 : 0.3;
  vVegGloss = sp == 1 ? 0.8 : 0.1;
  vVegAO = aTpl.z > 0.5 ? 1.0 : mix(0.5, 1.0, aTpl.y);
  vegPosO = (inverse(modelMatrix) * vec4(vegPos, 1.0)).xyz;
  objectNormal = normalize(transpose(vegM) * vegN);
}
`;

const FLOWER_FRAG_PARS = /* glsl */ `
${FLOWER_PARS}
// Petal and spike shapes. Returns 0 where the fragment is outside the flower.
float flowerShade(out vec3 c) {
  int sp = int(vFSpecies + 0.5);
  c = vFStemCol * mix(0.6, 1.0, vFUv.y);
  if (vFPart > 0.5) {
    vec2 uv = vFUv;
    float r = length(uv);
    if (sp == 3) {
      float yy = uv.y * 0.5 + 0.5;
      float row = yy * 10.0;
      float ri = floor(row);
      float fr = fract(row) - 0.5;
      float sd = mod(ri, 2.0) < 1.0 ? -1.0 : 1.0;
      float w = 0.75 * (1.0 - yy * 0.6);
      vec2 d1 = vec2((uv.x - sd * w * 0.32) / (w * 0.62), fr * 2.3);
      vec2 d2 = vec2((uv.x + sd * w * 0.3) / (w * 0.5), (fr + 0.3) * 2.8);
      float bud = min(dot(d1, d1), dot(d2, d2));
      float stemL = step(abs(uv.x), 0.06) * step(yy, 0.9);
      if ((bud > 1.0 && stemL < 0.5) || yy > 0.97) return 0.0;
      c = bud > 1.0 ? vFStemCol : vFPetalC * mix(0.6, 1.12, yy) * (0.78 + 0.35 * (1.0 - bud));
    } else {
      float N = sp == 0 ? 13.0 : sp == 1 ? 5.0 : sp == 2 ? 4.0 : sp == 4 ? 9.0 : 8.0;
      float a = atan(uv.y, uv.x);
      float pa = abs(fract(a * N / 6.2831853 + vFRand) - 0.5) * 2.0;
      float edge;
      if (sp == 0) edge = mix(1.0, 0.3, pow(pa, 0.6));
      else if (sp == 1) edge = mix(0.95, 0.55, pa * pa);
      else if (sp == 2) edge = mix(1.0, 0.72, pa * pa);
      else if (sp == 4) edge = mix(1.0, 0.45, pow(pa, 0.8)) - 0.12 * step(0.8, fract(a * N * 1.5));
      else edge = mix(1.0, 0.4, pow(pa, 0.9));
      if (r > edge) return 0.0;
      float cr = sp == 0 ? 0.3 : sp == 2 ? 0.28 : sp == 1 ? 0.3 : 0.24;
      vec3 petal = vFPetalC;
      petal *= mix(0.72, 1.08, smoothstep(0.1, 0.9, r / max(edge, 0.01)));
      petal *= 0.9 + 0.1 * (1.0 - pa);
      c = r < cr ? vFCenterC * (0.8 + 0.4 * (1.0 - r / cr)) : petal;
    }
  }
  return 1.0;
}
`;

let flowerMat: THREE.Material | null = null;

/**
 * Flowers receive shadows but do not cast them (as in the generator): stems and heads turn
 * toward the camera, so a shadow pass would turn them toward the light and self-shadow.
 */
function flowerMaterial(): THREE.Material {
  if (flowerMat) return flowerMat;
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  patchVeg(mat, {
    key: "flowers",
    uniforms: FLOWER_UNIFORMS,
    vertexPars: FLOWER_VERT_PARS,
    fragmentPars: FLOWER_FRAG_PARS,
    vertexNormal: FLOWER_VERT,
    vertexPosition: "transformed = vegPosO;",
    defines: { VEG_WRAP: "0.7", VEG_TRANS: "1.2" },
    fragmentColor: "{ vec3 fc; if (flowerShade(fc) < 0.5) discard; diffuseColor.rgb = fc; }",
    fragmentPost: VEG_AO_POST,
    noFaceFlip: true,
    transColor: "#fff4d0"
  });
  flowerMat = mat;
  return mat;
}

/**
 * Placeholder normals. The vertex shader writes the real normal, but three r184 switches a
 * Lambert material to flat (derivative) shading when the geometry has no normal attribute.
 */
function upNormals(count: number): THREE.BufferAttribute {
  const n = new Float32Array(count * 3);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  return new THREE.BufferAttribute(n, 3);
}

/** Template: a 3-segment stem strip (part 0) and one head quad (part 1). */
const FLOWER_TPL: Array<[number, number, number]> = [];
for (let e = 0; e <= 3; e++) FLOWER_TPL.push([-1, e / 3, 0], [1, e / 3, 0]);
FLOWER_TPL.push([-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]);
const FLOWER_IDX: number[] = [];
for (let e = 0; e < 3; e++) {
  const t = e * 2;
  FLOWER_IDX.push(t, t + 1, t + 2, t + 2, t + 1, t + 3);
}
FLOWER_IDX.push(8, 9, 10, 8, 10, 11);

function buildFlowerPatch(sp: number, seed: number): THREE.BufferGeometry {
  const r = rand(`flowers-${sp}-${seed}`);
  const count = sp === 3 ? r.pick([7, 8, 9, 10, 11]) : r.pick([5, 6, 7, 8, 9]);
  const radius = r.range(0.14, 0.26);
  const pos: number[] = [];
  const tpl: number[] = [];
  const rootA: number[] = [];
  const fl: number[] = [];
  const fl2: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < count; i++) {
    const ang = r.range(0, TAU);
    const d = i === 0 ? 0 : Math.sqrt(r.next()) * radius;
    const rx = Math.cos(ang) * d;
    const rz = Math.sin(ang) * d;
    const r1x = r.next();
    const r1z = r.next();
    const r2x = r.next();
    const r2y = r.next();
    const r2z = r.next();
    const r2w = r.next();
    const stemH = (FLOWER_STEM_H[sp] as number) * lerp(0.75, 1.25, r2x) * FLOWER_SCALE;
    const headS = (FLOWER_HEAD[sp] as number) * lerp(0.8, 1.2, r2y) * FLOWER_SCALE;
    const base = pos.length / 3;
    for (const [tx, ty, part] of FLOWER_TPL) {
      // Rest pose (bounds and picking); the shader computes the live pose.
      if (part < 0.5) pos.push(rx + tx * 0.01, ty * stemH, rz);
      else if (sp === 3) pos.push(rx + tx * headS * 0.55, stemH + headS * (1.6 + ty * 2.2), rz);
      else pos.push(rx + tx * headS, stemH, rz + ty * headS);
      tpl.push(tx, ty, part);
      rootA.push(rx, 0, rz);
      fl.push(stemH, headS, sp, r2w);
      fl2.push(r1x, r2x, r2z, r1z);
    }
    for (const k of FLOWER_IDX) idx.push(base + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", upNormals(pos.length / 3));
  g.setAttribute("aTpl", new THREE.Float32BufferAttribute(tpl, 3));
  g.setAttribute("aRoot", new THREE.Float32BufferAttribute(rootA, 3));
  g.setAttribute("aFl", new THREE.Float32BufferAttribute(fl, 4));
  g.setAttribute("aFl2", new THREE.Float32BufferAttribute(fl2, 4));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function flowerInstance(sp: number, seed: number): ResourceInstance {
  const geo = buildFlowerPatch(sp, normSeed(seed));
  return assemble([{ geo, mat: flowerMaterial(), ownGeo: true, castShadow: false }], 0, 1);
}

// ---------------------------------------------------------------------------------------------
// Grass tufts (bezier blades bent by the wind in the shader)
// ---------------------------------------------------------------------------------------------

const GRASS_SCALE = 0.7;
const GRASS_SEGS = 5;

const GRASS_UNIFORMS: Record<string, Uni> = {
  uGRoot: { value: col("#41692c") },
  uGMid: { value: col("#74a244") },
  uGTip: { value: col("#b9d66c") },
  uGDryRoot: { value: col("#ab7f2c") },
  uGDryTip: { value: col("#f4cf68") }
};

const GRASS_PARS = /* glsl */ `
uniform vec3 uGRoot;
uniform vec3 uGMid;
uniform vec3 uGTip;
uniform vec3 uGDryRoot;
uniform vec3 uGDryTip;
varying vec3 vGCol;
`;

const GRASS_VERT_PARS = /* glsl */ `
attribute vec2 aTpl;   // side (-1..1), t along the blade
attribute vec3 aRoot;  // blade root, object space
attribute vec4 aBlA;   // height, width, facing angle, sway phase
attribute vec4 aBlB;   // clump lean x, clump lean z, flutter speed, dryness
attribute vec3 aTint;
${GRASS_PARS}
`;

const GRASS_VERT = /* glsl */ `
vec3 vegPosO = position;
{
  mat3 vegM = mat3(modelMatrix);
  float tsc = sqrt(max(dot(vegM[0], vegM[0]), 1e-6));
  vec3 root = (modelMatrix * vec4(aRoot, 1.0)).xyz;
  float h = aBlA.x * tsc;
  float w = aBlA.y * tsc;
  vec3 fd3 = vegM * vec3(cos(aBlA.z), 0.0, sin(aBlA.z));
  vec2 fdir = normalize(fd3.xz + vec2(1e-4, 0.0));
  vec2 toCam = cameraPosition.xz - root.xz;
  toCam /= max(length(toCam), 1e-3);
  if (dot(fdir, toCam) < 0.0) fdir = -fdir;
  fdir = normalize(mix(fdir, toCam, 0.25) + vec2(1e-4, 0.0));
  vec2 side2 = vec2(-fdir.y, fdir.x);
  vec2 lean = (vegM * vec3(aBlB.x, 0.0, aBlB.y)).xz;
  float gust = vegGust(root.xz);
  vec2 wd = vegWindDir();
  float ws = uWindStrength;
  float windAmt = (0.03 + ws * (0.14 + gust * 0.95)) * h;
  float ph = aBlA.w * 6.2831853 + dot(root.xz, vec2(0.61, 0.83));
  float flutter = (sin(uTime * (3.0 + aBlB.z * 2.5) + ph) * 0.6 + sin(uTime * 7.3 + ph * 1.7) * 0.4) * (0.025 + 0.06 * ws) * h;
  vec2 bend = lean + wd * windAmt + side2 * flutter * 0.7 + wd * flutter * 0.5;
  float bl = min(length(bend), h * 0.95);
  bend = normalize(bend + vec2(1e-5, 0.0)) * bl;
  float tipY = sqrt(max(h * h - bl * bl * 0.9, h * h * 0.03));
  float t = aTpl.y;
  vec3 p1 = vec3(bend.x * 0.18, tipY * 0.7, bend.y * 0.18);
  vec3 p2 = vec3(bend.x, tipY, bend.y);
  float it = 1.0 - t;
  vec3 P = 2.0 * it * t * p1 + t * t * p2;
  vec3 T = normalize(2.0 * it * p1 + 2.0 * t * (p2 - p1) + vec3(0.0, 1e-4, 0.0));
  vec3 sideV = vec3(side2.x, 0.0, side2.y);
  float wProf = w * (1.0 - pow(t, 1.35)) * (1.0 + 0.35 * sin(t * 3.14159));
  vec3 vegPos = root + P + sideV * (aTpl.x * wProf * 0.5);
  vec3 N = normalize(cross(sideV, T));
  if (dot(N, cameraPosition - vegPos) < 0.0) N = -N;
  N = normalize(N + sideV * aTpl.x * 0.4);
  vec3 vegN = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.5));
  vec3 c = mix(uGRoot, uGMid, smoothstep(0.0, 0.5, t));
  c = mix(c, uGTip, smoothstep(0.35, 1.0, t));
  vec3 dcol = mix(uGDryRoot, uGDryTip, smoothstep(0.0, 1.0, t));
  c = mix(c, dcol, aBlB.w) * aTint;
  c *= 1.0 + gust * (0.15 + ws * 0.45) * t;
  vGCol = c;
  vVegTrans = smoothstep(0.1, 1.0, t);
  vVegAO = mix(0.4, 1.0, smoothstep(0.0, 0.8, t));
  vegPosO = (inverse(modelMatrix) * vec4(vegPos, 1.0)).xyz;
  objectNormal = normalize(transpose(vegM) * vegN);
}
`;

let grassMat: THREE.Material | null = null;

/** Grass receives shadows but does not cast them (blades turn toward the camera, as flowers do). */
function grassMaterial(): THREE.Material {
  if (grassMat) return grassMat;
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  patchVeg(mat, {
    key: "grass",
    uniforms: GRASS_UNIFORMS,
    vertexPars: GRASS_VERT_PARS,
    fragmentPars: GRASS_PARS,
    vertexNormal: GRASS_VERT,
    vertexPosition: "transformed = vegPosO;",
    defines: { VEG_WRAP: "0.6", VEG_TRANS: "1.4" },
    fragmentColor: "diffuseColor.rgb = vGCol;",
    fragmentPost: VEG_AO_POST,
    noFaceFlip: true,
    transColor: "#f2f59a"
  });
  grassMat = mat;
  return mat;
}

type GrassOpts = { radius: number; blades: readonly [number, number]; clumps: readonly [number, number]; dry: readonly [number, number]; height: number };

const tintMix = (t: number[], k: readonly [number, number, number], f: number): void => {
  for (let i = 0; i < 3; i++) t[i] = (t[i] as number) * (1 + (k[i] - 1) * f);
};

function buildGrass(seed: number, o: GrassOpts, tag: string): THREE.BufferGeometry {
  const r = rand(`grass-${tag}-${seed}`);
  const dry = r.range(o.dry[0], o.dry[1]);
  const nClumps = Math.floor(r.range(o.clumps[0], o.clumps[1] + 1));
  const clumps: Array<{ x: number; z: number; hx: number; hy: number }> = [];
  for (let i = 0; i < nClumps; i++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next()) * o.radius * 0.7;
    clumps.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, hx: r.next(), hy: r.next() });
  }
  // One value per tuft: in the field version these come from large-scale noise.
  const patchN = r.next();
  const big = r.next();
  const count = Math.floor(r.range(o.blades[0], o.blades[1] + 1));
  const pos: number[] = [];
  const tpl: number[] = [];
  const rootA: number[] = [];
  const blA: number[] = [];
  const blB: number[] = [];
  const tintA: number[] = [];
  const idx: number[] = [];
  const clumpR = Math.max(o.radius * 0.6, 0.05);
  for (let b = 0; b < count; b++) {
    const a = r.range(0, TAU);
    const d = Math.sqrt(r.next()) * o.radius;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    let best = clumps[0] as { x: number; z: number; hx: number; hy: number };
    let bd = Infinity;
    for (const c of clumps) {
      const dd = Math.hypot(x - c.x, z - c.z);
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    const clumpD = clamp(bd / clumpR, 0, 1);
    const ph = r.next();
    const bright = r.next();
    const r2x = r.next();
    const r2y = r.next();
    const r2z = r.next();
    const r2w = r.next();
    const h = lerp(0.3, 0.62, r2x) * lerp(0.72, 1.3, best.hx) * lerp(1.15, 0.78, clumpD) * (0.72 + 0.56 * big) * (1 + dry * 0.4) * GRASS_SCALE * o.height;
    const w = 0.055 * lerp(0.75, 1.3, r2y) * (1 + dry * 0.1) * GRASS_SCALE;
    // facing: own direction pulled toward the clump direction
    const fa = r2z * TAU;
    const ca = best.hy * TAU;
    const facing = Math.atan2(lerp(Math.sin(fa), Math.sin(ca), 0.4), lerp(Math.cos(fa), Math.cos(ca), 0.4));
    // lean away from the clump centre
    const ax = x - best.x;
    const az = z - best.z;
    const al = Math.hypot(ax, az);
    const lk = (0.1 + 0.32 * r2w) * h;
    const lx = al > 1e-4 ? (ax / al) * lk : Math.cos(facing) * lk;
    const lz = al > 1e-4 ? (az / al) * lk : Math.sin(facing) * lk;
    // colour drift: sunlit patches, clump hue, brightness
    const hv = (best.hx - 0.5) * 1.1 + (r2y - 0.5) * 0.5 + (big - 0.5) * 0.9;
    const tint = [1, 1, 1];
    tintMix(tint, [1.18, 1.12, 0.72], smoothstep(0.55, 0.85, patchN) * 0.7);
    tintMix(tint, [0.8, 0.92, 0.95], smoothstep(0.4, 0.15, patchN) * 0.5);
    tintMix(tint, [1.2, 1.08, 0.6], clamp(hv, 0, 1));
    tintMix(tint, [0.82, 0.98, 1.08], clamp(-hv, 0, 1));
    const k = 0.86 + 0.26 * bright;
    const sx = -Math.sin(facing);
    const sz = Math.cos(facing);
    const base = pos.length / 3;
    const verts: Array<[number, number]> = [];
    for (let s = 0; s < GRASS_SEGS; s++) {
      const ty = (s / GRASS_SEGS) ** 0.9;
      verts.push([-1, ty], [1, ty]);
    }
    verts.push([0, 1]);
    for (const [tx, ty] of verts) {
      const half = tx * w * 0.5 * (1 - ty);
      pos.push(x + sx * half + lx * ty * ty, ty * h, z + sz * half + lz * ty * ty);
      tpl.push(tx, ty);
      rootA.push(x, 0, z);
      blA.push(h, w, facing, ph);
      blB.push(lx, lz, r2x, dry);
      tintA.push((tint[0] as number) * k, (tint[1] as number) * k, (tint[2] as number) * k);
    }
    for (let s = 0; s < GRASS_SEGS - 1; s++) {
      const e = base + s * 2;
      idx.push(e, e + 1, e + 2, e + 2, e + 1, e + 3);
    }
    const last = base + (GRASS_SEGS - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", upNormals(pos.length / 3));
  g.setAttribute("aTpl", new THREE.Float32BufferAttribute(tpl, 2));
  g.setAttribute("aRoot", new THREE.Float32BufferAttribute(rootA, 3));
  g.setAttribute("aBlA", new THREE.Float32BufferAttribute(blA, 4));
  g.setAttribute("aBlB", new THREE.Float32BufferAttribute(blB, 4));
  g.setAttribute("aTint", new THREE.Float32BufferAttribute(tintA, 3));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function grassInstance(seed: number, o: GrassOpts, tag: string): ResourceInstance {
  const geo = buildGrass(normSeed(seed), o, tag);
  return assemble([{ geo, mat: grassMaterial(), ownGeo: true, castShadow: false }], 0, 1);
}

// ---------------------------------------------------------------------------------------------
// Rocks (clipped, noise-displaced icosahedra with world-space moss)
// ---------------------------------------------------------------------------------------------

const ROCK_SHAPES = [v3(1.1, 0.8, 1), v3(1, 1.05, 0.9), v3(1.4, 0.7, 1), v3(0.9, 1.2, 0.85), v3(1.2, 0.6, 1.2), v3(1, 0.9, 1)];
const PEBBLE_SHAPE = v3(1.2, 0.6, 1.2);
/** Rocks sink by this part of their height; the shader uses it to find the ground line. */
const ROCK_SINK = 0.15;

function buildRock(key: string, detail: number, aspect: V3): THREE.BufferGeometry {
  const r = rand(key);
  const n3 = simplex3(hashRng(key));
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const planes: Array<{ n: V3; d: number }> = [];
  const cuts = 8 + Math.floor(r.next() * 5);
  for (let i = 0; i < cuts; i++) planes.push({ n: v3(r.range(-1, 1), r.range(-0.3, 1), r.range(-1, 1)).normalize(), d: r.range(0.5, 0.8) });
  planes.push({ n: v3(0, -1, 0), d: 0.45 });
  const base = col("#a89e91");
  const warm = col("#b8a893");
  const cool = col("#948f93");
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    for (const pl of planes) {
      const t = p.dot(pl.n) - pl.d;
      if (t > 0) p.addScaledVector(pl.n, -t);
    }
    const t = n3(p.x * 1.6, p.y * 1.6, p.z * 1.6) * 0.05 + n3(p.x * 5, p.y * 5, p.z * 5) * 0.012;
    p.multiplyScalar(1 + t).multiply(aspect);
    pos.setXYZ(i, p.x, p.y, p.z);
    const tone = n3(p.x * 0.9 + 10, p.y * 0.9, p.z * 0.9);
    c.copy(base).lerp(tone > 0 ? warm : cool, Math.abs(tone) * 0.9);
    const band = Math.sin(p.y * 7 + n3(p.x, p.y * 0.3, p.z) * 2) * 0.5 + 0.5;
    c.multiplyScalar(0.9 + band * 0.12);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

const rockGeoCache = new Map<string, THREE.BufferGeometry>();
function rockGeometry(pebble: boolean, variant: number): THREE.BufferGeometry {
  const key = pebble ? `pebble-${variant % 3}` : `rock-${variant % ROCK_SHAPES.length}`;
  let g = rockGeoCache.get(key);
  if (!g) {
    g = pebble ? buildRock(key, 1, PEBBLE_SHAPE) : buildRock(key, 2, ROCK_SHAPES[variant % ROCK_SHAPES.length] as V3);
    rockGeoCache.set(key, g);
  }
  return g;
}

const ROCK_VERT_PARS = /* glsl */ `
varying vec3 vRockWorld;
varying vec3 vRockWN;
varying float vRockGround;
`;

const ROCK_VERT = /* glsl */ `
vRockWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vRockWN = normalize(mat3(modelMatrix) * objectNormal);
vRockGround = (modelMatrix * vec4(0.0, ${ROCK_SINK.toFixed(2)}, 0.0, 1.0)).y;
`;

const ROCK_FRAG_PARS = /* glsl */ `
${ROCK_VERT_PARS}
uniform vec3 uMossA;
uniform vec3 uMossB;
uniform float uRockMoss;
${NOISE_GLSL}
`;

const ROCK_FRAG = /* glsl */ `
{
  vec3 wn = normalize(vRockWN);
  float n1 = vegNoise2(vRockWorld.xz * 1.3 + vRockWorld.y * 0.7);
  float n2 = vegNoise2(vRockWorld.xz * 5.0 - vRockWorld.y * 2.0);
  float n3 = vegNoise2(vRockWorld.xz * 11.0 + vRockWorld.y * 6.0);
  // painterly vertical streaks and speckle
  float streak = vegNoise2(vec2(dot(vRockWorld.xz, vec2(0.7, 0.7)) * 3.0, vRockWorld.y * 0.6));
  diffuseColor.rgb *= 0.86 + 0.18 * n2 + 0.1 * (streak - 0.5);
  diffuseColor.rgb *= 0.95 + 0.1 * step(0.72, n3);
  // moss on the flattest top faces with a broken edge
  float mossField = wn.y + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.25 + (n3 - 0.5) * 0.12;
  float moss = smoothstep(0.98, 1.06, mossField) * uRockMoss;
  vec3 mossC = mix(uMossA, uMossB, smoothstep(0.3, 0.8, n2 * 0.6 + wn.y * 0.4));
  mossC *= 0.85 + 0.25 * n3;
  diffuseColor.rgb = mix(diffuseColor.rgb, mossC, moss);
  // darker where the rock meets the ground
  diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.35, vRockWorld.y - vRockGround));
}
`;

const ROCK_MOSS_A: Uni = { value: col("#4f7a2c") };
const ROCK_MOSS_B: Uni = { value: col("#8fb04a") };
const rockMatCache = new Map<number, THREE.MeshStandardMaterial>();

function rockMaterial(moss: number): THREE.MeshStandardMaterial {
  let m = rockMatCache.get(moss);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const mossU: Uni = { value: moss };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uMossA: ROCK_MOSS_A, uMossB: ROCK_MOSS_B, uRockMoss: mossU });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${ROCK_VERT_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${ROCK_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${ROCK_FRAG_PARS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${ROCK_FRAG}`)
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= vec3(1.0, 0.95, 1.07);");
  };
  m.customProgramCacheKey = () => "nature-rock";
  rockMatCache.set(moss, m);
  return m;
}

/** One rock mesh: unit shape scaled per axis, sunk into the ground, turned and tilted. */
function rockMesh(r: Rand, pebble: boolean, size: number, x: number, z: number): THREE.Mesh {
  const geo = rockGeometry(pebble, Math.floor(r.next() * (pebble ? 3 : ROCK_SHAPES.length)));
  const mesh = new THREE.Mesh(geo, rockMaterial(pebble ? 0.25 : 1));
  mesh.scale.set(size * r.range(0.85, 1.2), size * (pebble ? r.range(0.75, 1.15) : r.range(1.15, 1.6)), size * r.range(0.85, 1.2));
  mesh.rotation.set(r.range(-0.2, 0.2), r.range(0, TAU), 0, "YXZ");
  mesh.position.set(x, -ROCK_SINK * mesh.scale.y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function rockInstance(kind: "boulder" | "outcrop" | "pebbles", seed: number): ResourceInstance {
  const r = rand(`rock-${kind}-${normSeed(seed)}`);
  const root = new THREE.Group();
  if (kind === "boulder") root.add(rockMesh(r, false, r.range(0.45, 0.85), 0, 0));
  else if (kind === "outcrop") {
    const size = r.range(1.2, 1.9);
    root.add(rockMesh(r, false, size, 0, 0));
    const extra = 2 + Math.floor(r.next() * 4);
    for (let i = 0; i < extra; i++) {
      const a = r.range(0, TAU);
      const d = size * r.range(1, 1.8);
      const s = size * r.range(0.2, 0.45);
      root.add(rockMesh(r, s < 0.45, s, Math.cos(a) * d, Math.sin(a) * d));
    }
  } else {
    const n = 6 + Math.floor(r.next() * 7);
    for (let i = 0; i < n; i++) {
      const a = r.range(0, TAU);
      const d = Math.sqrt(r.next()) * 0.7;
      root.add(rockMesh(r, true, r.range(0.08, 0.3), Math.cos(a) * d, Math.sin(a) * d));
    }
  }
  // Shared geometry and materials only: nothing to release per instance.
  return { object: root };
}

// ---------------------------------------------------------------------------------------------
// Library entries
// ---------------------------------------------------------------------------------------------

type EntryBase = Omit<ResourceEntry, "source" | "origin" | "license" | "kind"> & { kind?: ResourceEntry["kind"] };

function entry(e: EntryBase): ResourceEntry {
  return { kind: "plant", source: "local", origin: ORIGIN, license: LICENSE, ...e };
}

const FLOWERS: Array<{ slug: string; name: string; tags: string[]; text: string; height: string }> = [
  { slug: "daisy", name: "Daisies", tags: ["daisy", "white"], text: "A small patch of white daisies with yellow centres", height: "0.3 to 0.35" },
  { slug: "buttercup", name: "Buttercups", tags: ["buttercup", "yellow", "glossy"], text: "A small patch of glossy yellow buttercups", height: "0.3 to 0.35" },
  { slug: "poppy", name: "Poppies", tags: ["poppy", "red", "field"], text: "A small patch of red poppies with dark centres", height: "0.4" },
  { slug: "lavender", name: "Lavender", tags: ["lavender", "purple", "herb"], text: "A clump of purple lavender spikes", height: "0.5 to 0.55" },
  { slug: "cornflower", name: "Cornflowers", tags: ["cornflower", "blue", "field"], text: "A small patch of blue cornflowers with ragged petals", height: "0.3 to 0.35" },
  { slug: "pink-wildflower", name: "Pink wildflowers", tags: ["pink", "cosmos"], text: "A small patch of pink eight-petal wildflowers", height: "0.35 to 0.4" }
];

const GRASS_TUFT: GrassOpts = { radius: 0.22, blades: [40, 55], clumps: [1, 2], dry: [0, 0.08], height: 1 };
const GRASS_PATCH: GrassOpts = { radius: 0.8, blades: [230, 290], clumps: [4, 6], dry: [0, 0.12], height: 1 };
const GRASS_DRY: GrassOpts = { radius: 0.25, blades: [45, 60], clumps: [1, 2], dry: [0.8, 1], height: 1 };

export const VEGETATION_ENTRIES: ResourceEntry[] = [
  entry({
    id: "nature:tree:painted-oak",
    name: "Painted broadleaf tree",
    tags: ["tree", "broadleaf", "oak", "deciduous", "forest", "shade", "painted", "painterly", "leaf cards"],
    description: "A broadleaf tree with a brown trunk, a few branches and a round, layered leaf canopy that sways in the wind. About 5 to 6.5 m tall and 6 to 8 m across.",
    footprint: 3,
    create: (seed) => treeInstance(TREES.broadleaf, seed)
  }),
  entry({
    id: "nature:tree:pine-tiered",
    name: "Tiered conifer",
    tags: ["tree", "conifer", "pine", "fir", "evergreen", "forest", "mountain"],
    description: "A tall conifer with six to eight stacked, dark green needle tiers on a straight trunk. About 4.5 to 6.5 m tall.",
    footprint: 1.8,
    create: (seed) => treeInstance(TREES.conifer, seed)
  }),
  entry({
    id: "nature:tree:painted-birch",
    name: "Painted birch tree",
    tags: ["tree", "birch", "broadleaf", "deciduous", "white bark", "slender", "forest", "painted", "painterly", "leaf cards"],
    description: "A slender tree with white, dark-marked bark and light green leaf clusters up the trunk. About 5 to 7 m tall.",
    footprint: 1.7,
    create: (seed) => treeInstance(TREES.birch, seed)
  }),
  entry({
    id: "nature:tree:palm",
    name: "Palm tree",
    tags: ["tree", "palm", "tropical", "beach", "coast", "island"],
    description: "A palm with a curved, ringed trunk and a crown of drooping fronds. The trunk leans to one side. About 4.5 to 6.5 m tall.",
    footprint: 2.6,
    create: (seed) => treeInstance(TREES.palm, seed)
  }),
  entry({
    id: "nature:bush:leafy",
    name: "Leafy bush",
    tags: ["bush", "shrub", "hedge", "garden", "undergrowth", "forest"],
    description: "A round, leafy green bush made of three to five leaf clusters. About 0.9 to 1.2 m tall and 1.6 to 2.7 m across.",
    footprint: 1,
    create: (seed) => plantInstance(PLANTS.bush, seed)
  }),
  entry({
    id: "nature:plant:fern",
    name: "Fern",
    tags: ["plant", "fern", "undergrowth", "forest", "shade", "ground cover"],
    description: "A low fern with seven to ten arching fronds. About 0.15 to 0.25 m tall and 1.2 to 1.8 m across.",
    footprint: 0.7,
    create: (seed) => plantInstance(PLANTS.fern, seed)
  }),
  entry({
    id: "nature:plant:cattail-reeds",
    name: "Cattail reeds",
    tags: ["plant", "reeds", "cattail", "pond", "lake", "shore", "marsh", "water"],
    description: "A clump of long reed leaves with two to four brown cattail heads, for pond and lake shores. About 1.2 to 1.6 m tall.",
    footprint: 0.45,
    create: (seed) => plantInstance(PLANTS.reeds, seed)
  }),
  entry({
    id: "nature:plant:water-lily",
    name: "Water lily pads",
    tags: ["plant", "water lily", "lily pad", "pond", "lake", "water", "flower"],
    description: "Three to six flat lily pads, some with a white or pink flower, 1.2 to 2.5 m across. Place on a water surface.",
    footprint: 1,
    create: (seed) => plantInstance(PLANTS.lily, seed)
  }),
  entry({
    id: "nature:plant:mushrooms",
    name: "Mushroom cluster",
    tags: ["plant", "mushroom", "toadstool", "fungi", "forest", "shade"],
    description: "Two to five mushrooms: red toadstools with white spots or plain brown caps (chosen by the seed). About 0.2 to 0.25 m tall.",
    footprint: 0.3,
    nameFor: (seed) => (mushroomIsRed(`mush-${normSeed(seed) % PLANTS.mushrooms.variants}`) ? "Red toadstools" : "Brown mushrooms"),
    create: (seed) => plantInstance(PLANTS.mushrooms, seed)
  }),
  ...FLOWERS.map((f, sp) =>
    entry({
      id: `nature:flower:${f.slug}`,
      name: f.name,
      tags: ["flower", "wildflower", "meadow", "garden", "color", ...f.tags],
      description: `${f.text}. The stems bend in the wind. About ${f.height} m tall.`,
      footprint: 0.25,
      create: (seed) => flowerInstance(sp, seed)
    })
  ),
  entry({
    id: "nature:grass:tuft",
    name: "Grass tuft",
    tags: ["grass", "tuft", "meadow", "ground cover", "lawn"],
    description: "A small tuft of green grass blades that bend in the wind. About 0.3 to 0.6 m tall.",
    footprint: 0.3,
    create: (seed) => grassInstance(seed, GRASS_TUFT, "tuft")
  }),
  entry({
    id: "nature:grass:meadow-patch",
    name: "Meadow grass patch",
    tags: ["grass", "meadow", "field", "ground cover", "lawn"],
    description: "A round patch of clumped meadow grass, about 1.7 m across and 0.4 to 0.7 m tall, with sunlit colour drifts. The blades bend in the wind.",
    footprint: 0.85,
    create: (seed) => grassInstance(seed, GRASS_PATCH, "patch")
  }),
  entry({
    id: "nature:grass:dry-tuft",
    name: "Dry grass tuft",
    tags: ["grass", "tuft", "dry", "golden", "savanna", "autumn", "desert"],
    description: "A tuft of tall, straw-coloured dry grass. About 0.45 to 0.8 m tall.",
    footprint: 0.35,
    create: (seed) => grassInstance(seed, GRASS_DRY, "dry")
  }),
  entry({
    id: "nature:rock:boulder",
    name: "Mossy boulder",
    kind: "feature",
    tags: ["rock", "boulder", "stone", "moss", "nature"],
    description: "A faceted grey boulder with moss on its top faces, partly sunk into the ground. About 1 to 2.6 m across and 0.3 to 0.8 m above the ground.",
    footprint: 0.9,
    create: (seed) => rockInstance("boulder", seed)
  }),
  entry({
    id: "nature:rock:outcrop",
    name: "Rock outcrop",
    kind: "feature",
    tags: ["rock", "outcrop", "boulder", "stone", "moss", "cliff", "nature"],
    description: "A large mossy rock with two to five smaller rocks and stones around it. About 1.2 to 2.3 m tall and 3.5 to 6.5 m across.",
    footprint: 2.8,
    create: (seed) => rockInstance("outcrop", seed)
  }),
  entry({
    id: "nature:rock:pebbles",
    name: "Pebbles",
    kind: "feature",
    tags: ["rock", "pebbles", "stones", "gravel", "shore", "path"],
    description: "A scatter of six to twelve small flat stones, about 1.2 to 2 m across.",
    footprint: 0.8,
    create: (seed) => rockInstance("pebbles", seed)
  })
];

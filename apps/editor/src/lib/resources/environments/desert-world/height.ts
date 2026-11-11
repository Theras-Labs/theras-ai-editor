// The desert height function, built in code: the blurred dune field, the base
// height, the oasis basin, the flattened sites, the carved channels and the salt pan.
// World coordinates in meters. The result is the same as in the game (the game then samples it
// on a 7 m grid; this port samples it finer).
import * as THREE from "three";
import { fbm, lerp, noise1337 as X, noise7 as Y, simplex2D, smoothstep } from "./noise";
import { DESERT_SITES, DRY_WASH, HOLLOW, OBSERVATORY, QANAT_SITES, ROSE_HOUSE, SALT_PAN, type ChannelSpec } from "./sites";

type HeightFn = (x: number, z: number) => number;

// ---- biomes: golden dunes, rose canyons and salt flats

const biomeField = (x: number, z: number) => Math.sin(x * 0.0021) * Math.cos(z * 0.0017 - 0.7) + 0.5 * Math.sin((x + z) * 0.0011);

export type BiomeWeights = { rose: number; salt: number };

export function biomeAt(x: number, z: number): BiomeWeights {
  const f = biomeField(x, z);
  return { rose: smoothstep(0.3, 0.6, f), salt: smoothstep(-0.3, -0.6, f) };
}

// ---- the dune field: raw ridges sampled every 8 m, then a 31-tap Gaussian blur

const SPACING = 8;
const HALF = 2000;
const N = 501;

function duneSample(x: number, z: number): number {
  const warp = X(x * 0.0025, z * 0.0025) * 60;
  const ridge = 1 - Math.abs(Y((x + warp) * 0.004, (z * 0.45 + warp) * 0.004));
  const mask = smoothstep(-0.35, 0.35, X(x * 7e-4 + 40, z * 7e-4 - 12));
  let h = ridge ** 2.5 * 24 * mask;
  const rose = biomeAt(x, z).rose;
  if (rose > 0) h += (1 - Math.abs(X(x * 0.0045 - 9, z * 0.0045 + 4))) ** 3 * 28 * rose;
  return h;
}

/**
 * A window of the blurred 501 x 501 field. Inside the window (15 samples of blur margin and 2 of
 * bicubic margin) the values are the same as the full field. A query outside makes the full field.
 */
type DuneWindow = { c0: number; r0: number; w: number; h: number; data: Float32Array; full: boolean };
let dunes: DuneWindow | null = null;

function makeDuneWindow(c0: number, c1: number, r0: number, r1: number): DuneWindow {
  const clampI = (i: number) => Math.min(500, Math.max(0, i));
  const full = c0 <= 0 && r0 <= 0 && c1 >= 500 && r1 >= 500;
  // raw samples with a 15-sample margin (indices are clamped like the full field)
  const rc0 = c0 - 15;
  const rr0 = r0 - 15;
  const rw = c1 - c0 + 31;
  const rh = r1 - r0 + 31;
  const raw = new Float32Array(rw * rh);
  for (let r = 0; r < rh; r++) {
    const row = clampI(rr0 + r);
    for (let c = 0; c < rw; c++) raw[r * rw + c] = duneSample(-HALF + clampI(rc0 + c) * SPACING, -HALF + row * SPACING);
  }
  const wts = new Float32Array(31);
  let sum = 0;
  for (let k = -15; k <= 15; k++) sum += wts[k + 15] = Math.exp((-k * k) / 50);
  for (let k = 0; k < 31; k++) wts[k] /= sum;
  // horizontal pass on every raw row, for the window's columns
  const w = c1 - c0 + 1;
  const h = r1 - r0 + 1;
  const mid = new Float32Array(w * rh);
  for (let r = 0; r < rh; r++)
    for (let c = 0; c < w; c++) {
      const col = c0 + c;
      let s = 0;
      for (let k = -15; k <= 15; k++) s += wts[k + 15] * raw[r * rw + (clampI(col + k) - rc0)];
      mid[r * w + c] = s;
    }
  // vertical pass
  const data = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    const row = r0 + r;
    for (let c = 0; c < w; c++) {
      let s = 0;
      for (let k = -15; k <= 15; k++) s += wts[k + 15] * mid[(clampI(row + k) - rr0) * w + c];
      data[r * w + c] = s;
    }
  }
  return { c0, r0, w, h, data, full };
}

/** The window this port needs: world x -700..1200, z -700..1200 (the crop, its apron and the flattened sites' rings). */
function duneWindow(): DuneWindow {
  if (!dunes) {
    const i = (v: number) => Math.round((v + HALF) / SPACING);
    dunes = makeDuneWindow(i(-700), i(1200), i(-700), i(1200));
  }
  return dunes;
}

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

/** Bicubic sample of the blurred dune field. */
export function duneAt(x: number, z: number): number {
  let d = duneWindow();
  const fx = Math.min(Math.max((x + HALF) / SPACING, 1), 498);
  const fz = Math.min(Math.max((z + HALF) / SPACING, 1), 498);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  if (!d.full && (ix - 1 < d.c0 || ix + 2 >= d.c0 + d.w || iz - 1 < d.r0 || iz + 2 >= d.r0 + d.h)) d = dunes = makeDuneWindow(0, 500, 0, 500);
  const tx = fx - ix;
  const tz = fz - iz;
  const f = d.data;
  const w = d.w;
  const row = (r: number) => {
    const o = (r - d.r0) * w - d.c0;
    return catmull(f[o + ix - 1], f[o + ix], f[o + ix + 1], f[o + ix + 2], tx);
  };
  return catmull(row(iz - 1), row(iz), row(iz + 1), row(iz + 2), tz);
}

const CALM = [
  { x: OBSERVATORY.x, z: OBSERVATORY.z, r: 40, fade: 70 },
  ...Object.values(DESERT_SITES)
    .filter((s) => s.calm)
    .map((s) => ({ x: s.x, z: s.z, r: s.r * 0.75, fade: 70 }))
];

function calmAt(x: number, z: number): number {
  let k = 1;
  for (const c of CALM) k *= smoothstep(c.r, c.r + c.fade, Math.hypot(x - c.x, z - c.z));
  return k;
}

/** The base height of the desert-like worlds. */
export function baseHeight(x: number, z: number): number {
  let h = fbm(Y, x * 0.0011, z * 0.0011, 3) * 56;
  h += duneAt(x, z) * calmAt(x, z);
  h += X(x * 0.02, z * 0.02) * 0.5;
  const b = biomeAt(x, z);
  if (b.salt > 0) h = lerp(h, h * 0.15 + fbm(Y, x * 0.004, z * 0.004, 2) * 2, b.salt);
  h *= lerp(0.25, 1, smoothstep(25, 160, Math.hypot(x, z)));
  h += smoothstep(1300, 1950, Math.max(Math.abs(x), Math.abs(z))) * (55 + fbm(Y, x * 0.004, z * 0.004, 3) * 45);
  return h;
}

// ---- the desert's own shapes

export const OASIS = { x: -430, z: -180, rx: 72, rz: 49 };
const OASIS_SHAPE = { depth: 2.2, low: 1.3, bank: [0.44, 0.82], blend: [0.78, 1.25] };

function oasisBasin(x: number, z: number, base: HeightFn): number {
  const r = Math.hypot((x - OASIS.x) / OASIS.rx, (z - OASIS.z) / OASIS.rz);
  const s = OASIS_SHAPE;
  const a = THREE.MathUtils.smoothstep(r, s.blend[0], s.blend[1]);
  if (a >= 1) return base(x, z);
  const bowl = base(OASIS.x, OASIS.z) - s.depth * (1 - THREE.MathUtils.smoothstep(r, s.bank[0], s.bank[1]));
  return THREE.MathUtils.lerp(bowl, base(x, z), a);
}

/** Channel cross-section: full depth in the bed, then quadratic to 0 over the bank. */
function channelProfile(d: number, { bed, bank, depth }: { bed: number; bank: number; depth: number }): number {
  if (d <= bed) return depth;
  const o = d - bed;
  if (o >= bank) return 0;
  const k = (2 * depth) / bank;
  return depth - k * o + (k * o * o) / (2 * bank);
}

export type FlatDisc = { x: number; z: number; r: number; level: () => number; height(x: number, z: number, h: number): number };

/** A disc flattened to the mean of `inner` on a ring at r + 0.4 fade. */
function flatDisc({ x, z, r, fade }: { x: number; z: number; r: number; fade: number }, inner: HeightFn): FlatDisc {
  let cached: number | null = null;
  const level = () => {
    if (cached != null) return cached;
    let sum = 0;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = r + fade * 0.4;
      sum += inner(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
    }
    return (cached = sum / 24);
  };
  return {
    x,
    z,
    r,
    level,
    height(px, pz, h) {
      const d = Math.hypot(px - x, pz - z);
      if (d >= r + fade) return h;
      const k = smoothstep(r, r + fade, d);
      return level() + (h - level()) * k;
    }
  };
}

export type Channel = {
  points: [number, number][];
  length: number;
  curve: THREE.CatmullRomCurve3;
  opt: Required<ChannelSpec>;
  nearest(x: number, z: number): { s: number; a: number; i: number };
  fadeAt(a: number): number;
  depthAt(x: number, z: number): number;
  height(x: number, z: number, h: number): number;
};

/** A carved channel along a centripetal Catmull-Rom through the points, resampled every `step` m. */
function channel(points: [number, number][], spec: ChannelSpec): Channel {
  const opt = { fade: 60, step: 4, ...spec } as Required<ChannelSpec>;
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal"
  );
  const n = Math.max(2, Math.ceil(curve.getLength() / opt.step));
  const pts = curve.getSpacedPoints(n).map((p) => [p.x, p.z] as [number, number]);
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = along[along.length - 1];
  const reach = opt.bed + opt.bank;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  x0 -= reach;
  x1 += reach;
  z0 -= reach;
  z1 += reach;
  const cols = Math.ceil((x1 - x0) / 40);
  const cells = new Map<number, number[]>();
  const cell = (cx: number, cz: number) => {
    const key = cz * cols + cx;
    let list = cells.get(key);
    if (!list) {
      const mx = x0 + (cx + 0.5) * 40;
      const mz = z0 + (cz + 0.5) * 40;
      const lim = reach + 40;
      list = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((mx - ax) * dx + (mz - az) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(ax + dx * t - mx, az + dz * t - mz) < lim) list.push(i);
      }
      cells.set(key, list);
    }
    return list;
  };
  function nearest(x: number, z: number) {
    let best = Infinity;
    let a = 0;
    let seg = 0;
    const list = x >= x0 && x <= x1 && z >= z0 && z <= z1 ? cell(Math.floor((x - x0) / 40), Math.floor((z - z0) / 40)) : pts.slice(1).map((_, i) => i);
    for (const i of list) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const ex = ax + dx * t - x;
      const ez = az + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2;
        a = along[i] + t * (along[i + 1] - along[i]);
        seg = i;
      }
    }
    return { s: Math.sqrt(best), a, i: seg };
  }
  const fadeAt = (a: number) => smoothstep(0, opt.fade, a) * smoothstep(0, opt.fade, length - a);
  return {
    points: pts,
    length,
    curve,
    opt,
    nearest,
    fadeAt,
    depthAt(x, z) {
      if (x < x0 || x > x1 || z < z0 || z > z1) return 0;
      const { s, a } = nearest(x, z);
      return s >= reach ? 0 : channelProfile(s, opt) * fadeAt(a);
    },
    height(x, z, h) {
      return h - this.depthAt(x, z);
    }
  };
}

const lagoonNoise = simplex2D(4242);
const LAGOONS = DESERT_SITES.lagoons;
const POOL_DEPTH = 1.7;
let lagoonBase: number | null = null;
const lagoonCentre = () => (lagoonBase ??= oasisBasin(LAGOONS.x, LAGOONS.z, baseHeight));

function lagoonPools(x: number, z: number): number {
  const r = Math.hypot(x - LAGOONS.x, z - LAGOONS.z) / LAGOONS.r;
  return fbm(lagoonNoise, x * 0.0095, z * 0.0095, 2) + 0.45 * (1 - r) - 0.12;
}

function lagoons(x: number, z: number, h: number): number {
  const r = Math.hypot(x - LAGOONS.x, z - LAGOONS.z) / LAGOONS.r;
  if (r > 1.25) return h;
  const floor = lagoonCentre() + 0.15;
  const pool = r < 1 ? POOL_DEPTH * smoothstep(0, 0.5, lagoonPools(x, z)) * (1 - smoothstep(0.8, 1, r)) : 0;
  return THREE.MathUtils.lerp(floor - pool, h, smoothstep(0.85, 1.25, r));
}

type FlattenSite = { x: number; z: number; r: number; fade: number; level?: number; same?: FlattenSite };
const CITY_FLAT: FlattenSite = { ...QANAT_SITES.city, r: 100, fade: 170 };
const FLATTEN: FlattenSite[] = [
  { ...DESERT_SITES.canyon, r: 125, fade: 120 },
  { ...DESERT_SITES.umbrellas, r: 55, fade: 120 },
  CITY_FLAT,
  { ...QANAT_SITES.camps, r: 44, fade: 70, same: CITY_FLAT }
];
const ringLevel = (s: FlattenSite) => {
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const rr = s.r + s.fade * 0.6;
    sum += oasisBasin(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr, baseHeight);
  }
  return sum / 16;
};
function flatten(x: number, z: number, h: number): number {
  for (const s of FLATTEN) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r + s.fade) h = THREE.MathUtils.lerp((s.level ??= s.same ? (s.same.level ??= ringLevel(s.same)) : ringLevel(s)), h, smoothstep(s.r, s.r + s.fade, d));
  }
  return h;
}

type Bump = { x: number; z: number; k: number; reach: number; h: number };
const SITE_BUMPS: Bump[] = (
  [
    ["carcass", -20, -26, 26, 5.5],
    ["carcass", 35, -24, 24, 5],
    ["carcass", -92, -14, 22, 4.5],
    ["carcass", 0, 30, 26, 3.5],
    ["carcass", 112, -8, 24, 5],
    ["wreck", 40, 2, 26, 6.5],
    ["wreck", 4, -16, 24, 4.5],
    ["wreck", -70, 12, 22, 3.5]
  ] as const
).map(([site, lx, lz, r, h]) => {
  const s = DESERT_SITES[site];
  const c = Math.cos(s.yaw!);
  const sn = Math.sin(s.yaw!);
  return { x: s.x + c * lx + sn * lz, z: s.z - sn * lx + c * lz, k: 1 / (2 * r * r), reach: 3 * r, h };
});
/** The hoverbike dip near the start. */
const DIPS: Bump[] = [{ x: QANAT_SITES.bike.x, z: QANAT_SITES.bike.z, k: 1 / 338, reach: 39, h: -2.4 }];

function bumps(x: number, z: number, h: number): number {
  for (const b of DIPS) {
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) < b.reach && Math.abs(dz) < b.reach) h += b.h * Math.exp(-(dx * dx + dz * dz) * b.k);
  }
  for (const b of SITE_BUMPS) {
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) < b.reach && Math.abs(dz) < b.reach) h += b.h * Math.exp(-(dx * dx + dz * dz) * b.k);
  }
  return h;
}

export const dryWash = channel(DRY_WASH.points, DRY_WASH);
export const hollow = channel(HOLLOW.points, HOLLOW);
const shaped: HeightFn = (x, z) => lagoons(x, z, bumps(x, z, flatten(x, z, oasisBasin(x, z, baseHeight))));
export const saltPan = flatDisc(SALT_PAN, (x, z) => hollow.height(x, z, dryWash.height(x, z, shaped(x, z))));
const carved: HeightFn = (x, z) => saltPan.height(x, z, hollow.height(x, z, dryWash.height(x, z, shaped(x, z))));
let roseLevel: number | undefined;

/** The desert height. Within 200 m of the Rose House it blends to that house's constant level. */
export function desertHeight(x: number, z: number): number {
  const h = carved(x, z);
  const d = Math.hypot(x - ROSE_HOUSE.x, z - ROSE_HOUSE.z);
  if (d >= 200) return h;
  roseLevel ??= carved(ROSE_HOUSE.x, ROSE_HOUSE.z);
  const k = smoothstep(112, 200, d);
  return roseLevel * (1 - k) + h * k;
}

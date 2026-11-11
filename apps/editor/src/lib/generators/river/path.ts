// River course: a smooth, seeded centerline from one point to another that meanders, goes
// around obstacle circles and never crosses itself. Pure code (no three.js, no editor), unit
// tested in tests/river.test.ts.
//
// Method. The course is a graph over the straight line from -> to: each sample has a distance
// t along that line and a side offset l(t). A graph cannot cross itself, so the centerline
// never self-intersects. Meanders are two sine waves on l(t), limited so that the radius of
// a bend stays above RIVER_MIN_RADIUS_FACTOR x width. Obstacles push l(t) to one side (the
// side with the smaller detour; obstacles closer than a river width share one side, so the
// river never squeezes between them). The result is resampled with a centripetal Catmull-Rom
// spline at 0.5 m.

export type P2 = { x: number; z: number };
export type RiverObstacle = { x: number; z: number; r: number; soft?: boolean };

/** One point of the final centerline. n = left normal (-tz, tx); k > 0 = the river turns toward +n. */
export type RiverSample = {
  x: number;
  z: number;
  /** Distance from the source along the centerline, meters. */
  s: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  /** Signed curvature, 1/m. */
  k: number;
  /** Half width of the water, meters. */
  hw: number;
  /** Water depth at the center, meters (for the shader's deep/shallow color). */
  depth: number;
};

export type RiverPool = { s: number; x: number; z: number; radius: number };

export type RiverPath = {
  samples: RiverSample[];
  length: number;
  width: number;
  pool?: RiverPool;
  /** Meander strength that was used (it is reduced when a full meander does not fit). */
  meander: number;
};

export type RiverPathInput = {
  from: P2;
  to: P2;
  /** Mean width of the water in meters (1.5 to 8). */
  width: number;
  /** 0 = straight, 1 = strong bends. */
  meander: number;
  seed: number;
  obstacles?: RiverObstacle[];
  /** Widen one bend into a small pool when the river is long enough (default true). */
  pool?: boolean;
  /** Free space between the water and an obstacle footprint, meters (default 1.2). */
  clearance?: number;
};

export const RIVER_MIN_WIDTH = 1.5;
export const RIVER_MAX_WIDTH = 8;
/** Smallest bend radius, as a multiple of the width. */
export const RIVER_MIN_RADIUS_FACTOR = 1.6;
/** Width variation along the river (plus or minus), outside the pool. */
export const RIVER_WIDTH_VARIATION = 0.12;
/** Pool width as a multiple of the local width. */
export const RIVER_POOL_FACTOR = 1.8;
/** A river shorter than this gets no pool. */
export const RIVER_POOL_MIN_LENGTH = 26;
export const RIVER_SAMPLE_STEP = 0.5;

/** Small seeded generator (mulberry32), the same as the layout solver's. */
export function riverRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth01 = (e0: number, e1: number, v: number) => {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Inflated radius: the centerline must stay this far from the obstacle center. */
export function obstacleReach(o: RiverObstacle, halfWidth: number, clearance: number) {
  return o.soft ? o.r + halfWidth * 1.15 + 0.3 : o.r + halfWidth * (1 + RIVER_WIDTH_VARIATION + 0.05) + clearance;
}

type Frame = { ox: number; oz: number; dx: number; dz: number; nx: number; nz: number; length: number };

function frameOf(from: P2, to: P2): Frame {
  const length = Math.max(1e-6, Math.hypot(to.x - from.x, to.z - from.z));
  const dx = (to.x - from.x) / length;
  const dz = (to.z - from.z) / length;
  return { ox: from.x, oz: from.z, dx, dz, nx: -dz, nz: dx, length };
}

const toFrame = (f: Frame, p: P2) => ({ t: (p.x - f.ox) * f.dx + (p.z - f.oz) * f.dz, l: (p.x - f.ox) * f.nx + (p.z - f.oz) * f.nz });
const fromFrame = (f: Frame, t: number, l: number): P2 => ({ x: f.ox + f.dx * t + f.nx * l, z: f.oz + f.dz * t + f.nz * l });

type FrameObstacle = { t: number; l: number; reach: number; side: number; group: number };

/**
 * Obstacles in the line frame, grouped (gap smaller than a river width plus clearance = one
 * group) and given a side: +1 = the river passes on the +l side.
 */
function frameObstacles(f: Frame, obstacles: RiverObstacle[], halfWidth: number, clearance: number, rng: () => number): FrameObstacle[] {
  const list = obstacles.map((o) => ({ ...toFrame(f, o), reach: obstacleReach(o, halfWidth, clearance), side: 0, group: -1 }));
  // Union-find on "too close to pass between".
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      // Two reaches that overlap leave no corridor for the river between the obstacles.
      if (Math.hypot(a.t - b.t, a.l - b.l) < a.reach + b.reach + 0.2) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  list.forEach((_, i) => {
    const g = find(i);
    groups.set(g, [...(groups.get(g) ?? []), i]);
  });
  for (const [g, members] of groups) {
    let needPlus = 0;
    let needMinus = 0;
    for (const i of members) {
      const o = list[i]!;
      needPlus = Math.max(needPlus, o.l + o.reach);
      needMinus = Math.max(needMinus, o.reach - o.l);
    }
    const side = Math.abs(needPlus - needMinus) < 0.25 ? (rng() < 0.5 ? 1 : -1) : needPlus < needMinus ? 1 : -1;
    for (const i of members) {
      list[i]!.side = side;
      list[i]!.group = g;
    }
  }
  return list;
}

/** Pushes l(t) out of every obstacle reach, to the obstacle's side. Returns true when it moved a point. */
function pushOut(ts: number[], ls: number[], obstacles: FrameObstacle[]) {
  let moved = false;
  for (let i = 0; i < ts.length; i++) {
    for (const o of obstacles) {
      const dt = ts[i]! - o.t;
      if (Math.abs(dt) >= o.reach) continue;
      const need = Math.sqrt(o.reach * o.reach - dt * dt);
      if (o.side > 0 && ls[i]! < o.l + need) {
        ls[i] = o.l + need;
        moved = true;
      } else if (o.side < 0 && ls[i]! > o.l - need) {
        ls[i] = o.l - need;
        moved = true;
      }
    }
  }
  return moved;
}

function smoothInterior(ls: number[], amount: number) {
  const copy = ls.slice();
  for (let i = 1; i < ls.length - 1; i++) ls[i] = copy[i]! + amount * ((copy[i - 1]! + copy[i + 1]!) / 2 - copy[i]!);
}

/** Bend radius of the graph l(t) at i (spacing h), as 1 / curvature. */
function graphCurvature(ls: number[], i: number, h: number) {
  const d1 = (ls[i + 1]! - ls[i - 1]!) / (2 * h);
  const d2 = (ls[i + 1]! - 2 * ls[i]! + ls[i - 1]!) / (h * h);
  return Math.abs(d2) / Math.pow(1 + d1 * d1, 1.5);
}

/** Centripetal Catmull-Rom through points, sampled every step meters (approximately). */
export function catmullRom(points: P2[], step: number): P2[] {
  if (points.length < 2) return points.slice();
  const out: P2[] = [points[0]!];
  const get = (i: number) => points[clamp(i, 0, points.length - 1)]!;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? { x: 2 * get(0).x - get(1).x, z: 2 * get(0).z - get(1).z } : get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = i + 2 >= points.length ? { x: 2 * p2.x - p1.x, z: 2 * p2.z - p1.z } : get(i + 2);
    const knot = (a: P2, b: P2) => Math.max(1e-4, Math.pow(Math.hypot(b.x - a.x, b.z - a.z), 0.5));
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const seg = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const n = Math.max(1, Math.ceil(seg / step));
    for (let j = 1; j <= n; j++) {
      const t = t1 + ((t2 - t1) * j) / n;
      const lerp = (a: P2, b: P2, ta: number, tb: number): P2 => {
        const w = (t - ta) / (tb - ta);
        return { x: a.x + (b.x - a.x) * w, z: a.z + (b.z - a.z) * w };
      };
      const a1 = lerp(p0, p1, t0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  return out;
}

/** Resamples a polyline at an even spacing. */
export function resampleEven(points: P2[], step: number): P2[] {
  if (points.length < 2) return points.slice();
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const total = cum[cum.length - 1]!;
  const n = Math.max(1, Math.round(total / step));
  const out: P2[] = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (total * i) / n;
    while (j < cum.length - 2 && cum[j + 1]! < s) j++;
    const seg = cum[j + 1]! - cum[j]!;
    const w = seg > 0 ? (s - cum[j]!) / seg : 0;
    out.push({ x: points[j]!.x + (points[j + 1]!.x - points[j]!.x) * w, z: points[j]!.z + (points[j + 1]!.z - points[j]!.z) * w });
  }
  return out;
}

/**
 * Samples (tangent, normal, curvature, distance) of a centerline. Width and depth come from
 * halfWidthAt(s) and depthAt(s, hw).
 */
export function samplesOf(points: P2[], halfWidthAt: (s: number) => number, depthAt: (s: number, hw: number) => number): RiverSample[] {
  const n = points.length;
  const s: number[] = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  const out: RiverSample[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / len;
    const tz = (b.z - a.z) / len;
    out.push({ x: points[i]!.x, z: points[i]!.z, s: s[i]!, tx, tz, nx: -tz, nz: tx, k: 0, hw: 0, depth: 0 });
  }
  for (let i = 0; i < n; i++) {
    const a = out[Math.max(0, i - 1)]!;
    const b = out[Math.min(n - 1, i + 1)]!;
    const ds = b.s - a.s;
    if (ds > 1e-6) {
      const angA = Math.atan2(a.tz, a.tx);
      const angB = Math.atan2(b.tz, b.tx);
      out[i]!.k = Math.atan2(Math.sin(angB - angA), Math.cos(angB - angA)) / ds;
    }
    const hw = halfWidthAt(out[i]!.s);
    out[i]!.hw = hw;
    out[i]!.depth = depthAt(out[i]!.s, hw);
  }
  return out;
}

/** Water depth at the center of a river of half width hw (meters); the pool is deeper. */
export function centerDepth(hw: number) {
  return 0.32 + hw * 0.12;
}

/** Smallest free space between the water edge and an obstacle footprint (Infinity when none). */
export function obstacleClearance(samples: RiverSample[], obstacles: RiverObstacle[]) {
  let min = Infinity;
  for (const o of obstacles) for (const p of samples) min = Math.min(min, Math.hypot(p.x - o.x, p.z - o.z) - o.r - p.hw);
  return min;
}

/**
 * True when two parts of the water that are far apart along the river come closer than the
 * sum of their half widths (the ribbon would overlap itself).
 */
export function ribbonOverlaps(samples: RiverSample[], margin = 0.3) {
  for (let i = 0; i < samples.length; i += 2) {
    const a = samples[i]!;
    for (let j = i + 2; j < samples.length; j += 2) {
      const b = samples[j]!;
      const along = b.s - a.s;
      const need = a.hw + b.hw + margin;
      if (along <= need * Math.PI) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < need) return true;
    }
  }
  return false;
}

/** True when two non-adjacent segments of the centerline cross. */
export function centerlineSelfIntersects(points: P2[]) {
  const cross = (a: P2, b: P2, c: P2) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const c = points[j]!;
      const d = points[j + 1]!;
      const d1 = cross(a, b, c);
      const d2 = cross(a, b, d);
      const d3 = cross(c, d, a);
      const d4 = cross(c, d, b);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}

function buildOnce(input: RiverPathInput, meander: number): RiverPath & { blocked: boolean } {
  const width = clamp(input.width, RIVER_MIN_WIDTH, RIVER_MAX_WIDTH);
  const hw0 = width / 2;
  const clearance = input.clearance ?? 1.2;
  const rng = riverRandom(input.seed);
  const f = frameOf(input.from, input.to);
  const L = f.length;
  const h = 1;
  const n = Math.max(8, Math.ceil(L / h));
  const step = L / n;
  const ts = Array.from({ length: n + 1 }, (_, i) => i * step);

  // Meanders: two sines, limited by the smallest bend radius.
  const rMin = Math.max(RIVER_MIN_RADIUS_FACTOR * width, 3);
  const amp = clamp(meander, 0, 1) * Math.min(0.14 * L, 2.5 * width + 3);
  const lambdaFor = (a: number, wish: number) => Math.max(wish, 2 * Math.PI * Math.sqrt(Math.max(a, 1e-6) * rMin) * 1.1);
  const lambda1 = lambdaFor(amp, clamp(L / (1.6 + rng() * 1.2), 6 * width, 60));
  const amp2 = amp * (0.25 + rng() * 0.15);
  const lambda2 = lambdaFor(amp2, lambda1 * (0.45 + rng() * 0.15));
  const phase1 = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const ls = ts.map((t) => {
    const env = smooth01(0, 0.18, t / L) * smooth01(0, 0.18, 1 - t / L);
    return env * (amp * Math.sin((2 * Math.PI * t) / lambda1 + phase1) + amp2 * Math.sin((2 * Math.PI * t) / lambda2 + phase2));
  });

  // Obstacles: push to one side, smooth, repeat; the last move is a push.
  const obstacles = frameObstacles(f, input.obstacles ?? [], hw0, clearance, rng);
  for (let iter = 0; iter < 80; iter++) {
    pushOut(ts, ls, obstacles);
    smoothInterior(ls, 0.5);
  }
  pushOut(ts, ls, obstacles);
  // Bends tighter than rMin: smooth locally (then push again).
  for (let iter = 0; iter < 40; iter++) {
    let sharp = false;
    const copy = ls.slice();
    for (let i = 1; i < ls.length - 1; i++) {
      if (graphCurvature(copy, i, step) * rMin > 1) {
        sharp = true;
        ls[i] = copy[i]! + 0.5 * ((copy[i - 1]! + copy[i + 1]!) / 2 - copy[i]!);
      }
    }
    pushOut(ts, ls, obstacles);
    if (!sharp) break;
  }

  // Smooth spline at 0.5 m.
  const control = ts.map((t, i) => fromFrame(f, t, ls[i]!));
  const points = resampleEven(catmullRom(control, RIVER_SAMPLE_STEP / 2), RIVER_SAMPLE_STEP);

  // Width variation and a pool at the strongest bend of the middle part.
  const wPhase1 = rng() * Math.PI * 2;
  const wPhase2 = rng() * Math.PI * 2;
  const wLen1 = 9 + rng() * 6;
  const wLen2 = 4 + rng() * 2.5;
  const variation = (s: number) => 1 + RIVER_WIDTH_VARIATION * (0.65 * Math.sin((2 * Math.PI * s) / wLen1 + wPhase1) + 0.35 * Math.sin((2 * Math.PI * s) / wLen2 + wPhase2));
  const plain = samplesOf(points, (s) => hw0 * variation(s), (_s, hw) => centerDepth(hw));
  const total = plain[plain.length - 1]?.s ?? 0;

  let pool: RiverPool | undefined;
  if ((input.pool ?? true) && total >= RIVER_POOL_MIN_LENGTH) {
    let best = -1;
    let bestK = -1;
    for (let i = 0; i < plain.length; i++) {
      const p = plain[i]!;
      if (p.s < total * 0.35 || p.s > total * 0.75) continue;
      if (Math.abs(p.k) > bestK) {
        bestK = Math.abs(p.k);
        best = i;
      }
    }
    if (best >= 0) {
      const p = plain[best]!;
      pool = { s: p.s, x: p.x, z: p.z, radius: hw0 * RIVER_POOL_FACTOR };
    }
  }
  const spread = width * 1.4 + 1;
  const poolFactor = (s: number) => (pool ? 1 + (RIVER_POOL_FACTOR - 1) * Math.exp(-(((s - pool.s) / spread) ** 2)) : 1);
  let samples = samplesOf(
    points,
    (s) => hw0 * variation(s) * poolFactor(s),
    (s, hw) => centerDepth(hw) * (pool ? 1 + 0.6 * (poolFactor(s) - 1) / (RIVER_POOL_FACTOR - 1) : 1)
  );
  // A pool that would reach an obstacle or overlap the river is left out.
  const obstacleList = input.obstacles ?? [];
  if (pool && (obstacleClearance(samples, obstacleList) < Math.min(0.4, obstacleClearance(plain, obstacleList)) || ribbonOverlaps(samples))) {
    pool = undefined;
    samples = plain;
  }
  // Blocked: the river still runs through an obstacle (opposite pushes could not both be met).
  const blocked = obstacleList.some((o) => samples.some((p) => Math.hypot(p.x - o.x, p.z - o.z) < o.r + p.hw * 0.9));
  return { samples, length: total, width, pool, meander, blocked };
}

/**
 * Computes a river course. Deterministic by seed. When a meander does not fit (the ribbon
 * would overlap itself or run into an obstacle), the meander is reduced and the course is
 * computed again.
 */
export function computeRiverPath(input: RiverPathInput): RiverPath {
  let meander = clamp(input.meander, 0, 1);
  let best: (RiverPath & { blocked: boolean }) | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = buildOnce(input, meander);
    if (!best || (!result.blocked && best.blocked)) best = result;
    if (!result.blocked && !ribbonOverlaps(result.samples)) return strip(result);
    meander = attempt >= 3 ? 0 : meander * 0.55;
  }
  return strip(best!);
}

function strip(r: RiverPath & { blocked: boolean }): RiverPath {
  const { blocked: _blocked, ...rest } = r;
  return rest;
}

/** Nearest sample index to a point. */
export function nearestSample(samples: RiverSample[], p: P2) {
  let best = 0;
  let bestD = Infinity;
  samples.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { index: best, distance: bestD };
}

/** Distance from a point to the centerline polyline. */
export function distanceToCenterline(samples: RiverSample[], p: P2) {
  let best = Infinity;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz || 1;
    const w = clamp(((p.x - a.x) * vx + (p.z - a.z) * vz) / len2, 0, 1);
    best = Math.min(best, Math.hypot(a.x + vx * w - p.x, a.z + vz * w - p.z));
  }
  return best;
}

/**
 * Keeps the part of the course on land (the longest run of samples where land(x, z) is true)
 * and runs it mouthExtra meters into the water at an end that meets the coast. The river
 * flows toward the coast: when only the start meets the water, the course is reversed.
 * Returns null when there is less than minLength meters of land.
 */
export function clipToLand(
  samples: RiverSample[],
  land: (x: number, z: number) => boolean,
  options: { minLength?: number; mouthExtra?: number } = {}
): { samples: RiverSample[]; mouthAtStart: boolean; mouthAtEnd: boolean } | null {
  const minLength = options.minLength ?? 6;
  const extra = options.mouthExtra ?? 2.5;
  let bestA = -1;
  let bestB = -1;
  let a = -1;
  for (let i = 0; i <= samples.length; i++) {
    const on = i < samples.length && land(samples[i]!.x, samples[i]!.z);
    if (on && a < 0) a = i;
    if (!on && a >= 0) {
      if (bestA < 0 || samples[i - 1]!.s - samples[a]!.s > samples[bestB]!.s - samples[bestA]!.s) {
        bestA = a;
        bestB = i - 1;
      }
      a = -1;
    }
  }
  if (bestA < 0 || samples[bestB]!.s - samples[bestA]!.s < minLength) return null;
  const startS = bestA > 0 ? Math.max(0, samples[bestA]!.s - extra) : 0;
  const endS = bestB < samples.length - 1 ? Math.min(samples[samples.length - 1]!.s, samples[bestB]!.s + extra) : samples[samples.length - 1]!.s;
  let kept = samples.filter((p) => p.s >= startS - 1e-6 && p.s <= endS + 1e-6);
  let mouthAtStart = bestA > 0;
  let mouthAtEnd = bestB < samples.length - 1;
  if (mouthAtStart && !mouthAtEnd) {
    kept = reverseSamples(kept);
    mouthAtStart = false;
    mouthAtEnd = true;
  }
  const s0 = kept[0]!.s;
  return { samples: kept.map((p) => ({ ...p, s: p.s - s0 })), mouthAtStart, mouthAtEnd };
}

/** The same course, flowing the other way. */
export function reverseSamples(samples: RiverSample[]): RiverSample[] {
  const total = samples[samples.length - 1]?.s ?? 0;
  return samples
    .slice()
    .reverse()
    .map((p) => ({ ...p, s: total - p.s, tx: -p.tx, tz: -p.tz, nx: p.tz, nz: -p.tx, k: -p.k }));
}

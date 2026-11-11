// The river node's params (stored as JSON text in node metadata) and the way back from them to
// centerline samples. Pure code, unit tested in tests/river.test.ts.
import { catmullRom, computeRiverPath, resampleEven, RIVER_SAMPLE_STEP, samplesOf, type RiverSample } from "./path";

export type RiverMode = "flat" | "island";

export type RiverNodeParams = {
  v: 1;
  /** Centerline points in node-local x, z, flattened, about every meter. */
  pts: number[];
  /** Half width at each point. */
  hw: number[];
  /** Center depth at each point (shader color only). */
  dp: number[];
  /** Water style: a water entry slug (lagoon, clear-lake, ...) or a preset id. */
  style: string;
  mode: RiverMode;
  /** Rounded ends of bed, banks and water (flat ground). */
  capStart: boolean;
  capEnd: boolean;
  /** Meters of alpha fade of the water at each end (0 = none). */
  fadeStart: number;
  fadeEnd: number;
  /** Stepping stones: node-local x, z, radius, flattened. */
  stones?: number[];
  seed: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Params for a river node at origin (ox, oz) from world-space samples. */
export function riverParamsFromSamples(
  samples: RiverSample[],
  origin: { x: number; z: number },
  options: { style: string; mode: RiverMode; capStart: boolean; capEnd: boolean; fadeStart: number; fadeEnd: number; seed: number; stones?: { x: number; z: number; r: number }[] }
): RiverNodeParams {
  const keep = samples.filter((_, i) => i % 2 === 0 || i === samples.length - 1);
  return {
    v: 1,
    pts: keep.flatMap((p) => [r2(p.x - origin.x), r2(p.z - origin.z)]),
    hw: keep.map((p) => r2(p.hw)),
    dp: keep.map((p) => r2(p.depth)),
    style: options.style,
    mode: options.mode,
    capStart: options.capStart,
    capEnd: options.capEnd,
    fadeStart: options.fadeStart,
    fadeEnd: options.fadeEnd,
    stones: options.stones?.length ? options.stones.flatMap((s) => [r2(s.x - origin.x), r2(s.z - origin.z), r2(s.r)]) : undefined,
    seed: options.seed
  };
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : []);

/** Reads params from node metadata; returns null when they do not describe a river. */
export function readRiverParams(raw: Record<string, unknown> | undefined): RiverNodeParams | null {
  if (!raw) return null;
  const pts = nums(raw.pts);
  const n = Math.floor(pts.length / 2);
  if (n < 2) return null;
  const hw = nums(raw.hw);
  const dp = nums(raw.dp);
  return {
    v: 1,
    pts: pts.slice(0, n * 2),
    hw: Array.from({ length: n }, (_, i) => Math.min(6, Math.max(0.4, hw[i] ?? hw[hw.length - 1] ?? 1.5))),
    dp: Array.from({ length: n }, (_, i) => Math.min(3, Math.max(0.05, dp[i] ?? dp[dp.length - 1] ?? 0.5))),
    style: typeof raw.style === "string" ? raw.style : "lagoon",
    mode: raw.mode === "island" ? "island" : "flat",
    capStart: raw.capStart !== false,
    capEnd: raw.capEnd !== false,
    fadeStart: Math.max(0, num(raw.fadeStart, 0)),
    fadeEnd: Math.max(0, num(raw.fadeEnd, 0)),
    stones: nums(raw.stones).length >= 3 ? nums(raw.stones) : undefined,
    seed: num(raw.seed, 1)
  };
}

/** Smooth samples (every 0.5 m) from params, in node-local space. */
export function samplesFromParams(params: RiverNodeParams): RiverSample[] {
  const n = params.pts.length / 2;
  const control = Array.from({ length: n }, (_, i) => ({ x: params.pts[i * 2]!, z: params.pts[i * 2 + 1]! }));
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(control[i]!.x - control[i - 1]!.x, control[i]!.z - control[i - 1]!.z));
  const total = cum[n - 1] || 1;
  const points = resampleEven(catmullRom(control, RIVER_SAMPLE_STEP / 2), RIVER_SAMPLE_STEP);
  // Width and depth: interpolated by the fraction of the length (the spline is close to the control polyline).
  const interp = (values: number[], s: number, length: number) => {
    const target = (s / Math.max(length, 1e-6)) * total;
    let j = 0;
    while (j < n - 2 && cum[j + 1]! < target) j++;
    const seg = cum[j + 1]! - cum[j]! || 1;
    const w = Math.min(1, Math.max(0, (target - cum[j]!) / seg));
    return values[j]! + (values[j + 1]! - values[j]!) * w;
  };
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  return samplesOf(points, (s) => interp(params.hw, s, length), (s) => interp(params.dp, s, length));
}

/** The river the library card and a plain drop from the library show: a 26 m S-curve. */
export function defaultRiverParams(): RiverNodeParams {
  const path = computeRiverPath({ from: { x: -13, z: 0 }, to: { x: 13, z: 0 }, width: 3, meander: 0.8, seed: 7, pool: false });
  return riverParamsFromSamples(path.samples, { x: 0, z: 0 }, { style: "lagoon", mode: "flat", capStart: true, capEnd: true, fadeStart: 0, fadeEnd: 0, seed: 7 });
}

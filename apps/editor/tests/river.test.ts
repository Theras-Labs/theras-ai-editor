// Unit tests for the river generator's pure code (src/lib/generators/river/).
// Run: cd apps/editor && bun test tests/river.test.ts
import { describe, expect, test } from "bun:test";
import { defaultCourse } from "../src/lib/generators/river/course";
import { BRIDGE_SPAN, planDressing, RIVER_DRESSING_IDS } from "../src/lib/generators/river/dressing";
import { defaultRiverParams, readRiverParams, riverParamsFromSamples, samplesFromParams } from "../src/lib/generators/river/params";
import {
  centerlineSelfIntersects,
  clipToLand,
  computeRiverPath,
  obstacleClearance,
  ribbonOverlaps,
  RIVER_MIN_RADIUS_FACTOR,
  RIVER_POOL_FACTOR,
  RIVER_WIDTH_VARIATION,
  type RiverObstacle,
  type RiverPathInput
} from "../src/lib/generators/river/path";
import { FLAT_WATER_Y, flatBanks, flatBed, revealIndexCount, waterRibbon } from "../src/lib/generators/river/ribbon";

const CASTLE: RiverObstacle[] = [
  { x: 0, z: 0, r: 6 },
  { x: 14, z: 6, r: 2.5 },
  { x: -12, z: -9, r: 2.2 },
  { x: 4, z: -14, r: 1.5 }
];
const VILLAGE: RiverObstacle[] = [
  { x: -6, z: 2, r: 2.5 },
  { x: -1, z: 3, r: 2 },
  { x: 6, z: -3, r: 2.4 },
  { x: 10, z: 4, r: 2 },
  { x: -14, z: -5, r: 3 },
  { x: 2, z: 10, r: 1 },
  { x: 16, z: -10, r: 2.8 }
];
/** A row of houses straight across the line from -> to. */
const WALL: RiverObstacle[] = [-6, -2, 2, 6].map((z) => ({ x: 0, z, r: 1.8 }));

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function course(obstacles: RiverObstacle[], seed: number, width: number, length = 50) {
  const c = defaultCourse({ anchor: { x: 0, z: 0 }, length, width, seed, obstacles });
  if (typeof c === "string") throw new Error(c);
  return c;
}

describe("river path", () => {
  test("is deterministic by seed", () => {
    const input: RiverPathInput = { from: { x: -20, z: 3 }, to: { x: 22, z: -4 }, width: 3, meander: 0.7, seed: 42, obstacles: VILLAGE };
    const a = computeRiverPath(input);
    const b = computeRiverPath(input);
    expect(b.samples).toEqual(a.samples);
    const c = computeRiverPath({ ...input, seed: 43 });
    expect(c.samples.map((p) => [p.x, p.z])).not.toEqual(a.samples.map((p) => [p.x, p.z]));
  });

  test("never crosses itself, and the ribbon never overlaps itself", () => {
    for (const seed of SEEDS) {
      for (const width of [1.5, 3, 5, 8]) {
        for (const obstacles of [[], CASTLE, VILLAGE]) {
          const c = course(obstacles, seed, width);
          const path = computeRiverPath({ ...c, width, meander: 1, seed, obstacles });
          expect(centerlineSelfIntersects(path.samples)).toBe(false);
          expect(ribbonOverlaps(path.samples)).toBe(false);
        }
      }
    }
  });

  test("goes around obstacles (never through a building)", () => {
    for (const seed of SEEDS) {
      for (const width of [2, 3, 5]) {
        for (const obstacles of [CASTLE, VILLAGE]) {
          const c = course(obstacles, seed, width);
          const path = computeRiverPath({ ...c, width, meander: 0.8, seed, obstacles });
          expect(obstacleClearance(path.samples, obstacles)).toBeGreaterThan(0.3);
        }
        // A straight line through a wall of houses: the river goes around the whole row.
        const path = computeRiverPath({ from: { x: -20, z: 0 }, to: { x: 20, z: 0 }, width, meander: 0.5, seed, obstacles: WALL });
        expect(obstacleClearance(path.samples, WALL)).toBeGreaterThan(0.3);
      }
    }
  });

  test("width stays within range, wider only at the pool", () => {
    for (const seed of SEEDS) {
      for (const width of [1.5, 3, 8]) {
        const path = computeRiverPath({ from: { x: -30, z: 0 }, to: { x: 30, z: 0 }, width, meander: 0.6, seed });
        expect(path.width).toBe(width);
        for (const p of path.samples) {
          const w = p.hw * 2;
          expect(w).toBeGreaterThanOrEqual(width * (1 - RIVER_WIDTH_VARIATION) - 1e-6);
          const poolNear = path.pool && Math.abs(p.s - path.pool.s) < width * 6 + 4;
          expect(w).toBeLessThanOrEqual(width * (1 + RIVER_WIDTH_VARIATION) * (poolNear ? RIVER_POOL_FACTOR : 1) + 1e-6);
        }
      }
    }
    // Out-of-range widths are clamped to 1.5..8 m.
    expect(computeRiverPath({ from: { x: 0, z: 0 }, to: { x: 30, z: 0 }, width: 30, meander: 0, seed: 1 }).width).toBe(8);
    expect(computeRiverPath({ from: { x: 0, z: 0 }, to: { x: 30, z: 0 }, width: 0.2, meander: 0, seed: 1 }).width).toBe(1.5);
  });

  test("a long river gets a pool, a short one does not", () => {
    const long = computeRiverPath({ from: { x: -30, z: 0 }, to: { x: 30, z: 0 }, width: 3, meander: 0.6, seed: 3 });
    expect(long.pool).toBeDefined();
    const short = computeRiverPath({ from: { x: -8, z: 0 }, to: { x: 8, z: 0 }, width: 3, meander: 0.6, seed: 3 });
    expect(short.pool).toBeUndefined();
  });

  test("meanders grow with length and have no sharp kinks", () => {
    const amplitude = (length: number) => {
      let sum = 0;
      for (const seed of SEEDS) {
        const path = computeRiverPath({ from: { x: 0, z: 0 }, to: { x: length, z: 0 }, width: 3, meander: 0.8, seed });
        sum += Math.max(...path.samples.map((p) => Math.abs(p.z)));
      }
      return sum / SEEDS.length;
    };
    expect(amplitude(80)).toBeGreaterThan(amplitude(25));
    for (const seed of SEEDS) {
      const width = 3;
      const path = computeRiverPath({ from: { x: 0, z: 0 }, to: { x: 60, z: 0 }, width, meander: 1, seed });
      // Curvature over 2 m (a few samples), so the 0.5 m resampling noise does not count.
      const turn = path.samples.slice(4, -4).map((p, i) => {
        const a = path.samples[i]!;
        const b = path.samples[i + 8]!;
        return Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz)) / Math.max(1e-6, b.s - a.s);
      });
      expect(Math.max(...turn)).toBeLessThan((1 / (RIVER_MIN_RADIUS_FACTOR * width)) * 1.35);
    }
  });

  test("clips to the land of an island and flows into the lake", () => {
    const land = (x: number, z: number) => Math.hypot(x, z) < 12;
    // Starts in the water, ends inland: reversed so it flows to the coast.
    const path = computeRiverPath({ from: { x: -20, z: 0 }, to: { x: 6, z: 0 }, width: 3, meander: 0, seed: 1 });
    const clipped = clipToLand(path.samples, land, { mouthExtra: 2.5 })!;
    expect(clipped).not.toBeNull();
    expect(clipped.mouthAtEnd).toBe(true);
    expect(clipped.mouthAtStart).toBe(false);
    const first = clipped.samples[0]!;
    const last = clipped.samples[clipped.samples.length - 1]!;
    expect(land(first.x, first.z)).toBe(true);
    expect(Math.hypot(last.x, last.z)).toBeGreaterThan(12);
    expect(Math.hypot(last.x, last.z)).toBeLessThan(12 + 3.2);
    expect(first.s).toBe(0);
  });

  test("the island course runs from inland to the coast", () => {
    const ground = (x: number, z: number) => (Math.hypot(x, z) < 14 ? 0.5 : null);
    for (const seed of SEEDS) {
      const c = defaultCourse({ anchor: { x: 2, z: 1 }, length: 20, width: 3, seed, obstacles: [{ x: 2, z: 1, r: 3 }], groundAt: ground });
      if (typeof c === "string") throw new Error(c);
      expect(ground(c.from.x, c.from.z)).not.toBeNull();
      expect(ground(c.to.x, c.to.z)).toBeNull();
    }
  });
});

describe("river meshes", () => {
  const path = computeRiverPath({ from: { x: -25, z: 0 }, to: { x: 25, z: 5 }, width: 3, meander: 0.8, seed: 9, obstacles: VILLAGE });

  test("water ribbon UVs: across 0..1, along monotonic in meters", () => {
    const mesh = waterRibbon(path.samples, FLAT_WATER_Y, { start: false, end: false });
    const uv = mesh.attrs.uv!;
    const perSample = (uv.length / 2) / path.samples.length;
    let prev = -Infinity;
    for (let i = 0; i < path.samples.length; i++) {
      for (let c = 0; c < perSample; c++) {
        const k = i * perSample + c;
        expect(uv[k * 2]!).toBeGreaterThanOrEqual(0);
        expect(uv[k * 2]!).toBeLessThanOrEqual(1);
        expect(uv[k * 2 + 1]!).toBeCloseTo(path.samples[i]!.s, 4);
      }
      expect(uv[i * perSample * 2 + 1]!).toBeGreaterThan(prev);
      prev = uv[i * perSample * 2 + 1]!;
    }
    expect(prev).toBeCloseTo(path.length, 4);
    // Both banks: u = 0 on one side and u = 1 on the other.
    expect(Math.min(...uv.filter((_, i) => i % 2 === 0))).toBe(0);
    expect(Math.max(...uv.filter((_, i) => i % 2 === 0))).toBe(1);
  });

  test("all faces point up and the reveal grows with distance", () => {
    for (const mesh of [waterRibbon(path.samples, FLAT_WATER_Y, { start: true, end: true }), flatBed(path.samples), flatBanks(path.samples, 3, 9)]) {
      const pos = mesh.positions;
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const [a, b, c] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
        const ny = (pos[b * 3 + 2]! - pos[a * 3 + 2]!) * (pos[c * 3]! - pos[a * 3]!) - (pos[b * 3]! - pos[a * 3]!) * (pos[c * 3 + 2]! - pos[a * 3 + 2]!);
        expect(ny).toBeGreaterThanOrEqual(0);
      }
      expect(revealIndexCount(mesh, path.length / 2)).toBeLessThan(revealIndexCount(mesh, path.length));
      expect(revealIndexCount(mesh, 1e9)).toBe(mesh.indices.length);
    }
  });

  test("params round trip keeps the course", () => {
    const params = riverParamsFromSamples(path.samples, { x: 3, z: -2 }, { style: "lagoon", mode: "flat", capStart: true, capEnd: true, fadeStart: 0, fadeEnd: 0, seed: 9 });
    const parsed = readRiverParams(JSON.parse(JSON.stringify(params)))!;
    const back = samplesFromParams(parsed);
    expect(Math.abs(back[back.length - 1]!.s - path.length)).toBeLessThan(0.5);
    const mid = back[Math.floor(back.length / 2)]!;
    const nearest = Math.min(...path.samples.map((p) => Math.hypot(p.x - 3 - mid.x, p.z + 2 - mid.z)));
    expect(nearest).toBeLessThan(0.3);
    expect(readRiverParams({ pts: [1] })).toBeNull();
    expect(samplesFromParams(defaultRiverParams()).length).toBeGreaterThan(40);
  });
});

describe("river dressing", () => {
  test("reeds sit at inner bends, nothing stands in an obstacle, the bridge crosses the river", () => {
    for (const seed of SEEDS) {
      const c = course(VILLAGE, seed, 3);
      const path = computeRiverPath({ ...c, width: 3, meander: 0.8, seed, obstacles: VILLAGE });
      const result = planDressing({
        samples: path.samples,
        width: 3,
        pool: path.pool,
        banks: "mixed",
        bridge: true,
        stones: true,
        seed,
        obstacles: VILLAGE,
        anchor: { x: 0, z: 0 },
        landmarks: VILLAGE.filter((o) => o.r >= 2),
        heightAt: () => 0.1,
        waterY: FLAT_WATER_Y
      });
      for (const item of result.items) {
        for (const o of VILLAGE) expect(Math.hypot(item.x - o.x, item.z - o.z)).toBeGreaterThan(o.r);
        if (item.role === "bridge") {
          // Local x of the bridge (cos, -sin) runs along the river normal.
          const i = path.samples.reduce((best, p, k) => (Math.hypot(p.x - item.x, p.z - item.z) < Math.hypot(path.samples[best]!.x - item.x, path.samples[best]!.z - item.z) ? k : best), 0);
          const p = path.samples[i]!;
          const dot = Math.cos(item.rotationY) * p.nx - Math.sin(item.rotationY) * p.nz;
          expect(Math.abs(dot)).toBeGreaterThan(0.99);
          expect(BRIDGE_SPAN * item.scale).toBeGreaterThan(p.hw * 2);
        }
      }
      expect(result.items.some((i) => i.id === RIVER_DRESSING_IDS.reeds)).toBe(true);
      for (const s of result.stepping?.stones ?? []) {
        expect(Math.min(...path.samples.map((p) => Math.hypot(p.x - s.x, p.z - s.z)))).toBeLessThan(path.width);
      }
    }
  });

  test('"clean" banks place no plants or stones', () => {
    const path = computeRiverPath({ from: { x: -25, z: 0 }, to: { x: 25, z: 0 }, width: 3, meander: 0.8, seed: 2 });
    const result = planDressing({
      samples: path.samples,
      width: 3,
      pool: path.pool,
      banks: "clean",
      bridge: false,
      stones: false,
      seed: 2,
      obstacles: [],
      anchor: { x: 0, z: 0 },
      landmarks: [],
      heightAt: () => 0.1,
      waterY: FLAT_WATER_Y
    });
    expect(result.items.length).toBe(0);
  });
});

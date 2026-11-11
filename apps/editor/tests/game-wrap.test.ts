// Unit tests for the game mode wrap plan and the start point.
// Run: cd apps/editor && bun test tests/game-wrap.test.ts
import { describe, expect, test } from "bun:test";
import { chooseSpawn, yawToward, type SpawnRays, type Vec3 } from "../src/lib/game/spawn";
import {
  orderWrap,
  simulateWrapMs,
  wrapBudget,
  wrapDurationMs,
  wrapFinished,
  WRAP_MAX_MS,
  WRAP_MIN_MS,
  type WrapItem
} from "../src/lib/game/wrap-plan";

describe("wrap plan", () => {
  test("terrain first, then near before far", () => {
    const items: WrapItem[] = [
      { id: "far", terrain: false, x: 50, y: 0, z: 0 },
      { id: "near", terrain: false, x: 2, y: 0, z: 1 },
      { id: "land", terrain: true, x: 200, y: 0, z: 0 },
      { id: "mid", terrain: false, x: 0, y: 0, z: -10 }
    ];
    expect(orderWrap(items, { x: 0, z: 0 }).map((i) => i.id)).toEqual(["land", "near", "mid", "far"]);
    // Measured from the hint, not from the origin.
    expect(orderWrap(items, { x: 50, z: 0 }).map((i) => i.id)).toEqual(["land", "far", "near", "mid"]);
  });

  test("a small scene still takes at least about 1.2 s", () => {
    expect(simulateWrapMs(0)).toBeGreaterThanOrEqual(WRAP_MIN_MS);
    expect(simulateWrapMs(3)).toBeGreaterThanOrEqual(WRAP_MIN_MS);
    expect(simulateWrapMs(3)).toBeLessThan(1600);
  });

  test("400 units take 3 to 5 s", () => {
    const ms = simulateWrapMs(400);
    expect(ms).toBeGreaterThanOrEqual(3000);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  test("never more than about 6 s", () => {
    expect(wrapDurationMs(5000)).toBe(WRAP_MAX_MS);
    expect(simulateWrapMs(5000)).toBeLessThanOrEqual(WRAP_MAX_MS + 100);
  });

  test("units are spread over the wrap, not built at once", () => {
    const first = wrapBudget({ elapsedMs: 0, done: 0, ready: 400, waiting: 0, skip: false });
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThan(20);
    const half = wrapBudget({ elapsedMs: wrapDurationMs(400) / 2, done: first, ready: 400 - first, waiting: 0, skip: false });
    expect(first + half).toBeGreaterThan(150);
    expect(first + half).toBeLessThan(250);
  });

  test("skip builds every ready unit and ends the wrap", () => {
    const state = { elapsedMs: 100, done: 2, ready: 300, waiting: 5, skip: true };
    expect(wrapBudget(state)).toBe(300);
    expect(wrapFinished(state)).toBe(true);
  });

  test("the wrap waits for units that are not ready, up to the cap", () => {
    expect(wrapFinished({ elapsedMs: 3000, done: 10, ready: 0, waiting: 2, skip: false })).toBe(false);
    expect(wrapFinished({ elapsedMs: WRAP_MAX_MS, done: 10, ready: 0, waiting: 2, skip: false })).toBe(true);
    expect(wrapFinished({ elapsedMs: 3000, done: 10, ready: 0, waiting: 0, skip: false })).toBe(true);
  });
});

// A test world made of boxes: the ground is y 0 everywhere, boxes are solid.
type Box = { min: Vec3; max: Vec3 };

function boxWorld(boxes: Box[], options: { water?: Box[] } = {}): SpawnRays {
  const inside = (p: Vec3, b: Box) => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
  // Ray against an axis-aligned box (slab test); solid: a ray that starts inside hits at 0.
  const hitBox = (o: Vec3, d: Vec3, b: Box): number | null => {
    if (inside(o, b)) return 0;
    let t0 = 0;
    let t1 = Infinity;
    for (const k of ["x", "y", "z"] as const) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < b.min[k] || o[k] > b.max[k]) return null;
        continue;
      }
      let a = (b.min[k] - o[k]) / d[k];
      let c = (b.max[k] - o[k]) / d[k];
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) return null;
    }
    return t0;
  };
  const ground: Box = { min: { x: -1000, y: -1, z: -1000 }, max: { x: 1000, y: 0, z: 1000 } };
  const all = [ground, ...boxes];
  const castRay = (o: Vec3, d: Vec3, max: number) => {
    let best: number | null = null;
    for (const b of all) {
      const t = hitBox(o, d, b);
      if (t !== null && t <= max && (best === null || t < best)) best = t;
    }
    return best;
  };
  return {
    castRay,
    groundBelow: (x, z, from) => {
      const t = castRay({ x, y: from, z }, { x: 0, y: -1, z: 0 }, from + 500);
      return t === null ? null : from - t;
    },
    isWet: (x, z, y) => (options.water ?? []).some((w) => x >= w.min.x && x <= w.max.x && z >= w.min.z && z <= w.max.z && w.max.y > y + 0.02)
  };
}

/** A closed tower shell around (cx, cz): four walls and a roof, no door. Inside is open floor. */
function tower(cx: number, cz: number, half: number, height: number): Box[] {
  const t = 0.3;
  return [
    { min: { x: cx - half, y: 0, z: cz - half }, max: { x: cx + half, y: height, z: cz - half + t } },
    { min: { x: cx - half, y: 0, z: cz + half - t }, max: { x: cx + half, y: height, z: cz + half } },
    { min: { x: cx - half, y: 0, z: cz - half }, max: { x: cx - half + t, y: height, z: cz + half } },
    { min: { x: cx + half - t, y: 0, z: cz - half }, max: { x: cx + half, y: height, z: cz + half } },
    { min: { x: cx - half, y: height, z: cz - half }, max: { x: cx + half, y: height + 0.3, z: cz + half } }
  ];
}

const hint = { x: 0, y: 0, z: 0 };

describe("start point", () => {
  test("open ground at the hint is taken as is", () => {
    const p = chooseSpawn(boxWorld([]), { hint, groundY: 0 });
    expect(p.source).toBe("outdoor");
    expect(p.x).toBe(0);
    expect(p.z).toBe(0);
    expect(p.y).toBeCloseTo(0, 5);
  });

  test("the marker wins, on the ground under it, facing its yaw", () => {
    const world = boxWorld([{ min: { x: 9, y: 0, z: 9 }, max: { x: 11, y: 0.5, z: 11 } }]);
    const p = chooseSpawn(world, { hint, groundY: 0, marker: { x: 10, y: 0.4, z: 10, yaw: 1.2 } });
    expect(p.source).toBe("marker");
    expect(p.x).toBe(10);
    expect(p.z).toBe(10);
    expect(p.y).toBeCloseTo(0.5, 5);
    expect(p.yaw).toBe(1.2);
  });

  test("a point under a roof is refused", () => {
    // A roof 3 m up over the hint (an open shelter, no walls).
    const roof: Box = { min: { x: -6, y: 3, z: -6 }, max: { x: 6, y: 3.3, z: 6 } };
    const p = chooseSpawn(boxWorld([roof]), { hint, groundY: 0 });
    expect(p.source).toBe("outdoor");
    expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeGreaterThan(6);
  });

  test("a point beside a wall is refused", () => {
    // A thin wall 0.3 m east of the hint, long in z, low enough that the roof test passes.
    const wall: Box = { min: { x: 0.3, y: 0, z: -50 }, max: { x: 0.6, y: 2.5, z: 50 } };
    const world = boxWorld([wall]);
    const p = chooseSpawn(world, { hint, groundY: 0 });
    expect(p.source).toBe("outdoor");
    expect(p.x === 0 && p.z === 0).toBe(false);
    // The point keeps 0.6 m from the wall at chest height.
    expect(p.x < 0.3 - 0.6 || p.x > 0.6 + 0.6).toBe(true);
  });

  test("inside a closed tower: the nearest outdoor point, facing the hint", () => {
    const world = boxWorld(tower(0, 0, 6, 12));
    const p = chooseSpawn(world, { hint, groundY: 0 });
    expect(p.source).toBe("outdoor");
    const d = Math.hypot(p.x, p.z);
    // Outside the walls (6 m) plus side clearance, and on the first ring that is outside.
    expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeGreaterThan(6.6);
    expect(d).toBeLessThanOrEqual(9 + 1e-9);
    // Facing the hint: the yaw direction (0 = -z) points from the start toward (0, 0).
    expect(p.yaw).toBeDefined();
    const fx = -Math.sin(p.yaw!);
    const fz = -Math.cos(p.yaw!);
    expect(fx * (0 - p.x) + fz * (0 - p.z)).toBeCloseTo(d, 5);
  });

  test("the nearest outdoor point is taken when several are free", () => {
    // A large hall from -20 to 20 with an open space just east: rings go outward, so the start
    // is near the hall wall, not 100 m away.
    const world = boxWorld(tower(0, 0, 20, 10));
    const p = chooseSpawn(world, { hint, groundY: 0 });
    expect(p.source).toBe("outdoor");
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(30);
  });

  test("no outdoor point (a roof over everything): the old rule", () => {
    const sky: Box = { min: { x: -500, y: 5, z: -500 }, max: { x: 500, y: 5.5, z: 500 } };
    const p = chooseSpawn(boxWorld([sky]), { hint: { x: 3, y: 0, z: 4 }, groundY: 0 });
    expect(p.source).toBe("fallback");
    expect(p.x).toBe(3);
    expect(p.z).toBe(4);
    expect(p.y).toBeCloseTo(0, 5);
  });

  test("water at the hint is skipped", () => {
    const lake: Box = { min: { x: -5, y: -1, z: -5 }, max: { x: 5, y: 0.2, z: 5 } };
    const p = chooseSpawn(boxWorld([], { water: [lake] }), { hint, groundY: 0 });
    expect(p.source).toBe("outdoor");
    expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeGreaterThan(5 + 2);
  });

  test("yaw convention: 0 faces -z", () => {
    expect(yawToward({ x: 0, z: 0 }, { x: 0, z: -5 })).toBeCloseTo(0, 6);
    expect(yawToward({ x: 0, z: 0 }, { x: -5, z: 0 })).toBeCloseTo(Math.PI / 2, 6);
    expect(yawToward({ x: 0, z: 0 }, { x: 0.1, z: 0 })).toBeUndefined();
  });
});

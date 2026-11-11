// Default course of a river when the brief gives no from/to: a natural line across the area
// that passes the anchor (beside it when an object stands on it). On an island the river runs
// from inland to the nearest good coast. Pure code, unit tested in tests/river.test.ts.
import { obstacleReach, riverRandom, type P2, type RiverObstacle } from "./path";

export type CourseInput = {
  anchor: P2;
  /** Wished length in meters. */
  length: number;
  width: number;
  seed: number;
  obstacles: RiverObstacle[];
  /** Island ground: height, or null over water. Omit for the flat editor ground. */
  groundAt?: (x: number, z: number) => number | null;
  /** Island center (used when the anchor is on the water). */
  island?: P2;
};

/** Length of the part of segment a-b that runs inside a circle of radius r around c. */
function insideLength(a: P2, b: P2, c: P2, r: number) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const t = (c.x - a.x) * ux + (c.z - a.z) * uz;
  const d = Math.abs((c.x - a.x) * -uz + (c.z - a.z) * ux);
  if (d >= r) return 0;
  const half = Math.sqrt(r * r - d * d);
  return Math.max(0, Math.min(len, t + half) - Math.max(0, t - half));
}

/** Cost of a straight course: meters inside obstacle reaches. */
function blockedLength(a: P2, b: P2, obstacles: RiverObstacle[], hw: number) {
  return obstacles.reduce((sum, o) => sum + insideLength(a, b, o, obstacleReach(o, hw, 1.2)), 0);
}

export function defaultCourse(input: CourseInput): { from: P2; to: P2 } | string {
  return input.groundAt ? islandCourse(input) : flatCourse(input);
}

function flatCourse(input: CourseInput): { from: P2; to: P2 } {
  const rng = riverRandom(input.seed ^ 0x51f15e);
  const hw = input.width / 2;
  const L = input.length;
  const a = input.anchor;
  // An object on the anchor (the castle): the river passes beside it, not through it.
  const cover = input.obstacles.find((o) => !o.soft && Math.hypot(o.x - a.x, o.z - a.z) < o.r + 0.5);
  const offsets = cover ? [cover.r + hw + 3, -(cover.r + hw + 3), cover.r + hw + 6, -(cover.r + hw + 6)] : [0, L * 0.12, -L * 0.12];
  const theta0 = rng() * Math.PI;
  let best: { from: P2; to: P2; cost: number } | null = null;
  for (let k = 0; k < 12; k++) {
    const theta = theta0 + (k * Math.PI) / 12;
    const dx = Math.cos(theta);
    const dz = Math.sin(theta);
    for (const off of offsets) {
      const cx = (cover?.x ?? a.x) - dz * off;
      const cz = (cover?.z ?? a.z) + dx * off;
      const from = { x: cx - (dx * L) / 2, z: cz - (dz * L) / 2 };
      const to = { x: cx + (dx * L) / 2, z: cz + (dz * L) / 2 };
      const cost = blockedLength(from, to, input.obstacles, hw) * 3 + Math.abs(off) * 0.08 + k * 0.01;
      if (!best || cost < best.cost) best = { from, to, cost };
    }
  }
  return { from: best!.from, to: best!.to };
}

function islandCourse(input: CourseInput): { from: P2; to: P2 } | string {
  const ground = input.groundAt!;
  const rng = riverRandom(input.seed ^ 0x1514d);
  const hw = input.width / 2;
  let a = input.anchor;
  if (ground(a.x, a.z) === null) {
    if (!input.island || ground(input.island.x, input.island.z) === null) return "no land at the anchor or the island center for a river";
    a = input.island;
  }
  const cover = input.obstacles.find((o) => !o.soft && Math.hypot(o.x - a.x, o.z - a.z) < o.r + 0.5);
  const theta0 = rng() * Math.PI * 2;
  let best: { from: P2; to: P2; cost: number } | null = null;
  const march = (p: P2, dx: number, dz: number, max: number) => {
    // Distance to the first water along a direction (or max), and the mean land height.
    let sum = 0;
    let count = 0;
    for (let d = 0.5; d <= max; d += 0.5) {
      const y = ground(p.x + dx * d, p.z + dz * d);
      if (y === null) return { coast: d, mean: count ? sum / count : 0 };
      sum += y;
      count++;
    }
    return { coast: Infinity, mean: count ? sum / count : 0 };
  };
  for (let k = 0; k < 16; k++) {
    const theta = theta0 + (k * Math.PI * 2) / 16;
    const dx = Math.cos(theta);
    const dz = Math.sin(theta);
    // Beside an object on the anchor: shift the course sideways.
    const off = cover ? (k % 2 === 0 ? 1 : -1) * (cover.r + hw + 2.5) : 0;
    const base = { x: a.x - dz * off, z: a.z + dx * off };
    if (ground(base.x, base.z) === null) continue;
    const ahead = march(base, dx, dz, input.length * 1.5);
    if (!Number.isFinite(ahead.coast)) continue;
    const behind = march(base, -dx, -dz, input.length);
    // The source stays well inland: at most about half way to the coast behind the anchor.
    const back = Math.max(0, Math.min(input.length - ahead.coast, Number.isFinite(behind.coast) ? behind.coast * 0.5 - 1 : input.length));
    const landLength = ahead.coast + back;
    if (landLength < 6) continue;
    const from = { x: base.x - dx * back, z: base.z - dz * back };
    const to = { x: base.x + dx * (ahead.coast + 3), z: base.z + dz * (ahead.coast + 3) };
    const cost =
      Math.abs(landLength - input.length) * 0.5 + (ahead.mean + behind.mean) * 4 + blockedLength(from, to, input.obstacles, hw) * 3 + Math.abs(off) * 0.05 + k * 0.01;
    if (!best || cost < best.cost) best = { from, to, cost };
  }
  return best ? { from: best.from, to: best.to } : "the island has no room for a river (no course from inland to the coast)";
}

// The start point of game mode. Pure logic: the ray functions come from the caller (the Rapier
// world in GameWorld, plain functions in the tests).
// Rules: the "Player start" marker wins. Else open, dry, flat ground OUTDOORS near the hint
// (nothing above the head, no wall at the sides), searched outward in rings up to 120 m, so
// the player does not start inside a closed building. Else the old rule (dry ground near the
// hint, then the ground under the hint).

export type Vec3 = { x: number; y: number; z: number };

export type SpawnRays = {
  /** The first ground under (x, z), cast down from fromY. null = nothing. */
  groundBelow(x: number, z: number, fromY: number): number | null;
  /** True when a water surface lies above the ground point. */
  isWet(x: number, z: number, groundY: number): boolean;
  /** Distance to the first collider along dir (unit length) within maxDist, or null. */
  castRay(origin: Vec3, dir: Vec3, maxDist: number): number | null;
};

export type SpawnInput = {
  hint: Vec3;
  marker?: { x: number; y: number; z: number; yaw: number } | null;
  /** Height of the safety ground (last fallback). */
  groundY: number;
  /** Search ray start rises by this much per meter of distance from the hint (hilly terrain). 0 for flat scenes. */
  slope?: number;
};

export type SpawnPoint = Vec3 & {
  /** Facing (radians, 0 = toward -z). undefined = keep the editor camera direction. */
  yaw?: number;
  source: "marker" | "outdoor" | "fallback";
};

/** Head height for the roof test, chest height for the wall test. */
export const HEAD_HEIGHT = 1.8;
export const CHEST_HEIGHT = 1.2;
/** Nothing may be above the head within this distance. */
export const ROOF_CLEAR = 60;
/** Nothing may be at the sides within this distance. */
export const SIDE_CLEAR = 0.6;
/** The ground ray of the outdoor search starts this high above the hint. */
export const START_ABOVE = 2.2;
/** Farthest search ring. */
export const SEARCH_RADIUS = 120;

const RINGS = [2, 3.5, 5, 7, 9, 12, 16, 20, 25, 30, 36, 43, 50, 60, 70, 80, 90, 100, 110, 120];
/** The old search rings (fallback). */
const NEAR_RINGS = [2, 3.5, 5, 7, 9, 12, 16, 20];
const SIDES: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Direction to face from (x, z) toward the target. undefined when the two are too close. */
export function yawToward(from: { x: number; z: number }, to: { x: number; z: number }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 0.5) return undefined;
  return Math.atan2(-dx, -dz);
}

/** Samples on a ring: about one every 2.5 m, 16 to 64. */
function ringSamples(radius: number) {
  return Math.min(64, Math.max(16, Math.round((Math.PI * 2 * radius) / 2.5)));
}

export function chooseSpawn(rays: SpawnRays, input: SpawnInput): SpawnPoint {
  const { hint, marker } = input;
  if (marker) {
    const y = rays.groundBelow(marker.x, marker.z, marker.y + 2);
    return { x: marker.x, y: y ?? marker.y, z: marker.z, yaw: marker.yaw, source: "marker" };
  }

  const baseY = Math.max(hint.y, 0);
  const slope = input.slope ?? 0;
  // The ground ray starts low (just above head height), so a low roof is not taken as ground.
  // It rises with the distance on hilly terrain. The old rule (fallback) starts 4 m up.
  let above = START_ABOVE;
  const fromAt = (distance: number) => baseY + above + slope * distance;

  const dryAt = (x: number, z: number, from: number) => {
    const y = rays.groundBelow(x, z, from);
    return y !== null && !rays.isWet(x, z, y) ? y : null;
  };
  // Dry and about flat: the points 0.8 m around are within 0.4 m of height, and no water is
  // within 2 m (so the player does not start on a lake shore).
  const dry = (x: number, z: number, from: number, y: number) => {
    for (const [dx, dz] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]] as const) {
      const n = dryAt(x + dx, z + dz, from);
      if (n === null || Math.abs(n - y) > 0.4) return false;
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (dryAt(x + Math.cos(a) * 2, z + Math.sin(a) * 2, from) === null) return false;
    }
    return true;
  };
  // Outdoors: open sky above the head, and no wall right at the sides.
  const outdoors = (x: number, z: number, y: number) => {
    if (rays.castRay({ x, y: y + HEAD_HEIGHT, z }, { x: 0, y: 1, z: 0 }, ROOF_CLEAR) !== null) return false;
    for (const [dx, dz] of SIDES) {
      if (rays.castRay({ x, y: y + CHEST_HEIGHT, z }, { x: dx, y: 0, z: dz }, SIDE_CLEAR) !== null) return false;
    }
    return true;
  };
  // Cheap tests first: one ray for the ground, one for the roof, then the rest.
  const good = (x: number, z: number, distance: number, needOutdoors: boolean) => {
    const from = fromAt(distance);
    const y = dryAt(x, z, from);
    if (y === null) return null;
    if (needOutdoors && !outdoors(x, z, y)) return null;
    return dry(x, z, from, y) ? y : null;
  };
  const search = (rings: number[], needOutdoors: boolean): { x: number; y: number; z: number } | null => {
    const here = good(hint.x, hint.z, 0, needOutdoors);
    if (here !== null) return { x: hint.x, y: here, z: hint.z };
    for (const radius of rings) {
      const n = ringSamples(radius);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = hint.x + Math.cos(a) * radius;
        const z = hint.z + Math.sin(a) * radius;
        const y = good(x, z, radius, needOutdoors);
        if (y !== null) return { x, y, z };
      }
    }
    return null;
  };

  const outdoor = search(RINGS, true);
  if (outdoor) return { ...outdoor, yaw: yawToward(outdoor, hint), source: "outdoor" };

  // Indoor scene: the old rule.
  above = 4;
  const near = search(NEAR_RINGS, false);
  if (near) return { ...near, yaw: yawToward(near, hint), source: "fallback" };
  const under = rays.groundBelow(hint.x, hint.z, fromAt(0));
  return { x: hint.x, y: under ?? input.groundY, z: hint.z, source: "fallback" };
}

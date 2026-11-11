// Layout solver (plan docs/plans/realtime-ai-harness.md, 5.1 and the fixed contract 5.7).
// The model names library ids and a relation (pattern, anchor, count). This file computes
// x, y, z, yaw and scale: terrain height, no overlap (footprint circles + 0.2 m), land only
// unless the entry is a water or boat kind, deterministic by seed. An object with no free
// place goes to `skipped`; the call does not fail.
//
// Everything above "Editor glue" is pure and unit tested (tests/layout.test.ts).
import * as THREE from "three";
import { hasPlaceGround, placeGroundAt } from "./place-ground";
import { getTerrain, terrainNodeIds } from "./terrain-edit";
import type { ResourceEntry } from "./types";

// ── Scene model ───────────────────────────────────────────────

export type LayoutVec = { x: number; y: number; z: number };

/** A scene node as the solver sees it (the scene digest node has this shape). */
export type LayoutNode = {
  id: string;
  name: string;
  /** "resource <library id>", "terrain island", "sky ...", "primitive cube", ... */
  kind: string;
  position: LayoutVec;
  /** Footprint radius in meters; nodes without a radius are not obstacles. */
  radius?: number;
  terrain?: boolean;
};

export type PlacementScene = {
  nodes: LayoutNode[];
  selection: string[];
  cameraTarget?: LayoutVec;
  /** Ground height in world space; null where there is no land (water). Omit when there is no terrain. */
  groundAt?: (x: number, z: number) => number | null;
};

/** Minimum free space between two footprint circles, in meters. */
export const LAYOUT_GAP = 0.2;
/** Water level of the island lake. */
export const WATER_LEVEL = 0;
export const LAYOUT_MAX_COUNT = 24;

/** soft = a small plant: a bigger object may stand over it when no clear place is left. */
type Circle = { x: number; z: number; r: number; soft?: boolean };

/** Footprint circles of the scene. Ground covers (terrain, water surfaces, skies) are not obstacles. */
export function sceneObstacles(nodes: LayoutNode[]): Circle[] {
  return nodes
    // Places (env:*) are ground, like the island: things stand in them, not around them.
    .filter((n) => !n.terrain && n.radius !== undefined && !/\b(sky|water|hdri)\b|\benv:/.test(n.kind))
    .map((n) => ({ x: n.position.x, z: n.position.z, r: n.radius!, soft: /plant/.test(n.kind) && n.radius! <= 0.7 }));
}

// ── Tier 0 spots (moved from instant-path.ts, unchanged) ─────

export type SpotRelation = "near" | "around" | "on";
export type SpotAnchor = { x: number; z: number; radius: number; terrain?: boolean; name: string };
export type Spot = { x: number; y: number; z: number };

/**
 * Free spots for count objects of radius footprint. Objects keep the sum of their
 * footprints apart (plus a 0.2 m gap), stand on land when there is a terrain, and are placed
 * on rings around the anchor, or around the camera target when there is no anchor.
 * Returns null when there is not enough free land.
 */
export function findSpots(
  count: number,
  footprint: number,
  scene: PlacementScene,
  anchor: SpotAnchor | null,
  relation: SpotRelation | undefined,
  options: { needsLand: boolean }
): Spot[] | null {
  const r = Math.max(footprint, 0.3);
  const occupied = sceneObstacles(scene.nodes);
  const ground = (x: number, z: number): number | null => (scene.groundAt ? scene.groundAt(x, z) : 0);
  const free = (x: number, z: number) => occupied.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r + LAYOUT_GAP);
  const accept = (x: number, z: number): Spot | null => {
    if (!free(x, z)) return null;
    const y = ground(x, z);
    if (y === null) return options.needsLand ? null : { x, y: 0, z };
    return { x, y, z };
  };
  const take = (spot: Spot) => {
    occupied.push({ x: spot.x, z: spot.z, r });
    return spot;
  };

  const center = anchor && !(relation === "on" && !anchor.terrain) ? anchor : null;
  let cx = center?.x ?? scene.cameraTarget?.x ?? 0;
  let cz = center?.z ?? scene.cameraTarget?.z ?? 0;
  // The camera looks at water: start from the island center instead.
  const island = scene.nodes.find((n) => n.terrain);
  if (!center && island && scene.groundAt && ground(cx, cz) === null) {
    cx = island.position.x;
    cz = island.position.z;
  }
  const spots: Spot[] = [];

  if (relation === "around" && anchor && !anchor.terrain) {
    // A ring around the anchor; a blocked place moves outward.
    const base = anchor.radius + r + 0.4;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      let spot: Spot | null = null;
      for (let k = 0; k < 4 && !spot; k++) spot = accept(cx + Math.sin(angle) * (base + k * r), cz + Math.cos(angle) * (base + k * r));
      if (!spot) return null;
      spots.push(take(spot));
    }
    return spots;
  }

  // near / next to: start just outside the anchor. Else (no anchor, "on the island"): start at the center.
  const start = center && !center.terrain ? center.radius + r + 0.4 : 0;
  const step = Math.max(r * 1.5, 0.75);
  for (let ring = 0; ring < 16 && spots.length < count; ring++) {
    const radius = start + ring * step;
    const slots = radius === 0 ? 1 : Math.max(6, Math.floor((Math.PI * 2 * radius) / (r * 2.2)));
    const offset = ring * 0.7;
    for (let s = 0; s < slots && spots.length < count; s++) {
      const angle = offset + (s / slots) * Math.PI * 2;
      const spot = accept(cx + Math.sin(angle) * radius, cz + Math.cos(angle) * radius);
      if (spot) spots.push(take(spot));
    }
  }
  return spots.length === count ? spots : null;
}

// ── Layout solver (5.7) ───────────────────────────────────────

export type LayoutPattern = "single" | "cluster" | "ring" | "row" | "scatter" | "shore" | "path";
export const LAYOUT_PATTERNS: LayoutPattern[] = ["single", "cluster", "ring", "row", "scatter", "shore", "path"];
export type LayoutFacing = "anchor" | "away" | "random" | "along";
export type LayoutAnchorRef = string | { x: number; z: number };

export type LayoutSpec = {
  pattern: LayoutPattern;
  /** Node id, "origin", "camera", "selection", or a point. Default "camera". */
  anchor?: LayoutAnchorRef;
  /** Second point for "row" and "path". */
  to?: LayoutAnchorRef;
  /** Meters. Default from the footprints. */
  radius?: number;
  facing?: LayoutFacing;
};

/**
 * Level and size for a water surface (a flat disk of radius r) at x, z on uneven ground.
 * Water lies in a hollow: its rim must touch the ground or be under it, or the edge of the
 * disk hangs in the air. Tries the full size, then smaller sizes, and takes the largest one
 * that has a hollow (rim higher than the middle). On flat ground the water is a thin sheet
 * on it. Null when the ground slopes and has no hollow there. Over no land (the island lake,
 * or no ground at all) it is the lake level.
 */
export function fitWater(x: number, z: number, r: number, ground: (x: number, z: number) => number | null): { y: number; scale: number } | null {
  const g0 = ground(x, z);
  if (g0 === null) return { y: WATER_LEVEL, scale: 1 };
  const sizes = [1, 0.7, 0.5, 0.35, 0.25, 0.16, 0.1, 0.06].map((k) => r * k).filter((R) => R >= 0.8);
  if (sizes.length === 0) sizes.push(r);
  for (const R of sizes) {
    let min = Infinity;
    let max = -Infinity;
    let open = false;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      const h = ground(x + Math.sin(a) * R, z + Math.cos(a) * R);
      if (h === null) {
        open = true;
        break;
      }
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    if (open) continue;
    const level = min - 0.03;
    if (level > g0 + 0.04) return { y: level, scale: R / r };
    if (max - min < 0.06 && Math.abs(g0 - min) < 0.06) return { y: max + 0.015, scale: R / r };
  }
  return null;
}

/**
 * Where an entry may stand. "land": on the island (or plain ground when there is no island).
 * "water": on the lake (boats, ships, water plants). "cover": a ground cover such as a water
 * surface, placed at the anchor and never an obstacle.
 */
export type LayoutMedium = "land" | "water" | "cover";

export function mediumOf(entry: Pick<ResourceEntry, "kind" | "tags">): LayoutMedium {
  // A puddle follows the ground (it drapes itself), so it stands like a small object.
  if (entry.kind === "water") return entry.tags?.includes("puddle") ? "land" : "cover";
  const tags = entry.tags.map((t) => t.toLowerCase());
  if (tags.includes("boat") || tags.includes("ship")) return "water";
  if (entry.kind === "plant" && (tags.includes("pond") || tags.includes("lake"))) return "water";
  return "land";
}

export type LayoutItem = {
  /** Library id (copied to the result). */
  id: string;
  footprint: number;
  medium: LayoutMedium;
  /** True for plants: cluster and scatter give them random yaw and 0.9 to 1.1 scale. */
  vary?: boolean;
  count?: number;
  layout?: LayoutSpec;
  seed?: number;
};

export type LayoutPlacement = {
  /** Index of the item in the request. */
  item: number;
  id: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Variation seed for the object (its look). */
  seed: number;
};

export type LayoutSkip = { item: number; id: string; reason: string };
export type LayoutResult = { placed: LayoutPlacement[]; skipped: LayoutSkip[] };

/** Small seeded generator (mulberry32). */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Anchor = { x: number; z: number; r: number; fromCamera: boolean };

/** Resolves an anchor reference. Returns an error text for an unknown reference. */
export function resolveLayoutAnchor(ref: LayoutAnchorRef | undefined, scene: PlacementScene): Anchor | string {
  if (ref && typeof ref === "object") {
    if (!Number.isFinite(ref.x) || !Number.isFinite(ref.z)) return "anchor point needs x and z";
    return { x: ref.x, z: ref.z, r: 0, fromCamera: false };
  }
  const key = (ref ?? "camera").trim();
  if (key === "origin") return { x: 0, z: 0, r: 0, fromCamera: false };
  if (key === "camera" || key === "") {
    const t = scene.cameraTarget ?? { x: 0, y: 0, z: 0 };
    return { x: t.x, z: t.z, r: 0, fromCamera: true };
  }
  const placeable = scene.nodes.filter((n) => !n.kind.startsWith("sky"));
  const pick = (n: LayoutNode): Anchor => ({ x: n.position.x, z: n.position.z, r: n.terrain ? 0 : n.radius ?? 0.5, fromCamera: false });
  if (key === "selection") {
    const selected = placeable.filter((n) => scene.selection.includes(n.id));
    if (selected.length === 0) return "nothing is selected";
    if (selected.length === 1) return pick(selected[0]);
    const cx = selected.reduce((s, n) => s + n.position.x, 0) / selected.length;
    const cz = selected.reduce((s, n) => s + n.position.z, 0) / selected.length;
    const r = Math.max(...selected.map((n) => Math.hypot(n.position.x - cx, n.position.z - cz) + (n.radius ?? 0.5)));
    return { x: cx, z: cz, r, fromCamera: false };
  }
  const byId = placeable.find((n) => n.id === key);
  if (byId) return pick(byId);
  const lower = key.toLowerCase();
  const byName = placeable.filter((n) => n.name.toLowerCase() === lower);
  if (byName.length === 1) return pick(byName[0]);
  const partial = placeable.filter((n) => n.name.toLowerCase().includes(lower));
  if (byName.length === 0 && partial.length === 1) return pick(partial[0]);
  return `unknown anchor "${key}" (use a node id from the digest, "origin", "camera", "selection" or {x,z})`;
}

type Candidate = { x: number; z: number; /** Yaw for facing "along" (direction of the row, path or shore). */ along?: number };

const TAU = Math.PI * 2;
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Distance from the island center to the coast in direction angle (x = sin, z = cos), or null. */
function coastDistance(groundAt: (x: number, z: number) => number | null, cx: number, cz: number, angle: number, maxR: number) {
  const step = 0.25;
  if (groundAt(cx, cz) === null) return null;
  for (let d = step; d <= maxR; d += step) {
    if (groundAt(cx + Math.sin(angle) * d, cz + Math.cos(angle) * d) === null) return d - step / 2;
  }
  return null;
}

/**
 * Places every item. Items share one occupancy map, so objects of one call never overlap
 * each other or the scene. Deterministic: the same items, seeds and scene give the same result.
 */
export function solveLayout(items: LayoutItem[], scene: PlacementScene): LayoutResult {
  const occupied = sceneObstacles(scene.nodes);
  const ground = (x: number, z: number): number | null => (scene.groundAt ? scene.groundAt(x, z) : 0);
  const hasTerrain = Boolean(scene.groundAt);
  const island = scene.nodes.find((n) => n.terrain);
  const placed: LayoutPlacement[] = [];
  const skipped: LayoutSkip[] = [];

  const free = (x: number, z: number, r: number, overSoft = false) =>
    occupied.every((o) => (overSoft && o.soft) || Math.hypot(o.x - x, o.z - z) >= o.r + r + LAYOUT_GAP);

  /** Height for an object of radius r at x, z, or null when the medium is wrong there. */
  const surface = (x: number, z: number, r: number, medium: LayoutMedium): number | null => {
    if (medium === "cover") return ground(x, z) ?? WATER_LEVEL;
    if (!hasTerrain) return medium === "water" ? WATER_LEVEL : 0;
    const y = ground(x, z);
    if (medium === "land") {
      if (y === null) return null;
      // The footprint stays on land too (a big object must not hang over the water).
      const k = r * 0.7;
      for (let i = 0; i < 4; i++) if (ground(x + Math.sin((i * TAU) / 4) * k, z + Math.cos((i * TAU) / 4) * k) === null) return null;
      return y;
    }
    // water: the whole footprint is on water.
    if (y !== null) return null;
    const k = r * 0.8;
    for (let i = 0; i < 6; i++) if (ground(x + Math.sin((i * TAU) / 6) * k, z + Math.cos((i * TAU) / 6) * k) !== null) return null;
    return WATER_LEVEL;
  };

  items.forEach((item, index) => {
    const count = Math.max(1, Math.min(LAYOUT_MAX_COUNT, Math.floor(item.count ?? 1)));
    const spec: LayoutSpec = item.layout ?? { pattern: "single" };
    let pattern: LayoutPattern = LAYOUT_PATTERNS.includes(spec.pattern) ? spec.pattern : "cluster";
    if (pattern === "single" && count > 1) pattern = "cluster";
    const rng = seededRandom(item.seed ?? hashString(`${item.id}#${index}`));
    const r = Math.max(item.footprint, 0.3);
    const skip = (reason: string) => skipped.push({ item: index, id: item.id, reason });

    const resolved = resolveLayoutAnchor(spec.anchor, scene);
    if (typeof resolved === "string") return skip(resolved);
    let anchor = resolved;
    // The camera looks at water: land objects start from the island center instead.
    if (anchor.fromCamera && item.medium === "land" && island && hasTerrain && ground(anchor.x, anchor.z) === null) {
      anchor = { x: island.position.x, z: island.position.z, r: 0, fromCamera: false };
    }
    // A point anchor that an object already covers (often the focal object placed by an earlier
    // item of this call at the camera target): later items go around that object, not into it.
    if (anchor.r === 0) {
      const cover = occupied.find((o) => Math.hypot(o.x - anchor.x, o.z - anchor.z) < o.r);
      if (cover) anchor = { x: cover.x, z: cover.z, r: cover.r, fromCamera: anchor.fromCamera };
    }
    let toAnchor: Anchor | null = null;
    if (spec.to !== undefined) {
      const t = resolveLayoutAnchor(spec.to, scene);
      if (typeof t === "string") return skip(`to: ${t}`);
      toAnchor = t;
    }

    // Ground covers (water surfaces) go to the anchor and are never obstacles. On a terrain or
    // a place the water is fitted into the hollow at the anchor (level and size).
    if (item.medium === "cover") {
      const fit = hasTerrain ? fitWater(anchor.x, anchor.z, r, ground) : { y: WATER_LEVEL, scale: 1 };
      if (!fit) return skip("the ground slopes here and has no hollow for water: pick a lower spot, or use water:puddle (it follows the ground)");
      for (let i = 0; i < count; i++) {
        placed.push({ item: index, id: item.id, x: anchor.x, y: fit.y, z: anchor.z, rotationY: 0, scale: fit.scale, seed: Math.floor(rng() * 1e6) });
      }
      return;
    }

    // Boats and water plants belong on the water near the coast: "near" patterns become "shore".
    if (item.medium === "water" && hasTerrain && island && (pattern === "single" || pattern === "cluster" || pattern === "scatter")) pattern = "shore";
    // Without an island there is no coast: a shore layout is a cluster near the anchor.
    if (pattern === "shore" && !(hasTerrain && island)) pattern = "cluster";
    if (pattern === "path" && !toAnchor) return skip('pattern "path" needs "to"');

    const vary = Boolean(item.vary) && (pattern === "cluster" || pattern === "scatter");
    const near = anchor.r > 0 ? anchor.r + r + 0.4 : 0;
    const theta0 = rng() * TAU;

    // Candidate lists. A "slot" pattern (ring, path) has one list per object; the others share one list.
    let shared: Candidate[] | null = null;
    let slots: Candidate[][] | null = null;

    switch (pattern) {
      case "single":
      case "cluster": {
        // Rings outward from the anchor; on each ring the angles nearest theta0 come first, so the
        // group forms one irregular clump on one side of the anchor.
        const step = Math.max(r * 1.4, 0.6);
        const jitter = pattern === "cluster" ? 0.3 : 0;
        // A group stays a group: no place farther from the anchor than the group itself needs.
        // In a dense city the free ground near a tower is small; 24 rings of a 2.3 m tree reached
        // 75 m, so "trees around the tower" ended up two blocks away.
        const reach = Math.max(8, 5 * r, (spec.radius ?? 0) * 1.5, Math.sqrt(count) * (2 * r + 0.6) * 1.6);
        shared = [];
        for (let ring = 0; ring < 24; ring++) {
          const radius = near + ring * step;
          if (ring > 0 && radius - near > reach) break;
          const n = radius === 0 ? 1 : Math.max(6, Math.floor((TAU * radius) / (r * 2.2)));
          const order = Array.from({ length: n }, (_, j) => (j % 2 === 0 ? j / 2 : -(j + 1) / 2));
          for (const j of order) {
            const angle = theta0 + (j / n) * TAU + (rng() - 0.5) * jitter;
            const rr = Math.max(0, radius + (rng() - 0.5) * jitter * step);
            shared.push({ x: anchor.x + Math.sin(angle) * rr, z: anchor.z + Math.cos(angle) * rr });
          }
        }
        break;
      }
      case "scatter": {
        const spread = spec.radius ?? Math.max(3, Math.sqrt(count) * (2 * r + 0.6) * 1.3);
        const inner = Math.max(near, 0);
        const outer = Math.max(inner + 2 * r, (anchor.r > 0 ? anchor.r : 0) + spread);
        shared = [];
        for (let k = 0; k < 400; k++) {
          const angle = rng() * TAU;
          const rr = Math.sqrt(inner * inner + rng() * (outer * outer - inner * inner));
          shared.push({ x: anchor.x + Math.sin(angle) * rr, z: anchor.z + Math.cos(angle) * rr });
        }
        break;
      }
      case "ring": {
        const base = spec.radius ?? (anchor.r > 0 ? anchor.r + r + 0.4 : Math.max(1.5, r * 2));
        const radius = Math.max(base, (count * (2 * r + LAYOUT_GAP + 0.05)) / TAU);
        slots = [];
        for (let i = 0; i < count; i++) {
          const angle = theta0 + (i / count) * TAU;
          const list: Candidate[] = [];
          for (let k = 0; k < 6; k++) {
            for (const da of k === 0 ? [0] : [0, 0.12, -0.12]) {
              const rr = radius + k * r * 0.75;
              list.push({ x: anchor.x + Math.sin(angle + da) * rr, z: anchor.z + Math.cos(angle + da) * rr, along: angle + Math.PI / 2 });
            }
          }
          slots.push(list);
        }
        break;
      }
      case "row": {
        const dir = toAnchor ? Math.atan2(toAnchor.x - anchor.x, toAnchor.z - anchor.z) : Math.PI / 2;
        const spacing = 2 * r + LAYOUT_GAP + 0.1;
        const sx = Math.sin(dir);
        const sz = Math.cos(dir);
        shared = [];
        for (let i = 0; i < count * 4 + 8; i++) {
          const t = near + i * spacing;
          shared.push({ x: anchor.x + sx * t, z: anchor.z + sz * t, along: dir });
        }
        break;
      }
      case "path": {
        const to = toAnchor!;
        const dir = Math.atan2(to.x - anchor.x, to.z - anchor.z);
        const length = Math.hypot(to.x - anchor.x, to.z - anchor.z);
        const start = anchor.r > 0 ? anchor.r + r + 0.2 : 0;
        const end = Math.max(start, length - (to.r > 0 ? to.r + r + 0.2 : 0));
        const sx = Math.sin(dir);
        const sz = Math.cos(dir);
        // Side offset: objects line the path, they do not block it.
        const side = r + 0.5;
        slots = [];
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? (start + end) / 2 : start + ((end - start) * i) / (count - 1);
          const s = i % 2 === 0 ? 1 : -1;
          const list: Candidate[] = [];
          for (const [dt, ds] of [[0, s], [0, -s], [r, s], [-r, s], [r, -s], [-r, -s], [0, 2 * s], [0, -2 * s]]) {
            list.push({ x: anchor.x + sx * (t + dt) + sz * side * ds, z: anchor.z + sz * (t + dt) - sx * side * ds, along: dir });
          }
          slots.push(list);
        }
        break;
      }
      case "shore": {
        const ix = island!.position.x;
        const iz = island!.position.z;
        const maxR = Math.max(8, (island!.radius ?? 16) * 2);
        const toward = Math.hypot(anchor.x - ix, anchor.z - iz) > 0.5 ? Math.atan2(anchor.x - ix, anchor.z - iz) : theta0;
        const angles: number[] = [];
        for (let k = 0; k <= 72; k++) {
          const da = (k * Math.PI) / 72;
          angles.push(toward + da);
          if (k > 0 && k < 72) angles.push(toward - da);
        }
        angles.sort((a, b) => angleDiff(a, toward) - angleDiff(b, toward));
        shared = [];
        const inset = item.medium === "water" ? [r + 0.3, r * 2 + 0.6] : [-(r + 0.3), -(r * 2 + 0.9)];
        for (const off of inset) {
          for (const angle of angles) {
            const coast = coastDistance(ground, ix, iz, angle, maxR);
            if (coast === null) continue;
            const d = coast + off;
            if (d <= 0) continue;
            // Facing "along" the coast for boats; land objects look out over the water.
            shared.push({ x: ix + Math.sin(angle) * d, z: iz + Math.cos(angle) * d, along: item.medium === "water" ? angle + Math.PI / 2 : angle });
          }
        }
        break;
      }
    }

    const facing: LayoutFacing =
      spec.facing ??
      (pattern === "row" || pattern === "path" || pattern === "shore"
        ? "along"
        : pattern === "scatter" || item.vary || anchor.r === 0
          ? "random"
          : "anchor");

    const yawFor = (c: Candidate) => {
      const toAnchorYaw = Math.atan2(anchor.x - c.x, anchor.z - c.z);
      switch (facing) {
        case "anchor":
          return toAnchorYaw + (pattern === "cluster" ? (rng() - 0.5) * 0.6 : 0);
        case "away":
          return toAnchorYaw + Math.PI;
        case "along":
          return c.along ?? toAnchorYaw;
        default:
          return rng() * TAU;
      }
    };

    let missing = 0;
    /** Rings outward from the anchor, nearest first: the fallback for every pattern. */
    let fallback: Candidate[] | null = null;
    const fallbackList = (): Candidate[] => {
      if (fallback) return fallback;
      fallback = [];
      const step = Math.max(r * 0.8, 0.5);
      // Not farther than this from the anchor: a far place breaks the composition, so the
      // item is skipped instead and the model reports it.
      const reach = Math.max(6, (spec.radius ?? 0) * 1.5, near + 4 * r);
      for (let ring = 0; ring < 40; ring++) {
        const radius = near + ring * step;
        if (radius > reach) break;
        const n = radius === 0 ? 1 : Math.max(8, Math.floor((TAU * radius) / Math.max(r, 0.5)));
        for (let j = 0; j < n; j++) {
          const angle = theta0 + (j / n) * TAU;
          fallback.push({ x: anchor.x + Math.sin(angle) * radius, z: anchor.z + Math.cos(angle) * radius });
        }
      }
      return fallback;
    };
    const tryList = (list: Candidate[], scale: number, overSoft = false): Candidate | null => {
      const rr = r * scale;
      for (const c of list) {
        if (!free(c.x, c.z, rr, overSoft)) continue;
        const y = surface(c.x, c.z, rr, item.medium);
        if (y === null) continue;
        return { ...c, y } as Candidate & { y: number };
      }
      return null;
    };

    for (let i = 0; i < count; i++) {
      const scale = vary ? 0.9 + rng() * 0.2 : 1;
      const list = slots ? slots[i] : shared!;
      // A crowded scene must not fail the build. Order: the pattern's own places; then the
      // nearest free place around the anchor; then the same two over small plants (objects
      // bigger than a plant only). The model then needs no second step to repair a layout.
      const overPlants = r > 0.7;
      const hit = (tryList(list, scale) ??
        tryList(fallbackList(), scale) ??
        (overPlants ? tryList(list, scale, true) ?? tryList(fallbackList(), scale, true) : null)) as (Candidate & { y: number }) | null;
      if (!hit) {
        missing++;
        continue;
      }
      occupied.push({ x: hit.x, z: hit.z, r: r * scale });
      placed.push({
        item: index,
        id: item.id,
        x: hit.x,
        y: hit.y,
        z: hit.z,
        rotationY: yawFor(hit),
        scale,
        seed: Math.floor(rng() * 1e6)
      });
    }
    if (missing > 0) {
      const where = item.medium === "water" ? "water" : hasTerrain ? "land" : "ground";
      skip(`no free ${where} near the anchor for ${missing} of ${count}`);
    }
  });

  return { placed, skipped };
}

// ── Editor glue (browser) ─────────────────────────────────────

const tmp = new THREE.Vector3();

/**
 * Ground height for placement, in world space: the island terrain first, then library places
 * (the desert, the alley arena). Null over water and outside the places; undefined when the
 * scene has neither.
 */
export function sceneGroundAt(): ((x: number, z: number) => number | null) | undefined {
  const island = islandGroundAt();
  if (!hasPlaceGround()) return island;
  return (x, z) => island?.(x, z) ?? placeGroundAt(x, z);
}

/** Ground height of the first island terrain, in world space; null over water; undefined without a terrain. */
export function islandGroundAt(): ((x: number, z: number) => number | null) | undefined {
  const id = terrainNodeIds()[0];
  const terrain = id ? getTerrain(id) : undefined;
  if (!terrain) return undefined;
  return (x, z) => {
    terrain.object.updateWorldMatrix(true, false);
    tmp.set(x, 0, z);
    terrain.object.worldToLocal(tmp);
    const h = terrain.heightAt(tmp.x, tmp.z);
    if (!Number.isFinite(h) || h <= 0.1) return null;
    tmp.y = h;
    terrain.object.localToWorld(tmp);
    return tmp.y;
  };
}

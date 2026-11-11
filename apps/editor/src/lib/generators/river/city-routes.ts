// River routes beside a built city (pure code, unit tested in tests/river-city.test.ts).
//
// A city is axis aligned. Its plan (CitySiteFacts, world meters) gives the street grid
// (streetsRect), the ground slab with its grass verge (groundRect), the streets and the blocks.
// The water of a route never enters streetsRect: no block, sidewalk or street is crossed.
//
// Route kinds:
// - "edge:<side>": a riverfront along one side, just outside the ground slab. The city side is a
//   straight quay line; the river runs on past both corners and meanders once it is clear.
// - "bend:<corner>": the river passes two sides around one corner, with a wide round bend.
// - "outside": a free natural river beside the city at a distance (the ground slab is one
//   obstacle).
// A stream through the park block is not offered: the park is a raised slab with paths from the
// fountain plaza to every side, trees and benches, so a stream would cross paths and sit on top.
//
// Directions: north = -z, south = +z, east = +x, west = -x (the top view of the minimap).
import type { CitySiteFacts, SiteRect } from "../../copilot/director/types";
import {
  catmullRom,
  centerDepth,
  computeRiverPath,
  obstacleReach,
  resampleEven,
  RIVER_MIN_RADIUS_FACTOR,
  RIVER_SAMPLE_STEP,
  RIVER_WIDTH_VARIATION,
  riverRandom,
  samplesOf,
  type P2,
  type RiverObstacle,
  type RiverPool,
  type RiverSample
} from "./path";

export type Side = "north" | "south" | "east" | "west";
export type Corner = "ne" | "se" | "sw" | "nw";

export const SIDES: Side[] = ["north", "east", "south", "west"];
export const CORNERS: Corner[] = ["ne", "se", "sw", "nw"];
/** All route ids a river beside a city can take ("free" = no city route). */
export const CITY_ROUTE_IDS: string[] = [...SIDES.map((s) => `edge:${s}`), ...CORNERS.map((c) => `bend:${c}`), "outside"];

/** Free space between the water and the street grid, meters. */
export const STREET_MARGIN = 0.5;

export type RouteCity = Pick<CitySiteFacts, "streetsRect" | "groundRect" | "streets" | "blocks" | "avenueAxis">;

export type RouteBridge = { x: number; z: number; street: string; avenue: boolean };

export type CityRoute = {
  id: string;
  kind: "edge" | "bend" | "outside";
  label: string;
  hint: string;
  /** City sides the river runs along (empty for "outside"). */
  sides: Side[];
  samples: RiverSample[];
  pool?: RiverPool;
  /** For each sample: the side of the normal n that faces the city (+1 or -1), 0 when no city is beside it. */
  citySide: number[];
  /** Where the bridge goes: in line with the avenue, or with the nearest street. */
  bridge?: RouteBridge;
  /** Meters of the course that run through other obstacles (other sites, scene objects). */
  blocked: number;
  /** Meters of quay along the city. */
  bank: number;
  score: number;
};

export type CityRoutesInput = {
  city: RouteCity;
  width: number;
  meander: number;
  seed: number;
  /** Obstacles outside the city: scene objects and other sites. */
  obstacles: RiverObstacle[];
  anchor?: P2;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth01 = (e0: number, e1: number, v: number) => {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function rectDist(r: SiteRect, x: number, z: number) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
}

/** Smallest distance from the water edge to a rectangle (negative or 0 when the water touches it). */
export function waterClearance(samples: RiverSample[], rect: SiteRect) {
  let min = Infinity;
  for (const p of samples) min = Math.min(min, rectDist(rect, p.x, p.z) - p.hw);
  return min;
}

/** True when the water enters the street grid of the city (or comes closer than the margin). */
export function crossesCity(samples: RiverSample[], city: RouteCity, margin = STREET_MARGIN) {
  return waterClearance(samples, city.streetsRect) < margin;
}

/** True when the straight line from a to b passes over a rectangle grown by margin. */
export function segmentHitsRect(a: P2, b: P2, rect: SiteRect, margin = 0) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (rectDist(rect, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) <= margin) return true;
  }
  return false;
}

/** Length of a course, meters. */
export function courseLength(samples: RiverSample[]) {
  return samples.length > 0 ? samples[samples.length - 1]!.s : 0;
}

/**
 * Why a course is too short or broken to build, or null when it is good. A river shorter than
 * max(10 m, 3 x width) is not built.
 */
export function courseProblem(samples: RiverSample[], width: number): string | null {
  if (samples.length < 2) return "the course has no length";
  if (samples.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.hw))) return "the course is broken (not a number)";
  const length = courseLength(samples);
  const min = Math.max(10, 3 * width);
  if (!(length >= min)) return `the free course is only ${Math.round(length)} m long; a river needs at least ${Math.round(min)} m`;
  return null;
}

/** A rectangle as a ring of circles (for the circle obstacles of the river path). */
export function rectObstacles(rect: SiteRect): RiverObstacle[] {
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  const cell = clamp(Math.min(w, d) / 2, 1, 10);
  const nx = Math.max(1, Math.ceil(w / cell));
  const nz = Math.max(1, Math.ceil(d / cell));
  const cx = w / nx;
  const cz = d / nz;
  const r = Math.hypot(cx, cz) / 2 + 0.05;
  const out: RiverObstacle[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (i !== 0 && j !== 0 && i !== nx - 1 && j !== nz - 1) continue;
      out.push({ x: rect.x0 + (i + 0.5) * cx, z: rect.z0 + (j + 0.5) * cz, r });
    }
  }
  return out;
}

// ── Sides and the plan ────────────────────────────────────────

type SideDef = { side: Side; start: P2; u: P2; o: P2; span: number };

/** Each side runs clockwise (north west to east, east north to south, ...); o points away from the city. */
function sideDef(g: SiteRect, side: Side): SideDef {
  const W = g.x1 - g.x0;
  const D = g.z1 - g.z0;
  if (side === "north") return { side, start: { x: g.x0, z: g.z0 }, u: { x: 1, z: 0 }, o: { x: 0, z: -1 }, span: W };
  if (side === "east") return { side, start: { x: g.x1, z: g.z0 }, u: { x: 0, z: 1 }, o: { x: 1, z: 0 }, span: D };
  if (side === "south") return { side, start: { x: g.x1, z: g.z1 }, u: { x: -1, z: 0 }, o: { x: 0, z: 1 }, span: W };
  return { side, start: { x: g.x0, z: g.z1 }, u: { x: 0, z: -1 }, o: { x: -1, z: 0 }, span: D };
}

/** The two sides of a corner, in flow order (clockwise). */
const CORNER_SIDES: Record<Corner, [Side, Side]> = { ne: ["north", "east"], se: ["east", "south"], sw: ["south", "west"], nw: ["west", "north"] };
const CORNER_NAME: Record<Corner, string> = { ne: "north-east", se: "south-east", sw: "south-west", nw: "north-west" };

/** Streets that end at a side (they run across it), avenue first. */
function streetsEndingAt(city: RouteCity, side: Side) {
  const axis = side === "north" || side === "south" ? "z" : "x";
  return city.streets.filter((s) => s.axis === axis);
}

function parkOnSide(city: RouteCity, side: Side) {
  const park = city.blocks.find((b) => b.kind === "park");
  if (!park || city.blocks.length === 0) return false;
  const eps = 1;
  if (side === "north") return park.rect.z0 <= Math.min(...city.blocks.map((b) => b.rect.z0)) + eps;
  if (side === "south") return park.rect.z1 >= Math.max(...city.blocks.map((b) => b.rect.z1)) - eps;
  if (side === "west") return park.rect.x0 <= Math.min(...city.blocks.map((b) => b.rect.x0)) + eps;
  return park.rect.x1 >= Math.max(...city.blocks.map((b) => b.rect.x1)) - eps;
}

const avenueEndsAt = (city: RouteCity, side: Side) => streetsEndingAt(city, side).some((s) => s.avenue);

// ── Building a course from a base line ────────────────────────

type BasePoint = { p: P2; o: P2; beside: boolean };

/**
 * A course along a base line: the quay part (beside the city) stays on the base line; the parts
 * past the city meander and drift away from it, and are pushed clear of the ground slab and of
 * the obstacles.
 */
function courseFromBase(base: BasePoint[], input: CityRoutesInput, quay: number, salt: number) {
  const { city, width, meander, obstacles } = input;
  const hw = width / 2;
  const rng = riverRandom((input.seed ^ salt) >>> 0);
  const s: number[] = [0];
  for (let i = 1; i < base.length; i++) s.push(s[i - 1]! + Math.hypot(base[i]!.p.x - base[i - 1]!.p.x, base[i]!.p.z - base[i - 1]!.p.z));
  const firstBeside = base.findIndex((b) => b.beside);
  let lastBeside = -1;
  base.forEach((b, i) => {
    if (b.beside) lastBeside = i;
  });
  const calm = 2 + hw;
  const sA = s[firstBeside]! - calm;
  const sB = s[lastBeside]! + calm;
  // Meanders past the city: one sine for each end, limited by the smallest bend radius.
  const rMin = Math.max(RIVER_MIN_RADIUS_FACTOR * width, 3);
  const wave = () => {
    const amp = clamp(meander, 0, 1) * Math.min(2.5 * width + 3, 14) * (0.75 + rng() * 0.5);
    const wish = clamp(28 + rng() * 18, 6 * width, 60);
    const lambda = Math.max(wish, 2 * Math.PI * Math.sqrt(Math.max(amp, 1e-6) * rMin) * 1.1);
    return { amp, lambda, phase: rng() * 0.5, drift: clamp(meander, 0, 1) * (0.06 + rng() * 0.08) };
  };
  const waves = [wave(), wave()];
  const offsetAt = (i: number) => {
    const e = s[i]! < sA ? sA - s[i]! : s[i]! > sB ? s[i]! - sB : 0;
    if (e <= 0) return 0;
    const w = waves[s[i]! < sA ? 0 : 1]!;
    return w.amp * smooth01(0, w.lambda / 2, e) * Math.sin((2 * Math.PI * e) / w.lambda + w.phase) + w.drift * e;
  };
  const free = base.map((_, i) => s[i]! < sA || s[i]! > sB);
  const ls = base.map((_, i) => offsetAt(i));
  const at = (i: number, l: number) => ({ x: base[i]!.p.x + base[i]!.o.x * l, z: base[i]!.p.z + base[i]!.o.z * l });
  const clear = (q: P2) =>
    rectDist(city.groundRect, q.x, q.z) >= quay - 0.05 && obstacles.every((o) => o.soft || Math.hypot(q.x - o.x, q.z - o.z) >= obstacleReach(o, hw, 1.2));
  const push = () => {
    for (let i = 0; i < base.length; i++) {
      if (!free[i] || clear(at(i, ls[i]!))) continue;
      // The smallest move to free ground, outward or inward.
      for (let d = 0.3; d <= 40; d += 0.3) {
        if (clear(at(i, ls[i]! + d))) {
          ls[i] = ls[i]! + d;
          break;
        }
        if (clear(at(i, ls[i]! - d))) {
          ls[i] = ls[i]! - d;
          break;
        }
      }
    }
  };
  for (let iter = 0; iter < 12; iter++) {
    push();
    const copy = ls.slice();
    for (let i = 1; i < ls.length - 1; i++) if (free[i]) ls[i] = copy[i]! + 0.5 * ((copy[i - 1]! + copy[i + 1]!) / 2 - copy[i]!);
  }
  push();
  const control = base.map((_, i) => at(i, ls[i]!));
  const points = resampleEven(catmullRom(control, RIVER_SAMPLE_STEP / 2), RIVER_SAMPLE_STEP);
  return finishSamples(points, input, quay);
}

/** Samples with width and depth: an even width at the quay, natural variation away from the city. */
function finishSamples(points: P2[], input: CityRoutesInput, quay: number) {
  const hw0 = input.width / 2;
  const rng = riverRandom((input.seed ^ 0x3a7e) >>> 0);
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const l1 = 9 + rng() * 6;
  const l2 = 4 + rng() * 2.5;
  const g = input.city.groundRect;
  const awayOf = points.map((q) => smooth01(quay + 1, quay + 8, rectDist(g, q.x, q.z)));
  // The sample s values are about i * step (even spacing).
  const awayAt = (s: number) => awayOf[clamp(Math.round(s / RIVER_SAMPLE_STEP), 0, awayOf.length - 1)]!;
  const variation = (s: number) => 1 + awayAt(s) * RIVER_WIDTH_VARIATION * (0.65 * Math.sin((2 * Math.PI * s) / l1 + p1) + 0.35 * Math.sin((2 * Math.PI * s) / l2 + p2));
  return samplesOf(points, (s) => hw0 * variation(s), (_s, hw) => centerDepth(hw));
}

/** For each sample, the side of n that faces the city when the city is close beside it, else 0. */
export function citySidesOf(samples: RiverSample[], city: RouteCity, reach: number): number[] {
  const g = city.groundRect;
  return samples.map((p) => {
    if (rectDist(g, p.x, p.z) > reach) return 0;
    const cx = clamp(p.x, g.x0, g.x1);
    const cz = clamp(p.z, g.z0, g.z1);
    const dot = (cx - p.x) * p.nx + (cz - p.z) * p.nz;
    return Math.abs(dot) < 1e-6 ? 0 : dot > 0 ? 1 : -1;
  });
}

function blockedMeters(samples: RiverSample[], obstacles: RiverObstacle[]) {
  let n = 0;
  for (const p of samples) if (obstacles.some((o) => !o.soft && Math.hypot(p.x - o.x, p.z - o.z) < o.r + p.hw + 0.3)) n++;
  return n * RIVER_SAMPLE_STEP;
}

/** The bridge spot on a side: in line with the avenue, else with the street nearest the anchor (or the middle). */
function bridgeOn(city: RouteCity, sides: Side[], quayOf: (side: Side, along: number) => P2, anchor?: P2): RouteBridge | undefined {
  for (const side of sides) {
    const avenue = streetsEndingAt(city, side).find((s) => s.avenue);
    if (avenue) {
      const p = quayOf(side, avenue.pos);
      return { ...p, street: avenue.name, avenue: true };
    }
  }
  let best: { b: RouteBridge; d: number } | undefined;
  for (const side of sides) {
    const list = streetsEndingAt(city, side);
    if (list.length === 0) continue;
    const lo = Math.min(...list.map((s) => s.pos));
    const hi = Math.max(...list.map((s) => s.pos));
    // Inner streets first: the perimeter street at a corner is a poor place for a bridge.
    const inner = list.filter((s) => s.pos > lo + 1e-6 && s.pos < hi - 1e-6);
    for (const st of inner.length ? inner : list) {
      const p = quayOf(side, st.pos);
      const mid = (lo + hi) / 2;
      const d = anchor ? Math.hypot(anchor.x - p.x, anchor.z - p.z) : Math.abs(st.pos - mid);
      if (!best || d < best.d) best = { b: { ...p, street: st.name, avenue: false }, d };
    }
  }
  return best?.b;
}

// ── The routes ────────────────────────────────────────────────

/** Meters between the water edge and the ground slab at the quay. */
export const quayGap = (width: number) => 1.2 + 0.1 * width;

function extension(span: number) {
  return clamp(0.25 * span + 12, 20, 45);
}

function edgeRoute(input: CityRoutesInput, side: Side): CityRoute {
  const { city, width } = input;
  const hw = width / 2;
  const quay = quayGap(width) + hw;
  const def = sideDef(city.groundRect, side);
  const ext = extension(def.span);
  const base: BasePoint[] = [];
  const n = Math.ceil(def.span + 2 * ext);
  for (let k = 0; k <= n; k++) {
    const t = -ext + ((def.span + 2 * ext) * k) / n;
    base.push({ p: { x: def.start.x + def.u.x * t + def.o.x * quay, z: def.start.z + def.u.z * t + def.o.z * quay }, o: def.o, beside: t >= 0 && t <= def.span });
  }
  const samples = courseFromBase(base, input, quay, 0x1e00 + SIDES.indexOf(side));
  const quayOf = (_s: Side, along: number): P2 =>
    def.u.x !== 0 ? { x: along, z: def.start.z + def.o.z * quay } : { x: def.start.x + def.o.x * quay, z: along };
  const bridge = bridgeOn(city, [side], quayOf, input.anchor);
  return {
    id: `edge:${side}`,
    kind: "edge",
    label: `Along the ${side} edge`,
    hint: routeHint(city, [side], bridge),
    sides: [side],
    samples,
    citySide: citySidesOf(samples, city, quay + 2),
    bridge,
    blocked: blockedMeters(samples, input.obstacles),
    bank: def.span,
    score: 0
  };
}

function bendRoute(input: CityRoutesInput, corner: Corner): CityRoute {
  const { city, width } = input;
  const hw = width / 2;
  const rMin = Math.max(RIVER_MIN_RADIUS_FACTOR * width, 3);
  // The bend turns around the slab corner; its radius is the quay distance on both sides.
  const R = Math.max(quayGap(width) + hw, 1.5 * rMin, 10);
  const [s1, s2] = CORNER_SIDES[corner];
  const a = sideDef(city.groundRect, s1);
  const b = sideDef(city.groundRect, s2);
  const ext1 = extension(a.span);
  const ext2 = extension(b.span);
  const base: BasePoint[] = [];
  const n1 = Math.ceil(a.span + ext1);
  for (let k = 0; k < n1; k++) {
    const t = -ext1 + ((a.span + ext1) * k) / n1;
    base.push({ p: { x: a.start.x + a.u.x * t + a.o.x * R, z: a.start.z + a.u.z * t + a.o.z * R }, o: a.o, beside: t >= 0 });
  }
  const K = { x: a.start.x + a.u.x * a.span, z: a.start.z + a.u.z * a.span };
  const na = Math.max(4, Math.ceil((Math.PI * R) / 2));
  for (let k = 0; k < na; k++) {
    const phi = ((k / na) * Math.PI) / 2;
    const o = { x: a.o.x * Math.cos(phi) + b.o.x * Math.sin(phi), z: a.o.z * Math.cos(phi) + b.o.z * Math.sin(phi) };
    base.push({ p: { x: K.x + o.x * R, z: K.z + o.z * R }, o, beside: true });
  }
  const n2 = Math.ceil(b.span + ext2);
  for (let k = 0; k <= n2; k++) {
    const t = ((b.span + ext2) * k) / n2;
    base.push({ p: { x: b.start.x + b.u.x * t + b.o.x * R, z: b.start.z + b.u.z * t + b.o.z * R }, o: b.o, beside: t <= b.span });
  }
  const samples = courseFromBase(base, input, quayGap(width) + hw, 0x2b00 + CORNERS.indexOf(corner));
  const quayOf = (side: Side, along: number): P2 => {
    const d = side === s1 ? a : b;
    return d.u.x !== 0 ? { x: along, z: d.start.z + d.o.z * R } : { x: d.start.x + d.o.x * R, z: along };
  };
  const bridge = bridgeOn(city, [s1, s2], quayOf, input.anchor);
  return {
    id: `bend:${corner}`,
    kind: "bend",
    label: `Around the ${CORNER_NAME[corner]} corner`,
    hint: routeHint(city, [s1, s2], bridge),
    sides: [s1, s2],
    samples,
    citySide: citySidesOf(samples, city, R + 2),
    bridge,
    blocked: blockedMeters(samples, input.obstacles),
    bank: a.span + b.span,
    score: 0
  };
}

function outsideRoute(input: CityRoutesInput): CityRoute | null {
  const { city, width } = input;
  const hw = width / 2;
  const g = city.groundRect;
  const rng = riverRandom((input.seed ^ 0x0c75) >>> 0);
  // The side with the most free room (fewest obstacles near a straight line there).
  let best: { from: P2; to: P2; cost: number; side: Side } | null = null;
  for (const side of SIDES) {
    const def = sideDef(g, side);
    const dist = hw + 12 + 0.12 * def.span;
    const ext = extension(def.span);
    const from = { x: def.start.x - def.u.x * ext + def.o.x * dist, z: def.start.z - def.u.z * ext + def.o.z * dist };
    const to = { x: def.start.x + def.u.x * (def.span + ext) + def.o.x * dist, z: def.start.z + def.u.z * (def.span + ext) + def.o.z * dist };
    let cost = rng() * 0.5;
    const n = Math.ceil((def.span + 2 * ext) / 2);
    for (let k = 0; k <= n; k++) {
      const x = from.x + ((to.x - from.x) * k) / n;
      const z = from.z + ((to.z - from.z) * k) / n;
      if (input.obstacles.some((o) => !o.soft && Math.hypot(x - o.x, z - o.z) < obstacleReach(o, hw, 1.2))) cost += 2;
    }
    if (!best || cost < best.cost) best = { from, to, cost, side };
  }
  if (!best) return null;
  const obstacles = [...input.obstacles, ...rectObstacles(g)];
  const path = computeRiverPath({ from: best.from, to: best.to, width, meander: Math.max(input.meander, 0.6), seed: input.seed, obstacles });
  if (crossesCity(path.samples, city)) return null;
  return {
    id: "outside",
    kind: "outside",
    label: "Free river beside the city",
    hint: `natural bends off the ${best.side} side`,
    sides: [],
    samples: path.samples,
    pool: path.pool,
    citySide: path.samples.map(() => 0),
    blocked: blockedMeters(path.samples, input.obstacles),
    bank: 0,
    score: 0
  };
}

function routeHint(city: RouteCity, sides: Side[], bridge?: RouteBridge) {
  const parts: string[] = [];
  if (sides.some((s) => parkOnSide(city, s))) parts.push("riverfront beside the park");
  if (bridge?.avenue) parts.push("bridge at the avenue");
  else if (bridge) parts.push(`bridge at ${bridge.street}`);
  return parts.join(", ") || "quiet riverfront";
}

/**
 * All routes beside a city, best first. Ranking: free of other obstacles first; then the side
 * next to the park or facing the end of the avenue; then the longer bank. A route whose water
 * would enter the street grid is left out.
 */
export function cityRoutes(input: CityRoutesInput): CityRoute[] {
  const { city } = input;
  const routes: CityRoute[] = [...SIDES.map((s) => edgeRoute(input, s)), ...CORNERS.map((c) => bendRoute(input, c))];
  const outside = outsideRoute(input);
  if (outside) routes.push(outside);
  const valid = routes.filter((r) => r.samples.length > 1 && !crossesCity(r.samples, city));
  for (const r of valid) {
    const park = r.sides.some((s) => parkOnSide(city, s));
    const avenue = r.sides.some((s) => avenueEndsAt(city, s));
    let score = r.blocked * 10 - (park ? 30 : 0) - (avenue ? 20 : 0) - Math.min(r.bank, 150) * 0.05;
    if (r.kind === "bend") score += 18;
    if (r.kind === "outside") score += 35;
    if (input.anchor) {
      let d = Infinity;
      for (const p of r.samples) d = Math.min(d, Math.hypot(p.x - input.anchor.x, p.z - input.anchor.z));
      score += d * 0.05;
    }
    r.score = score;
  }
  return valid.sort((a, b) => a.score - b.score || CITY_ROUTE_IDS.indexOf(a.id) - CITY_ROUTE_IDS.indexOf(b.id));
}

/** The best routes for the popup: the top ones, with the free "outside" river always among them. */
export function routeChoices(routes: CityRoute[], count = 4): CityRoute[] {
  const top = routes.slice(0, count);
  const outside = routes.find((r) => r.kind === "outside");
  if (outside && !top.includes(outside) && top.length >= count) top[count - 1] = outside;
  return top;
}

/** The route nearest to the points the director asked for. */
export function nearestRoute(routes: CityRoute[], points: P2[]): CityRoute | undefined {
  let best: { r: CityRoute; d: number } | undefined;
  for (const r of routes) {
    let d = 0;
    for (const q of points) {
      let m = Infinity;
      for (const p of r.samples) m = Math.min(m, Math.hypot(p.x - q.x, p.z - q.z));
      d += m;
    }
    d += r.blocked * 10;
    if (!best || d < best.d) best = { r, d };
  }
  return best?.r;
}

/** A route id from loose words: "north" -> "edge:north", "bend:northeast" -> "bend:ne". Null when unknown. */
export function normalizeRouteId(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (t === "free" || t === "outside" || t === "park") return t;
  const corner = (w: string): Corner | null => {
    const c = w.replace(/-/g, "");
    const map: Record<string, Corner> = { ne: "ne", northeast: "ne", en: "ne", se: "se", southeast: "se", es: "se", sw: "sw", southwest: "sw", ws: "sw", nw: "nw", northwest: "nw", wn: "nw" };
    return map[c] ?? null;
  };
  const m = /^(edge|bend|side|corner)?:?-?(.+)$/.exec(t);
  if (!m) return null;
  const kind = m[1];
  const rest = m[2]!.replace(/-?(edge|side|corner)$/, "");
  if (kind !== "bend" && kind !== "corner" && (SIDES as string[]).includes(rest)) return `edge:${rest}`;
  const c = corner(rest);
  if (c && kind !== "edge" && kind !== "side") return `bend:${c}`;
  return null;
}

/** Words for a route in a sentence: "along the north edge of the city". */
export function routeWords(id: string): string {
  if (id.startsWith("edge:")) return `along the ${id.slice(5)} edge of the city`;
  if (id.startsWith("bend:")) return `around the ${CORNER_NAME[id.slice(5) as Corner] ?? id.slice(5)} corner of the city`;
  if (id === "outside") return "beside the city";
  return "";
}

/** A center line with 20 points or fewer (for the site record and the minimap). */
export function thinLine(samples: { x: number; z: number }[], max = 20): [number, number][] {
  if (samples.length <= max) return samples.map((p) => [round1(p.x), round1(p.z)]);
  const out: [number, number][] = [];
  for (let k = 0; k < max; k++) {
    const p = samples[Math.round((k * (samples.length - 1)) / (max - 1))]!;
    out.push([round1(p.x), round1(p.z)]);
  }
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

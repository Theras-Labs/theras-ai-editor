// City planner (pure, deterministic by seed, unit tested in tests/city.test.ts).
// Input: validated CityParams. Output: a CityPlan in city meters, origin at the city center,
// y = 0 at the street level. The generator (copilot/director/generators/city.ts) turns the plan
// into library nodes; roads.ts draws the streets and the ground from the plan's params.
//
// The plan, as an urban designer would draw it:
// - A regular street grid with a perimeter street, so every block has four streets and no road
//   ends in nothing. One main avenue (two carriageways, a tree-lined median, parking lanes and
//   wide sidewalks) runs through the middle; side streets have two lanes.
// - Blocks are sized from the measured building footprints: two rows of buildings back to back.
//   Buildings stand on the block edges, front facade to their street, with one setback.
//   Corner lots get corner buildings (two facades) or a taller building.
// - Zoning: a downtown core at the center on the main avenue holds the towers. Mid-rise
//   commercial blocks ring the core, low-rise blocks with small shops stand at the edge, so the
//   heights fall from the core to the edge (a skyline). A park sits next to the core; from 16
//   blocks up a plaza is the second open space. Industry appears only in kit "industrial" (all
//   lots) or "mixed" (one compact district at the edge, far from the park, never next to the core).
// - Street trees of one species at even spacing on the sidewalks, never in front of a door or a
//   lamp; lamps on intersection corners and mid-block; a park block with paths, a fountain,
//   benches and trees.
import { BUILDING_MODELS, BUILDING_NODE_SCALE, detailSize, type BuildingModel, type Zone } from "./footprints";
import { CURB_Y, LAMP_ENTRY_ID, PARK_BENCH_ID, PARK_FOUNTAIN_ID } from "./ids";
import type { CityParams } from "./params";

// ── Types ─────────────────────────────────────────────────────

export type Axis = "x" | "z";
export type Rect = { x0: number; z0: number; x1: number; z1: number };

export type StreetCrossing = {
  /** World coordinate along the street axis of the crossing street's center line. */
  at: number;
  /** Width of the crossing street: right of way (curb to curb plus sidewalks) and carriageway. */
  row: number;
  carriage: number;
  /** This street draws the intersection (asphalt, corner sidewalks). */
  owned: boolean;
  /** Which of the four arms exist: back/ahead along this street, minus/plus across (world). */
  arms: { back: boolean; ahead: boolean; minus: boolean; plus: boolean };
};

export type CityStreet = {
  id: number;
  name: string;
  /** World axis the street runs along. */
  axis: Axis;
  /** Grid line index. */
  line: number;
  /** World coordinate of the center line across the axis. */
  pos: number;
  /** Extent along the axis (outer edges of the end intersections). */
  from: number;
  to: number;
  avenue: boolean;
  /** Curb to curb (median included). */
  carriage: number;
  sidewalk: number;
  median: number;
  /** Parking lane width on each side (0 = none). */
  parking: number;
  crossings: StreetCrossing[];
};

/** Land use of a block. The minimap colors blocks by these words. */
export type BlockZone = "downtown" | "commercial" | "low-rise" | "industrial" | "park";
export type BlockKind = "lot" | "park" | "plaza";

export type CityBlock = { i: number; j: number; lot: Rect; kind: BlockKind; zone: BlockZone };

/** Model set (kit) of the buildings of a zone. */
export function zoneSet(zone: BlockZone): Zone {
  return zone === "industrial" ? "industrial" : "commercial";
}

export type Facing = "-z" | "+z" | "-x" | "+x";

export type CityBuilding = {
  id: string;
  zone: Zone;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Measured footprint in world (axis aligned after rotation). */
  rect: Rect;
  facing: Facing;
  /** Street the front faces. */
  street: number;
  block: [number, number];
  corner: boolean;
  /** Second facade faces the side street. */
  cornerFacade: boolean;
  height: number;
  /** Middle of the front facade (the door side). */
  door: { x: number; z: number };
};

export type PropKind = "tree" | "lamp" | "bench" | "fountain" | "detail";

export type CityProp = {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Footprint radius in meters (for spacing checks). */
  radius: number;
  /** Footprint rectangle for boxy details (containers, tanks). */
  rect?: Rect;
  params?: Record<string, unknown>;
  street?: number;
};

export type CityPlan = {
  params: CityParams;
  cols: number;
  rows: number;
  avenueAxis: Axis;
  streets: CityStreet[];
  blocks: CityBlock[];
  buildings: CityBuilding[];
  trees: CityProp[];
  lamps: CityProp[];
  /** Street and yard details (parasols, tanks, containers). */
  details: CityProp[];
  /** Park furniture (fountain, benches) and park trees. */
  park: CityProp[];
  /** Outer edge of the street grid. */
  streetsRect: Rect;
  /** Outer edge of the ground slab (grass verge included). */
  groundRect: Rect;
  /** Open spaces (parks and plazas) with their round center plaza, for the ground mesh. */
  greens: { rect: Rect; kind: "park" | "plaza"; plaza: { x: number; z: number; r: number } }[];
  notes: string[];
};

// ── Dimensions (meters) ───────────────────────────────────────

export const SIDE_STREET = { carriage: 7, sidewalk: 3, median: 0, parking: 0 };
export const AVENUE = { carriage: 2 * (3.5 + 2.4) + 3, sidewalk: 4.5, median: 3, parking: 2.4 };
/** Facade line distance from the sidewalk edge. */
export const SETBACK = 0.6;
/** Gap between two buildings on one frontage. */
export const BUILDING_GAP = 0.8;
/** Gap between the back walls of two rows. */
export const BACK_GAP = 1.2;
/** Grass verge around the city. */
export const VERGE = 6;
/** Distance kept from an intersection edge (crosswalk and stop line). */
const CROSSWALK_CLEAR = 5;

/** Street tree scale and footprint radius at that scale, by library id (canopy about 4 to 5 m). */
const TREE_FORM: Record<string, { scale: number; radius: number }> = {
  // Base trees (nature/folio-trees.ts): 8 to 9 m tall at scale 1, so about 6.5 m on a street.
  "nature:tree:oak-round": { scale: 0.8, radius: 1.9 },
  "nature:tree:oak-golden": { scale: 0.8, radius: 1.9 },
  "nature:tree:maple-autumn": { scale: 0.8, radius: 1.9 },
  "nature:tree:birch": { scale: 0.72, radius: 1.8 },
  "nature:tree:birch-autumn": { scale: 0.72, radius: 1.8 },
  "nature:tree:cherry-blossom": { scale: 0.8, radius: 2.4 },
  "nature:tree:fir": { scale: 0.85, radius: 1.3 },
  "nature:tree:painted-oak": { scale: 0.75, radius: 2.4 },
  "nature:tree:painted-birch": { scale: 1, radius: 1.7 },
  "nature:tree:pine-tiered": { scale: 0.9, radius: 1.6 },
  "nature:tree:palm": { scale: 1, radius: 2.2 },
  "lh:plant:oak": { scale: 1.5, radius: 2 },
  "lh:plant:birch": { scale: 1.5, radius: 1.4 },
  "lh:plant:cherry": { scale: 1.8, radius: 2.1 },
  "lh:plant:apple": { scale: 1.8, radius: 2 },
  "lh:plant:pine": { scale: 1.5, radius: 1.4 },
  "lh:plant:willow": { scale: 1.6, radius: 2.2 }
};
export function treeForm(id: string) {
  return TREE_FORM[id] ?? { scale: 1, radius: 2 };
}

// ── Helpers ───────────────────────────────────────────────────

/** Seeded generator (mulberry32). */
export function cityRandom(seed: number) {
  let a = (seed >>> 0) + 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rectsOverlap(a: Rect, b: Rect, sep = 0) {
  return a.x0 < b.x1 + sep && b.x0 < a.x1 + sep && a.z0 < b.z1 + sep && b.z0 < a.z1 + sep;
}

/** rotationY that turns the local -z (the front of kit models and lamps) toward (dx, dz). */
export function yawFacing(dx: number, dz: number) {
  return Math.atan2(-dx, -dz);
}

const FACING_DIR: Record<Facing, [number, number]> = { "-z": [0, -1], "+z": [0, 1], "-x": [-1, 0], "+x": [1, 0] };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

function quantile(values: number[], q: number) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

// ── Planner ───────────────────────────────────────────────────

type Edge = {
  side: "N" | "S" | "W" | "E";
  along: Axis;
  lo: number;
  hi: number;
  /** Lot edge coordinate (the facade side). */
  line: number;
  /** +1 when the block interior lies toward larger coordinates. */
  inward: 1 | -1;
  facing: Facing;
  rot: number;
  street: CityStreet;
  /** Lot size across this edge (for the depth limit). */
  across: number;
};

export function planCity(params: CityParams): CityPlan {
  const rand = cityRandom(params.seed);
  const { cols, rows } = params;
  const notes: string[] = [];

  // Model sets in use and block size from the measured footprints. Mixed has an industrial
  // district only from 3 x 3 blocks up (see zoneBlocks).
  const industryAllowed = params.kit === "mixed" && cols >= 3 && rows >= 3;
  const zonesUsed: Zone[] = params.kit === "industrial" ? ["industrial"] : industryAllowed ? ["commercial", "industrial"] : ["commercial"];
  const models = zonesUsed.flatMap((z) => BUILDING_MODELS[z]);
  // Deep enough for the towers of the downtown core (skyscrapers are about 11 m deep).
  const towerDepth = zonesUsed.includes("commercial") ? Math.max(0, ...BUILDING_MODELS.commercial.filter((m) => m.units >= 2.8).map((m) => m.d)) : 0;
  const depthP = Math.max(quantile(models.map((m) => m.d), 0.7), towerDepth);
  const lotDepth = round2(2 * (SETBACK + depthP) + BACK_GAP);
  const lotLen = Math.round(lotDepth * 1.7);

  // The avenue runs through the middle: along the axis whose block count is even (a center line
  // exists), else the longer axis; z when both are equal.
  const evenX = cols % 2 === 0;
  const evenZ = rows % 2 === 0;
  let avenueAxis: Axis;
  if (evenX !== evenZ) avenueAxis = evenX ? "z" : "x";
  else avenueAxis = rows > cols ? "z" : cols > rows ? "x" : "z";
  // A z-avenue is one of the cols + 1 vertical lines; an x-avenue one of the rows + 1 lines.
  const lineCount = avenueAxis === "z" ? cols : rows;
  const avenueLine = lineCount % 2 === 0 ? lineCount / 2 : Math.floor(lineCount / 2) + (rand() < 0.5 ? 0 : 1);

  // Blocks: the long side runs along the avenue.
  const blockX = avenueAxis === "z" ? lotDepth : lotLen;
  const blockZ = avenueAxis === "z" ? lotLen : lotDepth;

  const spec = (axis: Axis, line: number) => (axis === avenueAxis && line === avenueLine ? AVENUE : SIDE_STREET);
  const rowOf = (s: { carriage: number; sidewalk: number }) => s.carriage + 2 * s.sidewalk;

  // Line positions: z-streets (axis "z") at x positions, x-streets at z positions.
  const linePositions = (count: number, axis: Axis, block: number) => {
    const pos: number[] = [];
    let cursor = 0;
    for (let k = 0; k <= count; k++) {
      const row = rowOf(spec(axis, k));
      pos.push(cursor + row / 2);
      cursor += row + (k < count ? block : 0);
    }
    const offset = cursor / 2;
    return { pos: pos.map((p) => p - offset), total: cursor };
  };
  const xs = linePositions(cols, "z", blockX); // centers of z-streets
  const zs = linePositions(rows, "x", blockZ); // centers of x-streets
  const streetsRect: Rect = { x0: -xs.total / 2, x1: xs.total / 2, z0: -zs.total / 2, z1: zs.total / 2 };

  // Streets.
  const owner = (axis: Axis, line: number, crossLine: number) => {
    const crossAxis: Axis = axis === "x" ? "z" : "x";
    if (axis === avenueAxis && line === avenueLine) return true;
    if (crossAxis === avenueAxis && crossLine === avenueLine) return false;
    return axis === "x";
  };
  const streets: CityStreet[] = [];
  let sideNo = 1;
  const make = (axis: Axis, line: number, pos: number, maxLine: number, crossPos: number[], crossAxis: Axis): CityStreet => {
    const s = spec(axis, line);
    const avenue = s === AVENUE;
    const crossings: StreetCrossing[] = crossPos.map((at, k) => {
      const cs = spec(crossAxis, k);
      return {
        at,
        row: rowOf(cs),
        carriage: cs.carriage,
        owned: owner(axis, line, k),
        arms: { back: k > 0, ahead: k < crossPos.length - 1, minus: line > 0, plus: line < maxLine }
      };
    });
    const first = crossings[0];
    const last = crossings[crossings.length - 1];
    return {
      id: streets.length,
      name: avenue ? "Main avenue" : `Street ${sideNo++}`,
      axis,
      line,
      pos,
      from: first.at - first.row / 2,
      to: last.at + last.row / 2,
      avenue,
      carriage: s.carriage,
      sidewalk: s.sidewalk,
      median: s.median,
      parking: s.parking,
      crossings
    };
  };
  // Avenue first, so it is built first.
  const order: { axis: Axis; line: number }[] = [];
  order.push({ axis: avenueAxis, line: avenueLine });
  for (let k = 0; k <= rows; k++) if (!(avenueAxis === "x" && k === avenueLine)) order.push({ axis: "x", line: k });
  for (let k = 0; k <= cols; k++) if (!(avenueAxis === "z" && k === avenueLine)) order.push({ axis: "z", line: k });
  for (const o of order) {
    streets.push(o.axis === "x" ? make("x", o.line, zs.pos[o.line], rows, xs.pos, "z") : make("z", o.line, xs.pos[o.line], cols, zs.pos, "x"));
  }
  const streetAt = (axis: Axis, line: number) => streets.find((s) => s.axis === axis && s.line === line)!;
  const avenue = streetAt(avenueAxis, avenueLine);

  // Centrality 0..1: near the city center and the avenue.
  const half = Math.hypot(streetsRect.x1, streetsRect.z1);
  const acrossHalf = avenueAxis === "z" ? streetsRect.x1 : streetsRect.z1;
  const centrality = (x: number, z: number) => {
    const dc = Math.hypot(x, z) / half;
    const da = Math.abs((avenueAxis === "z" ? x : z) - avenue.pos) / acrossHalf;
    return clamp01(1 - 0.55 * dc - 0.45 * da);
  };

  // Blocks, zones and the park.
  const blocks: CityBlock[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const sx = streetAt("z", i);
      const ex = streetAt("z", i + 1);
      const sz = streetAt("x", j);
      const ez = streetAt("x", j + 1);
      const lot: Rect = {
        x0: round2(sx.pos + rowOf(sx) / 2),
        x1: round2(ex.pos - rowOf(ex) / 2),
        z0: round2(sz.pos + rowOf(sz) / 2),
        z1: round2(ez.pos - rowOf(ez) / 2)
      };
      blocks.push({ i, j, lot, kind: "lot", zone: params.kit === "industrial" ? "industrial" : "commercial" });
    }
  const lean = { x: rand() * 2 - 1, z: rand() * 2 - 1 };
  const center = (b: CityBlock) => ({ x: (b.lot.x0 + b.lot.x1) / 2, z: (b.lot.z0 + b.lot.z1) / 2 });
  // Block rank: centrality, with a small seeded lean so ties break the same way for one seed.
  const blockScore = (b: CityBlock) => {
    const c = center(b);
    return centrality(c.x, c.z) - (0.02 * (c.x * lean.x + c.z * lean.z)) / half;
  };
  zoneBlocks(blocks, params, blockScore, center, notes);
  const scores = blocks.map((b) => centrality(center(b).x, center(b).z));
  const cMin = Math.min(...scores);
  const cMax = Math.max(...scores);
  // Tallest tower (kit units) grows with the grid: a neighborhood has a mid-rise center, a
  // metropolis a real skyline.
  const towerTop = Math.min(5.5, 2.5 + 0.75 * (Math.max(cols, rows) - 1));

  // ── Buildings ──
  const buildings: CityBuilding[] = [];
  const details: CityProp[] = [];
  const pocketTrees: { x: number; z: number }[] = [];
  const density = params.density;
  const fill = 0.6 + 0.4 * density;
  // City-wide use of each model, so neighbouring blocks do not repeat one another.
  const usedInCity = new Map<string, number>();

  const blockOrder = [...blocks].sort((a, b) => {
    const ca = center(a);
    const cb = center(b);
    return Math.hypot(ca.x, ca.z) - Math.hypot(cb.x, cb.z) || a.j - b.j || a.i - b.i;
  });

  for (const block of blockOrder) {
    if (block.kind !== "lot") continue;
    const { lot } = block;
    const lw = lot.x1 - lot.x0;
    const ld = lot.z1 - lot.z0;
    const edges: Record<Edge["side"], Edge> = {
      N: { side: "N", along: "x", lo: lot.x0, hi: lot.x1, line: lot.z0, inward: 1, facing: "-z", rot: 0, street: streetAt("x", block.j), across: ld },
      S: { side: "S", along: "x", lo: lot.x0, hi: lot.x1, line: lot.z1, inward: -1, facing: "+z", rot: Math.PI, street: streetAt("x", block.j + 1), across: ld },
      W: { side: "W", along: "z", lo: lot.z0, hi: lot.z1, line: lot.x0, inward: 1, facing: "-x", rot: Math.PI / 2, street: streetAt("z", block.i), across: lw },
      E: { side: "E", along: "z", lo: lot.z0, hi: lot.z1, line: lot.x1, inward: -1, facing: "+x", rot: -Math.PI / 2, street: streetAt("z", block.i + 1), across: lw }
    };
    const setModels = BUILDING_MODELS[zoneSet(block.zone)];
    const zoneModels = zonePool(block.zone);
    const minW = Math.min(...zoneModels.map((m) => m.w));
    const placed: CityBuilding[] = [];
    const yards: Rect[] = [];
    const used = new Map<string, number>();

    const rectFor = (e: Edge, a0: number, w: number, d: number): Rect => {
      const f0 = e.line + e.inward * SETBACK;
      const f1 = e.line + e.inward * (SETBACK + d);
      const [c0, c1] = [Math.min(f0, f1), Math.max(f0, f1)];
      return e.along === "x" ? { x0: a0, x1: a0 + w, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: a0, z1: a0 + w };
    };
    const free = (r: Rect, sep: number) => !placed.some((b) => rectsOverlap(r, b.rect, sep)) && !yards.some((y) => rectsOverlap(r, y, sep));
    const edgeRank = (e: Edge) => (e.street.avenue ? 0 : e.hi - e.lo >= e.across ? 1 : 2);

    const pickModel = (e: Edge, cx: number, cz: number, fits: (m: BuildingModel) => boolean, corner: boolean, prefer?: (m: BuildingModel) => number) => {
      const t = centrality(cx, cz);
      const tn = clamp01((t - cMin) / (cMax - cMin || 1));
      let target: number;
      if (block.zone === "industrial") {
        const maxU = Math.max(...zoneModels.map((m) => m.units));
        const minU = Math.min(...zoneModels.map((m) => m.units));
        target = minU + (maxU - minU) * t * (0.4 + 0.6 * density);
      } else {
        // Height band of the zone in kit units; inside the band, taller toward the core.
        const [lo, hi] = block.zone === "downtown" ? [2.2, towerTop] : block.zone === "commercial" ? [1.29, 2.4] : [0.89, 1.4];
        const span = (hi - lo) * (block.zone === "downtown" ? 0.55 + 0.45 * density : 0.7 + 0.3 * density);
        target = lo + span * Math.pow(tn, block.zone === "downtown" ? 1.3 : 1);
      }
      target += (corner ? 0.35 : 0) + (e.street.avenue ? 0.25 : 0);
      // The size of the city caps its towers.
      if (block.zone === "downtown") target = Math.min(target, towerTop);
      // The zone's own models first; when none fits the gap, any model of the kit (the score
      // still keeps the height near the target).
      const fitting = zoneModels.filter(fits);
      const scored = (fitting.length ? fitting : setModels.filter(fits))
        .map((m) => ({ m, s: Math.abs(m.units - target) + 0.45 * rand() + 0.5 * (used.get(m.id) ?? 0) + 0.12 * (usedInCity.get(m.id) ?? 0) + (prefer?.(m) ?? 0) }))
        .sort((a, b) => a.s - b.s);
      return scored.map((x) => x.m);
    };

    const place = (e: Edge, m: BuildingModel, r: Rect, corner: boolean, cornerFacade: boolean) => {
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const [fx, fz] = FACING_DIR[e.facing];
      const b: CityBuilding = {
        id: m.id,
        zone: m.zone,
        x: round2(cx),
        z: round2(cz),
        rotationY: e.rot,
        scale: BUILDING_NODE_SCALE,
        rect: r,
        facing: e.facing,
        street: e.street.id,
        block: [block.i, block.j],
        corner,
        cornerFacade,
        height: m.h,
        door: { x: round2(cx + (fx * (r.x1 - r.x0)) / 2), z: round2(cz + (fz * (r.z1 - r.z0)) / 2) }
      };
      placed.push(b);
      used.set(m.id, (used.get(m.id) ?? 0) + 1);
      usedInCity.set(m.id, (usedInCity.get(m.id) ?? 0) + 1);
      return b;
    };

    // Corners: the front faces the primary street (avenue, else the long side).
    const cornerPairs: [Edge, Edge][] = [
      [edges.N, edges.W],
      [edges.N, edges.E],
      [edges.S, edges.W],
      [edges.S, edges.E]
    ];
    for (const [a, b] of cornerPairs) {
      const [p, s] = edgeRank(a) <= edgeRank(b) ? [a, b] : [b, a];
      const atLo = s.line === p.lo;
      const maxW = (p.hi - p.lo) / 2 - SETBACK - BUILDING_GAP / 2;
      const maxD = (s.hi - s.lo) / 2 - SETBACK - BUILDING_GAP / 2;
      const maxDepthAcross = p.across - 2 * SETBACK - BACK_GAP / 2;
      // Does the model's second facade face the side street at this rotation?
      const sideOk = (m: BuildingModel) => {
        if (!m.side) return false;
        const sign = m.side === "-x" ? -1 : 1;
        const dx = sign * Math.cos(p.rot);
        const dz = -sign * Math.sin(p.rot);
        const [sx, sz] = FACING_DIR[s.facing];
        return Math.abs(dx - sx) < 1e-6 && Math.abs(dz - sz) < 1e-6;
      };
      const probe = rectFor(p, atLo ? p.lo + SETBACK : p.hi - SETBACK - 1, 1, 1);
      const list = pickModel(p, probe.x0, probe.z0, (m) => m.w <= maxW && m.d <= Math.min(maxD, maxDepthAcross), true, (m) => (sideOk(m) ? -0.6 : 0));
      for (const m of list) {
        const a0 = atLo ? p.lo + SETBACK : p.hi - SETBACK - m.w;
        const r = rectFor(p, a0, m.w, m.d);
        if (!free(r, BUILDING_GAP * 0.75)) continue;
        place(p, m, r, true, sideOk(m));
        break;
      }
    }

    // Frontages between the corners, the most important edge first.
    const edgeList = Object.values(edges).sort((a, b) => edgeRank(a) - edgeRank(b));
    for (const e of edgeList) {
      const span = (r: Rect) => (e.along === "x" ? [r.x0, r.x1] : [r.z0, r.z1]);
      const touching = placed.filter((b) => {
        // Corner buildings on this edge: their rect touches this edge's setback line.
        const f = e.line + e.inward * SETBACK;
        return e.along === "x" ? Math.abs((e.inward > 0 ? b.rect.z0 : b.rect.z1) - f) < 1e-6 : Math.abs((e.inward > 0 ? b.rect.x0 : b.rect.x1) - f) < 1e-6;
      });
      const loEnd = Math.max(e.lo + SETBACK - BUILDING_GAP, ...touching.filter((b) => span(b.rect)[0] - e.lo < (e.hi - e.lo) / 2).map((b) => span(b.rect)[1]));
      const hiEnd = Math.min(e.hi - SETBACK + BUILDING_GAP, ...touching.filter((b) => span(b.rect)[0] - e.lo >= (e.hi - e.lo) / 2).map((b) => span(b.rect)[0]));
      const start = loEnd + BUILDING_GAP;
      const end = hiEnd - BUILDING_GAP;
      const maxD = e.across / 2 - SETBACK - BACK_GAP / 2;
      const row: { m: BuildingModel; a0: number }[] = [];
      const rowYards: { a0: number; w: number }[] = [];
      let cursor = start;
      let lastYard = false;
      let guard = 0;
      while (end - cursor >= minW && guard++ < 40) {
        const remaining = end - cursor;
        if (!lastYard && row.length > 0 && rand() > fill && remaining > minW * 2) {
          const w = Math.min(remaining - minW - BUILDING_GAP, 9 + rand() * 4);
          rowYards.push({ a0: cursor, w });
          cursor += w + BUILDING_GAP;
          lastYard = true;
          continue;
        }
        lastYard = false;
        const mid = cursor + remaining / 2;
        const probe = rectFor(e, mid, 1, 1);
        const list = pickModel(e, probe.x0, probe.z0, (m) => m.w <= remaining && m.d <= maxD, false, (m) => {
          const left = remaining - m.w - BUILDING_GAP;
          const prev = row[row.length - 1];
          return (left > 0.5 && left < minW ? 0.5 : 0) + (prev?.m.id === m.id ? 0.8 : 0);
        });
        let ok = false;
        for (const m of list) {
          const r = rectFor(e, cursor, m.w, m.d);
          if (!free(r, 0.3)) continue;
          row.push({ m, a0: cursor });
          cursor += m.w + BUILDING_GAP;
          ok = true;
          break;
        }
        if (!ok) cursor += 1;
      }
      // Justify: spread the leftover over the gaps, so the frontage reads as one street wall.
      const items = [...row.map((r) => ({ kind: "b" as const, a0: r.a0, w: r.m.w, m: r.m })), ...rowYards.map((y) => ({ kind: "y" as const, a0: y.a0, w: y.w, m: null }))].sort((a, b) => a.a0 - b.a0);
      const lastEnd = items.length ? items[items.length - 1].a0 + items[items.length - 1].w : start;
      const leftover = end - lastEnd;
      const shift = (k: number) => (leftover > 0 && leftover < minW + BUILDING_GAP ? (leftover * (k + 1)) / (items.length + 1) : 0);
      const shifted = items.map((it, k) => ({ ...it, a0: it.a0 + shift(k) }));
      const tryRow = (list: typeof items) => list.every((it) => it.kind === "y" || free(rectFor(e, it.a0, it.w, it.m!.d), 0.3));
      const final = tryRow(shifted) ? shifted : items;
      for (const it of final) {
        if (it.kind === "b") place(e, it.m!, rectFor(e, it.a0, it.w, it.m!.d), false, false);
        else {
          const yr = rectFor(e, it.a0, it.w, Math.min(maxD, 12));
          yards.push(yr);
          if (block.zone === "industrial") details.push(...yardDetails(e, yr, rand));
          else pocketTrees.push({ x: (yr.x0 + yr.x1) / 2, z: (yr.z0 + yr.z1) / 2 });
        }
      }
    }
    buildings.push(...placed);
  }

  // ── Lamps ──
  const lamps: CityProp[] = [];
  const lamp = (x: number, z: number, dx: number, dz: number, double: boolean, street?: number): CityProp => ({
    id: LAMP_ENTRY_ID,
    kind: "lamp",
    x: round2(x),
    z: round2(z),
    rotationY: yawFacing(dx, dz),
    scale: 1,
    radius: 0.35,
    params: double ? { double: true } : undefined,
    street
  });
  const xStreets = streets.filter((s) => s.axis === "x");
  const zStreets = streets.filter((s) => s.axis === "z");
  if (params.lamps) {
    for (const xs_ of xStreets)
      for (const zs_ of zStreets) {
        const X = zs_.pos;
        const Z = xs_.pos;
        const hx = zs_.carriage / 2;
        const hz = xs_.carriage / 2;
        const armX = (sx: number) => (sx < 0 ? zs_.line > 0 : zs_.line < cols) && true;
        const armZ = (sz: number) => (sz < 0 ? xs_.line > 0 : xs_.line < rows);
        // Proper corners have the x-street continuing toward sx and the z-street toward sz.
        const proper = (sx: number, sz: number) => armX(sx) && armZ(sz);
        let quads: [number, number][] = [
          [1, 1],
          [-1, -1]
        ].filter(([a, b]) => proper(a, b)) as [number, number][];
        if (quads.length < 2) {
          const other = ([
            [1, -1],
            [-1, 1]
          ] as [number, number][]).filter(([a, b]) => proper(a, b));
          if (other.length > quads.length) quads = other;
        }
        for (const [sx, sz] of quads) lamps.push(lamp(X + sx * (hx + 1.3), Z + sz * (hz + 1.3), -sx, -sz, false));
      }
    for (const s of streets) {
      segmentsOf(s).forEach(([a, b], k) => {
        const len = b - a;
        if (s.avenue) {
          const n = Math.max(1, Math.round((len - 2 * CROSSWALK_CLEAR) / 24));
          for (let q = 0; q < n; q++) {
            const u = a + ((q + 0.5) * len) / n;
            const [x, z] = s.axis === "x" ? [u, s.pos] : [s.pos, u];
            lamps.push(lamp(x, z, s.axis === "x" ? 0 : 1, s.axis === "x" ? 1 : 0, true, s.id));
          }
          return;
        }
        if (len < 26) return;
        const n = len > 60 ? 2 : 1;
        for (let q = 0; q < n; q++) {
          const u = a + ((q + 1) * len) / (n + 1);
          const side = (k + q + s.line) % 2 === 0 ? 1 : -1;
          const off = s.pos + side * (s.carriage / 2 + 0.6);
          const [x, z] = s.axis === "x" ? [u, off] : [off, u];
          const [dx, dz] = s.axis === "x" ? [0, -side] : [-side, 0];
          lamps.push(lamp(x, z, dx, dz, false, s.id));
        }
      });
    }
  }

  // ── Street trees ──
  const trees: CityProp[] = [];
  const treeId = params.streetTrees;
  if (treeId !== "none") {
    const form = treeForm(treeId);
    const clearOf = (x: number, z: number, r: number) =>
      lamps.every((l) => Math.hypot(l.x - x, l.z - z) >= r + 1.2) && trees.every((t) => Math.hypot(t.x - x, t.z - z) >= 3);
    const addTree = (x: number, z: number, street: number | undefined, k: number) =>
      trees.push({ id: treeId, kind: "tree", x: round2(x), z: round2(z), rotationY: ((k * 2.399) % (Math.PI * 2)) - Math.PI, scale: form.scale, radius: form.radius, street });
    let k = 0;
    for (const s of streets) {
      for (const [a, b] of segmentsOf(s)) {
        const a1 = a + CROSSWALK_CLEAR;
        const b1 = b - CROSSWALK_CLEAR;
        const len = b1 - a1;
        if (len < 2) continue;
        const spacing = s.avenue ? 9 : 11;
        const n = len < spacing ? 1 : Math.floor(len / spacing) + 1;
        const at = (q: number) => (n === 1 ? (a1 + b1) / 2 : a1 + (q * len) / (n - 1));
        const sides = s.avenue ? [0] : [-1, 1];
        for (const side of sides) {
          const off = s.pos + side * (s.carriage / 2 + 1.0);
          for (let q = 0; q < n; q++) {
            const u = at(q);
            const [x, z] = s.axis === "x" ? [u, off] : [off, u];
            // Never in front of a door: a building on this side of this street with its door near u.
            const blocked = buildings.some((bd) => {
              if (bd.street !== s.id) return false;
              const doorAcross = s.axis === "x" ? bd.door.z : bd.door.x;
              if (Math.sign(doorAcross - s.pos) !== side) return false;
              const doorAlong = s.axis === "x" ? bd.door.x : bd.door.z;
              return Math.abs(doorAlong - u) < 2.4;
            });
            if (blocked || !clearOf(x, z, form.radius * 0.3)) continue;
            addTree(x, z, s.id, k++);
          }
        }
      }
    }
    // Pocket plazas in open commercial lots get one tree each.
    for (const p of pocketTrees) if (clearOf(p.x, p.z, 1)) addTree(p.x, p.z, undefined, k++);
  }

  // ── Parks and plazas ──
  const park: CityProp[] = [];
  const greens: CityPlan["greens"] = [];
  for (const green of blocks.filter((b) => b.kind !== "lot")) {
    const { lot } = green;
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    const w = lot.x1 - lot.x0;
    const d = lot.z1 - lot.z0;
    const isPlaza = green.kind === "plaza";
    const pr = Math.min(6, 0.24 * Math.min(w, d));
    greens.push({ rect: lot, kind: isPlaza ? "plaza" : "park", plaza: { x: cx, z: cz, r: pr } });
    const fountainScale = round2((pr * 0.55) / 1.8);
    park.push({ id: PARK_FOUNTAIN_ID, kind: "fountain", x: cx, z: cz, rotationY: 0, scale: fountainScale, radius: 1.8 * fountainScale });
    for (let q = 0; q < 4; q++) {
      const ang = Math.PI / 4 + (q * Math.PI) / 2;
      const bx = cx + Math.cos(ang) * (pr - 0.9);
      const bz = cz + Math.sin(ang) * (pr - 0.9);
      // A bench faces the fountain; its seat front is local +z for the Island kit bench.
      park.push({ id: PARK_BENCH_ID, kind: "bench", x: round2(bx), z: round2(bz), rotationY: yawFacing(bx - cx, bz - cz), scale: 1.5, radius: 1.2 });
    }
    const parkTree = treeId !== "none" ? treeId : "nature:tree:oak-round";
    const form = treeForm(parkTree);
    const pathHalf = 1.6;
    let k = 0;
    if (isPlaza) {
      // A paved square: one ring of trees along the edges, the center open.
      const inset = 2.6;
      const ring = (a0: number, a1: number) => {
        const n = Math.max(1, Math.round((a1 - a0) / 9));
        return Array.from({ length: n + 1 }, (_, q) => a0 + ((a1 - a0) * q) / n);
      };
      const pts: [number, number][] = [];
      for (const x of ring(lot.x0 + inset, lot.x1 - inset)) pts.push([x, lot.z0 + inset], [x, lot.z1 - inset]);
      for (const z of ring(lot.z0 + inset, lot.z1 - inset).slice(1, -1)) pts.push([lot.x0 + inset, z], [lot.x1 - inset, z]);
      for (const [x, z] of pts) {
        if (Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue; // keep the entries open
        park.push({ id: parkTree, kind: "tree", x: round2(x), z: round2(z), rotationY: ((k++ * 2.399) % (Math.PI * 2)) - Math.PI, scale: form.scale, radius: form.radius });
      }
    } else {
      const inset = 3.2;
      const step = 8.5;
      for (let x = lot.x0 + inset; x <= lot.x1 - inset + 1e-6; x += (w - 2 * inset) / Math.max(1, Math.round((w - 2 * inset) / step))) {
        for (let z = lot.z0 + inset; z <= lot.z1 - inset + 1e-6; z += (d - 2 * inset) / Math.max(1, Math.round((d - 2 * inset) / step))) {
          if (Math.abs(x - cx) < pathHalf + 2 || Math.abs(z - cz) < pathHalf + 2) continue;
          if (Math.hypot(x - cx, z - cz) < pr + 2.5) continue;
          park.push({ id: parkTree, kind: "tree", x: round2(x), z: round2(z), rotationY: ((k++ * 2.399) % (Math.PI * 2)) - Math.PI, scale: form.scale * 1.1, radius: form.radius * 1.1 });
        }
      }
    }
    if (params.lamps) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const reach = dx !== 0 ? w / 2 : d / 2;
        const t = (pr + reach) / 2;
        const x = cx + dx * t + dz * (pathHalf + 0.6);
        const z = cz + dz * t + dx * (pathHalf + 0.6);
        lamps.push(lamp(x, z, -dz, -dx, false));
      }
    }
  }

  // ── Street details: café parasols in front of low commercial buildings on the avenue ──
  const parasolSize = detailSize("commercial", "detail-parasol-a");
  if (parasolSize) {
    let count = 0;
    const r = Math.max(parasolSize.w, parasolSize.d) / 2;
    const shops = buildings.filter((b) => b.zone === "commercial" && b.street === avenue.id && b.height <= 14);
    for (const b of shops) {
      if (count >= 8 || rand() > 0.6) continue;
      const [fx, fz] = FACING_DIR[b.facing];
      const out = SETBACK + 1.9;
      const ax = fz !== 0 ? 1 : 0;
      const az = fx !== 0 ? 1 : 0;
      for (const sgn of [-1, 1]) {
        const x = round2(b.door.x + fx * out + ax * sgn * 2.6);
        const z = round2(b.door.z + fz * out + az * sgn * 2.6);
        const clear = [...trees, ...lamps, ...details].every((p) => Math.hypot(p.x - x, p.z - z) >= p.radius + r + 0.3);
        if (!clear) continue;
        details.push({ id: `model:city-commercial:detail-parasol-${rand() < 0.5 ? "a" : "b"}`, kind: "detail", x, z, rotationY: b.rotationY, scale: BUILDING_NODE_SCALE * 0.8, radius: r * 0.8 });
        count++;
      }
    }
  }

  const groundRect: Rect = { x0: streetsRect.x0 - VERGE, x1: streetsRect.x1 + VERGE, z0: streetsRect.z0 - VERGE, z1: streetsRect.z1 + VERGE };
  return { params, cols, rows, avenueAxis, streets, blocks, buildings, trees, lamps, details, park, streetsRect, groundRect, greens, notes };
}


// ── Zoning ────────────────────────────────────────────────────

/** Models of the kit that suit a zone (by height in kit units). */
function zonePool(zone: BlockZone): BuildingModel[] {
  const all = BUILDING_MODELS[zoneSet(zone)];
  const keep =
    zone === "downtown" ? (m: BuildingModel) => m.units >= 1.68 : zone === "commercial" ? (m: BuildingModel) => m.units >= 1.2 && m.units <= 2.5 : zone === "low-rise" ? (m: BuildingModel) => m.units <= 1.7 : () => true;
  const pool = all.filter(keep);
  return pool.length ? pool : all;
}

/** Blocks share a street side (diagonal blocks across an intersection do not touch). */
export function blocksTouch(a: { i: number; j: number }, b: { i: number; j: number }) {
  return Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1;
}

/**
 * Land use, as an urban designer zones a grid: the downtown core is the most central blocks on
 * the avenue; the park is next to the core; in kit "mixed" the industry is one compact district
 * at the edge, on the far side from the park, never touching the core; from 16 blocks up a
 * plaza is the second open space; the rest is mid-rise commercial near the core and low-rise at
 * the edge. Sets kind and zone of each block in place.
 */
function zoneBlocks(blocks: CityBlock[], params: CityParams, score: (b: CityBlock) => number, center: (b: CityBlock) => { x: number; z: number }, notes: string[]) {
  const n = blocks.length;
  const { cols, rows } = params;
  const ranked = [...blocks].sort((a, b) => score(b) - score(a) || a.j - b.j || a.i - b.i);
  const taken = new Set<CityBlock>();
  const industrialKit = params.kit === "industrial";

  // Downtown core (an industrial town has none).
  const core = industrialKit ? [] : ranked.slice(0, n <= 9 ? 1 : Math.round(n * 0.16));
  for (const b of core) {
    b.zone = "downtown";
    taken.add(b);
  }
  const nextToCore = (b: CityBlock) => core.some((c) => blocksTouch(b, c));

  // The park: the most central free block, next to the core when one is free.
  let parkBlock: CityBlock | undefined;
  if (params.park) {
    if (n < 2) notes.push("No park: a 1 x 1 city has only one block.");
    else {
      const free = ranked.filter((b) => !taken.has(b));
      parkBlock = free.find(nextToCore) ?? free[0];
      parkBlock.kind = "park";
      parkBlock.zone = "park";
      taken.add(parkBlock);
    }
  }

  // Industrial district (kit "mixed").
  if (params.kit === "mixed") {
    if (cols < 3 || rows < 3) {
      notes.push(`No industrial district: a ${cols} x ${rows} grid has no block far enough from the downtown core, so the city is commercial only.`);
    } else {
      const edge = (b: CityBlock) => b.i === 0 || b.j === 0 || b.i === cols - 1 || b.j === rows - 1;
      const corner = (b: CityBlock) => (b.i === 0 || b.i === cols - 1) && (b.j === 0 || b.j === rows - 1);
      const from = parkBlock ? center(parkBlock) : { x: 0, z: 0 };
      const far = (b: CityBlock) => Math.hypot(center(b).x - from.x, center(b).z - from.z) + (corner(b) ? 8 : 0) - score(b);
      const eligible = blocks.filter((b) => !taken.has(b) && edge(b) && !nextToCore(b));
      if (!eligible.length) notes.push("No industrial district: every edge block touches the downtown core.");
      else {
        const want = Math.max(1, Math.round(n * 0.2));
        const district: CityBlock[] = [eligible.sort((a, b) => far(b) - far(a))[0]];
        while (district.length < want) {
          const frontier = eligible.filter((b) => !district.includes(b) && district.some((d) => blocksTouch(b, d)));
          if (!frontier.length) break;
          district.push(frontier.sort((a, b) => far(b) - far(a))[0]);
        }
        for (const b of district) {
          b.zone = "industrial";
          taken.add(b);
        }
      }
    }
  }

  // Plaza: the second open space, away from the park, next to the core when it can be.
  if (params.park && n >= 16) {
    const free = ranked.filter((b) => !taken.has(b) && (!parkBlock || Math.abs(b.i - parkBlock.i) + Math.abs(b.j - parkBlock.j) >= 2) && b.zone !== "industrial");
    const pick = free.find(nextToCore) ?? free[0];
    if (pick) {
      pick.kind = "plaza";
      pick.zone = "park";
      taken.add(pick);
    }
  }

  // The rest: commercial near the core, low-rise at the edge.
  if (industrialKit) return;
  const rest = ranked.filter((b) => !taken.has(b));
  const commercial = Math.ceil(rest.length * 0.45);
  rest.forEach((b, k) => (b.zone = k < commercial ? "commercial" : "low-rise"));
}

/** Street segments between intersections: [start, end] along the axis. */
export function segmentsOf(s: CityStreet): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < s.crossings.length; k++) {
    const a = s.crossings[k];
    const b = s.crossings[k + 1];
    out.push([a.at + a.row / 2, b.at - b.row / 2]);
  }
  return out;
}

/** Industrial yard: a tank or a container in an open lot, inside the yard rectangle. */
function yardDetails(e: Edge, yard: Rect, rand: () => number): CityProp[] {
  const w = yard.x1 - yard.x0;
  const d = yard.z1 - yard.z0;
  const options: { slug: string; factor: number }[] = [
    { slug: "detail-tank", factor: 1 },
    { slug: "shipping-container-a", factor: 0.45 },
    { slug: "shipping-container-b", factor: 0.45 },
    { slug: "detail-tank-large", factor: 0.6 }
  ];
  const start = Math.floor(rand() * options.length);
  for (let k = 0; k < options.length; k++) {
    const o = options[(start + k) % options.length];
    const size = detailSize("industrial", o.slug, o.factor);
    if (!size) continue;
    // Long side along the frontage.
    const along = Math.max(size.w, size.d);
    const deep = Math.min(size.w, size.d);
    const [rw, rd] = e.along === "x" ? [along, deep] : [deep, along];
    if (rw > w - 1 || rd > d - 1) continue;
    const cx = (yard.x0 + yard.x1) / 2;
    const cz = (yard.z0 + yard.z1) / 2;
    const rotAlongX = e.along === "x" ? (size.w >= size.d ? 0 : Math.PI / 2) : size.w >= size.d ? Math.PI / 2 : 0;
    return [
      {
        id: `model:city-industrial:${o.slug}`,
        kind: "detail",
        x: round2(cx),
        z: round2(cz),
        rotationY: rotAlongX,
        scale: BUILDING_NODE_SCALE * o.factor,
        radius: Math.hypot(rw, rd) / 2,
        rect: { x0: cx - rw / 2, x1: cx + rw / 2, z0: cz - rd / 2, z1: cz + rd / 2 }
      }
    ];
  }
  return [];
}

/** The street's road-mesh params in its node frame (u along local x, v along local z). */
export function streetMeshParams(s: CityStreet) {
  const center = (s.from + s.to) / 2;
  // A z-street node is turned by -90 degrees: local +x = world +z, local +z = world -x.
  const flip = s.axis === "z";
  return {
    len: round2(s.to - s.from),
    carriage: s.carriage,
    sidewalk: s.sidewalk,
    median: s.median,
    parking: s.parking,
    crossings: s.crossings.map((c) => ({
      at: round2(c.at - center),
      row: c.row,
      carriage: c.carriage,
      owned: c.owned,
      arms: [c.arms.back, c.arms.ahead, flip ? c.arms.plus : c.arms.minus, flip ? c.arms.minus : c.arms.plus]
    }))
  };
}

/** Node placement of a street: center and rotation. */
export function streetNode(s: CityStreet) {
  const center = (s.from + s.to) / 2;
  return s.axis === "x" ? { x: center, z: s.pos, rotationY: 0 } : { x: s.pos, z: center, rotationY: -Math.PI / 2 };
}

/** Building y above the city base (on the lot, at curb height). */
export const LOT_Y = CURB_Y;

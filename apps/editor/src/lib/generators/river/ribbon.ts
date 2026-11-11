// River meshes as plain arrays (no three.js): the water ribbon, the bed under it and the
// grass banks beside it, all swept along the centerline. Pure code, unit tested in
// tests/river.test.ts; src/lib/resources/water/river-water.ts turns them into meshes.
//
// Water ribbon attributes: uv.x = across, 0 at one bank and 1 at the other; uv.y = distance
// along the river in meters (monotonic from source to mouth); aEdge = meters to the nearest
// bank; aDepth = water depth in meters; aHalf = half width; aAlong = flow direction (x, z).
import type { RiverSample } from "./path";

/** Heights above the node origin on the flat editor ground (the grid is at y 0). */
export const FLAT_WATER_Y = 0.1;
export const FLAT_BANK_CREST = 0.24;
/** On an island the river sits just above the island lake (y 0) and the stylized sea (y 0.05). */
export const ISLAND_WATER_Y = 0.07;

export type SweepAttr = { name: string; size: number };

export type SweepMesh = {
  positions: Float32Array;
  attrs: Record<string, Float32Array>;
  indices: Uint32Array;
  /** revealCount[i] = number of indices to draw to show the river up to revealS[i] meters. */
  revealS: number[];
  revealCount: number[];
};

type VertexFn = (p: RiverSample, x: number, column: number, side: number, alongShift: number) => { y: number; values: number[] };

const CAP_STEPS = 10;

/**
 * Sweeps a one-sided profile (columns = offsets from the centerline, ascending, >= 0) along
 * both sides of the river. Caps revolve the profile around the end points (a rounded end).
 * side = +1 on the +n side, -1 on the other, cos(angle) inside a cap.
 */
export function sweep(
  samples: RiverSample[],
  columnsAt: (p: RiverSample) => number[],
  vertex: VertexFn,
  schema: SweepAttr[],
  caps: { start: boolean; end: boolean }
): SweepMesh {
  const positions: number[] = [];
  const attrs: Record<string, number[]> = Object.fromEntries(schema.map((a) => [a.name, []]));
  const indices: number[] = [];
  const revealS: number[] = [];
  const revealCount: number[] = [];

  const push = (p: RiverSample, dx: number, dz: number, x: number, column: number, side: number, alongShift: number) => {
    const v = vertex(p, x, column, side, alongShift);
    positions.push(p.x + dx * x, v.y, p.z + dz * x);
    let k = 0;
    for (const a of schema) for (let c = 0; c < a.size; c++) attrs[a.name]!.push(v.values[k++] ?? 0);
    return positions.length / 3 - 1;
  };
  const tri = (a: number, b: number, c: number) => {
    const ax = positions[a * 3]!;
    const az = positions[a * 3 + 2]!;
    const ny = (positions[b * 3 + 2]! - az) * (positions[c * 3]! - ax) - (positions[b * 3]! - ax) * (positions[c * 3 + 2]! - az);
    if (ny >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  const grid = (rows: number[][]) => {
    for (let r = 0; r < rows.length - 1; r++) {
      const A = rows[r]!;
      const B = rows[r + 1]!;
      for (let c = 0; c < A.length - 1; c++) {
        tri(A[c]!, B[c]!, A[c + 1]!);
        tri(A[c + 1]!, B[c]!, B[c + 1]!);
      }
    }
  };
  const cap = (p: RiverSample, forward: number) => {
    const cols = columnsAt(p);
    const rows: number[][] = [];
    for (let j = 0; j <= CAP_STEPS; j++) {
      const phi = (j / CAP_STEPS) * Math.PI;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi) * forward;
      const dx = p.nx * cos + p.tx * sin;
      const dz = p.nz * cos + p.tz * sin;
      rows.push(cols.map((x, c) => push(p, dx, dz, x, c, cos, sin * x)));
    }
    grid(rows);
  };

  if (caps.start && samples.length > 0) cap(samples[0]!, -1);
  revealS.push(0);
  revealCount.push(indices.length);
  let prev: { plus: number[]; minus: number[] } | null = null;
  for (const p of samples) {
    const cols = columnsAt(p);
    const plus = cols.map((x, c) => push(p, p.nx, p.nz, x, c, 1, 0));
    const minus = cols.map((x, c) => push(p, -p.nx, -p.nz, x, c, -1, 0));
    if (prev) {
      grid([prev.plus, plus]);
      grid([prev.minus, minus]);
      revealS.push(p.s);
      revealCount.push(indices.length);
    }
    prev = { plus, minus };
  }
  if (caps.end && samples.length > 0) {
    cap(samples[samples.length - 1]!, 1);
    revealS.push((samples[samples.length - 1]?.s ?? 0) + 1e3);
    revealCount.push(indices.length);
  }
  return {
    positions: Float32Array.from(positions),
    attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, Float32Array.from(v)])),
    indices: Uint32Array.from(indices),
    revealS,
    revealCount
  };
}

/** Index count that shows the river up to s meters (for geometry.setDrawRange). */
export function revealIndexCount(mesh: SweepMesh, s: number) {
  let count = mesh.revealCount[0] ?? 0;
  for (let i = 0; i < mesh.revealS.length; i++) if (mesh.revealS[i]! <= s) count = mesh.revealCount[i]!;
  return count;
}

const WATER_COLUMNS = [0, 0.3, 0.55, 0.75, 0.88, 1];

/** The water surface. y = water height above the node origin. */
export function waterRibbon(samples: RiverSample[], y: number, caps: { start: boolean; end: boolean }): SweepMesh {
  const total = samples[samples.length - 1]?.s ?? 0;
  return sweep(
    samples,
    (p) => WATER_COLUMNS.map((f) => f * p.hw),
    (p, x, _c, side, shift) => {
      const f = Math.min(1, x / Math.max(p.hw, 1e-3));
      const v = p.s + shift; // caps continue the distance before 0 and after the end
      const depth = p.depth * (1 - f * f) + 0.02;
      return { y, values: [0.5 + 0.5 * side * f, Math.max(-p.hw, Math.min(total + p.hw, v)), Math.max(0, p.hw - x), depth, p.hw, p.tx, p.tz] };
    },
    [
      { name: "uv", size: 2 },
      { name: "aEdge", size: 1 },
      { name: "aDepth", size: 1 },
      { name: "aHalf", size: 1 },
      { name: "aAlong", size: 2 }
    ],
    caps
  );
}

// ── Flat ground: bed and banks ────────────────────────────────

/** Smooth seeded variation along the river, about 0.6 to 1.4. */
export function bankVariation(seed: number) {
  const a = ((seed % 997) / 997) * Math.PI * 2;
  const b = ((seed % 641) / 641) * Math.PI * 2;
  return (s: number) => 1 + 0.25 * Math.sin(s / 3.7 + a) + 0.15 * Math.sin(s / 1.9 + b);
}

export type BankProfile = { xs: number[]; ys: number[]; colors: number[][] };

const MUD_WET = [0.27, 0.21, 0.14];
const MUD = [0.4, 0.31, 0.2];
const EARTH = [0.47, 0.38, 0.24];
const GRASS_LIGHT = [0.48, 0.63, 0.3];
const GRASS = [0.4, 0.57, 0.26];
const GRASS_DARK = [0.33, 0.5, 0.22];

/** Cross-section of one bank on flat ground: offsets from the centerline, heights, RGBA. */
export function flatBankProfile(p: RiverSample, width: number, vary: (s: number) => number): BankProfile {
  const v = vary(p.s);
  const grass = (1.1 + 0.22 * width) * (0.75 + 0.25 * v);
  const crest = FLAT_BANK_CREST * (0.85 + 0.15 * v);
  const hw = p.hw;
  return {
    xs: [hw - 0.25, hw, hw + 0.15, hw + 0.35, hw + 0.35 + grass * 0.4, hw + 0.35 + grass * 0.75, hw + 0.35 + grass],
    ys: [FLAT_WATER_Y - 0.03, FLAT_WATER_Y + 0.02, FLAT_WATER_Y + 0.09, crest, crest * 0.55, crest * 0.22, 0.012],
    colors: [
      [...MUD_WET, 1],
      [...MUD, 1],
      [...EARTH, 1],
      [...GRASS_LIGHT, 1],
      [...GRASS, 1],
      [...GRASS_DARK, 0.7],
      [...GRASS_DARK, 0]
    ]
  };
}

/** Height of the flat-ground bank at a distance from the centerline (water height inside). */
export function flatHeightAcross(profile: BankProfile, offset: number) {
  const { xs, ys } = profile;
  if (offset <= xs[0]!) return FLAT_WATER_Y;
  for (let i = 0; i < xs.length - 1; i++) {
    if (offset <= xs[i + 1]!) {
      const w = (offset - xs[i]!) / (xs[i + 1]! - xs[i]!);
      return ys[i]! + (ys[i + 1]! - ys[i]!) * w;
    }
  }
  return 0;
}

/** The grass and earth banks (flat ground). Attributes: color (RGBA). */
export function flatBanks(samples: RiverSample[], width: number, seed: number): SweepMesh {
  const vary = bankVariation(seed);
  const profiles = new Map<RiverSample, BankProfile>();
  const profile = (p: RiverSample) => {
    let pr = profiles.get(p);
    if (!pr) {
      pr = flatBankProfile(p, width, vary);
      profiles.set(p, pr);
    }
    return pr;
  };
  return sweep(
    samples,
    (p) => profile(p).xs,
    (p, _x, c) => {
      const pr = profile(p);
      return { y: pr.ys[c]!, values: pr.colors[c]! };
    },
    [{ name: "color", size: 4 }],
    { start: true, end: true }
  );
}

const BED_COLUMNS = [0, 0.3, 0.6, 0.85, 1, 1.12];
const BED_DEEP = [0.22, 0.24, 0.2];
const BED_SAND = [0.55, 0.48, 0.34];

/** The river bed under the water (flat ground): a shallow trough, dark in the middle. */
export function flatBed(samples: RiverSample[]): SweepMesh {
  return sweep(
    samples,
    (p) => BED_COLUMNS.map((f) => f * p.hw),
    (_p, _x, c) => {
      const f = BED_COLUMNS[c]!;
      const g = Math.min(1, f);
      const y = 0.015 + 0.06 * g * g + (f > 1 ? 0.012 : 0);
      const w = Math.pow(g, 1.6);
      return { y, values: BED_DEEP.map((d, i) => d + (BED_SAND[i]! - d) * w) };
    },
    [{ name: "color", size: 3 }],
    { start: true, end: true }
  );
}

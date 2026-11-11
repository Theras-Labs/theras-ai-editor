// Fits a city plan to the scene (pure): on open ground the city stands at the anchor at full
// size; on an island terrain it needs flat land, so the grid shrinks first and then the scale.
import { planCity, type CityPlan } from "./layout";
import { sizeOfGrid, type CityParams } from "./params";

export type CityFit = {
  plan: CityPlan;
  /** World meters per plan meter. */
  scale: number;
  /** World position of the plan origin. */
  center: { x: number; z: number };
  /** World height of the street level. */
  y: number;
  /** Ground slab thickness in plan meters (reaches below the lowest terrain point). */
  thickness: number;
  onTerrain: boolean;
  notes: string[];
};

/** Largest height difference under the city that the slab hides, in meters. */
export const MAX_GROUND_RANGE = 1.2;
const SCALES = [1, 0.75, 0.5, 0.4, 0.3, 0.22, 0.16];
const SHIFTS = [0, 3, 6, 9, 12];

function grids(cols: number, rows: number) {
  const out: [number, number][] = [];
  for (let c = cols; c >= 1; c--) for (let r = rows; r >= 1; r--) out.push([c, r]);
  return out.sort((a, b) => b[0] * b[1] - a[0] * a[1] || Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]));
}

/** Ground heights under a rectangle (world), or null when any sample is water or too steep. */
function sampleFlat(groundAt: (x: number, z: number) => number | null, x0: number, z0: number, x1: number, z1: number) {
  const step = Math.max(1, Math.min(x1 - x0, z1 - z0) / 24);
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = x0; x <= x1 + 1e-6; x += step)
    for (let z = z0; z <= z1 + 1e-6; z += step) {
      const h = groundAt(x, z);
      if (h === null || !Number.isFinite(h)) return null;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      if (hi - lo > MAX_GROUND_RANGE) return null;
    }
  return { lo, hi };
}

/**
 * groundAt: island ground height, null over water; undefined when the scene has no terrain.
 * Returns null when not even the smallest city fits.
 */
export function fitCity(params: CityParams, anchor: { x: number; z: number }, groundAt?: (x: number, z: number) => number | null): CityFit | null {
  if (!groundAt) {
    return { plan: planCity(params), scale: 1, center: { ...anchor }, y: 0, thickness: 0.4, onTerrain: false, notes: [] };
  }
  const plans = new Map<string, CityPlan>();
  const planFor = (cols: number, rows: number) => {
    const key = `${cols}x${rows}`;
    if (!plans.has(key)) plans.set(key, planCity({ ...params, cols, rows, size: cols === params.cols && rows === params.rows ? params.size : sizeOfGrid(cols, rows) }));
    return plans.get(key)!;
  };
  // First keep a real city (4 blocks or the requested count) down to half scale, then accept
  // any grid at any scale.
  const minBlocks = Math.min(4, params.cols * params.rows);
  const candidates: [number, number, number][] = [];
  for (const scale of SCALES.filter((s) => s >= 0.5))
    for (const [c, r] of grids(params.cols, params.rows)) if (c * r >= minBlocks) candidates.push([scale, c, r]);
  for (const scale of SCALES) for (const [c, r] of grids(params.cols, params.rows)) candidates.push([scale, c, r]);
  const tried = new Set<string>();
  for (const [scale, cols, rows] of candidates) {
    const key = `${scale}|${cols}|${rows}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const plan = planFor(cols, rows);
    const g = plan.groundRect;
    for (const shift of SHIFTS)
      for (let k = 0; k < (shift === 0 ? 1 : 8); k++) {
        const a = (k * Math.PI) / 4;
        const cx = anchor.x + Math.cos(a) * shift;
        const cz = anchor.z + Math.sin(a) * shift;
        const flat = sampleFlat(groundAt, cx + g.x0 * scale, cz + g.z0 * scale, cx + g.x1 * scale, cz + g.z1 * scale);
        if (!flat) continue;
        const notes: string[] = [];
        if (cols !== params.cols || rows !== params.rows)
          notes.push(`The flat land fits ${cols} x ${rows} blocks, not ${params.cols} x ${params.rows}.`);
        if (scale < 1) notes.push(`The city is built at ${Math.round(scale * 100)} % scale to fit the island.`);
        const y = flat.hi + 0.02;
        return { plan, scale, center: { x: cx, z: cz }, y, thickness: (y - flat.lo + 0.5) / scale, onTerrain: true, notes };
      }
  }
  return null;
}

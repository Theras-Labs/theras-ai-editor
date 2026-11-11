// Island kit terrain: cap rounding profile and the corner field blend (bundle 17801-17844).
// A level's "field" is the bilinear blend of the four corner in/out flags in smoothstep space.
// The coastline is its 0.5 iso line; the cap rounds down near the coast (ROUND_STOPS -> ROUND_DROPS).
import { CONFIG, levelY } from '../core/config';

/** Iso value of the coastline. */
export const ISO = 0.5; // Bs (17801)
/** Saddle bump added to diagonal (checkerboard) cells so they read as one blob. */
export const SADDLE_BUMP = 0.13; // Vs (17802)
/** Field values where the cap roundness changes (cap band edges). */
export const ROUND_STOPS = [0.5, 0.545, 0.625, 0.74]; // Hs (17803)
/** Cap drop below the level top at each ROUND_STOPS value. */
export const ROUND_DROPS = [0.13, 0.068, 0.022, 0]; // Us (17804)
/** Grassy lip overhang of a cap rim over its wall. */
export const LIP_OUT = 0.03; // Ws (17805)
/** Height of the lip band at the top of a wall. */
export const LIP_DROP = 0.045; // Gs (17806)
/** Bottom of a level-1 wall (below the lake bed). */
export const WALL_FLOOR_Y = CONFIG.LAKE_BED_Y - 0.15; // Ks (17807)

/** Smoothstep on [0, 1]. */
export const smooth01 = (t: number): number => t * t * (3 - 2 * t); // qs (17808)
/** Derivative of smooth01. */
export const smooth01Slope = (t: number): number => 6 * t * (1 - t); // Js (17809)

/** Cap drop for a field value (piecewise linear through ROUND_STOPS / ROUND_DROPS). */
export function roundDrop(field: number): number { // Ys (17810)
  if (field >= ROUND_STOPS[3]) return 0;
  if (field <= ROUND_STOPS[0]) return ROUND_DROPS[0];
  for (let k = 0; k < 3; k++)
    if (field <= ROUND_STOPS[k + 1]) {
      const t = (field - ROUND_STOPS[k]) / (ROUND_STOPS[k + 1] - ROUND_STOPS[k]);
      return ROUND_DROPS[k] + (ROUND_DROPS[k + 1] - ROUND_DROPS[k]) * t;
    }
  return 0;
}

/** Y of the rounded rim where a level's cap meets its wall. */
export const rimTopY = (level: number): number => levelY(level) - ROUND_DROPS[0]; // Xs (17820)

/** Bilinear corner blend (corner order 0,1,2,3 = (0,0),(1,0),(1,1),(0,1)) plus the saddle bump. */
export function blendField(a: number, b: number, c: number, d: number, u: number, v: number): number { // Zs (17821)
  const f = (1 - u) * (1 - v) * a + u * (1 - v) * b + u * v * c + (1 - u) * v * d;
  return a === c && b === d && a !== b ? f + SADDLE_BUMP * 16 * u * (1 - u) * v * (1 - v) : f;
}

export interface FieldGradient {
  fu: number;
  fv: number;
}

/** Gradient of blendField(a..d, smooth01(u), smooth01(v)) with respect to raw (u, v). */
export function blendFieldGradient( // Qs (17825)
  a: number,
  b: number,
  c: number,
  d: number,
  u: number,
  v: number,
  out: FieldGradient,
): FieldGradient {
  const su = smooth01(u),
    sv = smooth01(v),
    du = smooth01Slope(u),
    dv = smooth01Slope(v);
  let fu = du * ((1 - sv) * (b - a) + sv * (c - d)),
    fv = dv * ((1 - su) * (d - a) + su * (c - b));
  if (a === c && b === d && a !== b) {
    fu += SADDLE_BUMP * 16 * du * (1 - 2 * su) * sv * (1 - sv);
    fv += SADDLE_BUMP * 16 * su * (1 - su) * dv * (1 - 2 * sv);
  }
  out.fu = fu;
  out.fv = fv;
  return out;
}

/** Nudge a field value off the iso line so the contour never passes exactly through a sample. */
export function offIso(field: number): number { // $s (17842)
  return Math.abs(field - 0.5) < 1e-5 ? 0.50001 : field;
}

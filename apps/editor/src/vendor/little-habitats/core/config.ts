// Ports chunk config-DXMhglbM.js (lines 1-16). Index aliases: xt -> CONFIG, bt -> levelY.

export const CONFIG = { // e (config chunk 1), index alias xt
  GRID_HEX_SIZE: 8,
  GRID_TRI_EDGE: 2,
  GRID_RELAX_ITERATIONS: 80,
  WATER_Y: 0,
  LAKE_BED_Y: -0.9,
  LEVEL_BASE_Y: 0.25,
  LEVEL_STEP: 0.5,
  MAX_HEIGHT: 5,
  DAY_SECONDS: 180,
  DAYS_PER_SEASON: 2,
};

/** World Y of a corner height level. Level 0 (water) is the lake bed. */
export function levelY(level: number): number { // t (config chunk 13), index alias bt
  return level <= 0 ? CONFIG.LAKE_BED_Y : CONFIG.LEVEL_BASE_Y + (level - 1) * CONFIG.LEVEL_STEP;
}

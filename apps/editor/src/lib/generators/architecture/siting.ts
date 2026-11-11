// Siting of a landmark building: where it stands in or beside a built city, the default tower
// height from the skyline, and the move off other sites. Pure: plain numbers, no scene, no DOM.
// All values are WORLD meters. The city plan is axis aligned (CitySiteFacts).
import type { BuiltSite, CitySiteFacts, SiteRect } from "@/lib/copilot/director/types";
import { ASPHALT_Y, CURB_Y } from "@/lib/generators/city/ids";
import { TOWER_HEIGHT } from "./params";

type Block = CitySiteFacts["blocks"][number];
type Street = CitySiteFacts["streets"][number];

/** Size of the building on the ground in its own frame: front = +z (the door side). */
export type LocalExtent = { hx: number; back: number; front: number };

export type Place = {
  /** Option id: "block:<i>,<j>" or "beside". */
  id: string;
  label: string;
  at: { x: number; z: number };
  facing: number;
  block?: Block;
  /** Largest footprint (podium width) that fits the block. */
  maxFootprint?: number;
  /** World y of the lot surface (on a block). */
  y?: number;
};

const round5 = (v: number) => Math.round(v / 5) * 5;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ── Height ────────────────────────────────────────────────────

/** Words that ask for a building much taller than the rest. */
export const TALL_WORDS = /\b(really|very|super|extremely|so)\s+tall|\bsuper.?tall|\bhuge|\bgiant|\benormous|\bmassive|\btallest|\bhighest|\bbiggest|\bcolossal|\bmega|\btowering|\bsoaring/i;

/** Tallest building around: other sites and the blocks of the near city (0 = none). */
export function skylineHeight(others: BuiltSite[], city?: CitySiteFacts): number {
  let t = others.reduce((h, s) => Math.max(h, s.facts.height ?? 0), 0);
  for (const b of city?.blocks ?? []) t = Math.max(t, b.tallest || 0);
  return t;
}

/** Default tower height: 1.6 x the skyline (3 x for "really tall" words: a landmark), at least 60 m; 60 m alone. */
export function defaultTowerHeight(skyline: number, tall: boolean): number {
  const h = skyline > 0 ? Math.max(TOWER_HEIGHT.def, skyline * (tall ? 3 : 1.6)) : tall ? 90 : TOWER_HEIGHT.def;
  return clamp(round5(h), TOWER_HEIGHT.min, TOWER_HEIGHT.max);
}

export type HeightOption = { height: number; hint: string };

/** Three heights to choose from, low to high; the default is one of them. */
export function heightOptions(skyline: number, def: number): HeightOption[] {
  const raw = skyline > 0 ? [Math.max(skyline * 1.35, skyline + 10), skyline * 2, skyline * 3] : [def * 0.6, def, def * 1.7];
  let list = raw.map((h) => clamp(round5(h), TOWER_HEIGHT.min, TOWER_HEIGHT.max));
  // The default replaces the nearest option.
  let k = 0;
  list.forEach((h, i) => (Math.abs(h - def) < Math.abs(list[k] - def) ? (k = i) : 0));
  list[k] = def;
  list = [...new Set(list)].sort((a, b) => a - b);
  // Keep the options at least 15 % apart.
  const out: number[] = [];
  for (const h of list) if (!out.length || h >= out[out.length - 1] * 1.15) out.push(h);
  while (out.length < 3 && out[out.length - 1] < TOWER_HEIGHT.max) out.push(clamp(round5(out[out.length - 1] * 1.5), TOWER_HEIGHT.min, TOWER_HEIGHT.max));
  return [...new Set(out)].map((height) => {
    const floors = Math.round(height / 3.8);
    if (skyline <= 0) return { height, hint: `about ${floors} floors` };
    const r = height / skyline;
    const words = r < 1.6 ? "above the skyline" : r < 2.5 ? "twice the skyline" : "a landmark";
    return { height, hint: `${words} (tallest now ${Math.round(skyline)} m)` };
  });
}

// ── Footprint in the world ────────────────────────────────────

/** Local (x, z) to world offset for a facing in degrees (0 = front +z, 90 = front +x). */
export function rotate(x: number, z: number, facing: number): [number, number] {
  const a = (facing * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}

/** World rectangle around the building at a place. */
export function worldRect(at: { x: number; z: number }, ext: LocalExtent, facing: number, margin = 0): SiteRect {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [lx, lz] of [
    [-ext.hx, -ext.back],
    [ext.hx, -ext.back],
    [ext.hx, ext.front],
    [-ext.hx, ext.front]
  ]) {
    const [wx, wz] = rotate(lx, lz, facing);
    x0 = Math.min(x0, at.x + wx);
    x1 = Math.max(x1, at.x + wx);
    z0 = Math.min(z0, at.z + wz);
    z1 = Math.max(z1, at.z + wz);
  }
  return { x0: x0 - margin, z0: z0 - margin, x1: x1 + margin, z1: z1 + margin };
}

// ── City blocks ───────────────────────────────────────────────

/** World y of the sidewalk and lot surface (a curb height above the street). */
export function lotY(city: CitySiteFacts): number {
  return city.y + (CURB_Y - ASPHALT_Y) * city.scale;
}

/** Distance from the block edge to the street center line, or Infinity when the street does not run along the block. */
function streetGap(block: Block, s: Street): number {
  const r = block.rect;
  if (s.axis === "x") {
    if (s.from > r.x0 + 1 || s.to < r.x1 - 1) return Infinity;
    return Math.min(Math.abs(r.z0 - s.pos), Math.abs(r.z1 - s.pos));
  }
  if (s.from > r.z0 + 1 || s.to < r.z1 - 1) return Infinity;
  return Math.min(Math.abs(r.x0 - s.pos), Math.abs(r.x1 - s.pos));
}

const touches = (block: Block, s: Street) => streetGap(block, s) <= s.width / 2 + 2;

/** Facing (degrees) toward a street from a block. */
function facingToward(block: Block, s: Street): number {
  const cx = (block.rect.x0 + block.rect.x1) / 2;
  const cz = (block.rect.z0 + block.rect.z1) / 2;
  if (s.axis === "x") return cz < s.pos ? 0 : 180;
  return cx < s.pos ? 90 : 270;
}

/** The avenue streets (or the middle street along the avenue axis when none is marked). */
function avenues(city: CitySiteFacts): Street[] {
  const marked = city.streets.filter((s) => s.avenue);
  if (marked.length) return marked;
  const along = city.streets.filter((s) => s.axis === city.avenueAxis);
  const mid = city.avenueAxis === "x" ? (city.streetsRect.z0 + city.streetsRect.z1) / 2 : (city.streetsRect.x0 + city.streetsRect.x1) / 2;
  along.sort((a, b) => Math.abs(a.pos - mid) - Math.abs(b.pos - mid));
  return along.slice(0, 1);
}

/** The street a building on this block faces: the avenue when it touches it, else the nearest street. */
export function frontStreet(city: CitySiteFacts, block: Block): Street | undefined {
  const av = avenues(city).find((s) => touches(block, s));
  if (av) return av;
  let best: Street | undefined;
  let gap = Infinity;
  for (const s of city.streets) {
    const g = streetGap(block, s);
    if (g < gap) {
      gap = g;
      best = s;
    }
  }
  return best;
}

const isLot = (b: Block) => b.kind === "lot" && !/park/i.test(b.zone);
const isCore = (b: Block) => /downtown|commercial|core|tower|office/i.test(b.zone);

/** Largest podium width that fits a block: 70 % of the shorter side. */
export function blockFootprint(block: Block): number {
  return 0.7 * Math.min(block.rect.x1 - block.rect.x0, block.rect.z1 - block.rect.z0);
}

/** Center and facing of a building on a block: the front faces the street, set back a little from the lot edge. */
export function placeOnBlock(city: CitySiteFacts, block: Block, ext: LocalExtent, facingIn?: number): { at: { x: number; z: number }; facing: number } {
  const r = block.rect;
  const street = frontStreet(city, block);
  const facing = facingIn ?? (street ? facingToward(block, street) : 0);
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const side = Math.min(r.x1 - r.x0, r.z1 - r.z0);
  const set = Math.max(2, side * 0.08);
  const q = ((Math.round(facing / 90) % 4) + 4) % 4;
  if (Math.abs(facing - q * 90) > 1) return { at: { x: cx, z: cz }, facing };
  // Front edge of the block on the facing side; the center goes back from it, but stays on the block.
  const fit = (lo: number, hi: number, want: number) => (lo > hi ? (lo + hi) / 2 : clamp(want, lo, hi));
  if (q === 0) return { at: { x: cx, z: fit(r.z0 + set + ext.back, r.z1 - set - ext.front, r.z1 - set - ext.front) }, facing };
  if (q === 2) return { at: { x: cx, z: fit(r.z0 + set + ext.front, r.z1 - set - ext.back, r.z0 + set + ext.front) }, facing };
  if (q === 1) return { at: { x: fit(r.x0 + set + ext.back, r.x1 - set - ext.front, r.x1 - set - ext.front), z: cz }, facing };
  return { at: { x: fit(r.x0 + set + ext.front, r.x1 - set - ext.back, r.x0 + set + ext.front), z: cz }, facing };
}

/** A place beside the city: outside the ground slab, in line with the end of the avenue nearer the anchor. */
export function placeBeside(city: CitySiteFacts, radius: number, anchor: { x: number; z: number }): { at: { x: number; z: number }; facing: number } {
  const av = avenues(city)[0];
  const g = city.groundRect;
  const axis = av?.axis ?? city.avenueAxis;
  const gap = radius + 6;
  if (axis === "x") {
    const z = av ? av.pos : (g.z0 + g.z1) / 2;
    const east = Math.abs(anchor.x - g.x1) <= Math.abs(anchor.x - g.x0);
    return east ? { at: { x: g.x1 + gap, z }, facing: 270 } : { at: { x: g.x0 - gap, z }, facing: 90 };
  }
  const x = av ? av.pos : (g.x0 + g.x1) / 2;
  const south = Math.abs(anchor.z - g.z1) <= Math.abs(anchor.z - g.z0);
  return south ? { at: { x, z: g.z1 + gap }, facing: 180 } : { at: { x, z: g.z0 - gap }, facing: 0 };
}

/** The best block for a tower: a downtown or commercial lot on the avenue, nearest the city center. */
function centralBlock(city: CitySiteFacts): Block | undefined {
  const c = { x: (city.streetsRect.x0 + city.streetsRect.x1) / 2, z: (city.streetsRect.z0 + city.streetsRect.z1) / 2 };
  const dist = (b: Block) => Math.hypot((b.rect.x0 + b.rect.x1) / 2 - c.x, (b.rect.z0 + b.rect.z1) / 2 - c.z);
  const lots = city.blocks.filter(isLot);
  const av = avenues(city);
  const onAvenue = (b: Block) => av.some((s) => touches(b, s));
  const pools = [lots.filter((b) => isCore(b) && onAvenue(b)), lots.filter((b) => !/industr/i.test(b.zone) && onAvenue(b)), lots.filter(isCore), lots];
  for (const pool of pools) if (pool.length) return [...pool].sort((a, b) => dist(a) - dist(b))[0];
  return undefined;
}

/** A corner block of the grid (not the central one), downtown first, then nearest the anchor. */
function cornerBlock(city: CitySiteFacts, not: Block | undefined, anchor: { x: number; z: number }): Block | undefined {
  const lots = city.blocks.filter((b) => isLot(b) && b !== not);
  if (!lots.length) return undefined;
  const is = city.blocks.map((b) => b.i);
  const js = city.blocks.map((b) => b.j);
  const iMin = Math.min(...is);
  const iMax = Math.max(...is);
  const jMin = Math.min(...js);
  const jMax = Math.max(...js);
  const corner = (b: Block) => (b.i === iMin || b.i === iMax) && (b.j === jMin || b.j === jMax);
  const edge = (b: Block) => b.i === iMin || b.i === iMax || b.j === jMin || b.j === jMax;
  const dist = (b: Block) => Math.hypot((b.rect.x0 + b.rect.x1) / 2 - anchor.x, (b.rect.z0 + b.rect.z1) / 2 - anchor.z);
  const score = (b: Block) => (isCore(b) ? 0 : 1) * 1e6 + dist(b);
  for (const pool of [lots.filter(corner), lots.filter(edge)]) if (pool.length) return [...pool].sort((a, b) => score(a) - score(b))[0];
  return undefined;
}

function zoneWord(b: Block): string {
  if (/downtown|core/i.test(b.zone)) return "Downtown";
  if (/commercial/i.test(b.zone)) return "Commercial";
  if (/industr/i.test(b.zone)) return "Industrial";
  if (/resid|low/i.test(b.zone)) return "Low-rise";
  return "City";
}

export function blockOf(city: CitySiteFacts, i: number, j: number): Block | undefined {
  return city.blocks.find((b) => b.i === i && b.j === j);
}

/** A block place (center, facing, the footprint that fits, the lot y). */
export function blockPlace(city: CitySiteFacts, block: Block, ext: LocalExtent, label: string, facing?: number): Place {
  const pos = placeOnBlock(city, block, ext, facing);
  return { id: `block:${block.i},${block.j}`, label, ...pos, block, maxFootprint: blockFootprint(block), y: lotY(city) };
}

/**
 * Places to offer in a city: (1) the central block on the avenue, (2) a corner block at the edge,
 * (3) beside the city. Never a park or a plaza, never a street.
 * ext(maxFootprint) gives the building extent for a block that allows that footprint.
 */
export function cityPlaces(city: CitySiteFacts, ext: (maxFootprint: number) => LocalExtent, radius: number, anchor: { x: number; z: number }): Place[] {
  const out: Place[] = [];
  const central = centralBlock(city);
  if (central) {
    const onAvenue = avenues(city).some((s) => touches(central, s));
    out.push(blockPlace(city, central, ext(blockFootprint(central)), `${zoneWord(central)}${onAvenue ? ", on the avenue" : ", near the center"}`));
  }
  const corner = cornerBlock(city, central, anchor);
  if (corner) out.push(blockPlace(city, corner, ext(blockFootprint(corner)), `${zoneWord(corner)} corner, at the edge`));
  out.push({ id: "beside", label: "Beside the city", ...placeBeside(city, radius, anchor) });
  return out;
}

// ── Other sites ───────────────────────────────────────────────

const overlap = (a: SiteRect, b: SiteRect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/**
 * Moves a place off other sites: when its rectangle overlaps one, it goes to the nearest side of
 * that site, 3 m clear. Bounded: one pass for each site. Returns the title of the first site it left.
 */
export function avoidSites(at: { x: number; z: number }, ext: LocalExtent, facing: number, sites: BuiltSite[]): { at: { x: number; z: number }; movedFrom?: string } {
  let cur = { ...at };
  let movedFrom: string | undefined;
  for (let pass = 0; pass <= sites.length; pass++) {
    const mine = worldRect(cur, ext, facing);
    const hit = sites.find((s) => overlap(s.facts.rect, mine));
    if (!hit) break;
    movedFrom ??= hit.title;
    const r = hit.facts.rect;
    const hx = (mine.x1 - mine.x0) / 2;
    const hz = (mine.z1 - mine.z0) / 2;
    const ox = cur.x - (mine.x0 + mine.x1) / 2;
    const oz = cur.z - (mine.z0 + mine.z1) / 2;
    const moves = [
      { x: r.x0 - 3 - hx + ox, z: cur.z },
      { x: r.x1 + 3 + hx + ox, z: cur.z },
      { x: cur.x, z: r.z0 - 3 - hz + oz },
      { x: cur.x, z: r.z1 + 3 + hz + oz }
    ];
    moves.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z));
    cur = moves[0];
  }
  return { at: cur, ...(movedFrom ? { movedFrom } : {}) };
}

// Ports bundle lines 21968-22335: per-species look (wind, tints, bloom phases), the season state that drives the
// flora uniforms, and the yearly window helpers.
import * as THREE from 'three';
import { SPECIES, bloomAmount, type SpeciesId, type YearWindow } from './species';
import type { FloraUniforms } from './shader';

export const SUNFLOWER_PIVOT = new THREE.Vector3(0, 0.96, 0); // Wl (21968)

/**
 * Yearly envelope: 0 before `rise`, eases up to 1 at `full`, stays 1 until `fade`, eases down to 0 at `end`.
 * All four are year fractions and may wrap over the new year.
 */
export function seasonWindow(yearFrac: number, rise: number, full: number, fade: number, end: number): number { // Gl (21969)
  const wrap = (x: number) => ((x % 1) + 1) % 1;
  const t = wrap(yearFrac - rise);
  const f = wrap(full - rise);
  const d = wrap(fade - rise);
  const e = wrap(end - rise) || 1;
  return t <= f ? (f <= 0 ? 1 : smooth01(t / f)) : t <= d ? 1 : t <= e ? 1 - smooth01((t - d) / Math.max(1e-6, e - d)) : 0;
}

export const smooth01 = (x: number): number => { // Kl (21977)
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

type Quad = [number, number, number, number];

export interface TintDef {
  cols: [string, string];
  at: Quad;
  amt?: number;
}

export interface SpeciesLook {
  /** seasonWindow of the leaves (deciduous). */
  leaves?: Quad;
  /** seasonWindow of dormancy (herbs die back). */
  dormant?: Quad;
  tints?: TintDef[];
  /** Reference colour of the foliage: its luminance normalises the seasonal tint. */
  ref?: string;
  headRef?: string;
  budLead?: number;
  seedLen?: number;
  budCol?: string;
  seedCol?: string;
  varCols?: [string, string, string, string];
  /** 1: petals take the variant colours, 2: heads too. */
  varOn?: number;
  /** 1 sunflower, 2 water lily, 3 lily pad. */
  special?: number;
  /** Share of optional sub-parts hidden per instance. */
  thin?: number;
  frost?: number;
  /** [height sway, flex sway, flutter]. */
  wind: [number, number, number];
  shadow?: boolean;
  doubleSide?: boolean;
  size?: (yearFrac: number) => number;
}

export const AUTUMN_AT: Quad = [0.5, 0.6, 0.94, 0.97]; // ql (21981)
export const dormantTint = (at: number): TintDef => ({ cols: [`#c9b46a`, `#b59a50`], at: [at - 0.09, at - 0.01, 0.97, 0.99], amt: 0.85 }); // Jl (21982)

export const SPECIES_LOOK: Record<SpeciesId, SpeciesLook> = { // Yl (21983)
  oak: {
    leaves: [0.965, 0.05, 0.7, 0.79],
    tints: [
      { cols: [`#b3d66a`, `#a6cf62`], at: [0.95, 0.99, 0.04, 0.14], amt: 0.85 },
      { cols: [`#d9772f`, `#b8532e`], at: AUTUMN_AT },
    ],
    ref: `#6ea24c`,
    wind: [0.05, 0, 0.018],
    shadow: true,
  },
  birch: {
    leaves: [0.96, 0.04, 0.68, 0.77],
    tints: [
      { cols: [`#c4e27a`, `#b6da70`], at: [0.95, 0.99, 0.04, 0.14], amt: 0.7 },
      { cols: [`#f2c94c`, `#e8a93a`], at: [0.49, 0.58, 0.94, 0.97] },
    ],
    ref: `#9ccb66`,
    wind: [0.07, 0, 0.03],
    shadow: true,
  },
  cherry: {
    leaves: [0.08, 0.17, 0.66, 0.76],
    tints: [
      { cols: [`#b8d86e`, `#a8cf6c`], at: [0.07, 0.12, 0.18, 0.28], amt: 0.8 },
      { cols: [`#d94f3a`, `#e98a3a`], at: AUTUMN_AT },
    ],
    ref: `#72a852`,
    wind: [0.05, 0, 0.02],
    shadow: true,
  },
  apple: {
    leaves: [0.985, 0.07, 0.71, 0.8],
    tints: [
      { cols: [`#b6d76c`, `#a8cf6c`], at: [0.97, 0.02, 0.06, 0.16], amt: 0.75 },
      { cols: [`#e9b949`, `#d98a3a`], at: AUTUMN_AT },
    ],
    ref: `#68a04a`,
    wind: [0.045, 0, 0.018],
    shadow: true,
  },
  pine: {
    tints: [{ cols: [`#2f6048`, `#35664a`], at: [0.74, 0.8, 0.95, 1], amt: 0.5 }],
    ref: `#3f7a4f`,
    wind: [0.04, 0, 0.012],
    shadow: true,
  },
  willow: {
    leaves: [0.935, 0, 0.73, 0.82],
    tints: [
      { cols: [`#c8e27e`, `#bcdc74`], at: [0.93, 0.97, 0.04, 0.14], amt: 0.75 },
      { cols: [`#e2c95a`, `#cdb54a`], at: [0.52, 0.62, 0.94, 0.96] },
    ],
    ref: `#94bf5f`,
    wind: [0.04, 0.22, 0.025],
    shadow: true,
  },
  rose_bush: {
    leaves: [0.965, 0.05, 0.74, 0.83],
    tints: [{ cols: [`#b8683a`, `#9a5a36`], at: [0.56, 0.68, 0.94, 0.96], amt: 0.7 }],
    ref: `#477a3e`,
    varCols: [`#e25b6f`, `#f29bb0`, `#c8364a`, `#f7b99a`],
    varOn: 1,
    wind: [0.03, 0, 0.006],
    shadow: true,
  },
  lavender: {
    tints: [{ cols: [`#8a9a86`, `#7f927e`], at: [0.74, 0.82, 0.95, 1], amt: 0.4 }],
    ref: `#9db596`,
    headRef: `#9b87d4`,
    budLead: 0.16,
    seedLen: 0.18,
    budCol: `#8f96a8`,
    seedCol: `#a397a6`,
    wind: [0.03, 0.05, 0.004],
    frost: 0.5,
    shadow: true,
  },
  hydrangea: {
    leaves: [0.98, 0.06, 0.71, 0.8],
    tints: [
      { cols: [`#b8d86e`, `#a8cf6c`], at: [0.97, 0.02, 0.06, 0.16], amt: 0.6 },
      { cols: [`#b5503a`, `#c97a3a`], at: [0.56, 0.66, 0.94, 0.96], amt: 0.8 },
    ],
    ref: `#5a9148`,
    headRef: `#f0f2f8`,
    budLead: 0.08,
    seedLen: 0.4,
    budCol: `#b9d27a`,
    seedCol: `#c9a08e`,
    varCols: [`#8fb3ea`, `#f0a6c8`, `#b89be0`, `#a9d0f0`],
    varOn: 2,
    wind: [0.02, 0, 0.004],
    shadow: true,
  },
  hedge: {
    tints: [
      { cols: [`#86b862`, `#7fb05a`], at: [0, 0.05, 0.1, 0.2], amt: 0.25 },
      { cols: [`#2f5a38`, `#34603b`], at: [0.74, 0.8, 0.95, 1], amt: 0.35 },
    ],
    ref: `#3f7a3f`,
    wind: [0, 0, 0.004],
    shadow: true,
  },
  berry_bush: {
    leaves: [0.97, 0.05, 0.7, 0.8],
    tints: [{ cols: [`#c2402f`, `#d9683a`], at: [0.55, 0.64, 0.94, 0.96] }],
    ref: `#5c9447`,
    wind: [0.03, 0, 0.006],
    shadow: true,
  },
  tulip: {
    dormant: [0.34, 0.42, 0.93, 0.97],
    tints: [dormantTint(0.34)],
    ref: `#5a9463`,
    varCols: [`#ef7aa0`, `#f28c38`, `#e0453a`, `#f4c430`],
    varOn: 1,
    budLead: 0.07,
    wind: [0.04, 0.02, 0.004],
  },
  daisy: {
    dormant: [0.74, 0.8, 0.96, 0.99],
    tints: [dormantTint(0.74)],
    ref: `#5f9a4c`,
    headRef: `#f2c14e`,
    budLead: 0.04,
    seedLen: 0.05,
    budCol: `#8fb55a`,
    seedCol: `#a39a5a`,
    thin: 0.45,
    wind: [0.03, 0.02, 0.004],
  },
  poppy: {
    dormant: [0.66, 0.74, 0.08, 0.14],
    tints: [dormantTint(0.66)],
    ref: `#6f9a5a`,
    headRef: `#8fa272`,
    varCols: [`#e8483b`, `#e23a30`, `#f07a3a`, `#ec6a78`],
    varOn: 1,
    budLead: 0.08,
    seedLen: 0.14,
    budCol: `#7f9f5a`,
    seedCol: `#a0906a`,
    wind: [0.07, 0.04, 0.008],
  },
  sunflower: {
    dormant: [0.74, 0.8, 0.1, 0.28],
    tints: [dormantTint(0.72)],
    ref: `#56893f`,
    headRef: `#4a2e1c`,
    budLead: 0.12,
    seedLen: 0.16,
    budCol: `#5f8f40`,
    seedCol: `#3a2618`,
    special: 1,
    wind: [0.035, 0, 0.003],
    shadow: true,
  },
  foxglove: {
    dormant: [0.7, 0.78, 0.96, 0.99],
    tints: [dormantTint(0.7)],
    ref: `#5c8a55`,
    headRef: `#8aa860`,
    varCols: [`#c77dc2`, `#e58fb8`, `#f3e4ee`, `#f0b48a`],
    varOn: 1,
    budLead: 0.1,
    seedLen: 0.1,
    budCol: `#8aa860`,
    seedCol: `#9a8a5a`,
    wind: [0.05, 0, 0.003],
    shadow: true,
  },
  bluebell: {
    dormant: [0.3, 0.38, 0.94, 0.98],
    tints: [dormantTint(0.3)],
    ref: `#558a55`,
    varCols: [`#6f8fe0`, `#7a95e8`, `#8f7fe0`, `#e6e2f4`],
    varOn: 1,
    budLead: 0.05,
    wind: [0.04, 0.03, 0.004],
  },
  grass_tuft: {
    tints: [
      { cols: [`#a9d466`, `#bede78`], at: [0.96, 0.02, 0.08, 0.2], amt: 0.5 },
      { cols: [`#6f9a42`, `#5f8f3c`], at: [0.26, 0.34, 0.42, 0.5], amt: 0.35 },
      { cols: [`#c4b25a`, `#b8a055`], at: [0.5, 0.62, 0.72, 0.8], amt: 0.6 },
      { cols: [`#a7b78a`, `#9dab86`], at: [0.74, 0.82, 0.95, 1], amt: 0.7 },
    ],
    ref: `#86b552`,
    thin: 0.55,
    frost: 1,
    wind: [0.045, 0.03, 0.006],
    doubleSide: true,
  },
  clover: {
    dormant: [0.76, 0.82, 0.96, 0.99],
    tints: [dormantTint(0.76)],
    ref: `#4a8a3c`,
    headRef: `#f0e8e8`,
    varCols: [`#f3d9e3`, `#e9a3c0`, `#d97aa8`, `#f7f2ea`],
    varOn: 1,
    budLead: 0.03,
    seedLen: 0.03,
    budCol: `#7aa058`,
    seedCol: `#9a8a5a`,
    thin: 0.5,
    wind: [0.03, 0.01, 0.003],
  },
  fern: {
    dormant: [0.74, 0.8, 0.96, 0.99],
    tints: [
      { cols: [`#a6d06a`, `#98c862`], at: [0.97, 0.02, 0.06, 0.16], amt: 0.6 },
      { cols: [`#b8742f`, `#a0622c`], at: [0.58, 0.68, 0.96, 0.99], amt: 0.9 },
    ],
    ref: `#62a04c`,
    wind: [0.03, 0.05, 0.006],
  },
  mushroom: {
    wind: [0, 0, 0],
    size: (yearFrac) => (0.5 + 0.6 * seasonWindow(yearFrac, 0.46, 0.55, 0.72, 0.78)) * (1 - seasonWindow(yearFrac, 0.76, 0.81, 0.97, 0.995)),
  },
  lily_pad: {
    dormant: [0.74, 0.8, 0.96, 0.99],
    tints: [{ cols: [`#a09a4a`, `#8a7a3a`], at: [0.6, 0.72, 0.96, 0.99], amt: 0.6 }],
    ref: `#7fb35a`,
    special: 3,
    wind: [0, 0, 0],
  },
  water_lily: {
    dormant: [0.74, 0.8, 0.96, 0.99],
    tints: [{ cols: [`#a09a4a`, `#8a7a3a`], at: [0.6, 0.72, 0.96, 0.99], amt: 0.6 }],
    ref: `#7fb35a`,
    headRef: `#f2c14e`,
    budLead: 0.06,
    seedLen: 0.04,
    budCol: `#9ab070`,
    seedCol: `#8a8a4a`,
    special: 2,
    wind: [0, 0, 0],
  },
  reeds: {
    tints: [
      { cols: [`#b8b060`, `#a8a050`], at: [0.56, 0.68, 0.95, 0.99], amt: 0.55 },
      { cols: [`#cdb57a`, `#bfa56a`], at: [0.72, 0.8, 0.95, 1], amt: 0.5 },
    ],
    ref: `#8aa84a`,
    frost: 0.7,
    wind: [0.08, 0.04, 0.006],
    shadow: true,
  },
  moss: {
    tints: [
      { cols: [`#8fbf4a`, `#9cc85a`], at: [0.98, 0.04, 0.1, 0.2], amt: 0.35 },
      { cols: [`#7a8f3a`, `#6a803a`], at: [0.74, 0.8, 0.95, 1], amt: 0.35 },
    ],
    ref: `#7ea345`,
    wind: [0, 0, 0],
  },
  succulent: {
    tints: [{ cols: [`#8aa0a0`, `#7f9aa0`], at: [0.74, 0.8, 0.95, 1], amt: 0.3 }],
    ref: `#8fbfaa`,
    headRef: `#b58a7a`,
    budLead: 0.05,
    seedLen: 0.03,
    budCol: `#9a8a7a`,
    seedCol: `#8a7a6a`,
    wind: [0, 0, 0],
  },
};

export const luminance = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // Xl (22252)
const _tintA = new THREE.Color(); // Zl (22253)
const _tintB = new THREE.Color(); // Ql (22254)

/** Writes the fixed per-species uniforms (wind, form, tint references, variant colours). */
export function applySpeciesLook(id: SpeciesId, uni: FloraUniforms): void { // $l (22255)
  const look = SPECIES_LOOK[id];
  const species = SPECIES[id];
  uni.uWind.value.set(Math.max(0.05, species.height), look.wind[0], look.wind[1], look.wind[2]);
  uni.uForm.value.set(+(species.category === `tree`), look.special ?? 0, look.thin ?? 0, species.canopyY ?? 0);
  uni.uTintP.value.set(
    0,
    luminance(new THREE.Color(look.ref ?? `#5f9e4a`)),
    luminance(new THREE.Color(look.headRef ?? look.ref ?? `#5f9e4a`)),
    look.frost ?? 0,
  );
  if (look.varCols) {
    uni.uVar0.value.set(look.varCols[0]);
    uni.uVar1.value.set(look.varCols[1]);
    uni.uVar2.value.set(look.varCols[2]);
    uni.uVar3.value.set(look.varCols[3]);
  }
  uni.uVarOn.value = look.varOn ?? 0;
  uni.uBudCol.value.set(look.budCol ?? `#7a9f55`);
  uni.uSeedCol.value.set(look.seedCol ?? `#9a8a5a`);
  if (id === `sunflower`) uni.uPivot.value.copy(SUNFLOWER_PIVOT);
}

export const wrap01 = (x: number): number => ((x % 1) + 1) % 1; // eu (22271)

interface Tint {
  a: THREE.Color;
  b: THREE.Color;
  at: Quad;
  amt: number;
}

const tintCache = new Map<SpeciesId, Tint[]>(); // tu (22272)

function speciesTints(id: SpeciesId): Tint[] { // nu (22273)
  let tints = tintCache.get(id);
  if (!tints) {
    tints = (SPECIES_LOOK[id].tints ?? []).map((e) => ({ a: new THREE.Color(e.cols[0]), b: new THREE.Color(e.cols[1]), at: e.at, amt: e.amt ?? 1 }));
    tintCache.set(id, tints);
  }
  return tints;
}

/** Seasonal amounts of each part kind (0..1) and the size factor. */
export interface SeasonState {
  leaf: number;
  blossom: number;
  fruit: number;
  flower: number;
  bud: number;
  seed: number;
  dormant: number;
  size: number;
}

/** Computes the season state of a species at yearFrac and writes uAmtA, uAmtB, uTintA, uTintB and uTintP.x. */
export function updateSeasonState(id: SpeciesId, uni: FloraUniforms, yearFrac: number, state: SeasonState): SeasonState { // ru (22282)
  const look = SPECIES_LOOK[id];
  const species = SPECIES[id];
  state.leaf = look.leaves ? seasonWindow(yearFrac, look.leaves[0], look.leaves[1], look.leaves[2], look.leaves[3]) : 1;
  const bloom = species.bloom ? bloomAmount(id, yearFrac, 0.03) : 0;
  const woody = species.category === `tree` || id === `berry_bush`;
  state.blossom = woody ? bloom : 0;
  state.flower = woody ? 0 : bloom;
  state.fruit = species.fruit ? fruitAmount(species.fruit, yearFrac, 0.03) : 0;
  state.bud = 0;
  state.seed = 0;
  if (species.bloom) {
    const lead = look.budLead ?? 0.08;
    const before = wrap01(species.bloom[0] - yearFrac);
    if (before < lead) state.bud = (1 - smooth01((before - lead * 0.5) / (lead * 0.5))) * +(before < 0.5);
    state.bud *= 1 - bloom;
    const seedLen = look.seedLen ?? 0.1;
    const after = wrap01(yearFrac - species.bloom[1]);
    if (after < seedLen + 0.03) state.seed = smooth01(after / 0.03) * (1 - smooth01((after - seedLen) / 0.03));
    state.seed *= 1 - bloom;
  }
  state.dormant = look.dormant ? seasonWindow(yearFrac, look.dormant[0], look.dormant[1], look.dormant[2], look.dormant[3]) : 0;
  if (id !== `hydrangea`) {
    state.bud *= 1 - state.dormant;
    state.seed *= 1 - state.dormant;
  }
  state.size = look.size ? look.size(yearFrac) : 1;
  uni.uAmtA.value.set(state.leaf, state.blossom, state.fruit, state.flower);
  uni.uAmtB.value.set(state.bud, state.seed, state.dormant, state.size);
  let best = 0;
  let second = 0;
  let bestIndex = -1;
  let secondIndex = -1;
  const tints = speciesTints(id);
  for (let e = 0; e < tints.length; e++) {
    const tint = tints[e];
    const w = seasonWindow(yearFrac, tint.at[0], tint.at[1], tint.at[2], tint.at[3]) * tint.amt;
    if (w > best) {
      second = best;
      secondIndex = bestIndex;
      best = w;
      bestIndex = e;
    } else if (w > second) {
      second = w;
      secondIndex = e;
    }
  }
  if (bestIndex >= 0) {
    _tintA.copy(tints[bestIndex].a);
    _tintB.copy(tints[bestIndex].b);
    if (secondIndex >= 0 && second > 0.001) {
      const k = second / (best + second);
      _tintA.lerp(tints[secondIndex].a, k);
      _tintB.lerp(tints[secondIndex].b, k);
    }
    uni.uTintA.value.copy(_tintA);
    uni.uTintB.value.copy(_tintB);
  }
  uni.uTintP.value.x = Math.max(best, second);
  return state;
}

/** Ramped 0..1 presence inside a [start, end] year window (may wrap). */
export function fruitAmount(window: YearWindow, yearFrac: number, ramp: number): number { // iu (22327)
  const [start, end] = window;
  const stop = start <= end ? end : end + 1;
  let t = yearFrac;
  if (start > end && t < start) t += 1;
  const rampIn = Math.min(1, Math.max(0, (t - start) / ramp));
  const rampOut = Math.min(1, Math.max(0, (stop - t) / ramp));
  return Math.min(rampIn, rampOut);
}

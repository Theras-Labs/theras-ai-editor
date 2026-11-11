// Ports chunk species-CSyjfb6v.js (lines 1-276).
// Index aliases: zt SPECIES, Lt SPECIES_IDS, It inBloom, Rt bloomAmount.

export type SpeciesId =
  | 'oak'
  | 'birch'
  | 'cherry'
  | 'apple'
  | 'pine'
  | 'willow'
  | 'rose_bush'
  | 'lavender'
  | 'hydrangea'
  | 'hedge'
  | 'berry_bush'
  | 'tulip'
  | 'daisy'
  | 'poppy'
  | 'sunflower'
  | 'foxglove'
  | 'bluebell'
  | 'grass_tuft'
  | 'clover'
  | 'fern'
  | 'mushroom'
  | 'lily_pad'
  | 'water_lily'
  | 'reeds'
  | 'moss'
  | 'succulent';

export type SpeciesCategory = 'tree' | 'shrub' | 'flower' | 'ground' | 'water' | 'stone';

/** A [start, end] window of the year fraction. start > end wraps over the new year. */
export type YearWindow = [number, number];

export interface Species {
  id: SpeciesId;
  name: string;
  category: SpeciesCategory;
  height: number;
  radius: number;
  canopyY?: number;
  canopyRadius?: number;
  headHeight?: number;
  bloom?: YearWindow;
  fruit?: YearWindow;
  nectar?: boolean;
  evergreen?: boolean;
  color: string;
}

const defineSpecies = (s: Species): Species => s; // e (species 1)

export const SPECIES: Record<SpeciesId, Species> = { // t (species 2), zt
  oak: defineSpecies({
    id: 'oak',
    name: 'Oak',
    category: 'tree',
    height: 3.9,
    radius: 1.3,
    canopyY: 2.75,
    canopyRadius: 1.5,
    fruit: [0.55, 0.72],
    color: '#5f9e4a',
  }),
  birch: defineSpecies({
    id: 'birch',
    name: 'Birch',
    category: 'tree',
    height: 4,
    radius: 0.9,
    canopyY: 2.9,
    canopyRadius: 1,
    color: '#8cc063',
  }),
  cherry: defineSpecies({
    id: 'cherry',
    name: 'Cherry blossom',
    category: 'tree',
    height: 3,
    radius: 1.2,
    canopyY: 2.3,
    canopyRadius: 1.4,
    bloom: [0.02, 0.2],
    nectar: true,
    fruit: [0.26, 0.36],
    color: '#f6b8c8',
  }),
  apple: defineSpecies({
    id: 'apple',
    name: 'Apple tree',
    category: 'tree',
    height: 3,
    radius: 1.1,
    canopyY: 2,
    canopyRadius: 1.2,
    bloom: [0.06, 0.2],
    nectar: true,
    fruit: [0.4, 0.68],
    color: '#d9483b',
  }),
  pine: defineSpecies({
    id: 'pine',
    name: 'Pine',
    category: 'tree',
    height: 4,
    radius: 0.9,
    canopyY: 2.1,
    canopyRadius: 0.95,
    evergreen: true,
    fruit: [0.5, 0.8],
    color: '#3f7a4f',
  }),
  willow: defineSpecies({
    id: 'willow',
    name: 'Weeping willow',
    category: 'tree',
    height: 3.5,
    radius: 1.4,
    canopyY: 2.5,
    canopyRadius: 1.45,
    color: '#9cc26a',
  }),
  rose_bush: defineSpecies({
    id: 'rose_bush',
    name: 'Rose bush',
    category: 'shrub',
    height: 0.8,
    radius: 0.45,
    headHeight: 0.7,
    bloom: [0.18, 0.55],
    nectar: true,
    fruit: [0.6, 0.85],
    color: '#e25b6f',
  }),
  lavender: defineSpecies({
    id: 'lavender',
    name: 'Lavender',
    category: 'shrub',
    height: 0.58,
    radius: 0.35,
    headHeight: 0.52,
    bloom: [0.22, 0.52],
    nectar: true,
    evergreen: true,
    color: '#9b87d4',
  }),
  hydrangea: defineSpecies({
    id: 'hydrangea',
    name: 'Hydrangea',
    category: 'shrub',
    height: 0.8,
    radius: 0.5,
    headHeight: 0.7,
    bloom: [0.26, 0.6],
    nectar: true,
    color: '#8fb3ea',
  }),
  hedge: defineSpecies({
    id: 'hedge',
    name: 'Box hedge',
    category: 'shrub',
    height: 0.7,
    radius: 0.45,
    evergreen: true,
    color: '#4f8a44',
  }),
  berry_bush: defineSpecies({
    id: 'berry_bush',
    name: 'Berry bush',
    category: 'shrub',
    height: 0.75,
    radius: 0.45,
    headHeight: 0.6,
    bloom: [0.1, 0.24],
    nectar: true,
    fruit: [0.34, 0.62],
    color: '#5a3d8a',
  }),
  tulip: defineSpecies({
    id: 'tulip',
    name: 'Tulip',
    category: 'flower',
    height: 0.35,
    radius: 0.12,
    headHeight: 0.32,
    bloom: [0.03, 0.2],
    nectar: true,
    color: '#ef7aa0',
  }),
  daisy: defineSpecies({
    id: 'daisy',
    name: 'Daisy',
    category: 'flower',
    height: 0.22,
    radius: 0.1,
    headHeight: 0.2,
    bloom: [0.05, 0.62],
    nectar: true,
    color: '#fbf7ee',
  }),
  poppy: defineSpecies({
    id: 'poppy',
    name: 'Poppy',
    category: 'flower',
    height: 0.4,
    radius: 0.12,
    headHeight: 0.38,
    bloom: [0.2, 0.45],
    nectar: true,
    color: '#e8483b',
  }),
  sunflower: defineSpecies({
    id: 'sunflower',
    name: 'Sunflower',
    category: 'flower',
    height: 1.14,
    radius: 0.2,
    headHeight: 0.96,
    bloom: [0.3, 0.58],
    nectar: true,
    fruit: [0.55, 0.7],
    color: '#f4c430',
  }),
  foxglove: defineSpecies({
    id: 'foxglove',
    name: 'Foxglove',
    category: 'flower',
    height: 0.7,
    radius: 0.14,
    headHeight: 0.6,
    bloom: [0.18, 0.4],
    nectar: true,
    color: '#c77dc2',
  }),
  bluebell: defineSpecies({
    id: 'bluebell',
    name: 'Bluebell',
    category: 'flower',
    height: 0.24,
    radius: 0.1,
    headHeight: 0.2,
    bloom: [0.04, 0.18],
    nectar: true,
    color: '#6f8fe0',
  }),
  grass_tuft: defineSpecies({
    id: 'grass_tuft',
    name: 'Meadow grass',
    category: 'ground',
    height: 0.22,
    radius: 0.12,
    color: '#8fbf5a',
  }),
  clover: defineSpecies({
    id: 'clover',
    name: 'Clover',
    category: 'ground',
    height: 0.13,
    radius: 0.12,
    headHeight: 0.11,
    bloom: [0.15, 0.55],
    nectar: true,
    color: '#e9a3c0',
  }),
  fern: defineSpecies({ id: 'fern', name: 'Fern', category: 'ground', height: 0.32, radius: 0.3, color: '#4f9448' }),
  mushroom: defineSpecies({
    id: 'mushroom',
    name: 'Toadstool',
    category: 'ground',
    height: 0.16,
    radius: 0.08,
    color: '#d9483b',
  }),
  lily_pad: defineSpecies({
    id: 'lily_pad',
    name: 'Lily pad',
    category: 'water',
    height: 0.02,
    radius: 0.28,
    color: '#6aa84f',
  }),
  water_lily: defineSpecies({
    id: 'water_lily',
    name: 'Water lily',
    category: 'water',
    height: 0.12,
    radius: 0.3,
    headHeight: 0.08,
    bloom: [0.25, 0.6],
    nectar: true,
    color: '#f7c6d9',
  }),
  reeds: defineSpecies({
    id: 'reeds',
    name: 'Cattail reeds',
    category: 'water',
    height: 1,
    radius: 0.18,
    color: '#8a9a4a',
  }),
  moss: defineSpecies({
    id: 'moss',
    name: 'Moss',
    category: 'stone',
    height: 0.07,
    radius: 0.2,
    evergreen: true,
    color: '#6f9a3e',
  }),
  succulent: defineSpecies({
    id: 'succulent',
    name: 'Succulent',
    category: 'stone',
    height: 0.12,
    radius: 0.1,
    evergreen: true,
    bloom: [0.3, 0.45],
    color: '#86b3a0',
  }),
};

export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[]; // n (species 256), Lt

/** True when yearFrac is inside the window. A window with start > end wraps over the new year. */
function inWindow(range: YearWindow | undefined, yearFrac: number): boolean { // r (species 257)
  if (!range) return false;
  const [start, end] = range;
  return start <= end ? yearFrac >= start && yearFrac <= end : yearFrac >= start || yearFrac <= end;
}

export function inBloom(id: SpeciesId, yearFrac: number): boolean { // i (species 262), It
  return inWindow(SPECIES[id].bloom, yearFrac);
}

/** 0..1 bloom strength with linear ramps of width `ramp` at both ends of the bloom window. */
export function bloomAmount(id: SpeciesId, yearFrac: number, ramp = 0.03): number { // a (species 265), Rt
  const bloom = SPECIES[id].bloom;
  if (!bloom) return 0;
  const [start, end] = bloom;
  const stop = start <= end ? end : end + 1;
  let t = yearFrac;
  if (start > end && t < start) t += 1;
  const rampIn = Math.min(1, Math.max(0, (t - start) / ramp));
  const rampOut = Math.min(1, Math.max(0, (stop - t) / ramp));
  return Math.min(rampIn, rampOut);
}

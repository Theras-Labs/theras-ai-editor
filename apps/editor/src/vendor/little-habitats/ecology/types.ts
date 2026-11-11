// Shared shapes of the ecology system (index-BwioI7A7.js 22794-26173).
// The bundle has no type declarations; these describe the objects that Ld (25848) and its helpers build.
import type * as THREE from 'three';
import type { SpeciesId } from '../flora/species';

export interface XZ {
  x: number;
  z: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** A circle on the ground that plants and other features must keep out of. */
export interface ClearSpot {
  x: number;
  z: number;
  r: number;
}

/** One plant chosen by the placer (Cd.make, 25371). Flora draws it; ecology grows it. */
export interface Plant {
  id: string;
  species: SpeciesId;
  cornerId: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** 0..1, written by the grow loop in Ld. */
  growth: number;
  variant: number;
}

export type FeatureType =
  | 'bridge'
  | 'stepping_stone'
  | 'fence'
  | 'rose_arch'
  | 'rowboat'
  | 'lantern'
  | 'insect_hotel'
  | 'beehive'
  | 'birdbath'
  | 'bench'
  | 'log_pile'
  | 'leaf_pile'
  | 'birdhouse';

/** What a feature build function returns (Bu..Qu, 23053-23630). */
export interface FeatureModel {
  geometry: THREE.BufferGeometry;
  /** Emissive lantern glass (Wu). */
  glow?: THREE.BufferGeometry;
  /** Wind-swayed leaves that turn in autumn (Zu). */
  leaves?: THREE.BufferGeometry;
  /** Wind-swayed blooms that follow the rose bloom (Zu). */
  blooms?: THREE.BufferGeometry;
  /** Part that bobs on the water (Qu). */
  moving?: THREE.BufferGeometry;
  perches: THREE.Vector3[];
  anim: 'pop' | 'rise';
  /** Radius of the additive glow disc on the ground (Wu). */
  glowDisc?: number;
  /** Local position of the point light (Wu). */
  light?: THREE.Vector3;
}

/** A feature found by the detector (md, 23795). */
export interface FeatureSpec {
  id: string;
  type: FeatureType;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  clear: ClearSpot[];
  build: () => FeatureModel;
}

/** The public record of a live feature (Ed.create `inst`, 25690). */
export interface FeatureInstance {
  id: string;
  type: FeatureType;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** World-space perch points. */
  perches: Point3[];
}

/** A connected group of water corners (_d.computeBodies, 24725). */
export interface WaterBody {
  id: number;
  corners: number[];
  area: number;
  /** True when no corner of the body is on the island boundary (a pond, not the sea). */
  enclosed: boolean;
  center: Point3;
}

export interface HabitatTree {
  plantId: string;
  species: SpeciesId;
  base: Point3;
  canopy: Point3;
  canopyRadius: number;
  mature: boolean;
}

/** A flower head, shrub, lily pad or reed bed in the habitat index. */
export interface HabitatSpot {
  plantId: string;
  species: SpeciesId;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface LandPointOptions {
  material?: 'water' | 'soil' | 'stone';
  minHeight?: number;
}

/**
 * The habitat index that creatures read (yd, 24841). The fallback in PM (cM, 59151) has the same members,
 * so this interface holds only the public part.
 */
export interface Habitat {
  version: number;
  flowers: HabitatSpot[];
  trees: HabitatTree[];
  shrubs: HabitatSpot[];
  perches: Point3[];
  waterBodies: WaterBody[];
  lilyPads: HabitatSpot[];
  reeds: HabitatSpot[];
  features: FeatureInstance[];
  counts: Partial<Record<SpeciesId, number>>;
  landArea: number;
  meadowArea: number;
  stoneArea: number;
  pondArea: number;
  randomLandPoint(rng: { next(): number }, opts?: LandPointOptions): Point3 | null;
  randomWaterPoint(rng: { next(): number }, bodyId?: number): Point3 | null;
  moistureAt(x: number, z: number): number;
  shadeAt(x: number, z: number): number;
}

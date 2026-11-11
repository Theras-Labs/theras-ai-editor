// Types for the landmark catalog (I_ 35107-35516) and the landmark system createLandmarks (B_ 35520-35804).
// Every shape here is the shape B_ builds or reads. Owners landmarks-a, landmarks-b and landmarks-c import these.
import type * as THREE from 'three';
import type { ClockState } from '../core/clock';
import type { Grid } from '../core/grid';
import type { Material, World } from '../core/world';
import type { Habitat } from '../ecology/types';
import type { Game } from '../game/types';

/** The ecology habitat (game.ecology.habitat) that B_ hands to detect. */
export type LandmarkHabitat = Habitat;

/** A plain point. */
export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

/** A closed pond: water corners that the flood fill from the rim does not reach. B_ m(): `c` (35560). */
export interface LandmarkPond {
  id: number;
  corners: number[];
}

/** The context that detect receives. B_ m(time) (35539-35635). */
export interface LandmarkDetectContext {
  game: Game;
  grid: Grid;
  world: World;
  habitat: LandmarkHabitat;
  time: ClockState;
  seed: number;
  /** Ids of all corners that are not on the grid boundary. */
  corners: number[];
  /** Height level of a corner. */
  h(id: number): number;
  mat(id: number): Material;
  sown(id: number): boolean;
  land(id: number): boolean;
  water(id: number): boolean;
  /** True when the corner is on the grid boundary. */
  rim(id: number): boolean;
  nbrs(id: number): number[];
  /** True when the water corner connects to the outer lake. */
  lake(id: number): boolean;
  /** Pond id of a closed-water corner, or -1. */
  pond(id: number): number;
  ponds: LandmarkPond[];
  /** Corner position at its surface: levelY(height) on land, CONFIG.WATER_Y on water. */
  top(id: number): THREE.Vector3;
  heightAt(x: number, z: number): number;
  /** Terrain height at (x, z) when the ring of radius r around it varies by at most tol, else null. */
  flat(x: number, z: number, r: number, tol?: number): number | null;
  /** Connected groups of non-boundary corners for which pred is true. */
  regions(pred: (id: number) => boolean): number[][];
  centroid(ids: readonly number[]): { x: number; z: number };
  /** atan2 angle from corner a to corner b in the XZ plane. */
  angle(a: number, b: number): number;
  /** Habitat trees that are mature or have canopyRadius > 0.6. */
  trees: LandmarkHabitat['trees'];
  /** Id of the highest land corner (seeded tie break), or -1. */
  highest(): number;
  /** hash01(seed, ...values). */
  h01(...values: number[]): number;
  /** True for a land corner next to the outer lake. */
  shore(id: number): boolean;
}

/** Numbers that a placement carries from detect to build. B_ puts JSON.stringify(data) in the placement signature. */
export type LandmarkData = Record<string, number>;

/** One placement that detect returns. */
export interface LandmarkPlacement {
  key: string;
  x: number;
  y: number;
  z: number;
  rotY?: number;
  /** Spacing radius between landmarks. */
  radius: number;
  /** Radius cleared of plants (ecology.setExtraClear). Default radius * 0.9. */
  clear?: number;
  data?: LandmarkData;
}

/** The per-frame context that update and poke receive. B_ `b` (35715). */
export interface LandmarkUpdateContext {
  dt: number;
  realTime: number;
  time: ClockState;
  night: number;
  /** UNIFORMS.uWindStrength.value */
  wind: number;
  /** UNIFORMS.uWindDir.value (same object) */
  windDir: THREE.Vector2;
}

/** The poke that interaction sends (gD 51719). */
export interface LandmarkPoke {
  point: LandmarkPoint;
  from: LandmarkPoint;
  /** Repeat count of pokes on the same key within 4 s, starting at 1. */
  count: number;
}

/** What build returns. B_ sets update to undefined after it throws once. */
export interface LandmarkInstance {
  object: THREE.Object3D;
  update?: (ctx: LandmarkUpdateContext) => void;
  poke?: (poke: LandmarkPoke, ctx: LandmarkUpdateContext) => boolean;
  dispose?: () => void;
}

/** One catalog entry (I_ 35107). */
export interface LandmarkDef {
  id: string;
  name: string;
  icon: string;
  tint: string;
  blurb: string;
  hint: string;
  /** Higher priority detects first and claims space first. */
  priority: number;
  /** Most placements kept per detect pass. B_ default 3. */
  max?: number;
  detect(ctx: LandmarkDetectContext): LandmarkPlacement[];
  build(p: LandmarkPlacement, seed: number): LandmarkInstance;
}

/** A live landmark in B_'s map `s`. */
export interface LandmarkEntry {
  def: LandmarkDef;
  p: LandmarkPlacement;
  /** Placement signature: position, rotation and data. */
  sig: string;
  holder: THREE.Group;
  inst: LandmarkInstance;
  /** Seconds since spawn; negative while the spawn is staggered. */
  age: number;
  /** Seconds since removal started, or -1 while alive. */
  dying: number;
  bound: THREE.Sphere;
  boundAge: number;
}

/** landmarks.pick result. */
export interface LandmarkPick {
  id: string;
  key: string;
  distance: number;
  point: LandmarkPoint;
}

/** landmarks.instances() item. */
export interface LandmarkInstanceInfo {
  id: string;
  key: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/** Payload of the `landmark:found` event. */
export interface LandmarkFoundEvent {
  id: string;
  first: boolean;
  x: number;
  y: number;
  z: number;
}

/** Payload of the `landmark:poked` event. */
export interface LandmarkPokedEvent {
  id: string;
  key: string;
  x: number;
  y: number;
  z: number;
  count: number;
}

// Types for the wonders and festivals (index-BwioI7A7.js 35805-39374). Every shape here is the shape that
// $y (FestivalRun, 38867) builds or a festival def (Ly, 38578) reads.
import type * as THREE from 'three';
import type { ClockState } from '../core/clock';
import type { Rng } from '../core/rng';
import type { Game } from '../game/types';
import type { Assembly, GlowPools } from './assembly';
import type { Confetti } from './confetti';
import type { SitePlacer } from './placer';
import type { Fireworks, SparkField } from './sparks';

export interface Point2 {
  x: number;
  z: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** A landmark instance that a wonder uses (pb v(), 39267). */
export interface Site {
  id: string;
  key: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/** Sites of a formed wonder by landmark id; a repeated id gets `id#2`, `id#3`. */
export type Sites = Record<string, Site>;

/** A sagging rope from a to b. */
export interface Span {
  a: THREE.Vector3;
  b: THREE.Vector3;
  sag: number;
}

/** The uniforms of one festival (zy, 38761). */
export interface WonderUniforms {
  [name: string]: THREE.IUniform;
  uPopIn: THREE.IUniform<number>;
  uPopOut: THREE.IUniform<number>;
  uPopOrigin: THREE.IUniform<THREE.Vector3>;
  uLit: THREE.IUniform<number>;
  uGlowGain: THREE.IUniform<number>;
  uTwinkle: THREE.IUniform<number>;
}

/** Per-frame input of a festival show ($y `env`, 38946). */
export interface FestivalEnv {
  dt: number;
  realTime: number;
  time: ClockState;
  night: number;
  wind: number;
  windX: number;
  windZ: number;
  /** 0..1: fades in over 1.2 s and out over 1.6 s after end. */
  fade: number;
  ending: boolean;
}

/** What a festival def's build returns. */
export interface FestivalContent {
  update?: (env: FestivalEnv) => void;
  dispose?: () => void;
}

/** The context that a festival def's build receives ($y constructor `c`, 38902). */
export interface FestivalContext {
  game: Game;
  id: string;
  sites: Sites;
  list: Site[];
  center: THREE.Vector3;
  rng: Rng;
  seed: number;
  asm: Assembly;
  pools: GlowPools;
  place: SitePlacer;
  root: THREE.Group;
  uniforms: WonderUniforms;
  sparks(cap: number, fixed?: number): SparkField;
  confetti(count: number): Confetti;
  fireworks(sparks: SparkField): Fireworks;
  burst(x: number, y: number, z: number, big: boolean): void;
}

/** Twinkle amount of the two glow layers. */
export interface Twinkle {
  glow: number;
  glowSway: number;
}

/** One wonder: a set of landmarks that, when built close together, holds a festival at certain times. */
export interface WonderDef {
  id: string;
  name: string;
  icon: string;
  tint: string;
  blurb: string;
  when: string;
  /** Landmark ids that must all exist (an id can repeat). */
  requires: string[];
  /** Largest distance between any two of the landmarks. */
  maxDist: number;
  twinkle: Twinkle;
  glowGain?: number;
  active: (time: ClockState) => boolean;
  /** 0..1 light-up amount of the glow layers. */
  lit: (time: ClockState) => number;
  build: (ctx: FestivalContext) => FestivalContent;
}

/** Payload of the `wonder:formed` event. */
export interface WonderFormedEvent {
  id: string;
  first: boolean;
  x: number;
  y: number;
  z: number;
}

/** Payload of the `festival:start` event. */
export interface FestivalStartEvent {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** Payload of the `festival:end` event. */
export interface FestivalEndEvent {
  id: string;
}

/** Payload of the `festival:burst` event. */
export interface FestivalBurstEvent {
  id: string;
  x: number;
  y: number;
  z: number;
  big: boolean;
}

/** wonders.state(id). */
export type WonderState = 'none' | 'formed' | 'festival';

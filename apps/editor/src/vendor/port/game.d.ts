// Types for scene.js (the port scene code, see its header). Only what the Theras adapter
// calls is typed; the original code itself has minified names and is not type-checked.
import type * as THREE from "three";

export type PortQuality = {
  name: string;
  scale: number;
  msaa: number;
  shadow: number;
  /** Size in pixels of a full texture set (1024 or 2048). */
  tex: number;
  volSteps: number;
  ao: boolean;
  planar: number;
  bloom: boolean;
  motionBlur: boolean;
  rain: number;
};

export type PortRng = (() => number) & {
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(list: T[]): T;
  sign(): number;
  fork(): PortRng;
};

export type PortEvents = {
  on(name: string, handler: (payload: unknown) => void): () => void;
  off(name: string, handler: (payload: unknown) => void): void;
  emit(name: string, payload?: unknown): void;
};

/** A decal or a label: a material for a quad, and the width of the quad for a height of 1. */
export type PortDecal = { material: THREE.Material; aspect: number };

export type PortMaterials = {
  /** A surface by name ("paint_red", "concrete", "asphalt", ...). Cached; never dispose it. */
  get(name: string, opts?: { vertexColors?: boolean; triplanar?: boolean; scale?: number; doubleSide?: boolean; interior?: boolean; color?: number }): THREE.MeshStandardMaterial;
  emissive(color?: number, intensity?: number): THREE.MeshBasicMaterial;
  decal(name: string, opts?: Record<string, unknown>): PortDecal;
  label(text: string, opts?: Record<string, unknown>): PortDecal;
  number(n: number, opts?: Record<string, unknown>): PortDecal;
  names: string[];
  decalNames: string[];
  /** wet: 0 = dry, 1 = soaked. Shared by every surface of this factory. */
  uniforms: { wet: { value: number } };
  update(dt: number): void;
  prewarm(names?: string[]): void;
  stats(): { sets: number; textureMB: number; genMs: number; decalMB: number };
  tileOf(name: string): number | [number, number];
};

export type PortProps = {
  names(): string[];
  has(name: string): boolean;
  /** A new group. userData.size = [x, y, z] in meters, userData.colliders = boxes in its own space. */
  build(name: string, opts?: Record<string, unknown>): THREE.Group;
};

/** The original code's shared state. Each factory reads what it needs and adds its own part. */
export type PortContext = {
  THREE: typeof THREE;
  params: Record<string, string>;
  events: PortEvents;
  rng: PortRng;
  time: { t: number; dt: number; frame: number; real: number };
  quality: PortQuality;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Object3D;
  camera?: THREE.Camera;
  mats?: PortMaterials;
  props?: PortProps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [module: string]: any;
};

export const QUALITY: Record<string, PortQuality>;
export function createEvents(): PortEvents;
export function createRng(seed?: number): PortRng;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stubs: Record<string, () => any>;
export function createMaterials(ctx: PortContext): PortMaterials;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPhysics(ctx: PortContext): any;
export function createProps(ctx: PortContext): PortProps;
/** name -> [x, y, z, default surface, collider kind]. */
export const PROP_SIZES: Record<string, [number, number, number, string, string]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLevel(ctx: PortContext): Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createBackdrop(ctx: PortContext): Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGround(ctx: PortContext): Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFx(ctx: PortContext): Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createWeapon(ctx: PortContext): Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEnemies(ctx: PortContext): Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const showcases: Record<string, any>;

/** A 256 x 256 texture of random bytes: the noise source of the sky shader. */
export function createNoiseTexture(): THREE.DataTexture;
/** The sky dome: a 2 m cube that the shader draws at the far plane around the camera. */
export function createSky(noise: THREE.Texture): { mesh: THREE.Mesh; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry };
/** The environment map of the sky (no sun disc), for image-based light. Dispose it after use. */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer, sky: { material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry }): THREE.WebGLRenderTarget;
/** Puts the sun light and fits its shadow box to two boxes (the level, and the far casters). */
export function fitSunShadow(light: THREE.DirectionalLight, min: THREE.Vector3, max: THREE.Vector3, farMin: THREE.Vector3, farMax: THREE.Vector3): { width: number; height: number; depth: number };
export const SUN: { dir: THREE.Vector3; color: THREE.Color; intensity: number };
export const SKY: { zenith: THREE.Color; horizon: THREE.Color; horizonAway: THREE.Color; fog: THREE.Color };
export const BOUNDS: { min: THREE.Vector3; max: THREE.Vector3; groundY: number; seaY: number; quayX: number };

// ---- The rifle, the drone and the robot hound (see lib/resources/port/actors.ts) ----

/** The PAC-9 rifle merged by material (forward = -Z, up = +Y, right = +X, meters). New geometry each call. */
export function buildRifleGeometry(): {
  ano: THREE.BufferGeometry;
  gun: THREE.BufferGeometry;
  poly: THREE.BufferGeometry;
  plain: THREE.BufferGeometry;
  bolt: THREE.BufferGeometry;
  mag: THREE.BufferGeometry;
  round: THREE.BufferGeometry;
};
/** Adds the object-space micro detail and the rain patch. kind: 0 anodized, 1 steel, 2 polymer. */
export function patchRifleMaterial<M extends THREE.MeshStandardMaterial>(material: M, kind: number): M;
/** Rain on the rifle surfaces (0 dry, 1 wet). One value for every rifle material. */
export const RIFLE_RAIN: { value: number };
export const RIFLE_SPEC: {
  name: string;
  muzzle: [number, number, number];
  sightY: number;
  lensF: number;
  /** The sight window outline in the X-Y plane. */
  window: [number, number][];
  magPos: [number, number, number];
  [key: string]: unknown;
};
/** The text decals. Row: [atlas key, x, y, z, height, side "L" | "R" | "T", tilt?]. New material and canvas texture each call. */
export function buildRifleMarkings(rows: (string | number)[][]): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
/** The sight glass with the reticle. New geometry and material each call. */
export function buildRifleLens(window: [number, number][], z: number): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

/** A rig definition: one merged geometry with skin attributes, its material slots and its bones. */
export type PortRigDef = {
  geometry: THREE.BufferGeometry;
  slots: string[];
  bones: { name: string; parent: number; local: [number, number, number]; world: [number, number, number]; i: number }[];
  tris: number;
  /** The drone only: the rotor discs and the lamp cone, on the same bones. */
  extra?: PortRigDef;
};
/** The "gull" drone: slots shell, metal, glow, lens; extra slots disc, cone. New geometry each call. */
export function buildDroneRig(): PortRigDef & { extra: PortRigDef };
/** The quadruped "hound": slots shell, metal, glow, lens. New geometry each call. */
export function buildHoundRig(): PortRigDef;
/** Makes new bones, a skeleton and a skinned mesh (plus one for extra) on the definition geometry. */
export function assembleRig(
  def: PortRigDef,
  materials: Record<string, THREE.Material>,
  opts?: { castShadow?: boolean; receiveShadow?: boolean; radius?: number; center?: [number, number, number]; extra?: { def: PortRigDef; radius?: number } | null }
): {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton;
  extraMesh: THREE.SkinnedMesh | null;
};
/** Two-bone leg solver of the hound. Writes abd (z), hip (x) and knee (x) angles into out. */
export function solveHoundLeg(
  out: { abd: number; hip: number; knee: number; reach: number },
  x: number,
  y: number,
  z: number,
  side: number,
  l0: number,
  l1: number,
  l2: number
): { abd: number; hip: number; knee: number; reach: number };
export const DRONE_SPEC: { rotors: [number, number, number][]; gimbal: number[]; ball: number[]; lamp: number[]; [key: string]: number[] | number[][] };
export const HOUND_SPEC: {
  stand: number;
  L1: number;
  L2: number;
  l0: number;
  hipX: number;
  hipY: number;
  hipZ: number;
  footX: number;
  footZ: number[];
  legs: string[];
  side: number[];
  fore: number[];
  footR: number;
  [key: string]: unknown;
};
/** The amber lens color of the robots (linear, HDR). */
export const ROBOT_LENS_COLOR: [number, number, number];

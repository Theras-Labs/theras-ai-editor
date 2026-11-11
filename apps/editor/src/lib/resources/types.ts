// Resource library ("wiki"): one entry per thing the editor and the AI can place or apply.
// Entries are local (code or files shipped with Theras) or external (fetched from a public host).
import type * as THREE from "three";
import type { SlotRecipe } from "@/lib/build-slots/types";

export type ResourceKind =
  | "landmark" // a whole set piece: windmill, lighthouse, shrine
  | "feature" // a small built object: bench, bridge, lantern
  | "plant"
  | "recipe" // a Theras primitive recipe (dock slots)
  | "terrain" // an editable island terrain
  | "building" // a building or a modular building piece (walls, towers, roofs)
  | "creature" // a character or creature model
  | "water" // a stylized water surface with waves
  | "environment" // a whole place built in code: an arena, a desert, a town quarter
  | "sky" // a scene environment: sky dome, sun, hemisphere light, fog
  | "hdri"; // an external sky image

export type ResourceSource = "local" | "external";

export type ResourceFrame = {
  dt: number;
  /** Scene time in seconds (stops while Animate is paused). */
  time: number;
  /** 0 = day, 1 = night. */
  night: number;
};

export type ResourceInstance = {
  object: THREE.Object3D;
  update?: (frame: ResourceFrame) => void;
  dispose?: () => void;
  /** Resolves when an async model has loaded into object (for the selection box). */
  ready?: Promise<unknown>;
};

/** Values an environment entry gives to the scene while it is active. */
export type EnvironmentParams = {
  /** 0..1 time of day: 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  dayFrac: number;
  /** 0..1 time of year: 0.16 spring, 0.4 summer, 0.66 autumn, 0.9 winter. */
  yearFrac: number;
  /** 0..1 cloud cover (default: the season's own). */
  clouds?: number;
  /** "cumulus" = stylized puffy clouds; default = thin wisps. */
  cloudStyle?: "wisps" | "cumulus";
  /** Sun lens flare. */
  flare?: boolean;
};

export type ResourceEntry = {
  id: string;
  name: string;
  kind: ResourceKind;
  source: ResourceSource;
  /** Credit only (who made it). The library is organized by kind and category, not by origin. */
  origin: string;
  /** Library category for browsing, for example "Castle", "City: commercial", "Island: landmarks". */
  category?: string;
  /** Preview image URL for the library card. */
  preview?: string;
  license: string;
  tags: string[];
  description: string;
  /** Approximate radius in meters, for spacing and for the AI. */
  footprint: number;
  /** Placeable objects. appear = true when the object was just placed (play its own entry animation). */
  /** params = the node's metadata.params (parametric entries: a river path, a parts spec, a tier count). */
  create?: (seed: number, opts?: { appear?: boolean; params?: Record<string, unknown> }) => ResourceInstance;
  /** Node name for a placement with this seed (default: the entry name). */
  nameFor?: (seed: number) => string;
  /** The object animates its own appearance (plants grow), so the editor does not rise it in. */
  selfAnimates?: boolean;
  /** Primitive recipe objects (placed as editor primitives). */
  recipe?: SlotRecipe;
  /** Environments. */
  environment?: EnvironmentParams;
  /** External file. */
  url?: string;
};

// Object modeler: parts spec (data written by a model) -> validated, self-checked -> meshes.
export * from "./spec";
export { buildParts, partBounds, partInstances, shapeGeometry, type BuildOptions, type BuiltParts } from "./build";
export { checkSpec, type CheckReport } from "./check";
export { EXAMPLE_BIPLANE, EXAMPLE_LAMP, MODELER_SYSTEM_PROMPT, SUBMIT_PARTS_TOOL, modelerUserMessage, specForModeler } from "./prompt";

import { buildParts, type BuiltParts } from "./build";
import { checkSpec } from "./check";
import { validateSpec, type PartsSpec } from "./spec";

/** Validation and self-check in one call. */
export function prepareSpec(input: unknown): { spec: PartsSpec; issues: string[]; dropped: number; snapped: number } | { error: string } {
  const v = validateSpec(input);
  if ("error" in v) return v;
  const c = checkSpec(v.spec);
  if (c.spec.stages.length === 0) return { error: "no part is left after the self-check" };
  return { spec: c.spec, issues: [...v.issues, ...c.issues], dropped: c.dropped, snapped: c.snapped };
}

/**
 * Params of a "gen:parts" node (metadata.params): the spec, how many stages are shown during
 * the live build (absent = all), and the longest side in meters (absent = spec.size).
 */
export type PartsParams = { spec: PartsSpec; shown?: number; sizeMeters?: number };

/** Builds a node's object from its params. Invalid params throw (the viewport logs and skips). */
export function buildFromParams(params: Record<string, unknown>, options: { appear?: boolean; seed?: number } = {}): BuiltParts {
  // Specs written by this generator are already checked; validation again keeps files from disk safe.
  const v = validateSpec(params.spec);
  if ("error" in v) throw new Error(`parts spec: ${v.error}`);
  const shown = typeof params.shown === "number" && Number.isFinite(params.shown) ? Math.round(params.shown) : undefined;
  const size = typeof params.sizeMeters === "number" && Number.isFinite(params.sizeMeters) ? Math.min(60, Math.max(0.1, params.sizeMeters)) : undefined;
  return buildParts(v.spec, { shown, fitSize: size, reveal: options.appear === true, seed: options.seed });
}

// Parametric library entries: river. Each entry builds its object from opts.params (the node's
// metadata.params), so one entry can be a river of any shape or an object of any parts list.
//
// "water:river": a flowing river ribbon (src/lib/resources/water/river-water.ts) along a course
// from the river generator (src/lib/copilot/director/generators/river.ts). The id starts with
// "water" and the kind is "water", so the layout solver treats it as a ground cover, never as
// an obstacle. Without params (the library card, a drop from the library) it is a 26 m S-curve.
import { defaultRiverParams, readRiverParams } from "@/lib/generators/river/params";
import { createRiver } from "../water/river-water";
import type { ResourceEntry } from "../types";

export const RIVER_ENTRIES: ResourceEntry[] = [
  {
    id: "water:river",
    // Not "River": the instant library path (instant-path.ts) places an entry whose name holds
    // every word of the prompt, and "add river" must reach the river generator (a course that
    // fits the scene), not a fixed S-curve at the camera target.
    name: "Flowing water",
    kind: "water",
    source: "local",
    origin: "Stylized Water",
    category: "Water",
    license: "MIT (MatrixRex, norio)",
    tags: ["water", "river", "stream", "creek", "brook", "canal", "flow", "stylized"],
    description:
      "A flowing river: stylized water on a ribbon along a winding course, moving downstream, with foam along the banks. On flat ground it has a bed and grass banks. Use the river generator for a course that fits the scene.",
    footprint: 3,
    selfAnimates: true,
    create: (seed, opts) => {
      const params = readRiverParams(opts?.params) ?? { ...defaultRiverParams(), seed };
      return createRiver(params, Boolean(opts?.appear));
    }
  }
];

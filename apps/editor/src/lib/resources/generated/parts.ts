// Parametric library entries: parts. Each entry builds its object from opts.params (the node's
// metadata.params), so one entry can be a river of any shape or an object of any parts list.
// "gen:parts": an object of the object modeler (src/lib/generators/parts). params = PartsParams
// { spec, shown?, sizeMeters? }. Without params (library thumbnail) it shows the street lamp example.
import { EXAMPLE_LAMP, buildFromParams } from "@/lib/generators/parts";
import type { ResourceEntry } from "../types";

export const PARTS_ENTRIES: ResourceEntry[] = [
  {
    id: "gen:parts",
    name: "Modeled object",
    kind: "feature",
    source: "local",
    origin: "Theras AI object modeler",
    license: "Owned by the Theras AI author",
    category: "Generated",
    tags: ["generated", "parts", "modeler"],
    description: "An object built by the object modeler from a parts spec. Placed by the object generator, not by search.",
    // The real footprint depends on the spec; the generator stores it in the node metadata (footprint).
    footprint: 1,
    // The object reveals its stages with its own scan-line shader, so the viewport does not rise it in.
    selfAnimates: true,
    create: (seed, opts) => {
      const built = buildFromParams(opts?.params?.spec ? opts.params : { spec: EXAMPLE_LAMP }, { appear: opts?.appear, seed });
      return { object: built.object, update: built.update, dispose: built.dispose };
    }
  }
];

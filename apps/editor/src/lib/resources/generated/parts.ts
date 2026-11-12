// Parametric library entries: parts. Each entry builds its object from opts.params (the node's
// metadata.params), so one entry can be a river of any shape or an object of any parts list.
// "gen:parts": an object of the object modeler (src/lib/generators/parts). params = PartsParams
// { spec, shown?, sizeMeters? }. Without params (library thumbnail) it shows the street lamp example.
// With a renderer, the flat-colored object gets the shader-drawn Port surfaces when the kit
// is ready (the build itself stays synchronous, so a test or a thumbnail without a renderer still
// gets the flat look).
import { EXAMPLE_LAMP, buildFromParams, surfaceDef, type MaterialProvider } from "@/lib/generators/parts";
import { portKit, type PortKit } from "../port/kit";
import type { ResourceEntry, ResourceFrame } from "../types";

/** Port materials for the parts surfaces. Kit materials are shared and cached: never dispose. */
function kitProvider(kit: PortKit): MaterialProvider {
  return (surface, hex) => {
    const def = surfaceDef(surface);
    return kit.ctx.mats.get(def.preset, {
      // Object space mapping: the parts have no UVs.
      triplanar: true,
      // The vertex color carries the shade (gradient, ground AO, jitter) only.
      vertexColors: true,
      // A wrong outline winding never makes a part disappear (as with the flat material).
      doubleSide: true,
      ...(def.tint ? { color: parseInt(hex.slice(1), 16) } : {})
    });
  };
}

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
      let disposed = false;
      let kit: PortKit | null = null;
      const renderer = opts?.renderer;
      const ready = renderer
        ? portKit(renderer).then((k) => {
            if (disposed) return;
            kit = k;
            built.applyMaterials(kitProvider(k));
          })
        : Promise.resolve();
      // Without the kit the object keeps its flat colors; that is a usable result, not an error.
      ready.catch((error) => console.warn("[library] could not load the port surfaces for a modeled object:", error));
      return {
        object: built.object,
        update(frame: ResourceFrame) {
          built.update?.();
          kit?.tick(frame.dt);
        },
        dispose() {
          disposed = true;
          built.dispose();
        }
      };
    }
  }
];

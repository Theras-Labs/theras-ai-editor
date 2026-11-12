// Library entries: the props of the port scene, built in code by the original builders.
// "Procedural" here means full code: no image, no model file, no download. A prop is geometry
// made by a function, and its paint, rust, dirt, labels and logos are drawn by shaders.
//
// Credit: this code was written by Claude Fable 5.2 (a public claude.ai artifact,
// https://claude.ai/artifact/2UXyB49DrVHFfhTMdNDFTA).
import * as THREE from "three";
import type { ResourceEntry, ResourceFrame, ResourceInstance } from "../types";
import { disposeProp, portKit, type PortKit } from "./kit";
import { createPortSky } from "./sky";
import { YARD_PLAY, createPortYard } from "./yard";

/** The tag of every entry that is made by code only. The library has a filter for it. */
export const PROCEDURAL_TAG = "procedural";

export const PORT_ORIGIN = "Claude Fable 5.2";
export const PORT_LICENSE = "Public claude.ai artifact, written by Claude Fable 5.2";
export const PORT_CREDIT = "Written by Claude Fable 5.2 (a public claude.ai artifact)";
export const PORT_CREDIT_URL = "https://claude.ai/artifact/2UXyB49DrVHFfhTMdNDFTA";

type PropRow = {
  /** The builder name in the original. */
  prop: string;
  name: string;
  /** Meters: x (length), y (height), z (width). The original table has the same numbers. */
  size: [number, number, number];
  tags: string[];
  description: string;
};

const PROPS: PropRow[] = [
  { prop: "container20", name: "Shipping container, 20 ft", size: [6.06, 2.59, 2.44], tags: ["container", "cargo", "steel", "box"], description: "A 20 ft steel shipping container with corrugated walls, corner castings, lock rods on the doors, a line logo, numbers and rust runs." },
  { prop: "container40", name: "Shipping container, 40 ft", size: [12.19, 2.59, 2.44], tags: ["container", "cargo", "steel", "box"], description: "A 40 ft steel shipping container with corrugated walls, corner castings, lock rods on the doors, a line logo, numbers and rust runs." },
  { prop: "container40hc", name: "Shipping container, 40 ft high cube", size: [12.19, 2.9, 2.44], tags: ["container", "cargo", "steel", "box", "high cube"], description: "A 40 ft high cube container, 2.9 m tall, with the same detail as the standard one." },
  { prop: "jersey_barrier", name: "Concrete barrier", size: [3, 0.81, 0.6], tags: ["barrier", "jersey", "concrete", "road", "block"], description: "A cast concrete road barrier, 3 m long, with form lines, chips and stains." },
  { prop: "light_mast", name: "Light mast, 14 m", size: [0.5, 14, 0.5], tags: ["light", "mast", "lamp", "pole", "flood light"], description: "A 14 m galvanized light mast with a head frame of flood lights." },
  { prop: "fence_panel", name: "Chain-link fence panel", size: [3, 2.4, 0.08], tags: ["fence", "chain link", "border", "steel"], description: "A 3 m panel of chain-link fence on steel posts." },
  { prop: "guard_booth", name: "Guard booth", size: [2.6, 2.7, 2.2], tags: ["booth", "cabin", "guard", "gate", "house"], description: "A small guard booth with windows, a door and a roof overhang." },
  { prop: "gate_arm", name: "Gate arm", size: [5, 1.1, 0.3], tags: ["gate", "barrier", "arm", "hazard"], description: "A 5 m boom gate with hazard stripes on a drive post." },
  { prop: "bollard_mooring", name: "Mooring bollard", size: [0.7, 0.6, 0.7], tags: ["bollard", "mooring", "quay", "cast iron"], description: "A cast mooring bollard for a quay edge." },
  { prop: "bollard_post", name: "Bollard post", size: [0.17, 1, 0.17], tags: ["bollard", "post", "yellow"], description: "A 1 m yellow steel bollard post." },
  { prop: "relay_node", name: "Relay cabinet", size: [1.2, 2.4, 0.8], tags: ["cabinet", "relay", "electric", "antenna"], description: "A grey equipment cabinet with vents, a door and status lights." },
  { prop: "shelf_rack", name: "Shelf rack", size: [2.7, 4.2, 1.1], tags: ["rack", "shelf", "warehouse", "storage"], description: "A 4.2 m orange pallet rack with beams and decks." },
  { prop: "stairs_metal", name: "Metal stairs", size: [3, 2.6, 1], tags: ["stairs", "steps", "steel", "diamond plate"], description: "A flight of steel stairs, 2.6 m up, with diamond plate treads and a handrail." },
  { prop: "catwalk", name: "Catwalk", size: [3, 1.1, 1.2], tags: ["catwalk", "walkway", "platform", "steel"], description: "A 3 m steel walkway section with railings." },
  { prop: "reefer_unit", name: "Reefer unit", size: [0.5, 2.3, 2.3], tags: ["reefer", "cooling", "container", "machine"], description: "The cooling unit on the end of a refrigerated container, with a fan grille and a control panel." },
  { prop: "barrel", name: "Steel drum", size: [0.6, 0.9, 0.6], tags: ["barrel", "drum", "oil", "steel"], description: "A 200 l steel drum with rolling hoops, a bung and worn paint." },
  { prop: "pallet", name: "Pallet", size: [1.2, 0.144, 1], tags: ["pallet", "wood", "cargo"], description: "A wood pallet, 1.2 by 1 m, with real boards and blocks." },
  { prop: "pallet_stack", name: "Pallet stack", size: [1.2, 1.15, 1], tags: ["pallet", "stack", "wood", "cargo"], description: "A stack of wood pallets, a little out of line." },
  { prop: "crate_wood", name: "Wood crate", size: [1.1, 1, 0.9], tags: ["crate", "box", "wood", "cargo"], description: "A wood shipping crate with battens and a stencil." },
  { prop: "crate_stack", name: "Crate stack", size: [1.2, 1.9, 1], tags: ["crate", "stack", "wood", "cargo"], description: "Two wood crates, one on the other." },
  { prop: "ibc_tote", name: "IBC tote", size: [1.2, 1.16, 1], tags: ["tank", "tote", "ibc", "plastic", "cage"], description: "A 1000 l plastic tank in a steel cage on a pallet base." },
  { prop: "forklift", name: "Forklift", size: [3.4, 2.2, 1.25], tags: ["forklift", "vehicle", "truck", "machine"], description: "A yellow forklift with a mast, forks, a cab frame, a seat and four wheels." },
  { prop: "cable_reel", name: "Cable reel", size: [1.3, 1.3, 0.8], tags: ["reel", "cable", "spool", "wood"], description: "A wood cable reel with a coil of cable." },
  { prop: "tire_stack", name: "Tire stack", size: [0.8, 1, 0.8], tags: ["tire", "tyre", "stack", "rubber"], description: "A stack of used tires." },
  { prop: "dumpster", name: "Dumpster", size: [1.9, 1.35, 1.1], tags: ["dumpster", "skip", "bin", "trash"], description: "A green steel dumpster with lids and fork pockets." },
  { prop: "generator", name: "Generator", size: [2.2, 1.4, 1], tags: ["generator", "machine", "power", "engine"], description: "A yellow site generator on a skid, with vents, a panel and an exhaust." },
  { prop: "jerry_can", name: "Jerry can", size: [0.35, 0.47, 0.17], tags: ["can", "fuel", "jerry", "small"], description: "A 20 l steel fuel can." },
  { prop: "traffic_cone", name: "Traffic cone", size: [0.36, 0.7, 0.36], tags: ["cone", "traffic", "road", "safety", "orange"], description: "A 70 cm traffic cone with two reflective bands and a scuffed base." },
  { prop: "gas_cylinders", name: "Gas cylinders", size: [0.9, 1.6, 0.5], tags: ["gas", "cylinder", "bottle", "rack"], description: "A rack of steel gas cylinders with valves and caps." },
  { prop: "tarp_cargo", name: "Cargo under a tarp", size: [2.4, 1.5, 1.4], tags: ["tarp", "cargo", "cover", "cloth"], description: "A load under a roped tarp with folds." },
  { prop: "sandbags", name: "Sandbags", size: [2, 0.9, 0.6], tags: ["sandbag", "wall", "cover", "bags"], description: "A low wall of stacked sandbags." },
  { prop: "toolbox_cart", name: "Toolbox cart", size: [0.9, 0.95, 0.5], tags: ["toolbox", "cart", "tools", "workshop"], description: "A red tool cart with drawers and wheels." },
  { prop: "floodlight_stand", name: "Flood light stand", size: [1, 2.2, 1], tags: ["light", "flood light", "lamp", "tripod", "work light"], description: "A work light on a tripod with two bright heads." },
  { prop: "cardboard_boxes", name: "Cardboard boxes", size: [1, 0.8, 0.8], tags: ["box", "cardboard", "carton", "cargo"], description: "A small pile of cardboard boxes with tape and prints." },
  { prop: "pipe_stack", name: "Pipe stack", size: [6, 0.9, 1.2], tags: ["pipe", "tube", "steel", "stack"], description: "A stack of 6 m rusty steel pipes on timbers." },
  { prop: "sign_post", name: "Sign post", size: [0.6, 2.4, 0.08], tags: ["sign", "post", "notice", "warning"], description: "A sign plate on a steel post." }
];

/** Entry id of a port prop. */
export const portId = (prop: string) => `proc:${prop.replace(/_/g, "-")}`;

function createProp(row: PropRow) {
  return (seed: number, opts?: { appear?: boolean; params?: Record<string, unknown>; renderer?: THREE.WebGLRenderer }): ResourceInstance => {
    const holder = new THREE.Group();
    holder.name = `port-${row.prop}`;
    const renderer = opts?.renderer;
    let disposed = false;
    let built: THREE.Group | null = null;
    let kit: PortKit | null = null;
    // Without a renderer (a test, an old caller) the holder stays empty: the surfaces are
    // drawn on the graphics card, so there is nothing to show.
    const ready = renderer
      ? portKit(renderer).then((k) => {
          if (disposed) return;
          kit = k;
          built = k.buildProp(row.prop, { seed, ...(opts?.params ?? {}) });
          holder.add(built);
        })
      : Promise.resolve();
    ready.catch((error) => console.warn(`[library] could not build the port prop "${row.prop}":`, error));
    return {
      object: holder,
      ready: ready.catch(() => undefined),
      update(frame: ResourceFrame) {
        kit?.tick(frame.dt);
      },
      dispose() {
        disposed = true;
        if (built) {
          holder.remove(built);
          disposeProp(built);
          built = null;
        }
      }
    };
  };
}

export const PORT_PROP_ENTRIES: ResourceEntry[] = PROPS.map((row) => ({
  id: portId(row.prop),
  name: row.name,
  kind: "feature",
  source: "local",
  origin: PORT_ORIGIN,
  category: "Procedural: port yard",
  license: PORT_LICENSE,
  credit: PORT_CREDIT,
  creditUrl: PORT_CREDIT_URL,
  tags: [PROCEDURAL_TAG, "harbor", "port", "industrial", ...row.tags],
  description: `${row.description} Made by code only: ${row.size[0]} x ${row.size[1]} x ${row.size[2]} m.`,
  // The radius of the footprint: half the diagonal of the base.
  footprint: Math.round(Math.hypot(row.size[0], row.size[2]) * 50) / 100,
  create: createProp(row)
}));

/** The whole place of the original scene as one library entry (kind "environment"). */
export const PORT_YARD_ID = "env:port-yard";

export const PORT_PLACE_ENTRIES: ResourceEntry[] = [
  {
    id: PORT_YARD_ID,
    name: "Port yard at dusk",
    kind: "environment",
    source: "local",
    origin: PORT_ORIGIN,
    category: "Procedural: places",
    license: PORT_LICENSE,
    credit: PORT_CREDIT,
    creditUrl: PORT_CREDIT_URL,
    tags: [PROCEDURAL_TAG, "harbor", "port", "harbor", "container", "yard", "quay", "crane", "ship", "rain", "wet", "puddles", "industrial", "dusk"],
    description: `A container port in the rain, made by code only: 47 containers in stacks along three lanes, a steel shed, a quay with a crane and a ship, a far skyline, a wet apron with puddles that mirror the scene, and rain. The fenced land is ${YARD_PLAY.x1 - YARD_PLAY.x0} by ${YARD_PLAY.z1 - YARD_PLAY.z0} m. params: rain 0 to 1.`,
    footprint: 50,
    create: createPortYard
  }
];

export const PORT_SKY_ID = "proc:sky-dusk";

export const PORT_SKY_ENTRIES: ResourceEntry[] = [
  {
    id: PORT_SKY_ID,
    name: "Dusk under rain clouds",
    kind: "sky",
    source: "local",
    origin: PORT_ORIGIN,
    category: "Procedural: skies",
    license: PORT_LICENSE,
    credit: PORT_CREDIT,
    creditUrl: PORT_CREDIT_URL,
    tags: [PROCEDURAL_TAG, "harbor", "sky", "dusk", "sunset", "overcast", "rain", "clouds", "low sun", "moody"],
    description: "A low, warm sun (13 degrees up) under a broken cloud deck, with a bright gap at the horizon on the sun side. One shader gives the sky, the light on every surface and the haze. Made by code only.",
    footprint: 0,
    sky: createPortSky
  }
];

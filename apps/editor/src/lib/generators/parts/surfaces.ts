// Surface vocabulary of the object modeler: the substance of each palette role (painted steel,
// rubber, wood, glass). The model names a surface id; code maps it to a shader-drawn Port
// preset (src/lib/resources/port/kit.ts), so the wear, grain and roughness come from the
// kit and the model never has to fake them with colors. Pure data: no three.js here, so the
// spec validation and the prompt can use it without a renderer.

export type ObjectStyle = "toy" | "realistic";

export type SurfaceDef = {
  id: string;
  /** Name of the port kit's material preset (PortMaterials.get). */
  preset: string;
  /** True: the palette hex tints the surface. False: the surface keeps its own colors. */
  tint: boolean;
  /** Short words for the prompt and the tool schema. */
  hint: string;
  /** Glass and other see-through surfaces. */
  transparent?: boolean;
};

export const SURFACES = [
  { id: "paint", preset: "paint_grey", tint: true, hint: "painted steel, chips and rust runs" },
  { id: "plastic", preset: "plastic_grey", tint: true, hint: "molded plastic" },
  { id: "metal", preset: "steel_worn", tint: true, hint: "worn bare steel" },
  { id: "steel-dark", preset: "steel_dark", tint: true, hint: "dark gunmetal" },
  { id: "aluminium", preset: "aluminium", tint: true, hint: "brushed aluminium, chrome" },
  { id: "brass", preset: "brass", tint: true, hint: "brass, bronze, copper" },
  { id: "anodized", preset: "anodized_black", tint: true, hint: "anodized metal" },
  { id: "ceramic", preset: "armor_white", tint: true, hint: "glazed ceramic, armor plate" },
  { id: "rubber", preset: "rubber", tint: true, hint: "rubber, grips, seals" },
  { id: "fabric", preset: "tarp", tint: true, hint: "canvas, cloth, tarp" },
  { id: "hull", preset: "hull_paint", tint: true, hint: "welded plate hull paint" },
  { id: "galvanized", preset: "steel_galv", tint: false, hint: "galvanized zinc steel" },
  { id: "rust", preset: "steel_rust", tint: false, hint: "rusted steel" },
  { id: "tire", preset: "tire", tint: false, hint: "tire tread" },
  { id: "wood", preset: "wood_pallet", tint: false, hint: "light wood planks" },
  { id: "wood-dark", preset: "wood_dark", tint: false, hint: "dark stained wood" },
  { id: "concrete", preset: "concrete", tint: false, hint: "concrete, stone" },
  { id: "brick", preset: "brick", tint: false, hint: "brick wall" },
  { id: "cardboard", preset: "cardboard", tint: false, hint: "cardboard" },
  { id: "rope", preset: "rope", tint: false, hint: "rope, cable" },
  { id: "carbon", preset: "carbon", tint: false, hint: "carbon fiber" },
  { id: "hazard", preset: "hazard_stripes", tint: false, hint: "yellow-black hazard stripes" },
  { id: "diamond-plate", preset: "diamond_plate", tint: false, hint: "diamond tread plate" },
  { id: "glass", preset: "glass", tint: false, hint: "glass", transparent: true }
] as const satisfies readonly SurfaceDef[];

export type SurfaceId = (typeof SURFACES)[number]["id"];

export const SURFACE_IDS: readonly SurfaceId[] = SURFACES.map((s) => s.id);

const BY_ID = new Map<string, SurfaceDef>(SURFACES.map((s) => [s.id, s]));

export function isSurfaceId(v: unknown): v is SurfaceId {
  return typeof v === "string" && BY_ID.has(v);
}

export function surfaceDef(id: SurfaceId): SurfaceDef {
  return BY_ID.get(id)!;
}

// Words in a role name and the surface they mean. The first match wins, so the specific
// words (glass, tire, rust) come before the general ones (metal). "sole" and "alu" must start
// a word ("console" is not rubber); "rocket" is not rock.
const ROLE_WORDS: [RegExp, SurfaceId][] = [
  [/glass|window|windshield|windscreen|lens|visor/, "glass"],
  [/tire|tyre/, "tire"],
  [/rubber|gasket|grip|(^|[^a-z])sole/, "rubber"],
  [/wood|plank|timber|bark/, "wood"],
  [/brass|gold|bronze|copper/, "brass"],
  [/chrome|silver|(^|[^a-z])alu/, "aluminium"],
  [/rust/, "rust"],
  [/metal|steel|iron/, "metal"],
  [/concrete|cement|stone|rock(?!et)/, "concrete"],
  [/brick/, "brick"],
  [/cloth|fabric|canvas|tarp|sail|flag/, "fabric"],
  [/rope|cable/, "rope"]
];

/**
 * The surface of a palette role that has none in the spec: from the words of the role name,
 * else painted steel for a realistic object and plastic for a toy. `hex` is not used today;
 * it is in the signature so a later rule can read the color (a near-black role, for example).
 */
export function defaultSurface(role: string, hex: string, style: ObjectStyle): SurfaceId {
  void hex;
  const r = role.toLowerCase();
  for (const [re, id] of ROLE_WORDS) if (re.test(r)) return id;
  return style === "realistic" ? "paint" : "plastic";
}

/** One line for the prompt: every surface id, comma separated. */
export function surfaceIdList(): string {
  return SURFACE_IDS.join(", ");
}

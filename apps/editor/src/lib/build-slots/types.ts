// Build slots: the shortcut dock. Each slot is a recipe of primitive parts that a tap
// places at the tapped grid cell. The AI can read and change slots with copilot tools.
import type { PrimitiveShape } from "@theras/shared";

export const SLOT_ICONS = [
  "landmark",
  "lantern",
  "sky",
  "soil",
  "stone",
  "water",
  "seeds",
  "bridge",
  "gate",
  "erase",
  "house",
  "tower",
  "lamp",
  "fence",
  "flower",
  "rock",
  "box"
] as const;
export type SlotIcon = (typeof SLOT_ICONS)[number];

export type RecipeMaterial = {
  /** Name the parts refer to. */
  key: string;
  name: string;
  color: string;
  roughness?: number;
  metalness?: number;
};

/** One primitive. x, y, z are relative to the tapped point: y = 0 is the surface, y is the part center. */
export type RecipePart = {
  shape: PrimitiveShape;
  x: number;
  y: number;
  z: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  material: string;
  rotationY?: number;
  segments?: number;
  name?: string;
};

export type SlotRecipe = {
  materials: RecipeMaterial[];
  parts: RecipePart[];
};

export type BuildSlot = {
  id: string;
  label: string;
  icon: SlotIcon;
  kind: "recipe" | "erase" | "resource" | "copy";
  /** For kind "copy": the scene node that each placement copies (with its children). */
  copyOf?: string;
  recipe?: SlotRecipe;
  /** For kind "resource": a library entry id, for example "lh:feature:bridge". */
  resourceId?: string;
  /** On an island terrain this slot shapes the terrain instead of placing its recipe. */
  terrainTool?: "soil" | "stone" | "water";
  /** Default size: 1 = as designed. Applied to every placement of this slot. */
  scale?: number;
  /**
   * Optional symbol drawn by the AI or the user: SVG inner markup for a 24 x 24 view box,
   * drawn with stroke="currentColor". Without it the icon is a 3D render of the slot.
   */
  iconSvg?: string;
};

export function isSlotIcon(v: unknown): v is SlotIcon {
  return typeof v === "string" && (SLOT_ICONS as readonly string[]).includes(v);
}

// Named color palettes for AI-built scenes (plan docs/plans/realtime-ai-harness.md, 5.9).
// The colors come from the Island kit palette (src/vendor/little-habitats/core/palette.ts),
// so materials the AI creates sit well next to the stylized library objects.
// Plain data and pure functions: no network, no model call.

export const PALETTE_ROLES = ["ground", "wood", "stone", "roof", "accent", "light"] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

export type PaletteId = "meadow" | "harbor" | "ember" | "blossom" | "moss" | "frost";

export type Palette = {
  id: PaletteId;
  name: string;
  /** One short line: the mood and when to use it. */
  mood: string;
  colors: Record<PaletteRole, string>;
};

export const PALETTES: Record<PaletteId, Palette> = {
  meadow: {
    id: "meadow",
    name: "Meadow",
    mood: "Bright summer day, fresh grass, terracotta roofs.",
    colors: { ground: "#8fbf5a", wood: "#a8744a", stone: "#b9b1a6", roof: "#cf5a36", accent: "#f4c430", light: "#fff1d6" }
  },
  harbor: {
    id: "harbor",
    name: "Harbor",
    mood: "Sand, weathered wood, sea-blue roofs, warm rope and flag accents.",
    colors: { ground: "#e6d3a3", wood: "#7d5234", stone: "#d8d0c4", roof: "#3f8fa3", accent: "#e58f65", light: "#fff1d6" }
  },
  ember: {
    id: "ember",
    name: "Ember",
    mood: "Dusk or night camp: dark grass, bark, warm fire and lantern glow.",
    colors: { ground: "#6e9f47", wood: "#7a5a44", stone: "#8f877d", roof: "#b07a4f", accent: "#e0823a", light: "#ffc46b" }
  },
  blossom: {
    id: "blossom",
    name: "Blossom",
    mood: "Spring garden: light grass, pale wood and stone, pink and lavender flowers.",
    colors: { ground: "#a8cf6c", wood: "#c99a6b", stone: "#d8d0c4", roof: "#ef7aa0", accent: "#9b87d4", light: "#fff1d6" }
  },
  moss: {
    id: "moss",
    name: "Moss",
    mood: "Quiet shrine or old forest: deep green, grey stone, lacquer red, soft evening light.",
    colors: { ground: "#6e9f47", wood: "#cf5a36", stone: "#8f877d", roof: "#4a3b2f", accent: "#f6b8c8", light: "#ffd2a1" }
  },
  frost: {
    id: "frost",
    name: "Frost",
    mood: "Winter day: snow, ice-blue roofs, dark wood, one red accent.",
    colors: { ground: "#f4f6fb", wood: "#7d5234", stone: "#b9b1a6", roof: "#dcecf2", accent: "#cf5a36", light: "#d4e6f8" }
  }
};

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

export function isPaletteId(id: string): id is PaletteId {
  return Object.prototype.hasOwnProperty.call(PALETTES, id);
}

export function isPaletteRole(role: string): role is PaletteRole {
  return (PALETTE_ROLES as readonly string[]).includes(role);
}

/** Hex color of a role in a palette, or undefined for an unknown palette or role. */
export function paletteColor(paletteId: string, role: string): string | undefined {
  if (!isPaletteId(paletteId) || !isPaletteRole(role)) return undefined;
  return PALETTES[paletteId].colors[role];
}

/** One compact line for a model prompt: "harbor: ground #e6d3a3, wood #7d5234, ...". */
export function paletteToText(paletteId: PaletteId): string {
  const p = PALETTES[paletteId];
  return `${p.id}: ${PALETTE_ROLES.map((r) => `${r} ${p.colors[r]}`).join(", ")}`;
}

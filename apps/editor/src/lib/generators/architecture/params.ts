// Parameters of the architecture generator: styles, defaults, validation and clamping.
// Pure functions: no scene, no DOM.

export const ARCH_STYLES = ["japanese-castle", "pagoda", "torii-and-shrine", "medieval-keep", "modern-tower"] as const;
export type ArchStyle = (typeof ARCH_STYLES)[number];

export const ARCH_SURROUNDS = ["none", "stone-yard", "garden"] as const;
export type ArchSurround = (typeof ARCH_SURROUNDS)[number];

/** Looks of the modern tower. */
export const TOWER_LOOKS = ["glass", "setback", "needle"] as const;
export type TowerLook = (typeof TOWER_LOOKS)[number];

/** Height range of the modern tower in world meters. */
export const TOWER_HEIGHT: { min: number; max: number; def: number } = { min: 20, max: 300, def: 60 };

export type ArchColors = { walls: string; roof: string; base: string; accent: string; timber: string };
export const COLOR_ROLES: (keyof ArchColors)[] = ["walls", "roof", "base", "accent", "timber"];

export type ArchParams = {
  style: ArchStyle;
  /** Japanese castle: stories 3..7. Pagoda: 3 or 5. Keep: stories 1..5. Modern tower: setback sections 1..4. Shrine: 1. */
  tiers: number;
  /** Width of the ground footprint in meters (the longer side). */
  footprint: number;
  /** Total height in meters, or 0 = from the style's own proportions. */
  height: number;
  colors: ArchColors;
  /** 0..1: windows, gables, ridges, stone pattern. */
  detail: number;
  seed: number;
  surround: ArchSurround;
  /** Medieval keep only: round or square plan. */
  plan: "square" | "round";
  /** Rotation in degrees about y. 0 = the front (door, steps, open side) faces +z. */
  facing: number;
  /** Modern tower only: "glass" (curtain wall), "setback" (stepped art deco with a spire), "needle" (taper and mast). */
  look: TowerLook;
  /** World position of the center (set by the generator when it places the building). */
  at?: { x: number; z: number };
  /** World y of the base (optional: else the ground or the city lot). */
  y?: number;
  /** Where it stands: "block:<i>,<j>" (a city block), "beside" (beside the city), "anchor". */
  site?: string;
};

type StyleSpec = {
  tiers: { min: number; max: number; def: number; allowed?: number[] };
  footprint: { min: number; max: number; def: number };
  colors: ArchColors;
  surround: ArchSurround;
  /** Natural total height for footprint 1 and the default tier count (used to clamp params.height). */
  label: string;
};

export const STYLE_SPECS: Record<ArchStyle, StyleSpec> = {
  "japanese-castle": {
    tiers: { min: 3, max: 7, def: 5 },
    footprint: { min: 4, max: 30, def: 8 },
    // Osaka-type keep: white plaster, green-teal copper roofs, gray granite base, gold, dark timber.
    colors: { walls: "#f1eee6", roof: "#3f7a72", base: "#a59d90", accent: "#d9a93a", timber: "#3a3833" },
    surround: "stone-yard",
    label: "Japanese castle keep"
  },
  pagoda: {
    tiers: { min: 3, max: 5, def: 5, allowed: [3, 5] },
    footprint: { min: 3, max: 16, def: 5 },
    colors: { walls: "#b8432e", roof: "#3d4247", base: "#a8a196", accent: "#d4a23c", timber: "#f0e8d6" },
    surround: "stone-yard",
    label: "pagoda"
  },
  "torii-and-shrine": {
    tiers: { min: 1, max: 1, def: 1 },
    footprint: { min: 4, max: 16, def: 7 },
    colors: { walls: "#f2ece0", roof: "#4a4e52", base: "#a8a196", accent: "#d64a2f", timber: "#8a5a3a" },
    surround: "stone-yard",
    label: "shrine and torii gate"
  },
  "medieval-keep": {
    tiers: { min: 1, max: 5, def: 3 },
    footprint: { min: 3, max: 20, def: 6 },
    colors: { walls: "#b9b1a6", roof: "#4f5866", base: "#8f877d", accent: "#c8473a", timber: "#7d5234" },
    surround: "none",
    label: "medieval keep"
  },
  "modern-tower": {
    tiers: { min: 1, max: 4, def: 3 },
    footprint: { min: 6, max: 40, def: 14 },
    colors: { walls: "#d6d8d6", roof: "#6f7780", base: "#9aa0a3", accent: "#e58f65", timber: "#6fa3c2" },
    surround: "none",
    label: "modern tower"
  }
};

/** Words in an era, style or prompt text that select a style. First match wins. */
const STYLE_WORDS: [RegExp, ArchStyle][] = [
  [/\bpagoda|stupa|tō\b/i, "pagoda"],
  [/\btorii|shrine|jinja|temple|shinto/i, "torii-and-shrine"],
  [/japan|tenshu|osaka|himeji|edo|samurai|shogun|feudal japan|nippon/i, "japanese-castle"],
  [/\bmodern|skyscraper|high.?rise|office tower|glass tower|contemporary|downtown/i, "modern-tower"],
  [/medieval|\bkeep\b|castle|fort|gothic|stone tower|donjon|tower/i, "medieval-keep"]
];

/** Colors of each tower look (walls = frame and spandrels, roof = roof and plant, timber = glass). */
export const LOOK_COLORS: Record<TowerLook, ArchColors> = {
  glass: { walls: "#c3ccd3", roof: "#737b84", base: "#8d949a", accent: "#a9bfcc", timber: "#4c7f9e" },
  setback: { walls: "#d6cbb3", roof: "#6d6a63", base: "#a3977f", accent: "#c9a24a", timber: "#3e6970" },
  needle: { walls: "#bcc5cc", roof: "#6f7780", base: "#8d949a", accent: "#e3e7ea", timber: "#5a9ab8" }
};

const LOOK_WORDS: [RegExp, TowerLook][] = [
  [/needle|taper|mast|antenna|supertall|burj|pinnacle/i, "needle"],
  [/art.?deco|setback|stepped|empire state|chrysler|spire|ziggurat|1930/i, "setback"],
  [/curtain.?wall|sleek|glass/i, "glass"]
];

export function lookFromText(text: string | undefined): TowerLook | undefined {
  if (!text) return undefined;
  const t = text.trim().toLowerCase();
  if ((TOWER_LOOKS as readonly string[]).includes(t)) return t as TowerLook;
  for (const [re, look] of LOOK_WORDS) if (re.test(t)) return look;
  return undefined;
}

/** Default podium width of a tower of this height: slender (about 1 to 8 for the shaft). */
export function towerFootprintFor(height: number): number {
  const spec = STYLE_SPECS["modern-tower"].footprint;
  return clamp(Math.round(height / 6.5), 12, 36) > spec.max ? spec.max : clamp(Math.round(height / 6.5), 12, 36);
}

export function styleFromText(text: string | undefined): ArchStyle | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().replace(/[_]/g, "-");
  for (const s of ARCH_STYLES) if (t.trim() === s || t.trim() === s.replace(/-/g, " ")) return s;
  for (const [re, s] of STYLE_WORDS) if (re.test(t)) return s;
  return undefined;
}

export function normalizeHex(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return undefined;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

/** Brief color roles that map to a building color role. */
const COLOR_ALIASES: Record<keyof ArchColors, string[]> = {
  walls: ["walls", "wall", "plaster", "body", "facade", "building"],
  roof: ["roof", "roofs", "tiles", "roofing"],
  base: ["base", "stone", "foundation", "plinth"],
  accent: ["accent", "gold", "trim", "ornament", "ornaments", "flag"],
  timber: ["timber", "wood", "beams", "frame", "glass", "window", "windows"]
};

function pickColors(input: unknown): Partial<ArchColors> {
  const out: Partial<ArchColors> = {};
  if (!input || typeof input !== "object") return out;
  const rec = input as Record<string, unknown>;
  const lower = new Map(Object.entries(rec).map(([k, v]) => [k.toLowerCase(), v]));
  for (const role of COLOR_ROLES) {
    for (const alias of COLOR_ALIASES[role]) {
      const hex = normalizeHex(lower.get(alias));
      if (hex) {
        out[role] = hex;
        break;
      }
    }
  }
  return out;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export type StyleHints = { era?: string; colors?: Record<string, string>; text?: string };

function readAt(v: unknown): { x: number; z: number } | undefined {
  if (Array.isArray(v) && v.length >= 2) {
    const x = num(v[0]);
    const z = num(v[v.length === 3 ? 2 : 1]);
    return x !== undefined && z !== undefined ? { x, z } : undefined;
  }
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const x = num(r.x);
  const z = num(r.z);
  return x !== undefined && z !== undefined ? { x, z } : undefined;
}

function readSite(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  const m = t.match(/^block[:\s]*(-?\d+)\s*,\s*(-?\d+)$/);
  if (m) return `block:${Number(m[1])},${Number(m[2])}`;
  return t === "beside" || t === "anchor" ? t : undefined;
}

/** Block indices of a site param ("block:2,1" -> [2, 1]), or undefined. */
export function siteBlock(site: string | undefined): [number, number] | undefined {
  const m = site?.match(/^block:(-?\d+),(-?\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

export type ResolvedArchParams = ArchParams & { colorsGiven: boolean; lookGiven: boolean; heightGiven: boolean; footprintGiven: boolean; facingGiven: boolean };

/**
 * Makes params valid: style from params.style, else from hints (brief era, understanding),
 * defaults per style, ranges clamped. colorsGiven tells whether any color came from the
 * params or the brief (the roof color question is asked only when none did).
 */
export function resolveArchParams(params: Record<string, unknown>, hints: StyleHints = {}): ResolvedArchParams {
  const style: ArchStyle =
    styleFromText(typeof params.style === "string" ? params.style : undefined) ??
    styleFromText(hints.era) ??
    styleFromText(hints.text) ??
    "japanese-castle";
  const spec = STYLE_SPECS[style];

  let tiers = Math.round(num(params.tiers) ?? num(params.floors) ?? num(params.stories) ?? spec.tiers.def);
  tiers = clamp(tiers, spec.tiers.min, spec.tiers.max);
  if (spec.tiers.allowed) tiers = spec.tiers.allowed.reduce((best, t) => (Math.abs(t - tiers) < Math.abs(best - tiers) ? t : best), spec.tiers.allowed[0]);

  const tower = style === "modern-tower";
  const lookParam = typeof params.look === "string" ? lookFromText(params.look) : undefined;
  const lookText = tower ? (lookFromText(hints.text) ?? lookFromText(hints.era)) : undefined;
  const look: TowerLook = lookParam ?? lookText ?? "glass";
  const lookGiven = Boolean(lookParam ?? lookText);

  const heightIn = num(params.height);
  const heightGiven = Boolean(heightIn && heightIn > 0);
  // A tower height is in world meters (20 to 300); 0 = the generator decides from the scene.
  const height = heightGiven ? (tower ? clamp(heightIn!, TOWER_HEIGHT.min, TOWER_HEIGHT.max) : heightIn!) : 0;

  const footIn = num(params.footprint) ?? num(params.width);
  const footprintGiven = footIn !== undefined;
  const footDef = tower ? towerFootprintFor(height || TOWER_HEIGHT.def) : spec.footprint.def;
  const footprint = clamp(footIn ?? footDef, spec.footprint.min, spec.footprint.max);

  const fromBrief = pickColors(hints.colors);
  const fromParams = pickColors(params.colors);
  const colors: ArchColors = { ...(tower ? LOOK_COLORS[look] : spec.colors), ...fromBrief, ...fromParams };
  const colorsGiven = Object.keys(fromBrief).length + Object.keys(fromParams).length > 0;

  const detail = clamp(num(params.detail) ?? 0.75, 0, 1);
  const seed = Math.abs(Math.round(num(params.seed) ?? 1)) % 1_000_000_007;
  const surroundIn = typeof params.surround === "string" ? params.surround.toLowerCase() : "";
  const surround: ArchSurround = (ARCH_SURROUNDS as readonly string[]).includes(surroundIn) ? (surroundIn as ArchSurround) : spec.surround;
  const plan: "square" | "round" = params.plan === "round" || params.plan === "square" ? params.plan : seed % 2 === 0 ? "round" : "square";
  const facingNum = num(params.facing);
  const facingIn = facingNum ?? 0;
  const facing = ((facingIn % 360) + 360) % 360;

  const at = readAt(params.at);
  const y = num(params.y);
  const site = readSite(params.site);

  return {
    style,
    tiers,
    footprint,
    height,
    colors,
    detail,
    seed,
    surround,
    plan,
    facing,
    look,
    ...(at ? { at } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(site ? { site } : {}),
    colorsGiven,
    lookGiven,
    heightGiven,
    footprintGiven,
    facingGiven: facingNum !== undefined
  };
}

/** Plain ArchParams (drops helper fields) for node metadata. */
export function toStoredParams(p: ArchParams): ArchParams {
  return {
    style: p.style,
    tiers: p.tiers,
    footprint: p.footprint,
    height: p.height,
    colors: { ...p.colors },
    detail: p.detail,
    seed: p.seed,
    surround: p.surround,
    plan: p.plan,
    facing: p.facing,
    look: p.look,
    ...(p.at ? { at: { x: p.at.x, z: p.at.z } } : {}),
    ...(p.y !== undefined ? { y: p.y } : {}),
    ...(p.site ? { site: p.site } : {})
  };
}

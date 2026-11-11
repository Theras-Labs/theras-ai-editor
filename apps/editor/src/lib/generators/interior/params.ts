// Interior generator: parameters, options and limits (pure, no three.js, no scene).
//
// An interior is the fit-out of ONE room: a floor finish, a ceiling with lights, and the
// furniture of its use, all sized to the room. The room is the inside of a building that a
// generator built (the lobby of a tower), or a room that stands alone (shell = true).
//
// Local frame of the room: the origin is the center of the room ON the structural floor
// (y = 0), x is the width, z is the depth, and the entrance is on the side `front`.
// The director generator (copilot/director/generators/interior.ts) puts this frame into the
// world with `at` (position and turn of the host building).

export type InteriorUse = "lobby" | "office" | "lounge" | "apartment";
export type InteriorFinish = "warm-wood" | "stone-brass" | "light-minimal" | "dark-industrial";
export type InteriorSide = "+z" | "-z" | "+x" | "-x";

export type InteriorParams = {
  use: InteriorUse;
  finish: InteriorFinish;
  /** Inner size of the room in meters: x (width) and z (depth), wall face to wall face. */
  width: number;
  depth: number;
  /** Clear height from the floor to the underside of the ceiling, meters. */
  height: number;
  /** The side with the entrance. Furniture leaves a clear way from it into the room. */
  front: InteriorSide;
  floor: boolean;
  ceiling: boolean;
  furniture: boolean;
  lights: boolean;
  /** Walls with a door opening and windows: for a room with no host building. */
  shell: boolean;
  /**
   * Floor plates above the ceiling, for a host hall that is taller than one storey (a tower
   * podium): how many, and the distance between them. From outside the hall then shows floors.
   */
  plates: number;
  storey: number;
  seed: number;
  /** Site id of the host building ("" or undefined: none). */
  host?: string;
  /** World place of the room frame: the floor center and the turn about y (radians). */
  at?: { x: number; y: number; z: number; rotY: number };
  /** Params that the brief or the stored site set (choices() does not ask about these). */
  given: string[];
};

/** Colors of a finish, as hex. */
export type InteriorPalette = {
  floor: string;
  /** Second floor tone: tile joints, plank variation, the border. */
  floorAlt: string;
  wall: string;
  ceiling: string;
  wood: string;
  metal: string;
  /** Upholstery, and a second tone for cushions and chairs. */
  fabric: string;
  fabricAlt: string;
  rug: string;
  accent: string;
  plant: string;
  /** Color of light panels and lamps. */
  light: string;
};

export const INTERIOR_USES: { id: InteriorUse; label: string; hint: string }[] = [
  { id: "lobby", label: "Lobby", hint: "Reception desk, seating group, lift core, plants" },
  { id: "office", label: "Office", hint: "Desk rows, a meeting table, shelves" },
  { id: "lounge", label: "Cafe lounge", hint: "Bar counter, small tables, sofas" },
  { id: "apartment", label: "Apartment", hint: "Living area, dining table, kitchen, bed" }
];

export const INTERIOR_FINISHES: { id: InteriorFinish; label: string; hint: string; palette: InteriorPalette }[] = [
  {
    id: "warm-wood",
    label: "Warm wood",
    hint: "Oak floor, cream walls, green and rust fabric",
    palette: { floor: "#b98a5e", floorAlt: "#a67a50", wall: "#efe6d6", ceiling: "#f5efe4", wood: "#8a5a36", metal: "#3d3a36", fabric: "#5f7d62", fabricAlt: "#c9744a", rug: "#d8c7a8", accent: "#d9a441", plant: "#4f9a4a", light: "#ffd9a0" }
  },
  {
    id: "stone-brass",
    label: "Stone and brass",
    hint: "Pale stone tiles, dark panels, brass details",
    palette: { floor: "#d9d4c8", floorAlt: "#bdb7a8", wall: "#3a4046", ceiling: "#ebe7de", wood: "#5b4130", metal: "#c9a24a", fabric: "#2f4f5f", fabricAlt: "#8c7a5b", rug: "#59616a", accent: "#c9a24a", plant: "#3f8f4c", light: "#ffe2b0" }
  },
  {
    id: "light-minimal",
    label: "Light minimal",
    hint: "White and pale wood, grey fabric",
    palette: { floor: "#e6dfd2", floorAlt: "#d6cdbd", wall: "#f6f4ef", ceiling: "#fbfaf6", wood: "#d4b58c", metal: "#9aa0a6", fabric: "#a7adb3", fabricAlt: "#6f8fa6", rug: "#eef0f1", accent: "#6f8fa6", plant: "#5aa05a", light: "#fff3da" }
  },
  {
    id: "dark-industrial",
    label: "Dark industrial",
    hint: "Polished concrete, black steel, leather",
    palette: { floor: "#6b6e70", floorAlt: "#5a5d5f", wall: "#2b2e31", ceiling: "#24272a", wood: "#6e4a2d", metal: "#1c1e20", fabric: "#7a4a2c", fabricAlt: "#3b4a52", rug: "#40464b", accent: "#e0803a", plant: "#3f8a48", light: "#ffc98a" }
  }
];

export const INTERIOR_LIMITS = {
  /** Room width and depth, meters. */
  size: [3, 60] as [number, number],
  /** Clear height, meters. */
  height: [2.4, 6] as [number, number],
  plates: [0, 4] as [number, number]
};

export const DEFAULT_INTERIOR = { width: 10, depth: 8, height: 3.2 };

export function paletteOf(finish: InteriorFinish): InteriorPalette {
  return (INTERIOR_FINISHES.find((f) => f.id === finish) ?? INTERIOR_FINISHES[0]).palette;
}

const USE_ALIASES: Record<string, InteriorUse> = {
  lobby: "lobby",
  reception: "lobby",
  foyer: "lobby",
  entrance: "lobby",
  hall: "lobby",
  atrium: "lobby",
  hotel: "lobby",
  office: "office",
  workspace: "office",
  coworking: "office",
  studio: "office",
  lounge: "lounge",
  cafe: "lounge",
  "cafe lounge": "lounge",
  coffee: "lounge",
  bar: "lounge",
  restaurant: "lounge",
  apartment: "apartment",
  home: "apartment",
  flat: "apartment",
  living: "apartment",
  "living room": "apartment",
  bedroom: "apartment",
  house: "apartment"
};

const FINISH_ALIASES: Record<string, InteriorFinish> = {
  "warm-wood": "warm-wood",
  warm: "warm-wood",
  wood: "warm-wood",
  cozy: "warm-wood",
  oak: "warm-wood",
  "stone-brass": "stone-brass",
  stone: "stone-brass",
  marble: "stone-brass",
  brass: "stone-brass",
  luxury: "stone-brass",
  hotel: "stone-brass",
  "light-minimal": "light-minimal",
  minimal: "light-minimal",
  white: "light-minimal",
  light: "light-minimal",
  scandinavian: "light-minimal",
  modern: "light-minimal",
  "dark-industrial": "dark-industrial",
  dark: "dark-industrial",
  industrial: "dark-industrial",
  loft: "dark-industrial",
  concrete: "dark-industrial"
};

const SIDES: InteriorSide[] = ["+z", "-z", "+x", "-x"];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : undefined);
const key = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[_]+/g, "-") : "");

function hashText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 1_000_000;
}

/** The use that fits a host: a tower hall is a lobby, a small room an apartment. */
export function suggestUse(hostStyle: string | undefined, width: number, depth: number): InteriorUse {
  const style = (hostStyle ?? "").toLowerCase();
  if (/tower|skyscraper|office|hotel|modern/.test(style)) return "lobby";
  if (/castle|keep|shrine|pagoda|temple/.test(style)) return "lounge";
  return width * depth < 45 ? "apartment" : "lobby";
}

/**
 * Makes params valid: synonyms mapped, defaults filled, ranges clamped. Returns an error text
 * only for input with no sensible reading. `given` lists the params that came with a value.
 */
export function normalizeInteriorParams(raw: Record<string, unknown>): InteriorParams | string {
  if (!raw || typeof raw !== "object") return "params must be an object";
  const given: string[] = [];

  let use: InteriorUse = "lobby";
  if (key(raw.use)) {
    const mapped = USE_ALIASES[key(raw.use)] ?? USE_ALIASES[key(raw.use).replace(/-/g, " ")];
    if (!mapped) return `use must be one of ${INTERIOR_USES.map((u) => `"${u.id}"`).join(", ")} (got "${String(raw.use)}")`;
    use = mapped;
    given.push("use");
  }

  let finish: InteriorFinish = "warm-wood";
  if (key(raw.finish)) {
    const mapped = FINISH_ALIASES[key(raw.finish)] ?? FINISH_ALIASES[key(raw.finish).split("-")[0]];
    if (!mapped) return `finish must be one of ${INTERIOR_FINISHES.map((f) => `"${f.id}"`).join(", ")} (got "${String(raw.finish)}")`;
    finish = mapped;
    given.push("finish");
  }

  const w = num(raw.width);
  const d = num(raw.depth);
  const h = num(raw.height);
  if (w !== undefined && d !== undefined) given.push("size");
  if (h !== undefined) given.push("height");
  const width = clamp(w ?? DEFAULT_INTERIOR.width, ...INTERIOR_LIMITS.size);
  const depth = clamp(d ?? DEFAULT_INTERIOR.depth, ...INTERIOR_LIMITS.size);
  const height = clamp(h ?? DEFAULT_INTERIOR.height, ...INTERIOR_LIMITS.height);

  const front = SIDES.includes(raw.front as InteriorSide) ? (raw.front as InteriorSide) : "+z";

  const at = raw.at && typeof raw.at === "object" ? (raw.at as Record<string, unknown>) : undefined;
  const ax = num(at?.x);
  const ay = num(at?.y);
  const az = num(at?.z);
  const host = typeof raw.host === "string" && raw.host.trim() ? raw.host.trim() : undefined;

  const plates = Math.round(clamp(num(raw.plates) ?? 0, ...INTERIOR_LIMITS.plates));
  const storey = clamp(num(raw.storey) ?? 4.5, 2.8, 8);
  const s = num(raw.seed);
  const seed = s !== undefined ? Math.abs(Math.round(s)) % 1_000_000 : hashText(`${use}|${finish}|${width.toFixed(1)}|${depth.toFixed(1)}`);

  return {
    use,
    finish,
    width,
    depth,
    height,
    front,
    floor: bool(raw.floor) ?? true,
    ceiling: bool(raw.ceiling) ?? true,
    furniture: bool(raw.furniture) ?? true,
    lights: bool(raw.lights) ?? true,
    shell: bool(raw.shell) ?? false,
    plates,
    storey,
    seed,
    ...(host ? { host } : {}),
    ...(ax !== undefined && az !== undefined ? { at: { x: ax, y: ay ?? 0, z: az, rotY: num(at?.rotY) ?? 0 } } : {}),
    given
  };
}

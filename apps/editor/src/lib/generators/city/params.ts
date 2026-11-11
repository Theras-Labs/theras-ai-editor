// City generator parameters: defaults, synonyms and clamps (pure).

/** Named sizes: neighborhood 2 x 2, town 3 x 3, city 4 x 4, metropolis 5 x 5 blocks. */
export type NamedCitySize = "neighborhood" | "town" | "city" | "metropolis";
export type CitySize = NamedCitySize | "custom";
export type CityKit = "commercial" | "industrial" | "mixed";

export type CityParams = {
  size: CitySize;
  /** Blocks along x and along z. */
  cols: number;
  rows: number;
  kit: CityKit;
  /** 0..1: how full the frontages are and how tall the center grows. */
  density: number;
  /** Library tree id, or "none". */
  streetTrees: string;
  park: boolean;
  lamps: boolean;
  seed: number;
  /** World center of the city. When set, the city is built here (a rebuild in place). */
  at?: { x: number; z: number };
  /** Params the brief set itself (choices() does not ask about these). */
  given: string[];
};

export const SIZE_GRID: Record<NamedCitySize, [cols: number, rows: number]> = {
  neighborhood: [2, 2],
  town: [3, 3],
  city: [4, 4],
  metropolis: [5, 5]
};
/** Named sizes from small to large. */
export const SIZE_IDS: NamedCitySize[] = ["neighborhood", "town", "city", "metropolis"];
export const DEFAULT_SIZE: NamedCitySize = "city";

/** The named size of a grid, or "custom". */
export function sizeOfGrid(cols: number, rows: number): CitySize {
  return SIZE_IDS.find((id) => SIZE_GRID[id][0] === cols && SIZE_GRID[id][1] === rows) ?? "custom";
}

export const MAX_BLOCKS_PER_AXIS = 5;
export const DEFAULT_STREET_TREE = "nature:tree:oak-round";

/** Short tree words the director may send, mapped to library ids. */
export const TREE_ALIASES: Record<string, string> = {
  oak: "nature:tree:oak-round",
  broadleaf: "nature:tree:oak-round",
  plane: "nature:tree:oak-round",
  linden: "nature:tree:oak-round",
  maple: "nature:tree:maple-autumn",
  autumn: "nature:tree:maple-autumn",
  birch: "nature:tree:birch",
  pine: "nature:tree:fir",
  fir: "nature:tree:fir",
  spruce: "nature:tree:fir",
  conifer: "nature:tree:fir",
  palm: "nature:tree:palm",
  cherry: "nature:tree:cherry-blossom",
  sakura: "nature:tree:cherry-blossom",
  "cherry blossom": "nature:tree:cherry-blossom",
  willow: "lh:plant:willow",
  apple: "lh:plant:apple"
};

const SIZE_ALIASES: Record<string, NamedCitySize> = {
  neighborhood: "neighborhood",
  neighbourhood: "neighborhood",
  small: "neighborhood",
  tiny: "neighborhood",
  village: "neighborhood",
  hamlet: "neighborhood",
  block: "neighborhood",
  street: "neighborhood",
  town: "town",
  medium: "town",
  mid: "town",
  normal: "town",
  district: "town",
  city: "city",
  large: "city",
  big: "city",
  metropolis: "metropolis",
  huge: "metropolis",
  giant: "metropolis",
  "big city": "metropolis",
  "large city": "metropolis",
  megacity: "metropolis",
  xl: "metropolis"
};

const KIT_ALIASES: Record<string, CityKit> = {
  commercial: "commercial",
  downtown: "commercial",
  shops: "commercial",
  modern: "commercial",
  residential: "commercial",
  industrial: "industrial",
  industry: "industrial",
  factory: "industrial",
  factories: "industrial",
  mixed: "mixed",
  mix: "mixed"
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const bool = (v: unknown): boolean | undefined => {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "yes" || v === 1) return true;
  if (v === "false" || v === "no" || v === 0) return false;
  return undefined;
};

function hashText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 1_000_000;
}

/**
 * Makes params valid: defaults filled, synonyms mapped, ranges clamped. isTree tells whether a
 * library id is a tree. Returns an error text only for input that has no sensible reading.
 */
export function normalizeCityParams(raw: Record<string, unknown>, isTree: (id: string) => boolean): CityParams | string {
  if (!raw || typeof raw !== "object") return "params must be an object";
  const given: string[] = [];

  let size: CitySize = DEFAULT_SIZE;
  let [cols, rows] = SIZE_GRID[DEFAULT_SIZE];
  if (typeof raw.size === "string" && raw.size.trim() && raw.size.trim().toLowerCase() !== "custom") {
    const key = raw.size.trim().toLowerCase();
    const mapped = SIZE_ALIASES[key];
    if (!mapped) return `size must be "neighborhood", "town", "city" or "metropolis" (got "${raw.size}")`;
    size = mapped;
    [cols, rows] = SIZE_GRID[mapped];
    given.push("size");
  }
  const c = num(raw.cols);
  const r = num(raw.rows);
  if (c !== undefined || r !== undefined) {
    const nc = Math.round(clamp(c ?? cols, 1, MAX_BLOCKS_PER_AXIS));
    const nr = Math.round(clamp(r ?? rows, 1, MAX_BLOCKS_PER_AXIS));
    // Explicit cols / rows win over size, unless they repeat the size's own grid.
    if (!(given.includes("size") && nc === cols && nr === rows)) {
      [cols, rows] = [nc, nr];
      size = sizeOfGrid(cols, rows);
    }
    if (!given.includes("size")) given.push("size");
  }

  let kit: CityKit = "commercial";
  if (typeof raw.kit === "string" && raw.kit.trim()) {
    const mapped = KIT_ALIASES[raw.kit.trim().toLowerCase()];
    if (!mapped) return `kit must be "commercial", "industrial" or "mixed" (got "${raw.kit}")`;
    kit = mapped;
    given.push("kit");
  }

  const d = num(raw.density);
  const density = d === undefined ? 0.7 : clamp(d, 0, 1);

  let streetTrees = DEFAULT_STREET_TREE;
  if (typeof raw.streetTrees === "string" && raw.streetTrees.trim()) {
    const value = raw.streetTrees.trim();
    const lower = value.toLowerCase();
    if (lower === "none" || lower === "no" || lower === "false") streetTrees = "none";
    else if (isTree(value)) streetTrees = value;
    else if (TREE_ALIASES[lower] && isTree(TREE_ALIASES[lower])) streetTrees = TREE_ALIASES[lower];
    // An unknown tree falls back to the default (the popup still offers the choice).
    if (streetTrees !== DEFAULT_STREET_TREE || lower.includes("oak")) given.push("streetTrees");
  } else if (raw.streetTrees === false) {
    streetTrees = "none";
    given.push("streetTrees");
  }

  const park = bool(raw.park) ?? cols * rows >= 6;
  const lamps = bool(raw.lamps) ?? true;

  const s = num(raw.seed);
  const seed = s !== undefined ? Math.abs(Math.round(s)) % 1_000_000 : hashText(`${size}|${cols}|${rows}|${kit}|${density}|${streetTrees}`);

  // The world center of a rebuild in place.
  const at = raw.at && typeof raw.at === "object" ? (raw.at as Record<string, unknown>) : undefined;
  const ax = num(at?.x);
  const az = num(at?.z);

  return { size, cols, rows, kit, density, streetTrees, park, lamps, seed, ...(ax !== undefined && az !== undefined ? { at: { x: ax, z: az } } : {}), given };
}

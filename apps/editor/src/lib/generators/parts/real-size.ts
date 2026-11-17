// Real sizes of common things: the longest side in meters.
// The object modeler has no sense of scale by itself: a site generator came out 4.2 m long,
// as big as the forklift beside it. The director sends sizeMeters, but it can be missing or far
// off. settleSize() gives the size that a new object is built at:
//   - the director's size, when it is near the real one or the words ask for another size;
//   - the real size from this table, when the director sent none or one that is far off;
//   - nothing, when the table does not know the thing (the modeler's own spec.size is used).
// Only things with ONE usual size are here. A tank, a ship, a tree or a robot can have any size,
// so they are not in the table. A word with two meanings is here only with its second word
// ("traffic cone", not "cone": an ice cream cone is 15 cm).

/** Longest side in meters. Keys are lower case, one or two words, singular. */
const REAL_SIZES: Record<string, number> = {
  // Site and industry
  generator: 2.2,
  genset: 2.2,
  compressor: 1.6,
  "air compressor": 1.6,
  "welding cart": 1.1,
  welder: 0.8,
  "fuel pump": 2.1,
  "gas pump": 2.1,
  "petrol pump": 2.1,
  "crane hook": 1.2,
  "cargo trolley": 1.6,
  "tool cart": 1.0,
  "hand truck": 1.3,
  "pallet jack": 1.6,
  pallet: 1.2,
  forklift: 3.4,
  "shipping container": 6.1,
  "oil drum": 0.9,
  barrel: 0.95,
  "traffic cone": 0.75,
  "jersey barrier": 3.0,
  floodlight: 2.4,
  "flood light": 2.4,
  crate: 1.0,
  cabinet: 1.8,
  locker: 1.8,
  ladder: 3.0,
  wheelbarrow: 1.5,
  toolbox: 0.55,
  "gas cylinder": 1.5,
  "propane tank": 1.2,
  dumpster: 1.9,
  "trash can": 0.9,
  "wheelie bin": 1.1,
  hydrant: 0.8,
  extinguisher: 0.6,
  bollard: 1.0,
  anvil: 0.7,
  "cement mixer": 1.6,
  "concrete mixer": 1.6,
  "transformer box": 1.8,
  // Street
  "street lamp": 6,
  "lamp post": 6,
  lamppost: 6,
  streetlight: 8,
  "traffic light": 4.5,
  "stop sign": 2.4,
  signpost: 2.5,
  mailbox: 1.2,
  "phone booth": 2.4,
  "vending machine": 1.85,
  atm: 1.6,
  "parking meter": 1.4,
  "bus stop": 3.2,
  "market stall": 3,
  kiosk: 3,
  bench: 1.6,
  "picnic table": 1.8,
  // Home and office
  table: 1.4,
  desk: 1.4,
  chair: 0.95,
  "office chair": 1.1,
  armchair: 1.0,
  stool: 0.7,
  sofa: 2.0,
  couch: 2.0,
  bed: 2.1,
  wardrobe: 2.0,
  bookshelf: 1.9,
  bookcase: 1.9,
  fridge: 1.8,
  refrigerator: 1.8,
  "washing machine": 0.85,
  stove: 0.9,
  oven: 0.9,
  toilet: 0.75,
  bathtub: 1.7,
  "floor lamp": 1.6,
  "desk lamp": 0.5,
  television: 1.2,
  tv: 1.2,
  monitor: 0.6,
  laptop: 0.35,
  piano: 1.5,
  "grand piano": 2.2,
  guitar: 1.0,
  radiator: 1.0,
  "air conditioner": 0.9,
  // Vehicles
  car: 4.5,
  "sports car": 4.4,
  sedan: 4.7,
  suv: 4.8,
  jeep: 4.2,
  taxi: 4.6,
  "pickup truck": 5.5,
  van: 5.2,
  truck: 7,
  bus: 12,
  ambulance: 6,
  "fire truck": 9,
  motorcycle: 2.1,
  motorbike: 2.1,
  scooter: 1.8,
  bicycle: 1.75,
  bike: 1.75,
  tractor: 4,
  excavator: 9,
  bulldozer: 6,
  "golf cart": 2.4,
  kart: 1.9,
  "go kart": 1.9,
  skateboard: 0.8,
  rowboat: 3.5,
  canoe: 4.5,
  kayak: 3.5,
  helicopter: 12,
  wagon: 3.5,
  cannon: 2.5,
  // Things that a person carries or uses
  backpack: 0.5,
  suitcase: 0.75,
  umbrella: 1.0,
  bottle: 0.3,
  mug: 0.12,
  teapot: 0.25,
  kettle: 0.25,
  vase: 0.35,
  camera: 0.15,
  helmet: 0.3,
  hammer: 0.33,
  wrench: 0.25,
  axe: 0.8,
  shovel: 1.4,
  sword: 1.0,
  lantern: 0.35,
  candle: 0.2,
  "shopping cart": 1.0,
  stroller: 1.0,
  wheelchair: 1.1,
  basketball: 0.24,
  telescope: 1.2,
  "satellite dish": 1.0,
  // Yard and play
  "treasure chest": 0.9,
  swing: 2.5,
  seesaw: 3,
  doghouse: 1.1,
  "dog house": 1.1,
  birdhouse: 0.35,
  scarecrow: 1.9,
  snowman: 1.6,
  grill: 1.2,
  barbecue: 1.2
};

/** The object's own words end where its place or its extras start ("generator on a skid"). */
const AFTER_SUBJECT = /\b(on|with|in|at|for|from|of|beside|near|under|next|and|that|which)\b/;

/**
 * Words that ask for a size other than the usual one. With one of them in the subject or in the
 * user's request, the director's size stands.
 */
const SIZE_WORDS =
  /\b(giant|huge|enormous|massive|colossal|big|bigger|large|larger|oversized?|small|smaller|tiny|mini|miniature|little|toy|scale model|tall|taller|long|longer|short|shorter|wide|wider|life[- ]size[d]?|double|half|twice)\b|\d+(\.\d+)?\s*(m|cm|mm|meters?|metres?|ft|feet|foot|inch|inches)\b/i;

/** A director size inside this factor of the real size (above or below) stands. */
export const SIZE_TOLERANCE = 1.6;

const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/**
 * The real longest side of the subject's head noun, when the table knows it. The head noun of
 * an English noun phrase is its last word: "yellow diesel site generator on a skid" is a
 * generator. Only the head is looked up: a "car wash" is not a car.
 */
export function realSizeOf(subject: string): { meters: number; word: string } | undefined {
  const phrase = (subject.toLowerCase().split(/[,(;:]/)[0] ?? "").split(AFTER_SUBJECT)[0] ?? "";
  const words = phrase.split(/[^a-z]+/).filter(Boolean);
  if (words.length === 0) return undefined;
  const one = singular(words[words.length - 1]!);
  if (words.length > 1) {
    const two = `${words[words.length - 2]} ${one}`;
    if (REAL_SIZES[two] !== undefined) return { meters: REAL_SIZES[two]!, word: two };
  }
  return REAL_SIZES[one] !== undefined ? { meters: REAL_SIZES[one]!, word: one } : undefined;
}

/** True when the words ask for a size of their own ("giant", "tiny", "3 m long"). */
export function asksForSize(...texts: (string | undefined)[]): boolean {
  return texts.some((t) => Boolean(t) && SIZE_WORDS.test(t!));
}

export type SettledSize = {
  /** Longest side to build at, in meters. Undefined: the modeler's own spec.size. */
  meters?: number;
  /** Where the size comes from. "real" = this table; "corrected" = the table, against the asked size. */
  source: "asked" | "real" | "corrected" | "spec";
  /** The table word that matched, for the step text. */
  word?: string;
};

/**
 * The size of a NEW object. `asked` is the director's sizeMeters. The director's size stands
 * when the words ask for a size, when the table does not know the thing, or when it is within
 * SIZE_TOLERANCE of the real size.
 */
export function settleSize(input: { subject: string; prompt?: string; asked?: number }): SettledSize {
  const { subject, prompt, asked } = input;
  const real = realSizeOf(subject);
  if (!real) return asked !== undefined ? { meters: asked, source: "asked" } : { source: "spec" };
  if (asked === undefined) return { meters: real.meters, source: "real", word: real.word };
  if (asksForSize(subject, prompt)) return { meters: asked, source: "asked" };
  const ratio = asked / real.meters;
  if (ratio > SIZE_TOLERANCE || ratio < 1 / SIZE_TOLERANCE) return { meters: real.meters, source: "corrected", word: real.word };
  return { meters: asked, source: "asked" };
}

// The Director: one model call writes a BRIEF (what to build and with which generator), then
// code builds it. The model directs; generators (code) own structure, spacing and taste.
// This file is the contract between the director core, the generators and the choice UI.
import type { EditorCore } from "@theras/editor-core";
import type { CopilotAttachment } from "../attachments";

export type GeneratorId = "compose" | "city" | "river" | "object" | "architecture" | "interior";

/** One task of a brief. A brief has 1 to 4 tasks; they run in order. */
export type BriefTask = {
  generator: GeneratorId;
  /** Short name for the folder and the chat trace: "Small city", "River", "Airplane". */
  title: string;
  /** Generator parameters. Each generator documents and validates its own. */
  params: Record<string, unknown>;
  /**
   * With brief.ambiguity: the option id this task builds (it runs only when the user chooses
   * that reading). Left out: the task runs for every reading. Added 2026-11-11 (director core).
   */
  option?: string;
  /**
   * Id of a built site (a folder from [Built], see site.ts) that this task changes. Code merges
   * params over the stored params of that site and the generator builds it again at the same
   * place, in one undo step. Added 2026-11-11 (Director v2).
   */
  replace?: string;
  /**
   * With replace: params that the user wants to choose again ("another look", "move it"): their
   * names from the change list of [Built]. Code drops them from the stored params and the
   * generator asks its question for each (ctx.ask).
   */
  ask?: string[];
};

export type Brief = {
  /**
   * "build": run the tasks. "edit": a change to existing nodes, mesh work or game logic; the
   * tool loop (agentic-loop.ts) does it. "answer": a question; reply holds the answer.
   */
  mode: "build" | "edit" | "answer";
  reply?: string;
  /** One sentence: what the user wants, as the director understood it. */
  understanding: string;
  /** Set when the prompt has two readings ("plane": airplane or flat surface). The user chooses. */
  ambiguity?: { question: string; options: { id: string; label: string; hint?: string }[] };
  /** Look of the whole request, from the words or the image. Generators use what applies. */
  style?: {
    palette?: string; // a palette id from palettes.ts
    mood?: string; // "spring morning", "dusk"
    era?: string; // "japanese castle", "modern city", "medieval"
    colors?: Record<string, string>; // role -> hex, from an image: walls, roof, accent, foliage
    /** Vegetation the image or the words call for: "cherry blossom", "pine". */
    vegetation?: string[];
  };
  tasks: BriefTask[];
};

// ── Choices (the popup) ───────────────────────────────────────

export type ChoiceOption = {
  id: string;
  label: string;
  hint?: string;
  /** Library id: the popup renders its thumbnail. */
  resourceId?: string;
  /** Or a ready image (data URL). */
  image?: string;
};

export type ChoiceQuestion = {
  /** Key the generator reads the answer by: "tree", "buildings", "water", "meaning". */
  id: string;
  title: string; // "Which trees?"
  options: ChoiceOption[];
  /** Preselected option. "Use suggested" and a closed popup return these. */
  suggested: string;
  /** More than one option may be chosen (a tree mix). */
  multiple?: boolean;
  /**
   * "map": the option images are plans seen from above (minimap.ts); the popup shows them large.
   * Scope and place questions ("How big?", "Where?") come before taste questions in the popup.
   */
  kind?: "map" | "taste";
};

export type ChoiceAnswer = { optionIds: string[]; note?: string };
export type ChoiceAnswers = Record<string, ChoiceAnswer>;

// ── Sites: what the generators built (the director's memory of the scene) ──

/** A rectangle on the ground in WORLD meters. */
export type SiteRect = { x0: number; z0: number; x1: number; z1: number };

/** Plan of a built city in WORLD meters (axis aligned). Other generators route and place by it. */
export type CitySiteFacts = {
  /** World meters per plan meter. */
  scale: number;
  /** World y of the street level (top of the asphalt). */
  y: number;
  /** Outer edge of the street grid. */
  streetsRect: SiteRect;
  /** Outer edge of the ground slab (grass verge included). */
  groundRect: SiteRect;
  avenueAxis: "x" | "z";
  streets: {
    id: number;
    name: string;
    axis: "x" | "z";
    /** World coordinate of the center line across the axis. */
    pos: number;
    /** Extent along the axis. */
    from: number;
    to: number;
    /** Right of way: carriageway plus both sidewalks. */
    width: number;
    carriage: number;
    median: number;
    avenue: boolean;
  }[];
  blocks: {
    i: number;
    j: number;
    rect: SiteRect;
    kind: "lot" | "park" | "plaza";
    /** "downtown", "commercial", "residential", "industrial", "park", ... */
    zone: string;
    /** Tallest building on the block in world meters (0 = none). */
    tallest: number;
  }[];
  kit: string;
  /** Street tree library id, or "none". */
  trees: string;
};

export type RiverSiteFacts = {
  /** Center line, world [x, z] points (20 or fewer). */
  points: [number, number][];
  width: number;
  /** Water style slug. */
  style: string;
  /** How the course was chosen: "free", "edge:north", "canal:<street id>", "park", ... */
  route?: string;
};

export type BuildingSiteFacts = {
  style: string;
  /** World meters. */
  height: number;
  footprint: number;
  /** When it stands on a city block: the city site id and the block. */
  cityId?: string;
  block?: [i: number, j: number];
};

/** The fit-out of one room (generators/interior). Added 2026-11-11. */
export type InteriorSiteFacts = {
  /** Site id of the building it is in ("" = a room that stands alone). */
  host: string;
  use: string;
  finish: string;
  /** World y of the floor finish and of the underside of the ceiling. */
  floorY: number;
  ceilingY: number;
  /** Furniture footprints in world meters, so later things are placed beside them: x, z, radius. */
  obstacles: [x: number, z: number, r: number][];
};

export type SiteFacts = {
  center: { x: number; z: number };
  rect: SiteRect;
  /** Tallest point in world meters. */
  height?: number;
  /** A few words for [Scene style]: "modern downtown", "japanese castle", "clear river". */
  style?: string;
  /** One line for the director: "3 x 3 blocks, downtown kit, oak street trees, park, tallest 34 m". */
  summary: string;
  /** What a replace task may change, with the present values: "height 38 (20-160), tiers 3 (1-4), look glass". */
  adjustable?: string;
  city?: CitySiteFacts;
  river?: RiverSiteFacts;
  building?: BuildingSiteFacts;
  interior?: InteriorSiteFacts;
};

/**
 * Stored as JSON text in metadata.site of the generator's folder node (see site.ts).
 * params are the RESOLVED params: popup answers and the world position are folded in, so
 * run(validate(params)) builds the same thing at the same place with no question.
 */
export type SiteRecord = {
  v: 1;
  generator: GeneratorId;
  title: string;
  params: Record<string, unknown>;
  facts: SiteFacts;
};

/** A site read back from the scene. id = the folder node id. */
export type BuiltSite = SiteRecord & { id: string };

/** A follow-up the user can start with one click after a build. prompt is sent as a new request. */
export type NextStep = { label: string; prompt: string };

// ── Generators ────────────────────────────────────────────────

export type DirectorContext = {
  editor: EditorCore;
  prompt: string;
  brief: Brief;
  attachments?: CopilotAttachment[];
  /** World point the build starts from (named node, selection or camera target). */
  anchor: { x: number; z: number };
  /** What the earlier tasks of this brief built, in order (task 1 first). */
  built?: { title: string; nodeIds: string[] }[];
  /** Everything generators built in the scene before this task (read from the scene, site.ts). */
  sites: BuiltSite[];
  /**
   * Set for a replace task: the site to build again. params are already merged; anchor is its
   * center. The generator removes the old nodes (siteNodeIds) in the SAME undo step as the new
   * ones, keeps the place, and asks no question that the stored params answer.
   */
  replace?: BuiltSite;
  /**
   * With replace: param names (or question ids) to ask again. They are already removed from
   * params. Without replace it is undefined and the generator asks what the brief left open.
   */
  ask?: string[];
  signal?: AbortSignal;
  /** Chat trace line: one for each visible build step ("Roads", "12 buildings", "Street trees"). */
  step: (label: string, detail?: string) => void;
  /** Waits ms (the stagger of the live build); rejects on abort. */
  pause: (ms: number) => Promise<void>;
  /** A model call for generators that need one (the object modeler). Text or one tool call back. */
  callModel: (request: {
    system: string;
    user: string;
    attachments?: CopilotAttachment[];
    tool?: { name: string; description: string; parameters: Record<string, unknown> };
    effort?: "none" | "low" | "medium" | "high";
    /** Called for each complete streamed tool call (parts arrive one batch at a time). */
    onToolCall?: (args: Record<string, unknown>) => void;
  }) => Promise<{ text: string; toolArgs?: Record<string, unknown> }>;
};

export type GeneratorResult = {
  nodeIds: string[];
  /** One sentence for the chat ("Built a 3 x 2 block city with 14 buildings and street trees."). */
  summary: string;
  /** Items that could not be built, with the reason. */
  skipped?: string[];
  /** 2 to 4 sensible follow-ups for this result ("Make it bigger", "Add a river along the edge"). */
  next?: NextStep[];
};

export type Generator = {
  id: GeneratorId;
  /**
   * Text for the director prompt: when to use this generator and its params, 600 characters or less.
   * The director model reads this, so it must be exact.
   */
  describe: string;
  /**
   * Taste, scope and place params that belong to the user: param name -> the words in the user's
   * own request that decide it. When the director sets such a param and the request has none of
   * those words (and no image), code drops the param before validate, so the generator asks.
   * Not applied to replace tasks (there the param IS the requested change).
   */
  taste?: Record<string, RegExp>;
  /** Returns the params made valid (defaults filled, ranges clamped), or an error text. */
  validate: (params: Record<string, unknown>, brief: Brief) => Record<string, unknown> | string;
  /**
   * Questions for the user before the build (tree type, building kit, water style). Return []
   * when the brief already decides them. 3 questions maximum; 2 to 6 options each.
   */
  choices?: (params: Record<string, unknown>, ctx: Omit<DirectorContext, "step" | "pause" | "callModel">) => ChoiceQuestion[];
  /** Builds in the scene, step by step, with the build reveal. All nodes go in one folder. */
  run: (params: Record<string, unknown>, answers: ChoiceAnswers, ctx: DirectorContext) => Promise<GeneratorResult>;
};

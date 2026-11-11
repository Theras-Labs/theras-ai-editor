// The director call (plan docs/plans/realtime-ai-harness.md, 5B): ONE model call with reasoning
// reads the prompt, the image, the scene digest and the library, and returns a Brief through
// one tool call (submit_brief). Code then validates the brief; generators build it.
import { searchResourcesScored } from "@/lib/resources/catalog";
import { PALETTE_IDS, isPaletteId } from "../palettes";
import { libraryIndex } from "../system-prompt";
import { historyForModel, streamOf, trimHistoryForRequest } from "../agentic-loop";
import type { CopilotAttachment } from "../attachments";
import type { CopilotMessage, CopilotProvider, CopilotProviderConfig, CopilotToolDeclaration, CopilotUsage } from "../types";
import type { Brief, BriefTask, GeneratorId } from "./types";

export const BRIEF_TOOL_NAME = "submit_brief";
export const MAX_BRIEF_TASKS = 4;
export const ALL_GENERATOR_IDS: GeneratorId[] = ["compose", "city", "river", "object", "architecture", "interior"];
/** Earlier chat messages that go to the director (after the trace lines are removed). */
export const BRIEF_HISTORY_MESSAGES = 8;

export type GeneratorInfo = { id: GeneratorId; describe: string };

// ── Tool declaration ──────────────────────────────────────────

/** submit_brief: a JSON schema that mirrors the Brief type (director/types.ts). */
export function briefTool(generatorIds: GeneratorId[]): CopilotToolDeclaration {
  const option = { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, hint: { type: "string" } }, required: ["id", "label"] };
  return {
    name: BRIEF_TOOL_NAME,
    description: "Submits the brief: what the user wants and how code builds it. Call it exactly one time.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["build", "edit", "answer"] },
        understanding: { type: "string", description: "One short sentence: what you will do. The user sees it first." },
        reply: { type: "string", description: "mode answer: the answer." },
        ambiguity: {
          type: "object",
          description: "Only when a key word has two readings. One option for each reading.",
          properties: { question: { type: "string" }, options: { type: "array", minItems: 2, maxItems: 4, items: option } },
          required: ["question", "options"]
        },
        style: {
          type: "object",
          properties: {
            palette: { type: "string", enum: PALETTE_IDS },
            mood: { type: "string" },
            era: { type: "string" },
            colors: {
              type: "object",
              description: "Role -> hex color (#rrggbb), from an image or the words.",
              properties: { walls: { type: "string" }, roof: { type: "string" }, accent: { type: "string" }, foliage: { type: "string" }, ground: { type: "string" }, water: { type: "string" } }
            },
            vegetation: { type: "array", items: { type: "string" } }
          }
        },
        tasks: {
          type: "array",
          maxItems: MAX_BRIEF_TASKS,
          items: {
            type: "object",
            properties: {
              generator: { type: "string", enum: generatorIds },
              title: { type: "string" },
              option: { type: "string", description: "With ambiguity: the option id this task builds. Leave out for tasks of every reading." },
              replace: { type: "string", description: "Id from [Built]: this task changes that thing in place. params = only what changes." },
              ask: { type: "array", items: { type: "string" }, description: "With replace: param names the user wants to choose again (the editor shows the choices)." },
              params: { type: "object", description: "Parameters of the generator, as its description says." }
            },
            required: ["generator", "title", "params"]
          }
        }
      },
      required: ["mode", "understanding", "tasks"]
    }
  };
}

// ── System prompt (static: cache-stable prefix) ──────────────

const ROUTES: Record<Exclude<GeneratorId, "compose">, string> = {
  city: '- A city, town, village street, street or district: generator "city". Never a loose ring of buildings.',
  river: '- A river, stream, creek or canal: generator "river". Never a round water disc (the water: entries are lake and sea surfaces).',
  object:
    '- One object that the library does not have (an airplane, a car, a chair): generator "object". Never use "object" for a thing that the library has; look in the index and in [Library matches] first. Never use "object" for a person or a human figure. subject = the object alone: its place goes in around ("a cactus next to the puddle": subject "saguaro cactus", around = the id of the puddle), never in subject.',
  architecture:
    '- A landmark building (a skyscraper, a tall tower, a castle, a pagoda, a temple, a shrine, a keep): generator "architecture". Kit pieces with such a name in [Library matches] (model:city-*, model:castle*) are small parts for streets and walls, not landmarks: never use them for it.',
  interior: '- The inside of a building (an interior, a floor and a ceiling inside, furniture for a building, a lobby, an office floor, "inside the building here"): generator "interior".'
};

const MISSING: Record<Exclude<GeneratorId, "compose">, string> = {
  city: "- There is no city generator now: for a city or street use compose with model:city-commercial building pieces and street props.",
  river: "- There is no river generator now: for a river use mode edit (the tool loop builds it).",
  object: "- There is no object generator now: an object that the library does not have goes to mode edit (the tool loop builds it).",
  architecture: "- There is no architecture generator now: for a castle use compose with model:castle kit pieces.",
  interior: "- There is no interior generator now: for the inside of a building use mode edit (the tool loop builds it)."
};

const promptCache = new Map<string, string>();

/**
 * The director's system prompt. Static for one set of registered generators, so it is a
 * byte-identical prefix between prompts (provider prompt cache).
 */
export function buildDirectorSystemPrompt(generators: GeneratorInfo[]): string {
  const key = generators.map((g) => `${g.id}:${g.describe}`).join("|");
  const hit = promptCache.get(key);
  if (hit) return hit;
  const ids = new Set(generators.map((g) => g.id));
  const routes = (Object.keys(ROUTES) as (keyof typeof ROUTES)[]).map((id) => (ids.has(id) ? ROUTES[id] : MISSING[id]));
  const text = `You are the director of Theras Editor, a browser 3D scene editor. You do not place objects. You read the request (and the image, if there is one), decide what to build and with which generator, and call ${BRIEF_TOOL_NAME} one time. Code builds the brief and the user chooses where taste matters. Think about quality: structure, style and the right library objects.

## Modes
- build: new things in the scene. 1 to ${MAX_BRIEF_TASKS} tasks; they run in order.
- edit: a change to objects that exist (move, scale, rotate, color, delete, rename), plain primitive shapes (a box, a flat plane, a wall slab), mesh work, or game logic (hooks, events, paths, player). tasks = [].
- answer: a question. reply = a short answer. tasks = []. Never answer that a tool is not available: the tool loop has tools that you do not see (dock slots, selection, materials, logic). A request for an action, for a dock slot or that names a tool is edit.

## Rules
- Language: write understanding, reply, the ambiguity question and the option labels in the language of the user's request text (an English request gets English). Titles too.
- understanding: one short sentence: what you will build (with ambiguity: the likely reading). Do not write about questions or choices.
- Two readings: when a key word has two common meanings in a 3D scene (plane: airplane or flat surface; bat: animal or baseball bat; crane: bird or construction crane; bank: river bank or money bank; mouse: animal or computer mouse; ...) and the words, the image and the scene do not make one clear, set ambiguity: a question and one option for each reading (short ids, the likely reading first). Give each task option = the id of its reading. A reading that is a plain primitive shape (a flat surface, a box) needs no task: the tool loop builds it.
- The library is the first source. A thing that is in the library index or in [Library matches] is built with compose and its id.
- Land: "an island", "a small island", "land" or a new world on an empty scene = compose with terrain "lh:terrain:island" (code builds the land first, with its lake). Put the trees, plants and props of that request in the SAME compose task with no anchor: they stand on the island. Never anchor anything on the sky or environment node.
${routes.join("\n")}
- A scene ("a japanese garden", "build this scene" with an image) is several tasks: ground and water first, then architecture or city, then vegetation and props (compose).
- Image: read the era and style, the role colors as hex (walls, roof, accent, foliage) and the vegetation (for example "cherry blossom") into style. Choose library vegetation that matches: pink blossom trees = nature:tree:cherry-blossom, not an oak; conifers = nature:tree:fir; autumn colors = nature:tree:maple-autumn. Trees with no type given = nature:tree:oak-round. The lh:plant: trees are small garden trees (3 to 4 m) for the island: use them only on an island or when the user asks for them.
- Inside a building: an interior, a floor and a ceiling inside, furniture for a building, a lobby, an office floor or "inside the building here" is generator "interior". Never compose kit floor or wall pieces and never the object generator for it: they cannot stand inside a building. "here", "this building" and "inside" need no host param; code finds the building.
- People: a person, human, character, NPC, pedestrian or crowd = compose with creature:person (a rigged, animated figure, 1.75 m). Never the object generator and never primitives for a human.
- No voxel look: never plan a blocky, cube-built or Minecraft-like character, building or object, unless the user's own words ask for a voxel or block style. This is the user's standing wish.
- Ids: only ids from the library index (full id = prefix + name, lh:feature: + bench = lh:feature:bench) or from [Library matches]. Do not invent ids. For a kit line, use [Library matches] ids.
- Layout anchors: a node id from the scene digest ("near the windmill" = the id of the windmill node), "camera" or "selection". Never x, y, z unless the user gives coordinates.
- Composition: one focal point first in items; groups of 3 or 5; plants in clusters; no rows unless asked.
- Keep params short. Generators fill defaults.
- Taste belongs to the user. Leave these params OUT unless the user's words or the image decide them: tree or plant species, building kit, water style, river banks, roof color, tier count, tower look, object style, interior use and finish. The editor then shows the user a choice with pictures.
- Scope and place of a big thing belong to the user too. Leave OUT: the size of a city; the route, from and to of a river in a scene with a city; the place (at, site) and the height of a building in a scene with a city. The editor asks with a map. Set them only when the words decide them ("a big city", "along the east edge", "next to the park", "200 m tall"). Counts and anchors of small things (trees, benches, lamps) are yours to set.
- [Built] in the context lists what generators built, with facts. A change to one of them (taller, bigger, wider, another look, color, kit, tree species or route, more blocks) is mode build with ONE task: the same generator, replace = its id, params = ONLY the params that change, title = its title. Never mode edit for that, and never a primitive shape as a stand-in. "it" and "the tower" mean the newest matching line of [Built]. Relative words: "taller", "bigger", "wider" = about 1.5 times the present value; "much", "really", "way", "not enough" = 2 times or more. Say the old and the new value in understanding ("I will raise the tower from 96 m to 190 m."). When the user wants a change but leaves the new value open ("another look", "move it somewhere else", "different trees"), do not guess: set ask = the names of those params from the change list (for example ["look"], ["site"], ["streetTrees"]) and leave them out of params; the editor shows the choices.
- Modeled objects are in [Built] too (generator object), each with its change list. A change to one is ONE object task with replace = its id and ONLY the params that change. Bigger or smaller = sizeMeters ("giant", "huge" = 3 times the present value or more). More of it, a group, a row, a ring, or a wall or fence of it around something = count, arrange, around (the node id of that thing) and closed (a wall or fence: closed true and NO count, code sets the count from the ring length; send count only for a number the user said); code repeats the SAME model, so never model "a wall of cactus" as one object and send no subject for it. Other colors = colors with the roles of its change list. Another shape or more detail = change (a few words). Send subject only when it becomes a different thing. "Too small, make it a giant wall around the puddle" is one task: replace, sizeMeters, arrange "ring", around, closed true.
- Fit the scene. Read [Scene style] and [Built] first. A new thing takes the era, culture, building kit, tree species and water style of what is there, unless the user asks for a contrast. A building for a city goes on the city, a river for a city runs beside or through it by its street plan: the generators find the place, so do not send coordinates for them.
- A vague request ("make it better", "add something cool", "build a world") is not a reason to guess: set ambiguity with 2 to 4 concrete directions that fit the scene, each with its own tasks (option = its id).
- To place things around what an earlier task builds, use anchor "@1" (the number of that task, 1 = first). Example: task 1 architecture, task 2 compose with cherry trees: items with layout {pattern: "cluster", anchor: "@1"}, 2 or 3 items so the groups stand at different sides. Never invent a node id for something that is not in the scene digest.

## Generators
${generators.map((g) => `### ${g.id}\n${g.describe}`).join("\n")}

## Library index (prefix: names)
${libraryIndex()}`;
  promptCache.set(key, text);
  return text;
}

// ── Noun pre-resolution (no search step for library objects) ──

const NOT_NOUNS = new Set(
  (
    "a an the of to in on at by for from with and or but near next beside around behind front into onto some few several many more lots bunch " +
    "add place put spawn create make build generate give me my it this that these those there here please can could would you i want need " +
    "new big bigger small smaller little tiny large huge tall taller short long wide nice nicer pretty cool beautiful cozy scene area " +
    "one two three four five six seven eight nine ten move rotate scale delete remove change color paint rename select edit"
  ).split(" ")
);

/** Nouns that mean ONE landmark building (the architecture generator builds it). */
const LANDMARK_WORDS = /skyscraper|high.?rise|\btowers?\b|castle|pagoda|temple|shrine|\bkeep\b/;

export type NounMatch = { term: string; ids: { id: string; name: string }[] };

/**
 * Library ids for the nouns of a prompt, found in code with searchResourcesScored, so the
 * director does not need a search step. Only name hits count (score 3 or more for each word).
 */
export function resolveNouns(prompt: string, maxTerms = 8, perTerm = 3): NounMatch[] {
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !NOT_NOUNS.has(w) && !/^\d+$/.test(w));
  const terms: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i + 1 < words.length) terms.push(`${words[i]} ${words[i + 1]}`);
    terms.push(words[i]);
  }
  const out: NounMatch[] = [];
  const seenIds = new Set<string>();
  const coveredWords = new Set<string>();
  for (const term of terms) {
    if (out.length >= maxTerms) break;
    const parts = term.split(" ");
    if (parts.length === 1 && coveredWords.has(term)) continue;
    const hits = searchResourcesScored(term, {}, 12)
      .filter((r) => r.score >= 3 * parts.length && r.entry.kind !== "recipe")
      // A landmark is built by the architecture generator; kit pieces with that word are not offered.
      .filter((r) => !(LANDMARK_WORDS.test(term) && r.entry.id.startsWith("model:")))
      .filter((r) => !seenIds.has(r.entry.id))
      .slice(0, perTerm);
    if (hits.length === 0) continue;
    for (const h of hits) seenIds.add(h.entry.id);
    if (parts.length > 1) parts.forEach((p) => coveredWords.add(p));
    out.push({ term, ids: hits.map((h) => ({ id: h.entry.id, name: h.entry.name })) });
  }
  return out;
}

export function nounMatchesToText(matches: NounMatch[]): string {
  if (matches.length === 0) return "[Library matches: none for the nouns of the request]";
  return ["[Library matches for the nouns of the request]", ...matches.map((m) => `${m.term}: ${m.ids.map((i) => `${i.id} (${i.name})`).join(", ")}`)].join("\n");
}

// ── Validation ────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function hexColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null;
}

export type BriefValidation = { brief: Brief; notes: string[] };

/**
 * Makes a raw submit_brief argument object a valid Brief. Unknown generator: compose when the
 * params have items, else the task is dropped. A build with no task and no ambiguity becomes an
 * edit. At most MAX_BRIEF_TASKS tasks. Notes are short texts for the chat.
 */
export function validateBrief(raw: unknown): BriefValidation {
  const notes: string[] = [];
  const r = isRecord(raw) ? raw : {};
  const understanding = text(r.understanding, 300);
  const reply = text(r.reply, 4000) || undefined;

  let ambiguity: Brief["ambiguity"];
  if (isRecord(r.ambiguity) && Array.isArray(r.ambiguity.options)) {
    const seen = new Set<string>();
    const options = r.ambiguity.options
      .filter(isRecord)
      .map((o) => ({ id: text(o.id, 40), label: text(o.label, 80), hint: text(o.hint, 160) || undefined }))
      .filter((o) => o.id && o.label && !seen.has(o.id) && seen.add(o.id))
      .slice(0, 6);
    const question = text(r.ambiguity.question, 200);
    if (question && options.length >= 2) ambiguity = { question, options };
  }

  let style: Brief["style"];
  if (isRecord(r.style)) {
    const s = r.style;
    const colors: Record<string, string> = {};
    if (isRecord(s.colors)) {
      for (const [role, value] of Object.entries(s.colors)) {
        const hex = hexColor(value);
        if (hex && role.length <= 24) colors[role] = hex;
      }
    }
    const vegetation = Array.isArray(s.vegetation) ? s.vegetation.map((v) => text(v, 40)).filter(Boolean).slice(0, 6) : [];
    const next: NonNullable<Brief["style"]> = {
      ...(typeof s.palette === "string" && isPaletteId(s.palette) ? { palette: s.palette } : {}),
      ...(text(s.mood, 80) ? { mood: text(s.mood, 80) } : {}),
      ...(text(s.era, 80) ? { era: text(s.era, 80) } : {}),
      ...(Object.keys(colors).length ? { colors } : {}),
      ...(vegetation.length ? { vegetation } : {})
    };
    if (Object.keys(next).length) style = next;
  }

  const optionIds = new Set(ambiguity?.options.map((o) => o.id) ?? []);
  const tasks: (BriefTask & { option?: string })[] = [];
  for (const t of Array.isArray(r.tasks) ? r.tasks : []) {
    if (!isRecord(t)) continue;
    const params = isRecord(t.params) ? t.params : {};
    let generator = text(t.generator, 40) as GeneratorId;
    const title = text(t.title, 60);
    if (!ALL_GENERATOR_IDS.includes(generator)) {
      if (Array.isArray(params.items)) generator = "compose";
      else {
        notes.push(`The director asked for an unknown generator "${generator || "?"}"${title ? ` for ${title}` : ""}; that task was left out.`);
        continue;
      }
    }
    const option = typeof t.option === "string" && optionIds.has(t.option) ? t.option : undefined;
    const replace = text(t.replace, 80) || undefined;
    const ask = replace && Array.isArray(t.ask) ? t.ask.map((a) => text(a, 40)).filter(Boolean).slice(0, 4) : [];
    tasks.push({ generator, title: title || generator, params, ...(option ? { option } : {}), ...(replace ? { replace } : {}), ...(ask.length ? { ask } : {}) });
  }
  if (tasks.length > MAX_BRIEF_TASKS) notes.push(`The brief had ${tasks.length} tasks; only the first ${MAX_BRIEF_TASKS} run.`);
  tasks.splice(MAX_BRIEF_TASKS);

  let mode: Brief["mode"] = r.mode === "build" || r.mode === "edit" || r.mode === "answer" ? r.mode : tasks.length ? "build" : reply ? "answer" : "edit";
  if (mode === "build" && tasks.length === 0 && !ambiguity) mode = "edit";

  const brief: Brief = { mode, understanding, tasks: mode === "build" ? tasks : [] };
  if (mode === "answer") brief.reply = reply ?? understanding;
  else if (reply) brief.reply = reply;
  if (ambiguity && mode === "build") brief.ambiguity = ambiguity;
  if (style) brief.style = style;
  return { brief, notes };
}

// ── The call ──────────────────────────────────────────────────

export type BriefRequest = {
  provider: CopilotProvider;
  /** Base provider config. profile and effort are set here. */
  providerConfig: CopilotProviderConfig;
  prompt: string;
  attachments?: CopilotAttachment[];
  /** Earlier chat. */
  history: CopilotMessage[];
  /** Scene digest, library matches and playbook text: the end of the user message. */
  context: string;
  generators: GeneratorInfo[];
  signal?: AbortSignal;
  /** Text the model writes before the tool call (streams live). */
  onText?: (delta: string) => void;
};

export type BriefResponse = BriefValidation & { ms: number; usage?: CopilotUsage; model?: string; raw: unknown };

/** "low" by default, "medium" when an image is attached (plan 5B). */
export function briefEffort(attachments?: CopilotAttachment[]): "low" | "medium" {
  return attachments?.some((a) => a.kind === "image") ? "medium" : "low";
}

function jsonFromText(t: string): unknown {
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** ONE streamed model call that returns the brief. No retry: an error goes to the caller. */
export async function requestBrief(req: BriefRequest): Promise<BriefResponse> {
  const t0 = performance.now();
  const tool = briefTool(req.generators.map((g) => g.id));
  const history = trimHistoryForRequest(historyForModel(req.history)).slice(-BRIEF_HISTORY_MESSAGES);
  // The cut must not start with tool results whose calls were cut away.
  while (history.length && history[0].role === "tool") history.shift();
  const user: CopilotMessage = {
    id: `brief_${Date.now().toString(36)}`,
    role: "user",
    content: `${req.prompt}\n\n${req.context}`,
    attachments: req.attachments?.length ? req.attachments : undefined,
    timestamp: Date.now()
  };
  const config: CopilotProviderConfig = {
    ...req.providerConfig,
    profile: "brief",
    effort: req.providerConfig.effort ?? briefEffort(req.attachments)
  };
  let raw: unknown = null;
  const result = await streamOf(req.provider)(
    [...history, user],
    [tool],
    buildDirectorSystemPrompt(req.generators),
    config,
    (event) => {
      if (event.type === "text") req.onText?.(event.delta);
      else if (event.call.name === BRIEF_TOOL_NAME && raw === null) raw = event.call.args;
    },
    req.signal
  );
  raw ??= result.toolCalls.find((c) => c.name === BRIEF_TOOL_NAME)?.args ?? null;
  if (raw === null && result.text.trim()) {
    // No tool call: a JSON brief in the text, else the text is an answer.
    raw = jsonFromText(result.text) ?? { mode: "answer", understanding: "", reply: result.text.trim(), tasks: [] };
  }
  if (raw === null) throw new Error("The director returned no brief. Send the prompt again.");
  const validation = validateBrief(raw);
  return { ...validation, raw, ms: Math.round(performance.now() - t0), usage: result.usage, model: result.model };
}

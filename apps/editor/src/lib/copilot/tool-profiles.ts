// Tool profiles (plan 4.5): each prompt sends only the tools it needs, so a request is small
// and fast. "compose" builds from the library; "edit" adds brush and mesh tools; "logic" adds
// hooks, events, paths and the player; "full" is every tool (the one-time fallback).
import type { CopilotToolDeclaration } from "./types";
import { COPILOT_TOOL_DECLARATIONS } from "./tool-declarations";

export type ToolProfile = "compose" | "edit" | "logic" | "full";

const COMPOSE_TOOLS = [
  "search_resources",
  "place_resources",
  "place_resource",
  "apply_template",
  "load_project",
  "set_screen_effects",
  "set_physics",
  "game_mode",
  "generate_island",
  "set_environment",
  "place_primitive",
  "place_primitives",
  "place_light",
  "create_material",
  "assign_material",
  "set_node_transform",
  "translate_nodes",
  "duplicate_nodes",
  "delete_nodes",
  "group_nodes",
  "list_nodes",
  "get_node_details"
];

/**
 * Dock slot tools. Not in compose: with them in the list, "create a plane" made a dock slot
 * named Plane and placed nothing. A prompt that names the dock or a slot gets the edit profile.
 */
const SLOT_TOOLS = ["list_slots", "set_slot", "select_slot", "remove_slot", "place_slot"];

const EDIT_EXTRA = [
  ...SLOT_TOOLS,
  "place_blockout_room",
  "place_blockout_platform",
  "place_blockout_stairs",
  "place_brush",
  "mirror_nodes",
  "split_brush",
  "extrude_brush",
  "offset_brush_face",
  "assign_material_to_brushes",
  "set_uv_scale",
  "list_materials",
  "rename_node",
  "move_to_group",
  "ungroup",
  "get_mesh_topology",
  "extrude_mesh_faces",
  "extrude_mesh_edge",
  "bevel_mesh_edges",
  "subdivide_mesh_face",
  "cut_mesh_face",
  "delete_mesh_faces",
  "merge_mesh_faces",
  "merge_mesh_vertices",
  "translate_mesh_vertices",
  "scale_mesh_vertices",
  "fill_mesh_face",
  "invert_mesh_normals",
  "arc_mesh_edges",
  "inflate_mesh",
  "convert_brush_to_mesh",
  "split_brush_at_coordinate"
];

const LOGIC_EXTRA = [
  "place_entity",
  "place_player_spawn",
  "list_entities",
  "get_entity_details",
  "rename_node",
  "set_scene_settings",
  "get_scene_settings",
  "list_scene_paths",
  "list_scene_events",
  "list_hook_types",
  "create_scene_path",
  "update_scene_path",
  "delete_scene_path",
  "add_hook",
  "set_hook_value",
  "remove_hook"
];

const PROFILE_TOOLS: Record<Exclude<ToolProfile, "full">, string[]> = {
  compose: COMPOSE_TOOLS,
  edit: [...COMPOSE_TOOLS, ...EDIT_EXTRA],
  logic: [...COMPOSE_TOOLS, ...LOGIC_EXTRA]
};

/** Strips "description" from every nested parameter schema (the top-level tool description stays). */
function withoutParamDescriptions(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutParamDescriptions);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "description" && typeof value === "string") continue;
    out[key] = key === "properties" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, withoutParamDescriptions(v)])) : withoutParamDescriptions(value);
  }
  return out;
}

/**
 * Shorter declarations for the compose profile, to stay inside the 4,000-token budget.
 * Only text changes; names and parameter shapes are the same, so the executor is the same.
 */
const COMPOSE_OVERRIDES: Record<string, (d: CopilotToolDeclaration) => CopilotToolDeclaration> = {
  search_resources: (d) => ({
    ...d,
    description:
      "Searches the library by words (plurals and common synonyms match). Returns id, name, kind, score (3 per word in the name, 2 in a tag, 1 elsewhere; below 2 is a weak match), footprint radius, description.",
    parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown>
  }),
  place_resources: (d) => ({
    ...d,
    description:
      "Places a set of library objects in ONE call. Give ids, count and layout; code computes x, y, z on the terrain without overlap (boats go on the water at the shore). Returns placed [{id,nodeId,x,y,z}] and skipped [{id,reason}]."
  }),
  // Compose places sets with place_resources (layout); place_resource is for explicit coordinates
  // (user coordinates, kit pieces on a grid). The executor still accepts layout here.
  place_resource: (d) => {
    const params = withoutParamDescriptions(d.parameters) as { properties: Record<string, unknown> };
    const { layout: _layout, ...properties } = params.properties;
    return {
      ...d,
      description: "Places one library object at x, z with its base at height y. Only for user coordinates or kit pieces on a grid; else use place_resources.",
      parameters: { ...params, properties, required: ["id", "x", "y", "z"] }
    };
  },
  place_primitives: (d) => ({
    ...d,
    description: "Places several primitive shapes (fields of place_primitive) in one undo step. Only for objects that the library does not have.",
    parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown>
  }),
  place_light: (d) => ({ ...d, parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown> }),
  set_node_transform: (d) => ({ ...d, parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown> }),
  translate_nodes: (d) => ({ ...d, parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown> }),
  duplicate_nodes: (d) => ({ ...d, parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown> }),
  assign_material: (d) => ({ ...d, parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown> }),
  place_slot: (d) => ({ ...d, parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown> }),
  set_slot: (d) => ({
    ...d,
    description:
      "Creates or replaces a build dock slot (index 0 = slot 1). kind resource: a library id. kind recipe: 1-12 primitive parts, centers in m from the tapped point (y=0 surface, inside 3x3 m), material keys. Does not place.",
    parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown>
  }),
  apply_template: (d) => ({
    ...d,
    description:
      "Starts the scene from a template (land, sky, objects; one undo step): cozy-island, spring-meadow, night-harbor, empty-island, blank. replace=false keeps the current objects."
  }),
  generate_island: (d) => ({
    ...d,
    description: "Creates the island terrain on a lake (replaces the current island). Land is at y 0.25 to 1.25 within about 7 m of the center; water is y 0."
  }),
  place_primitive: (d) => ({
    ...d,
    description: "Places a primitive (cube, sphere, cylinder, cone); x/y/z is its center. Last resort: use only when search_resources has no match.",
    parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown>
  }),
  create_material: (d) => ({
    ...d,
    description: "Creates or updates a material. Its id is 'material:custom:<slug of name>', usable at once. Use palette + role; color only when the user names a color.",
    parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown>
  }),
  group_nodes: (d) => ({
    ...d,
    description: "Puts nodes into a new named folder in the scene tree (objects keep their place). Returns the group id.",
    parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown>
  }),
  get_node_details: (d) => ({ ...d, parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown> }),
  delete_nodes: (d) => ({ ...d, parameters: withoutParamDescriptions(d.parameters) as Record<string, unknown> })
};

const byName = new Map(COPILOT_TOOL_DECLARATIONS.map((d) => [d.name, d]));
const cache = new Map<ToolProfile, CopilotToolDeclaration[]>();

/** The tool list of a profile. The same array object each time, so requests stay byte-identical. */
export function toolsForProfile(profile: ToolProfile): CopilotToolDeclaration[] {
  const hit = cache.get(profile);
  if (hit) return hit;
  let tools: CopilotToolDeclaration[];
  if (profile === "full") tools = COPILOT_TOOL_DECLARATIONS;
  else {
    tools = PROFILE_TOOLS[profile].filter((name, i, all) => all.indexOf(name) === i && byName.has(name)).map((name) => byName.get(name)!);
    if (profile === "compose") tools = tools.map((d) => COMPOSE_OVERRIDES[d.name]?.(d) ?? d);
  }
  cache.set(profile, tools);
  return tools;
}

// ── Asset-first gate (plan 5.3) ───────────────────────────────

const PRIMITIVE_TOOLS = new Set(["place_primitive", "place_primitives"]);
/** The prompt itself asks for a primitive shape. */
const PRIMITIVE_WORDS = /\b(primitives?|blocks?|box(es)?|cubes?|spheres?|balls?|cylinders?|cones?)\b/i;

export function asksForPrimitive(prompt: string): boolean {
  return PRIMITIVE_WORDS.test(prompt);
}

const gatedCache = new WeakMap<CopilotToolDeclaration[], CopilotToolDeclaration[]>();

/** The tool list without place_primitive(s). The same array object each time (byte-identical requests). */
export function withoutPrimitiveTools(tools: CopilotToolDeclaration[]): CopilotToolDeclaration[] {
  let hit = gatedCache.get(tools);
  if (!hit) {
    hit = tools.filter((t) => !PRIMITIVE_TOOLS.has(t.name));
    gatedCache.set(tools, hit);
  }
  return hit;
}

/**
 * Tools for one step of the compose profile. place_primitive(s) are offered only when the
 * prompt asks for a primitive shape, or after a search_resources call of this run found no
 * library entry (noSearchMatch). Other profiles are not gated.
 */
export function gatedComposeTools(tools: CopilotToolDeclaration[], prompt: string, noSearchMatch: boolean): CopilotToolDeclaration[] {
  if (tools !== toolsForProfile("compose")) return tools;
  return noSearchMatch || asksForPrimitive(prompt) ? tools : withoutPrimitiveTools(tools);
}

const MESH_WORDS = /\b(bevel\w*|extrud\w*|vert(ex|ices|exes)|faces?|edges?|subdivid\w*|brush(es)?|mesh(es)?|topology|inflate|normals?|blockout|room|rooms|hallway|corridor|stairs?)\b/i;
const LOGIC_WORDS = /\b(hooks?|events?|triggers?|door opens?|when (the )?player|player|paths?|waypoints?|spawns?|gameplay|npcs?|patrol\w*|scene settings|jump height)\b/i;
/** Words that point at the selected object. */
const SELECTION_WORDS = /\b(this|that|it|selected|selection)\b/i;

export type ProfileSelection = { kinds: string[] };

/**
 * Chooses the profile from the prompt, in code (no model call).
 * - Mesh words, or an edit of a selected mesh / brush / primitive: "edit".
 * - Logic words: "logic".
 * - A prompt with an image: "full" (image-to-build is phase 4; it keeps today's tool set).
 * - Otherwise "compose".
 */
export function pickProfile(prompt: string, hasImage: boolean, selection: ProfileSelection = { kinds: [] }): ToolProfile {
  const mesh = MESH_WORDS.test(prompt);
  const logic = LOGIC_WORDS.test(prompt);
  if (mesh && logic) return "full";
  if (mesh) return "edit";
  if (logic) return "logic";
  if (/\b(slots?|dock|hotbar|toolbar)\b/i.test(prompt)) return "edit"; // the dock slot tools are in edit
  if (hasImage) return "full";
  const selectedGeometry = selection.kinds.some((k) => k === "mesh" || k === "brush" || k === "primitive");
  if (selectedGeometry && SELECTION_WORDS.test(prompt) && /\b(shape|reshape|round|sharpen|cut|hole|opening|window|door|widen|taller|thicker|smooth)\b/i.test(prompt)) return "edit";
  return "compose";
}

const CANNOT = /\b(can(?:'|no)?t|cannot|unable to|not able to|don'?t have|do not have|doesn'?t have|does not have|no (?:\w+ )?(?:tool|function)|isn'?t available|is not available|not available|missing|lack)\b/i;
const TOOL_WORD = /\b(tools?|functions?|capabilit(?:y|ies)|abilit(?:y|ies)|access)\b/i;

/**
 * True when a final text says that a needed tool is missing: it names a tool of the full set
 * that this profile does not have, or it says it cannot do something for lack of a tool.
 */
export function asksForMissingTool(text: string, profileTools: CopilotToolDeclaration[]): boolean {
  if (!text) return false;
  const have = new Set(profileTools.map((t) => t.name));
  for (const d of COPILOT_TOOL_DECLARATIONS) {
    if (!have.has(d.name) && text.includes(d.name)) return true;
  }
  for (const sentence of text.split(/(?<=[.!?\n])\s*/)) {
    if (CANNOT.test(sentence) && TOOL_WORD.test(sentence)) return true;
  }
  return false;
}

// ── End of a run in code (plan 9: no text-only final step) ────

const READ_ONLY = /^(list|get|search)_/;

/**
 * Closing chat text for a step whose tool calls all succeeded and changed the scene; null when
 * a call failed or only read (then the model needs another step). Written in code, no model call.
 */
export function closingTextForStep(calls: { name: string; args?: Record<string, unknown> }[], results: { result: string }[]): string | null {
  if (calls.length === 0 || calls.length !== results.length) return null;
  if (calls.some((c) => READ_ONLY.test(c.name))) return null;
  let placed = 0;
  const skipped: string[] = [];
  for (const r of results) {
    let parsed: { success?: boolean; placed?: unknown[]; skipped?: { id?: string; reason?: string }[] };
    try {
      parsed = JSON.parse(r.result);
    } catch {
      return null;
    }
    if (parsed.success === false) return null;
    if (Array.isArray(parsed.placed)) placed += parsed.placed.length;
    if (Array.isArray(parsed.skipped)) for (const s of parsed.skipped) skipped.push(`${s.id ?? "?"} (${s.reason ?? "no place"})`);
  }
  const counts = new Map<string, number>();
  for (const c of calls) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  const what = [...counts].map(([n, k]) => `${n.replace(/_/g, " ")}${k > 1 ? ` x${k}` : ""}`).join(", ");
  // Primitive shapes: say what was placed, by name.
  const shapes = calls
    .filter((c) => c.name === "place_primitive")
    .map((c) => String(c.args?.name ?? c.args?.shape ?? "shape"));
  const lead = shapes.length > 0 && shapes.length === calls.length ? `Placed ${shapes.slice(0, 4).join(", ")}${shapes.length > 4 ? ` and ${shapes.length - 4} more` : ""}.` : `Done: ${what}.`;
  return [lead, placed ? `Placed ${placed} object${placed === 1 ? "" : "s"}.` : "", skipped.length ? `Not placed: ${skipped.slice(0, 4).join("; ")}.` : ""]
    .filter(Boolean)
    .join(" ");
}

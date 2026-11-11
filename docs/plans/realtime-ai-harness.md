# Plan: real-time AI building in Theras AI

Date: 2026-11-11. Author of the plan: Claude Fable 5.2. Executor: Claude Opus 5.5.

## Folders

| Folder | Port | Role |
|---|---|---|
| `apps/editor` | 8080 | Editor (client). Runs the scene tools in the browser. |
| `server` | 4310 | AI server. Holds the API keys. No database. |

## 1. Measured problem (2026-11-10, `/tmp/theras-server.log`, model `gpt-5.6-luna`)

- One model step takes 2 to 18 seconds. A prompt needs 4 to 8 steps. Total: 15 to 60 seconds.
- Many steps make only 1 tool call. Each step is a full round trip.
- Each step sends all 71 tool declarations (46 KB) plus the system prompt (14 KB). That is about 15,000 input tokens for each step.
- The server waits for the full model response. The editor shows nothing until a step is complete.
- The model often builds objects from primitives ("slop"), although the library in
  `apps/editor/src/lib/resources/catalog.ts` has a ready object.
- The model chooses raw coordinates. Objects overlap, float, or have the wrong scale.

A faster model alone does not fix this. A local model with a 15,000-token prompt and 71 tools is slow too, and it makes more tool errors. The harness must change.

## 2. Target budgets (a budget is a correctness rule)

| Path | First visible object | Whole prompt | Model round trips | Input tokens per step |
|---|---|---|---|---|
| Tier 0, library match, no model | 0.3 s | 1 s | 0 | 0 |
| Tier 1, compose from library | 2.5 s | 8 s | 1 to 2 | 4,000 or less |
| Tier 2, mesh edit or logic | 4 s | 30 s | 8 or less | 8,000 or less |
| Tier 3, big scene with workers | 3 s | 40 s | 1 plan + 4 workers or less | 4,000 or less per worker |

Log the measured numbers for each prompt (see 4.7). Do not call a phase done before the numbers are measured and written in this file.

## 3. Design

```
prompt (+ image) --> ROUTER (code first)
   |-- Tier 0: library match          -> place now, no model
   |-- Tier 1: compose profile        -> 1 streamed model call, small tool set
   |-- Tier 2: edit / logic profile   -> streamed agentic loop
   |-- Tier 3: planner -> workers     -> parallel streamed calls, one op queue
   `-- Image:  vision spec -> library match or part-by-part build -> critic
all tiers --> OP QUEUE (serial, 80-150 ms apart) --> scene + build reveal
```

Rules that apply to all tiers:
- The model never chooses raw coordinates for library objects. The model gives a relation (anchor, pattern, count). Code computes position, ground height, spacing and scale.
- The library is the first source. Primitives are the last source.
- Each tool call runs when it arrives on the stream. The editor does not wait for the end of the step.
- No automatic retry of a failed model call. The user sends the prompt again. No background loop. No database.

## 4. Phase 1: speed (do this first)

### 4.1 Streaming endpoint (server)
Add `POST /api/ai/chat/stream` in `server/src/main.ts`. Same request body as `/api/ai/chat` plus an optional `profile` string (used for logs and reasoning effort only). The response is `text/event-stream`. Each event is one line `data: <json>` followed by an empty line:

```
{"type":"text","delta":"..."}
{"type":"tool_call","call":{"id":"...","name":"...","args":{...}}}   one event for each COMPLETE function call
{"type":"done","text":"...","toolCalls":[...],"rawParts":[...],"provider":"openai","model":"...","ms":1234,"usage":{"input":0,"cached":0,"output":0}}
{"type":"error","message":"...","status":502}
```

- OpenAI (`server/src/openai.ts`): call `/v1/responses` with `"stream": true`. Map `response.output_text.delta` to `text`, `response.output_item.done` with `item.type == "function_call"` to `tool_call`, `response.completed` to `done` (build `rawParts` from `response.output` with the same filter as now). Map `response.failed` and `error` to `error`.
- Gemini: no stream in phase 1. Call the existing function, then emit the `tool_call` events and `done`.
- Keep the rate limit, the origin check, the 180 s upstream timeout and the client abort signal. Keep `/api/ai/chat` unchanged.
- Bun closes idle connections; `idleTimeout: 255` is already set. Send a comment line `: ping` every 15 s while the upstream is silent.

### 4.2 Reasoning effort by profile (server)
In `server/src/config.ts` add `OPENAI_EFFORT_COMPOSE` (default `low`) and `OPENAI_EFFORT_EDIT` (default: not set, model default). `profile == "compose"` uses the first. If the provider rejects the value, return the provider error text; do not retry.

### 4.3 Local and future providers (server)
Add provider id `local` to `server/src/config.ts`: `LOCAL_BASE_URL` (for example `http://127.0.0.1:11434/v1` for Ollama, or LM Studio), `LOCAL_MODEL`, `LOCAL_MODELS`, optional `LOCAL_API_KEY`. New file `server/src/openai-compat.ts`: Chat Completions with `stream: true`, tool-call deltas assembled by index, one `tool_call` event when a call is complete. Any new model with an OpenAI-compatible API ("jev" included, if it has one) then needs only env values. The admin switch (`PUT /api/admin/ai`) and the settings dialog accept `local`.

### 4.4 Streaming provider and loop (editor)
- `apps/editor/src/lib/copilot/server-provider.ts`: add `streamContent(..., onEvent)` that reads the SSE body with `fetch` + `ReadableStream`. Fall back to `/api/ai/chat` when the stream route returns 404.
- `apps/editor/src/lib/copilot/types.ts`: add optional `streamContent` to `CopilotProvider`.
- `apps/editor/src/lib/copilot/agentic-loop.ts`: when the provider has `streamContent`, run each tool call when its `tool_call` event arrives (keep the existing `toolDelayMs` stagger and the abort checks), show text deltas in the assistant message, and build the same messages as now from the `done` event. Tool results go back in the next step as now.

### 4.5 Tool profiles (editor)
New file `apps/editor/src/lib/copilot/tool-profiles.ts`:
- `compose`: `search_resources`, `place_resource`, `apply_template`, `generate_island`, `set_environment`, `place_primitive`, `place_light`, `create_material`, `assign_material`, `set_node_transform`, `translate_nodes`, `duplicate_nodes`, `delete_nodes`, `group_nodes`, `list_nodes`, `get_node_details`, slot tools.
- `edit`: `compose` plus brush and mesh tools.
- `logic`: `compose` plus hooks, events, paths, player, scene settings.
- `full`: all tools (fallback).
`pickProfile(prompt, hasImage, selection)`: keyword rules in code. Mesh words (bevel, extrude, vertex, face, edge, subdivide, brush) select `edit`. Logic words (hook, event, trigger, door opens, when player, path, spawn) select `logic`. Otherwise `compose`. If a `compose` step ends with text that asks for a missing tool, run the prompt one time more with `full` (one time only).
Split `apps/editor/src/lib/copilot/system-prompt.ts` into a static core (rules) and profile sections. Target: `compose` request is 4,000 input tokens or less.

### 4.6 Scene digest and cache-stable prompt (editor)
- Put a compact scene digest in the request so the model does not spend steps on `list_nodes` / `get_node_details`: for each node `id | name | kind | position | size`, 60 nodes maximum, then a count of the rest. Include the selection and the camera target.
- Order of the request: static system prompt and tools first and byte-identical between steps; digest last (as the last part of the latest user message). OpenAI then serves the prefix from its prompt cache. The `done` event reports `usage.cached`; log it.

### 4.7 Tier 0: instant library path (editor)
New file `apps/editor/src/lib/copilot/instant-path.ts`. Before any model call:
- Parse simple prompts in code: `(add|place|put|spawn|create|make) [count] <thing> [near|next to|on|around <anchor>]`.
- Score `<thing>` with `searchResources`. Use the instant path only when the best score is 3 or more for each content word and it is at least 2 points above the second result. Templates (`apply_template`) and `generate_island` use the same rule.
- Place through the same executor as the AI tools, so undo, reveal and the chat trace work the same. Show the result as an assistant message with a "Refine with AI" action.
- When the rule does not match, go to Tier 1. Do not guess.

### 4.8 Metrics
For each prompt, log in the browser console and keep in the chat trace: tier, profile, model, steps, time to first tool call, total time, input / cached / output tokens. The server logs the same for each call.

### Phase 1 acceptance
1. `bunx tsc --noEmit` passes in `apps/editor`; `bun run check` passes in `server`.
2. "add a lighthouse": object visible in 0.3 s or less, 0 model calls.
3. "build a small harbor with a lighthouse, a ship and some plants": first object visible in 2.5 s or less, total 8 s or less, 2 model steps or less, no primitive-built object when the library has a match.
4. Abort stops the stream and the tools within 1 step.
5. The measured numbers are written in section 9.

## 5. Phase 2: quality (no "slop")

5.1 **Layout solver in code.** `place_resource` gets `layout: { pattern: "single"|"ring"|"row"|"grid"|"scatter"|"edge", anchor: nodeId|"origin"|"camera"|"selection", count, radius, facing: "anchor"|"away"|"random" }`. Code computes positions from the entry `footprint`, snaps to terrain height, rejects overlaps (footprint circles), and uses a seed. The model gives intent only.
5.2 **Batch tools.** `place_resources` (array of the above) and `place_primitives` (array). One call builds a set. This also makes small local models reliable.
5.3 **Asset-first gate in the harness.** In the `compose` profile, `place_primitive(s)` is not in the tool list for the first step. The harness adds it only after a `search_resources` call returned no result for that object. A prompt rule alone is not sufficient.
5.4 **Catalog metadata.** Each entry gets measured `bounds`, `groundOffset`, `forwardAxis`, `triangles`, `styleTags` (stylized, scanned, low-poly) and a `collider` proxy (box, capsule or hull). A one-shot script measures the GLB files; it does not run at request time.
5.5 **Search quality.** Add synonyms and plural handling to `searchResources`; return `score` so the model and Tier 0 can see a weak match.
5.6 **Critic (optional, bounded).** After a Tier 1 or Tier 3 build, take 1 viewport screenshot and ask the model one question: "list objects that float, overlap, or have the wrong scale". Maximum 1 correction pass.

### 5.7 Contract for 5.1 and 5.2 (fixed; both Phase 2 executors code against it)

```
place_resources({
  folder?: string,                      // put all new nodes in one named folder
  items: [{
    id: string,                         // library id
    count?: number,                     // default 1, max 24
    layout?: {
      pattern: "single" | "cluster" | "ring" | "row" | "scatter" | "shore" | "path",
      anchor?: string | { x: number, z: number },   // node id, "origin", "camera", "selection"; default "camera"
      to?: string | { x: number, z: number },       // second point for "row" and "path"
      radius?: number,                  // meters; default from footprints
      facing?: "anchor" | "away" | "random" | "along"
    },
    seed?: number
  }]
})
-> { success, placed: [{ id, nodeId, x, y, z }], skipped: [{ id, reason }] }
```

- `cluster`: irregular group near the anchor, odd counts look best, small random rotation and 0.9 to 1.1 scale variation where the entry allows it.
- `shore`: on land at the island edge nearest to the anchor. `path`: evenly spaced between `anchor` and `to`, with a small side offset.
- Code computes x, y, z: terrain height, no overlap (footprint circles + 0.2 m), land only unless the entry is a water or boat kind. An item with no free place goes to `skipped`; the call does not fail.
- `place_resource` (single) stays and accepts the same optional `layout`. Explicit x, y, z still work for a user who gives coordinates.
- `place_primitives({ folder?, items: [...] })`: array form of `place_primitive`.
- All nodes of one call appear through the op queue with the stagger and the build reveal.

### 5.8 Design playbooks (runtime "skills" of the editor)
Folder `apps/editor/src/lib/copilot/playbooks/`. One file for each theme, plain data:
`{ id, name, triggers: string[], palette: PaletteId, environment: library sky id, water?: library water id, focal: library ids, support: library ids, accents: library ids, rules: string[] (5 to 8 short lines), example: place_resources items }`.
- `pickPlaybook(prompt, sceneKinds)` in code: trigger words, 1 playbook maximum. The loader adds the playbook as text (300 tokens or less) at the end of the user message, after the scene digest. The static prompt prefix does not change.
- General composition rules go in the static compose prompt (short): one focal point; groups of 3 or 5; no rows unless asked; leave open ground; taller objects behind smaller ones from the camera; one light mood for each scene.
- First playbooks, from library entries that exist: island harbor, camp, garden.

### 5.9 Palettes
`apps/editor/src/lib/copilot/palettes.ts`: named palettes (6 to 8 colors each with a role: ground, wood, stone, roof, accent, light). `create_material` in the compose profile takes `palette` + `role`; a free hex color is accepted only when the user gives a color.

### 5.10 Ghost preview
For a prompt that goes to the model, show a soft pulsing ring at the anchor (camera target, selection or named node) within 0.3 s, and remove it at the first tool call or on abort or error. Client-only, no timers that call the model.

### 5.11 History trim
Before each request, replace tool results older than the latest 2 steps with a one-line summary (`ok` or the error text). Target: step 1 input of 5,000 tokens or less for a chat with 10 earlier messages.

## 5B. Phase 2B: quality first (the Director), 2026-11-11

User test results that this phase must fix (screenshots of 2026-11-11):
1. "create a plane": 16 s and 4 steps for one flat primitive; the word has two meanings and nobody asked.
2. Airplane: 5 boxes and a sphere. The editor has only 4 primitive shapes, so every object that is not in the library is slop.
3. "create a city": buildings in a loose ring, no roads, no blocks, random trees. No generator knows what a city is.
4. "build this scene from image" (Japanese castle, cherry trees): stacked castle-kit towers and oaks. The image was not analysed, and the library cherry tree was not used.
5. "add river": a round lake with the wrong water. Water entries are discs only.

Root cause: the model was asked to place objects, fast and without thought. Structure (roads, blocks, a river course, tiers of a castle) and choice (which tree, which meaning) had no owner.

Design: **the model directs, code builds, the user chooses.**
- **Brief.** One model call with reasoning reads the prompt, the image and the scene digest and returns a `Brief` (`apps/editor/src/lib/copilot/director/types.ts`): mode, understanding, ambiguity, style (palette, era, colors and vegetation from the image), and 1 to 4 tasks, each for one generator.
- **Choices.** Before the build, the harness shows one popup (`apps/editor/src/lib/copilot/choices.ts`): the ambiguity question and the generator questions (tree type, building kit, water style), each with thumbnails, a suggested option and a note field. In the chat panel when it is open, else in the middle of the screen.
- **Generators** (code, parametric, deterministic by seed; `director/generators/`):
  - `compose`: library objects with the layout solver (Phase 2).
  - `city`: street grid with real road meshes, sidewalks, lots, buildings that face the street, street trees, lamps.
  - `river`: a ribbon of stylized flowing water along a curve, banks, reeds, stones, an optional bridge.
  - `object`: an object that is not in the library, built from a parts spec with a rich shape set (ellipsoid, capsule, lathe, extrude, wing, mirror), written by a model call with reasoning and shown part by part.
  - `architecture`: tiered buildings (Japanese castle, pagoda, tower) from parameters and colors.
- **Live build.** Every generator reports steps and reveals its nodes in order. Real time means the user sees progress at once; it does not mean a low-quality result.
- **One model call for most builds.** The brief carries the generator parameters, and code writes the summary. The tool loop stays for edits and game logic.
- **Provider and model in the prompt input.** An icon opens the provider and model list; the server accepts `model` (from the admin's allowed list) and `effort` for each request.

## 5C. Director v2: the model sees, asks, changes and checks (2026-11-11)

All paths are in `apps/editor`.

Why 5B was not enough (user test, 2026-11-11, editor on port 8080):

| What the user saw | Cause in code |
|---|---|
| "create a city" gave 2 x 2 blocks: "not a city, an intersection" | `src/lib/generators/city/params.ts`: the default size was `small`. The director prompt said "size and position are yours to set", so nobody asked. |
| Factories with chimneys beside the downtown towers | `src/lib/generators/city/layout.ts`: kit `mixed` gave blocks to industry by rank only, with no rule for distance from the core or for small grids. |
| "add river": "Built a 0 m river" and nothing in the scene | `src/lib/copilot/director/generators/river.ts`: the city left no free course, and no check refused a path of 0 m. |
| Second try: a 174 m river on a diagonal across lots and intersections | The river knew the city only as circles. It had no street plan to route by. |
| Skyscraper popup asked "Roof color?" with a Japanese roof picture | `src/lib/copilot/director/generators/architecture.ts`: one swatch drawing for every style; no question that fits a tower. |
| "make it taller" put a giant plain box in the city | The director had no way to change what a generator built, so it sent the request to the tool loop, which has primitives only. |
| No question after a build | Nothing offered a next step. |

One root cause: the model was a planner with no eyes and no hands. It saw the scene as 60 rows of node ids, it could not read what the generators knew (the street plan, the heights, the style), and it could not change a generated thing.

### 5C.1 Scene memory (sites)
- Each generator writes ONE `SiteRecord` as JSON text into `metadata.site` of its folder node, in the same undo step as the build (`src/lib/copilot/director/site.ts`, `siteMetadata`).
- The record has the resolved params (popup answers and the world position folded in) and facts in world meters: center, rect, height, style words, a one-line summary, the list of params that can change, and for a city the full plan (`CitySiteFacts`: streets, blocks, zones, avenue axis).
- `src/lib/copilot/scene-digest.ts` folds each site to ONE digest line ("built city (212 parts)") and adds a `[Built]` block and a `[Scene style]` line. The model reads structure, not a parts list.
- Generators read `ctx.sites`: the river routes by the city plan, a tower takes a city block.

### 5C.2 Change in place (replace tasks)
- `BriefTask.replace` = a site id from `[Built]`. `run.ts` merges the task params over the stored params (`mergeReplaceParams`), sets the anchor to the site center, and the generator removes the old nodes and adds the new ones in one undo step.
- `BriefTask.ask` = params the user wants to choose again ("another look"). Code drops them and the generator asks its question.
- Director rules: a change to a `[Built]` line is never mode edit and never a primitive. Relative words have numbers ("taller" = 1.5 times, "really", "not enough" = 2 times or more). The understanding names the old and the new value.
- Tool loop rule (`src/lib/copilot/system-prompt.ts`): never rebuild or cover a "built" node with primitives.

### 5C.3 Ask before a big build
- Scope and place are the user's: city size, river route, building site and height are left out by the director unless the words give them.
- Generators ask them FIRST, as map questions (`ChoiceQuestion.kind = "map"`) with plan thumbnails drawn in code from the real plan (`src/lib/copilot/director/minimap.ts`): "How big?", "Where should the river run?", "Where should it stand?".
- A thumbnail must show the thing the option builds, in the right style.
- A vague request gets 2 to 4 concrete directions (the ambiguity question), not a guess.

### 5C.4 Fit the scene
- The director reads `[Scene style]` and `[Built]`; a new thing takes the era, kit, tree species and water style of the scene unless the user asks for a contrast.
- Default sizes come from the scene: a "tall" tower is 1.6 times the present skyline, not a fixed number.
- Small things (`place_resources`, Tier 0) use `propPlacementSceneOf` (`src/lib/copilot/instant-path.ts`): street surfaces and river water are obstacles, the ground inside a city is the sidewalk level.

### 5C.5 Check and continue
- A generator that cannot build returns no nodes and a plain reason. It never reports a thing that is not there (the 0 m river).
- Each result carries 2 to 4 follow-ups (`GeneratorResult.next`). `run.ts` puts them on the last chat message (`CopilotMessage.suggestions`); the chat shows them as "Next" chips, and a click sends the prompt. A large build is thus done in steps that the user starts: build the town, then "Make it bigger", "Add a river", "Add a landmark tower".

### 5C.6 Not in this phase
- A model critic that looks at a screenshot after the build.
- Growing a city in place by districts (today "bigger" builds the city again at the same center; a river or tower that was fitted to the old plan does not move with it).
- Replace for the object modeler (the airplane) and for compose groups.

## 5D. Inside a building (2026-11-11)

All paths are in `apps/editor`.

The request, in game mode inside the glass hall of a generated tower: "inside the building here add ceiling and floor, make best interior". The answer claimed 6 placed objects and a modeled room. The user saw nothing.

| What failed | Cause |
|---|---|
| The floor pieces did not appear in the hall | The brief sent the request to `compose` with modular kit floor pieces. The placement scene (`propPlacementSceneOf` in `src/lib/copilot/instant-path.ts`) makes each built building an obstacle, so every place inside was "not free". The pieces went outside the tower or were skipped. |
| The modeled room did not appear in the hall | The `object` generator looks for free ground outward from the anchor. The first free ground was outside the tower. The summary did not say that. |
| The room was 5.5 x 3.1 m in a hall of about 20 m | No generator knew the size of the hall. The model guessed. |
| No question | "best interior" leaves the use and the finish open. No generator owned those questions. |
| 39 s | Five calls of the object modeler. |

### 5D.1 The `interior` generator

- Pure builder: `src/lib/generators/interior` (`params.ts`, `plan.ts`, `build.ts`, `thumbs.ts`). Input: the inner size of the room, the clear height, the entrance side, a use (lobby, office, lounge, apartment) and a finish (warm wood, stone and brass, light minimal, dark industrial). Output: a floor finish, a ceiling with light panels, the furniture of the use, and floor plates for the upper storeys of a tall hall.
- Library entry `gen:interior` (`src/lib/resources/generated/interior.ts`) builds from the node params, like `gen:architecture`.
- Director generator `src/lib/copilot/director/generators/interior.ts`:
  - Host: the building id from the brief, else the building around the player (game mode), else the selection, else the building at the camera target, else the only or the nearest building.
  - Fit: `towerLobby()` in `src/lib/generators/architecture/tower.ts` gives the hall of a modern tower (inner size, floor level, storey height). The interior takes that size, the place and the turn of the tower.
  - A building with no hall (castle, city kit building): nothing is built and the summary says why.
  - No building: a room that stands alone (walls with a door and windows).
  - One interior for each host: a second request rebuilds it in place.
  - Questions: "Which interior?" and "Which finish?", each option with a plan picture of this room.
- Site record with `facts.interior`: host, use, finish, floor and ceiling level, furniture footprints.

### 5D.2 Placement inside

- When the anchor is inside an interior, the host and the interior are not obstacles, the furniture footprints are, and the ground is the interior floor.
- The object generator adds a sentence when its object could not stand at the asked place: the distance and the direction (`placeNote`).

## 5E. Changing a modeled object (2026-11-11)

The request that failed, in the desert scene with a puddle and a small modeled cactus: "that's too small . so build giant cactus as a wall for puddle." The answer was: `"node:resource:parts:2" is not in the scene, so there is nothing to change.` The cactus was in the scene.

| Cause | Where | Change |
|---|---|---|
| The object generator kept no record of what it modeled. The director saw the cactus in the scene digest and named it in `replace`, as the rule for built things says. `run.ts` looked only at the site records. | `apps/editor/src/lib/copilot/director/run.ts`, `generators/object.ts` | `director/objects.ts` reads each modeled object back from the scene as a record with generator `object` (also objects made before this change). `run.ts` finds a site, a modeled object, or a node inside one of them. |
| The error text was false and a dead end. | `run.ts` | A node that is in the scene but that no generator built goes to the tool loop (an edit of that node). Only an id that is in no scene is reported as missing. |
| "Bigger" would have meant a new model call (30 s) and another cactus. | `generators/object.ts` | A size change uses the same parts spec with another fit size, in the same node, with no model call. Colors change the palette roles of the same spec. |
| One model could not be repeated. A "wall of cactus" could only be modeled as one object. | `generators/object.ts` | Params `count`, `arrange` (cluster, ring, row), `around` (a node id), `closed` (a ring with no gaps), `vary`. Code places copies of the same spec with the layout solver, in one folder and one undo step. |
| The subject held the place ("cactus beside the rain puddle"), so the modeler put a puddle into the cactus model. Each copy then had its own puddle. | `director/objects.ts` (`subjectAlone`), `generators/parts/prompt.ts` | Code cuts the place from the subject. The modeler prompt has the rule "ONLY THE SUBJECT". The place goes in `around`. |
| A new object "next to the puddle" stood at the center of the puddle (a puddle is no obstacle). | `generators/object.ts` | With `around`, a new object stands just outside that thing, and the summary says so. |

Rules in code:

- A closed ring takes its count from the ring length. A count wins only when the number is in the user's own words.
- Copies keep a straight-line distance (the chord of the ring). With the arc length, each second copy had no room and moved one step out.
- Natural things (cactus, tree, rock) get their own turn and a size from 0.86 to 1.14 for each copy.
- A change of shape (`change`, or a subject with new traits) gives the present spec to the modeler with the words of the change.
- After a change to an object, the view moves only when it does not show the result.

## 6. Phase 3: external assets (Hugging Face and others)

Do not search Hugging Face at prompt time. It is slow and the result quality is not controlled.

- One-shot script `server/scripts/build-asset-index.ts` reads dataset metadata and writes `server/data/assets-index.json`: `id, name, category, tags, size_metres, triangles, bytes, thumb URL, GLB URL, license, attribution, styleTags`.
- Filters: license allows redistribution; GLB 1 MB or less after packing; triangle limit; one style tag.
- `GET /api/assets/search?q=` on the server searches the index in memory. The editor loads the GLB from the source host when the object is placed, and caches it.
- `codepawl/scanned-objects-glb`: 1,033 scanned household objects (toys, shoes, kitchen items), CC-BY-4.0, columns include `category`, `size_metres`, `triangles`, `pack_bytes`, `thumb`. Good for realistic props with correct real-world size. They are photo-scans of branded products, so they do not match the stylized Theras look. Tag them `scanned` and use them only when the user asks for a realistic object or when the library has no match. CC-BY needs an attribution list: generate `ATTRIBUTION.md` and a credits panel from the index.
- The collection `cfahlgren1/3d-datasets-in-the-dataset-viewer` lists more datasets (for example `W1nst0nGe/hssd-glb`, `alecjacobson/threedscans`, `cfahlgren1/lowpoly-coder-4b-data`). The collection page does not state their licenses. Read each dataset card before use. Not verified yet.
- Better match for the Theras style: CC0 stylized kits (Kenney, Quaternius) and Poly Haven models (CC0). Verify license and hosting for each before use.

### 6.1 Built on 2026-11-11: the scanned objects

Status: built for `codepawl/scanned-objects-glb`. The other sources of this section are not built. Results are in section 9, "External assets (6)".

Checked on Hugging Face before the build (2026-11-11, dataset commit `1cde9d39eb0db55bd90bebb8e7baab0fb5486291`): the dataset card gives the license `cc-by-4.0`; `metadata.jsonl` has 1,033 rows; each row has the license `CC-BY-4.0`; the columns `id`, `name`, `category`, `brand`, `license`, `file`, `thumb`, `size_metres`, `triangles`, `pack_bytes` and `source` exist. The scans are Google Scanned Objects by Google Research (Copyright 2020 Google LLC). The dataset holds GLB copies with meshopt geometry and a 2048 px WebP texture.

| Part | File | What it does |
|---|---|---|
| Filter, index type, search | `server/src/assets.ts` | `judgeRow` keeps a row only with complete columns, a license that allows redistribution, 1,000,000 bytes or less (`pack_bytes`) and 20,000 triangles or less. `searchAssets` searches the index in memory. No network request, no timer. |
| Index script | `server/scripts/build-asset-index.ts` | Run by hand: `bun run assets:index` in `server`. Two GET requests to Hugging Face, each tried one time. Checks the card license and the columns, then writes the index and the credits file. Writes nothing when a check fails. |
| Index | `server/data/assets-index.json` | 713 models. Each has `id, name, category, tags, styleTags, size_metres, triangles, bytes, thumb, glb, license, attribution, source`. The URLs name the dataset commit, so a later change of the dataset does not change the files. |
| Credits | `ATTRIBUTION.md` | Written by the script: author, license, source, changes, and one line for each model with a link to the original scan. |
| Search route | `server/src/main.ts` | `GET /api/assets/search?q=&limit=` (limit 1 to 50, default 12). The index is read one time at server start. |
| Library source | `apps/editor/src/lib/resources/external/scanned.ts` | A search result becomes a library entry: id `scan:<id>`, tag `scanned`, kind `feature`, source `external`, real size (scale 1), credit text. The GLB loads from the Hugging Face host when the object is built. |
| Search client | `apps/editor/src/lib/resources/external/scanned-search.ts` | One request to the Theras server for each new query. An answer is kept in memory. No timer, no retry. |
| Ranking | `apps/editor/src/lib/resources/catalog.ts` | Scanned entries are not in `RESOURCES`. `searchResourcesScored` puts them after every local entry and scales their score to less than 0.5 (the lowest score of a local match). So the instant path, the noun matches and the library index of the prompts never take one. |
| Director | `apps/editor/src/lib/copilot/director/scanned.ts`, rule "Scanned objects" in `brief.ts` | The director gets a `[Scanned objects]` block (ids, names, category, real size) only in two cases: the words ask for a realistic object, or a simple "add <thing>" request names a thing with no local match. In every other case no request is made. |
| Library panel | `apps/editor/src/components/editor-shell/ResourceLibraryPanel.tsx` | Filter "Scanned". A search asks the server 350 ms after the user stops typing. A card shows the thumbnail, the real size and the credit; "in scene" marks a model that is in the scene. |

Decisions made during the build:

- Triangle limit: 20,000. The scans are not simplified (median 12,316 triangles). 20,000 keeps 69% of the models.
- Two rows have an id with a letter that is not ASCII ("Pokémon ..."). The filter leaves them out, because the id is part of a URL and of a node id.
- The editor does not hold the index. It asks the search route when the user acts. A model that was placed is remembered in the browser (`localStorage`, key `theras:scanned-used`), so a saved scene shows it after a reload with no request to the Theras server.
- The loader in `apps/editor/src/lib/resources/models/gltf-model.ts` now has the meshopt decoder. The scanned files need it. Other GLB files load as before.
- The credit is shown on the library card. A separate credits panel is not built.
- "The library has no match" is narrow on purpose. The index has many toys and packages with common words in the name (a toy airplane, a dog bowl, a film named "House of Cards"). The rule tells the director that a toy or a package of a thing is not the thing.

## 7. Phase 4: orchestration and image-to-build

7.1 **Planner and workers (Tier 3).** Trigger: the prompt names 3 or more areas or asks for a "scene / village / level / world". Step 1: one `compose` call returns a zone plan as JSON (`zones: [{ name, center, radius, theme, items }]`), no tools. Step 2: one streamed worker call for each zone, 3 in parallel, 4 zones maximum, 3 steps maximum for each worker. All tool calls go through one serial op queue, so the build reveal plays zone by zone. Total time limit 40 s; then stop and report.
7.2 **Image to build.** Uses the method of the img2threejs skill (staged spec, part decomposition, vision self-check; Apache-2.0, keep its NOTICE if text is copied). Not its code: it is an agent skill, not a browser library, and the editor must not run model-written JavaScript.
  1. Vision call returns a caption and a part list (name, shape, relative size and position, color, material).
  2. Caption goes to the library search first. Strong match: place the library object and stop.
  3. No match: parts are sent as `place_primitives` batches (base first, details last). Each batch is visible at once with the reveal.
  4. Critic: screenshot against the reference image, 2 correction passes maximum.

## 8. Phase 5: physics cost

- Library objects use the `collider` proxy from 5.4. No trimesh collider for library objects.
- Static scenery goes into one fixed body with compound colliders.
- While an AI build runs, do not rebuild colliders for each op. Rebuild one time when the op queue is empty.
- Rapier with Ecctrl first; BVH mode (BVHEcctrl) second; Jolt later.

## 9. Measured results

### Phase 1, measured 2026-11-11 in the editor on port 8080, model `gpt-5.6-luna`, effort `low`

| Prompt | Tier | Steps | First object | Total | Tokens in / cached / out | Budget |
|---|---|---|---|---|---|---|
| "add a lantern" | 0 (instant) | 0 | 0.0 s | 0.0 s | 0 | Met |
| "build a small camp next to the windmill: a rowboat by the shore, a campfire, a bench and three plants" | 1 (compose) | 3 | 8.9 s | 13.6 s | 22,991 / 14,934 / 889 | Not met (2.5 s, 8 s) |
| Tiny 2-tool request, direct to the server | 1 | 1 | 1.4 to 1.8 s | 1.5 to 2.0 s | 78 / 0 / 67 | Met |

Findings:
- Step 1 of the camp prompt took 8.9 s to the first tool call and produced 774 output tokens for 6 tool calls. The model spends that time on coordinates. Section 5.1 (layout in code) and 5.2 (batch tools) are the fix; after 5.1, test `OPENAI_EFFORT_COMPOSE=none`.
- Step 1 input was 7,001 tokens, not 4,000: the chat history and the digest add to the 3,700-token prefix. Trim old tool results from the history.
- The prompt cache works from step 2 (6,998 of 7,939 input tokens cached).
- Fixed after the first test: a water surface (radius 48 m) blocked every instant placement; the compose prompt now has a library index, so the model places in step 1 without a search step.
- Not tested: abort during a stream, the 404 fallback, "Refine with AI", the local provider against a real local model, Gemini.

### Phase 2, measured 2026-11-11, model `gpt-5.6-luna`

Direct to the server, camp request (3,394 input tokens), one `place_resources` call in step 1:

| Setting | First tool call | Total |
|---|---|---|
| Luna, effort `low` | 3.0 to 3.7 s | 3.0 to 3.8 s |
| Luna, effort `none` (now the default for `compose`) | 1.7 to 2.9 s | 1.8 to 3.0 s |
| Terra, effort `none` | 2.3 to 2.5 s | 2.3 to 2.5 s |
| GPT-4.1 mini | 2.1 s | 2.1 to 2.2 s |

In the editor on port 8080 (the browser pane was hidden during the test, so client times can be too high; server times are exact):

| Prompt | Steps | Server time, all steps | Result |
|---|---|---|---|
| Garden near the lighthouse (effort `low`, before the layout fallback) | 4 | 13.1 s | Fountain skipped 2 times; the model then placed it with raw coordinates |
| Shrine corner (effort `low`, fallback without distance limit) | 4 | about 14 s | Objects landed far from the anchor; 3 stones placed with raw coordinates |
| Harbor by the lighthouse (effort `none`, final code) | 4 | 7.4 s (1.5 + 1.7 + 2.4 + 1.8) | All 4 objects placed in one call, ship and rowboat on water, nothing skipped |

Findings and open items:
- The model follows the playbook and sends one batch call with layout relations and no coordinates.
- With effort `none` the model made 2 `search_resources` calls for "ship" before it placed, although the index has `vehicle: caravan-ship`. Fix: put a short alias in the index line, or resolve common nouns to ids in code before the model call. Then the harbor prompt is 2 steps and about 4 s.
- The last step of each run is a text-only step of about 1.8 s. Option: end the run in code when all tool calls succeeded and write the summary from the tool results.
- The prompt cache now covers the whole earlier chat (10,387 of 10,860 input tokens cached in step 3). Step 1 and 2 of a new prompt show `cached=0` when the scene digest changed; the static prefix should still be cached, so check why.
- The test island is now crowded (about 70 objects), and the solver correctly reports "no free land near the anchor". The first budgets must be measured again on a fresh template scene.
- Not tested in the browser: the ghost ring (the pane was hidden), abort during a stream, undo of a batch, `create_material` with a palette, Codex and Gemini with the new tool schema.

### Phase 2B (Director), measured 2026-11-11 in the editor on port 8080, model `gpt-5.6-luna`

| Prompt | Before | Now | Model calls | Time (choice wait excluded) |
|---|---|---|---|---|
| "create a plane" | flat primitive, 16.3 s, 4 steps, no question | popup "Airplane or flat plane?"; flat plane path | 2 | 5.7 s (brief 3.9 s) |
| "create a small propeller airplane" | 5 boxes and a sphere | parts model, 22 parts (32 pieces): lathe fuselage, tapered wings, tail, canopy, gear | 2 | 26.9 s (brief 3.1 s, modeler about 20 s) |
| "create a city" | 6 buildings in a ring, no road | street grid, markings, crosswalks, median, park with fountain, street trees, lamps | 1 | 13.5 s (brief 2.2 s, rest is the staged reveal) |
| "build a Japanese castle with pink sakura trees around it" | stacked castle-kit towers, oaks | 5-tier keep (17 m), stone yard, lanterns, cherry trees around; popup for tiers and trees | 1 | 14.2 s (brief 10.0 s) |
| "add river" | round lake | winding 40 m river with flow, banks, reeds, stones, bridge; routes around the castle; popup for water | 1 | 5.2 s |

Fixed during integration: dock slot tools removed from the compose profile (the flat-plane reading made a dock slot); stone foam in the river shader made a thin ring; the director now leaves taste params open so the popup appears; a later task can anchor on an earlier task (`@1`), and an unknown node id falls back to what the task before built; generated objects report their real footprint in the scene digest.

Open items:
- The image path ("build this scene from image") was not run in the editor after the change: the test browser cannot attach a file. The text version of the same request passes.
- The object modeler waits about 20 s with one chat line and no visible progress. Options: a first call for the primary forms only (about 5 s), then details; or stream the parts as they are written.
- Brief time varies from 2 to 10 s with effort `low`.
- Not checked in the browser: the ghost ring, abort during a brief or a generator run, undo of each generator, the flat-plane path after the slot fix, the large city frame rate, the river on an island (terrain carve), the other architecture styles, Codex and Gemini.
- `File > New scene` did nothing in the test browser; check it.

(Executor: add a table for each later phase.)

### Director v2 (5C), measured 2026-11-11 in the editor on port 8080, model `gpt-5.6-luna`

One scene, the user's own failing sequence, prompt bar layout. Times do not include the time in the popup.

| Prompt | Before (user test) | Now | Brief | Total |
|---|---|---|---|---|
| "create a city" | 2 x 2 blocks, factories beside the towers, no question | Popup: "How big?" with 4 real plan maps (City suggested), "Which character?", "Street trees?". Result: 4 x 4 blocks, downtown core, skyline that falls to the edge, park and plaza, 106 buildings. Camera frames the city. Chips: Make it bigger, Add a river, Add a landmark tower | 1.7 s | 12.8 s |
| "add river" | "Built a 0 m river", then a diagonal across lots and intersections | Popup: "Where should the river run?" with 4 route maps, water, banks. Result: 288 m river along the south edge, bridge in line with the avenue | 2.4 s | 7.0 s |
| "the river is too thin, make it much wider" | not possible | Replace task `river>node:group:2 {"width":6}`, no popup, same route and bridge | 2.3 s | 6.9 s |
| "I want a really tall skyscraper" | "Roof color?" with a Japanese roof picture, 40 m tower at the camera target | Popup: "Where should it stand?" (3 lot maps, "3 city buildings make room"), "Which look?" (3 tower silhouettes), "How tall?" (60, 95, 130 m against a 44 m skyline). Result: 95 m glass tower on a downtown lot | 3.2 s | 5.5 s |
| "not tall enough , make it more taller" | a giant plain box | Replace task `architecture>node:group:2 {"height":190}`, no popup: same tower, same lot, 95 m to 190 m | 2.7 s | 5.0 s |
| "give the tower another look" | not possible | Popup with only "Which look?"; the tower is rebuilt as art deco setbacks in place | 2.6 s | 4.9 s |

Found and fixed in this test:
- The size suggestion read "street trees" in the director's sentence as "street" and suggested a neighborhood. The user's own words now decide first.
- The director still set the kit ("mixed") and the trees by itself. `Generator.taste` now drops such params in code unless the user's words decide them (`withoutUnaskedTaste` in `src/lib/copilot/director/run.ts`).
- "skyscraper" matched city kit pieces in the library, so the director offered six shop buildings. Landmark nouns no longer list kit pieces; the route rule names the architecture generator.
- A river beside a 190 x 250 m city was 3 m wide. The default width now comes from the city (about 10 m), the limit is 16 m, and the bridge scales up to it.
- After a big build, and after a reload, the camera was inside a tower. `src/lib/copilot/frame-site.ts` frames a new site when the view does not show it, and the largest site when a draft is restored (`src/app/App.tsx`).

Unit tests: 230 pass in `apps/editor/tests` (13 files). `tsc --noEmit`: 0 errors. `bun run check` in `server`: pass.

Open:
- Checked only in the prompt bar layout. The floating, docked and bubble layouts use the same popup component and were not looked at after the change.
- The quay side of a city river is the same grass bank as the far side; a stone quay wall needs a change in `src/lib/resources/water/river-water.ts`.
- "Make it bigger" builds the city again at the same center; a river or tower fitted to the old plan does not move with it.
- A 190 m tower keeps its 15 m footprint on a replace (a very slender tower).
- A city in the same brief as a river: the river cannot ask its route question, because the city plan does not exist when the popup opens; it takes the best route.
- Not tested: metropolis frame rate (about 520 nodes), the mixed and industrial characters, the river routes "bend" and "outside", the image attachment path, undo of each replace, abort.
- Scene memory covers city, river and architecture. The object modeler (the airplane) and compose groups have no record, so they cannot be changed in place yet.

### Prompt opening, voice orb and base trees, measured 2026-11-11 in the editor on port 8080 (window 655 px wide)

All paths are in `apps/editor`. Screenshots: `docs/plans/screens/` (files `v3-0` to `v3-4`).

| Problem the user reported | Cause found | Change | Result in the browser |
|---|---|---|---|
| Cmd+L and the header prompt do not open the prompt | The layout was the voice orb, which has no text field. In a window below about 680 px the header prompt was also 10 px wide and a click landed on Undo. | `src/state/ask-theras.ts` holds the open rules: the voice orb is not saved and is never what Cmd+L, the header prompt, Cmd+K or the game chat key opens. `src/components/editor-shell/EditorMenuBar.tsx`: the prompt keeps a minimum width and the name hides below 768 px. | Header click and Cmd+L open the prompt with the cursor in it. From the orb, Cmd+L goes to the text prompt. A second Cmd+L hides it, also while the cursor is in the prompt. |
| The orb in the corner does not animate | The library's `idle` state moves the ring too little to see at 64 px. | `PromptBubble` in `src/components/editor-shell/CopilotPanel.tsx` gives the waiting ring a slow level of its own (`idleRingLevel`). No microphone: the text prompt opens with a notice. | Three frames at 1 s intervals show three different ring shapes. Voice input itself was not tested: the browser pane blocks the microphone. |
| Trees look bad | The street trees were the painted vegetation set at about half the game size, with the editor's weak preview light, no shadows and no post-processing. The "Which trees?" question listed six small island trees first. | `src/lib/resources/nature/folio-trees.ts` and `folio-tree-data.ts`: the folio-2025 tree kit (MIT, Bruno Simon; the kit of the the author's engine) with cards that face the free camera. Ids `nature:tree:oak-round` and `nature:tree:birch` now build these trees; new ids `cherry-blossom`, `fir`, `maple-autumn`, `birch-autumn`, `oak-golden`, `nature:bush:round`. The painted vegetation trees keep their look as `nature:tree:painted-oak` and `painted-birch`. Tag `basic` ranks the set first. | The 161 street trees of the saved city changed with no rebuild. "Add trees around the tower" asks "Which trees?" with pictures of the new set, Oak suggested. |
| Trees "around the tower" stood up to 53 m away | A cluster searched 24 rings outward (75 m for a tree). | `src/lib/resources/layout.ts`: a cluster stops at the distance the group needs. | Not run again in the browser after this change; unit tests pass. |

Open: a group near a tower in a dense block can now be smaller than asked when free ground is short. The orb covers the right end of the panel bar in a narrow window. Shadows of the new trees in "full" render mode were not looked at. Pine and palm are still the painted vegetation models.

### Game mode rework, measured 2026-11-11 in the editor on port 8080

All paths are in `apps/editor`. Notes for the code: `src/lib/game/README.md`. Screenshots: `docs/plans/screens/` (files `v4-1` to `v4-5`).

| Problem the user reported | Cause found | Change | Result in the browser |
|---|---|---|---|
| The player is a block figure | The controller was Ecctrl, but the figure was built from boxes and capsules. | The example character of Ecctrl (rigged, 46 animations; MIT, animations from the Universal Animation Library by Quaternius, CC0) is the player and the library entry `creature:person`. | The mannequin is drawn in third person. Animation blending was not seen at normal frame rate. |
| Game mode should be first person | Third person was the default and old saved settings kept it. | First person is the default; settings saved before version 2 do not pin third person. | A saved "third" setting started in first person. |
| "Immediate physics", nothing to see | Every collider was built in the first two scans. | Play starts a wrap phase: colliders are built near to far over 1.2 to 6 s, each with a sweep overlay, with a progress card and a Skip button. | 422 objects (260 trimesh, 162 tree capsules) in about 5.5 s; the sweep is visible on the buildings. |
| No physics marks in the scene tree | The tree had no physics data. | `gameStore.bodies` holds the live colliders; the tree shows a mark for each object and a count for each folder. A click on a mark changes the mode. | "Create city 353", "Modern tower 1", "Trees around the tower 5" with the trunk icon. |
| The player started inside a closed tower | The start was the ground under the editor camera target. | The start is open ground outdoors (nothing above within 60 m, no wall within 0.6 m), searched up to 120 m from the view. A "Player start" marker node sets it by hand ("Set here" in the physics panel). | The player started on the street at 0, 0, outside the tower. "Set here" made the marker node; the panel then said "Marker: Player start". |
| Game UI not responsive | Fixed widths, one layout. | Container queries; the hints bar shows fewer items when narrow; the panel scrolls inside. | At 420 x 700 no HUD part is outside the view (measured from the page). |
| Editor tools inside game mode | Not there. | Tab shows or hides the editor tools; the player stands still and the editor has the keys and the camera. | Tab set the tools view, the header and dock came back, and the chip "Editing in game mode" with "Resume play" was shown. |
| Black background at eye height | Scenes with no sky show the dark editor background. | A plain day sky is drawn while the user plays, only when the scene has no sky. | Seen in first person. |
| Voxel and block look | No rule against it. | Rules in the director prompt, the tool loop prompt and the object modeler prompt; a person is always `creature:person`. | Not run with the model in this session. |

Limits of this test: the browser pane was hidden, so it ran at 1 to 2 frames per second. Walking speed, animation blending, the head bob, the push click and pointer capture were NOT seen at normal speed. Open: buildings are closed shells with no doors or interiors; the wrap of 400 objects takes about 5 s (Skip ends it); the game panel in the tools view can cover an open inspector panel.

### Inside a building (5D), measured 2026-11-11 in the editor on port 8080, model `gpt-5.6-luna`

Scene: the saved city with the 190 m tower (footprint 15 m, look "setback"). The camera was inside the tower hall. Screenshots: `docs/plans/screens/` (files `v5-0` to `v5-5`).

| Request | Before | Now | Brief, total |
|---|---|---|---|
| "inside the building here add ceiling and floor, make best interior" | 6 kit pieces and a 5.5 x 3.1 m room, none of them in the hall; 39 s | Popup: "Which interior?" (Lobby suggested) and "Which finish?" (Stone and brass suggested for this tower look), each option with a plan picture of this room. Then a lobby in the hall: a 13.6 x 12.1 m tiled floor, a ceiling 3.8 m above it with light panels, a reception desk, 3 seating groups, a lift core with 2 lifts, 6 plants, 2 floor plates above. The editor camera goes inside. | 4.1 s, 5.8 s |
| "Make the interior an office" | not possible | The same room, rebuilt as an office (desk clusters, storage wall). No popup: the finish is kept. One undo step brings the lobby back. | not measured |
| "add a round bush here" (camera in the lobby) | pushed out of the tower | "Which bushes?" popup, then the bush stands on the lobby floor (y = 0.47) inside the room, clear of the furniture. | not measured |

Found in this test and changed:

- The ceiling was dark from below, because the lamps hang just under it and the sky light never reaches it. A soft light at half height stands in for the light that a floor reflects (`src/lib/resources/generated/interior.ts`).
- The tower had no door: the glass hall was a closed box. The podium now has an entrance opening under the canopy, a door frame and two steps (`towerDoor` in `src/lib/generators/architecture/tower.ts`). Every tower in a saved scene gets it on the next load.
- A default folder name ("Lobby interior") now follows the use after a change.

Not tested: game mode inside the lobby (walking in through the door, the colliders of the furniture). The Browser pane was hidden, and a hidden pane runs too slowly to judge walking. Not tested: the finishes other than stone and brass in the live editor, the cafe lounge and the apartment in the live editor, a room that stands alone, a building with no hall.

Open: the glass of the tower is not see-through, so the interior shows from outside only through the door. A tower that is rebuilt (taller, another look) keeps its interior as it is, also when the hall size changes. A build by another session at 13:52 replaced the working editor with a blank page while the interior files were half written; `failOnMissingImport` in `vite.config.ts` now stops such a build before `dist` is written.

### Changing a modeled object (5E), measured 2026-11-11 in the editor, model `gpt-5.6-luna`

Scene: the "Desert of the giants" template, opened at `http://localhost:8080` (the same build as port 8080 on `127.0.0.1`, with its own saved scene). All requests ran in one scene, in this order. Screenshots: `docs/plans/screens/` (files `v6-0` to `v6-2`).

| Request | Before | Now | Total |
|---|---|---|---|
| "add a puddle here" | works | The library puddle (`water:puddle`). | 3.6 s |
| "add a cactus next to the puddle" | The cactus stood at the center of the puddle, and its model held a small puddle. | A saguaro of 11 parts, 4.1 m tall, 2.8 m from the puddle center. Summary: `It stands beside "Rain puddle".` | 48 s (one modeler call; the pane was hidden) |
| "that's too small . so build giant cactus as a wall for puddle." | `"node:resource:parts:2" is not in the scene, so there is nothing to change.` (3.1 s, nothing built) | 6 copies of the same cactus, each about 7 x 12.3 x 3 m, in a closed ring 9.1 m across around the puddle. No new model call. | 3.1 s |
| "you make the cactus bigger like a giant" | not possible | The wall is rebuilt with 5 copies of about 22 x 38.7 x 9.3 m in a closed ring 23.2 m across. The view moves back to show it. | 2.5 s |
| one undo | - | The wall of 6 copies of 12.3 m is back. | - |

Found in this test and changed: the first ring had 8 copies on two radii (arc length in place of chord); the ring was not closed, because the director sent `closed` and a count of its own; all copies had the same turn; the cactus model held a puddle; the grown cacti filled the view.

Not tested in the live editor: a row, a group with a count, other colors, a change of shape by the modeler (unit tests cover them). Not tested: game mode (walking between the cacti, their colliders). Open: a puddle is no obstacle, so "add a cactus here" with the camera on a puddle still stands in it. An object that was modeled before this change and that holds a place in its model (a puddle under the cactus) keeps it in each copy; ask for a change ("remove the puddle from the cactus") first.

### External assets (6), measured 2026-11-11, model `gpt-5.6-luna`

Index (script `server/scripts/build-asset-index.ts`, one run, two requests to Hugging Face):

| Measure | Value |
|---|---|
| Rows in the dataset | 1,033 |
| Kept in `server/data/assets-index.json` | 713 |
| Left out: file over 1,000,000 bytes | 13 |
| Left out: over 20,000 triangles | 305 |
| Left out: id with a letter that is not ASCII | 2 |
| Left out: license | 0 |
| Size of the index file | 601,747 bytes |
| `ATTRIBUTION.md` | 736 lines, one line for each model |

Search route, tested on a server on port 4312 (`PORT=4312 bun src/main.ts` in `server`; the process was stopped after the test):

| Query | Result | Time |
|---|---|---|
| `realistic mug` | 4 mugs; the word "realistic" is not a search word | 7 ms (first request) |
| `coffee mug` | the 2 mugs with both words first | 1 ms |
| `shoe` | shoes with the word in the name first, then by category | 1 ms |
| `zzzz` | no result | 1 ms |
| empty | one model of each category in turn | 1 ms |

The server on port 4310 runs with `bun --watch`, so it has the route too. A request from the editor page to port 4310 took 10 ms the first time and 2 ms at prompt time.

Editor, tested in the built-in browser at `http://localhost:8080` (the build of port 8080; this origin has its own saved scene, the "Desert of the giants" test scene). Window 800 px wide. Screenshots: `docs/plans/screens/` (files `v7-0` to `v7-3`).

| Request | Result | Time |
|---|---|---|
| "add a realistic mug" | Brief: compose with `scan:Cole_Hardware_Mug_Classic_Blue`. The mug stands at the camera target at real size (about 17 x 13 x 9 cm). Summary: `Placed 1 library object.` | 3.9 s total (brief 3.85 s, 5,379 tokens in, 114 out). The asset search took 2 ms. The GLB (125,680 bytes) came from the Hugging Face host in 1.1 s. |
| Page reload | The mug shows again. No request for assets to the Theras server; the GLB loads again from the Hugging Face host. | 0.8 s for the GLB |
| "add an airplane" | Brief: generator `object`, subject "airplane". The 2 scanned toy airplanes in the context were not used. The build was stopped after the brief. | brief 2.75 s |
| "add a jenga game" | Brief: compose with `scan:2_of_Jenga_Classic_Game` (the library has no match, and the scan is that thing). The game stands next to the mug, 29 cm tall. | 2.3 s total |
| "add a dog" | Brief: generator `object`, subject "dog". The scanned dog bowls in the context were not used. The build was stopped after the brief. | brief 2.4 s |
| Library panel, filter "Scanned" | Cards with thumbnail, real size and credit. The header shows "713 scanned objects by search". | - |
| Library panel, search "mug" | 4 scanned mugs. The card of the mug in the scene shows "in scene" and the credit. | - |
| Library card "ACE Coffee Mug" to the dock, then one tap in the scene | The mug is placed. The GLB loads at the tap, not when the card goes to the dock. | 1.1 s for the GLB |

Tests: `apps/editor/tests/scanned-assets.test.ts` has 29 tests (the index filter, the index file, the search ranking, the rule that local entries win, the director context). `bun test tests/` in `apps/editor`: 543 pass. `bunx tsc --noEmit` in `apps/editor` and `bun run check` in `server` pass.

Not tested: game mode with a scanned object (walking, colliders). GPU memory of the 2048 px textures (the dataset card gives a median of 21.5 MiB for each object; not measured here). Many scanned objects in one scene. A window of about 2000 px. A Theras server that is not on the same computer. A slow or closed Hugging Face host (the code logs a warning and leaves the object empty). The Docker image of `server` (the Dockerfile now copies `data`; it was not built). A realistic request with an image, or in a scene with a city.

Open: a scene that is opened in another browser does not show its scanned objects, because that browser has no record of them. A realistic request for a thing that has no scan ("a realistic dragon") gives the director weak matches (a saucer named "Dragon Fly"); the rule tells it to use a scan only when it is that thing, and this case was tested only in a dry run. The tool loop (mode edit) and the Gemini and Codex providers do not get the `[Scanned objects]` block. The test left one dock slot ("ACE Coffee Mug") in the dock of `http://localhost:8080`; the scene there is as it was.

### Pictures for the README, made 2026-11-11 in the editor at `http://localhost:8080`, model `gpt-5.6-luna`

The pictures and the GIF in `README.md` are in `docs/media`. Each is a capture of the 3D view (window 1920 x 1080, 3D view 1660 x 1040, render quality 0.75), made smaller to 1600 px.

| Scene | How it was made | Time |
|---|---|---|
| City (GIF) | Empty scene. "build a downtown city with parks and tree-lined streets. Do not add a sky or any environment." Size chosen: Metropolis (5 x 5 blocks). 510 scene nodes. | brief 4.3 s, total 23.0 s |
| City, tower 1 | "build a tall landmark skyscraper tower in the downtown. Do not add a sky." Chosen: on the avenue, art deco, 130 m. | brief 3.1 s, total 5.7 s |
| City, tower 2 | "build a second landmark tower, a glass tower, 90 m tall. Do not add a sky." Chosen: low-rise corner. | total 5.3 s |
| City, tower 3 | "build a third landmark tower, a needle tower, 110 m tall. Do not add a sky." Chosen: beside the city. | total 5.2 s |
| Island | Template "Cozy island", then "add a rowboat near the lighthouse" and "add a campfire near the bench". | instant path, 1 to 2 ms each |
| Alley arena | Template "Alley arena". No prompt. | - |
| Desert | Template "Desert of the giants", then "add a puddle here" (director, 3.8 s), "add five palm trees around the puddle" (instant path, 0.7 s) and a prompt for more palm trees and rocks (10 library objects, 7.9 s for the brief). | - |

The GIF is a time-lapse: 28 frames of a 30 s recording. During the build the recording has about 1 frame each second, with one gap of 6 s at the start. The cause was not measured: it is the work of adding 510 nodes, or a Browser pane that was hidden at that time. So the build reveal of this city is not shown as a smooth motion.

Found during this work (not changed):

- **A city under an island sky is hidden by fog.** The fog of the `lh:sky:*` skies ends at about 100 to 130 m (`apps/editor/src/vendor/little-habitats/atmosphere/state.ts`). A city is 110 to 300 m wide, so from a camera that shows all of it, the view is only haze. In an empty scene the director adds such a sky by itself (`compose {"environment":"lh:sky:anime_morning"}`), so "build a city" in an empty scene gives a city that the far view does not show. The desert place has its own haze for this reason (`apps/editor/src/lib/resources/environments/desert-world/materials.ts`). The city pictures were made with no sky.
- **A change of sky can leave old fog.** After a change from an `lh:sky:*` sky to the photo sky (`polyhaven:hdri:*`), the city was one flat orange color until the page was loaded again.
- **A second tower is offered the block of the first.** The site choice "Downtown, on the avenue" was block 2,2 for tower 1, tower 2 and tower 3. With the suggested choice, the three towers stood in one another.
- **"create 3 skyscrapers downtown" gave kit buildings.** The director chose `compose` with `model:city-commercial` skyscraper pieces for that prompt. "build a tall landmark skyscraper tower" gave the `architecture` generator.
- **A puddle cannot become a pond, and a pond cannot be added next to it.** Answers: `"node:resource:puddle:1" is in the scene, but no generator built it, so the compose generator cannot change it` and `Not built: Clear lake: the scene already has water`. Both answers are true to the scene; nothing was claimed.
- The tower beside the city stands outside the city ground, on nothing, when the scene has no other ground.

## 10. Constraints for the executor

- Work only in the repository root. Do not change the git branch. Do not commit.
- Other sessions edit `apps/editor` at the same time. Read a file again before each edit. Do not reformat or move code that the task does not need.
- Do not print or log the values in `server/.env`.
- The server on port 4310 runs with `bun --watch`. Test server changes on a different port (for example `PORT=4312`) and stop that process after the test.
- No database, no timers that call the model, no automatic retries.

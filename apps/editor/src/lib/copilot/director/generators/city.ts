// Generator "city": a planned city from parameters (see ../types.ts for the contract).
// The plan (street grid, blocks, buildings, trees, lamps, park) is pure code in
// src/lib/generators/city/; the street, ground and lamp meshes are parametric entries in
// src/lib/resources/generated/roads.ts. This file asks the choices and puts the plan into the
// scene: one folder, ONE undo step, and a staged build reveal
// (ground -> roads -> buildings block by block from the center out -> trees -> lamps and details).
// The folder carries a site record (site.ts): the resolved params and the plan in world meters,
// so other generators build around the city and a replace task rebuilds it in place.
import { makeTransform, vec3, type GroupNode } from "@theras/shared";
import { markBuildReveal } from "@/lib/build-reveal";
import {
  DEFAULT_STREET_TREE,
  CURB_Y,
  GROUND_ENTRY_ID,
  SIZE_GRID,
  SIZE_IDS,
  STREET_ENTRY_ID,
  cityFacts,
  cityTallest,
  fitCity,
  normalizeCityParams,
  sizeOfGrid,
  streetMeshParams,
  streetNode,
  type CityFit,
  type CityKit,
  type CityParams,
  type CityProp,
  type NamedCitySize
} from "@/lib/generators/city";
import { nodeBatchCommand } from "@/lib/outliner";
import { getResource } from "@/lib/resources/catalog";
import { islandGroundAt } from "@/lib/resources/layout";
import { minimapImage } from "../minimap";
import { siteMetadata, siteNodeIds } from "../site";
import type { Brief, ChoiceAnswers, ChoiceOption, ChoiceQuestion, Generator, NextStep, SiteRecord } from "../types";

const KIT_OPTIONS: { id: CityKit; label: string; hint: string; resourceId: string }[] = [
  { id: "commercial", label: "Downtown", hint: "Towers in the center, shops around", resourceId: "model:city-commercial:building-skyscraper-b" },
  { id: "mixed", label: "Mixed", hint: "Downtown with one industrial district at the edge", resourceId: "model:city-commercial:building-c" },
  { id: "industrial", label: "Industrial", hint: "An industrial town: factories and warehouses", resourceId: "model:city-industrial:building-f" }
];

const SIZE_LABELS: Record<NamedCitySize, string> = { neighborhood: "Neighborhood", town: "Town", city: "City", metropolis: "Metropolis" };
const CHARACTER: Record<CityKit, string> = { commercial: "downtown", mixed: "mixed", industrial: "industrial" };
const STYLE: Record<CityKit, string> = { commercial: "modern downtown city", mixed: "modern city with an industrial district", industrial: "industrial town" };
/** Question id of each param that a question covers (for ctx.ask). */
const QUESTION_OF: Record<string, string> = { size: "size", cols: "size", rows: "size", kit: "buildings", streetTrees: "trees" };

const TREE_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "nature:tree:oak-round", label: "Oak", hint: "Full, green street trees" },
  { id: "nature:tree:birch", label: "Birch", hint: "Tall, light green, pale trunk" },
  { id: "nature:tree:cherry-blossom", label: "Cherry blossom", hint: "Pink in spring" },
  { id: "nature:tree:fir", label: "Fir", hint: "Slim and dark green" },
  { id: "nature:tree:palm", label: "Palm", hint: "Coast and tropics" }
];

function isTree(id: string) {
  const entry = getResource(id);
  return !!entry && entry.kind === "plant" && (entry.tags.includes("tree") || /:tree[:-]/.test(entry.id));
}

function briefWords(brief: Brief, prompt = "") {
  return [prompt, brief.understanding, brief.style?.era, brief.style?.mood, ...(brief.style?.vegetation ?? [])].filter(Boolean).join(" ").toLowerCase();
}

/** The size the user's words call for (the brief left size out). */
/** The size a text names, or null. "street trees" and "downtown" are not size words. */
function sizeWord(text: string | undefined): NamedCitySize | null {
  if (!text) return null;
  const t = text
    .toLowerCase()
    .replace(/\bdowntown\b/g, " ")
    .replace(/\bstreets?\s+(trees?|lamps?|lights?|grid|plan|furniture)\b/g, " ")
    .replace(/\btown\s+(hall|square|center|centre)\b/g, " ");
  if (/\b(metropolis|huge|megacity|(big|large|major) city)\b/.test(t)) return "metropolis";
  if (/\b(small|little|tiny) city\b/.test(t)) return "town";
  if (/\bcit(y|ies)\b/.test(t)) return "city";
  if (/\btown\b/.test(t)) return "town";
  if (/\b(village|neighbou?rhood|street|block|hamlet)\b/.test(t)) return "neighborhood";
  return null;
}

/** The suggested size: the user's own words first, then the director's sentence, else a city. */
export function suggestSize(brief: Brief, prompt?: string): NamedCitySize {
  return sizeWord(prompt) ?? sizeWord(brief.understanding) ?? "city";
}

function suggestKit(brief: Brief, prompt?: string, allowMixed = true): CityKit {
  const words = briefWords(brief, prompt);
  if (allowMixed && /\b(mixed|zon(ed|ing))/.test(words)) return "mixed";
  if (/\b(industr\w*|factor(y|ies)|warehouse|port|harbou?r|docks?)\b/.test(words)) return "industrial";
  return "commercial";
}

function suggestTree(brief: Brief, prompt?: string): string {
  const vegetation = (brief.style?.vegetation ?? []).join(" ").toLowerCase();
  const words = briefWords(brief, prompt);
  const pick = (text: string) => {
    if (/cherry|sakura|blossom/.test(text)) return "nature:tree:cherry-blossom";
    if (/palm|tropic/.test(text)) return "nature:tree:palm";
    if (/pine|conifer|\bfir\b|spruce/.test(text)) return "nature:tree:fir";
    if (/maple|autumn|\bfall\b/.test(text)) return "nature:tree:maple-autumn";
    if (/birch/.test(text)) return "nature:tree:birch";
    if (/oak|plane|linden|broadleaf/.test(text)) return "nature:tree:oak-round";
    return null;
  };
  return (
    pick(vegetation) ??
    pick(words) ??
    (/japan|kyoto|tokyo|asian/.test(words) ? "nature:tree:cherry-blossom" : /beach|coast|miami|caribbean|desert/.test(words) ? "nature:tree:palm" : /nordic|alpine|mountain|winter|snow/.test(words) ? "nature:tree:fir" : DEFAULT_STREET_TREE)
  );
}

function validate(params: Record<string, unknown>, brief: Brief): Record<string, unknown> | string {
  const p = normalizeCityParams(params, isTree);
  if (typeof p === "string") return p;
  const title = brief.tasks.find((t) => t.params === params)?.title ?? brief.tasks.find((t) => t.generator === "city")?.title;
  return { ...p, ...(title ? { title } : {}) };
}

function uniqueFolderName(names: Set<string>, base: string) {
  if (!names.has(base)) return base;
  let k = 2;
  while (names.has(`${base} ${k}`)) k++;
  return `${base} ${k}`;
}

const sizeHint = (fit: Pick<CityFit, "plan" | "scale">) => {
  const g = fit.plan.groundRect;
  return `${fit.plan.cols} x ${fit.plan.rows} blocks, about ${Math.round((g.x1 - g.x0) * fit.scale)} x ${Math.round((g.z1 - g.z0) * fit.scale)} m`;
};

/** Short tree word for the facts line: "oak", "cherry". */
function treeWord(id: string) {
  if (id === "none") return "no";
  const slug = id.split(":").pop() ?? id;
  return slug.replace(/-round|-tiered/g, "").replace(/-/g, " ");
}

/**
 * Which questions to ask: a param the params leave out, or one that ctx.ask names (by param
 * name or question id). A replace carries the stored params, so it normally asks nothing.
 */
function openQuestions(given: string[], ask: string[] | undefined) {
  const asked = (key: string) => (ask ?? []).some((a) => a === key || a === QUESTION_OF[key]);
  const open = (key: string) => !given.includes(key) || asked(key);
  return { size: open("size") || asked("cols") || asked("rows"), kit: open("kit"), trees: open("streetTrees") };
}

/** The resolved params for the site record: run(validate(these)) builds the same city here. */
function resolvedParams(p: CityParams, at: { x: number; z: number }): Record<string, unknown> {
  const grid = p.size === "custom" ? { cols: p.cols, rows: p.rows } : { size: p.size };
  return { ...grid, kit: p.kit, density: p.density, streetTrees: p.streetTrees, park: p.park, lamps: p.lamps, seed: p.seed, at: { x: Math.round(at.x * 100) / 100, z: Math.round(at.z * 100) / 100 } };
}

export const cityGenerator: Generator = {
  id: "city",
  // The director may set these only when the user's own words decide them; else the popup asks.
  taste: {
    kit: /industr|factor|warehouse|\bport\b|harbou?r|\bdocks?\b|mixed|zon(e|ed|ing)|downtown|commercial|office|shops?\b|business|financial/i,
    streetTrees: /\btrees?\b|oak|birch|cherry|sakura|blossom|palm|pine|conifer|\bfir\b|spruce|maple|willow|leafy|green/i,
    density: /dens|crowd|packed|sparse|open|empty|\d/i
  },
  describe:
    'city: a planned city: street grid, main avenue, road meshes, a downtown core of towers with heights falling to the edge, street trees, parks. Use for city, town, downtown, district, street. Params: size "neighborhood"|"town"|"city"|"metropolis" (2x2, 3x3, 4x4, 5x5 blocks) or cols, rows 1..5. Leave size out unless the user states it: the editor asks with a map. kit "commercial"|"mixed"|"industrial" (industry only when asked); density 0..1 (0.7); streetTrees: tree library id or "none"; park, lamps: true|false; seed: integer.',

  validate,

  choices(params, ctx) {
    const p = normalizeCityParams(params, isTree);
    if (typeof p === "string") return [];
    const given = Array.isArray(params.given) ? (params.given as string[]) : p.given;
    const open = openQuestions(given, ctx.ask);
    const questions: ChoiceQuestion[] = [];
    const sizeSuggested = suggestSize(ctx.brief, ctx.prompt);
    const [sc, sr] = open.size ? SIZE_GRID[sizeSuggested] : [p.cols, p.rows];
    const mixedOk = sc >= 3 && sr >= 3;
    const kitSuggested = open.kit ? suggestKit(ctx.brief, ctx.prompt, mixedOk) : p.kit;
    if (open.size) {
      // Each option shows the real plan of that size (same seed and kit as the build).
      const options = SIZE_IDS.map((id): ChoiceOption => {
        const [cols, rows] = SIZE_GRID[id];
        const fit = fitCity({ ...p, size: id, cols, rows, kit: kitSuggested }, ctx.anchor)!;
        return { id, label: SIZE_LABELS[id], hint: sizeHint(fit), image: minimapImage({ cities: [cityFacts(fit)] }) };
      });
      questions.push({ id: "size", title: "How big?", kind: "map", options, suggested: sizeSuggested });
    }
    if (open.kit) {
      const kits = KIT_OPTIONS.filter((o) => o.id !== "mixed" || mixedOk);
      questions.push({
        id: "buildings",
        title: "Which character?",
        kind: "taste",
        options: kits.map((o): ChoiceOption => ({ id: o.id, label: o.label, hint: o.hint, ...(getResource(o.resourceId) ? { resourceId: o.resourceId } : {}) })),
        suggested: kits.some((o) => o.id === kitSuggested) ? kitSuggested : "commercial"
      });
    }
    if (open.trees) {
      const options: ChoiceOption[] = TREE_OPTIONS.filter((o) => getResource(o.id)).map((o) => ({ id: o.id, label: o.label, hint: o.hint, resourceId: o.id }));
      options.push({ id: "none", label: "No trees", hint: "Bare sidewalks" });
      const suggested = suggestTree(ctx.brief, ctx.prompt);
      questions.push({ id: "trees", title: "Street trees?", kind: "taste", options, suggested: options.some((o) => o.id === suggested) ? suggested : options[0].id });
    }
    return questions;
  },

  async run(params, answers: ChoiceAnswers, ctx) {
    const normalized = normalizeCityParams(params, isTree);
    if (typeof normalized === "string") return { nodeIds: [], summary: `No city was built: ${normalized}.`, skipped: [normalized] };
    const p: CityParams = { ...normalized };
    const sizeAnswer = answers.size?.optionIds?.[0];
    if (sizeAnswer && (SIZE_IDS as string[]).includes(sizeAnswer)) {
      p.size = sizeAnswer as NamedCitySize;
      [p.cols, p.rows] = SIZE_GRID[p.size];
      // The default park follows the chosen size.
      if (params.park === undefined) p.park = p.cols * p.rows >= 6;
    }
    const kitAnswer = answers.buildings?.optionIds?.[0];
    if (kitAnswer && KIT_OPTIONS.some((o) => o.id === kitAnswer)) p.kit = kitAnswer as CityKit;
    const treeAnswer = answers.trees?.optionIds?.[0];
    if (treeAnswer === "none" || (treeAnswer && isTree(treeAnswer))) p.streetTrees = treeAnswer;

    ctx.step("Planning", `${p.cols} x ${p.rows} blocks`);
    const anchor = p.at ?? ctx.anchor;
    const fit = fitCity(p, anchor, islandGroundAt());
    if (!fit) {
      const why = "There is no flat land near the build point for even one city block.";
      return { nodeIds: [], summary: `No city was built: ${why}`, skipped: [why] };
    }
    const { plan, scale: s, center, y } = fit;
    if (ctx.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const editor = ctx.editor;
    const scene = editor.scene;
    // A replace removes the old city in the same undo step and keeps its folder name.
    const replaced = ctx.replace?.generator === "city" ? ctx.replace : undefined;
    const remove = replaced ? siteNodeIds(editor, replaced.id) : [];
    const oldName = replaced ? scene.nodes.get(replaced.id)?.name : undefined;
    const taken = new Set<string>();
    const uniqueId = (base: string) => {
      let i = 1;
      while (scene.nodes.has(`${base}:${i}`) || taken.has(`${base}:${i}`)) i++;
      taken.add(`${base}:${i}`);
      return `${base}:${i}`;
    };
    const title = oldName ?? ((typeof params.title === "string" && params.title.trim()) || "City");
    const topNames = new Set([...scene.nodes.values()].filter((n) => !n.parentId && n.id !== replaced?.id).map((n) => n.name));
    const folderId = uniqueId("node:group");
    const folderName = oldName ?? uniqueFolderName(topNames, title);
    const folder: GroupNode = { id: folderId, kind: "group", name: folderName, data: {}, transform: makeTransform(vec3(center.x, y, center.z)) };
    // Nodes in plan meters -> local to the folder (the folder stands at the plan origin).
    type Staged = { node: GroupNode; stage: number };
    const staged: Staged[] = [];
    let seedK = 0;
    const add = (stage: number, id: string, x: number, yLocal: number, z: number, rotationY: number, scale: number, opts: { params?: Record<string, unknown>; name?: string } = {}) => {
      const entry = getResource(id);
      if (!entry?.create) return false;
      const seed = (p.seed * 7919 + seedK++ * 104729) % 1_000_000;
      const transform = makeTransform(vec3(x * s, yLocal * s, z * s));
      transform.rotation.y = rotationY;
      const k = scale * s;
      if (Math.abs(k - 1) > 1e-6) transform.scale = vec3(k, k, k);
      staged.push({
        stage,
        node: {
          id: uniqueId(`node:resource:${id.split(":").pop()}`),
          kind: "group",
          name: opts.name ?? entry.nameFor?.(seed) ?? entry.name,
          parentId: folderId,
          transform,
          data: {},
          metadata: opts.params ? { resource: id, seed, params: JSON.stringify(opts.params) } : { resource: id, seed }
        }
      });
      return true;
    };
    const skipped = [...fit.notes, ...plan.notes];

    // 0 ground
    const g = plan.groundRect;
    const r = plan.streetsRect;
    add(0, GROUND_ENTRY_ID, 0, 0, 0, 0, 1, {
      name: "City ground",
      params: {
        rect: [g.x0, g.z0, g.x1, g.z1],
        streets: [r.x0, r.z0, r.x1, r.z1],
        lots: plan.blocks.map((b) => {
          const lot = [b.lot.x0, b.lot.z0, b.lot.x1, b.lot.z1, b.kind === "park" ? 1 : b.kind === "plaza" ? 3 : b.zone === "industrial" ? 2 : 0];
          const green = plan.greens.find((q) => q.rect === b.lot);
          return green && b.kind === "park" ? [...lot, Math.round(green.plaza.r * 100) / 100] : lot;
        }),
        plaza: null,
        path: 3,
        thickness: Math.round(fit.thickness * 100) / 100
      }
    });
    // 1 roads
    for (const st of plan.streets) {
      const at = streetNode(st);
      add(1, STREET_ENTRY_ID, at.x, 0, at.z, at.rotationY, 1, { name: st.name, params: streetMeshParams(st) });
    }
    // 2 buildings (the plan lists them block by block from the center out)
    let buildings = 0;
    for (const b of plan.buildings) if (add(2, b.id, b.x, CURB_Y, b.z, b.rotationY, b.scale)) buildings++;
    // 3 trees (street trees, then park trees)
    const placeProps = (stage: number, list: CityProp[]) => {
      let n = 0;
      for (const prop of list) if (add(stage, prop.id, prop.x, CURB_Y, prop.z, prop.rotationY, prop.scale, prop.params ? { params: prop.params } : {})) n++;
      return n;
    };
    const parkTrees = plan.park.filter((q) => q.kind === "tree");
    const parkFurniture = plan.park.filter((q) => q.kind !== "tree");
    const trees = placeProps(3, plan.trees);
    const parkTreeCount = placeProps(3, parkTrees);
    // 4 lamps, park furniture, street details
    const lamps = placeProps(4, plan.lamps);
    const furniture = placeProps(4, parkFurniture);
    const details = placeProps(4, plan.details);
    const missing = plan.trees.length + parkTrees.length - trees - parkTreeCount;
    if (missing > 0) skipped.push(`${missing} trees: the tree "${p.streetTrees}" is not in the library.`);

    // Reveal schedule: each stage starts after the one before it; stagger is capped per stage.
    const STAGES = [
      { label: "Ground", stagger: 0, max: 0, hold: 500 },
      { label: "Roads", stagger: 220, max: 2200, hold: 400 },
      { label: "Buildings", stagger: 70, max: 4500, hold: 500 },
      { label: "Trees", stagger: 25, max: 2500, hold: 300 },
      { label: "Lamps and details", stagger: 25, max: 2000, hold: 600 }
    ];
    const parks = plan.blocks.filter((b) => b.kind === "park").length;
    const plazas = plan.blocks.filter((b) => b.kind === "plaza").length;
    const greenText = [parks ? (parks === 1 ? "a park" : `${parks} parks`) : "", plazas ? (plazas === 1 ? "a plaza" : `${plazas} plazas`) : ""].filter(Boolean).join(" and ");
    const detailOf = [
      `${Math.round((g.x1 - g.x0) * s)} x ${Math.round((g.z1 - g.z0) * s)} m`,
      `${plan.streets.length} streets, ${plan.streets.filter((x) => x.avenue).length} avenue`,
      `${buildings} buildings`,
      `${trees} street trees${parkTreeCount ? `, ${parkTreeCount} in ${parks + plazas > 1 ? "the parks" : "the park"}` : ""}`,
      `${lamps} lamps${furniture ? `, ${greenText} with fountains and benches` : ""}${details ? `, ${details} details` : ""}`
    ];
    const schedule: { start: number; duration: number }[] = [];
    let t = 0;
    for (const [k, stage] of STAGES.entries()) {
      const count = staged.filter((x) => x.stage === k).length;
      const stagger = count > 1 ? Math.min(stage.stagger, stage.max / (count - 1)) : 0;
      const duration = count > 0 ? stagger * Math.max(0, count - 1) + stage.hold : 0;
      schedule.push({ start: t, duration });
      t += duration;
    }
    const indexInStage = new Map<number, number>();
    const reveal: { id: string; delay: number }[] = staged.map(({ node, stage }) => {
      const k = indexInStage.get(stage) ?? 0;
      indexInStage.set(stage, k + 1);
      const count = staged.filter((x) => x.stage === stage).length;
      const stagger = count > 1 ? Math.min(STAGES[stage].stagger, STAGES[stage].max / (count - 1)) : 0;
      return { id: node.id, delay: schedule[stage].start + k * stagger };
    });

    // The site record: resolved params and the plan in world meters.
    const tallest = cityTallest(fit);
    const sizeNow = sizeOfGrid(plan.cols, plan.rows);
    const sizeWord = sizeNow === "custom" ? "city" : sizeNow;
    const greensCount = parks + plazas;
    // Honest character: a mixed kit on a small grid has no industrial district.
    const kitBuilt: CityKit = p.kit === "mixed" && !plan.blocks.some((b) => b.zone === "industrial") ? "commercial" : p.kit;
    const facts = cityFacts(fit);
    const record: SiteRecord = {
      v: 1,
      generator: "city",
      title: folderName,
      params: resolvedParams(p, center),
      facts: {
        center: { x: center.x, z: center.z },
        rect: facts.groundRect,
        height: tallest,
        style: STYLE[kitBuilt],
        summary: `${plan.cols} x ${plan.rows} blocks, ${CHARACTER[kitBuilt]}, ${p.streetTrees === "none" ? "no street trees" : `${treeWord(p.streetTrees)} street trees`}, ${greensCount === 1 ? "1 park" : `${greensCount} parks`}, ${buildings} buildings, tallest ${Math.round(tallest)} m`,
        adjustable: `size ${SIZE_IDS.join("|")} (now ${p.size}); kit commercial|mixed|industrial (now ${p.kit}); density 0-1 (${p.density}); streetTrees <tree id>|none (now ${p.streetTrees}); park true|false (now ${p.park})`,
        city: facts
      }
    };
    folder.metadata = siteMetadata(record);

    // One undo step for the whole city (and the removal of the old one on a replace).
    editor.execute(nodeBatchCommand(scene, `${replaced ? "rebuild" : "build"} ${folder.name}`, { add: [folder, ...staged.map((x) => x.node)], remove }));
    for (const r of reveal) markBuildReveal([r.id], r.delay);

    // The chat trace follows the reveal, stage by stage.
    for (const [k, stage] of STAGES.entries()) {
      if (schedule[k].duration === 0) continue;
      ctx.step(stage.label, detailOf[k]);
      await ctx.pause(schedule[k].duration);
    }

    const treeText = trees > 0 ? `, ${trees} street trees` : "";
    const parkText = greenText ? `, ${greenText}` : "";
    const summary = `${replaced ? "Rebuilt the city as" : "Built"} a ${plan.cols} x ${plan.rows} block ${sizeWord} (${CHARACTER[kitBuilt]}) with a main avenue, ${plan.streets.length} streets, ${buildings} buildings facing their streets (tallest ${Math.round(tallest)} m)${treeText}${parkText} and ${lamps} street lamps.`;

    // Follow-ups this scene can do.
    const next: NextStep[] = [];
    if (sizeNow !== "metropolis" && (plan.cols < 5 || plan.rows < 5)) next.push({ label: "Make it bigger", prompt: "Make the city bigger" });
    if (!(ctx.sites ?? []).some((x) => x.generator === "river")) next.push({ label: "Add a river", prompt: "Add a river to the city" });
    next.push({ label: "Add a landmark tower", prompt: "Add a tall landmark tower downtown" });
    if (p.kit === "commercial" && plan.cols >= 3 && plan.rows >= 3) next.push({ label: "Add an industrial district", prompt: "Give the city an industrial district at the edge" });
    else if (p.kit === "mixed" && plan.blocks.some((b) => b.zone === "industrial")) next.push({ label: "No factories", prompt: "Remove the industrial district from the city" });
    if (next.length < 2) next.push({ label: "Change the street trees", prompt: "Use different street trees in the city" });

    return {
      nodeIds: [folderId, ...staged.map((x) => x.node.id)],
      summary,
      ...(skipped.length ? { skipped } : {}),
      next: next.slice(0, 4)
    };
  }
};

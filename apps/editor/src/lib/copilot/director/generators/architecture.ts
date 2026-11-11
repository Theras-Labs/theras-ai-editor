// Generator "architecture": ONE landmark building from parameters (Japanese castle keep, pagoda,
// shrine with torii gate, medieval keep, modern tower), built by code in src/lib/generators/architecture.
// The director passes the style and the colors it read from the words or the image; code owns the
// proportions, the detail, the height of a tower from the skyline, and the place in a city.
// One folder with a site record (site.ts), ONE undo step: the new nodes, the old nodes of a replace,
// and the city buildings that make room all change in the same command. No model call, no timers.
import { makeTransform, vec3, type GroupNode } from "@theras/shared";
import type { EditorCore } from "@theras/editor-core";
import { markBuildReveal } from "@/lib/build-reveal";
import {
  LOOK_COLORS,
  STYLE_SPECS,
  TOWER_HEIGHT,
  TOWER_LOOKS,
  buildArchitecture,
  resolveArchParams,
  siteBlock,
  stageTimeline,
  toStoredParams,
  towerFootprintFor,
  type ArchColors,
  type ArchParams,
  type ArchStyle,
  type ResolvedArchParams,
  type TowerLook
} from "@/lib/generators/architecture";
import {
  TALL_WORDS,
  avoidSites,
  blockFootprint,
  blockOf,
  blockPlace,
  cityPlaces,
  defaultTowerHeight,
  heightOptions,
  lotY,
  placeBeside,
  skylineHeight,
  worldRect,
  type LocalExtent,
  type Place
} from "@/lib/generators/architecture/siting";
import { japaneseRoofSwatch, medievalRoofSwatch, towerHeightImage, towerLookImage } from "@/lib/generators/architecture/thumbs";
import { nodeBatchCommand } from "@/lib/outliner";
import { sceneGroundAt } from "@/lib/resources/layout";
import { minimapImage } from "../minimap";
import { cityNear, siteMetadata, siteNodeIds } from "../site";
import type {
  Brief,
  BuildingSiteFacts,
  BuiltSite,
  ChoiceAnswers,
  ChoiceOption,
  ChoiceQuestion,
  CitySiteFacts,
  DirectorContext,
  Generator,
  NextStep,
  SiteRecord,
  SiteRect
} from "../types";

const BUILDING_ID = "gen:architecture";
const YARD_ID = "gen:architecture-yard";
/** Extra clear ground around the footprint when city buildings make room (meters). */
const ROOM_MARGIN = 2;

/** Roof colors offered when the brief gives none (per style; the first is the suggestion). The tower has no roof question. */
const ROOF_SWATCHES: Record<Exclude<ArchStyle, "modern-tower">, { id: string; label: string; hex: string }[]> = {
  "japanese-castle": [
    { id: "copper-green", label: "Copper green (Osaka)", hex: "#3f7a72" },
    { id: "tile-gray", label: "Gray tiles (Himeji)", hex: "#5b6168" },
    { id: "black", label: "Black (Matsumoto)", hex: "#2e3033" }
  ],
  pagoda: [
    { id: "tile-gray", label: "Gray tiles", hex: "#3d4247" },
    { id: "copper-green", label: "Copper green", hex: "#3f7a72" },
    { id: "cedar", label: "Cedar bark", hex: "#6b4a36" }
  ],
  "torii-and-shrine": [
    { id: "tile-gray", label: "Gray tiles", hex: "#4a4e52" },
    { id: "copper-green", label: "Copper green", hex: "#3f7a72" },
    { id: "cedar", label: "Cedar bark", hex: "#6b4a36" }
  ],
  "medieval-keep": [
    { id: "slate", label: "Blue slate", hex: "#4f5866" },
    { id: "terracotta", label: "Terracotta", hex: "#b4583a" },
    { id: "dark-wood", label: "Dark shingles", hex: "#4a3b2f" }
  ]
};

const LOOK_TEXT: Record<TowerLook, { label: string; hint: string; style: string }> = {
  glass: { label: "Glass tower", hint: "sleek curtain wall, clean top", style: "modern glass tower" },
  setback: { label: "Art deco setbacks", hint: "stepped tiers and a spire", style: "art deco setback tower" },
  needle: { label: "Needle", hint: "a tapering tower with a mast", style: "modern needle tower" }
};

const STYLE_NAMES: Record<ArchStyle, string> = {
  "japanese-castle": "Japanese castle keep",
  pagoda: "pagoda",
  "torii-and-shrine": "Shinto shrine with a torii gate",
  "medieval-keep": "medieval stone keep",
  "modern-tower": "modern tower"
};

const STYLE_WORDS: Record<ArchStyle, string> = {
  "japanese-castle": "japanese castle",
  pagoda: "japanese pagoda",
  "torii-and-shrine": "shinto shrine",
  "medieval-keep": "medieval stone keep",
  "modern-tower": "modern tower"
};

function taskTitle(params: Record<string, unknown>, brief: Brief): string | undefined {
  if (typeof params.title === "string" && params.title.trim()) return params.title.trim();
  return brief.tasks.find((t) => t.params === params)?.title;
}

/** Which params the director (or the stored site) gave; the popup asks only for the rest. */
type Given = { colors: boolean; tiers: boolean; look: boolean; height: boolean; place: boolean; footprint: boolean; facing: boolean };

function hasNumber(params: Record<string, unknown>, ...keys: string[]) {
  return keys.some((k) => {
    const v = params[k];
    return (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
  });
}

function givenOf(params: Record<string, unknown>, p: ResolvedArchParams): Given {
  const g = params.given;
  if (g && typeof g === "object" && "colors" in g && "tiers" in g) {
    const r = g as Partial<Given>;
    return {
      colors: Boolean(r.colors),
      tiers: Boolean(r.tiers),
      look: Boolean(r.look),
      height: Boolean(r.height),
      place: Boolean(r.place),
      footprint: Boolean(r.footprint),
      facing: Boolean(r.facing)
    };
  }
  const spec = STYLE_SPECS[p.style].tiers;
  return {
    colors: p.colorsGiven,
    tiers: hasNumber(params, "tiers", "floors", "stories") || spec.min === spec.max,
    look: p.lookGiven,
    height: p.heightGiven,
    place: Boolean(p.at || p.site),
    footprint: p.footprintGiven,
    facing: p.facingGiven
  };
}

/** With a replace: the params the user wants to choose again (ctx.ask) are not given. */
function applyAsk(given: Given, ask: string[] | undefined): { given: Given; placeAsked: boolean } {
  const a = new Set((ask ?? []).map((s) => s.trim().toLowerCase()));
  const has = (...keys: string[]) => keys.some((k) => a.has(k));
  const placeAsked = has("site", "at", "y", "place", "where");
  return {
    given: {
      ...given,
      look: given.look && !has("look"),
      height: given.height && !has("height"),
      place: given.place && !placeAsked,
      colors: given.colors && !has("colors", "roof", "color"),
      tiers: given.tiers && !has("tiers", "floors", "stories")
    },
    placeAsked
  };
}

function hintsOf(params: Record<string, unknown>, brief?: Brief) {
  return {
    era: brief?.style?.era,
    colors: brief?.style?.colors,
    text: [typeof params.title === "string" ? params.title : "", brief?.understanding ?? ""].join(" ")
  };
}

function resolve(params: Record<string, unknown>, brief?: Brief) {
  return resolveArchParams(params, hintsOf(params, brief));
}

/** Colors of a look: the look's palette with the colors that the brief gave on top (not the stored params colors). */
function lookColors(look: TowerLook, params: Record<string, unknown>, brief: Brief | undefined): ArchColors {
  return resolveArchParams({ ...params, style: "modern-tower", look, colors: undefined }, hintsOf(params, brief)).colors;
}

const sameColors = (a: ArchColors, b: ArchColors) => (Object.keys(a) as (keyof ArchColors)[]).every((k) => a[k] === b[k]);

/** Stored colors that are only a look palette (not the user's choice): a new look takes its own palette. */
function colorsAreLookPalette(c: ArchColors) {
  return TOWER_LOOKS.some((l) => sameColors(LOOK_COLORS[l], c));
}

/** True when params.colors holds colors the user chose (not only a stored look palette). */
function ownColors(params: Record<string, unknown>): boolean {
  const c = params.colors;
  if (!c || typeof c !== "object" || Object.keys(c).length === 0) return false;
  const p = resolveArchParams({ style: "modern-tower", colors: c });
  return p.colorsGiven && !colorsAreLookPalette(p.colors);
}

/** Lowest ground under the footprint (so no corner floats), or 0 without terrain or over water. */
function groundY(x: number, z: number, r: number): number {
  const ground = sceneGroundAt();
  if (!ground) return 0;
  const ys: number[] = [];
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
    const y = ground(x + dx * r, z + dz * r);
    if (y !== null) ys.push(y);
  }
  return ys.length ? Math.min(...ys) : 0;
}

/** World direction of the front (the door, the steps): facing 0 = +z, 90 = +x. */
function frontWords(facing: number): string {
  const dirs = ["+z", "+x", "-z", "-x"];
  return facing % 90 === 0 ? dirs[(facing / 90) % 4] : `${Math.round(facing)} degrees from +z toward +x`;
}

/** The ground extent of a tower in its own frame (podium plus the front canopy). */
function towerExtent(footprint: number): LocalExtent {
  return { hx: footprint / 2, back: footprint * 0.45, front: footprint * 0.45 + Math.min(3, footprint * 0.1) };
}

/** Everything the choices and the run share: the other sites, the near city, the skyline, the words. */
function sceneOf(ctx: Pick<DirectorContext, "sites" | "replace" | "anchor" | "prompt" | "brief">) {
  const others = (ctx.sites ?? []).filter((s) => s.id !== ctx.replace?.id);
  const city = cityNear(others, ctx.anchor);
  const skyline = skylineHeight(others, city?.facts.city);
  const tall = TALL_WORDS.test(`${ctx.prompt ?? ""} ${ctx.brief?.understanding ?? ""}`);
  return { others, city, skyline, tall };
}

// ── Scene reading (world positions of city buildings) ────────

type SceneNode = { id: string; parentId?: string; transform?: { position: { x: number; y: number; z: number }; rotation: { y: number }; scale: { x: number; z: number } }; metadata?: Record<string, unknown> };

function worldXZ(editor: EditorCore, node: SceneNode): { x: number; z: number } {
  const nodes = editor.scene.nodes as unknown as Map<string, SceneNode>;
  let x = node.transform?.position.x ?? 0;
  let z = node.transform?.position.z ?? 0;
  let parent = node.parentId ? nodes.get(node.parentId) : undefined;
  for (let guard = 0; parent && guard < 32; guard++) {
    const t = parent.transform;
    if (t) {
      const sx = x * (t.scale?.x ?? 1);
      const sz = z * (t.scale?.z ?? 1);
      const a = t.rotation?.y ?? 0;
      x = t.position.x + sx * Math.cos(a) + sz * Math.sin(a);
      z = t.position.z - sx * Math.sin(a) + sz * Math.cos(a);
    }
    parent = parent.parentId ? nodes.get(parent.parentId) : undefined;
  }
  return { x, z };
}

/** City buildings ("model:city-" nodes of the city folder) whose center is inside the area. */
function cityBuildingsIn(editor: EditorCore | undefined, cityId: string, area: SiteRect): string[] {
  if (!editor?.scene?.nodes) return [];
  const nodes = editor.scene.nodes as unknown as Map<string, SceneNode>;
  const out: string[] = [];
  for (const id of siteNodeIds(editor, cityId)) {
    const node = nodes.get(id);
    const res = node?.metadata?.resource;
    if (!node || typeof res !== "string" || !res.startsWith("model:city-")) continue;
    const p = worldXZ(editor, node);
    if (p.x >= area.x0 && p.x <= area.x1 && p.z >= area.z0 && p.z <= area.z1) out.push(id);
  }
  return out;
}

// ── Planning: the resolved params and the place ──────────────

type Plan = {
  p: ArchParams;
  place: { at: { x: number; z: number }; facing: number; y?: number; site: string; block?: [number, number]; cityId?: string; label?: string };
  movedFrom?: string;
  ext: LocalExtent;
  built: ReturnType<typeof buildArchitecture>;
  yardRadius: number;
  city?: BuiltSite & { facts: { city: CitySiteFacts } };
  skyline: number;
};

function yardRadiusOf(p: ArchParams, half: [number, number]) {
  return p.surround === "none" ? 0 : Math.hypot(half[0], half[1]) * (p.surround === "garden" ? 1.6 : 1.45);
}

function extentOf(p: ArchParams, built: ReturnType<typeof buildArchitecture>): LocalExtent {
  if (p.style === "modern-tower") return towerExtent(p.footprint);
  const r = yardRadiusOf(p, built.half);
  return r > 0 ? { hx: r, back: r, front: r } : { hx: built.half[0], back: built.half[1], front: built.half[1] };
}

/** Candidate places in the near city for these params (the site question and its answer). */
function placesFor(p: ArchParams, city: CitySiteFacts, anchor: { x: number; z: number }): Place[] {
  const tower = p.style === "modern-tower";
  const ext = (maxFoot: number) => {
    if (tower) return towerExtent(Math.min(p.footprint, maxFoot));
    const f = Math.min(p.footprint, maxFoot);
    return { hx: f / 2, back: f / 2, front: f / 2 };
  };
  const radius = tower ? Math.hypot(p.footprint / 2, p.footprint * 0.5) : p.footprint * (p.surround === "none" ? 0.75 : 1.5);
  return cityPlaces(city, ext, radius, anchor);
}

/** Resolves the final params (answers, scene defaults) and the place; builds the geometry once. */
function plan(params: Record<string, unknown>, answers: ChoiceAnswers, ctx: DirectorContext): Plan {
  const resolved = resolve(params, ctx.brief);
  const { given, placeAsked } = applyAsk(givenOf(params, resolved), ctx.ask);
  const p: ArchParams = toStoredParams(resolved);
  const scene = sceneOf(ctx);
  const tower = p.style === "modern-tower";
  if (placeAsked) {
    delete p.at;
    delete p.y;
    delete p.site;
  }

  // Look, height, colors, tiers from the answers.
  if (tower) {
    const lookAnswer = answers.look?.optionIds?.[0] as TowerLook | undefined;
    const look = !given.look && lookAnswer && (TOWER_LOOKS as readonly string[]).includes(lookAnswer) ? lookAnswer : p.look;
    if (look !== p.look || !given.look) {
      // A new look takes its own palette unless the user chose the colors.
      if (!ownColors(params)) p.colors = lookColors(look, params, ctx.brief);
      p.look = look;
    }
    const hAnswer = Number(answers.height?.optionIds?.[0]);
    if (!given.height) p.height = Number.isFinite(hAnswer) && hAnswer > 0 ? hAnswer : defaultTowerHeight(scene.skyline, scene.tall);
    p.height = Math.max(TOWER_HEIGHT.min, Math.min(TOWER_HEIGHT.max, p.height));
    if (!given.footprint) p.footprint = towerFootprintFor(p.height);
  } else {
    const swatch = ROOF_SWATCHES[p.style as Exclude<ArchStyle, "modern-tower">].find((s) => s.id === answers.roof?.optionIds?.[0]);
    if (swatch && !given.colors) p.colors.roof = swatch.hex;
    const tiersAnswer = Number(answers.tiers?.optionIds?.[0]);
    if (!given.tiers && Number.isFinite(tiersAnswer) && tiersAnswer > 0) {
      const spec = STYLE_SPECS[p.style].tiers;
      p.tiers = Math.max(spec.min, Math.min(spec.max, Math.round(tiersAnswer)));
    }
  }

  // The place.
  const cityAll = scene.city;
  const city = cityAll?.facts.city;
  let site = p.site;
  if (!site && !p.at) site = answers.site?.optionIds?.[0];
  if (!site && !p.at && city) site = (p.style === "modern-tower" ? placesFor(p, city, ctx.anchor)[0]?.id : "beside") ?? "anchor";
  const blockIJ = siteBlock(site);
  const block = blockIJ && city ? blockOf(city, blockIJ[0], blockIJ[1]) : undefined;
  if (block && !(block.kind === "lot" && !/park/i.test(block.zone))) {
    // Never a park or a plaza: beside the city instead.
    site = "beside";
  }
  const onBlock = block && site?.startsWith("block:") ? block : undefined;
  // A block that is not in the city (any more): the anchor instead.
  if (blockIJ && !onBlock && site !== "beside") site = "anchor";
  if (onBlock) p.footprint = Math.max(STYLE_SPECS[p.style].footprint.min, Math.floor(Math.min(p.footprint, blockFootprint(onBlock)) * 10) / 10);

  let built = buildArchitecture(p);
  if (onBlock && !tower) {
    // A yard that does not fit the block is left out; then the footprint shrinks to fit.
    const side = blockFootprint(onBlock) / 0.7;
    if (yardRadiusOf(p, built.half) * 2 > side * 0.9) {
      p.surround = "none";
      built = buildArchitecture(p);
    }
    const r = Math.max(built.half[0], built.half[1]);
    if (r * 2 > side * 0.75) {
      p.footprint = Math.max(STYLE_SPECS[p.style].footprint.min, Math.floor(((p.footprint * side * 0.7) / (r * 2)) * 10) / 10);
      built = buildArchitecture(p);
    }
  }
  const ext = extentOf(p, built);
  const yardRadius = yardRadiusOf(p, built.half);

  let at = p.at;
  let facing = p.facing;
  let y = p.y;
  let movedFrom: string | undefined;
  let label: string | undefined;
  if (onBlock && city) {
    const placed = blockPlace(city, onBlock, ext, "", given.facing || p.at ? p.facing : undefined);
    if (!at) {
      at = placed.at;
      if (!given.facing) facing = placed.facing;
    }
    y ??= lotY(city);
    label = placesFor(p, city, ctx.anchor).find((c) => c.id === site)?.label;
  } else if (site === "beside" && city) {
    if (!at) {
      const placed = placeBeside(city, Math.max(ext.hx, ext.front, ext.back), ctx.anchor);
      const moved = avoidSites(placed.at, ext, given.facing ? p.facing : placed.facing, scene.others);
      at = moved.at;
      if (!given.facing) facing = placed.facing;
    }
    label = "Beside the city";
  } else if (!at) {
    // No city: at the anchor, but never on top of another site.
    const moved = avoidSites(ctx.anchor, ext, facing, scene.others);
    at = moved.at;
    movedFrom = moved.movedFrom;
    site ??= "anchor";
  }
  if (!site) site = "anchor";
  y ??= groundY(at.x, at.z, built.radius);

  p.at = { x: round2(at.x), z: round2(at.z) };
  p.facing = ((facing % 360) + 360) % 360;
  p.site = site;
  if (params.y !== undefined && !placeAsked) p.y = y;
  return {
    p,
    place: {
      at: p.at,
      facing: p.facing,
      y,
      site,
      ...(onBlock ? { block: [onBlock.i, onBlock.j] as [number, number], cityId: cityAll!.id } : {}),
      ...(label ? { label } : {})
    },
    movedFrom,
    ext,
    built,
    yardRadius,
    ...(cityAll ? { city: cityAll } : {}),
    skyline: scene.skyline
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const f1 = (v: number) => String(Math.round(v * 10) / 10);

// ── Site record ──────────────────────────────────────────────

function adjustableText(p: ArchParams): string {
  const spec = STYLE_SPECS[p.style];
  const colors = p.style === "modern-tower" ? "colors {walls, roof, accent, timber=glass}" : "colors {walls, roof, base, accent, timber}";
  if (p.style === "modern-tower")
    return `height ${TOWER_HEIGHT.min}-${TOWER_HEIGHT.max} (now ${Math.round(p.height)}); look ${TOWER_LOOKS.join("|")} (${p.look}); tiers ${spec.tiers.min}-${spec.tiers.max} (${p.tiers}); footprint ${spec.footprint.min}-${spec.footprint.max} (${Math.round(p.footprint)}); ${colors}; site, at (the place)`;
  const tiers = spec.tiers.min === spec.tiers.max ? "" : `tiers ${spec.tiers.allowed ? spec.tiers.allowed.join("|") : `${spec.tiers.min}-${spec.tiers.max}`} (${p.tiers}); `;
  const plan = p.style === "medieval-keep" ? `plan square|round (${p.plan}); ` : "";
  return `height m (0.75-1.35 x its own); ${tiers}footprint ${spec.footprint.min}-${spec.footprint.max} (${f1(p.footprint)}); ${plan}surround none|stone-yard|garden (${p.surround}); ${colors}; site, at (the place)`;
}

function styleText(p: ArchParams) {
  return p.style === "modern-tower" ? LOOK_TEXT[p.look].style : STYLE_WORDS[p.style];
}

function nextSteps(p: ArchParams): NextStep[] {
  if (p.style === "modern-tower")
    return [
      { label: "Make it taller", prompt: "Make the tower taller" },
      { label: "Change the look", prompt: "Give the tower another look" },
      { label: "Add trees around it", prompt: "Add trees around the tower" }
    ];
  const name = p.style === "torii-and-shrine" ? "shrine" : p.style === "pagoda" ? "pagoda" : p.style === "medieval-keep" ? "keep" : "castle";
  const out: NextStep[] = [
    { label: "Make it taller", prompt: `Make the ${name} taller` },
    { label: "Change the roof color", prompt: `Give the ${name} another roof color` }
  ];
  if (p.style === "medieval-keep") out.push({ label: "Add a village around it", prompt: "Add a small medieval village around the keep" });
  else out.push({ label: "Add cherry trees around it", prompt: `Add cherry blossom trees around the ${name}` });
  return out;
}

// ── The generator ────────────────────────────────────────────

/** Words of the user that state where the building stands. */
const PLACE_WORDS = /\bon\b|\bat\b|\bin\b|next to|beside|\bnear\b|corner|downtown|center|centre|middle|edge|outside|north|south|east|west|avenue|street|block|park|behind|in front|here|camera|selection/i;
const COLOR_WORDS = /red|green|blue|black|white|gr[ae]y|gold|bronze|copper|brown|yellow|orange|pink|purple|teal|dark|light|colou?r|#[0-9a-f]{3}/i;

export const architectureGenerator: Generator = {
  id: "architecture",
  // The director may set these only when the user's own words decide them; else the popup asks.
  taste: {
    look: /glass|setback|art.?deco|needle|spire|sleek|stepped|taper|curtain/i,
    height: /\d/,
    tiers: /\d|\btiers?\b|stor(y|ies|eys?)|floors?|levels?|three|five|seven/i,
    colors: COLOR_WORDS,
    site: PLACE_WORDS,
    at: PLACE_WORDS
  },
  describe:
    'ONE landmark building, not a city. params: style "japanese-castle"|"pagoda"|"torii-and-shrine"|"medieval-keep"|"modern-tower"; tiers (castle 3-7, pagoda 3|5, keep 1-5, tower setbacks 1-4); footprint m; height m (tower 20-300); look "glass"|"setback"|"needle"; colors {walls,roof,base,accent,timber} hex; detail 0-1; surround "none"|"stone-yard"|"garden"; plan "square"|"round"; facing deg; at {x,z}; site. In a city leave at and site out unless the user states the place: the editor asks with a map. Leave look, height and roof colors out unless the words or the image decide them.',

  validate(params, brief) {
    const p = resolve(params, brief);
    const title = taskTitle(params, brief);
    const given = givenOf(params, p);
    return { ...toStoredParams(p), given, ...(title ? { title } : {}) };
  },

  choices(params, ctx) {
    const resolved = resolve(params, ctx.brief);
    const { given, placeAsked } = applyAsk(givenOf(params, resolved), ctx.ask);
    const p = toStoredParams(resolved);
    const scene = sceneOf(ctx);
    const tower = p.style === "modern-tower";
    const questions: ChoiceQuestion[] = [];

    // Height first (the place and the thumbnails depend on it).
    const defHeight = given.height ? p.height : defaultTowerHeight(scene.skyline, scene.tall);
    if (tower) {
      p.height = defHeight;
      if (!given.footprint) p.footprint = towerFootprintFor(defHeight);
    }

    // 1. Where (only in a city, only when no place is given).
    const city = scene.city?.facts.city;
    if (city && (!given.place || placeAsked)) {
      const places = placesFor(p, city, ctx.anchor);
      const others = scene.others.filter((s) => s.id !== scene.city!.id).map((s) => ({ rect: s.facts.rect }));
      const options: ChoiceOption[] = places.map((pl) => {
        let hint: string | undefined;
        let image: string;
        if (pl.block) {
          const foot = Math.min(p.footprint, pl.maxFootprint ?? p.footprint);
          const ext = tower ? towerExtent(foot) : { hx: foot / 2, back: foot / 2, front: foot / 2 };
          const removed = cityBuildingsIn(ctx.editor, scene.city!.id, worldRect(pl.at, ext, pl.facing, ROOM_MARGIN)).length;
          hint = removed > 0 ? `${removed} city building${removed === 1 ? " makes" : "s make"} room` : `block ${pl.block.i},${pl.block.j}`;
          image = minimapImage({ cities: [city], context: others, rects: [{ rect: pl.block.rect }] });
        } else {
          hint = "on open ground, in line with the avenue";
          image = minimapImage({ cities: [city], context: others, dots: [{ x: pl.at.x, z: pl.at.z, r: Math.max(4, p.footprint * 0.6) }] });
        }
        return { id: pl.id, label: pl.label, ...(hint ? { hint } : {}), image };
      });
      const suggested = tower ? options[0]?.id : (options.find((o) => o.id === "beside") ?? options[0])?.id;
      if (options.length >= 2 && suggested) questions.push({ id: "site", title: "Where should it stand?", kind: "map", options, suggested });
    }

    if (tower) {
      // 2. Which look (thumbnails: that look in its real colors).
      if (!given.look) {
        const options: ChoiceOption[] = TOWER_LOOKS.map((look) => ({
          id: look,
          label: LOOK_TEXT[look].label,
          hint: LOOK_TEXT[look].hint,
          image: towerLookImage(look, ownColors(params) ? p.colors : lookColors(look, params, ctx.brief))
        }));
        questions.push({ id: "look", title: "Which look?", kind: "taste", options, suggested: p.look });
      }
      // 3. How tall (options from the skyline).
      if (!given.height) {
        const list = heightOptions(scene.skyline, defHeight);
        const maxH = Math.max(...list.map((o) => o.height));
        const options: ChoiceOption[] = list.map((o) => ({
          id: String(o.height),
          label: `${o.height} m`,
          hint: o.hint,
          image: towerHeightImage(p.look, p.colors, o.height, scene.skyline, maxH)
        }));
        const suggested = list.reduce((best, o) => (Math.abs(o.height - defHeight) < Math.abs(best.height - defHeight) ? o : best), list[0]);
        questions.push({ id: "height", title: "How tall?", options, suggested: String(suggested.height) });
      }
      return questions.slice(0, 3);
    }

    // Other styles: roof color with a swatch of that style, then the tier count.
    if (!given.colors) {
      const swatches = ROOF_SWATCHES[p.style as Exclude<ArchStyle, "modern-tower">];
      const options: ChoiceOption[] = swatches.map((s) => ({
        id: s.id,
        label: s.label,
        hint: s.hex,
        image: p.style === "medieval-keep" ? medievalRoofSwatch(s.hex, p.colors.walls, p.plan === "round") : japaneseRoofSwatch(s.hex, p.colors.walls)
      }));
      questions.push({ id: "roof", title: "Roof color?", kind: "taste", options, suggested: options[0].id });
    }
    if (!given.tiers && (p.style === "japanese-castle" || p.style === "pagoda")) {
      const counts = p.style === "pagoda" ? [3, 5] : [3, 5, 7];
      questions.push({
        id: "tiers",
        title: "How many tiers?",
        options: counts.map((n) => ({ id: String(n), label: `${n} tiers`, hint: n === 3 ? "compact" : n === 5 ? "classic" : "tall" })),
        suggested: counts.includes(p.tiers) ? String(p.tiers) : "5"
      });
    }
    return questions.slice(0, 3);
  },

  async run(params, answers: ChoiceAnswers, ctx) {
    if (ctx.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const plan_ = plan(params, answers, ctx);
    const { p, built, place, yardRadius } = plan_;
    const editor = ctx.editor;
    const scene = editor.scene;

    const taken = new Set<string>();
    const uniqueId = (base: string) => {
      let i = 1;
      while (scene.nodes.has(`${base}:${i}`) || taken.has(`${base}:${i}`)) i++;
      taken.add(`${base}:${i}`);
      return `${base}:${i}`;
    };
    // Replace: the old nodes go in the same command; the folder keeps its name.
    const removeOld = ctx.replace ? siteNodeIds(editor, ctx.replace.id) : [];
    const oldFolderName = ctx.replace ? (scene.nodes.get(ctx.replace.id)?.name ?? ctx.replace.title) : undefined;
    const names = new Set([...scene.nodes.values()].filter((n) => !n.parentId && n.id !== ctx.replace?.id).map((n) => n.name));
    const base = oldFolderName ?? ((typeof params.title === "string" && params.title.trim()) || STYLE_NAMES[p.style].replace(/^./, (c) => c.toUpperCase()));
    let folderName = base;
    if (!oldFolderName) for (let k = 2; names.has(folderName); k++) folderName = `${base} ${k}`;

    // City buildings under the footprint (plus a margin) make room, in the same command.
    const footRect = worldRect(place.at, plan_.ext, place.facing);
    const makeRoom = place.cityId ? cityBuildingsIn(editor, place.cityId, worldRect(place.at, plan_.ext, place.facing, ROOM_MARGIN)).filter((id) => !removeOld.includes(id)) : [];

    const folderId = uniqueId("node:group");
    const folderTransform = makeTransform(vec3(place.at.x, place.y ?? 0, place.at.z));
    folderTransform.rotation.y = (place.facing * Math.PI) / 180;
    const buildingNode: GroupNode = {
      id: uniqueId("node:resource:architecture"),
      kind: "group",
      name: p.style === "modern-tower" ? LOOK_TEXT[p.look].label : STYLE_NAMES[p.style].replace(/^./, (c) => c.toUpperCase()),
      parentId: folderId,
      transform: makeTransform(vec3(0, 0, 0)),
      data: {},
      metadata: { resource: BUILDING_ID, seed: p.seed, params: JSON.stringify(p), footprint: Math.round(built.radius * 100) / 100 }
    };
    let yardNode: GroupNode | null = null;
    if (p.surround !== "none") {
      const yardParams = { ...p, half: built.half };
      yardNode = {
        id: uniqueId("node:resource:architecture-yard"),
        kind: "group",
        name: p.surround === "garden" ? "Garden" : "Stone yard",
        parentId: folderId,
        transform: makeTransform(vec3(0, 0, 0)),
        data: {},
        metadata: { resource: YARD_ID, seed: p.seed, params: JSON.stringify(yardParams), footprint: Math.round(yardRadius * 100) / 100 }
      };
    }

    // Site record: resolved params (run(validate(params)) builds the same thing at the same place).
    const W = p.footprint;
    const cityTitle = plan_.city?.title ?? "the city";
    const where = place.block ? `on block ${place.block[0]},${place.block[1]} of ${cityTitle}` : place.site === "beside" ? `beside ${cityTitle}` : `at ${f1(place.at.x)},${f1(place.at.z)}`;
    const lead = p.style === "modern-tower" ? `${p.look} tower` : STYLE_NAMES[p.style];
    const buildingFacts: BuildingSiteFacts = {
      style: p.style === "modern-tower" ? `modern-tower ${p.look}` : p.style,
      height: round2(built.height),
      footprint: round2(W),
      ...(place.cityId && place.block ? { cityId: place.cityId, block: place.block } : {})
    };
    const rect = yardNode ? worldRect(place.at, { hx: yardRadius, back: yardRadius, front: yardRadius }, 0) : footRect;
    const record: SiteRecord = {
      v: 1,
      generator: "architecture",
      title: folderName,
      params: p as unknown as Record<string, unknown>,
      facts: {
        center: { x: place.at.x, z: place.at.z },
        rect: { x0: round2(rect.x0), z0: round2(rect.z0), x1: round2(rect.x1), z1: round2(rect.z1) },
        height: round2(built.height),
        style: styleText(p),
        summary: `${lead}, ${Math.round(built.height)} m tall, ${Math.round(W)} m wide, ${where}`,
        adjustable: adjustableText(p),
        building: buildingFacts
      }
    };
    const folder: GroupNode = { id: folderId, kind: "group", name: folderName, data: {}, transform: folderTransform, metadata: siteMetadata(record) };
    const add: GroupNode[] = [folder, buildingNode, ...(yardNode ? [yardNode] : [])];

    // Reveal schedule: the building animates its own stages; the yard rises after the ornaments.
    const timeline = stageTimeline(built.stages);
    const last = timeline[timeline.length - 1];
    const buildingMs = last ? last.start + last.duration : 0;
    const remove = [...makeRoom, ...removeOld];
    editor.execute(nodeBatchCommand(scene, `${ctx.replace ? "rebuild" : "build"} ${folder.name}`, { add, ...(remove.length ? { remove } : {}) }));
    markBuildReveal([buildingNode.id], 0);
    if (yardNode) markBuildReveal([yardNode.id], buildingMs);

    if (makeRoom.length) ctx.step("Clear the lot", `${makeRoom.length} city building${makeRoom.length === 1 ? " makes" : "s make"} room`);
    // The chat trace follows the reveal, stage by stage.
    for (const [k, stage] of built.stages.entries()) {
      const next = timeline[k + 1]?.start ?? buildingMs;
      const detail = /base/i.test(stage.label)
        ? p.style === "modern-tower"
          ? `podium ${Math.round(W)} m wide`
          : `${Math.round(W * 10) / 10} m wide`
        : /tier/i.test(stage.label)
          ? `of ${p.tiers}`
          : `top at ${built.height.toFixed(1)} m`;
      ctx.step(stage.label, detail);
      await ctx.pause(Math.max(150, next - timeline[k].start));
    }
    if (yardNode) {
      ctx.step(p.surround === "garden" ? "Garden" : "Stone yard", "steps and stone lanterns on the front");
      await ctx.pause(800);
    }

    // Summary for the chat: plain words for the user (block numbers and directions stay in the site record).
    const chatWhere = place.block && place.label ? place.label.charAt(0).toLowerCase() + place.label.slice(1) : where;
    const parts: string[] = [];
    if (p.style === "modern-tower") {
      const vs = plan_.skyline > 0 ? ` (the tallest other building is ${Math.round(plan_.skyline)} m)` : "";
      const lookName = LOOK_TEXT[p.look].style;
      parts.push(`${ctx.replace ? "Rebuilt" : "Built"} ${/^[aeiou]/i.test(lookName) ? "an" : "a"} ${lookName}, ${Math.round(built.height)} m tall and ${Math.round(W)} m wide${vs}, ${chatWhere}`);
    } else {
      const tierWord = p.style === "medieval-keep" ? `${p.tiers}-story` : p.style === "torii-and-shrine" ? "" : `${p.tiers}-tier`;
      const around = yardNode ? `, on a ${p.surround === "garden" ? "garden" : "stone yard"} ${f1(yardRadius)} m in radius` : "";
      parts.push(`${ctx.replace ? "Rebuilt" : "Built"} a ${tierWord ? `${tierWord} ` : ""}${STYLE_NAMES[p.style]}, ${built.height.toFixed(1)} m tall and ${f1(W)} m wide${around}, ${chatWhere}`);
    }
    if (ctx.replace) {
      const before = ctx.replace.facts.height;
      if (before && Math.round(before) !== Math.round(built.height)) parts.push(`it was ${Math.round(before)} m tall and is now ${Math.round(built.height)} m`);
      const oldAt = ctx.replace.params.at as { x: number; z: number } | undefined;
      const moved = oldAt && Math.hypot(oldAt.x - place.at.x, oldAt.z - place.at.z) > 0.5;
      parts.push(moved ? "it stands in a new place" : "it stands in the same place");
      const oldBlock = ctx.replace.facts.building?.block;
      if (moved && oldBlock && (!place.block || place.block[0] !== oldBlock[0] || place.block[1] !== oldBlock[1]))
        parts.push(`the city buildings that were removed from block ${oldBlock[0]},${oldBlock[1]} do not come back`);
    }
    if (makeRoom.length) parts.push(`${makeRoom.length} city building${makeRoom.length === 1 ? "" : "s"} made room`);
    if (plan_.movedFrom) parts.push(`it stands beside ${plan_.movedFrom}, not on top of it`);
    const summary = parts.length > 1 ? `${parts[0]}; ${parts.slice(1).join("; ")}.` : `${parts[0]}.`;
    return { nodeIds: [folderId, buildingNode.id, ...(yardNode ? [yardNode.id] : [])], summary, next: nextSteps(p) };
  }
};

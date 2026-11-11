// Generator "river": a flowing river along a natural course, with banks, reeds, stones, lily
// pads and a crossing. See ../types.ts for the contract and docs/plans/realtime-ai-harness.md 5B.
//
// Pure parts (course, path, meshes, dressing, city routes) are in src/lib/generators/river/ and
// unit tested in tests/river.test.ts and tests/river-city.test.ts. The water is the
// "water:river" library entry (src/lib/resources/generated/river.ts, shader in
// src/lib/resources/water/river-water.ts).
//
// Flat editor ground: the river gets its own bed and grass banks. Island terrain: the island is
// lowered to water along the course (one undo step), so the river is cut into the island and
// ends in the lake at the coast.
//
// Beside a city (ctx.sites): the river never crosses a block, a sidewalk or a street. It runs
// along one side (a quay on the city side, natural on the far side), around one corner, or free
// at a distance (city-routes.ts). The popup asks where, with a map, when the brief does not say.
// The bridge stands in line with the avenue.
import { createSetNodeCommand, type EditorCore } from "@theras/editor-core";
import { makeTransform, vec3, type GeometryNode, type GroupNode } from "@theras/shared";
import * as THREE from "three";
import { markBuildReveal } from "@/lib/build-reveal";
import {
  CITY_ROUTE_IDS,
  cityRoutes,
  courseProblem,
  crossesCity,
  nearestRoute,
  normalizeRouteId,
  rectObstacles,
  routeChoices,
  routeWords,
  segmentHitsRect,
  thinLine,
  type CityRoute,
  type RouteCity
} from "@/lib/generators/river/city-routes";
import { defaultCourse } from "@/lib/generators/river/course";
import { planDressing, type BankStyle } from "@/lib/generators/river/dressing";
import { riverParamsFromSamples } from "@/lib/generators/river/params";
import { clipToLand, computeRiverPath, distanceToCenterline, riverRandom, type P2, type RiverObstacle, type RiverPool, type RiverSample } from "@/lib/generators/river/path";
import { bankVariation, FLAT_WATER_Y, flatBankProfile, flatHeightAcross, ISLAND_WATER_Y } from "@/lib/generators/river/ribbon";
import { nodeBatchCommand } from "@/lib/outliner";
import { getResource } from "@/lib/resources/catalog";
import { resolveLayoutAnchor, sceneObstacles, type LayoutAnchorRef } from "@/lib/resources/layout";
import { getTerrain, terrainNodeIds } from "@/lib/resources/terrain-edit";
import { RIVER_STYLES, riverStyleSlug } from "@/lib/resources/water/river-water";
import { placementSceneOf } from "../../instant-path";
import { minimapImage } from "../minimap";
import { cityNear, citySites, rectContains, siteMetadata, siteNodeIds } from "../site";
import type { Brief, BuiltSite, ChoiceQuestion, DirectorContext, Generator, NextStep, SiteRecord } from "../types";

const BANKS: BankStyle[] = ["reeds", "stones", "mixed", "clean"];
/** Water styles offered for a river (water entry slugs; the popup shows their thumbnails). */
const RIVER_STYLE_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "lagoon", label: "Lagoon teal", hint: "clear teal, shallow banks, caustics" },
  { id: "clear-lake", label: "Clear water", hint: "calm, see-through blue" },
  { id: "toon-sea", label: "Toon", hint: "cartoon green-blue with foam" },
  { id: "anime", label: "Anime", hint: "bright cyan with white foam" },
  { id: "murky-pond", label: "Murky", hint: "brown swamp water, slow" }
];
/** A few words for each water style (site facts and summaries). */
const STYLE_WORDS: Record<string, string> = { lagoon: "teal", "clear-lake": "clear", "toon-sea": "toon", anime: "anime", "murky-pond": "murky" };
const ROUTE_VALUES = [...CITY_ROUTE_IDS, "free", "park"];

/** Widest river in meters. */
const MAX_WIDTH = 16;

export type RiverGenParams = {
  from?: LayoutAnchorRef;
  to?: LayoutAnchorRef;
  /** City route id (city-routes.ts), "free", or "park" (not built; the best route is used). */
  route?: string;
  width: number;
  /** The brief or the stored record gave the width (else it comes from the scene). */
  widthGiven?: boolean;
  meander: number;
  length?: number;
  style?: string;
  banks?: BankStyle;
  bridge: boolean;
  stones: boolean;
  loop: boolean;
  seed: number;
};

function hashText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const numberOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

function anchorRef(v: unknown): LayoutAnchorRef | undefined | string {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const x = numberOr(o.x, NaN);
    const z = numberOr(o.z, NaN);
    if (Number.isFinite(x) && Number.isFinite(z)) return { x, z };
  }
  return "!invalid";
}

/** Water style that suits the words of the brief. */
function suggestedStyle(brief: Brief): string {
  const words = [brief.style?.mood, brief.style?.era, brief.style?.palette, brief.understanding, ...(brief.style?.vegetation ?? [])].join(" ").toLowerCase();
  if (/murk|swamp|bog|marsh|mud/.test(words)) return "murky-pond";
  if (/toon|cartoon/.test(words)) return "toon-sea";
  if (/anime|ghibli|manga/.test(words)) return "anime";
  if (/clear|crystal|alpine|mountain|winter|nordic/.test(words)) return "clear-lake";
  return "lagoon";
}

function suggestedBanks(brief: Brief, city: boolean): BankStyle {
  const words = [brief.style?.mood, brief.style?.era, brief.understanding, ...(brief.style?.vegetation ?? [])].join(" ").toLowerCase();
  // Beside a city the city bank is a clean quay anyway; the far bank stays natural.
  if (city) return /marsh|swamp|reed|meadow|pond/.test(words) ? "reeds" : "mixed";
  if (/canal|city|urban|moat|castle wall/.test(words)) return "clean";
  if (/mountain|rock|stone|alpine|desert/.test(words)) return "stones";
  if (/marsh|swamp|reed|meadow|pond/.test(words)) return "reeds";
  return "mixed";
}

function validate(raw: Record<string, unknown>, brief: Brief): RiverGenParams | string {
  const from = anchorRef(raw.from);
  const to = anchorRef(raw.to);
  if (from === "!invalid" || to === "!invalid") return 'river: from/to must be a node id, "origin", "camera" or {x, z}';
  let style: string | undefined;
  if (raw.style !== undefined && raw.style !== null && raw.style !== "") {
    const slug = riverStyleSlug(String(raw.style));
    if (!slug) return `river: unknown style "${String(raw.style)}" (use ${Object.keys(RIVER_STYLES).join(", ")})`;
    style = slug;
  }
  let banks: BankStyle | undefined;
  if (raw.banks !== undefined && raw.banks !== null && raw.banks !== "") {
    const b = String(raw.banks).toLowerCase() as BankStyle;
    if (!BANKS.includes(b)) return `river: banks must be one of ${BANKS.join(", ")}`;
    banks = b;
  }
  let route: string | undefined;
  if (raw.route !== undefined && raw.route !== null && raw.route !== "") {
    const r = normalizeRouteId(String(raw.route));
    if (!r || !ROUTE_VALUES.includes(r)) return `river: route must be one of ${ROUTE_VALUES.join(", ")}`;
    route = r;
  }
  const length = raw.length === undefined ? undefined : clamp(numberOr(raw.length, 40), 8, 160);
  const seed = Math.round(numberOr(raw.seed, hashText(`${JSON.stringify(raw)}|${brief.understanding}`) % 1e6));
  return {
    from: from as LayoutAnchorRef | undefined,
    to: to as LayoutAnchorRef | undefined,
    route,
    width: clamp(numberOr(raw.width, 3), 1.5, MAX_WIDTH),
    widthGiven: raw.width !== undefined && raw.width !== null && raw.width !== "",
    meander: clamp(numberOr(raw.meander, 0.55), 0, 1),
    length,
    style,
    banks,
    bridge: raw.bridge === undefined ? true : raw.bridge === true || raw.bridge === "true",
    stones: raw.stones === true || raw.stones === "true",
    loop: raw.loop === true || raw.loop === "true",
    seed
  };
}

function asParams(params: Record<string, unknown>): RiverGenParams {
  return params as unknown as RiverGenParams;
}

/** A unique top-level folder name ("River", "River 2", ...). Nodes in skip do not count. */
function freeFolderName(editor: EditorCore, base: string, skip: Set<string>) {
  const names = new Set([...editor.scene.nodes.values()].filter((n) => !n.parentId && !skip.has(n.id)).map((n) => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

function uniqueId(editor: EditorCore, base: string, taken: Set<string>) {
  let i = 1;
  while (editor.scene.nodes.has(`${base}:${i}`) || taken.has(`${base}:${i}`)) i++;
  taken.add(`${base}:${i}`);
  return `${base}:${i}`;
}

// ── Obstacles and the city ────────────────────────────────────

type Surroundings = {
  /** Scene objects that are not inside a site. */
  scene: RiverObstacle[];
  /** The other sites (not the one that is built again). */
  others: BuiltSite[];
};

/** Other sites as circle obstacles: a river by its course, a city by its ground, the rest by its rect. */
function siteCircles(sites: BuiltSite[]): { all: RiverObstacle[]; noCity: RiverObstacle[] } {
  const all: RiverObstacle[] = [];
  const noCity: RiverObstacle[] = [];
  for (const site of sites) {
    const { facts } = site;
    if (facts.city) {
      all.push(...rectObstacles(facts.city.groundRect));
      continue;
    }
    const list: RiverObstacle[] = [];
    if (facts.river && facts.river.points.length > 1) {
      const r = facts.river.width / 2 + 0.6;
      const pts = facts.river.points;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i]!;
        const [bx, bz] = pts[i + 1]!;
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (r * 1.2)));
        for (let k = 0; k < n; k++) list.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, r });
      }
    } else if (facts.rect) {
      list.push(...rectObstacles(facts.rect));
    }
    all.push(...list);
    noCity.push(...list);
  }
  return { all, noCity };
}

function surroundings(editor: EditorCore, ctx: { sites: BuiltSite[]; replace?: BuiltSite; anchor: P2 }): Surroundings {
  const skip = new Set(ctx.replace ? siteNodeIds(editor, ctx.replace.id) : []);
  const others = ctx.sites.filter((s) => s.id !== ctx.replace?.id);
  const scene = placementSceneOf(editor, { x: ctx.anchor.x, y: 0, z: ctx.anchor.z });
  // Objects inside another site are covered by that site's own obstacle (or by the city plan).
  const inSite = (x: number, z: number) => others.some((s) => rectContains(s.facts.city?.groundRect ?? s.facts.rect, x, z, 0.5));
  return { scene: sceneObstacles(scene.nodes.filter((n) => !skip.has(n.id))).filter((o) => !inSite(o.x, o.z)), others };
}

/** Obstacles for a course: the scene objects and every other site except the given city (its plan routes the river). */
function courseObstacles(s: Surroundings, exceptCity?: string): RiverObstacle[] {
  return [...s.scene, ...siteCircles(s.others.filter((o) => o.id !== exceptCity)).all];
}

/** Obstacles for reeds, stones and the bridge: no city ground (a quay may touch the city verge). */
function dressingObstacles(s: Surroundings): RiverObstacle[] {
  return [...s.scene, ...siteCircles(s.others).noCity];
}

function cityFacts(site: BuiltSite): RouteCity {
  return site.facts.city!;
}

function minimapFor(city: BuiltSite, others: BuiltSite[], route: CityRoute, width: number, view: { x0: number; z0: number; x1: number; z1: number }) {
  return minimapImage({
    cities: [city.facts.city!],
    context: others.filter((s) => s.id !== city.id && !s.facts.river).map((s) => ({ rect: s.facts.city?.groundRect ?? s.facts.rect })),
    lines: [
      ...others.filter((s) => s.facts.river).map((s) => ({ points: s.facts.river!.points, width: s.facts.river!.width, color: "#7fb5e0" })),
      { points: thinLine(route.samples, 40), width }
    ],
    view
  });
}

function viewOf(city: BuiltSite, routes: CityRoute[]) {
  const g = city.facts.city!.groundRect;
  let x0 = g.x0;
  let z0 = g.z0;
  let x1 = g.x1;
  let z1 = g.z1;
  for (const r of routes)
    for (const p of r.samples) {
      x0 = Math.min(x0, p.x - p.hw);
      z0 = Math.min(z0, p.z - p.hw);
      x1 = Math.max(x1, p.x + p.hw);
      z1 = Math.max(z1, p.z + p.hw);
    }
  const pad = Math.max(x1 - x0, z1 - z0) * 0.04 + 1;
  return { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
}

/** True when the user asked to choose a param again (replace with ctx.ask). */
function asked(ask: string[] | undefined, ...names: string[]) {
  return Boolean(ask?.some((a) => names.includes(a.trim().toLowerCase())));
}

const sameRef = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);


function carveIsland(editor: EditorCore, samples: RiverSample[]): number {
  const id = terrainNodeIds()[0];
  const terrain = id ? getTerrain(id) : undefined;
  const node = id ? editor.scene.getNode(id) : undefined;
  if (!id || !terrain || !node) return 0;
  terrain.object.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  const local = samples.map((p) => {
    v.set(p.x, 0, p.z);
    terrain.object.worldToLocal(v);
    return { ...p, x: v.x, z: v.z };
  });
  const maxReach = Math.max(...local.map((p) => p.hw)) + 0.8;
  const ids: number[] = [];
  for (const corner of terrain.grid.corners) {
    if (corner.boundary || terrain.world.get(corner.id).height <= 0) continue;
    const d = distanceToCenterline(local, corner);
    if (d > Math.max(maxReach, 1.8)) continue;
    // The reach at this place: the nearest sample's half width.
    let nearest = local[0]!;
    let best = Infinity;
    for (const p of local) {
      const dd = Math.hypot(p.x - corner.x, p.z - corner.z);
      if (dd < best) {
        best = dd;
        nearest = p;
      }
    }
    if (d <= Math.max(nearest.hw + 0.7, 1.7)) ids.push(corner.id);
  }
  if (ids.length === 0) return 0;
  // From the source to the mouth, so the channel opens in the direction of the flow.
  const order = ids
    .map((cid) => {
      const c = terrain.grid.corners[cid]!;
      let best = 0;
      let bestD = Infinity;
      local.forEach((p) => {
        const dd = Math.hypot(p.x - c.x, p.z - c.z);
        if (dd < bestD) {
          bestD = dd;
          best = p.s;
        }
      });
      return { cid, s: best };
    })
    .sort((a, b) => a.s - b.s)
    .map((e) => e.cid);
  for (const cid of order) terrain.world.set(cid, { height: 0, material: "water", sown: false });
  for (let i = 0; i < order.length; i += 40) terrain.world.commit(order.slice(i, i + 40));
  editor.execute(createSetNodeCommand(editor.scene, id, { ...node, metadata: { ...node.metadata, world: terrain.serialize() } }));
  return order.length;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const round1 = (v: number) => Math.round(v * 10) / 10;

type CourseChoice = {
  samples: RiverSample[];
  pool?: RiverPool;
  from: P2;
  to: P2;
  route: string;
  cityRoute?: CityRoute;
  city?: BuiltSite;
  /** The director's from/to crossed the city; the course was moved. */
  moved: boolean;
  notes: string[];
};

/**
 * A river beside a city must read as a river, not as a gutter: when the brief gives no width,
 * the width comes from the city (about one side street wide, 9 to 12 m at full scale).
 */
function withSceneWidth(p: RiverGenParams, city: BuiltSite | undefined): RiverGenParams {
  const facts = city?.facts.city;
  if (!facts || p.widthGiven) return p;
  const side = facts.streets.find((s) => !s.avenue)?.width ?? 13 * facts.scale;
  return { ...p, width: clamp(Math.round(side * 0.8), 6 * Math.min(1, facts.scale), 12) };
}

function noRiver(reason: string) {
  return { nodeIds: [], summary: `No river was built: ${reason}.`, skipped: [reason] };
}

/** The routes beside a city for these params (deterministic). */
function routesFor(p: RiverGenParams, city: BuiltSite, s: Surroundings, anchor: P2) {
  return cityRoutes({ city: cityFacts(city), width: p.width, meander: p.meander, seed: p.seed, obstacles: courseObstacles(s, city.id), anchor });
}

function routeQuestion(given: RiverGenParams, ctx: { editor: EditorCore; sites: BuiltSite[]; replace?: BuiltSite; anchor: P2 }): ChoiceQuestion | null {
  const s = surroundings(ctx.editor, ctx);
  const city = cityNear(s.others, ctx.anchor);
  if (!city) return null;
  const p = withSceneWidth(given, city);
  const routes = routesFor(p, city, s, ctx.anchor);
  if (routes.length === 0) return null;
  const shown = routeChoices(routes, 4);
  const view = viewOf(city, shown);
  const stored = typeof ctx.replace?.params.route === "string" ? ctx.replace.params.route : undefined;
  const suggested = (shown.find((r) => r.id !== stored) ?? shown[0]!).id;
  return {
    id: "route",
    title: "Where should the river run?",
    kind: "map",
    options: shown.map((r) => ({ id: r.id, label: r.label, hint: r.hint, image: minimapFor(city, s.others, r, p.width, view) })),
    suggested
  };
}

/** Words of the user that state where the river runs. */
const PLACE_WORDS = /edge|\bsides?\b|north|south|east|west|along|around|through|across|next to|beside|\bnear\b|between|outside|\bpast\b|behind|in front|\bleft\b|\bright\b|corner|\bpark\b|avenue|\bfrom\b.*\bto\b/i;

export const riverGenerator: Generator = {
  id: "river",
  // The director may set these only when the user's own words decide them; else the popup asks.
  taste: {
    route: PLACE_WORDS,
    from: PLACE_WORDS,
    to: PLACE_WORDS,
    width: /\d|wide|narrow|broad|\bbig\b|large|small|thin|creek|stream|brook|canal/i,
    style: /lagoon|clear|toon|cartoon|anime|murky|swamp|mud|teal|turquoise|blue|green|crystal|dirty|brown|bright/i,
    banks: /reed|stone|rock|pebble|clean|grass|quay|natural|wild|\bbanks?\b/i
  },
  describe:
    'river: a flowing river, stream, creek or canal: a winding ribbon of water with banks, reeds, stones and a bridge. Not for a lake, pond or sea (compose water:*). Params: from?, to? (node id|"origin"|"camera"|{x,z}), route? (edge:north|south|east|west, bend:ne|se|sw|nw, outside, free), width 1.5-16 m, meander 0-1 (0.55), length m (40), style (lagoon|clear-lake|toon-sea|anime|murky-pond), banks (reeds|stones|mixed|clean), bridge (true), stones (stepping stones, false), seed. In a scene with a city leave route, from and to out unless the user states them: the editor asks with a map.',
  validate: (params, brief) => validate(params, brief) as Record<string, unknown> | string,
  choices: (params, ctx) => {
    const p = asParams(params);
    const questions: ChoiceQuestion[] = [];
    const routeAsked = asked(ctx.ask, "route", "from", "to");
    // A place is given by a route, or by from/to (unless the user asked to choose the place again).
    const placeGiven = Boolean(p.route) || (!routeAsked && (p.from !== undefined || p.to !== undefined));
    if (!placeGiven) {
      try {
        const q = routeQuestion(p, ctx);
        if (q) questions.push(q);
      } catch (error) {
        console.warn("[river] route question failed:", error);
      }
    }
    if (!p.style) {
      questions.push({
        id: "water",
        title: "Which water?",
        options: RIVER_STYLE_OPTIONS.map((o) => ({ id: o.id, label: o.label, hint: o.hint, resourceId: `water:${o.id}` })),
        suggested: suggestedStyle(ctx.brief)
      });
    }
    if (!p.banks) {
      const city = Boolean(cityNear(ctx.sites.filter((s) => s.id !== ctx.replace?.id), ctx.anchor));
      questions.push({
        id: "banks",
        title: city ? "Far river bank?" : "River banks?",
        options: [
          { id: "mixed", label: "Reeds and stones", hint: "reeds at inner bends, stones at outer bends", resourceId: "nature:plant:cattail-reeds" },
          { id: "reeds", label: "Reeds", hint: "cattail reeds along the water", resourceId: "nature:plant:cattail-reeds" },
          { id: "stones", label: "Stones", hint: "boulders and pebbles", resourceId: "nature:rock:boulder" },
          { id: "clean", label: "Clean", hint: "grass banks only" }
        ],
        suggested: suggestedBanks(ctx.brief, city)
      });
    }
    return questions;
  },
  run: async (raw, answers, ctx) => runRiver(asParams(raw), answers, ctx)
};

async function runRiver(given: RiverGenParams, answers: Parameters<Generator["run"]>[1], ctx: DirectorContext) {
  const editor = ctx.editor;
  const skipped: string[] = [];
  // The same width that the route question drew (see withSceneWidth).
  const p = withSceneWidth(given, cityNear(surroundings(editor, ctx).others, ctx.anchor));
  const style = riverStyleSlug(answers.water?.optionIds[0]) ?? p.style ?? suggestedStyle(ctx.brief);
  const bankAnswer = answers.banks?.optionIds[0] as BankStyle | undefined;
  if (p.loop) skipped.push("moat: a closed loop is not supported; the river runs beside the anchor instead");

  const sur = surroundings(editor, ctx);
  const scene = placementSceneOf(editor, { x: ctx.anchor.x, y: 0, z: ctx.anchor.z });
  const islandNode = scene.nodes.find((n) => n.terrain);
  const terrainId = terrainNodeIds()[0];
  const terrain = terrainId ? getTerrain(terrainId) : undefined;
  // Island mode: there is an island and the anchor is on it or near it.
  const islandCenter = islandNode ? { x: islandNode.position.x, z: islandNode.position.z } : undefined;
  const islandReach = terrain ? terrain.grid.radius + 2 : 0;
  const groundAt = scene.groundAt;
  const nearIsland = Boolean(groundAt && islandCenter && Math.hypot(ctx.anchor.x - islandCenter.x, ctx.anchor.z - islandCenter.z) < islandReach);

  // ── Course ──────────────────────────────────────────────────
  const resolve = (ref: LayoutAnchorRef | undefined): P2 | null | string => {
    if (ref === undefined) return null;
    const r = resolveLayoutAnchor(ref, scene);
    return typeof r === "string" ? r : { x: r.x, z: r.z };
  };
  const routeAsked = asked(ctx.ask, "route", "from", "to");
  let wanted = normalizeRouteId(answers.route?.optionIds[0] ?? "") ?? p.route;
  let fromRef = p.from;
  let toRef = p.to;
  if (ctx.replace) {
    const stored = ctx.replace.params;
    // A new from/to for a river that had a city route: the user moved it by points.
    if (wanted && wanted === stored.route && (!sameRef(p.from, stored.from) || !sameRef(p.to, stored.to))) wanted = undefined;
    if (routeAsked) {
      fromRef = undefined;
      toRef = undefined;
    }
  }
  const fromP = resolve(fromRef);
  const toP = resolve(toRef);
  if (typeof fromP === "string") return noRiver(`the start point is unknown (${fromP})`);
  if (typeof toP === "string") return noRiver(`the end point is unknown (${toP})`);

  const city = cityNear(sur.others, ctx.anchor) ?? (fromP ? cityNear(sur.others, fromP) : undefined) ?? (toP ? cityNear(sur.others, toP) : undefined);
  const course = chooseCourse(p, { wanted, fromP, toP, city, sur, anchor: ctx.anchor, nearIsland, groundAt, islandCenter });
  if (typeof course === "string") return noRiver(course);
  skipped.push(...course.notes);
  const banks: BankStyle = bankAnswer && BANKS.includes(bankAnswer) ? bankAnswer : (p.banks ?? suggestedBanks(ctx.brief, Boolean(course.cityRoute)));

  let samples = course.samples;
  let citySide = course.cityRoute?.citySide;
  let mode: "flat" | "island" = "flat";
  let mouth = false;
  let source = true;
  if (groundAt && islandCenter && samples.some((s) => Math.hypot(s.x - islandCenter.x, s.z - islandCenter.z) < islandReach)) {
    const clipped = clipToLand(samples, (x, z) => groundAt(x, z) !== null, { minLength: 6, mouthExtra: 2.5 });
    if (!clipped) return noRiver("the course has less than 6 m of land on the island");
    samples = clipped.samples;
    citySide = undefined;
    mode = "island";
    mouth = clipped.mouthAtEnd;
    source = !clipped.mouthAtStart;
  }
  // Never report a river that is not there.
  const problem = courseProblem(samples, p.width);
  if (problem) return noRiver(problem);
  if (ctx.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const length = samples[samples.length - 1]!.s;
  const meanWidth = (samples.reduce((s, q) => s + q.hw, 0) / samples.length) * 2;
  const origin = {
    x: samples.reduce((s, q) => s + q.x, 0) / samples.length,
    z: samples.reduce((s, q) => s + q.z, 0) / samples.length
  };

  // Stage 1: bed (on an island: lower the land along the course).
  ctx.step("Riverbed", `${Math.round(length)} m long, ${meanWidth.toFixed(1)} m wide${mode === "island" ? ", cut into the island" : ""}${course.cityRoute ? `, ${routeWords(course.route)}` : ""}`);
  if (mode === "island") {
    const lowered = carveIsland(editor, samples);
    if (lowered === 0) skipped.push("island: no land corners to lower along the course");
    await ctx.pause(700);
  }

  // Dressing plan (needs the carved ground on an island).
  const vary = bankVariation(p.seed);
  const heightAt =
    mode === "flat"
      ? (i: number, off: number) => {
          const q = samples[i]!;
          const a = Math.abs(off);
          if (a < q.hw - 0.25) return FLAT_WATER_Y - 0.06;
          return flatHeightAcross(flatBankProfile(q, meanWidth, vary), a);
        }
      : (i: number, off: number) => {
          const q = samples[i]!;
          const y = groundAt!(q.x + q.nx * off, q.z + q.nz * off);
          return y ?? ISLAND_WATER_Y - 0.08;
        };
  const dressObstacles = dressingObstacles(sur);
  const landmarks = dressObstacles.filter((o) => !o.soft && o.r >= 1.5);
  const pool = course.pool && course.pool.s <= length ? course.pool : undefined;
  const dressing = planDressing({
    samples,
    width: meanWidth,
    pool,
    banks,
    bridge: p.bridge,
    stones: p.stones,
    seed: p.seed,
    obstacles: dressObstacles,
    anchor: ctx.anchor,
    landmarks: course.cityRoute ? [] : landmarks,
    heightAt,
    waterY: mode === "flat" ? FLAT_WATER_Y : ISLAND_WATER_Y,
    crossingAt: course.cityRoute?.bridge,
    citySide
  });
  skipped.push(...dressing.skipped);

  // ── Nodes: folder, water, plants and bridge in ONE undo step (with the old river removed) ──
  const replaceIds = ctx.replace ? siteNodeIds(editor, ctx.replace.id) : [];
  const skip = new Set(replaceIds);
  const riverTasks = ctx.brief.tasks.filter((t) => t.generator === "river");
  const title = (ctx.replace?.title || (riverTasks.length === 1 ? riverTasks[0]!.title : "") || "River").trim() || "River";
  const oldName = ctx.replace ? editor.scene.getNode(ctx.replace.id)?.name : undefined;
  const folderName = oldName ?? freeFolderName(editor, title, skip);
  const params = riverParamsFromSamples(samples, origin, {
    style,
    mode,
    capStart: mode === "flat" || source,
    capEnd: mode === "flat",
    fadeStart: mode === "flat" || source ? 0 : 2.5,
    fadeEnd: mode === "flat" ? 0 : 2.5,
    seed: p.seed,
    stones: dressing.stepping?.stones
  });
  const taken = new Set<string>();
  const folderId = uniqueId(editor, "node:group", taken);
  const riverId = uniqueId(editor, "node:resource:river", taken);

  const bridge = dressing.items.find((i) => i.role === "bridge");
  const bridgeAtAvenue = Boolean(bridge && course.cityRoute?.bridge && Math.hypot(bridge.x - course.cityRoute.bridge.x, bridge.z - course.cityRoute.bridge.z) < Math.max(2, meanWidth));
  const crossingStreet = bridgeAtAvenue ? course.cityRoute!.bridge! : undefined;
  const styleWord = STYLE_WORDS[style] ?? style;
  const where = course.cityRoute ? routeWords(course.route) : "";
  const bridgeWords = crossingStreet ? (crossingStreet.avenue ? "bridge at the avenue" : `bridge at ${crossingStreet.street}`) : bridge ? "bridge" : "";
  const resolved: Record<string, unknown> = {
    route: course.route,
    from: { x: round1(course.from.x), z: round1(course.from.z) },
    to: { x: round1(course.to.x), z: round1(course.to.z) },
    width: p.width,
    meander: p.meander,
    ...(p.length !== undefined ? { length: p.length } : {}),
    style,
    banks,
    bridge: p.bridge,
    stones: p.stones,
    seed: p.seed
  };
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const q of samples) {
    x0 = Math.min(x0, q.x - p.width);
    z0 = Math.min(z0, q.z - p.width);
    x1 = Math.max(x1, q.x + p.width);
    z1 = Math.max(z1, q.z + p.width);
  }
  const routeList = course.city ? routesFor(p, course.city, sur, ctx.anchor).map((r) => r.id) : [];
  const record: SiteRecord = {
    v: 1,
    generator: "river",
    title,
    params: resolved,
    facts: {
      center: { x: round1(origin.x), z: round1(origin.z) },
      rect: { x0: round1(x0), z0: round1(z0), x1: round1(x1), z1: round1(z1) },
      style: `${styleWord} river`,
      summary: [`${Math.round(length)} m river${where ? ` ${where}` : ""}`, `${round1(p.width)} m wide`, `${styleWord} water`, bridgeWords].filter(Boolean).join(", "),
      adjustable: [
        `width 1.5-${MAX_WIDTH} (${round1(p.width)})`,
        `route ${course.route}${routeList.length ? ` (${routeList.join("|")})` : ""}`,
        `style ${style} (lagoon|clear-lake|toon-sea|anime|murky-pond)`,
        `banks ${banks} (reeds|stones|mixed|clean)`,
        `bridge ${p.bridge} (true|false)`
      ].join("; "),
      river: { points: thinLine(samples, 20), width: round1(p.width), style, route: course.route }
    }
  };
  const folder: GroupNode = {
    id: folderId,
    kind: "group",
    name: folderName,
    data: {},
    transform: makeTransform(vec3(origin.x, 0, origin.z)),
    metadata: siteMetadata(record)
  } as GroupNode;
  const riverNode: GroupNode = {
    id: riverId,
    kind: "group",
    name: "River water",
    parentId: folderId,
    transform: makeTransform(vec3(0, 0, 0)),
    data: {},
    metadata: { resource: "water:river", seed: p.seed, params: JSON.stringify(params) }
  } as GroupNode;

  // Plants, stones and the bridge as library nodes in the folder (node-local positions).
  const plantItems = dressing.items.filter((i) => i.role !== "bridge");
  const itemNodes: { node: GroupNode; role: string }[] = [];
  for (const item of [...plantItems, ...(bridge ? [bridge] : [])]) {
    const entry = getResource(item.id);
    if (!entry?.create) {
      skipped.push(`${item.role}: the library entry ${item.id} is missing`);
      continue;
    }
    const transform = makeTransform(vec3(item.x - origin.x, item.y, item.z - origin.z));
    transform.rotation.y = item.rotationY;
    if (item.scale !== 1) transform.scale = vec3(item.scale, item.scale, item.scale);
    itemNodes.push({
      role: item.role,
      node: {
        id: uniqueId(editor, `node:resource:${entry.id.split(":").pop()}`, taken),
        kind: "group",
        name: entry.nameFor?.(item.seed) ?? entry.name,
        parentId: folderId,
        transform,
        data: {},
        metadata: { resource: entry.id, seed: item.seed }
      } as GroupNode
    });
  }
  const add: GeometryNode[] = [folder, riverNode, ...itemNodes.map((n) => n.node)];
  editor.execute(nodeBatchCommand(editor.scene, ctx.replace ? "change River" : "place River", { add, remove: replaceIds }));

  // Staged reveal: water first, then plants one by one, then the bridge.
  const plantNodes = itemNodes.filter((n) => n.role !== "bridge");
  const bridgeNode = itemNodes.find((n) => n.role === "bridge");
  markBuildReveal([riverId], 0);
  plantNodes.forEach((n, k) => markBuildReveal([n.node.id], 1800 + k * 90));
  if (bridgeNode) markBuildReveal([bridgeNode.node.id], 1900 + plantNodes.length * 90);

  const styleName = RIVER_STYLES[style]?.name ?? style;
  ctx.step("Flowing water", `${styleName}, from source to ${mouth ? "the lake" : "mouth"}`);
  await ctx.pause(900);
  ctx.step("Banks", course.cityRoute ? "a clean quay on the city side, natural banks on the far side" : mode === "flat" ? "earth and grass banks" : "island banks");
  await ctx.pause(mode === "flat" ? 900 : 300);
  const count = (role: string) => plantItems.filter((i) => i.role === role).length;
  if (plantNodes.length > 0) {
    const parts = [
      count("reeds") ? plural(count("reeds"), "reed clump", "reed clumps") : "",
      count("stone") + count("pebbles") ? plural(count("stone") + count("pebbles"), "stone group", "stones") : "",
      count("lily") ? plural(count("lily"), "lily pad group", "lily pads") : ""
    ].filter(Boolean);
    ctx.step("Plants", parts.join(", "));
    await ctx.pause(Math.min(2400, plantNodes.length * 90 + 300));
  }
  if (bridgeNode && bridge) {
    ctx.step("Bridge", `${(3 * bridge.scale).toFixed(1)} m footbridge${crossingStreet ? (crossingStreet.avenue ? " in line with the avenue" : ` in line with ${crossingStreet.street}`) : " across the river"}`);
    await ctx.pause(400);
  }
  if (dressing.stepping) ctx.step("Stepping stones", `${dressing.stepping.stones?.length ?? 0} stones across`);

  const extras = [
    count("reeds") ? plural(count("reeds"), "reed clump", "reed clumps") : "",
    count("stone") + count("pebbles") ? plural(count("stone") + count("pebbles"), "stone group", "stone groups") : "",
    count("lily") ? plural(count("lily"), "lily pad group", "lily pad groups") : "",
    bridgeNode ? (crossingStreet?.avenue ? "a bridge at the avenue" : crossingStreet ? `a bridge at ${crossingStreet.street}` : "a bridge") : "",
    dressing.stepping ? "stepping stones" : ""
  ].filter(Boolean);
  const extraText = extras.length ? `, with ${extras.length > 1 ? `${extras.slice(0, -1).join(", ")} and ${extras[extras.length - 1]}` : extras[0]}` : "";
  const islandWords = mode === "island" ? (mouth ? " cut into the island down to the lake" : " cut into the island") : "";
  const movedText = course.moved ? " The course was moved to keep the streets and buildings clear." : "";
  const verb = ctx.replace ? "Rebuilt the river as a" : "Built a";
  const next: NextStep[] = [
    p.width < MAX_WIDTH - 2 ? { label: "Make it wider", prompt: "Make the river wider" } : { label: "Make it narrower", prompt: "Make the river narrower" },
    ...(course.city ? [{ label: "Move it to another side", prompt: "Move the river to another side of the city" }] : []),
    { label: "Add trees along the river", prompt: "Add trees along the river bank" },
    { label: "Other water", prompt: "Change the river to another water style" }
  ].slice(0, 4);
  return {
    nodeIds: [folderId, riverId, ...itemNodes.map((n) => n.node.id)],
    summary: `${verb} ${Math.round(length)} m river${where ? ` ${where}` : ""}, ${meanWidth.toFixed(1)} m wide (${styleName} water)${islandWords}${extraText}.${movedText}`,
    skipped: skipped.length ? skipped : undefined,
    next
  };
}

/**
 * Picks the course. With a city near: a city route (the answer, the route param, or the best
 * one); from/to that would cross the city are replaced by the nearest valid route. Without a
 * city: today's free course, with every other site as an obstacle.
 */
function chooseCourse(
  p: RiverGenParams,
  o: {
    wanted?: string;
    fromP: P2 | null;
    toP: P2 | null;
    city?: BuiltSite;
    sur: Surroundings;
    anchor: P2;
    nearIsland: boolean;
    groundAt?: (x: number, z: number) => number | null;
    islandCenter?: P2;
  }
): CourseChoice | string {
  const notes: string[] = [];
  const { city, sur } = o;
  const fromCity = (r: CityRoute, moved: boolean): CourseChoice => ({
    samples: r.samples,
    pool: r.pool,
    from: { x: r.samples[0]!.x, z: r.samples[0]!.z },
    to: { x: r.samples[r.samples.length - 1]!.x, z: r.samples[r.samples.length - 1]!.z },
    route: r.id,
    cityRoute: r,
    city,
    moved,
    notes
  });
  let wanted = o.wanted;
  if (wanted === "park") {
    notes.push("park: a stream through the park is not offered (it would cross the park paths); the river runs beside the city");
    wanted = undefined;
  }
  const routes = city ? routesFor(p, city, sur, o.anchor) : [];
  if (city && routes.length > 0) {
    if (wanted && wanted !== "free") {
      const r = routes.find((x) => x.id === wanted);
      if (r) return fromCity(r, false);
      notes.push(`route: ${wanted} has no free course here; the best route is used`);
      return fromCity(routes[0]!, false);
    }
    if (!o.fromP && !o.toP) return fromCity(routes[0]!, false);
  }

  // A free course (from/to, or a default one).
  const obstacles = courseObstacles(sur);
  const wishLength = p.length ?? (o.nearIsland ? 24 : 40);
  let from: P2;
  let to: P2;
  if (o.fromP && o.toP) {
    from = o.fromP;
    to = o.toP;
  } else if (o.fromP || o.toP) {
    const rng = riverRandom(p.seed ^ 0x7a11);
    const angle = rng() * Math.PI * 2;
    const a = (o.fromP ?? o.toP)!;
    const b = { x: a.x + Math.cos(angle) * wishLength, z: a.z + Math.sin(angle) * wishLength };
    from = o.fromP ? a : b;
    to = o.fromP ? b : a;
  } else {
    const c = defaultCourse({
      anchor: o.anchor,
      length: wishLength,
      width: p.width,
      seed: p.seed,
      obstacles,
      groundAt: o.nearIsland ? o.groundAt : undefined,
      island: o.islandCenter
    });
    if (typeof c === "string") return c;
    from = c.from;
    to = c.to;
  }
  if (Math.hypot(to.x - from.x, to.z - from.z) < 1) return "the start and the end of the river are at the same place";
  // A straight line over a city: the director's points have no relation to the street plan.
  const over = (o.fromP || o.toP) && citySites(sur.others).find((c) => segmentHitsRect(from, to, c.facts.city!.groundRect, p.width / 2));
  const path = computeRiverPath({ from, to, width: p.width, meander: p.meander, seed: p.seed, obstacles });
  // Every city in the scene, not only the near one: the water must never cross a street grid.
  const crossed = over || citySites(sur.others).find((c) => crossesCity(path.samples, c.facts.city!));
  if (crossed) {
    const list = crossed.id === city?.id ? routes : routesFor(p, crossed, sur, o.anchor);
    const r = nearestRoute(list, [from, to]);
    if (!r) return "the course crosses the city and no route beside the city is free";
    return { ...fromCity(r, true), city: crossed };
  }
  return { samples: path.samples, pool: path.pool, from, to, route: "free", city, moved: false, notes };
}

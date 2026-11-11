// Tests for the modern tower, the questions that fit the style, siting in a city, the site
// record and replace. The city is a hand-made fixture (CitySiteFacts in world meters).
// Run: cd apps/editor && bun test tests/architecture-tower.test.ts
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { TOWER_LOOKS, buildArchitecture, resolveArchParams } from "../src/lib/generators/architecture";
import { cityPlaces, defaultTowerHeight, heightOptions, skylineHeight } from "../src/lib/generators/architecture/siting";
import { architectureGenerator } from "../src/lib/copilot/director/generators/architecture";
import { readSites, siteMetadata } from "../src/lib/copilot/director/site";
import type { Brief, BuiltSite, ChoiceAnswers, CitySiteFacts, DirectorContext, SiteRecord } from "../src/lib/copilot/director/types";

// ── Fixtures ──────────────────────────────────────────────────

const R = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 });
const XS: [number, number][] = [[-45, -20], [-10, 10], [20, 45]];
const ZS: [number, number][] = [[-45, -23], [-7, 10], [20, 45]];

function cityFacts(): CitySiteFacts {
  const blocks: CitySiteFacts["blocks"] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const park = i === 1 && j === 1;
      const core = (i === 1 && j === 0) || (i === 0 && j === 1) || (i === 2 && j === 1);
      blocks.push({
        i,
        j,
        rect: R(XS[i][0], ZS[j][0], XS[i][1], ZS[j][1]),
        kind: park ? "park" : "lot",
        zone: park ? "park" : core ? "downtown" : "low-rise",
        tallest: park ? 0 : core ? 50 : 18
      });
    }
  const street = (id: number, axis: "x" | "z", pos: number, avenue = false) => ({
    id,
    name: `S${id}`,
    axis,
    pos,
    from: -55,
    to: 55,
    width: avenue ? 16 : 10,
    carriage: avenue ? 10 : 6,
    median: avenue ? 2 : 0,
    avenue
  });
  return {
    scale: 1,
    y: 0.5,
    streetsRect: R(-55, -55, 55, 55),
    groundRect: R(-62, -62, 62, 62),
    avenueAxis: "x",
    streets: [street(1, "x", -50), street(2, "x", -15, true), street(3, "x", 15), street(4, "x", 50), street(5, "z", -50), street(6, "z", -15), street(7, "z", 15), street(8, "z", 50)],
    blocks,
    kit: "commercial",
    trees: "none"
  };
}

type Node = { id: string; name: string; parentId?: string; kind?: string; transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }; metadata?: Record<string, unknown> };

const T = (x: number, y: number, z: number) => ({ position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });

/** A scene with a city folder at (0, 0.5, 0) and one city building at the center of each lot. */
function makeEditor(withCity = true) {
  const nodes = new Map<string, Node>();
  let commands = 0;
  const scene = {
    nodes,
    addNode: (n: Node) => nodes.set(n.id, n),
    removeNode: (id: string) => nodes.delete(id),
    getNode: (id: string) => nodes.get(id)
  };
  const editor = { scene, execute: (cmd: { execute: (s: typeof scene) => void }) => (commands++, cmd.execute(scene)), commands: () => commands };
  if (withCity) {
    const facts = cityFacts();
    const record: SiteRecord = {
      v: 1,
      generator: "city",
      title: "Small city",
      params: {},
      facts: { center: { x: 0, z: 0 }, rect: facts.groundRect, height: 50, style: "modern downtown", summary: "3 x 3 blocks", city: facts }
    };
    nodes.set("city", { id: "city", name: "Small city", kind: "group", transform: T(0, 0.5, 0), metadata: siteMetadata(record) });
    for (const b of facts.blocks) {
      if (b.kind !== "lot") continue;
      const cx = (b.rect.x0 + b.rect.x1) / 2;
      const cz = (b.rect.z0 + b.rect.z1) / 2;
      // Two buildings: one at the center and one at a far corner of the block.
      nodes.set(`b${b.i}${b.j}a`, { id: `b${b.i}${b.j}a`, name: "Building", parentId: "city", transform: T(cx, 0, cz), metadata: { resource: "model:city-commercial:building-a" } });
      nodes.set(`b${b.i}${b.j}b`, { id: `b${b.i}${b.j}b`, name: "Building", parentId: "city", transform: T(b.rect.x0 + 1, 0, b.rect.z0 + 1), metadata: { resource: "model:city-commercial:building-b" } });
    }
  }
  return editor;
}

const brief = (understanding = "Build a landmark.", style: Brief["style"] = {}): Brief => ({ mode: "build", understanding, style, tasks: [] });

function ctxOf(editor: ReturnType<typeof makeEditor>, opts: { prompt?: string; brief?: Brief; anchor?: { x: number; z: number }; replace?: BuiltSite; ask?: string[] } = {}): DirectorContext {
  return {
    editor: editor as never,
    prompt: opts.prompt ?? "",
    brief: opts.brief ?? brief(),
    anchor: opts.anchor ?? { x: 0, z: 0 },
    sites: readSites(editor as never),
    ...(opts.replace ? { replace: opts.replace } : {}),
    ...(opts.ask ? { ask: opts.ask } : {}),
    step: () => {},
    pause: async () => {},
    callModel: async () => ({ text: "" })
  };
}

const gen = architectureGenerator;
const validate = (params: Record<string, unknown>, b: Brief) => gen.validate(params, b) as Record<string, unknown>;

function siteOf(editor: ReturnType<typeof makeEditor>, folderId: string): BuiltSite {
  const s = readSites(editor as never).find((x) => x.id === folderId);
  if (!s) throw new Error("no site record");
  return s;
}

// ── Geometry ──────────────────────────────────────────────────

describe("modern tower geometry", () => {
  test("built height is the height param for every look (20 to 300 m)", () => {
    for (const look of TOWER_LOOKS)
      for (const height of [20, 45, 96, 150, 190, 300]) {
        const built = buildArchitecture(resolveArchParams({ style: "modern-tower", look, height }));
        const box = new THREE.Box3();
        for (const s of built.stages) for (const g of Object.values(s.geometries)) box.union(g!.boundingBox!);
        expect(Math.abs(built.height - height) / height).toBeLessThan(0.05);
        expect(Math.abs(box.max.y - height) / height).toBeLessThan(0.05);
        expect(Math.abs(box.min.y)).toBeLessThan(1e-3);
      }
  });

  test("height is not clamped back by tiers or footprint", () => {
    for (const look of TOWER_LOOKS)
      for (const tiers of [1, 4])
        for (const footprint of [6, 40]) {
          const built = buildArchitecture(resolveArchParams({ style: "modern-tower", look, height: 280, tiers, footprint }));
          expect(built.height).toBeCloseTo(280, 3);
          expect(built.stages.filter((s) => /^Tier \d+$/.test(s.label)).length).toBe(tiers);
        }
  });

  test("slender, with glass and lit windows, a sane triangle count", () => {
    for (const look of TOWER_LOOKS) {
      const p = resolveArchParams({ style: "modern-tower", look, height: 150 });
      const built = buildArchitecture(p);
      expect(p.footprint).toBeLessThan(150 / 5);
      expect(built.triangles).toBeLessThan(8000);
      const mats = new Set(built.stages.flatMap((s) => Object.keys(s.geometries)));
      expect(mats.has("glass")).toBe(true);
      expect(mats.has("lit")).toBe(true);
      console.log(`tower ${look} 150 m: ${built.triangles} triangles, footprint ${p.footprint} m`);
    }
  });
});

// ── Height rule ───────────────────────────────────────────────

describe("default height", () => {
  test("from the skyline of a fixture city", () => {
    const sky = skylineHeight([], cityFacts());
    expect(sky).toBe(50);
    expect(defaultTowerHeight(sky, false)).toBe(80);
    expect(defaultTowerHeight(sky, true)).toBe(150);
    expect(defaultTowerHeight(20, false)).toBe(60);
    expect(defaultTowerHeight(0, false)).toBe(60);
    const opts = heightOptions(sky, 110);
    expect(opts.length).toBe(3);
    expect(opts.map((o) => o.height)).toContain(110);
    for (let i = 1; i < opts.length; i++) expect(opts[i].height).toBeGreaterThan(opts[i - 1].height);
    expect(opts[0].height).toBeGreaterThan(sky);
  });

  test("a run with no height uses 3 x the skyline for 'really tall'", async () => {
    const editor = makeEditor();
    const b = brief("The user wants a really tall skyscraper.", { era: "modern city" });
    const v = validate({ style: "modern-tower" }, b);
    const res = await gen.run(v, {}, ctxOf(editor, { prompt: "I want a really tall skyscraper", brief: b }));
    const site = siteOf(editor, res.nodeIds[0]);
    expect(site.facts.height).toBeCloseTo(150, 0);
  });
});

// ── Questions ─────────────────────────────────────────────────

describe("choices fit the style", () => {
  test("tower in a city: site (map), look and height; no roof color", () => {
    const editor = makeEditor();
    const b = brief("A really tall skyscraper.", { era: "modern city" });
    const v = validate({ style: "modern-tower" }, b);
    const qs = gen.choices!(v, ctxOf(editor, { brief: b }));
    expect(qs.map((q) => q.id)).toEqual(["site", "look", "height"]);
    expect(qs[0].kind).toBe("map");
    expect(qs[0].title).toBe("Where should it stand?");
    expect(qs[0].options.map((o) => o.id)).not.toContain("block:1,1");
    expect(qs[0].suggested).toBe(qs[0].options[0].id);
    expect(qs[0].options[0].label).toMatch(/avenue/i);
    for (const o of qs[0].options) expect(o.image).toMatch(/^data:image\/svg\+xml/);
    expect(qs[1].options.map((o) => o.id)).toEqual(["glass", "setback", "needle"]);
    const imgs = qs[1].options.map((o) => o.image);
    expect(new Set(imgs).size).toBe(3);
    expect(qs[2].options.length).toBe(3);
    expect(qs[2].options.some((o) => o.id === qs[2].suggested)).toBe(true);
  });

  test("a question is skipped when the brief gives the param", () => {
    const editor = makeEditor();
    const b = brief("A tall tower.");
    const v = validate({ style: "modern-tower", look: "needle", height: 120, site: "beside" }, b);
    expect(gen.choices!(v, ctxOf(editor, { brief: b }))).toEqual([]);
  });

  test("medieval roof thumbnails show a keep, not a Japanese roof", () => {
    const b = brief("A medieval keep.");
    const v = validate({ style: "medieval-keep", tiers: 3 }, b);
    const qs = gen.choices!(v, ctxOf(makeEditor(false), { brief: b }));
    expect(qs.map((q) => q.id)).toEqual(["roof"]);
    const svg = decodeURIComponent(qs[0].options[0].image!);
    expect(svg).not.toContain("Q18 22 24 12");
    expect(svg).toContain("<path d=\"M2");
    const jp = gen.choices!(validate({ style: "pagoda", tiers: 5 }, b), ctxOf(makeEditor(false), { brief: b }));
    expect(decodeURIComponent(jp[0].options[0].image!)).toContain("Q18 22 24 12");
  });
});

// ── Siting ────────────────────────────────────────────────────

describe("siting in a city", () => {
  test("candidates never include a park; the tower stands inside its block and city buildings make room", async () => {
    const city = cityFacts();
    const places = cityPlaces(city, (f) => ({ hx: f / 2, back: f / 2, front: f / 2 }), 10, { x: 0, z: 0 });
    for (const pl of places) expect(pl.block?.kind ?? "lot").toBe("lot");
    expect(places.map((p) => p.id)).toContain("beside");
    const beside = places.find((p) => p.id === "beside")!;
    expect(beside.at.x > city.groundRect.x1 || beside.at.x < city.groundRect.x0 || beside.at.z > city.groundRect.z1 || beside.at.z < city.groundRect.z0).toBe(true);

    for (const answer of places.map((p) => p.id)) {
      const editor = makeEditor();
      const before = editor.scene.nodes.size;
      const b = brief("A skyscraper.");
      const v = validate({ style: "modern-tower", footprint: 40, height: 150 }, b);
      const answers: ChoiceAnswers = { site: { optionIds: [answer] }, look: { optionIds: ["glass"] } };
      const res = await gen.run(v, answers, ctxOf(editor, { brief: b }));
      expect(editor.commands()).toBe(1);
      const site = siteOf(editor, res.nodeIds[0]);
      expect(site.params.site).toBe(answer);
      const r = site.facts.rect;
      const pl = places.find((p) => p.id === answer)!;
      if (pl.block) {
        const br = pl.block.rect;
        expect(r.x0).toBeGreaterThanOrEqual(br.x0 - 1e-6);
        expect(r.x1).toBeLessThanOrEqual(br.x1 + 1e-6);
        expect(r.z0).toBeGreaterThanOrEqual(br.z0 - 1e-6);
        expect(r.z1).toBeLessThanOrEqual(br.z1 + 1e-6);
        const side = Math.min(br.x1 - br.x0, br.z1 - br.z0);
        expect(site.facts.building!.footprint).toBeLessThanOrEqual(side * 0.7 + 1e-6);
        expect(site.facts.building!.block).toEqual([pl.block.i, pl.block.j]);
        // The center building is gone, the corner building stays.
        expect(editor.scene.nodes.has(`b${pl.block.i}${pl.block.j}a`)).toBe(false);
        expect(editor.scene.nodes.has(`b${pl.block.i}${pl.block.j}b`)).toBe(true);
        expect(res.summary).toMatch(/1 city building made room/);
        // Stands on the lot surface (a curb height above the street).
        const folder = editor.scene.nodes.get(res.nodeIds[0])!;
        expect(folder.transform.position.y).toBeGreaterThan(city.y);
        expect(editor.scene.nodes.size).toBe(before + res.nodeIds.length - 1);
      } else {
        expect(editor.scene.nodes.size).toBe(before + res.nodeIds.length);
      }
      expect(res.next!.length).toBeGreaterThanOrEqual(2);
      expect(res.next!.length).toBeLessThanOrEqual(4);
    }
  });

  test("the front of a block tower faces the avenue", async () => {
    const editor = makeEditor();
    const b = brief("A skyscraper.");
    const res = await gen.run(validate({ style: "modern-tower", height: 100 }, b), { site: { optionIds: ["block:1,0"] } }, ctxOf(editor, { brief: b }));
    const site = siteOf(editor, res.nodeIds[0]);
    // Block 1,0 lies north of the avenue (z = -15): its front faces +z (facing 0).
    expect(site.params.facing).toBe(0);
  });

  test("without a city: at the anchor, moved off another site", async () => {
    const editor = makeEditor(false);
    const other: SiteRecord = { v: 1, generator: "river", title: "River", params: {}, facts: { center: { x: 0, z: 0 }, rect: R(-10, -5, 10, 5), summary: "river" } };
    editor.scene.nodes.set("river", { id: "river", name: "River", transform: T(0, 0, 0), metadata: siteMetadata(other) });
    const b = brief("A pagoda.");
    const res = await gen.run(validate({ style: "pagoda", tiers: 5 }, b), {}, ctxOf(editor, { brief: b, anchor: { x: 1, z: 1 } }));
    const site = siteOf(editor, res.nodeIds[0]);
    const r = site.facts.rect;
    const hit = r.x0 < 10 && r.x1 > -10 && r.z0 < 5 && r.z1 > -5;
    expect(hit).toBe(false);
    expect(res.summary).toMatch(/beside River/);
  });
});

// ── Site record and replace ──────────────────────────────────

describe("site record and replace", () => {
  test("record params rebuild the same building with no question", async () => {
    const editor = makeEditor();
    const b = brief("A skyscraper.");
    const res = await gen.run(validate({ style: "modern-tower" }, b), { site: { optionIds: ["block:1,0"] }, look: { optionIds: ["setback"] }, height: { optionIds: ["120"] } }, ctxOf(editor, { brief: b }));
    const site = siteOf(editor, res.nodeIds[0]);
    for (const k of ["style", "look", "height", "tiers", "footprint", "colors", "detail", "seed", "surround", "plan", "facing", "at", "site"]) expect(site.params[k]).toBeDefined();
    expect(site.facts.summary).toMatch(/setback tower, 120 m tall, \d+ m wide, on block 1,0 of Small city/);
    expect(site.facts.adjustable).toContain("height 20-300 (now 120)");
    expect(site.facts.adjustable).toContain("look glass|setback|needle (setback)");
    expect(site.facts.building!.height).toBeCloseTo(120, 0);
    const again = validate({ ...site.params }, b);
    expect(gen.choices!(again, ctxOf(editor, { brief: b }))).toEqual([]);
  });

  test("replace with a height patch: taller, same look, same place, old nodes gone, one command", async () => {
    const editor = makeEditor();
    const b = brief("A skyscraper.");
    const first = await gen.run(validate({ style: "modern-tower" }, b), { site: { optionIds: ["block:1,0"] }, look: { optionIds: ["needle"] }, height: { optionIds: ["95"] } }, ctxOf(editor, { brief: b }));
    const old = siteOf(editor, first.nodeIds[0]);
    const merged = { ...old.params, height: 190 };
    const v = validate(merged, b);
    const ctx = ctxOf(editor, { brief: b, replace: old, anchor: old.facts.center });
    expect(gen.choices!(v, ctx)).toEqual([]);
    const commands = editor.commands();
    const res = await gen.run(v, {}, ctx);
    expect(editor.commands()).toBe(commands + 1);
    for (const id of first.nodeIds) expect(editor.scene.nodes.has(id)).toBe(false);
    const now = siteOf(editor, res.nodeIds[0]);
    expect(now.params.at).toEqual(old.params.at);
    expect(now.params.look).toBe("needle");
    expect(now.facts.height!).toBeGreaterThan(old.facts.height! * 1.9);
    expect(now.title).toBe(old.title);
    expect(res.summary).toMatch(/same place/);
    expect(readSites(editor as never).filter((s) => s.generator === "architecture").length).toBe(1);
  });

  test("replace asks only what ctx.ask names", async () => {
    const editor = makeEditor();
    const b = brief("A skyscraper.");
    const first = await gen.run(validate({ style: "modern-tower" }, b), { site: { optionIds: ["block:1,0"] } }, ctxOf(editor, { brief: b }));
    const old = siteOf(editor, first.nodeIds[0]);
    const plain = validate({ ...old.params }, b);
    expect(gen.choices!(plain, ctxOf(editor, { brief: b, replace: old, anchor: old.facts.center }))).toEqual([]);
    const { look: _look, ...rest } = old.params;
    const askLook = validate(rest, b);
    const qs = gen.choices!(askLook, ctxOf(editor, { brief: b, replace: old, anchor: old.facts.center, ask: ["look"] }));
    expect(qs.map((q) => q.id)).toEqual(["look"]);
    // A new look takes its own colors and keeps the place.
    const res = await gen.run(askLook, { look: { optionIds: ["setback"] } }, ctxOf(editor, { brief: b, replace: old, anchor: old.facts.center, ask: ["look"] }));
    const now = siteOf(editor, res.nodeIds[0]);
    expect(now.params.look).toBe("setback");
    expect(now.params.at).toEqual(old.params.at);
    expect((now.params.colors as Record<string, string>).accent).not.toBe((old.params.colors as Record<string, string>).accent);
    // Asking the site again ignores the stored place.
    const { site: _site, ...noSite } = old.params;
    const qs2 = gen.choices!(validate(noSite, b), ctxOf(editor, { brief: b, replace: now, anchor: now.facts.center, ask: ["site"] }));
    expect(qs2.map((q) => q.id)).toEqual(["site"]);
  });
});


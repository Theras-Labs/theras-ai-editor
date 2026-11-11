// Director v2 (plan docs/plans/realtime-ai-harness.md 5C): scene memory (sites), change in place
// (replace tasks), the question order of the popup, follow-ups and the plan thumbnails.
import { describe, expect, test } from "bun:test";
import type { EditorCore } from "@theras/editor-core";
import { validateBrief, buildDirectorSystemPrompt, briefTool } from "../src/lib/copilot/director/brief";
import { minimapImage, minimapSvg } from "../src/lib/copilot/director/minimap";
import { collectNext, collectQuestions, mergeReplaceParams, newDirectorMetrics, runDirector, withoutUnaskedTaste, type DirectorOutcome } from "../src/lib/copilot/director/run";
import { frameForSite } from "../src/lib/copilot/frame-site";
import { cityGenerator } from "../src/lib/copilot/director/generators/city";
import { riverGenerator } from "../src/lib/copilot/director/generators/river";
import { cityGroundAt, cityNear, readSites, sceneStyle, siteMetadata, siteNodeIds, siteObstacles, sitesToText, tallestHeight } from "../src/lib/copilot/director/site";
import type { Brief, BuiltSite, ChoiceQuestion, CitySiteFacts, Generator, SiteRecord } from "../src/lib/copilot/director/types";
import { collapseSites, type DigestNode } from "../src/lib/copilot/scene-digest";
import type { CopilotProvider } from "../src/lib/copilot/types";

const cityFacts: CitySiteFacts = {
  scale: 1,
  y: 0,
  streetsRect: { x0: -40, z0: -40, x1: 40, z1: 40 },
  groundRect: { x0: -48, z0: -48, x1: 48, z1: 48 },
  avenueAxis: "x",
  streets: [
    { id: 0, name: "Main Avenue", axis: "x", pos: 0, from: -40, to: 40, width: 26, carriage: 15, median: 3, avenue: true },
    { id: 1, name: "North Street", axis: "x", pos: -36, from: -40, to: 40, width: 13, carriage: 7, median: 0, avenue: false }
  ],
  blocks: [
    { i: 0, j: 0, rect: { x0: -30, z0: -30, x1: -8, z1: -13 }, kind: "lot", zone: "downtown", tallest: 34 },
    { i: 1, j: 0, rect: { x0: 8, z0: -30, x1: 30, z1: -13 }, kind: "park", zone: "park", tallest: 0 }
  ],
  kit: "commercial",
  trees: "nature:tree:oak-round"
};

const cityRecord: SiteRecord = {
  v: 1,
  generator: "city",
  title: "City",
  params: { size: "neighborhood", kit: "commercial", at: { x: 0, z: 0 }, seed: 7 },
  facts: {
    center: { x: 0, z: 0 },
    rect: cityFacts.groundRect,
    height: 34,
    style: "modern downtown city",
    summary: "2 x 2 blocks, downtown, oak street trees, tallest 34 m",
    adjustable: "size neighborhood|town|city|metropolis (now neighborhood)",
    city: cityFacts
  }
};

const towerRecord: SiteRecord = {
  v: 1,
  generator: "architecture",
  title: "Tower",
  params: { style: "modern-tower", height: 96, look: "glass", colors: { walls: "#d6d8d6", roof: "#6f7780" }, at: { x: -19, z: -21 } },
  facts: { center: { x: -19, z: -21 }, rect: { x0: -26, z0: -28, x1: -12, z1: -14 }, height: 96, style: "modern glass tower", summary: "glass tower, 96 m tall", adjustable: "height 20-300 (now 96)" }
};

type FakeNode = { id: string; parentId?: string; metadata?: Record<string, string | number | boolean> };

function fakeEditor(nodes: FakeNode[]): EditorCore {
  return { scene: { nodes: new Map(nodes.map((n) => [n.id, n])) } } as unknown as EditorCore;
}

const sceneNodes: FakeNode[] = [
  { id: "node:group:1", metadata: siteMetadata(cityRecord) },
  { id: "node:resource:street:1", parentId: "node:group:1" },
  { id: "node:resource:building-a:1", parentId: "node:group:1" },
  { id: "node:group:2", metadata: siteMetadata(towerRecord) },
  { id: "node:resource:architecture:1", parentId: "node:group:2" },
  { id: "node:resource:bench:1" }
];

describe("sites: the memory of what generators built", () => {
  test("a record written with siteMetadata reads back with its folder id", () => {
    const sites = readSites(fakeEditor(sceneNodes));
    expect(sites.map((s) => s.id)).toEqual(["node:group:1", "node:group:2"]);
    expect(sites[0].facts.city?.blocks.length).toBe(2);
    expect(tallestHeight(sites)).toBe(96);
  });

  test("siteNodeIds lists the folder and its parts, parts first", () => {
    expect(siteNodeIds(fakeEditor(sceneNodes), "node:group:1")).toEqual(["node:resource:street:1", "node:resource:building-a:1", "node:group:1"]);
    expect(siteNodeIds(fakeEditor(sceneNodes), "node:group:9")).toEqual([]);
  });

  test("the [Built] text has one line for each site, its facts, what can change, and the scene style", () => {
    const text = sitesToText(readSites(fakeEditor(sceneNodes)));
    expect(text).toContain("node:group:1 | City | city | 0,0 | 96 x 96 m, 34 m tall | 2 x 2 blocks");
    expect(text).toContain("change: height 20-300 (now 96)");
    expect(text).toContain("[Scene style: modern downtown city; modern glass tower");
    expect(sitesToText([])).toBe("");
    expect(sceneStyle(readSites(fakeEditor(sceneNodes)))).toContain("tallest building 96 m");
  });

  test("cityNear finds the city under or beside a point, not one far away", () => {
    const sites = readSites(fakeEditor(sceneNodes));
    expect(cityNear(sites, { x: 10, z: 10 })?.id).toBe("node:group:1");
    expect(cityNear(sites, { x: 60, z: 0 })?.id).toBe("node:group:1");
    expect(cityNear(sites, { x: 400, z: 0 })).toBeUndefined();
  });

  test("the digest folds a site to one line and keeps other nodes", () => {
    const sites = readSites(fakeEditor(sceneNodes));
    const membership = new Map<string, string>();
    for (const s of sites) for (const id of siteNodeIds(fakeEditor(sceneNodes), s.id)) membership.set(id, s.id);
    const digest: DigestNode[] = sceneNodes.map((n) => ({ id: n.id, name: n.id, kind: "folder", position: { x: 0, y: 0, z: 0 }, size: "-" }));
    const out = collapseSites(digest, sites, membership);
    expect(out.map((n) => n.id)).toEqual(["node:group:1", "node:group:2", "node:resource:bench:1"]);
    expect(out[0].kind).toBe("built city (2 parts, see [Built])");
    expect(out[1].size).toBe("14x96x14");
  });
});

describe("small things keep off the roads and the water", () => {
  test("street surfaces and river water become rows of circles; sidewalks and lots stay free", () => {
    const river: BuiltSite = {
      v: 1,
      id: "node:group:3",
      generator: "river",
      title: "River",
      params: {},
      facts: { center: { x: 0, z: -55 }, rect: { x0: -70, z0: -58, x1: 70, z1: -52 }, summary: "river", river: { points: [[-70, -55], [70, -55]], width: 4, style: "clear-lake" } }
    };
    const sites = [...readSites(fakeEditor(sceneNodes)), river];
    const obstacles = siteObstacles(sites);
    const hit = (x: number, z: number) => obstacles.some((o) => Math.hypot(o.position.x - x, o.position.z - z) < o.radius);
    expect(hit(10, 0)).toBe(true); // the avenue carriageway
    expect(hit(-35, 3)).toBe(true);
    expect(hit(0, -36)).toBe(true); // North Street
    expect(hit(-19, -21)).toBe(false); // inside a block
    expect(hit(0, 11.5)).toBe(false); // the avenue sidewalk (carriage 15 m: the surface ends at 7.5 m)
    expect(hit(20, -55)).toBe(true); // the river
    expect(hit(20, -50)).toBe(false); // its bank
    expect(obstacles.every((o) => o.kind === "street surface" || o.kind === "river course")).toBe(true);
  });

  test("inside a city the ground for props is the sidewalk level; outside it is not a city ground", () => {
    const sites = readSites(fakeEditor(sceneNodes));
    expect(cityGroundAt(sites, 5, 5)).toBeCloseTo(0.17);
    expect(cityGroundAt(sites, 200, 5)).toBeNull();
  });
});

describe("replace tasks: a change in place", () => {
  const site: BuiltSite = { ...towerRecord, id: "node:group:2" };

  test("the task's params go over the stored params; a color record merges one level deep", () => {
    const merged = mergeReplaceParams({ generator: "architecture", title: "Tower", params: { height: 190, colors: { roof: "#111111" } }, replace: site.id }, site);
    expect(merged.height).toBe(190);
    expect(merged.look).toBe("glass");
    expect(merged.at).toEqual({ x: -19, z: -21 });
    expect(merged.colors).toEqual({ walls: "#d6d8d6", roof: "#111111" });
  });

  test("validateBrief keeps ask only with replace", () => {
    const { brief } = validateBrief({
      mode: "build",
      understanding: "Another look.",
      tasks: [
        { generator: "architecture", title: "Tower", replace: "node:group:2", ask: ["look"], params: {} },
        { generator: "city", title: "City", ask: ["size"], params: {} }
      ]
    });
    expect(brief.tasks[0].ask).toEqual(["look"]);
    expect(brief.tasks[1].ask).toBeUndefined();
  });

  test("another generator at the same place gets only its own params", () => {
    expect(mergeReplaceParams({ generator: "river", title: "River", params: { width: 4 }, replace: site.id }, site)).toEqual({ width: 4 });
  });

  test("validateBrief keeps replace; the tool schema and the prompt name it", () => {
    const { brief } = validateBrief({ mode: "build", understanding: "Taller.", tasks: [{ generator: "architecture", title: "Tower", replace: "node:group:2", params: { height: 190 } }] });
    expect(brief.tasks[0].replace).toBe("node:group:2");
    const schema = JSON.stringify(briefTool(["compose", "architecture"]));
    expect(schema).toContain('"replace"');
    const prompt = buildDirectorSystemPrompt([{ id: "compose", describe: "c" }]);
    expect(prompt).toContain("replace = its id");
    expect(prompt).toContain("Scope and place of a big thing belong to the user");
    expect(prompt).toContain("Fit the scene.");
  });

  test("runDirector: merged params, the site's center as the anchor, ctx.replace set, no popup when the generator asks nothing", async () => {
    const seen: { params: Record<string, unknown>; anchor: { x: number; z: number }; replace?: string; sites: number; choiceReplace?: string }[] = [];
    const generator: Generator = {
      id: "architecture",
      describe: "a",
      validate: (params) => ({ ...params }),
      choices: (_params, ctx) => {
        seen.push({ params: {}, anchor: ctx.anchor, sites: ctx.sites.length, choiceReplace: ctx.replace?.id });
        return ctx.replace ? [] : [{ id: "look", title: "Which look?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], suggested: "a" }];
      },
      run: async (params, _answers, ctx) => {
        seen.push({ params, anchor: ctx.anchor, replace: ctx.replace?.id, sites: ctx.sites.length });
        return { nodeIds: ["n1"], summary: "Raised the tower.", next: [{ label: "Make it taller", prompt: "Make the tower taller" }] };
      }
    };
    const brief: Brief = { mode: "build", understanding: "I will raise the tower from 96 m to 190 m.", tasks: [{ generator: "architecture", title: "Tower", params: { height: 190 }, replace: "node:group:2" }] };
    const popups: ChoiceQuestion[][] = [];
    const provider: CopilotProvider = { generateContent: async () => ({ text: "", toolCalls: [], rawParts: [] }) };
    const outcome: DirectorOutcome = await runDirector({
      editor: fakeEditor(sceneNodes),
      prompt: "not tall enough, make it more taller",
      history: [],
      provider,
      providerConfig: { apiKey: "", model: "", temperature: 0.3 },
      context: "",
      anchor: { x: 50, z: 50 },
      generators: [generator],
      signal: new AbortController().signal,
      onUpdate: () => {},
      metrics: newDirectorMetrics(performance.now()),
      requestBrief: async () => ({ brief, notes: [], ms: 1, raw: brief }),
      requestChoices: async (_t, questions) => {
        popups.push(questions);
        return {};
      }
    });
    expect(popups.length).toBe(0);
    expect(seen[0].choiceReplace).toBe("node:group:2");
    const run = seen[1];
    expect(run.params.height).toBe(190);
    expect(run.params.look).toBe("glass");
    expect(run.anchor).toEqual({ x: -19, z: -21 });
    expect(run.replace).toBe("node:group:2");
    expect(run.sites).toBe(2);
    if (outcome.kind !== "done") throw new Error("expected done");
    const last = outcome.session.messages.at(-1)!;
    expect(last.content).toContain("Raised the tower.");
    expect(last.suggestions).toEqual([{ label: "Make it taller", prompt: "Make the tower taller" }]);
  });

  test("runDirector: a replace id that is not in the scene is reported, nothing runs", async () => {
    let runs = 0;
    const generator: Generator = { id: "architecture", describe: "a", validate: (p) => p, run: async () => ({ nodeIds: [(runs++, "n")], summary: "x" }) };
    const brief: Brief = { mode: "build", understanding: "Taller.", tasks: [{ generator: "architecture", title: "Tower", params: { height: 190 }, replace: "node:group:77" }] };
    const outcome = await runDirector({
      editor: fakeEditor(sceneNodes),
      prompt: "taller",
      history: [],
      provider: { generateContent: async () => ({ text: "", toolCalls: [], rawParts: [] }) },
      providerConfig: { apiKey: "", model: "", temperature: 0.3 },
      context: "",
      anchor: { x: 0, z: 0 },
      generators: [generator],
      signal: new AbortController().signal,
      onUpdate: () => {},
      metrics: newDirectorMetrics(performance.now()),
      requestBrief: async () => ({ brief, notes: [], ms: 1, raw: brief })
    });
    expect(runs).toBe(0);
    if (outcome.kind !== "done") throw new Error("expected done");
    expect(outcome.session.messages.at(-1)?.content).toContain("is not in the scene");
  });
});

describe("the popup asks scope and place first", () => {
  const q = (id: string, kind?: "map" | "taste"): ChoiceQuestion => ({ id, title: id, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], suggested: "a", ...(kind ? { kind } : {}) });
  const gen = (id: Generator["id"]): Generator => ({ id, describe: "", validate: (p) => p, run: async () => ({ nodeIds: [], summary: "" }) });

  test("map questions of every task come before taste questions; the limit cuts taste first", () => {
    const plan = [
      { task: { generator: "city" as const, title: "City", params: {} }, generator: gen("city"), params: {} },
      { task: { generator: "river" as const, title: "River", params: {} }, generator: gen("river"), params: {} }
    ];
    const byTask = [[q("buildings"), q("size", "map"), q("trees")], [q("route", "map"), q("water")]];
    const { questions, owner } = collectQuestions(plan, (p) => byTask[plan.indexOf(p)]);
    expect(questions.map((x) => x.id)).toEqual(["size", "route", "buildings", "trees"]);
    expect(owner.get("route")).toEqual({ task: 1, id: "route" });
    expect(owner.has("water")).toBe(false);
  });
});

describe("follow-ups", () => {
  test("one from each result first, no double labels, 4 at most, none from a failed build", () => {
    const next = collectNext([
      { nodeIds: ["a"], summary: "", next: [{ label: "Make it bigger", prompt: "Make the city bigger" }, { label: "Add a river", prompt: "Add a river to the city" }, { label: "Add a tower", prompt: "Add a tower" }] },
      { nodeIds: ["b"], summary: "", next: [{ label: "Make it wider", prompt: "Make the river wider" }, { label: "Add a river", prompt: "again" }, { label: "Add trees", prompt: "Add trees" }] },
      { nodeIds: [], summary: "", next: [{ label: "Never", prompt: "never" }] },
      undefined
    ]);
    expect(next.map((n) => n.label)).toEqual(["Make it bigger", "Make it wider", "Add a river", "Add a tower"]);
  });
});

describe("plan thumbnails", () => {
  test("the map draws the city, the proposal line and the highlighted lot", () => {
    const svg = minimapSvg({ cities: [cityFacts], lines: [{ points: [[-60, -52], [60, -52]], width: 4 }], rects: [{ rect: cityFacts.blocks[0].rect }] });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("#3b8fd6");
    expect(svg).toContain("#ff8a3d");
    expect(svg).toContain("#5aa862");
    expect(minimapImage({ cities: [cityFacts] }).startsWith("data:image/svg+xml")).toBe(true);
  });

  test("an empty map still renders", () => {
    expect(minimapSvg({})).toContain("</svg>");
  });
});

describe("taste stays with the user", () => {
  test("a kit or tree species that the director set by itself is dropped; the user's own words keep it", () => {
    const params = { kit: "mixed", streetTrees: "none", seed: 3 };
    expect(withoutUnaskedTaste(cityGenerator, params, "create a city", false)).toEqual({ params: { seed: 3 }, dropped: ["kit", "streetTrees"] });
    expect(withoutUnaskedTaste(cityGenerator, params, "create an industrial city with no trees", false).dropped).toEqual([]);
    expect(withoutUnaskedTaste(cityGenerator, params, "build this city", true).dropped).toEqual([]);
  });

  test("a river course that the director invented is dropped; a course the user stated stays", () => {
    const params = { from: { x: -80, z: -80 }, to: { x: 80, z: 80 } };
    expect(withoutUnaskedTaste(riverGenerator, params, "then create it", false).dropped).toEqual(["from", "to"]);
    expect(withoutUnaskedTaste(riverGenerator, params, "add a river to the city", false).dropped).toEqual(["from", "to"]);
    expect(withoutUnaskedTaste(riverGenerator, params, "add a river along the east edge", false).dropped).toEqual([]);
    expect(withoutUnaskedTaste(riverGenerator, { style: "anime" }, "add a river", false).dropped).toEqual(["style"]);
    expect(withoutUnaskedTaste(riverGenerator, { style: "anime" }, "add an anime river", false).dropped).toEqual([]);
    // The width comes from the scene unless the user gives a size word or a number.
    expect(withoutUnaskedTaste(riverGenerator, { width: 3 }, "add river", false).dropped).toEqual(["width"]);
    expect(withoutUnaskedTaste(riverGenerator, { width: 3 }, "add a narrow creek", false).dropped).toEqual([]);
  });
});

describe("the camera shows what was built", () => {
  const city = { center: { x: 0, z: 0 }, rect: { x0: -93, z0: -122, x1: 93, z1: 122 }, height: 44 };

  test("a camera inside a new city moves out and looks at its center", () => {
    const pose = frameForSite({ position: { x: 18, y: 14, z: 18 }, target: { x: 0, y: 1.5, z: 0 }, fov: 50 }, city);
    if (!pose) throw new Error("expected a new pose");
    expect(pose.target.x).toBe(0);
    const dist = Math.hypot(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z);
    expect(dist).toBeGreaterThan(250);
    expect(pose.position.y).toBeGreaterThan(100);
    // The compass direction of the view is kept (+x, +z).
    expect(pose.position.x).toBeGreaterThan(0);
    expect(pose.position.z).toBeGreaterThan(0);
  });

  test("a view that already shows the thing does not move", () => {
    const tower = { center: { x: 10, z: 10 }, rect: { x0: 3, z0: 3, x1: 17, z1: 17 }, height: 96 };
    expect(frameForSite({ position: { x: 150, y: 120, z: 150 }, target: { x: 0, y: 20, z: 0 }, fov: 50 }, tower)).toBeNull();
  });

  test("a thing built far from the view is framed", () => {
    const tower = { center: { x: 400, z: 0 }, rect: { x0: 393, z0: -7, x1: 407, z1: 7 }, height: 96 };
    expect(frameForSite({ position: { x: 18, y: 14, z: 18 }, target: { x: 0, y: 1.5, z: 0 }, fov: 50 }, tower)?.target.x).toBe(400);
  });
});

// Tests for changes to a modeled object (plan 5E): the record that is read back from the scene,
// "bigger" in place with no model call, copies of one model as a wall around another thing,
// colors, a change of shape by the modeler, and the replace lookup of the director.
// The failure these tests come from (2026-11-11): "that's too small. so build giant cactus as a
// wall for puddle" answered: "node:resource:parts:2" is not in the scene, so there is nothing to change.
// Run: cd apps/editor && bun test tests/object-change.test.ts
import { describe, expect, test } from "bun:test";
import { MODELER_SYSTEM_PROMPT, prepareSpec, type PartsSpec } from "../src/lib/generators/parts";
import { buildDirectorSystemPrompt } from "../src/lib/copilot/director/brief";
import { objectGenerator, planCopies, swapColors } from "../src/lib/copilot/director/generators/object";
import { objectFactsOf, objectMembership, objectNodeIds, readObjects, subjectAlone, subjectChanged } from "../src/lib/copilot/director/objects";
import { mergeReplaceParams, newDirectorMetrics, runDirector } from "../src/lib/copilot/director/run";
import { sceneStyle, siteMetadata, sitesToText, tallestHeight } from "../src/lib/copilot/director/site";
import type { Brief, BuiltSite, DirectorContext, Generator, SiteRecord } from "../src/lib/copilot/director/types";

// ── Fixtures ──────────────────────────────────────────────────

const CACTUS_RAW = {
  name: "Cactus cluster",
  size: [3, 2.6, 2.4],
  palette: [
    { role: "body", hex: "#5f8f4f" },
    { role: "spine", hex: "#e8e0c0" },
    { role: "flower", hex: "#e0508a" }
  ],
  stages: [
    {
      name: "Trunks",
      parts: [
        { name: "main trunk", shape: "capsule", at: [0, 1.2, 0], r: 0.35, h: 1.8, color: "body" },
        { name: "left trunk", shape: "capsule", at: [-1.0, 0.7, 0.3], r: 0.28, h: 0.9, color: "body" },
        { name: "right trunk", shape: "capsule", at: [0.9, 0.65, -0.4], r: 0.26, h: 0.8, color: "body" }
      ]
    },
    {
      name: "Arms and flowers",
      parts: [
        { name: "arm", shape: "capsule", at: [0.5, 1.4, 0], r: 0.16, h: 0.6, color: "body" },
        { name: "flower", shape: "ellipsoid", at: [0, 2.3, 0], size: [0.3, 0.2, 0.3], color: "flower" },
        { name: "stone", shape: "ellipsoid", at: [0.2, 0.1, 0.8], size: [0.5, 0.2, 0.4], color: "spine" }
      ]
    }
  ]
};

const PUDDLE_RAW = {
  name: "Puddle",
  size: [4.4, 0.1, 4.0],
  palette: [
    { role: "water", hex: "#4f8fb0" },
    { role: "mud", hex: "#8a6a4a" },
    { role: "edge", hex: "#b89a70" }
  ],
  stages: [
    {
      name: "Water",
      parts: [
        { name: "mud rim", shape: "cylinder", at: [0, 0.03, 0], r: 2.2, h: 0.06, sides: 14, color: "mud" },
        { name: "water", shape: "cylinder", at: [0, 0.06, 0], r: 1.9, h: 0.06, sides: 14, color: "water" },
        { name: "edge stone", shape: "ellipsoid", at: [1.9, 0.08, 0.4], size: [0.4, 0.16, 0.3], color: "edge" }
      ]
    }
  ]
};

function specOf(raw: unknown): PartsSpec {
  const prepared = prepareSpec(raw);
  if ("error" in prepared) throw new Error(prepared.error);
  return prepared.spec;
}
const CACTUS = specOf(CACTUS_RAW);
const PUDDLE = specOf(PUDDLE_RAW);

type Node = {
  id: string;
  name: string;
  kind: string;
  parentId?: string;
  data: Record<string, unknown>;
  transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } };
  metadata?: Record<string, unknown>;
};

const T = (x: number, y: number, z: number, s = 1) => ({ position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: s, y: s, z: s } });

/** A node as the object generator made it BEFORE objects had a record (no metadata.object). */
const partsNode = (id: string, spec: PartsSpec, at: [number, number, number], footprint: number, extra: Record<string, unknown> = {}): Node => ({
  id,
  name: spec.name,
  kind: "group",
  data: {},
  transform: T(...at),
  metadata: { resource: "gen:parts", seed: 7, params: JSON.stringify({ spec }), footprint, ...extra }
});

function makeEditor(nodes: Node[]) {
  const map = new Map<string, Node>(nodes.map((n) => [n.id, n]));
  let commands = 0;
  const scene = {
    nodes: map,
    entities: new Map(),
    materials: new Map(),
    settings: {},
    addNode: (n: Node) => map.set(n.id, n),
    removeNode: (id: string) => map.delete(id),
    getNode: (id: string) => map.get(id)
  };
  return {
    scene,
    selection: { ids: [] as string[] },
    commands: { done: [] as unknown[] },
    execute: (cmd: { execute: (s: typeof scene) => void }) => (commands++, cmd.execute(scene)),
    count: () => commands
  };
}
type Editor = ReturnType<typeof makeEditor>;

const CACTUS_ID = "node:resource:parts:2";
const PUDDLE_ID = "node:resource:parts:1";

/** The scene of the failed request: a modeled puddle and a small modeled cactus beside it. */
const desert = () => makeEditor([partsNode(PUDDLE_ID, PUDDLE, [20, 0.4, -7], 2.2), partsNode(CACTUS_ID, CACTUS, [14, 0.4, -7], 1.6)]);

const brief = (understanding = "Change it."): Brief => ({ mode: "build", understanding, tasks: [] });

function ctxOf(editor: Editor, replace: BuiltSite | undefined, callModel?: DirectorContext["callModel"]): DirectorContext & { steps: string[] } {
  const steps: string[] = [];
  return {
    editor: editor as never,
    prompt: "that's too small . so build giant cactus as a wall for puddle.",
    brief: brief(),
    anchor: replace ? { ...replace.facts.center } : { x: 0, z: 0 },
    sites: [],
    ...(replace ? { replace } : {}),
    step: (label, detail) => steps.push(`${label}: ${detail ?? ""}`),
    pause: async () => {},
    callModel:
      callModel ??
      (async () => {
        throw new Error("the modeler must not be called for this change");
      }),
    steps
  };
}

/** Runs a replace task on an object the way run.ts does: merge, validate, run. */
async function change(editor: Editor, id: string, params: Record<string, unknown>, callModel?: DirectorContext["callModel"]) {
  const old = readObjects(editor as never).find((o) => o.id === id);
  if (!old) throw new Error(`no object ${id}`);
  const merged = mergeReplaceParams({ generator: "object", title: "Giant Cactus Wall", params, replace: id }, old);
  const valid = objectGenerator.validate(merged, brief());
  if (typeof valid === "string") throw new Error(valid);
  const ctx = ctxOf(editor, old, callModel);
  const result = await objectGenerator.run(valid, {}, ctx);
  return { result, ctx, old };
}

const paramsOf = (n: Node) => JSON.parse(String(n.metadata!.params)) as { spec: PartsSpec; sizeMeters?: number };
const partsNodes = (editor: Editor) => [...editor.scene.nodes.values()].filter((n) => n.metadata?.resource === "gen:parts");

// ── The record ────────────────────────────────────────────────

describe("modeled objects are read back from the scene", () => {
  test("an object made before the record existed is found by its node id, with its size and change list", () => {
    const objects = readObjects(desert() as never);
    expect(objects.map((o) => o.id)).toEqual([PUDDLE_ID, CACTUS_ID]);
    const cactus = objects[1]!;
    expect(cactus.generator).toBe("object");
    expect(cactus.title).toBe("Cactus cluster");
    expect(cactus.params.subject).toBe("Cactus cluster");
    expect(cactus.params.sizeMeters).toBe(3);
    expect(cactus.params.count).toBe(1);
    expect(cactus.facts.center).toEqual({ x: 14, z: -7 });
    expect(cactus.facts.adjustable).toContain("sizeMeters 3 (0.1-60");
    expect(cactus.facts.adjustable).toContain("body #5f8f4f");
    expect(cactus.facts.summary).toContain("modeled object");
  });

  test("the size follows a fit size and a node scale", () => {
    const node = partsNode(CACTUS_ID, CACTUS, [0, 0, 0], 1.6);
    node.metadata!.params = JSON.stringify({ spec: CACTUS, sizeMeters: 6 });
    node.transform = T(0, 0, 0, 1.5);
    const facts = objectFactsOf(node)!;
    expect(facts.longest).toBeCloseTo(9, 5);
    expect(facts.footprint).toBeCloseTo(2.4, 5);
    expect(facts.height).toBeCloseTo((CACTUS.size[1] / 3) * 9, 5);
  });

  test("the [Built] text lists the object after the big things, and it is not a building", () => {
    const tower: BuiltSite = {
      v: 1,
      id: "node:group:2",
      generator: "architecture",
      title: "Tower",
      params: {},
      facts: { center: { x: 0, z: 0 }, rect: { x0: -5, z0: -5, x1: 5, z1: 5 }, height: 40, style: "glass tower", summary: "glass tower, 40 m tall" }
    };
    const giant: BuiltSite = { ...readObjects(desert() as never)[1]!, facts: { ...readObjects(desert() as never)[1]!.facts, height: 90 } };
    const text = sitesToText([giant, tower]);
    expect(text.indexOf("node:group:2")).toBeLessThan(text.indexOf(CACTUS_ID));
    expect(text).toContain(`${CACTUS_ID} | Cactus cluster | object`);
    expect(tallestHeight([giant, tower])).toBe(40);
    expect(sceneStyle([giant, tower])).toContain("tallest building 40 m");
  });

  test("the director prompt says how to change a modeled object", () => {
    const prompt = buildDirectorSystemPrompt([{ id: "object", describe: objectGenerator.describe }]);
    expect(prompt).toContain("Modeled objects are in [Built] too");
    expect(prompt).toContain("closed");
    expect(objectGenerator.describe.length).toBeLessThanOrEqual(600);
  });
});

describe("the same thing or another thing", () => {
  test("size and arrangement words are not a new subject", () => {
    expect(subjectChanged("Cactus cluster", "giant cactus wall")).toBe(false);
    expect(subjectChanged("Cactus cluster", "a huge wall of cacti around the puddle")).toBe(false);
    expect(subjectChanged("small propeller airplane", "big airplane")).toBe(false);
  });
  test("a new trait or another thing is a new subject", () => {
    expect(subjectChanged("Cactus cluster", "giant saguaro cactus with pink flowers")).toBe(true);
    expect(subjectChanged("Cactus cluster", "palm tree")).toBe(true);
  });
});

describe("the subject is the object alone", () => {
  test("the place and the neighbors are cut from the subject", () => {
    expect(subjectAlone("A natural desert cactus with a central column and two upward arms, beside the rain puddle")).toBe("A natural desert cactus with a central column and two upward arms");
    expect(subjectAlone("saguaro cactus next to the puddle")).toBe("saguaro cactus");
    expect(subjectAlone("small red propeller airplane")).toBe("small red propeller airplane");
    expect(subjectAlone("market stall with a striped awning")).toBe("market stall with a striped awning");
    expect(subjectAlone("lighthouse on the hill near the harbor")).toBe("lighthouse");
  });
  test("validate stores the object alone, and the modeler is told to model only the subject", () => {
    const v = objectGenerator.validate({ subject: "a cactus beside the rain puddle", around: PUDDLE_ID }, brief()) as Record<string, unknown>;
    expect(v.subject).toBe("a cactus");
    expect(v.around).toBe(PUDDLE_ID);
    expect(MODELER_SYSTEM_PROMPT).toContain("ONLY THE SUBJECT");
  });
});

// ── Copies: the plan ──────────────────────────────────────────

describe("copies of one model", () => {
  test("a closed ring takes its count from the ring length and packs the copies", () => {
    const plan = planCopies({ arrange: "ring", closed: true, footprint: 4, anchorRadius: 2.2 });
    expect(plan.pattern).toBe("ring");
    expect(plan.closed).toBe(true);
    expect(plan.radius).toBeCloseTo(2.2 + 4 * 0.85 + 0.3, 5);
    expect(plan.footprint).toBeCloseTo(2.4, 5);
    // Neighbors stand closer than two bounding radii, so the wall has no gaps.
    const spacing = (2 * Math.PI * plan.radius!) / plan.count;
    expect(spacing).toBeLessThan(2 * 4);
    expect(plan.count).toBeGreaterThanOrEqual(5);
    expect(plan.gaps).toBe(false);
  });
  test("a ring that 24 copies cannot close says so", () => {
    const plan = planCopies({ arrange: "ring", closed: true, footprint: 0.5, anchorRadius: 30 });
    expect(plan.count).toBe(24);
    expect(plan.gaps).toBe(true);
  });
  test("an open ring, a row and a group have sensible counts; an asked count wins", () => {
    expect(planCopies({ arrange: "ring", closed: false, footprint: 1, anchorRadius: 3 }).count).toBeGreaterThanOrEqual(5);
    expect(planCopies({ arrange: "ring", closed: false, count: 9, footprint: 1, anchorRadius: 3 }).count).toBe(9);
    expect(planCopies({ arrange: "row", closed: false, footprint: 1, anchorRadius: 0 }).count).toBe(5);
    expect(planCopies({ arrange: "cluster", closed: false, footprint: 1, anchorRadius: 0 }).count).toBe(3);
    expect(planCopies({ arrange: "cluster", closed: false, count: 99, footprint: 1, anchorRadius: 0 }).count).toBe(24);
  });
  test("validate reads wall and fence as a closed ring", () => {
    const v = objectGenerator.validate({ subject: "cactus", arrange: "wall", around: PUDDLE_ID, vary: true, count: 0 }, brief()) as Record<string, unknown>;
    expect(v.arrange).toBe("ring");
    expect(v.closed).toBe(true);
    expect(v.around).toBe(PUDDLE_ID);
    expect(v.vary).toBe(true);
    expect(v.count).toBeUndefined();
  });
  test("colors go to the palette roles; an unknown role changes nothing", () => {
    const a = swapColors(CACTUS, { Body: "#224466", trunk: "#000000" });
    expect(a.roles).toEqual(["body"]);
    expect(a.spec.palette.body).toBe("#224466");
    expect(CACTUS.palette.body).toBe("#5f8f4f");
    expect(swapColors(CACTUS, { trunk: "#000000" }).roles).toEqual([]);
  });
});

// ── The changes, on the scene of the failed request ───────────

describe("a change to a modeled object", () => {
  test("bigger: the same node, the same place, no model call, one undo step", async () => {
    const editor = desert();
    const { result, ctx } = await change(editor, CACTUS_ID, { sizeMeters: 10 });
    expect(result.nodeIds).toEqual([CACTUS_ID]);
    const node = editor.scene.getNode(CACTUS_ID)!;
    expect(node.transform.position).toEqual({ x: 14, y: 0.4, z: -7 });
    expect(paramsOf(node).sizeMeters).toBe(10);
    expect(paramsOf(node).spec.name).toBe("Cactus cluster");
    expect(Number(node.metadata!.footprint)).toBeGreaterThan(3);
    expect(result.summary).toContain("bigger in place");
    expect(result.summary).toContain("from 3 m to 10 m");
    expect(result.summary).toContain("no new model was made");
    expect(ctx.steps[0]).toContain("no new model call");
    expect(editor.count()).toBe(1);
    expect(partsNodes(editor).length).toBe(2);
    // The record now says 10 m, so "bigger" again starts from there.
    expect(readObjects(editor as never).find((o) => o.id === CACTUS_ID)!.params.sizeMeters).toBe(10);
  });

  test("the same size again changes nothing and says so", async () => {
    const editor = desert();
    const { result } = await change(editor, CACTUS_ID, { sizeMeters: 3 });
    expect(editor.count()).toBe(0);
    expect(result.summary).toContain("nothing changed");
  });

  test("a node that was scaled by hand keeps its scale; the size asked is the size in the world", async () => {
    const editor = desert();
    editor.scene.getNode(CACTUS_ID)!.transform = T(14, 0.4, -7, 2);
    const { result } = await change(editor, CACTUS_ID, { sizeMeters: 12 });
    const node = editor.scene.getNode(CACTUS_ID)!;
    expect(node.transform.scale.x).toBe(2);
    expect(paramsOf(node).sizeMeters).toBe(6);
    expect(result.summary).toContain("from 6 m to 12 m");
  });

  test("giant and a wall around the puddle: copies of the same model in a closed ring around it", async () => {
    const editor = desert();
    const { result } = await change(editor, CACTUS_ID, { sizeMeters: 8, arrange: "wall", around: PUDDLE_ID, vary: true });
    expect(editor.count()).toBe(1);
    expect(editor.scene.getNode(CACTUS_ID)).toBeUndefined();
    const folderId = result.nodeIds[0]!;
    const folder = editor.scene.getNode(folderId)!;
    expect(typeof folder.metadata!.objectGroup).toBe("string");
    const copies = partsNodes(editor).filter((n) => n.parentId === folderId);
    expect(copies.length).toBeGreaterThanOrEqual(5);
    expect(copies.length).toBe(result.nodeIds.length - 1);
    // Every copy is the same model at 8 m, and stands outside the puddle, around its center.
    const distances = copies.map((c) => Math.hypot(c.transform.position.x - 20, c.transform.position.z + 7));
    for (const c of copies) {
      expect(paramsOf(c).spec.name).toBe("Cactus cluster");
      expect(paramsOf(c).sizeMeters).toBe(8);
    }
    expect(Math.min(...distances)).toBeGreaterThan(2.2);
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(4);
    // The copies go all the way round: no sixth of the circle is empty.
    const sectors = new Set(copies.map((c) => Math.floor(((Math.atan2(c.transform.position.x - 20, c.transform.position.z + 7) + Math.PI) / (2 * Math.PI)) * 6) % 6));
    expect(sectors.size).toBe(6);
    expect(result.summary).toContain('around "Puddle"');
    expect(result.summary).toContain("closed ring");
    expect(result.summary).toContain("no new model was made");
    // The puddle is still there, and the wall is ONE thing for the next change.
    const objects = readObjects(editor as never);
    expect(objects.map((o) => o.id)).toEqual([PUDDLE_ID, folderId]);
    const wall = objects[1]!;
    expect(wall.params.count).toBe(copies.length);
    expect(wall.params.arrange).toBe("ring");
    expect(wall.params.closed).toBe(true);
    expect(wall.params.around).toBe(PUDDLE_ID);
    expect(objectNodeIds(editor as never, folderId).length).toBe(copies.length + 1);
    expect(objectMembership(editor as never, objects).get(copies[0]!.id)).toBe(folderId);
  });

  test("the wall can be changed again: bigger copies, still closed, the old copies gone", async () => {
    const editor = desert();
    const first = await change(editor, CACTUS_ID, { sizeMeters: 6, arrange: "ring", closed: true, around: PUDDLE_ID });
    const folderA = first.result.nodeIds[0]!;
    const before = partsNodes(editor).filter((n) => n.parentId === folderA).length;
    const second = await change(editor, folderA, { sizeMeters: 12 });
    const folderB = second.result.nodeIds[0]!;
    const copies = partsNodes(editor).filter((n) => n.parentId === folderB);
    expect(editor.count()).toBe(2);
    expect(partsNodes(editor).length).toBe(copies.length + 1);
    for (const c of copies) expect(paramsOf(c).sizeMeters).toBe(12);
    // Bigger copies on a longer ring: the count is worked out again.
    expect(copies.length).not.toBe(0);
    expect(before).toBeGreaterThan(0);
    expect(second.result.summary).toContain('around "Puddle"');
    expect(readObjects(editor as never).find((o) => o.id === folderB)!.params.closed).toBe(true);
  });

  test("a thing to stand around that is not in the scene is said, not invented", async () => {
    const editor = desert();
    const { result } = await change(editor, CACTUS_ID, { arrange: "ring", closed: true, around: "the oasis" });
    expect(result.summary).toContain('could not find "the oasis"');
    const copies = partsNodes(editor).filter((n) => n.parentId === result.nodeIds[0]);
    // They stand around the old place of the cactus.
    const cx = copies.reduce((s, c) => s + c.transform.position.x, 0) / copies.length;
    expect(Math.abs(cx - 14)).toBeLessThan(2.5);
  });

  test("a count makes a group near the old place", async () => {
    const editor = desert();
    const { result } = await change(editor, CACTUS_ID, { count: 5 });
    const copies = partsNodes(editor).filter((n) => n.parentId === result.nodeIds[0]);
    expect(copies.length).toBe(5);
    expect(result.summary).toContain("5 copies in a group");
    for (const c of copies) expect(Math.hypot(c.transform.position.x - 14, c.transform.position.z + 7)).toBeLessThan(12);
  });

  test("a group goes back to one object", async () => {
    const editor = desert();
    const first = await change(editor, CACTUS_ID, { count: 4 });
    const { result } = await change(editor, first.result.nodeIds[0]!, { count: 1 });
    expect(partsNodes(editor).length).toBe(2);
    expect(result.nodeIds.length).toBe(1);
    expect(editor.scene.getNode(first.result.nodeIds[0]!)).toBeUndefined();
  });

  test("other colors: the palette of the same model, in place, no model call", async () => {
    const editor = desert();
    const { result } = await change(editor, CACTUS_ID, { colors: { body: "#224466" } });
    const node = editor.scene.getNode(CACTUS_ID)!;
    expect(paramsOf(node).spec.palette.body).toBe("#224466");
    expect(paramsOf(node).spec.palette.flower).toBe("#e0508a");
    expect(result.summary).toContain("colors");
    expect(result.summary).toContain("body");
    expect(editor.count()).toBe(1);
  });

  test("another shape: the modeler gets the present spec and the change, and the node stays", async () => {
    const editor = desert();
    const seen: string[] = [];
    const changed = { ...CACTUS_RAW, stages: [...CACTUS_RAW.stages, { name: "More flowers", parts: [{ name: "flower 2", shape: "ellipsoid", at: [-1.0, 1.25, 0.3], size: [0.25, 0.18, 0.25], color: "flower" }] }] };
    const { result } = await change(editor, CACTUS_ID, { change: "add a flower on the left trunk" }, async (request) => {
      seen.push(request.user);
      return { text: "", toolArgs: changed as unknown as Record<string, unknown> };
    });
    expect(seen.length).toBe(1);
    expect(seen[0]).toContain("CHANGE it, do not start again");
    expect(seen[0]).toContain("add a flower on the left trunk");
    expect(seen[0]).toContain('"main trunk"');
    const node = editor.scene.getNode(CACTUS_ID)!;
    expect(node.transform.position).toEqual({ x: 14, y: 0.4, z: -7 });
    expect(paramsOf(node).spec.stages.length).toBe(3);
    // The size in the world stays: the change did not ask for another size.
    expect(paramsOf(node).sizeMeters).toBeCloseTo(3, 5);
    expect(result.summary).toContain("in place");
  });

  test("a modeler answer that cannot be used leaves the object as it is", async () => {
    const editor = desert();
    const { result } = await change(editor, CACTUS_ID, { change: "make it weird" }, async () => ({ text: "no", toolArgs: undefined }));
    expect(editor.count()).toBe(0);
    expect(result.nodeIds).toEqual([]);
    expect(result.summary).toContain("is not changed");
  });
});

// ── The director finds the thing to change ────────────────────

describe("the replace lookup of the director", () => {
  const cityRecord: SiteRecord = {
    v: 1,
    generator: "city",
    title: "City",
    params: { size: "town" },
    facts: { center: { x: 100, z: 100 }, rect: { x0: 60, z0: 60, x1: 140, z1: 140 }, summary: "a town" }
  };
  const scene = () => {
    const editor = desert();
    editor.scene.addNode({ id: "node:group:1", name: "City", kind: "group", data: {}, transform: T(0, 0, 0), metadata: siteMetadata(cityRecord) });
    editor.scene.addNode({ id: "node:resource:building-a:1", name: "Shop", kind: "group", parentId: "node:group:1", data: {}, transform: T(100, 0, 100), metadata: { resource: "model:city-a" } });
    editor.scene.addNode({ id: "node:resource:bench:1", name: "Bench", kind: "group", data: {}, transform: T(5, 0, 5), metadata: { resource: "lh:feature:bench" } });
    return editor;
  };
  const run = async (editor: Editor, task: Brief["tasks"][number], generators: Generator[]) =>
    runDirector({
      editor: editor as never,
      prompt: "that's too small . so build giant cactus as a wall for puddle.",
      history: [],
      provider: { generateContent: async () => ({ text: "", toolCalls: [], rawParts: [] }) },
      providerConfig: { apiKey: "", model: "", temperature: 0.3 },
      context: "",
      anchor: { x: 0, z: 0 },
      generators,
      signal: new AbortController().signal,
      onUpdate: () => {},
      metrics: newDirectorMetrics(performance.now()),
      requestBrief: async () => ({ brief: { mode: "build", understanding: "I will enlarge the cactus.", tasks: [task] }, notes: [], ms: 1, raw: {} })
    });
  const spy = (id: Generator["id"]) => {
    const seen: { params: Record<string, unknown>; replace?: string; anchor: { x: number; z: number } }[] = [];
    const generator: Generator = {
      id,
      describe: "x",
      validate: (p) => ({ ...p }),
      run: async (params, _a, ctx) => {
        seen.push({ params, replace: ctx.replace?.id, anchor: ctx.anchor });
        return { nodeIds: ["n"], summary: "Changed." };
      }
    };
    return { generator, seen };
  };

  test("the node id of a modeled object is a thing to change (the failed request)", async () => {
    const { generator, seen } = spy("object");
    const outcome = await run(scene(), { generator: "object", title: "Giant Cactus Wall", params: { sizeMeters: 10 }, replace: CACTUS_ID }, [generator]);
    expect(seen.length).toBe(1);
    expect(seen[0]!.replace).toBe(CACTUS_ID);
    expect(seen[0]!.params.sizeMeters).toBe(10);
    expect(seen[0]!.params.subject).toBe("Cactus cluster");
    expect(seen[0]!.anchor).toEqual({ x: 14, z: -7 });
    if (outcome.kind !== "done") throw new Error("expected done");
    expect(outcome.session.messages.at(-1)?.content).not.toContain("is not in the scene");
  });

  test("a node inside a built thing means that thing", async () => {
    const { generator, seen } = spy("city");
    await run(scene(), { generator: "city", title: "City", params: { size: "city" }, replace: "node:resource:building-a:1" }, [generator]);
    expect(seen[0]!.replace).toBe("node:group:1");
    expect(seen[0]!.params.size).toBe("city");
  });

  test("a plain library node goes to the tool loop, with a true reason", async () => {
    const { generator, seen } = spy("object");
    const outcome = await run(scene(), { generator: "object", title: "Bench", params: { sizeMeters: 4 }, replace: "node:resource:bench:1" }, [generator]);
    expect(seen.length).toBe(0);
    expect(outcome.kind).toBe("edit");
    if (outcome.kind !== "edit") throw new Error("expected edit");
    expect(outcome.note).toContain("node:resource:bench:1");
    expect(outcome.note).toContain("no generator built");
  });

  test("an id that is in no scene is still reported as missing", async () => {
    const { generator, seen } = spy("object");
    const outcome = await run(scene(), { generator: "object", title: "Ghost", params: {}, replace: "node:resource:parts:99" }, [generator]);
    expect(seen.length).toBe(0);
    if (outcome.kind !== "done") throw new Error("expected done");
    expect(outcome.session.messages.at(-1)?.content).toContain("is not in the scene");
  });
});

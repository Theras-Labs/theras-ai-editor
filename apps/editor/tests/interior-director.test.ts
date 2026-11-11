// Tests for the interior generator of the director: the host building, the fit to the hall of a
// tower, a building with no hall, the questions, the build, one interior for each host, the
// furniture as obstacles, props placed inside, the brief route and the camera inside the room.
// Run: cd apps/editor && bun test tests/interior-director.test.ts
import { describe, expect, test } from "bun:test";
import { resolveArchParams, toStoredParams } from "../src/lib/generators/architecture";
import { towerLobby } from "../src/lib/generators/architecture/tower";
import { PASSABLE_KINDS, itemHalf, planInterior, type InteriorParams } from "../src/lib/generators/interior";
import { architectureGenerator } from "../src/lib/copilot/director/generators/architecture";
import { findHost, fitRoom, interiorGenerator } from "../src/lib/copilot/director/generators/interior";
import { buildDirectorSystemPrompt, validateBrief } from "../src/lib/copilot/director/brief";
import { readSites, siteMetadata, siteNodeIds, sitesToText } from "../src/lib/copilot/director/site";
import { interiorCameraPose, roomViewOfSite } from "../src/lib/copilot/frame-site";
import { withSites } from "../src/lib/copilot/instant-path";
import type { Brief, BuiltSite, DirectorContext, SiteRecord } from "../src/lib/copilot/director/types";
import type { PlacementScene } from "../src/lib/resources/layout";

// ── Fixtures ──────────────────────────────────────────────────

type Node = {
  id: string;
  name: string;
  parentId?: string;
  kind?: string;
  transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } };
  metadata?: Record<string, unknown>;
};

const T = (x: number, y: number, z: number) => ({ position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });

function makeEditor() {
  const nodes = new Map<string, Node>();
  let commands = 0;
  const scene = {
    nodes,
    addNode: (n: Node) => nodes.set(n.id, n),
    removeNode: (id: string) => nodes.delete(id),
    getNode: (id: string) => nodes.get(id)
  };
  return { scene, execute: (cmd: { execute: (s: typeof scene) => void }) => (commands++, cmd.execute(scene)), commands: () => commands };
}
type Editor = ReturnType<typeof makeEditor>;

const brief = (understanding = "Build it."): Brief => ({ mode: "build", understanding, tasks: [] });

function ctxOf(editor: Editor, opts: { prompt?: string; anchor?: { x: number; z: number }; replace?: BuiltSite; ask?: string[] } = {}): DirectorContext {
  return {
    editor: editor as never,
    prompt: opts.prompt ?? "",
    brief: brief(),
    anchor: opts.anchor ?? { x: 0, z: 0 },
    sites: readSites(editor as never),
    ...(opts.replace ? { replace: opts.replace } : {}),
    ...(opts.ask ? { ask: opts.ask } : {}),
    step: () => {},
    pause: async () => {},
    callModel: async () => ({ text: "" })
  };
}

const TOWER_AT = { x: 30, z: -10 };

/** A real modern tower (the architecture generator), turned 90 degrees, at TOWER_AT. */
async function addTower(editor: Editor): Promise<BuiltSite> {
  const g = architectureGenerator;
  const v = g.validate({ style: "modern-tower", height: 80, look: "glass", facing: 90, at: TOWER_AT, title: "Glass tower" }, brief()) as Record<string, unknown>;
  const res = await g.run(v, {}, ctxOf(editor, { anchor: TOWER_AT }));
  return readSites(editor as never).find((s) => s.id === res.nodeIds[0])!;
}

/** A castle site record (no hall). */
function addCastle(editor: Editor): BuiltSite {
  const record: SiteRecord = {
    v: 1,
    generator: "architecture",
    title: "Castle keep",
    params: { style: "japanese-castle", at: { x: -60, z: 40 }, facing: 0 },
    facts: { center: { x: -60, z: 40 }, rect: { x0: -70, z0: 30, x1: -50, z1: 50 }, height: 30, summary: "castle", building: { style: "japanese-castle", height: 30, footprint: 20 } }
  };
  editor.scene.nodes.set("castle", { id: "castle", name: "Castle keep", kind: "group", transform: T(-60, 0, 40), metadata: siteMetadata(record) });
  editor.scene.nodes.set("castle-body", { id: "castle-body", name: "Castle", parentId: "castle", kind: "group", transform: T(0, 0, 0), metadata: { resource: "gen:architecture" } });
  return readSites(editor as never).find((s) => s.id === "castle")!;
}

const validate = (params: Record<string, unknown>) => interiorGenerator.validate(params, brief()) as Record<string, unknown>;

function towerNode(editor: Editor, site: BuiltSite): Node {
  const id = siteNodeIds(editor as never, site.id).find((n) => editor.scene.nodes.get(n)?.metadata?.resource === "gen:architecture")!;
  return editor.scene.nodes.get(id)!;
}

function lobbyOf(editor: Editor, site: BuiltSite) {
  const node = towerNode(editor, site);
  return towerLobby(toStoredParams(resolveArchParams(JSON.parse(String(node.metadata!.params)))));
}

function interiorSites(editor: Editor) {
  return readSites(editor as never).filter((s) => s.generator === "interior");
}

// ── Host ──────────────────────────────────────────────────────

describe("interior: the host building", () => {
  test("params.host names the host, even when the anchor is in another building", async () => {
    const editor = makeEditor();
    await addTower(editor);
    const castle = addCastle(editor);
    const host = findHost(ctxOf(editor, { anchor: TOWER_AT }), { host: castle.id });
    expect(host?.id).toBe(castle.id);
  });

  test("the anchor inside a building rect picks that building", async () => {
    const editor = makeEditor();
    const tower = await addTower(editor);
    addCastle(editor);
    expect(findHost(ctxOf(editor, { anchor: { x: TOWER_AT.x + 2, z: TOWER_AT.z - 1 } }), {})?.id).toBe(tower.id);
    // Far from both: no host (two buildings, none within 25 m).
    expect(findHost(ctxOf(editor, { anchor: { x: 200, z: 200 } }), {})).toBeUndefined();
  });

  test("no building: a room that stands alone at the anchor", async () => {
    const editor = makeEditor();
    const ctx = ctxOf(editor, { anchor: { x: 5, z: 7 } });
    expect(findHost(ctx, {})).toBeUndefined();
    const res = await interiorGenerator.run(validate({ use: "apartment", finish: "warm-wood" }), {}, ctx);
    expect(res.nodeIds.length).toBe(2);
    const site = interiorSites(editor)[0];
    expect(site.params.shell).toBe(true);
    expect(site.params.at).toMatchObject({ x: 5, z: 7, rotY: 0 });
    expect(site.facts.interior?.host).toBe("");
    expect(res.summary).toContain("stands alone");
  });
});

// ── Fit ───────────────────────────────────────────────────────

describe("interior: the fit to the hall of a tower", () => {
  test("width, depth, place, turn, height and floor plates come from towerLobby", async () => {
    const editor = makeEditor();
    const tower = await addTower(editor);
    const lobby = lobbyOf(editor, tower);
    const fit = fitRoom(editor as never, tower);
    if (fit.kind !== "tower") throw new Error("expected a tower fit");
    expect(fit.width).toBeCloseTo(2 * lobby.halfX, 2);
    expect(fit.depth).toBeCloseTo(2 * lobby.halfZ, 2);
    expect(fit.at.x).toBeCloseTo(TOWER_AT.x, 2);
    expect(fit.at.z).toBeCloseTo(TOWER_AT.z, 2);
    expect(fit.at.rotY).toBeCloseTo(Math.PI / 2, 5);
    const folder = editor.scene.nodes.get(tower.id)!;
    expect(fit.at.y).toBeCloseTo(folder.transform.position.y + lobby.floorY, 2);
    expect(fit.plates).toBe(Math.min(4, lobby.storeys - 1));
    const height = lobby.storeys === 1 ? lobby.height - 0.15 : Math.min(4.4, Math.max(3, lobby.storey - lobby.floorY - 0.45));
    expect(fit.height).toBeCloseTo(height, 2);
  });

  test("a building with no hall builds nothing and says so", async () => {
    const editor = makeEditor();
    const castle = addCastle(editor);
    const ctx = ctxOf(editor, { anchor: castle.facts.center });
    expect(fitRoom(editor as never, castle).kind).toBe("no-hall");
    expect(interiorGenerator.choices!(validate({}), ctx)).toEqual([]);
    const res = await interiorGenerator.run(validate({}), {}, ctx);
    expect(res.nodeIds).toEqual([]);
    expect(res.summary).toContain('No interior was built: "Castle keep" has no hall');
    expect(res.next?.length).toBeGreaterThanOrEqual(2);
    expect(editor.commands()).toBe(0);
  });
});

// ── Choices ───────────────────────────────────────────────────

describe("interior: the questions", () => {
  test("two taste questions with pictures; the glass tower suggests a lobby in light minimal", async () => {
    const editor = makeEditor();
    await addTower(editor);
    const qs = interiorGenerator.choices!(validate({}), ctxOf(editor, { anchor: TOWER_AT }));
    expect(qs.map((q) => q.id)).toEqual(["use", "finish"]);
    expect(qs.every((q) => q.kind === "taste")).toBe(true);
    expect(qs[0].options.length).toBe(4);
    expect(qs[1].options.length).toBe(4);
    expect(qs.every((q) => q.options.every((o) => typeof o.image === "string" && o.image.startsWith("data:")))).toBe(true);
    expect(qs[0].suggested).toBe("lobby");
    expect(qs[1].suggested).toBe("light-minimal");
  });

  test("no question for a given param; ctx.ask asks again", async () => {
    const editor = makeEditor();
    await addTower(editor);
    const given = validate({ use: "office", finish: "stone-brass" });
    expect(interiorGenerator.choices!(given, ctxOf(editor, { anchor: TOWER_AT }))).toEqual([]);
    expect(interiorGenerator.choices!(validate({ use: "office" }), ctxOf(editor, { anchor: TOWER_AT })).map((q) => q.id)).toEqual(["finish"]);
    expect(interiorGenerator.choices!(given, ctxOf(editor, { anchor: TOWER_AT, ask: ["use"] })).map((q) => q.id)).toEqual(["use"]);
  });

  test("taste words: use and finish stay only with the user's own words", () => {
    const taste = interiorGenerator.taste!;
    expect(taste.use.test("inside the building here add ceiling and floor, make best interior")).toBe(false);
    expect(taste.finish.test("inside the building here add ceiling and floor, make best interior")).toBe(false);
    expect(taste.use.test("make it a cozy cafe")).toBe(true);
    expect(taste.finish.test("make it a cozy cafe")).toBe(true);
  });
});

// ── Run ───────────────────────────────────────────────────────

describe("interior: the build", () => {
  test("one command, a folder with the site record, one gen:interior child in the place and turn of the tower", async () => {
    const editor = makeEditor();
    const tower = await addTower(editor);
    const before = editor.commands();
    const steps: string[] = [];
    const ctx = { ...ctxOf(editor, { prompt: "inside the building here add ceiling and floor, make best interior", anchor: TOWER_AT }), step: (label: string) => steps.push(label) };
    const res = await interiorGenerator.run(validate({}), { use: { optionIds: ["lobby"] }, finish: { optionIds: ["warm-wood"] } }, ctx);
    expect(editor.commands()).toBe(before + 1);
    expect(res.nodeIds.length).toBe(2);
    expect(steps).toEqual(["Floor", "Ceiling and lights", "Furniture"]);

    const [folderId, childId] = res.nodeIds;
    const site = interiorSites(editor)[0];
    expect(site.id).toBe(folderId);
    expect(site.params.host).toBe(tower.id);
    expect(site.params.use).toBe("lobby");
    expect(site.params.finish).toBe("warm-wood");
    expect(site.facts.interior?.host).toBe(tower.id);
    expect(site.facts.adjustable).toContain("use lobby|office|lounge|apartment");

    const child = editor.scene.nodes.get(childId)!;
    expect(child.parentId).toBe(folderId);
    expect(child.metadata?.resource).toBe("gen:interior");
    const stored = JSON.parse(String(child.metadata?.params)) as InteriorParams;
    expect(stored.use).toBe("lobby");
    expect(child.metadata?.seed).toBe(stored.seed);

    // Same place and turn as the tower node (its folder carries the transform).
    const towerFolder = editor.scene.nodes.get(tower.id)!;
    const folder = editor.scene.nodes.get(folderId)!;
    expect(folder.transform.position.x).toBeCloseTo(towerFolder.transform.position.x, 2);
    expect(folder.transform.position.z).toBeCloseTo(towerFolder.transform.position.z, 2);
    expect(folder.transform.rotation.y).toBeCloseTo(towerFolder.transform.rotation.y, 5);
    expect(folder.transform.position.y).toBeCloseTo(towerFolder.transform.position.y + 0.3, 2);

    expect(res.summary).toMatch(/^Built a lobby interior in "Glass tower": a [\d.]+ x [\d.]+ m warm wood floor, a ceiling [\d.]+ m above it with light panels/);
    console.info(`[interior summary] ${res.summary}`);
    expect(sitesToText(readSites(editor as never))).toContain("lobby interior, warm wood");
  });

  test("a hall of three storeys: one storey of height, 2 floor plates above, said in the summary", async () => {
    const editor = makeEditor();
    const v = architectureGenerator.validate({ style: "modern-tower", height: 250, look: "setback", at: { x: 0, z: 0 }, title: "Deco tower" }, brief()) as Record<string, unknown>;
    await architectureGenerator.run(v, {}, ctxOf(editor));
    const res = await interiorGenerator.run(validate({}), {}, ctxOf(editor));
    const site = interiorSites(editor)[0];
    expect(site.params.plates).toBe(2);
    expect(site.params.height).toBeCloseTo(3.75, 2);
    expect(site.params.finish).toBe("stone-brass");
    expect(res.summary).toContain("2 floor plates above it fill the podium.");
    console.info(`[interior summary] ${res.summary}`);
  });

  test("a second request in the same host rebuilds the first, in one command", async () => {
    const editor = makeEditor();
    await addTower(editor);
    const first = await interiorGenerator.run(validate({ use: "lobby", finish: "warm-wood" }), {}, ctxOf(editor, { anchor: TOWER_AT }));
    const before = editor.commands();
    const second = await interiorGenerator.run(validate({ finish: "dark-industrial" }), {}, ctxOf(editor, { anchor: TOWER_AT }));
    expect(editor.commands()).toBe(before + 1);
    const sites = interiorSites(editor);
    expect(sites.length).toBe(1);
    expect(sites[0].id).toBe(second.nodeIds[0]);
    expect(editor.scene.nodes.has(first.nodeIds[0])).toBe(false);
    expect(editor.scene.nodes.has(first.nodeIds[1])).toBe(false);
    // The stored use stays; the new finish is on top.
    expect(sites[0].params.use).toBe("lobby");
    expect(sites[0].params.finish).toBe("dark-industrial");
    expect(second.summary).toContain("earlier interior");
  });

  test("the furniture obstacles are in world coordinates for a turned host", async () => {
    const editor = makeEditor();
    await addTower(editor);
    await interiorGenerator.run(validate({ use: "lobby", finish: "warm-wood" }), {}, ctxOf(editor, { anchor: TOWER_AT }));
    const site = interiorSites(editor)[0];
    const p = site.params as unknown as InteriorParams;
    const at = p.at!;
    const plan = planInterior(p);
    const expected = plan.items
      .filter((i) => i.h > 0.3 && !PASSABLE_KINDS.has(i.kind) && !/\b(rug|mat)s?\b/i.test(`${i.kind} ${i.label}`))
      .map((i) => {
        const [hx, hz] = itemHalf(i);
        // Turn about y by at.rotY (90 degrees: local +z goes to world +x).
        const c = Math.cos(at.rotY);
        const s = Math.sin(at.rotY);
        return [at.x + i.x * c + i.z * s, at.z - i.x * s + i.z * c, Math.max(hx, hz)];
      });
    const got = site.facts.interior!.obstacles;
    expect(got.length).toBe(expected.length);
    expect(got.length).toBeGreaterThan(0);
    got.forEach((o, k) => {
      expect(o[0]).toBeCloseTo(expected[k][0], 1);
      expect(o[1]).toBeCloseTo(expected[k][1], 1);
      expect(o[2]).toBeCloseTo(expected[k][2], 1);
      // Every piece is inside the room box.
      const r = site.facts.rect;
      expect(o[0] >= r.x0 - 0.01 && o[0] <= r.x1 + 0.01 && o[1] >= r.z0 - 0.01 && o[1] <= r.z1 + 0.01).toBe(true);
    });
    // The room box of a 90 degree turn: the width lies along z.
    expect(site.facts.rect.z1 - site.facts.rect.z0).toBeCloseTo(p.width, 1);
    expect(site.facts.rect.x1 - site.facts.rect.x0).toBeCloseTo(p.depth, 1);
  });
});

// ── Props inside ──────────────────────────────────────────────

describe("interior: props placed inside stand on its floor", () => {
  async function scene() {
    const editor = makeEditor();
    const tower = await addTower(editor);
    await interiorGenerator.run(validate({ use: "lobby", finish: "warm-wood" }), {}, ctxOf(editor, { anchor: TOWER_AT }));
    const sites = readSites(editor as never);
    const room = sites.find((s) => s.generator === "interior")!;
    // Digest nodes as the layout solver sees them: the tower node is an obstacle with its footprint.
    const towerNodeId = siteNodeIds(editor as never, tower.id).find((id) => id !== tower.id)!;
    const nodes: PlacementScene["nodes"] = [
      { id: tower.id, name: "Glass tower", kind: "folder", position: { x: TOWER_AT.x, y: 0, z: TOWER_AT.z } },
      { id: towerNodeId, name: "Glass tower", kind: "resource gen:architecture", position: { x: TOWER_AT.x, y: 0, z: TOWER_AT.z }, radius: 14 },
      ...siteNodeIds(editor as never, room.id).map((id) => ({ id, name: "Lobby", kind: id === room.id ? "folder" : "resource gen:interior", position: { x: TOWER_AT.x, y: 0.3, z: TOWER_AT.z } }))
    ];
    return { editor, tower, room, sites, nodes, nodesOf: (id: string) => siteNodeIds(editor as never, id) };
  }

  test("inside: the floor is the interior floor, the tower is no obstacle, the furniture is", async () => {
    const { tower, room, sites, nodes, nodesOf } = await scene();
    const out = withSites({ nodes, selection: [], cameraTarget: { x: TOWER_AT.x + 1, y: 0, z: TOWER_AT.z + 1 } }, sites, nodesOf);
    expect(out.groundAt?.(TOWER_AT.x + 1, TOWER_AT.z + 1)).toBeCloseTo(room.facts.interior!.floorY, 3);
    const ids = new Set(out.nodes.map((n) => n.id));
    for (const id of nodesOf(tower.id)) expect(ids.has(id)).toBe(false);
    for (const id of nodesOf(room.id)) expect(ids.has(id)).toBe(false);
    expect(out.nodes.filter((n) => n.kind === "furniture").length).toBe(room.facts.interior!.obstacles.length);
    // Outside the room the ground is the plain ground again.
    expect(out.groundAt?.(300, 300)).toBe(0);
  });

  test("outside: the tower stays an obstacle and the ground is unchanged", async () => {
    const { tower, sites, nodes, nodesOf } = await scene();
    const out = withSites({ nodes, selection: [], cameraTarget: { x: 200, y: 0, z: 200 } }, sites, nodesOf);
    const folder = out.nodes.find((n) => n.id === tower.id);
    expect(folder?.radius).toBeGreaterThan(5);
    expect(out.nodes.some((n) => n.kind === "resource gen:architecture")).toBe(true);
    expect(out.groundAt).toBeUndefined();
  });
});

// ── Brief ─────────────────────────────────────────────────────

describe("interior: the brief", () => {
  test("the prompt routes the inside of a building to the interior generator", () => {
    const prompt = buildDirectorSystemPrompt([{ id: "interior", describe: interiorGenerator.describe }]);
    expect(prompt).toContain('generator "interior"');
    expect(prompt).toContain("Never compose kit floor or wall pieces and never the object generator for it");
    expect(prompt).toContain("interior use and finish");
    expect(interiorGenerator.describe.length).toBeLessThanOrEqual(600);
  });

  test("validateBrief accepts generator interior with replace and ask", () => {
    const { brief: b, notes } = validateBrief({
      mode: "build",
      understanding: "Another finish.",
      tasks: [{ generator: "interior", title: "Lobby interior", replace: "node:group:9", ask: ["finish"], params: {} }]
    });
    expect(notes).toEqual([]);
    expect(b.tasks[0].generator).toBe("interior");
    expect(b.tasks[0].replace).toBe("node:group:9");
    expect(b.tasks[0].ask).toEqual(["finish"]);
  });
});

// ── Camera ────────────────────────────────────────────────────

describe("interior: the camera goes inside", () => {
  test("1.2 m inside the entrance side, 1.7 m above the floor, looking at the center 1.3 m above the floor", () => {
    const pose = interiorCameraPose({ x: 0, z: 0, rotY: 0, width: 20, depth: 10, front: "+z", floorY: 0.3 });
    expect(pose.position.x).toBeCloseTo(0, 5);
    expect(pose.position.z).toBeCloseTo(3.8, 5);
    expect(pose.position.y).toBeCloseTo(2.0, 5);
    expect(pose.target).toEqual({ x: 0, y: 1.6, z: 0 });
  });

  test("a turned room: the entrance side turns with it", () => {
    const pose = interiorCameraPose({ x: 30, z: -10, rotY: Math.PI / 2, width: 20, depth: 10, front: "+z", floorY: 0 });
    expect(pose.position.x).toBeCloseTo(33.8, 5);
    expect(pose.position.z).toBeCloseTo(-10, 5);
    const side = interiorCameraPose({ x: 0, z: 0, rotY: 0, width: 20, depth: 10, front: "-x", floorY: 0 });
    expect(side.position.x).toBeCloseTo(-8.8, 5);
  });

  test("the room of a site comes from its stored params", () => {
    expect(roomViewOfSite({ at: { x: 1, y: 0.3, z: 2, rotY: 0.5 }, width: 12, depth: 9, front: "+z" }, 0.3)).toEqual({ x: 1, z: 2, rotY: 0.5, width: 12, depth: 9, front: "+z", floorY: 0.3 });
    expect(roomViewOfSite({}, 0)).toBeNull();
  });
});

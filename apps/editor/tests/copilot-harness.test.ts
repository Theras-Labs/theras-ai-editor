// Unit tests for the AI harness pure functions (plan docs/plans/realtime-ai-harness.md, phase 1).
// Run: cd apps/editor && bun test tests/
import { describe, expect, test } from "bun:test";
import { contentWords, findSpots, matchThing, parseInstantPrompt, planInstant, resolveAnchor, type PlacementScene } from "../src/lib/copilot/instant-path";
import { asksForMissingTool, pickProfile, toolsForProfile } from "../src/lib/copilot/tool-profiles";
import { buildProfileSystemPrompt } from "../src/lib/copilot/system-prompt";
import { createSseParser } from "../src/lib/copilot/sse";
import { DIGEST_MAX_NODES, formatSceneDigest, type DigestNode } from "../src/lib/copilot/scene-digest";

const empty: PlacementScene = { nodes: [], selection: [] };

function node(id: string, name: string, x: number, z: number, radius = 1, extra: Partial<DigestNode> = {}): DigestNode {
  return { id, name, kind: "resource x", position: { x, y: 0, z }, size: `r${radius}`, radius, ...extra };
}

describe("parseInstantPrompt", () => {
  test("simple prompts", () => {
    expect(parseInstantPrompt("add a lighthouse")).toEqual({ verb: "add", count: 1, thing: "lighthouse", relation: undefined, anchor: undefined });
    expect(parseInstantPrompt("Place 3 lanterns.")).toMatchObject({ verb: "place", count: 3, thing: "lanterns" });
    expect(parseInstantPrompt("please put two benches next to the windmill")).toMatchObject({ count: 2, thing: "benches", relation: "near", anchor: "windmill" });
    expect(parseInstantPrompt("spawn a hound around the campfire")).toMatchObject({ thing: "hound", relation: "around", anchor: "campfire" });
    expect(parseInstantPrompt("add the windmill on the island")).toMatchObject({ thing: "windmill", relation: "on", anchor: "island" });
  });

  test("rejects vague and multi-object prompts", () => {
    for (const p of [
      "make it nicer",
      "make the scene nicer",
      "add some trees",
      "add a few lanterns",
      "add more flowers",
      "add a lighthouse and a ship",
      "add a lighthouse, a ship",
      "build a small harbor with a lighthouse, a ship and some plants",
      "add a house with a garden",
      "what is a lighthouse",
      "remove the lighthouse",
      "add 500 lanterns",
      "add it near the windmill"
    ]) {
      expect(parseInstantPrompt(p)).toBeNull();
    }
  });

  test("content words drop articles and size words", () => {
    expect(contentWords("small oak tree")).toEqual(["oak", "tree"]);
  });
});

describe("match rule (real catalog)", () => {
  test("matches clear library names", () => {
    expect(matchThing("lighthouse")?.id).toBe("lh:landmark:lighthouse");
    expect(matchThing("windmill")?.id).toBe("lh:landmark:windmill");
    expect(matchThing("lantern")?.id).toBe("lh:feature:lantern");
    expect(matchThing("lanterns")?.id).toBe("lh:feature:lantern");
    expect(matchThing("cozy island")).toMatchObject({ type: "template", id: "cozy-island" });
  });

  test("does not match weak or ambiguous names", () => {
    expect(matchThing("tree")).toBeNull(); // many entries have "tree" in the name
    expect(matchThing("island")).toBeNull(); // terrain and two templates tie
    expect(matchThing("nicer")).toBeNull();
    expect(matchThing("spaceship")).toBeNull();
    expect(matchThing("red lighthouse")).toBeNull(); // "red" is not in the name
  });

  test("the rule itself: 3 per word and a 2-point gap", () => {
    const rank = (scores: number[]) => () => scores.map((score, i) => ({ type: "resource" as const, id: `e${i}`, name: `e${i}`, kind: "feature" as const, footprint: 1, score }));
    expect(matchThing("foo", rank([3, 1]))?.id).toBe("e0");
    expect(matchThing("foo", rank([3, 2]))).toBeNull();
    expect(matchThing("foo", rank([2]))).toBeNull();
    expect(matchThing("foo bar", rank([5, 0]))).toBeNull(); // needs 6 for two words
    expect(matchThing("foo bar", rank([6]))?.id).toBe("e0");
  });
});

describe("planInstant", () => {
  test("add a lighthouse: one place_resource on the ground", () => {
    const plan = planInstant("add a lighthouse", empty);
    expect(plan?.calls).toHaveLength(1);
    expect(plan?.calls[0]).toMatchObject({ name: "place_resource", args: { id: "lh:landmark:lighthouse", y: 0 } });
  });

  test("count gives that many calls that do not overlap", () => {
    const plan = planInstant("place 4 lanterns", empty)!;
    expect(plan.calls).toHaveLength(4);
    const pts = plan.calls.map((c) => c.args as { x: number; z: number });
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)).toBeGreaterThan(0.5);
  });

  test("templates and skies use their own tools", () => {
    expect(planInstant("create a cozy island", empty)?.calls[0]).toMatchObject({ name: "apply_template", args: { id: "cozy-island" } });
    expect(planInstant("make a night sky", empty)?.calls[0].name).toBe("set_environment");
    expect(planInstant("add 2 cozy islands", empty)).toBeNull();
  });

  test("falls through when the prompt is not a clear library match", () => {
    expect(planInstant("make it nicer", empty)).toBeNull();
    expect(planInstant("add a lighthouse and a ship", empty)).toBeNull();
    expect(planInstant("add a tree", empty)).toBeNull();
    expect(planInstant("add a lantern near the castle", empty)).toBeNull(); // unknown anchor
  });

  test("near an anchor keeps clear of it", () => {
    const scene: PlacementScene = { nodes: [node("n1", "Windmill", 5, 5, 2)], selection: [] };
    const plan = planInstant("add a bench next to the windmill", scene)!;
    const a = plan.calls[0].args as { x: number; z: number };
    const d = Math.hypot(a.x - 5, a.z - 5);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(6);
  });
});

describe("anchors and spots", () => {
  const scene: PlacementScene = {
    nodes: [node("a", "Windmill", 0, 0), node("b", "Lantern", 3, 0, 0.3), node("c", "Lantern", -3, 0, 0.3), node("t", "Island land", 0, 0, 16, { terrain: true, kind: "terrain island" })],
    selection: ["a"],
    cameraTarget: { x: 1, y: 0, z: 2 }
  };
  test("resolveAnchor", () => {
    expect(resolveAnchor("windmill", scene)?.name).toBe("Windmill");
    expect(resolveAnchor("lantern", scene)).toBeNull(); // two lanterns: ambiguous
    expect(resolveAnchor("it", scene)?.name).toBe("Windmill");
    expect(resolveAnchor("island", scene)?.terrain).toBe(true);
    expect(resolveAnchor("me", scene)).toMatchObject({ x: 1, z: 2 });
  });
  test("findSpots respects land", () => {
    const water: PlacementScene = { ...scene, groundAt: () => null };
    expect(findSpots(1, 1, water, null, undefined, { needsLand: true })).toBeNull();
    const land: PlacementScene = { ...scene, groundAt: () => 0.75 };
    expect(findSpots(1, 1, land, null, undefined, { needsLand: true })?.[0].y).toBe(0.75);
  });
});

describe("tool profiles", () => {
  test("pickProfile keyword rules", () => {
    expect(pickProfile("build a small harbor with a lighthouse, a ship and some plants", false)).toBe("compose");
    expect(pickProfile("bevel the edges of the tower", false)).toBe("edit");
    expect(pickProfile("extrude the top face", false)).toBe("edit");
    expect(pickProfile("when player enters, the door opens", false)).toBe("logic");
    expect(pickProfile("add a hook that rotates the windmill", false)).toBe("logic");
    expect(pickProfile("build this", true)).toBe("full");
    expect(pickProfile("make it rounder and smooth", false, { kinds: ["primitive"] })).toBe("edit");
  });

  test("compose has the plan's tools and is small", () => {
    const names = toolsForProfile("compose").map((t) => t.name);
    for (const n of ["search_resources", "place_resource", "apply_template", "generate_island", "set_environment", "place_primitive", "group_nodes"]) expect(names).toContain(n);
    for (const n of ["list_slots", "set_slot"]) expect(names).not.toContain(n); // dock slot tools are in edit
    expect(names).not.toContain("extrude_mesh_faces");
    expect(toolsForProfile("compose")).toBe(toolsForProfile("compose")); // stable object: byte-identical requests
    const chars = JSON.stringify(toolsForProfile("compose")).length + buildProfileSystemPrompt("compose").length;
    expect(chars / 4).toBeLessThanOrEqual(5000);
  });

  test("edit and logic include compose", () => {
    const compose = toolsForProfile("compose").map((t) => t.name);
    for (const p of ["edit", "logic"] as const) {
      const names = toolsForProfile(p).map((t) => t.name);
      for (const n of compose) expect(names).toContain(n);
    }
    expect(toolsForProfile("edit").map((t) => t.name)).toContain("bevel_mesh_edges");
    expect(toolsForProfile("logic").map((t) => t.name)).toContain("add_hook");
  });

  test("asksForMissingTool", () => {
    const compose = toolsForProfile("compose");
    expect(asksForMissingTool("I need extrude_mesh_faces to do that.", compose)).toBe(true);
    expect(asksForMissingTool("I don't have a tool to add hooks here.", compose)).toBe(true);
    expect(asksForMissingTool("Placed a lighthouse on the coast.", compose)).toBe(false);
    expect(asksForMissingTool("The library has no spaceship, so I built one from primitives.", compose)).toBe(false);
  });
});

describe("SSE parser", () => {
  test("split chunks, pings and CRLF", () => {
    const got: string[] = [];
    const p = createSseParser((d) => got.push(d));
    p.push('data: {"type":"te');
    p.push('xt","delta":"hi"}\n');
    p.push("\n: ping\n\n");
    p.push('data: {"type":"done"}\r\n\r\n');
    p.push("data: tail");
    p.end();
    expect(got).toEqual(['{"type":"text","delta":"hi"}', '{"type":"done"}', "tail"]);
  });
});

describe("scene digest", () => {
  test("format and the 60-node cap", () => {
    const nodes = Array.from({ length: 65 }, (_, i) => node(`n${i}`, `N${i}`, i, -i));
    const text = formatSceneDigest({ nodes, selection: ["n1"], cameraTarget: { x: 1, y: 0, z: 2 }, counts: { entities: 0, materials: 1, paths: 0, hooks: 0 } });
    expect(text).toContain("Selection: n1");
    expect(text).toContain("Camera target: 1,0,2");
    expect(text).toContain("n0 | N0 | resource x | 0,0,0 | r1");
    expect(text).toContain("n59 | N59");
    expect(text).not.toContain("n60 | N60");
    expect(text).toContain(`and ${65 - DIGEST_MAX_NODES} more nodes`);
  });
});

test("a water surface is not an obstacle for the instant path", () => {
  const plan = planInstant("add a lantern", {
    nodes: [{ id: "node:water:1", name: "Anime lagoon", kind: "resource water:lagoon", position: { x: 0, y: 0, z: 0 }, radius: 48 }],
    selection: []
  } as never);
  expect(plan).not.toBeNull();
});

// ── Phase 2 (plan 5.3, 5.5, 5.11) ─────────────────────────────

import { gatedComposeTools, withoutPrimitiveTools, asksForPrimitive } from "../src/lib/copilot/tool-profiles";
import { trimHistoryForRequest, summarizeToolResult } from "../src/lib/copilot/agentic-loop";
import { searchResourcesScored } from "../src/lib/resources/catalog";
import type { CopilotMessage } from "../src/lib/copilot/types";

describe("asset-first gate", () => {
  const compose = toolsForProfile("compose");
  const names = (t: { name: string }[]) => t.map((d) => d.name);
  test("compose step 1 has no primitive tools", () => {
    const step = gatedComposeTools(compose, "build a small camp with a campfire and three plants", false);
    expect(names(step)).not.toContain("place_primitive");
    expect(names(step)).not.toContain("place_primitives");
    expect(names(step)).toContain("place_resources");
    expect(step).toBe(gatedComposeTools(compose, "another prompt", false)); // stable object
  });
  test("opens after a search with no match, or when the prompt asks for a shape", () => {
    expect(names(gatedComposeTools(compose, "add a spaceship", true))).toContain("place_primitives");
    expect(names(gatedComposeTools(compose, "add a red cube on the island", false))).toContain("place_primitive");
    expect(asksForPrimitive("stack three boxes")).toBe(true);
    expect(asksForPrimitive("add a lighthouse")).toBe(false);
  });
  test("other profiles are not gated", () => {
    expect(gatedComposeTools(toolsForProfile("edit"), "add a lighthouse", false)).toBe(toolsForProfile("edit"));
    expect(withoutPrimitiveTools(compose).length).toBe(compose.length - 2);
  });
});

describe("history trim", () => {
  const tool = (id: string, result: string): CopilotMessage => ({ id, role: "tool", content: "", toolResults: [{ callId: id, name: "x", result }], timestamp: 0 });
  const big = JSON.stringify({ success: true, results: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, description: "long text ".repeat(10) })) });
  const msgs: CopilotMessage[] = [
    { id: "u1", role: "user", content: "a", timestamp: 0 },
    tool("t1", big),
    tool("t2", JSON.stringify({ success: false, error: "No resource x" })),
    tool("t3", big),
    tool("t4", big)
  ];
  test("old results become one line, the latest 2 steps stay, the stored history does not change", () => {
    const out = trimHistoryForRequest(msgs);
    expect(out[1].toolResults![0].result).toBe("ok");
    expect(out[2].toolResults![0].result).toBe("error: No resource x");
    expect(out[3].toolResults![0].result).toBe(big);
    expect(out[4].toolResults![0].result).toBe(big);
    expect(msgs[1].toolResults![0].result).toBe(big); // not mutated
    const short = msgs.slice(0, 3); // only 2 tool steps: nothing to trim
    expect(trimHistoryForRequest(short)).toBe(short);
    expect(summarizeToolResult("plain text")).toBe("plain text");
  });
  test("a chat with 10 earlier messages stays small", () => {
    const chat: CopilotMessage[] = [];
    for (let i = 0; i < 5; i++) chat.push({ id: `u${i}`, role: "user", content: "build something", timestamp: 0 }, tool(`t${i}`, big));
    const before = JSON.stringify(chat).length;
    const after = JSON.stringify(trimHistoryForRequest(chat)).length;
    expect(after).toBeLessThan(before * 0.5);
  });
});

describe("search quality", () => {
  test("plurals and synonyms find the entry, with a score", () => {
    const top = (q: string) => searchResourcesScored(q, {}, 3)[0];
    expect(top("benches").entry.id).toBe("lh:feature:bench");
    expect(top("benches").score).toBe(3);
    expect(top("boat").entry.id).toBe("lh:feature:rowboat");
    expect(top("bonfire").entry.id).toBe("lh:landmark:campfire");
    expect(top("bonfire").score).toBe(2.5);
    expect(searchResourcesScored("spaceship").every((r) => r.score < 2)).toBe(true);
  });
});

describe("compose budget", () => {
  test("step 1 (gated) and the open tool set both stay within 5,000 tokens (chars / 4)", () => {
    const prompt = buildProfileSystemPrompt("compose").length;
    const gated = JSON.stringify(withoutPrimitiveTools(toolsForProfile("compose"))).length + prompt;
    const open = JSON.stringify(toolsForProfile("compose")).length + prompt;
    expect(gated / 4).toBeLessThanOrEqual(5000);
    expect(open / 4).toBeLessThanOrEqual(5000);
  });
  test("the compose prompt tells the model to use place_resources with a layout and lists the camp ids", () => {
    const p = buildProfileSystemPrompt("compose");
    expect(p).toContain("place_resources");
    expect(p).toContain("Do not give x, y, z unless the user gives coordinates");
    expect(p).toContain("lh:feature: bench");
    expect(p).toContain("rowboat");
    expect(buildProfileSystemPrompt("compose")).toBe(p); // byte-stable
  });
});

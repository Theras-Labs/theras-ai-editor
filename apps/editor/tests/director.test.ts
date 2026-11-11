// Director core (plan docs/plans/realtime-ai-harness.md, 5B): brief validation, ambiguity,
// routing by mode, the summary in code, compose choices. No network: the model is a fake.
import { describe, expect, test } from "bun:test";
import type { EditorCore } from "@theras/editor-core";
import {
  BRIEF_TOOL_NAME,
  MAX_BRIEF_TASKS,
  briefEffort,
  briefTool,
  buildDirectorSystemPrompt,
  requestBrief,
  resolveNouns,
  validateBrief,
  type BriefResponse
} from "../src/lib/copilot/director/brief";
import { ambiguityQuestion, answersForTask, collectQuestions, newDirectorMetrics, runDirector, summarizeRun, tasksForMeaning, type DirectorOutcome } from "../src/lib/copilot/director/run";
import { applyComposeAnswers, composeChoices, validateCompose, type ComposeParams } from "../src/lib/copilot/director/compose";
import { historyForModel } from "../src/lib/copilot/agentic-loop";
import { closingTextForStep } from "../src/lib/copilot/tool-profiles";
import type { Brief, ChoiceQuestion, Generator } from "../src/lib/copilot/director/types";
import type { CopilotMessage, CopilotProvider, CopilotProviderConfig, CopilotSession } from "../src/lib/copilot/types";

describe("validateBrief", () => {
  test("unknown generator: compose with items, else dropped with a note", () => {
    const { brief, notes } = validateBrief({
      mode: "build",
      understanding: "A camp.",
      tasks: [
        { generator: "forest", title: "Trees", params: { items: [{ id: "lh:plant:oak" }] } },
        { generator: "teleporter", title: "Gate", params: {} }
      ]
    });
    expect(brief.tasks.map((t) => t.generator)).toEqual(["compose"]);
    expect(notes.some((n) => n.includes("teleporter"))).toBe(true);
  });

  test(`at most ${MAX_BRIEF_TASKS} tasks`, () => {
    const tasks = Array.from({ length: 7 }, (_, i) => ({ generator: "compose", title: `T${i}`, params: { items: [] } }));
    const { brief, notes } = validateBrief({ mode: "build", understanding: "x", tasks });
    expect(brief.tasks.length).toBe(MAX_BRIEF_TASKS);
    expect(notes.length).toBe(1);
  });

  test("build without tasks and without ambiguity is an edit; answer keeps a reply", () => {
    expect(validateBrief({ mode: "build", understanding: "Make it bigger.", tasks: [] }).brief.mode).toBe("edit");
    const answer = validateBrief({ mode: "answer", understanding: "Undo is Ctrl+Z.", tasks: [{ generator: "compose", title: "x", params: {} }] }).brief;
    expect(answer.mode).toBe("answer");
    expect(answer.reply).toBe("Undo is Ctrl+Z.");
    expect(answer.tasks).toEqual([]);
    expect(validateBrief(null).brief.mode).toBe("edit");
  });

  test("style: palette, hex colors and vegetation are checked", () => {
    const { brief } = validateBrief({
      mode: "build",
      understanding: "x",
      style: { palette: "nope", era: "japanese castle", colors: { walls: "#FFF", roof: "#334455", accent: "red" }, vegetation: ["cherry blossom", 4] },
      tasks: [{ generator: "compose", title: "x", params: {} }]
    });
    expect(brief.style).toEqual({ era: "japanese castle", colors: { walls: "#ffffff", roof: "#334455" }, vegetation: ["cherry blossom"] });
    expect(validateBrief({ mode: "build", understanding: "x", style: { palette: "blossom" }, tasks: [{ generator: "compose", title: "x", params: {} }] }).brief.style?.palette).toBe("blossom");
  });

  test("ambiguity needs 2 options; task.option must be an option id", () => {
    const { brief } = validateBrief({
      mode: "build",
      understanding: "A plane.",
      ambiguity: { question: "Which plane?", options: [{ id: "airplane", label: "Airplane" }, { id: "surface", label: "Flat surface" }] },
      tasks: [
        { generator: "object", title: "Airplane", option: "airplane", params: { name: "airplane" } },
        { generator: "compose", title: "Sky", option: "other", params: { environment: "lh:sky:summer_noon" } }
      ]
    });
    expect(brief.ambiguity?.options.length).toBe(2);
    expect(brief.tasks[0].option).toBe("airplane");
    expect(brief.tasks[1].option).toBeUndefined();
    // A build whose only content is the ambiguity stays a build (the chosen reading decides).
    const onlyAmbiguity = validateBrief({ mode: "build", understanding: "x", ambiguity: { question: "?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, tasks: [] }).brief;
    expect(onlyAmbiguity.mode).toBe("build");
    expect(validateBrief({ mode: "build", understanding: "x", ambiguity: { question: "?", options: [{ id: "a", label: "A" }] }, tasks: [] }).brief.ambiguity).toBeUndefined();
  });
});

describe("director prompt and tool", () => {
  test("routes for registered generators only; the tool mirrors the Brief", () => {
    const withCity = buildDirectorSystemPrompt([{ id: "compose", describe: "c" }, { id: "city", describe: "streets" }]);
    expect(withCity).toContain('generator "city"');
    expect(withCity).toContain("There is no river generator now");
    expect(withCity).toContain("lh:plant:");
    expect(buildDirectorSystemPrompt([{ id: "compose", describe: "c" }])).toBe(buildDirectorSystemPrompt([{ id: "compose", describe: "c" }]));
    const tool = briefTool(["compose", "city"]);
    expect(tool.name).toBe(BRIEF_TOOL_NAME);
    const props = (tool.parameters as { properties: Record<string, { items?: { properties: Record<string, { enum?: string[] }> } }> }).properties;
    expect(Object.keys(props).sort()).toEqual(["ambiguity", "mode", "reply", "style", "tasks", "understanding"]);
    expect(props.tasks.items!.properties.generator.enum).toEqual(["compose", "city"]);
  });

  test("effort low, medium with an image", () => {
    expect(briefEffort()).toBe("low");
    expect(briefEffort([{ kind: "image", name: "a", mime: "image/jpeg", dataUrl: "data:" }])).toBe("medium");
  });

  test("nouns resolve to library ids in code", () => {
    const matches = resolveNouns("add a lantern near the windmill");
    const ids = matches.flatMap((m) => m.ids.map((i) => i.id));
    expect(ids).toContain("lh:feature:lantern");
    expect(ids).toContain("lh:landmark:windmill");
    expect(resolveNouns("create a plane").length).toBe(0);
  });

  test("requestBrief: one call, profile brief, the tool args validated", async () => {
    const seen: CopilotProviderConfig[] = [];
    const provider: CopilotProvider = {
      generateContent: async () => ({ text: "", toolCalls: [], rawParts: [] }),
      streamContent: async (_m, tools, _s, config, onEvent) => {
        seen.push(config);
        expect(tools.map((t) => t.name)).toEqual([BRIEF_TOOL_NAME]);
        const call = { id: "c1", name: BRIEF_TOOL_NAME, args: { mode: "build", understanding: "A lantern.", tasks: [{ generator: "compose", title: "Lantern", params: { items: [{ id: "lh:feature:lantern" }] } }] } };
        onEvent({ type: "tool_call", call });
        return { text: "", toolCalls: [call], rawParts: [], streamed: true, model: "m1", usage: { input: 10, cached: 0, output: 5 } };
      }
    };
    const res = await requestBrief({ provider, providerConfig: { apiKey: "", model: "", temperature: 0.3 }, prompt: "add a lantern", history: [], context: "[digest]", generators: [{ id: "compose", describe: "c" }] });
    expect(seen[0].profile).toBe("brief");
    expect(seen[0].effort).toBe("low");
    expect(res.brief.tasks[0].generator).toBe("compose");
    expect(res.model).toBe("m1");
  });
});

// ── runDirector with fakes ────────────────────────────────────

const fakeProvider: CopilotProvider = { generateContent: async () => ({ text: "", toolCalls: [], rawParts: [] }) };

function fakeBrief(brief: Brief): () => Promise<BriefResponse> {
  return async () => ({ brief, notes: [], ms: 5, raw: brief });
}

function fakeGenerator(id: "city" | "river", questions: ChoiceQuestion[] = [], fail = false): Generator & { runs: unknown[] } {
  const runs: unknown[] = [];
  return {
    id,
    describe: `${id} generator`,
    runs,
    validate: (params) => ({ ...params, ok: true }),
    choices: () => questions,
    run: async (params, answers, ctx) => {
      runs.push({ params, answers });
      if (fail) throw new Error("boom");
      ctx.step("Roads", "4 streets");
      return { nodeIds: ["n1", "n2"], summary: `Built the ${id}.` };
    }
  };
}

async function run(brief: Brief, generators: Generator[], pick?: Record<string, string[]>) {
  const popups: ChoiceQuestion[][] = [];
  const sessions: CopilotSession[] = [];
  const outcome: DirectorOutcome = await runDirector({
    editor: {} as EditorCore,
    prompt: "test",
    history: [],
    provider: fakeProvider,
    providerConfig: { apiKey: "", model: "", temperature: 0.3 },
    context: "",
    anchor: { x: 0, z: 0 },
    generators,
    signal: new AbortController().signal,
    onUpdate: (s) => sessions.push(s),
    metrics: newDirectorMetrics(performance.now()),
    requestBrief: fakeBrief(brief),
    requestChoices: async (_title, questions) => {
      popups.push(questions);
      return Object.fromEntries(questions.map((q) => [q.id, { optionIds: pick?.[q.id] ?? [q.suggested] }]));
    }
  });
  return { outcome, popups, sessions };
}

describe("runDirector routing", () => {
  test("answer: the reply, no popup", async () => {
    const { outcome, popups } = await run({ mode: "answer", understanding: "x", reply: "Press G to move.", tasks: [] }, []);
    expect(outcome.kind).toBe("done");
    expect(popups.length).toBe(0);
    if (outcome.kind === "done") expect(outcome.session.messages.at(-1)?.content).toBe("Press G to move.");
  });

  test("edit: back to the tool loop with the understanding", async () => {
    const { outcome } = await run({ mode: "edit", understanding: "Scale the windmill up.", tasks: [] }, []);
    expect(outcome.kind).toBe("edit");
    if (outcome.kind === "edit") expect(outcome.note).toContain("Scale the windmill up.");
  });

  test("build: trace lines, the understanding first, a summary written in code, no popup without questions", async () => {
    const city = fakeGenerator("city");
    const { outcome, popups } = await run({ mode: "build", understanding: "A small city.", tasks: [{ generator: "city", title: "City", params: { blocks: 4 } }] }, [city]);
    expect(popups.length).toBe(0);
    expect(city.runs.length).toBe(1);
    if (outcome.kind !== "done") throw new Error("expected done");
    const msgs = outcome.session.messages;
    const trace = msgs.find((m) => m.role === "assistant" && m.toolCalls?.length)!;
    expect(trace.content).toBe("A small city.");
    expect(trace.toolCalls![0].id.startsWith("dir_")).toBe(true);
    expect(trace.toolCalls![0].args.label).toBe("Roads");
    expect(msgs.at(-1)?.content).toBe("Built the city.");
    expect(outcome.session.status).toBe("idle");
    // The trace is chat UI only: a model never sees it as tool calls.
    expect(historyForModel(msgs).some((m) => m.toolCalls?.length || m.toolResults?.length)).toBe(false);
  });

  test("ambiguity: one popup with the meaning question first; the chosen reading picks the tasks", async () => {
    const brief: Brief = {
      mode: "build",
      understanding: "A plane.",
      ambiguity: { question: "Which plane?", options: [{ id: "airplane", label: "Airplane" }, { id: "surface", label: "Flat surface" }] },
      tasks: [{ generator: "city", title: "Airplane", option: "airplane", params: {} }]
    };
    const city = fakeGenerator("city", [{ id: "kit", title: "Which kit?", suggested: "a", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }]);
    const first = await run(brief, [city]);
    expect(first.popups.length).toBe(1);
    expect(first.popups[0].map((q) => q.id)).toEqual(["meaning", "kit"]);
    expect(first.popups[0][0].suggested).toBe("airplane");
    expect(city.runs.length).toBe(1);
    // The other reading has no task: the tool loop builds it, with the reading in the note.
    const second = await run(brief, [fakeGenerator("city")], { meaning: ["surface"] });
    expect(second.outcome.kind).toBe("edit");
    if (second.outcome.kind === "edit") expect(second.outcome.note).toContain("Flat surface");
  });

  test("a missing or failing generator is reported and the other tasks continue", async () => {
    const river = fakeGenerator("river", [], true);
    const city = fakeGenerator("city");
    const { outcome } = await run(
      {
        mode: "build",
        understanding: "x",
        tasks: [
          { generator: "architecture", title: "Castle", params: {} },
          { generator: "river", title: "River", params: {} },
          { generator: "city", title: "Town", params: {} }
        ]
      },
      [river, city]
    );
    if (outcome.kind !== "done") throw new Error("expected done");
    const text = outcome.session.messages.at(-1)!.content;
    expect(text).toContain("Castle: The architecture generator is not available yet");
    expect(text).toContain("the river generator failed (boom)");
    expect(text).toContain("Built the city.");
    expect(city.runs.length).toBe(1);
  });
});

describe("pure helpers", () => {
  test("ambiguityQuestion, tasksForMeaning", () => {
    const brief: Brief = {
      mode: "build",
      understanding: "x",
      ambiguity: { question: "Which bat?", options: [{ id: "animal", label: "Bat (animal)" }, { id: "baseball", label: "Baseball bat" }] },
      tasks: [
        { generator: "compose", title: "Sky", params: {} },
        { generator: "object", title: "Bat", option: "baseball", params: {} }
      ]
    };
    expect(ambiguityQuestion(brief)?.suggested).toBe("baseball");
    expect(tasksForMeaning(brief, "animal").map((t) => t.title)).toEqual(["Sky"]);
    expect(tasksForMeaning(brief, "baseball").length).toBe(2);
    expect(ambiguityQuestion({ mode: "build", understanding: "", tasks: [] })).toBeNull();
  });

  test("collectQuestions renames shared ids; answersForTask maps them back", () => {
    const q: ChoiceQuestion = { id: "tree", title: "Which trees?", suggested: "a", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] };
    const gen = fakeGenerator("city");
    const plan = [0, 1].map(() => ({ task: { generator: "compose" as const, title: "t", params: {} }, generator: gen, params: {} }));
    const { questions, owner } = collectQuestions(plan, () => [q]);
    expect(questions.map((x) => x.id)).toEqual(["tree", "tree#1"]);
    const answers = { tree: { optionIds: ["a"] }, "tree#1": { optionIds: ["b"] } };
    expect(answersForTask(1, answers, owner)).toEqual({ tree: { optionIds: ["b"] } });
  });

  test("summarizeRun", () => {
    expect(summarizeRun([{ title: "City", result: { nodeIds: ["a"], summary: "Built a city.", skipped: ["lamp: no place"] } }])).toBe("Built a city.\nNot built: lamp: no place.");
    expect(summarizeRun([{ title: "City", result: { nodeIds: [], summary: "" } }])).toBe("City: done.\nNothing was built.");
    expect(summarizeRun([], { aborted: true })).toBe("Stopped.");
  });

  test("closingTextForStep ends a successful compose step in code", () => {
    expect(closingTextForStep([{ name: "set_node_transform" }], [{ result: '{"success":true}' }])).toBe("Done: set node transform.");
    expect(closingTextForStep([{ name: "get_node_details" }], [{ result: '{"success":true}' }])).toBeNull();
    expect(closingTextForStep([{ name: "place_resources" }], [{ result: '{"success":false,"error":"x"}' }])).toBeNull();
    expect(closingTextForStep([{ name: "place_resources" }], [{ result: '{"success":true,"placed":[{},{}],"skipped":[]}' }])).toBe("Done: place resources. Placed 2 objects.");
  });

  test("historyForModel keeps real tool calls", () => {
    const msgs: CopilotMessage[] = [
      { id: "1", role: "assistant", content: "", toolCalls: [{ id: "c1", name: "place_resource", args: {} }, { id: "dir_x", name: "city", args: {} }], timestamp: 0 },
      { id: "2", role: "tool", content: "", toolResults: [{ callId: "c1", name: "place_resource", result: "{}" }, { callId: "dir_x", name: "city", result: "{}" }], timestamp: 0 }
    ];
    const out = historyForModel(msgs);
    expect(out[0].toolCalls?.map((c) => c.id)).toEqual(["c1"]);
    expect(out[1].toolResults?.map((r) => r.callId)).toEqual(["c1"]);
  });
});

describe("compose generator", () => {
  const params = (items: ComposeParams["items"]) => validateCompose({ items }) as ComposeParams;

  test("validate: unknown ids out, sky and water move to their fields, counts clamped", () => {
    const p = validateCompose({ items: [{ id: "nope" }, { id: "lh:sky:dusk" }, { id: "water:clear-lake" }, { id: "lh:plant:oak", count: 99, layout: { pattern: "cluster" } }] }) as ComposeParams;
    expect(p.environment).toBe("lh:sky:dusk");
    expect(p.water).toBe("water:clear-lake");
    expect(p.items).toEqual([{ id: "lh:plant:oak", count: 24, layout: { pattern: "cluster" } }]);
    expect(typeof validateCompose({ items: [{ id: "nope" }] })).toBe("string");
  });

  test("Which trees? with the brief's pick suggested", () => {
    const qs = composeChoices(params([{ id: "lh:plant:oak", count: 5 }]), {});
    expect(qs.length).toBe(1);
    expect(qs[0].id).toBe("tree");
    expect(qs[0].suggested).toBe("lh:plant:oak");
    expect(qs[0].options.length).toBeGreaterThanOrEqual(3);
    expect(qs[0].options.length).toBeLessThanOrEqual(6);
    expect(qs[0].options.every((o) => o.resourceId === o.id)).toBe(true);
  });

  test("style.vegetation wins over a pick that does not fit it (cherry blossom, not oak)", () => {
    const qs = composeChoices(params([{ id: "lh:plant:oak", count: 5 }]), { style: { vegetation: ["cherry blossom"] } });
    expect(qs[0].suggested).toBe("nature:tree:cherry-blossom");
    expect(qs[0].options.map((o) => o.id)).toContain("lh:plant:oak");
  });

  test("no question for a thing with no alternatives; 3 questions maximum", () => {
    expect(composeChoices(params([{ id: "lh:feature:lantern" }]), {}).length).toBe(0);
    const many = composeChoices(
      params([{ id: "lh:plant:oak" }, { id: "lh:plant:rose_bush" }, { id: "lh:plant:tulip" }, { id: "model:city-commercial:building-a" }]),
      {}
    );
    expect(many.map((q) => q.id)).toEqual(["tree", "bush", "flower"]);
    const kit = composeChoices(params([{ id: "model:city-commercial:building-a", count: 4 }]), {});
    expect(kit[0].id).toBe("buildings");
  });

  test("answers replace the item and share its count", () => {
    const p = params([{ id: "lh:plant:oak", count: 5, layout: { pattern: "cluster" } }, { id: "lh:feature:bench" }]);
    expect(applyComposeAnswers(p, { tree: { optionIds: ["lh:plant:oak"] } })).toEqual(p.items);
    const mixed = applyComposeAnswers(p, { tree: { optionIds: ["lh:plant:cherry", "lh:plant:pine"] } });
    expect(mixed.map((i) => [i.id, i.count])).toEqual([
      ["lh:plant:cherry", 3],
      ["lh:plant:pine", 2],
      ["lh:feature:bench", undefined]
    ]);
  });
});

// Unit tests: choice popup answer assembly, copilot settings migration and the per-request model.
// Run: cd apps/editor && bun test tests/
import { describe, expect, test } from "bun:test";
import { assembleAnswers, initialSelection, toggleOption } from "../src/lib/copilot/choice-answers";
import type { ChoiceQuestion } from "../src/lib/copilot/director/types";
import { modelForStage, parseCopilotSettings } from "../src/lib/copilot/settings";
import { requestModel } from "../src/lib/copilot/server-provider";

const trees: ChoiceQuestion = {
  id: "tree",
  title: "Which trees?",
  options: [
    { id: "cherry", label: "Cherry" },
    { id: "pine", label: "Pine" },
    { id: "oak", label: "Oak" }
  ],
  suggested: "pine",
  multiple: true
};
const meaning: ChoiceQuestion = {
  id: "meaning",
  title: "Which plane?",
  options: [
    { id: "airplane", label: "Airplane" },
    { id: "flat", label: "Flat surface" }
  ],
  suggested: "airplane"
};

describe("choice answers", () => {
  test("initial selection is the suggested option; an unknown suggestion falls back to the first", () => {
    expect(initialSelection([trees, meaning])).toEqual({ tree: ["pine"], meaning: ["airplane"] });
    expect(initialSelection([{ ...meaning, suggested: "nope" }])).toEqual({ meaning: ["airplane"] });
  });

  test("single choice replaces; multiple toggles in option order and keeps at least one", () => {
    let s = initialSelection([trees, meaning]);
    s = toggleOption(s, meaning, "flat");
    expect(s.meaning).toEqual(["flat"]);
    s = toggleOption(s, trees, "cherry");
    expect(s.tree).toEqual(["cherry", "pine"]);
    s = toggleOption(s, trees, "pine");
    expect(s.tree).toEqual(["cherry"]);
    s = toggleOption(s, trees, "cherry");
    expect(s.tree).toEqual(["cherry"]);
    expect(toggleOption(s, trees, "unknown")).toBe(s);
  });

  test("the note goes into every answer; a blank note is left out", () => {
    const s = { tree: ["oak"], meaning: ["flat"] };
    expect(assembleAnswers([trees, meaning], s, "  like this but taller ")).toEqual({
      tree: { optionIds: ["oak"], note: "like this but taller" },
      meaning: { optionIds: ["flat"], note: "like this but taller" }
    });
    expect(assembleAnswers([trees, meaning], s, "   ")).toEqual({ tree: { optionIds: ["oak"] }, meaning: { optionIds: ["flat"] } });
  });

  test("an empty or invalid selection falls back to the suggested option", () => {
    expect(assembleAnswers([trees], { tree: ["gone"] }, "")).toEqual({ tree: { optionIds: ["pine"] } });
    expect(assembleAnswers([trees], {}, "")).toEqual({ tree: { optionIds: ["pine"] } });
  });
});

describe("copilot settings migration", () => {
  test("nothing saved or bad JSON: defaults with an empty server choice", () => {
    for (const raw of [null, "", "{not json", "null"]) {
      const s = parseCopilotSettings(raw);
      expect(s.provider).toBe("server");
      expect(s.server).toEqual({});
    }
  });

  test("settings saved before the server field keep their values", () => {
    const s = parseCopilotSettings(JSON.stringify({ provider: "codex", gemini: { apiKey: "k", model: "gemini-3.1-pro-preview" }, codex: { model: "o3" }, temperature: 0.7 }));
    expect(s).toEqual({ provider: "codex", gemini: { apiKey: "k", model: "gemini-3.1-pro-preview" }, codex: { model: "o3" }, server: {}, temperature: 0.7 });
  });

  test("the old flat format migrates to gemini with an empty server choice", () => {
    const s = parseCopilotSettings(JSON.stringify({ apiKey: "k", model: "gemini-3-flash-preview", temperature: 0.2 }));
    expect(s.provider).toBe("gemini");
    expect(s.server).toEqual({});
  });

  test("server model and design model are kept, trimmed; bad values are dropped", () => {
    const ok = parseCopilotSettings(JSON.stringify({ provider: "server", server: { model: " gpt-5.6-luna ", designModel: "gpt-5.6-terra" } }));
    expect(ok.server).toEqual({ model: "gpt-5.6-luna", designModel: "gpt-5.6-terra" });
    const bad = parseCopilotSettings(JSON.stringify({ provider: "server", server: { model: 5, designModel: "   " } }));
    expect(bad.server).toEqual({});
    expect(parseCopilotSettings(JSON.stringify({ provider: "server", server: "x" })).server).toEqual({});
  });

  test("model for a stage: design falls back to the model, then to the server default", () => {
    const base = parseCopilotSettings(null);
    expect(modelForStage(base, "default")).toBe("");
    expect(modelForStage(base, "design")).toBe("");
    const withModel = { ...base, server: { model: "gpt-5.6-luna" } };
    expect(modelForStage(withModel, "design")).toBe("gpt-5.6-luna");
    expect(modelForStage({ ...base, server: { model: "gpt-5.6-luna", designModel: "gpt-5.6-terra" } }, "design")).toBe("gpt-5.6-terra");
    expect(modelForStage({ ...base, provider: "codex" }, "design")).toBe(base.codex.model);
  });
});

describe("server request model", () => {
  test("config.model wins when set, else the saved choice, else none", () => {
    expect(requestModel("gpt-5.6-terra", "gpt-5.6-luna")).toBe("gpt-5.6-terra");
    expect(requestModel("", "gpt-5.6-luna")).toBe("gpt-5.6-luna");
    expect(requestModel("  ", undefined)).toBeUndefined();
    expect(requestModel(undefined, "")).toBeUndefined();
  });
});

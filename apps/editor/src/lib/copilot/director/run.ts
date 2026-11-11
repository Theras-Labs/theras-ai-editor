// runDirector (plan docs/plans/realtime-ai-harness.md, 5B): brief -> one choice popup -> the
// generators build each task -> a summary written in code. "edit" goes back to the caller (the
// tool loop); "answer" shows the reply. No retries, no timers that call the model.
import type { EditorCore } from "@theras/editor-core";
import { requestChoices as defaultRequestChoices, suggestedAnswers } from "../choices";
import { DIRECTOR_CALL_PREFIX, streamOf } from "../agentic-loop";
import type { CopilotAttachment } from "../attachments";
import type { CopilotMessage, CopilotProvider, CopilotProviderConfig, CopilotSession, CopilotToolCall, CopilotToolResult, CopilotUsage } from "../types";
import { requestBrief as defaultRequestBrief, type BriefRequest, type BriefResponse } from "./brief";
import { composeGenerator } from "./compose";
import { objectMembership, readObjects } from "./objects";
import { readSites, siteMembership } from "./site";
import type { Brief, BriefTask, BuiltSite, ChoiceAnswers, ChoiceQuestion, DirectorContext, Generator, GeneratorResult, NextStep } from "./types";

export type DirectorMetrics = {
  startedAt: number;
  briefMs: number | null;
  /** Time the popup waited for the user. Not part of the totals. */
  choiceWaitMs: number;
  firstStepMs: number | null;
  modelCalls: number;
  usage?: CopilotUsage;
  model?: string;
};

export function newDirectorMetrics(startedAt: number): DirectorMetrics {
  return { startedAt, briefMs: null, choiceWaitMs: 0, firstStepMs: null, modelCalls: 0 };
}

export type DirectorRunOptions = {
  editor: EditorCore;
  prompt: string;
  attachments?: CopilotAttachment[];
  /** The chat before this prompt. */
  history: CopilotMessage[];
  provider: CopilotProvider;
  /** model "" = the user's saved model (server-provider.ts sends it). */
  providerConfig: CopilotProviderConfig;
  /** Model for quality stages (effort medium or high, an image brief). "" or undefined = default. */
  designModel?: string;
  /** Scene digest, library matches and playbook text for the brief. */
  context: string;
  /** World point the build starts from. */
  anchor: { x: number; z: number };
  /** Registered generators (generators/index.ts). compose is built in and always present. */
  generators: Generator[];
  signal: AbortSignal;
  onUpdate: (session: CopilotSession) => void;
  /** Called at the first visible build step (the caller hides the ghost ring). */
  onFirstStep?: () => void;
  /** Called one time for each task when its new or changed site is in the scene (the caller frames the camera). */
  onSite?: (site: BuiltSite) => void;
  metrics: DirectorMetrics;
  // Injection points for tests.
  requestBrief?: (req: BriefRequest) => Promise<BriefResponse>;
  requestChoices?: (title: string, questions: ChoiceQuestion[], signal?: AbortSignal) => Promise<ChoiceAnswers>;
};

export type DirectorOutcome =
  | { kind: "done"; session: CopilotSession; brief?: Brief }
  /** The tool loop does the work. note goes into the loop's context (understanding, chosen reading). */
  | { kind: "edit"; brief: Brief; note: string };

type TaskEntry = { title: string; result?: GeneratorResult; error?: string };

function uid(prefix = "msg"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAbort(error: unknown, signal?: AbortSignal) {
  return (error instanceof DOMException && error.name === "AbortError") || Boolean(signal?.aborted);
}

function addUsage(metrics: DirectorMetrics, usage?: CopilotUsage) {
  if (!usage) return;
  const u = metrics.usage ?? { input: 0, cached: 0, output: 0 };
  metrics.usage = { input: u.input + usage.input, cached: u.cached + usage.cached, output: u.output + usage.output };
}

// ── Pure parts (unit tested) ─────────────────────────────────

/** The generator for a task id: compose is built in; others come from the registry. */
export function findGenerator(id: string, generators: Generator[]): Generator | undefined {
  if (id === "compose") return composeGenerator;
  return generators.find((g) => g.id === id);
}

export const MEANING_QUESTION = "meaning";
/** Questions in one popup, ambiguity included. */
export const MAX_POPUP_QUESTIONS = 4;

/** The option the popup suggests for the ambiguity: the first option with tasks, else the first. */
export function suggestedMeaning(brief: Brief): string | undefined {
  const options = brief.ambiguity?.options ?? [];
  return (options.find((o) => brief.tasks.some((t) => t.option === o.id)) ?? options[0])?.id;
}

/** The ambiguity as a popup question, or null. */
export function ambiguityQuestion(brief: Brief): ChoiceQuestion | null {
  if (!brief.ambiguity) return null;
  return {
    id: MEANING_QUESTION,
    title: brief.ambiguity.question,
    options: brief.ambiguity.options.map((o) => ({ id: o.id, label: o.label, ...(o.hint ? { hint: o.hint } : {}) })),
    suggested: suggestedMeaning(brief) ?? brief.ambiguity.options[0].id
  };
}

/** The tasks that run for a reading (tasks without option run for every reading). */
export function tasksForMeaning(brief: Brief, meaning: string | undefined): BriefTask[] {
  return brief.tasks.filter((t) => !t.option || t.option === meaning);
}

export type PlannedTask = {
  task: BriefTask;
  generator?: Generator;
  params?: Record<string, unknown>;
  error?: string;
  /** A replace task: the site that is built again (its stored params are merged under the task's). */
  replace?: BuiltSite;
  /** A replace task that names a node no generator built: its id (the tool loop changes such a node). */
  plainNode?: string;
};

/**
 * Params of a replace task: the stored params of the site, then the task's params on top (same
 * generator). Another generator at the same place gets only the task's params.
 */
export function mergeReplaceParams(task: BriefTask, site: BuiltSite): Record<string, unknown> {
  if (site.generator !== task.generator) return { ...task.params };
  const merged: Record<string, unknown> = { ...site.params, ...task.params };
  // A nested record (colors) is merged one level deep, so one changed color keeps the others.
  for (const [key, value] of Object.entries(task.params)) {
    const before = site.params[key];
    if (value && before && typeof value === "object" && typeof before === "object" && !Array.isArray(value) && !Array.isArray(before)) {
      merged[key] = { ...(before as Record<string, unknown>), ...(value as Record<string, unknown>) };
    }
  }
  return merged;
}

/**
 * The task params without the taste params that the director set by itself: a param listed in
 * generator.taste stays only when the user's own words decide it, or an image is attached.
 * Returns the params and the names that were dropped.
 */
export function withoutUnaskedTaste(generator: Generator, params: Record<string, unknown>, prompt: string, hasImage: boolean): { params: Record<string, unknown>; dropped: string[] } {
  if (!generator.taste || hasImage) return { params, dropped: [] };
  const out: Record<string, unknown> = { ...params };
  const dropped: string[] = [];
  for (const [name, words] of Object.entries(generator.taste)) {
    if (!(name in out) || out[name] === undefined || out[name] === null) continue;
    if (words.test(prompt)) continue;
    delete out[name];
    dropped.push(name);
  }
  return { params: out, dropped };
}

/** Follow-ups of all results: no double labels, 4 at most. */
export function collectNext(results: (GeneratorResult | undefined)[], max = 4): NextStep[] {
  const out: NextStep[] = [];
  const seen = new Set<string>();
  // One from each result first, then the rest, so every built thing has a follow-up.
  const lists = results.map((r) => (r?.nodeIds.length ? (r.next ?? []) : []).filter((n) => n && typeof n.label === "string" && typeof n.prompt === "string" && n.label.trim() && n.prompt.trim()));
  for (let round = 0; out.length < max && lists.some((l) => l.length > round); round++) {
    for (const list of lists) {
      const n = list[round];
      if (!n || out.length >= max || seen.has(n.label.toLowerCase())) continue;
      seen.add(n.label.toLowerCase());
      out.push({ label: n.label.trim().slice(0, 40), prompt: n.prompt.trim().slice(0, 300) });
    }
  }
  return out;
}

/**
 * Popup questions of the planned tasks. A question id that two tasks share gets "#<task index>",
 * so each generator reads its own answer back by its own id (answersForTask).
 */
export function collectQuestions(
  plan: PlannedTask[],
  questionsOf: (p: PlannedTask) => ChoiceQuestion[],
  reserved: string[] = []
): { questions: ChoiceQuestion[]; owner: Map<string, { task: number; id: string }> } {
  const all: { q: ChoiceQuestion; task: number; id: string }[] = [];
  const taken = new Set(reserved);
  plan.forEach((p, task) => {
    if (!p.generator || !p.params) return;
    for (const q of questionsOf(p).slice(0, 3)) {
      if (q.options.length < 2) continue;
      const key = taken.has(q.id) ? `${q.id}#${task}` : q.id;
      taken.add(key);
      all.push({ q: { ...q, id: key }, task, id: q.id });
    }
  });
  // Scope and place ("How big?", "Where?") come before taste; then the popup limit cuts.
  const ordered = [...all.filter((e) => e.q.kind === "map"), ...all.filter((e) => e.q.kind !== "map")].slice(0, Math.max(0, MAX_POPUP_QUESTIONS - reserved.length));
  const owner = new Map<string, { task: number; id: string }>();
  for (const e of ordered) owner.set(e.q.id, { task: e.task, id: e.id });
  return { questions: ordered.map((e) => e.q), owner };
}

/** The answers of one task, by the generator's own question ids. */
export function answersForTask(task: number, answers: ChoiceAnswers, owner: Map<string, { task: number; id: string }>): ChoiceAnswers {
  const out: ChoiceAnswers = {};
  for (const [key, o] of owner) if (o.task === task && answers[key]) out[o.id] = answers[key];
  return out;
}

/** The closing chat text, written in code from the generator results (no model call). */
export function summarizeRun(entries: TaskEntry[], options: { aborted?: boolean; notes?: string[] } = {}): string {
  const lines: string[] = [];
  if (options.aborted) lines.push("Stopped.");
  for (const e of entries) {
    if (e.result) lines.push(e.result.summary || `${e.title}: done.`);
    else if (e.error) lines.push(`${e.title}: ${e.error}`);
  }
  const skipped = entries.flatMap((e) => e.result?.skipped ?? []);
  if (skipped.length) lines.push(`Not built: ${skipped.slice(0, 6).join("; ")}${skipped.length > 6 ? `; and ${skipped.length - 6} more` : ""}.`);
  for (const note of options.notes ?? []) lines.push(note);
  if (!entries.some((e) => e.result && e.result.nodeIds.length) && !options.aborted && !entries.some((e) => e.error)) lines.push("Nothing was built.");
  return lines.join("\n");
}

// ── The run ───────────────────────────────────────────────────

/** Words that ask for an action of the tool loop: dock slots or an explicit tool name. */
const ACTION_FOR_TOOL_LOOP = /\b(slots?|dock|hotbar|[a-z]+_(slots?|resources?|nodes?|primitives?|hooks?|materials?))\b/i;

export async function runDirector(opts: DirectorRunOptions): Promise<DirectorOutcome> {
  const { editor, prompt, attachments, signal, metrics } = opts;
  const requestBrief = opts.requestBrief ?? defaultRequestBrief;
  const requestChoices = opts.requestChoices ?? defaultRequestChoices;
  const now = () => Math.round(performance.now() - metrics.startedAt);

  const messages: CopilotMessage[] = [
    ...opts.history,
    { id: uid(), role: "user", content: prompt, attachments: attachments?.length ? attachments : undefined, timestamp: Date.now() }
  ];
  const session: CopilotSession = { messages, status: "thinking", iterationCount: 1 };
  const emit = () => opts.onUpdate({ ...session, messages: [...messages] });
  emit();

  // The trace message: the understanding first, then one line for each build step.
  let traceIndex = -1;
  let toolIndex = -1;
  const calls: CopilotToolCall[] = [];
  const results: CopilotToolResult[] = [];
  const setTrace = (content?: string) => {
    if (traceIndex < 0) {
      messages.push({ id: uid(), role: "assistant", content: "", timestamp: Date.now() });
      traceIndex = messages.length - 1;
    }
    messages[traceIndex] = { ...messages[traceIndex], ...(content !== undefined ? { content } : {}), toolCalls: calls.length ? [...calls] : undefined };
    if (calls.length) {
      if (toolIndex < 0) {
        messages.push({ id: uid(), role: "tool", content: "", toolResults: [], timestamp: Date.now() });
        toolIndex = messages.length - 1;
      }
      messages[toolIndex] = { ...messages[toolIndex], toolResults: [...results] };
    }
  };
  const traceLine = (name: string, label: string, detail?: string, error?: string) => {
    const id = uid(DIRECTOR_CALL_PREFIX);
    calls.push({ id, name, args: { label, ...(detail ? { detail } : {}) } });
    results.push({ callId: id, name, result: JSON.stringify(error ? { success: false, error } : { success: true }) });
    setTrace();
    emit();
  };
  const finish = (status: CopilotSession["status"], text: string, brief?: Brief, suggestions: NextStep[] = []): DirectorOutcome => {
    if (text) messages.push({ id: uid(), role: "assistant", content: text, timestamp: Date.now(), ...(suggestions.length ? { suggestions } : {}) });
    session.status = status;
    session.messages = messages;
    emit();
    return { kind: "done", session, brief };
  };

  // 1. The brief: ONE model call.
  let briefResponse: BriefResponse;
  let streamedText = "";
  try {
    const hasImage = Boolean(attachments?.some((a) => a.kind === "image"));
    briefResponse = await requestBrief({
      provider: opts.provider,
      providerConfig: { ...opts.providerConfig, ...(hasImage && opts.designModel ? { model: opts.designModel } : {}) },
      prompt,
      attachments,
      history: opts.history,
      context: opts.context,
      generators: [composeGenerator, ...opts.generators.filter((g) => g.id !== "compose")].map((g) => ({ id: g.id, describe: g.describe })),
      signal,
      onText: (delta) => {
        streamedText += delta;
        setTrace(streamedText);
        emit();
      }
    });
  } catch (error) {
    if (isAbort(error, signal)) {
      if (traceIndex >= 0 && !messages[traceIndex].content) messages.splice(traceIndex, 1);
      session.status = "aborted";
      emit();
      return { kind: "done", session };
    }
    session.status = "error";
    session.error = error instanceof Error ? error.message : "The director call failed.";
    emit();
    return { kind: "done", session };
  }
  metrics.briefMs = briefResponse.ms;
  metrics.modelCalls += 1;
  addUsage(metrics, briefResponse.usage);
  if (briefResponse.model) metrics.model = briefResponse.model;
  const { brief, notes } = briefResponse;
  console.info(
    `[AI-VIBE] brief ${briefResponse.ms}ms mode=${brief.mode} tasks=${brief.tasks.map((t) => `${t.generator}${t.option ? `@${t.option}` : ""}${t.replace ? `>${t.replace}` : ""} ${JSON.stringify(t.params)}${t.ask ? ` ask=${t.ask.join("+")}` : ""}`).join(" | ") || "-"}${brief.ambiguity ? " ambiguity" : ""}`
  );

  // The director sees no editor tools. A request for an action it cannot see (a dock slot, a
  // named tool) is work for the tool loop, never an answer such as "that tool is not available".
  if (brief.mode === "answer" && ACTION_FOR_TOOL_LOOP.test(prompt)) brief.mode = "edit";
  if (brief.mode === "answer") {
    if (traceIndex >= 0) messages.splice(traceIndex, 1);
    return finish("idle", brief.reply || brief.understanding || "I have no answer.", brief);
  }
  if (brief.mode === "edit") {
    if (traceIndex >= 0) messages.splice(traceIndex, 1);
    return { kind: "edit", brief, note: brief.understanding ? `[Director] ${brief.understanding}` : "" };
  }

  // The understanding is the first live line.
  session.status = "executing";
  setTrace(brief.understanding || streamedText);
  emit();

  // 2. Validate the tasks of the suggested reading, then ONE popup.
  const sitesAtStart = readSites(editor);
  const hasImageAttachment = Boolean(attachments?.some((a) => a.kind === "image"));
  // Size and place of each known site: a site with another signature is new or changed.
  const siteSignature = (s: BuiltSite) => `${s.facts.rect.x0},${s.facts.rect.z0},${s.facts.rect.x1},${s.facts.rect.z1},${s.facts.height ?? 0}`;
  const knownSites = new Map(sitesAtStart.map((s) => [s.id, siteSignature(s)]));
  const knownObjects = new Map(readObjects(editor).map((o) => [o.id, siteSignature(o)]));
  /**
   * Shows what a task built or changed. objectChange: the task changes a modeled object (bigger,
   * copies); the view then moves only when it does not show the result (a cactus that grew from
   * 4 m to 12 m filled the whole view). A NEW small object never moves the view.
   */
  const announceSite = (objectChange = false) => {
    const fresh = readSites(editor).filter((s) => knownSites.get(s.id) !== siteSignature(s));
    for (const s of fresh) knownSites.set(s.id, siteSignature(s));
    if (fresh.length) opts.onSite?.(fresh[fresh.length - 1]);
    const changed = readObjects(editor).filter((o) => knownObjects.get(o.id) !== siteSignature(o));
    for (const o of changed) knownObjects.set(o.id, siteSignature(o));
    if (objectChange && changed.length && !fresh.length) opts.onSite?.(changed[changed.length - 1]);
    return fresh.length > 0 || (objectChange && changed.length > 0);
  };
  const ctxBase = { editor, prompt, brief, attachments, anchor: opts.anchor, signal, sites: sitesAtStart };
  // What a replace task may name: a site, a modeled object (objects.ts), or a node inside one of them.
  const objectsAtStart = readObjects(editor);
  const findReplace = (id: string): BuiltSite | undefined => {
    const direct = sitesAtStart.find((s) => s.id === id) ?? objectsAtStart.find((o) => o.id === id);
    if (direct) return direct;
    const inObject = objectMembership(editor, objectsAtStart).get(id);
    if (inObject) return objectsAtStart.find((o) => o.id === inObject);
    const inSite = siteMembership(editor, sitesAtStart).get(id);
    return inSite ? sitesAtStart.find((s) => s.id === inSite) : undefined;
  };
  const plan = (meaning: string | undefined): PlannedTask[] =>
    tasksForMeaning(brief, meaning).map((task) => {
      const generator = findGenerator(task.generator, opts.generators);
      if (!generator) return { task, error: `The ${task.generator} generator is not available yet, so this part was not built.` };
      // A change to something a generator built: its stored params, with the task's on top.
      let replace: BuiltSite | undefined;
      let raw = task.params;
      if (task.replace) {
        replace = findReplace(task.replace);
        if (!replace) {
          // The node is there, but no generator has a record of it: the tool loop can change it.
          if (editor.scene?.nodes?.has(task.replace)) return { task, generator, error: `"${task.replace}" is in the scene, but no generator built it, so the ${task.generator} generator cannot change it.`, plainNode: task.replace };
          return { task, generator, error: `"${task.replace}" is not in the scene, so there is nothing to change.` };
        }
        raw = mergeReplaceParams(task, replace);
        // Params the user wants to choose again: not given, so the generator asks.
        for (const key of task.ask ?? []) if (!(key in task.params)) delete raw[key];
      } else {
        // Taste that the director set by itself goes back to the user (the popup asks).
        const stripped = withoutUnaskedTaste(generator, raw, prompt, hasImageAttachment);
        if (stripped.dropped.length) console.info(`[AI-VIBE] taste params of ${task.generator} go to the user: ${stripped.dropped.join(", ")}`);
        raw = stripped.params;
      }
      try {
        const v = generator.validate(raw, brief);
        return typeof v === "string" ? { task, generator, error: v, replace } : { task, generator, params: v, replace };
      } catch (error) {
        return { task, generator, error: `invalid parameters (${error instanceof Error ? error.message : String(error)})`, replace };
      }
    });
  const anchorOf = (p: PlannedTask) => (p.replace ? { ...p.replace.facts.center } : opts.anchor);
  const meaningQ = ambiguityQuestion(brief);
  let meaning = meaningQ?.suggested;
  let planned = plan(meaning);
  // Every task names a node that no generator built (a library object, a primitive): this is
  // an edit of that node, so the tool loop does it. A false "not in the scene" helps nobody.
  if (planned.length > 0 && planned.every((p) => p.plainNode)) {
    if (traceIndex >= 0) messages.splice(traceIndex, 1);
    const ids = planned.map((p) => p.plainNode).join(", ");
    console.info(`[AI-VIBE] replace of plain nodes ${ids}: handed to the tool loop`);
    return {
      kind: "edit",
      brief: { ...brief, mode: "edit", tasks: [] },
      note: `[Director] ${brief.understanding} The target (${ids}) is a plain node that no generator built: change it with the node tools (scale, move, color), in place.`
    };
  }
  const { questions, owner } = collectQuestions(
    planned,
    (p) => {
      try {
        return p.generator!.choices?.(p.params!, { ...ctxBase, anchor: anchorOf(p), ...(p.replace ? { replace: p.replace, ask: p.task.ask ?? [] } : {}) }) ?? [];
      } catch (error) {
        console.warn("[AI-VIBE] choices failed:", error);
        return [];
      }
    },
    meaningQ ? [MEANING_QUESTION] : []
  );
  const allQuestions = meaningQ ? [meaningQ, ...questions] : questions;
  let answers: ChoiceAnswers = {};
  if (allQuestions.length) {
    const t0 = performance.now();
    answers = await requestChoices(brief.understanding || "A few choices before the build", allQuestions, signal);
    metrics.choiceWaitMs += Math.round(performance.now() - t0);
    if (signal.aborted) return finish("aborted", "Stopped before the build.", brief);
  }
  const userNote = Object.values(answers).find((a) => a.note?.trim())?.note?.trim();

  if (meaningQ) {
    const chosen = answers[MEANING_QUESTION]?.optionIds[0] ?? meaningQ.suggested;
    if (chosen !== meaning) {
      meaning = chosen;
      planned = plan(meaning);
    }
    if (planned.length === 0) {
      // A reading with no task (a plain shape): the tool loop builds it.
      const label = brief.ambiguity!.options.find((o) => o.id === meaning)?.label ?? meaning;
      if (traceIndex >= 0) messages.splice(traceIndex, 1);
      return {
        kind: "edit",
        brief,
        note: [`[Director] The user means: ${label}.`, userNote ? `User note: ${userNote}` : ""].filter(Boolean).join("\n")
      };
    }
  }

  // 3. Build each task.
  const entries: TaskEntry[] = [];
  let aborted = false;
  for (const [index, p] of planned.entries()) {
    if (signal.aborted) {
      aborted = true;
      break;
    }
    const taskAnswers: ChoiceAnswers = {
      ...(p.generator && p.params ? suggestedAnswers(questions.filter((q) => owner.get(q.id)?.task === index).map((q) => ({ ...q, id: owner.get(q.id)!.id }))) : {}),
      ...answersForTask(index, answers, owner)
    };
    if (p.error || !p.generator || !p.params) {
      entries.push({ title: p.task.title, error: p.error ?? "not built" });
      traceLine(p.task.generator, p.task.title, undefined, p.error);
      continue;
    }
    const generator = p.generator;
    let siteAnnounced = false;
    const ctx: DirectorContext = {
      ...ctxBase,
      anchor: anchorOf(p),
      // Earlier tasks of this brief are sites too (a river task after a city task reads the plan).
      sites: index === 0 ? sitesAtStart : readSites(editor),
      ...(p.replace ? { replace: p.replace, ask: p.task.ask ?? [] } : {}),
      step: (label, detail) => {
        if (metrics.firstStepMs === null) {
          metrics.firstStepMs = now() - metrics.choiceWaitMs;
          opts.onFirstStep?.();
        }
        if (!siteAnnounced) siteAnnounced = announceSite(p.replace?.generator === "object");
        traceLine(generator.id, label, detail);
      },
      pause: (ms) =>
        new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, ms);
          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }),
      callModel: async (request) => {
        const effort = request.effort ?? "low";
        const quality = effort === "medium" || effort === "high";
        const res = await streamOf(opts.provider)(
          [{ id: uid(), role: "user", content: request.user, attachments: request.attachments?.length ? request.attachments : undefined, timestamp: Date.now() }],
          request.tool ? [request.tool] : [],
          request.system,
          { ...opts.providerConfig, profile: `generator:${generator.id}`, effort, ...(quality && opts.designModel ? { model: opts.designModel } : {}) },
          (event) => {
            if (event.type === "tool_call" && request.tool && event.call.name === request.tool.name) request.onToolCall?.(event.call.args);
          },
          signal
        );
        metrics.modelCalls += 1;
        addUsage(metrics, res.usage);
        const call = res.toolCalls.find((c) => !request.tool || c.name === request.tool.name);
        return { text: res.text, toolArgs: call?.args };
      }
    };
    try {
      ctx.built = entries.map((e) => ({ title: e.title, nodeIds: e.result?.nodeIds ?? [] }));
      const result = await generator.run(p.params, taskAnswers, ctx);
      if (!siteAnnounced) siteAnnounced = announceSite(p.replace?.generator === "object");
      entries.push({ title: p.task.title, result });
      if (result.nodeIds.length === 0 && calls.every((c) => c.name !== generator.id)) traceLine(generator.id, p.task.title, "nothing built");
    } catch (error) {
      if (isAbort(error, signal)) {
        aborted = true;
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AI-VIBE] generator ${generator.id} failed:`, error);
      entries.push({ title: p.task.title, error: `the ${generator.id} generator failed (${message}). The other parts continue.` });
      traceLine(generator.id, p.task.title, undefined, message);
    }
  }

  return finish(aborted ? "aborted" : "idle", summarizeRun(entries, { aborted, notes }), brief, aborted ? [] : collectNext(entries.map((e) => e.result)));
}

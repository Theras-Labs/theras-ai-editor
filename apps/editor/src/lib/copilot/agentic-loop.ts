import type {
  CopilotMessage,
  CopilotProvider,
  CopilotProviderConfig,
  CopilotSession,
  CopilotStreamEvent,
  CopilotStreamResult,
  CopilotToolCall,
  CopilotToolDeclaration,
  CopilotToolResult,
  CopilotUsage
} from "./types";
import type { CopilotAttachment } from "./attachments";
import { gatedComposeTools } from "./tool-profiles";

/** Tool results of the latest this many steps go to the model in full (plan 5.11). */
export const HISTORY_FULL_STEPS = 2;

/** One line for an old tool result: "ok", or the error text. */
export function summarizeToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result) as { success?: boolean; error?: unknown };
    if (parsed && parsed.success === false) return `error: ${typeof parsed.error === "string" ? parsed.error : "failed"}`.slice(0, 200);
  } catch {
    // not JSON: keep it short
    return result.length > 80 ? `${result.slice(0, 80)}...` : result;
  }
  return "ok";
}

/**
 * History trim for the request (plan 5.11): tool results older than the latest
 * HISTORY_FULL_STEPS tool steps become one line ("ok" or the error text). Returns new message
 * objects; the stored chat history (shown in the UI) does not change.
 */
export function trimHistoryForRequest(messages: CopilotMessage[], keepSteps = HISTORY_FULL_STEPS): CopilotMessage[] {
  const toolIndexes = messages.flatMap((m, i) => (m.role === "tool" && m.toolResults?.length ? [i] : []));
  const cut = new Set(toolIndexes.slice(0, Math.max(0, toolIndexes.length - keepSteps)));
  if (cut.size === 0) return messages;
  return messages.map((m, i) =>
    cut.has(i) ? { ...m, toolResults: m.toolResults!.map((r) => ({ ...r, result: summarizeToolResult(r.result) })) } : m
  );
}

/** Call ids of director trace lines ("Roads", "12 buildings") start with this. They are chat UI only. */
export const DIRECTOR_CALL_PREFIX = "dir_";

/**
 * The chat as a model may see it: director trace lines (calls with DIRECTOR_CALL_PREFIX ids and
 * their results) are not real tools, so they are removed. A message left empty is removed.
 */
export function historyForModel(messages: CopilotMessage[]): CopilotMessage[] {
  const isTrace = (id: string) => id.startsWith(DIRECTOR_CALL_PREFIX);
  if (!messages.some((m) => m.toolCalls?.some((c) => isTrace(c.id)) || m.toolResults?.some((r) => isTrace(r.callId)))) return messages;
  const out: CopilotMessage[] = [];
  for (const m of messages) {
    const toolCalls = m.toolCalls?.filter((c) => !isTrace(c.id));
    const toolResults = m.toolResults?.filter((r) => !isTrace(r.callId));
    if (m.role === "tool" && !toolResults?.length) continue;
    if (m.role === "assistant" && !m.content && !toolCalls?.length) continue;
    out.push({
      ...m,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      toolResults: toolResults?.length ? toolResults : undefined,
      // Raw provider parts of a trace message would replay the removed calls.
      rawParts: m.toolCalls?.some((c) => isTrace(c.id)) ? undefined : m.rawParts
    });
  }
  return out;
}

/** True when a search_resources result says that the library has no match (asset-first gate). */
function isEmptySearch(result: CopilotToolResult) {
  if (result.name !== "search_resources") return false;
  try {
    const parsed = JSON.parse(result.result) as { noMatch?: boolean; results?: unknown[] };
    return parsed.noMatch === true || (Array.isArray(parsed.results) && parsed.results.length === 0);
  } catch {
    return false;
  }
}

/** Numbers the loop fills while it runs (plan 4.8). Times are ms after startedAt (performance.now()). */
export type LoopMetrics = {
  startedAt: number;
  steps: number;
  firstToolMs: number | null;
  usage?: CopilotUsage;
  model?: string;
  profile?: string;
  /** True when the loop switched to the escalation tool set. */
  escalated?: boolean;
};

export type AgenticLoopConfig = {
  maxIterations: number;
  provider: CopilotProvider;
  providerConfig: CopilotProviderConfig;
  systemPrompt: string;
  tools: CopilotToolDeclaration[];
  executeTool: (call: CopilotToolCall) => CopilotToolResult;
  /** Pause after each tool that changes the scene, so the build plays out piece by piece. */
  toolDelayMs?: number;
  onUpdate: (session: CopilotSession) => void;
  /**
   * Text added to the end of the latest user message in every request of this prompt (the
   * scene digest). It is not shown in the chat and not saved. It goes last, so the system
   * prompt and the tools stay a byte-identical prefix between steps (prompt cache).
   */
  contextSuffix?: string;
  /**
   * One-time switch to a bigger tool set: when a step ends with text only and shouldEscalate
   * says yes, that text is dropped and the loop continues with these tools (plan 4.5).
   */
  escalation?: {
    profile: string;
    systemPrompt: string;
    tools: CopilotToolDeclaration[];
    shouldEscalate: (text: string) => boolean;
  };
  metrics?: LoopMetrics;
  /**
   * Ends the run in code after a step whose tool calls all succeeded (no text-only final step,
   * plan 9). Returns the closing text for the chat, or null to continue with the model.
   */
  finishOnSuccess?: (calls: CopilotToolCall[], results: CopilotToolResult[]) => string | null;
};

function uid(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const TAG = "[AI-VIBE]";

export type StreamFn = (
  messages: CopilotMessage[],
  tools: CopilotToolDeclaration[],
  systemPrompt: string,
  config: CopilotProviderConfig,
  onEvent: (event: Extract<CopilotStreamEvent, { type: "text" } | { type: "tool_call" }>) => void,
  signal?: AbortSignal
) => Promise<CopilotStreamResult>;

/** The provider's stream, or one request replayed as events (Gemini). */
export function streamOf(provider: CopilotProvider): StreamFn {
  if (provider.streamContent) return provider.streamContent.bind(provider);
  return async (messages, tools, systemPrompt, config, onEvent, signal) => {
    const response = await provider.generateContent(messages, tools, systemPrompt, config, signal);
    if (response.text) onEvent({ type: "text", delta: response.text });
    for (const call of response.toolCalls) onEvent({ type: "tool_call", call });
    return { ...response, streamed: false };
  };
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function runAgenticLoop(
  userPrompt: string,
  existingMessages: CopilotMessage[],
  config: AgenticLoopConfig,
  signal?: AbortSignal,
  attachments?: CopilotAttachment[]
): Promise<CopilotSession> {
  let tools = config.tools;
  let systemPrompt = config.systemPrompt;
  let providerConfig = config.providerConfig;
  let escalated = false;
  // Asset-first gate (plan 5.3): in the compose profile, place_primitive(s) only after a search found nothing.
  let noSearchMatch = false;
  const metrics = config.metrics;
  const stream = streamOf(config.provider);

  console.group(`${TAG} Session start`);
  console.log(`${TAG} User prompt:`, userPrompt);
  console.log(`${TAG} Model:`, providerConfig.model || "(server choice)");
  console.log(`${TAG} Profile:`, providerConfig.profile ?? "(none)");
  console.log(`${TAG} Temperature:`, providerConfig.temperature);
  console.log(`${TAG} Tools available:`, tools.map((t) => t.name));
  console.log(`${TAG} System prompt:\n`, systemPrompt);
  if (config.contextSuffix) console.log(`${TAG} Scene digest:\n`, config.contextSuffix);
  console.log(`${TAG} Existing messages:`, existingMessages.length);
  console.groupEnd();

  const messages: CopilotMessage[] = [
    ...existingMessages,
    {
      id: uid(),
      role: "user",
      content: userPrompt,
      attachments: attachments?.length ? attachments : undefined,
      timestamp: Date.now()
    }
  ];
  const userIndex = messages.length - 1;

  const session: CopilotSession = {
    messages,
    status: "thinking",
    iterationCount: 0
  };

  const emit = () => config.onUpdate({ ...session, messages: [...messages] });
  emit();

  /** What the model sees: the chat (old tool results trimmed), with the digest at the end of this prompt's user message. */
  // Only earlier prompts are trimmed, one time: the request of each step then starts with the
  // same bytes as the step before, so the provider's prompt cache covers the whole earlier part.
  const trimmedEarlier = trimHistoryForRequest(historyForModel(messages.slice(0, userIndex)));
  const requestMessages = (): CopilotMessage[] => {
    const copy = [...trimmedEarlier, ...messages.slice(userIndex)];
    if (!config.contextSuffix) return copy;
    const at = trimmedEarlier.length; // this prompt's user message (trace lines may have been removed before it)
    copy[at] = { ...copy[at], content: `${copy[at].content}\n\n${config.contextSuffix}` };
    return copy;
  };

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    if (signal?.aborted) {
      console.log(`${TAG} Aborted at iteration ${iteration + 1}`);
      session.status = "aborted";
      emit();
      return session;
    }

    session.status = "thinking";
    session.iterationCount = iteration + 1;
    if (metrics) metrics.steps = iteration + 1;
    emit();

    console.group(`${TAG} Iteration ${iteration + 1}`);
    console.log(`${TAG} Sending ${messages.length} messages to LLM...`);

    // The assistant message of this step appears with the first text or tool call and grows live.
    let assistantIndex = -1;
    let toolIndex = -1;
    const patchAssistant = (patch: Partial<CopilotMessage>) => {
      if (assistantIndex < 0) {
        messages.push({ id: uid(), role: "assistant", content: "", timestamp: Date.now() });
        assistantIndex = messages.length - 1;
      }
      messages[assistantIndex] = { ...messages[assistantIndex], ...patch };
    };

    const executed: CopilotToolCall[] = [];
    const results: CopilotToolResult[] = [];
    const queued = new Set<string>();
    let chain: Promise<void> = Promise.resolve();

    const runCall = async (toolCall: CopilotToolCall) => {
      if (signal?.aborted) return;
      session.status = "executing";
      console.log(`  ${TAG} → ${toolCall.name}`, JSON.stringify(toolCall.args));

      const t0 = performance.now();
      const result = config.executeTool(toolCall);
      const elapsed = Math.round(performance.now() - t0);
      if (metrics && metrics.firstToolMs === null) metrics.firstToolMs = Math.round(performance.now() - metrics.startedAt);

      let parsed: { success?: boolean; error?: unknown } = {};
      try {
        parsed = JSON.parse(result.result);
      } catch {
        // not JSON
      }
      if (parsed.success === false) {
        console.warn(`  ${TAG} ✗ ${toolCall.name} FAILED (${elapsed}ms):`, parsed.error);
      } else {
        console.log(`  ${TAG} ✓ ${toolCall.name} (${elapsed}ms):`, result.result);
      }

      executed.push(toolCall);
      results.push(result);
      if (isEmptySearch(result)) noSearchMatch = true;
      patchAssistant({ toolCalls: [...executed] });
      if (toolIndex < 0) {
        messages.push({ id: uid(), role: "tool", content: "", toolResults: [], timestamp: Date.now() });
        toolIndex = messages.length - 1;
      }
      messages[toolIndex] = { ...messages[toolIndex], toolResults: [...results] };
      emit();

      if (config.toolDelayMs && !/^(list|get)_/.test(toolCall.name)) {
        await new Promise((resolve) => setTimeout(resolve, config.toolDelayMs));
      }
    };

    // Each tool call runs when it arrives, one after the other, while the model still writes.
    const enqueue = (call: CopilotToolCall) => {
      if (queued.has(call.id)) return;
      queued.add(call.id);
      chain = chain.then(() => runCall(call));
    };

    /** Abort or error: keep only calls that have a result, so the history stays valid. */
    const closeStep = (status: "aborted" | "error", error?: string) => {
      if (assistantIndex >= 0) {
        const { rawParts: _raw, ...rest } = messages[assistantIndex];
        messages[assistantIndex] = executed.length ? { ...rest, toolCalls: [...executed] } : { ...rest, toolCalls: undefined };
        if (!messages[assistantIndex].content && executed.length === 0) messages.splice(assistantIndex, 1);
      }
      console.groupEnd();
      session.status = status;
      if (error) session.error = error;
      emit();
      return session;
    };

    let response: CopilotStreamResult;
    const t0 = performance.now();
    try {
      const stepTools = gatedComposeTools(tools, userPrompt, noSearchMatch);
      if (stepTools !== tools) console.log(`${TAG} Asset-first gate: place_primitive(s) held back until a search finds no match`);
      response = await stream(
        requestMessages(),
        stepTools,
        systemPrompt,
        providerConfig,
        (event) => {
          if (signal?.aborted) return;
          if (event.type === "text") {
            patchAssistant({ content: `${assistantIndex >= 0 ? messages[assistantIndex].content : ""}${event.delta}` });
            emit();
          } else {
            enqueue(event.call);
          }
        },
        signal
      );
    } catch (error) {
      // Let the tool that runs now finish; queued ones stop at the abort check.
      await chain;
      console.error(`${TAG} LLM error:`, error);
      if (isAbort(error) || signal?.aborted) return closeStep("aborted");
      return closeStep("error", error instanceof Error ? error.message : "Unknown API error");
    }

    console.log(
      `${TAG} LLM responded in ${Math.round(performance.now() - t0)}ms${response.streamed ? " (streamed)" : ""}` +
        (response.usage ? ` in=${response.usage.input} cached=${response.usage.cached} out=${response.usage.output}` : "")
    );
    if (metrics) {
      if (response.model) metrics.model = response.model;
      if (response.usage) {
        const u = metrics.usage ?? { input: 0, cached: 0, output: 0 };
        metrics.usage = { input: u.input + response.usage.input, cached: u.cached + response.usage.cached, output: u.output + response.usage.output };
      }
    }

    // A call that had no tool_call event still runs now.
    for (const call of response.toolCalls) enqueue(call);
    await chain;
    if (signal?.aborted) {
      console.log(`${TAG} Aborted during tool execution`);
      return closeStep("aborted");
    }

    if (executed.length === 0) {
      console.log(`${TAG} Final text response:`, response.text);

      if (config.escalation && !escalated && config.escalation.shouldEscalate(response.text)) {
        // One time only: drop the "missing tool" text and continue with the bigger tool set.
        escalated = true;
        if (assistantIndex >= 0) messages.splice(assistantIndex, 1);
        tools = config.escalation.tools;
        systemPrompt = config.escalation.systemPrompt;
        providerConfig = { ...providerConfig, profile: config.escalation.profile };
        if (metrics) {
          metrics.escalated = true;
          metrics.profile = `${metrics.profile ?? "?"}>${config.escalation.profile}`;
        }
        console.warn(`${TAG} The step asked for a tool that is not in this profile. One more step with "${config.escalation.profile}".`);
        console.groupEnd();
        emit();
        continue;
      }

      console.groupEnd();
      patchAssistant({ content: response.text, rawParts: response.rawParts });
      session.status = "idle";
      session.messages = messages;
      emit();
      return session;
    }

    patchAssistant({ content: response.text || messages[assistantIndex]?.content || "", toolCalls: [...executed], rawParts: response.rawParts });
    console.groupEnd();

    const closing = config.finishOnSuccess?.(executed, results) ?? null;
    if (closing !== null) {
      console.log(`${TAG} All tool calls of the step succeeded. The run ends in code (no text-only step).`);
      messages.push({ id: uid(), role: "assistant", content: closing, timestamp: Date.now() });
      session.status = "idle";
      session.messages = messages;
      emit();
      return session;
    }
    emit();
  }

  console.warn(`${TAG} Hit max iterations (${config.maxIterations})`);

  messages.push({
    id: uid(),
    role: "assistant",
    content: "Reached maximum iterations. Stopping here.",
    timestamp: Date.now()
  });

  session.status = "idle";
  session.messages = messages;
  emit();
  return session;
}

// OpenAI Responses API (/v1/responses). GPT-5.6 models accept function tools only here.
// store:false keeps nothing on OpenAI; reasoning items come back encrypted in rawParts and
// the editor sends them back on the next step, so the model keeps its reasoning context.
import { reasoningEffortFor } from "./config";
import { readSSE } from "./sse";
import { newCallId, parseArgs, UpstreamError, type ChatRequest, type ChatResult, type StreamEmit, type Usage, type WireToolCall } from "./wire";

const URL = "https://api.openai.com/v1/responses";

// GPT-5 and o-series models accept only the default temperature.
export const fixedTemperature = (model: string) => /^(gpt-5|o\d)/.test(model);

const OPENAI_ITEM_TYPES = new Set(["reasoning", "message", "function_call"]);
/** True when rawParts are Responses API output items (Gemini parts have no "type" field). */
function isOpenAIItems(parts: unknown[] | undefined): parts is Record<string, unknown>[] {
  return !!parts && parts.length > 0 &&
    parts.every((p) => typeof p === "object" && p !== null && OPENAI_ITEM_TYPES.has((p as { type?: string }).type ?? ""));
}

function toInput(req: ChatRequest) {
  const input: Record<string, unknown>[] = [];
  for (const m of req.messages) {
    if (m.role === "user") {
      if (m.attachments?.length) {
        const content: Record<string, unknown>[] = [{ type: "input_text", text: m.content }];
        for (const a of m.attachments) {
          if (a.kind === "text") content.push({ type: "input_text", text: a.text });
          else if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(a.dataUrl)) content.push({ type: "input_image", image_url: a.dataUrl });
        }
        input.push({ role: "user", content });
      } else input.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (isOpenAIItems(m.rawParts)) {
        input.push(...m.rawParts);
        continue;
      }
      if (m.content) input.push({ role: "assistant", content: m.content });
      for (const c of m.toolCalls ?? []) {
        input.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.args ?? {}) });
      }
    } else if (m.role === "tool") {
      for (const r of m.toolResults ?? []) {
        input.push({ type: "function_call_output", call_id: r.callId, output: r.result });
      }
    }
  }
  return input;
}

function requestBody(req: ChatRequest, model: string): Record<string, unknown> {
  const reasoning = fixedTemperature(model);
  const body: Record<string, unknown> = {
    model,
    instructions: req.systemPrompt,
    input: toInput(req),
    tools: req.tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false
    })),
    tool_choice: "auto",
    store: false
  };
  if (reasoning) {
    body.include = ["reasoning.encrypted_content"];
    const effort = req.effort ?? reasoningEffortFor(req.profile);
    if (effort) body.reasoning = { effort };
  } else {
    body.temperature = req.temperature;
  }
  return body;
}

function toUsage(u: any): Usage {
  return {
    input: Number(u?.input_tokens) || 0,
    cached: Number(u?.input_tokens_details?.cached_tokens) || 0,
    output: Number(u?.output_tokens) || 0
  };
}

function toolCallOf(item: any): WireToolCall {
  return { id: item.call_id || newCallId(), name: item.name ?? "", args: parseArgs(item.arguments) };
}

function textOf(output: any[]): string {
  let text = "";
  for (const item of output) {
    if (item?.type === "message") for (const c of item.content ?? []) if (c?.type === "output_text") text += c.text ?? "";
  }
  return text;
}

export async function chatOpenAI(req: ChatRequest, model: string, apiKey: string, signal: AbortSignal): Promise<ChatResult> {
  const body = requestBody(req, model);
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new UpstreamError(json?.error?.message ?? `OpenAI HTTP ${res.status}`, res.status);
  }

  const output: any[] = Array.isArray(json?.output) ? json.output : [];
  const toolCalls = output.filter((i) => i?.type === "function_call").map(toolCallOf);
  return { text: textOf(output), toolCalls, rawParts: output.filter((i) => OPENAI_ITEM_TYPES.has(i?.type)), usage: toUsage(json?.usage) };
}

/**
 * Streamed variant (stream:true). Calls emit for each text delta and for each COMPLETE
 * function_call item (response.output_item.done). Resolves with the final result built from
 * response.completed. Throws UpstreamError on HTTP errors, response.failed and error events.
 */
export async function streamOpenAI(req: ChatRequest, model: string, apiKey: string, signal: AbortSignal, emit: StreamEmit): Promise<ChatResult> {
  const body = requestBody(req, model);
  body.stream = true;
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as any;
    throw new UpstreamError(json?.error?.message ?? `OpenAI HTTP ${res.status}`, res.status);
  }

  const emitted: WireToolCall[] = [];
  const emittedIds = new Set<string>();
  let streamedText = "";
  let final: any = null;
  let failure: UpstreamError | null = null;

  const emitCall = (item: any) => {
    const call = toolCallOf(item);
    if (emittedIds.has(call.id)) return;
    emittedIds.add(call.id);
    emitted.push(call);
    emit({ type: "tool_call", call });
  };

  await readSSE(res.body, (data) => {
    if (failure || data === "[DONE]") return;
    let ev: any;
    try {
      ev = JSON.parse(data);
    } catch {
      return;
    }
    switch (ev?.type) {
      case "response.output_text.delta":
        if (typeof ev.delta === "string" && ev.delta) {
          streamedText += ev.delta;
          emit({ type: "text", delta: ev.delta });
        }
        break;
      case "response.output_item.done":
        if (ev.item?.type === "function_call") emitCall(ev.item);
        break;
      case "response.completed":
      case "response.incomplete":
        final = ev.response ?? {};
        break;
      case "response.failed":
        failure = new UpstreamError(ev.response?.error?.message ?? "OpenAI response failed", 502);
        break;
      case "error":
        failure = new UpstreamError(ev.message ?? ev.error?.message ?? "OpenAI stream error", 502);
        break;
    }
  });

  if (failure) throw failure;
  if (!final) throw new UpstreamError("OpenAI stream ended without response.completed", 502);

  const output: any[] = Array.isArray(final.output) ? final.output : [];
  // A function_call that had no output_item.done event still reaches the editor before "done".
  for (const item of output) if (item?.type === "function_call") emitCall(item);
  return {
    text: textOf(output) || streamedText,
    toolCalls: emitted,
    rawParts: output.filter((i) => OPENAI_ITEM_TYPES.has(i?.type)),
    usage: toUsage(final.usage)
  };
}

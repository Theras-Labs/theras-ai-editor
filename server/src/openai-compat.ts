// OpenAI-compatible Chat Completions (/chat/completions) with stream:true. Used by the
// "local" provider (Ollama, LM Studio, llama.cpp server, vLLM, or any hosted model with an
// OpenAI-compatible API). Tool-call deltas are assembled by index; one tool_call event is
// emitted when a call is complete (the next call starts, finish_reason arrives, or the stream ends).
import { readSSE } from "./sse";
import { newCallId, parseArgs, UpstreamError, type ChatRequest, type ChatResult, type StreamEmit, type Usage, type WireToolCall } from "./wire";

function toMessages(req: ChatRequest) {
  const messages: Record<string, unknown>[] = [{ role: "system", content: req.systemPrompt }];
  for (const m of req.messages) {
    if (m.role === "user") {
      if (m.attachments?.length) {
        const content: Record<string, unknown>[] = [{ type: "text", text: m.content }];
        for (const a of m.attachments) {
          if (a.kind === "text") content.push({ type: "text", text: a.text });
          else if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(a.dataUrl)) content.push({ type: "image_url", image_url: { url: a.dataUrl } });
        }
        messages.push({ role: "user", content });
      } else messages.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      // rawParts from other providers are ignored; content and toolCalls carry the step.
      const msg: Record<string, unknown> = { role: "assistant", content: m.content || null };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) }
        }));
      }
      if (msg.content !== null || msg.tool_calls) messages.push(msg);
    } else if (m.role === "tool") {
      for (const r of m.toolResults ?? []) messages.push({ role: "tool", tool_call_id: r.callId, content: r.result });
    }
  }
  return messages;
}

type Pending = { id: string; name: string; args: string };

export async function streamCompat(
  req: ChatRequest,
  model: string,
  baseUrl: string,
  apiKey: string,
  signal: AbortSignal,
  emit: StreamEmit
): Promise<ChatResult> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "text/event-stream" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const body: Record<string, unknown> = {
    model,
    messages: toMessages(req),
    temperature: req.temperature,
    stream: true,
    stream_options: { include_usage: true }
  };
  if (req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = "auto";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const raw = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(raw);
      message = j?.error?.message ?? (typeof j?.error === "string" ? j.error : message);
    } catch {
      if (raw) message = raw.slice(0, 300);
    }
    throw new UpstreamError(message, res.status);
  }

  const toolCalls: WireToolCall[] = [];
  const pending = new Map<number, Pending>();
  let text = "";
  let usage: Usage = { input: 0, cached: 0, output: 0 };
  let failure: UpstreamError | null = null;

  const finish = (index: number) => {
    const p = pending.get(index);
    if (!p) return;
    pending.delete(index);
    if (!p.name) return;
    const call = { id: p.id || newCallId(), name: p.name, args: parseArgs(p.args) };
    toolCalls.push(call);
    emit({ type: "tool_call", call });
  };
  const finishAll = () => {
    for (const index of [...pending.keys()].sort((a, b) => a - b)) finish(index);
  };

  await readSSE(res.body, (data) => {
    if (failure || data === "[DONE]") return;
    let chunk: any;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk?.error) {
      failure = new UpstreamError(chunk.error.message ?? String(chunk.error), 502);
      return;
    }
    if (chunk?.usage) {
      const u = chunk.usage;
      usage = {
        input: Number(u.prompt_tokens) || 0,
        cached: Number(u.prompt_tokens_details?.cached_tokens) || 0,
        output: Number(u.completion_tokens) || 0
      };
    }
    const choice = chunk?.choices?.[0];
    if (!choice) return;
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content) {
      text += delta.content;
      emit({ type: "text", delta: delta.content });
    }
    for (const d of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
      const index = typeof d.index === "number" ? d.index : pending.size > 0 ? Math.max(...pending.keys()) : toolCalls.length;
      const current = pending.get(index);
      // Some servers reuse an index for a new call: a new id at the same index starts a new call.
      if (current && d.id && current.id && d.id !== current.id) finish(index);
      // A higher index means every lower call is complete.
      for (const k of [...pending.keys()]) if (k < index) finish(k);
      const p = pending.get(index) ?? { id: "", name: "", args: "" };
      if (d.id) p.id = d.id;
      const name = d.function?.name;
      if (typeof name === "string" && name && name !== p.name) p.name = p.name ? p.name + name : name;
      const a = d.function?.arguments;
      if (typeof a === "string") p.args += a;
      else if (a && typeof a === "object") p.args = JSON.stringify(a);
      pending.set(index, p);
    }
    if (choice.finish_reason) finishAll();
  });

  if (failure) throw failure;
  finishAll();
  return { text, toolCalls, rawParts: [], usage };
}

/** Non-streaming /api/ai/chat for "local": the same streamed call, collected into one result. */
export function chatCompat(req: ChatRequest, model: string, baseUrl: string, apiKey: string, signal: AbortSignal): Promise<ChatResult> {
  return streamCompat(req, model, baseUrl, apiKey, signal, () => {});
}

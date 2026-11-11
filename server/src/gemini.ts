import { newCallId, UpstreamError, type ChatRequest, type ChatResult, type WireToolCall } from "./wire";

function toObject(result: string): Record<string, unknown> {
  try {
    const v = JSON.parse(result);
    return v && typeof v === "object" && !Array.isArray(v) ? v : { result: v };
  } catch {
    return { result };
  }
}

function toContents(req: ChatRequest) {
  const contents: Record<string, unknown>[] = [];
  for (const m of req.messages) {
    if (m.role === "user") {
      const parts: Record<string, unknown>[] = [{ text: m.content }];
      for (const a of m.attachments ?? []) {
        if (a.kind === "text") parts.push({ text: a.text });
        else {
          const match = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(a.dataUrl);
          if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }
      contents.push({ role: "user", parts });
    } else if (m.role === "assistant") {
      // Replay raw Gemini parts verbatim to keep thought signatures.
      if (m.rawParts && m.rawParts.length > 0) {
        contents.push({ role: "model", parts: m.rawParts });
        continue;
      }
      const parts: Record<string, unknown>[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } });
      if (parts.length) contents.push({ role: "model", parts });
    } else if (m.role === "tool" && m.toolResults?.length) {
      contents.push({
        role: "user",
        parts: m.toolResults.map((r) => ({ functionResponse: { name: r.name, response: toObject(r.result) } }))
      });
    }
  }
  return contents;
}

export async function chatGemini(req: ChatRequest, model: string, apiKey: string, signal: AbortSignal): Promise<ChatResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.systemPrompt }] },
      contents: toContents(req),
      tools: [{ functionDeclarations: req.tools }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: req.temperature }
    }),
    signal
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new UpstreamError(json?.error?.message ?? `Gemini HTTP ${res.status}`, res.status);
  }

  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  const toolCalls: WireToolCall[] = parts
    .filter((p) => p?.functionCall)
    .map((p) => ({ id: newCallId(), name: p.functionCall.name ?? "", args: p.functionCall.args ?? {} }));
  const text = parts.filter((p) => typeof p?.text === "string" && !p.thought).map((p) => p.text).join("");

  const u = json?.usageMetadata;
  const usage = { input: Number(u?.promptTokenCount) || 0, cached: Number(u?.cachedContentTokenCount) || 0, output: Number(u?.candidatesTokenCount) || 0 };
  return { text, toolCalls, rawParts: parts, usage };
}

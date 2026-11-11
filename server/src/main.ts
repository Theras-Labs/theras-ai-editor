// Theras AI server. Holds the model API keys. The editor runs the scene tools in the
// browser and calls POST /api/ai/chat once per step of its tool loop.
// No database and no background work: each request makes exactly one upstream call.

import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { adminToken, allowedOrigins, getActive, isProviderId, limits, providers, publicConfig, reasoningEffortFor, setActive, transcribeModel, ttsModel, ttsVoice } from "./config";
import { chatGemini } from "./gemini";
import { chatOpenAI, fixedTemperature, streamOpenAI } from "./openai";
import { chatCompat, streamCompat } from "./openai-compat";
import { checkRate } from "./rate-limit";
import { projectRoutesEnabled, readProjectFile, scanProject } from "./projects";
import { EFFORTS, UpstreamError, type ChatRequest, type ChatResult, type StreamEmit, type StreamEvent } from "./wire";

const PORT = Number(process.env.PORT) || 4310;
const HOST = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const UPSTREAM_TIMEOUT_MS = 180_000;
const MAX_MESSAGES = 600;
const MAX_TOOLS = 200;
const PING_AFTER_MS = 15_000;

const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return allowedOrigins.length > 0 ? allowedOrigins.includes(origin) : localOrigin.test(origin);
}

function clientIp(request: Request, server: { requestIP(r: Request): { address: string } | null } | null): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return server?.requestIP(request)?.address ?? "unknown";
}

function isAdmin(request: Request): boolean {
  if (!adminToken) return false;
  const got = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(adminToken);
  return got.length === want.length && timingSafeEqual(got, want);
}

function parseChat(body: unknown): ChatRequest | string {
  const b = body as Partial<ChatRequest> | null;
  if (!b || typeof b !== "object") return "body must be JSON";
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return "messages is invalid";
  if (!Array.isArray(b.tools) || b.tools.length > MAX_TOOLS) return "tools is invalid";
  if (typeof b.systemPrompt !== "string") return "systemPrompt is invalid";
  const temperature = typeof b.temperature === "number" ? Math.min(1, Math.max(0, b.temperature)) : 0.3;
  const profile = typeof b.profile === "string" && b.profile ? b.profile.slice(0, 32) : undefined;
  // Optional per-request model and effort. The model is checked against the active provider in admitChat.
  if (b.model !== undefined && b.model !== null && (typeof b.model !== "string" || !b.model.trim() || b.model.length > 100)) return "model must be a non-empty string";
  if (b.effort !== undefined && b.effort !== null && !(EFFORTS as readonly unknown[]).includes(b.effort)) return `effort must be one of ${EFFORTS.join(", ")}`;
  const model = typeof b.model === "string" ? b.model.trim() : undefined;
  const effort = b.effort ?? undefined;
  return { messages: b.messages, tools: b.tools, systemPrompt: b.systemPrompt, temperature, profile, model, effort };
}

type Active = ReturnType<typeof getActive>;

/** Checks shared by /api/ai/chat and /api/ai/chat/stream. Returns the request or an HTTP error. */
function admitChat(request: Request, body: unknown, ip: string): { req: ChatRequest; active: Active } | { status: number; error: string } {
  if (allowedOrigins.length > 0 && !originAllowed(request.headers.get("origin"))) return { status: 403, error: "Origin not allowed" };
  const limited = checkRate(ip, limits.perMinute, limits.perDay);
  if (limited) return { status: 429, error: limited };
  const req = parseChat(body);
  if (typeof req === "string") return { status: 400, error: req };
  const active = getActive();
  if (!active.ready) {
    const what = active.provider === "local" ? "no LOCAL_BASE_URL or LOCAL_MODEL" : "no API key";
    return { status: 503, error: `The server has ${what} for ${active.provider}. Ask the admin to set it.` };
  }
  // A requested model must be in the ACTIVE provider's list. The key always stays the active provider's key.
  if (req.model && req.model !== active.model) {
    const allowed = providers[active.provider].models;
    if (!allowed.includes(req.model)) {
      return { status: 400, error: `model ${req.model} is not allowed for provider ${active.provider}. Allowed: ${allowed.join(", ")}` };
    }
    return { req, active: { ...active, model: req.model } };
  }
  return { req, active };
}

/** One upstream call. emit gets text and tool_call events when the provider streams (openai, local). */
function runChat(req: ChatRequest, a: Active, signal: AbortSignal, emit?: StreamEmit): Promise<ChatResult> {
  if (a.provider === "local") return emit ? streamCompat(req, a.model, a.baseUrl, a.apiKey, signal, emit) : chatCompat(req, a.model, a.baseUrl, a.apiKey, signal);
  if (a.provider === "openai") return emit ? streamOpenAI(req, a.model, a.apiKey, signal, emit) : chatOpenAI(req, a.model, a.apiKey, signal);
  return chatGemini(req, a.model, a.apiKey, signal);
}

/** Effort as sent upstream, for the log. Only OpenAI reasoning models (gpt-5*, o*) use it. */
function effortLabel(a: Active, req: ChatRequest): string {
  if (a.provider !== "openai" || !fixedTemperature(a.model)) return req.effort ? `${req.effort}(ignored)` : "-";
  return req.effort ? `${req.effort}(request)` : (reasoningEffortFor(req.profile) ?? "default");
}

function logCall(route: string, a: Active, req: ChatRequest, totalMs: number, firstToolMs: number | null, result: ChatResult) {
  const u = result.usage ?? { input: 0, cached: 0, output: 0 };
  console.log(
    `[ai] ${route} ${a.provider}/${a.model} model_src=${req.model ? "request" : "default"} effort=${effortLabel(a, req)} profile=${req.profile ?? "-"} first_tool=${firstToolMs === null ? "-" : `${firstToolMs}ms`} ` +
      `total=${totalMs}ms tools=${result.toolCalls.length} in=${u.input} cached=${u.cached} out=${u.output}`
  );
}

/** Maps an upstream failure to an HTTP status and a message for the editor. */
function failure(error: unknown, a: Active, route: string): { status: number; message: string } {
  if (error instanceof UpstreamError) {
    console.warn(`[ai] ${route} ${a.provider}/${a.model} upstream ${error.status}: ${error.message}`);
    return { status: error.status === 429 ? 429 : 502, message: `${a.provider} (${a.model}): ${error.message}` };
  }
  const timedOut = error instanceof DOMException && error.name === "TimeoutError";
  console.warn(`[ai] ${route} ${a.provider}/${a.model} failed:`, error);
  return { status: timedOut ? 504 : 502, message: timedOut ? "The AI provider did not answer in time." : "AI request failed." };
}

/**
 * POST /api/ai/chat/stream. Errors before the upstream call (origin, rate limit, bad body,
 * provider not configured) are plain JSON with an HTTP status, as /api/ai/chat. After that the
 * response is text/event-stream: "text", "tool_call", then "done" or "error" (see wire.ts).
 */
function chatStream(request: Request, req: ChatRequest, a: Active): Response {
  const encoder = new TextEncoder();
  const cancel = new AbortController();
  const signal = AbortSignal.any([request.signal, cancel.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]);
  let ping: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastWrite = performance.now();
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
          lastWrite = performance.now();
        } catch {
          closed = true;
        }
      };
      const send = (event: StreamEvent) => write(`data: ${JSON.stringify(event)}\n\n`);
      const stop = () => {
        if (ping !== undefined) clearInterval(ping);
        ping = undefined;
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };
      ping = setInterval(() => {
        if (performance.now() - lastWrite >= PING_AFTER_MS) write(": ping\n\n");
      }, 5_000);
      signal.addEventListener("abort", () => {
        if (ping !== undefined) clearInterval(ping);
        ping = undefined;
      }, { once: true });

      const t0 = performance.now();
      let firstToolMs: number | null = null;
      const emit: StreamEmit = (event) => {
        if (event.type === "tool_call" && firstToolMs === null) firstToolMs = Math.round(performance.now() - t0);
        send(event);
      };
      try {
        const result = await runChat(req, a, signal, a.provider === "gemini" ? undefined : emit);
        // Gemini has no stream in phase 1: emit its tool calls now, before "done".
        if (a.provider === "gemini") {
          if (result.text) emit({ type: "text", delta: result.text });
          for (const call of result.toolCalls) emit({ type: "tool_call", call });
        }
        const ms = Math.round(performance.now() - t0);
        logCall("stream", a, req, ms, firstToolMs, result);
        send({
          type: "done",
          text: result.text,
          toolCalls: result.toolCalls,
          rawParts: result.rawParts,
          provider: a.provider,
          model: a.model,
          ms,
          usage: result.usage ?? { input: 0, cached: 0, output: 0 }
        });
      } catch (error) {
        if (request.signal.aborted || cancel.signal.aborted) {
          console.log(`[ai] stream ${a.provider}/${a.model} profile=${req.profile ?? "-"} aborted by client after ${Math.round(performance.now() - t0)}ms`);
        } else {
          const f = failure(error, a, "stream");
          send({ type: "error", message: f.message, status: f.status });
        }
      } finally {
        stop();
      }
    },
    cancel() {
      closed = true;
      if (ping !== undefined) clearInterval(ping);
      ping = undefined;
      cancel.abort();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no"
    }
  });
}

const app = new Elysia()
  .use(
    cors({
      origin: (request) => originAllowed(request.headers.get("origin")),
      methods: ["GET", "POST", "PUT", "OPTIONS"],
      allowedHeaders: ["content-type", "authorization"]
    })
  )
  .get("/health", () => ({ ok: true }))
  // Project import (local server only): scan a project folder, then serve its asset files.
  .post("/api/project/scan", async ({ request, body, set }) => {
    if (!projectRoutesEnabled(HOST)) {
      set.status = 404;
      return { error: "Project import works only with a local server." };
    }
    if (!originAllowed(request.headers.get("origin"))) {
      set.status = 403;
      return { error: "Origin not allowed" };
    }
    const path = (body as { path?: unknown } | null)?.path;
    if (typeof path !== "string" || !path.trim() || path.length > 1024) {
      set.status = 400;
      return { error: "path must be the full path of a folder" };
    }
    try {
      return await scanProject(path);
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : String(error) };
    }
  })
  .get("/api/project/:id/file/*", async ({ params, set }) => {
    if (!projectRoutesEnabled(HOST)) {
      set.status = 404;
      return { error: "Project import works only with a local server." };
    }
    const file = await readProjectFile(params.id, params["*"] ?? "");
    if (!file) {
      set.status = 404;
      return { error: "No such asset in this project (scan the project first)." };
    }
    return new Response(file.body, { headers: { "content-type": file.type, "cache-control": "no-cache" } });
  })
  .get("/api/ai/config", () => publicConfig())
  .put("/api/admin/ai", ({ request, body, set }) => {
    if (!adminToken) {
      set.status = 404;
      return { error: "Admin route is off. Set ADMIN_TOKEN (16+ characters) on the server." };
    }
    if (!isAdmin(request)) {
      set.status = 401;
      return { error: "Wrong admin token" };
    }
    const b = body as { provider?: unknown; model?: unknown } | null;
    if (!isProviderId(b?.provider)) {
      set.status = 400;
      return { error: "provider must be openai, gemini or local" };
    }
    const err = setActive(b.provider, typeof b.model === "string" ? b.model : undefined);
    if (err) {
      set.status = 400;
      return { error: err };
    }
    console.log(`[admin] AI provider set to ${b.provider} / ${getActive().model}`);
    return publicConfig();
  })
  // Voice input: the editor records audio and sends it here; OpenAI turns it into text.
  .post(
    "/api/ai/transcribe",
    async ({ request, set, server }) => {
      if (allowedOrigins.length > 0 && !originAllowed(request.headers.get("origin"))) {
        set.status = 403;
        return { error: "Origin not allowed" };
      }
      const limited = checkRate(clientIp(request, server), limits.perMinute, limits.perDay);
      if (limited) {
        set.status = 429;
        return { error: limited };
      }
      const apiKey = providers.openai.apiKey;
      if (!apiKey) {
        set.status = 503;
        return { error: "Voice input needs OPENAI_API_KEY on the server." };
      }
      const type = request.headers.get("content-type") ?? "audio/webm";
      const audio = await request.arrayBuffer();
      if (audio.byteLength < 1000) {
        set.status = 400;
        return { error: "The recording is too short." };
      }
      const form = new FormData();
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
      form.append("file", new Blob([audio], { type }), `speech.${ext}`);
      form.append("model", transcribeModel);
      const t0 = performance.now();
      try {
        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)])
        });
        const json = (await res.json().catch(() => null)) as { text?: string; error?: { message?: string } } | null;
        if (!res.ok) {
          console.warn(`[voice] ${transcribeModel} upstream ${res.status}: ${json?.error?.message}`);
          set.status = 502;
          return { error: `Transcription failed: ${json?.error?.message ?? res.status}` };
        }
        console.log(`[voice] ${transcribeModel} ${Math.round(performance.now() - t0)}ms ${audio.byteLength} bytes`);
        return { text: json?.text ?? "" };
      } catch (error) {
        console.warn("[voice] failed:", error);
        set.status = 502;
        return { error: "Transcription failed." };
      }
    },
    { parse: "none" }
  )
  // Spoken replies: text in, MP3 out (OpenAI text-to-speech with the server key).
  .post("/api/ai/speak", async ({ request, body, set, server }) => {
    if (allowedOrigins.length > 0 && !originAllowed(request.headers.get("origin"))) {
      set.status = 403;
      return { error: "Origin not allowed" };
    }
    const limited = checkRate(clientIp(request, server), limits.perMinute, limits.perDay);
    if (limited) {
      set.status = 429;
      return { error: limited };
    }
    const apiKey = providers.openai.apiKey;
    if (!apiKey) {
      set.status = 503;
      return { error: "Spoken replies need OPENAI_API_KEY on the server." };
    }
    const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text.trim().slice(0, 1200) : "";
    if (!text) {
      set.status = 400;
      return { error: "text is empty" };
    }
    const t0 = performance.now();
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: ttsModel,
        voice: ttsVoice,
        input: text,
        response_format: "mp3",
        instructions: "Speak like a calm, friendly creative assistant. Keep a natural pace."
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)])
    }).catch((error: unknown) => error as Error);
    if (res instanceof Error || !res.ok) {
      const message = res instanceof Error ? res.message : ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
      console.warn(`[speak] ${ttsModel} failed: ${message}`);
      set.status = 502;
      return { error: `Speech failed: ${message}` };
    }
    const audio = await res.arrayBuffer();
    console.log(`[speak] ${ttsModel}/${ttsVoice} ${Math.round(performance.now() - t0)}ms ${text.length} chars`);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  })
  .post("/api/ai/chat", async ({ request, body, set, server }) => {
    const admitted = admitChat(request, body, clientIp(request, server));
    if ("error" in admitted) {
      set.status = admitted.status;
      return { error: admitted.error };
    }
    const { req, active } = admitted;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]);
    const t0 = performance.now();
    try {
      const result = await runChat(req, active, signal);
      logCall("chat", active, req, Math.round(performance.now() - t0), null, result);
      return { ...result, provider: active.provider, model: active.model };
    } catch (error) {
      const f = failure(error, active, "chat");
      set.status = f.status;
      return { error: f.message };
    }
  })
  // Streamed variant of /api/ai/chat (text/event-stream). Same body plus optional "profile".
  .post("/api/ai/chat/stream", ({ request, body, set, server }) => {
    const admitted = admitChat(request, body, clientIp(request, server));
    if ("error" in admitted) {
      set.status = admitted.status;
      return { error: admitted.error };
    }
    return chatStream(request, admitted.req, admitted.active);
  })
  .listen({ port: PORT, hostname: HOST, idleTimeout: 255, maxRequestBodySize: 12 * 1024 * 1024 });

const cfg = publicConfig();
console.log(`[theras-server] http://${HOST}:${PORT}  provider=${cfg.provider} model=${cfg.model} ready=${cfg.ready} admin=${cfg.adminEnabled}`);

export type App = typeof app;

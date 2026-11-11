// Calls the Theras AI server (server). The server holds the API key and
// the admin chooses the provider (OpenAI or Gemini) and the model there. The scene tools still
// run in the browser through agentic-loop.ts.
import type {
  CopilotMessage,
  CopilotProvider,
  CopilotProviderConfig,
  CopilotResponse,
  CopilotStreamEvent,
  CopilotStreamResult,
  CopilotToolDeclaration,
  CopilotUsage
} from "./types";
import { createSseParser } from "./sse";
import { loadCopilotSettings } from "./settings";

const LOCAL_SERVER_URL = "http://127.0.0.1:4310";

/** VITE_THERAS_API_URL at build time; on a localhost page the local server is the fallback. */
export function getTherasApiUrl(): string | null {
  const fromEnv = (import.meta.env.VITE_THERAS_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  return host === "localhost" || host === "127.0.0.1" ? LOCAL_SERVER_URL : null;
}

export type TherasServerConfig = {
  provider: string;
  model: string;
  ready: boolean;
  adminEnabled: boolean;
  providers: Record<string, { configured: boolean; model: string; models: string[] }>;
};

export async function fetchTherasServerConfig(): Promise<TherasServerConfig> {
  const base = getTherasApiUrl();
  if (!base) throw new Error("VITE_THERAS_API_URL is not set for this build");
  const res = await fetch(`${base}/api/ai/config`);
  if (!res.ok) throw new Error(`Theras server HTTP ${res.status}`);
  return (await res.json()) as TherasServerConfig;
}

export async function setTherasServerProvider(adminToken: string, provider: string, model: string): Promise<TherasServerConfig> {
  const base = getTherasApiUrl();
  if (!base) throw new Error("VITE_THERAS_API_URL is not set for this build");
  const res = await fetch(`${base}/api/admin/ai`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ provider, model })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Theras server HTTP ${res.status}`);
  return json as TherasServerConfig;
}

/**
 * Model for one request: config.model when the caller set one (a quality stage passes the
 * design model), else the user's choice in the prompt input, else none (the admin's default).
 * The server answers 400 when the name is not in the active provider's list.
 */
export function requestModel(configModel: string | undefined, savedModel: string | undefined): string | undefined {
  const fromConfig = configModel?.trim();
  if (fromConfig) return fromConfig;
  const saved = savedModel?.trim();
  return saved || undefined;
}

/** Request body of /api/ai/chat and /api/ai/chat/stream (the stream route adds nothing else). */
function chatBody(messages: CopilotMessage[], tools: CopilotToolDeclaration[], systemPrompt: string, config: CopilotProviderConfig): string {
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  return JSON.stringify({
    messages: messages.map(({ role, content, toolCalls, toolResults, rawParts, attachments }, i) => ({
      role,
      content,
      toolCalls,
      toolResults,
      rawParts,
      // Images only for the newest user message; older ones become short notes.
      attachments: attachments?.map((a) =>
        a.kind === "image" && i < lastUserIndex ? { kind: "text" as const, name: a.name, text: `[earlier image: ${a.name}]` } : a
      )
    })),
    tools,
    systemPrompt,
    temperature: config.temperature,
    profile: config.profile,
    model: requestModel(config.model, loadCopilotSettings().server.model),
    effort: config.effort || undefined
  });
}

function unreachable(base: string, error: unknown): never {
  if (error instanceof DOMException && error.name === "AbortError") throw error;
  throw new Error(`Cannot reach the Theras server at ${base}. Start it with "bun run dev:server".`);
}

function requireBase(): string {
  const base = getTherasApiUrl();
  if (!base) throw new Error("No Theras server URL. Set VITE_THERAS_API_URL when you build the editor.");
  return base;
}

function usageOf(value: unknown): CopilotUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const u = value as Record<string, unknown>;
  const n = (k: string) => (typeof u[k] === "number" ? (u[k] as number) : 0);
  return { input: n("input"), cached: n("cached"), output: n("output") };
}

/**
 * Set when the stream route answered 404 (a server without it). For the rest of this page
 * session the editor uses /api/ai/chat directly. This is a capability note, not a retry.
 */
let streamRouteMissing = false;

export function createServerProvider(): CopilotProvider {
  const provider: CopilotProvider = {
    async generateContent(
      messages: CopilotMessage[],
      tools: CopilotToolDeclaration[],
      systemPrompt: string,
      config: CopilotProviderConfig,
      signal?: AbortSignal
    ): Promise<CopilotResponse> {
      const base = requireBase();
      let res: Response;
      try {
        res = await fetch(`${base}/api/ai/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: chatBody(messages, tools, systemPrompt, config),
          signal
        });
      } catch (error) {
        unreachable(base, error);
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `Theras server HTTP ${res.status}`);
      }

      return {
        text: typeof json?.text === "string" ? json.text : "",
        toolCalls: Array.isArray(json?.toolCalls) ? json.toolCalls : [],
        rawParts: Array.isArray(json?.rawParts) ? json.rawParts : [],
        usage: usageOf(json?.usage)
      };
    },

    async streamContent(messages, tools, systemPrompt, config, onEvent, signal): Promise<CopilotStreamResult> {
      const base = requireBase();

      // Server without the stream route: one plain request, replayed as events.
      const fallback = async (): Promise<CopilotStreamResult> => {
        const response = await provider.generateContent(messages, tools, systemPrompt, config, signal);
        if (response.text) onEvent({ type: "text", delta: response.text });
        for (const call of response.toolCalls) onEvent({ type: "tool_call", call });
        return { ...response, streamed: false };
      };
      if (streamRouteMissing) return fallback();

      let res: Response;
      try {
        res = await fetch(`${base}/api/ai/chat/stream`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: chatBody(messages, tools, systemPrompt, config),
          signal
        });
      } catch (error) {
        unreachable(base, error);
      }

      if (res.status === 404) {
        streamRouteMissing = true;
        console.info("[AI-VIBE] /api/ai/chat/stream is not on this server (404). Using /api/ai/chat.");
        await res.body?.cancel().catch(() => {});
        return fallback();
      }
      // Errors before the upstream call are plain JSON, as /api/ai/chat.
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Theras server HTTP ${res.status}`);
      }

      let done: CopilotStreamResult | null = null;
      let failure: Error | null = null;
      const parser = createSseParser((data) => {
        if (done || failure) return;
        let event: CopilotStreamEvent;
        try {
          event = JSON.parse(data) as CopilotStreamEvent;
        } catch {
          console.warn("[AI-VIBE] Bad stream event:", data.slice(0, 200));
          return;
        }
        switch (event.type) {
          case "text":
            if (typeof event.delta === "string" && event.delta) onEvent(event);
            break;
          case "tool_call":
            if (event.call && typeof event.call.name === "string") onEvent({ type: "tool_call", call: { ...event.call, args: event.call.args ?? {} } });
            break;
          case "done":
            done = {
              text: typeof event.text === "string" ? event.text : "",
              toolCalls: Array.isArray(event.toolCalls) ? event.toolCalls : [],
              rawParts: Array.isArray(event.rawParts) ? event.rawParts : [],
              usage: usageOf(event.usage),
              provider: event.provider,
              model: event.model,
              ms: event.ms,
              streamed: true
            };
            break;
          case "error":
            failure = new Error(event.message || `Theras server HTTP ${event.status ?? 502}`);
            break;
        }
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (!done && !failure) {
          const { value, done: finished } = await reader.read();
          if (finished) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        if (!done && !failure) {
          parser.push(decoder.decode());
          parser.end();
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        throw new Error(`The stream from the Theras server broke: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        // The server closes the stream after "done"; cancel releases the connection at once.
        reader.cancel().catch(() => {});
      }

      if (failure) throw failure;
      if (!done) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        throw new Error("The Theras server closed the stream before the model finished.");
      }
      return done;
    }
  };
  return provider;
}

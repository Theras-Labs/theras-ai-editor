// Request and response shapes shared with apps/editor/src/lib/copilot/server-provider.ts.

export type WireToolCall = { id: string; name: string; args: Record<string, unknown> };
export type WireToolResult = { callId: string; name: string; result: string };

export type WireAttachment =
  | { kind: "image"; name: string; mime: string; dataUrl: string }
  | { kind: "text"; name: string; text: string };

export type WireMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  attachments?: WireAttachment[];
  toolCalls?: WireToolCall[];
  toolResults?: WireToolResult[];
  rawParts?: unknown[];
};

export type WireTool = { name: string; description: string; parameters: Record<string, unknown> };

export type ChatRequest = {
  messages: WireMessage[];
  tools: WireTool[];
  systemPrompt: string;
  temperature: number;
  /** Optional harness profile ("compose", "edit", "logic", "full"). Used for logs and reasoning effort only. */
  profile?: string;
  /** Optional model for this request. Must be in the active provider's model list (checked in main.ts). */
  model?: string;
  /** Optional reasoning effort for this request. Wins over the profile default (config.ts). */
  effort?: Effort;
};

export const EFFORTS = ["none", "low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

export type Usage = { input: number; cached: number; output: number };

export type ChatResult = { text: string; toolCalls: WireToolCall[]; rawParts: unknown[]; usage?: Usage };

/** Events of POST /api/ai/chat/stream. One SSE "data:" line each. This shape is a contract with the editor. */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: WireToolCall }
  | {
      type: "done";
      text: string;
      toolCalls: WireToolCall[];
      rawParts: unknown[];
      provider: string;
      model: string;
      ms: number;
      usage: Usage;
    }
  | { type: "error"; message: string; status: number };

/** Callback that a streaming provider calls for each "text" and "tool_call" event. */
export type StreamEmit = (event: Extract<StreamEvent, { type: "text" } | { type: "tool_call" }>) => void;

export function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  try {
    const v = JSON.parse(typeof raw === "string" && raw ? raw : "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function newCallId(): string {
  return `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

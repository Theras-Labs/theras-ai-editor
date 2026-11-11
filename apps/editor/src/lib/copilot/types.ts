import type { CopilotAttachment } from "./attachments";

// ── Provider and model IDs ────────────────────────────────────

export type CopilotProviderId = "server" | "gemini" | "codex";
export type GeminiModelId = "gemini-3-flash-preview" | "gemini-3.1-pro-preview";
export type CodexModelId = "gpt-5.6-terra" | "gpt-5.6-luna" | "gpt-5.4" | "gpt-5.3-codex" | "gpt-5.1-codex-max" | "gpt-4.1" | "gpt-4.1-mini" | "codex-mini-latest" | "o3" | "o4-mini";
export type CopilotModelId = GeminiModelId | CodexModelId;

// ── Settings ──────────────────────────────────────────────────

export type CopilotSettings = {
  provider: CopilotProviderId;
  gemini: { apiKey: string; model: GeminiModelId };
  codex: { model: CodexModelId };
  /**
   * Theras server: this user's model choice from the admin's allowed list (GET /api/ai/config).
   * Empty = the admin's default. designModel is used for the slower quality stages (object
   * modeling, image analysis); empty = same as model.
   */
  server: { model?: string; designModel?: string };
  temperature: number;
};

// ── Messages ──────────────────────────────────────────────────

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: CopilotToolCall[];
  /** Files sent with a user message (images, video frames, code, model outlines). */
  attachments?: CopilotAttachment[];
  toolResults?: CopilotToolResult[];
  /** Raw provider response parts — preserved verbatim for thought signatures */
  rawParts?: unknown[];
  /** Instant (no model) result: the prompt that "Refine with AI" sends to the model. */
  refinePrompt?: string;
  /** Per-prompt numbers, kept on the last assistant message of a run (chat trace). */
  metrics?: CopilotRunMetrics;
  /** Follow-ups offered after a build (Director v2): chips under the message; a click sends prompt. */
  suggestions?: { label: string; prompt: string }[];
  timestamp: number;
};

export type CopilotUsage = { input: number; cached: number; output: number };

/** Per-prompt metrics (plan 4.8). Times are ms from the moment the user sent the prompt. */
export type CopilotRunMetrics = {
  tier: 0 | 1 | 2;
  profile: string;
  model: string;
  steps: number;
  firstToolMs: number | null;
  /** Without the time the choice popup waited for the user. */
  totalMs: number;
  usage?: CopilotUsage;
  /** Director runs: ms of the brief call. */
  briefMs?: number;
  /** Director runs: ms the choice popup waited for the user (not in totalMs or firstToolMs). */
  choiceWaitMs?: number;
};

export type CopilotToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type CopilotToolResult = {
  callId: string;
  name: string;
  result: string;
};

export type CopilotToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type CopilotProviderConfig = {
  apiKey: string;
  model: string;
  temperature: number;
  /** Harness tool profile ("compose", "edit", "logic", "full"). The Theras server uses it for logs and reasoning effort. */
  profile?: string;
  /** Reasoning effort for this request (Theras server only). Quality stages use "medium" or "high". */
  effort?: "none" | "low" | "medium" | "high";
};

export type CopilotResponse = {
  text: string;
  toolCalls: CopilotToolCall[];
  /** Raw parts from the model response, preserved for thought signatures */
  rawParts: unknown[];
  /** Token counts, when the provider reports them. */
  usage?: CopilotUsage;
};

/** Events of POST /api/ai/chat/stream (contract: server/src/wire.ts). */
export type CopilotStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: CopilotToolCall }
  | {
      type: "done";
      text: string;
      toolCalls: CopilotToolCall[];
      rawParts: unknown[];
      provider: string;
      model: string;
      ms: number;
      usage?: CopilotUsage;
    }
  | { type: "error"; message: string; status: number };

/** Result of a streamed step: the "done" event. streamed = false when the provider fell back to one request. */
export type CopilotStreamResult = CopilotResponse & {
  provider?: string;
  model?: string;
  ms?: number;
  streamed: boolean;
};

export type CopilotSessionStatus =
  | "idle"
  | "thinking"
  | "executing"
  | "error"
  | "aborted";

export type CopilotSession = {
  messages: CopilotMessage[];
  status: CopilotSessionStatus;
  error?: string;
  iterationCount: number;
};

// ── Provider interfaces ───────────────────────────────────────

/** Request-response provider (Theras server, Gemini) — used with the agentic loop */
export type CopilotProvider = {
  generateContent(
    messages: CopilotMessage[],
    tools: CopilotToolDeclaration[],
    systemPrompt: string,
    config: CopilotProviderConfig,
    signal?: AbortSignal
  ): Promise<CopilotResponse>;
  /**
   * Optional streamed step. onEvent gets "text" and "tool_call" events while the model writes;
   * the promise resolves with the "done" result. Providers without it use generateContent.
   */
  streamContent?(
    messages: CopilotMessage[],
    tools: CopilotToolDeclaration[],
    systemPrompt: string,
    config: CopilotProviderConfig,
    onEvent: (event: Extract<CopilotStreamEvent, { type: "text" } | { type: "tool_call" }>) => void,
    signal?: AbortSignal
  ): Promise<CopilotStreamResult>;
};

/** Session-based provider (Codex) — manages its own tool-calling loop */
export type SessionBasedCopilotProvider = {
  runSession(config: {
    messages: CopilotMessage[];
    userPrompt: string;
    tools: CopilotToolDeclaration[];
    systemPrompt: string;
    providerConfig: CopilotProviderConfig;
    threadId?: string;
    onThreadId?: (threadId: string | undefined) => void;
    executeTool: (call: CopilotToolCall) => CopilotToolResult;
    onUpdate: (session: CopilotSession) => void;
    signal?: AbortSignal;
  }): Promise<CopilotSession>;
};

/** Discriminated union for provider factory */
export type AnyCopilotProvider =
  | { kind: "request-response"; provider: CopilotProvider }
  | { kind: "session-based"; provider: SessionBasedCopilotProvider };

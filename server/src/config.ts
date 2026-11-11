// AI provider settings. Env values are the defaults. The admin can change the active
// provider and model at run time (PUT /api/admin/ai); that change lives in memory only
// and goes back to the env values when the process restarts.

export type ProviderId = "openai" | "gemini" | "local";

/** baseUrl is set only for "local" (an OpenAI-compatible Chat Completions server). */
type ProviderEnv = { apiKey: string; defaultModel: string; models: string[]; baseUrl?: string };

function list(raw: string | undefined, fallback: string[]): string[] {
  const items = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function providerEnv(prefix: "OPENAI" | "GEMINI" | "LOCAL", fallbackModels: string[]): ProviderEnv {
  const models = list(process.env[`${prefix}_MODELS`], fallbackModels);
  const defaultModel = process.env[`${prefix}_MODEL`]?.trim() || models[0] || "";
  if (defaultModel && !models.includes(defaultModel)) models.unshift(defaultModel);
  return { apiKey: process.env[`${prefix}_API_KEY`]?.trim() ?? "", defaultModel, models };
}

function localEnv(): ProviderEnv {
  const env = providerEnv("LOCAL", []);
  const baseUrl = process.env.LOCAL_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  return { ...env, baseUrl };
}

export const providers: Record<ProviderId, ProviderEnv> = {
  openai: providerEnv("OPENAI", ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.4", "gpt-4.1", "gpt-4.1-mini"]),
  gemini: providerEnv("GEMINI", ["gemini-3-flash-preview", "gemini-3.1-pro-preview"]),
  local: localEnv()
};

/** "local" needs LOCAL_BASE_URL and a model (its API key is optional). The others need an API key. */
export function isConfigured(id: ProviderId): boolean {
  const env = providers[id];
  return id === "local" ? !!env.baseUrl && !!env.defaultModel : env.apiKey.length > 0;
}

/** OpenAI speech-to-text model for voice input. */
export const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe";

/** OpenAI text-to-speech for spoken replies (voice orb). */
export const ttsModel = process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
export const ttsVoice = process.env.OPENAI_TTS_VOICE?.trim() || "coral";

export const openaiReasoningEffort = process.env.OPENAI_REASONING_EFFORT?.trim() || undefined;
const effortCompose = process.env.OPENAI_EFFORT_COMPOSE?.trim() || "none";
const effortEdit = process.env.OPENAI_EFFORT_EDIT?.trim() || undefined;

/**
 * Reasoning effort for one request. "compose" uses OPENAI_EFFORT_COMPOSE (default "none": the editor computes the layout in code, so the model does not need to reason about positions; measured 1.7-2.9 s against 3.0-3.7 s with "low").
 * Other profiles use OPENAI_EFFORT_EDIT, then OPENAI_REASONING_EFFORT, else the model default.
 * A value the provider rejects comes back as the provider error; there is no retry.
 */
export function reasoningEffortFor(profile: string | undefined): string | undefined {
  if (profile === "compose") return effortCompose;
  return effortEdit ?? openaiReasoningEffort;
}

export function isProviderId(v: unknown): v is ProviderId {
  return v === "openai" || v === "gemini" || v === "local";
}

const envProvider = process.env.AI_PROVIDER?.trim();

const active: { provider: ProviderId; model: Record<ProviderId, string> } = {
  provider: isProviderId(envProvider) ? envProvider : "openai",
  model: { openai: providers.openai.defaultModel, gemini: providers.gemini.defaultModel, local: providers.local.defaultModel }
};

export function getActive(): { provider: ProviderId; model: string; apiKey: string; baseUrl: string; ready: boolean } {
  const p = active.provider;
  return { provider: p, model: active.model[p], apiKey: providers[p].apiKey, baseUrl: providers[p].baseUrl ?? "", ready: isConfigured(p) };
}

export function setActive(provider: ProviderId, model?: string): string | null {
  const env = providers[provider];
  if (provider === "local" && !env.baseUrl) return "local has no LOCAL_BASE_URL on the server";
  if (provider !== "local" && !env.apiKey) return `${provider} has no API key on the server`;
  const next = model ?? active.model[provider];
  if (!env.models.includes(next)) return `model ${next} is not in ${provider.toUpperCase()}_MODELS`;
  active.provider = provider;
  active.model[provider] = next;
  return null;
}

export function publicConfig() {
  const current = getActive();
  return {
    provider: current.provider,
    model: current.model,
    ready: current.ready,
    adminEnabled: adminToken !== null,
    providers: Object.fromEntries(
      (Object.keys(providers) as ProviderId[]).map((id) => [
        id,
        { configured: isConfigured(id), model: active.model[id], models: providers[id].models }
      ])
    )
  };
}

const rawAdmin = process.env.ADMIN_TOKEN?.trim() ?? "";
export const adminToken: string | null = rawAdmin.length >= 16 ? rawAdmin : null;

export const allowedOrigins = list(process.env.ALLOWED_ORIGINS, []);

export const limits = {
  perMinute: Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 60,
  perDay: Number(process.env.AI_RATE_LIMIT_PER_DAY) || 1500
};

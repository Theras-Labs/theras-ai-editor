import type { CopilotProviderId, CopilotSettings, CodexModelId, GeminiModelId } from "./types";

const STORAGE_KEY = "theras:copilot";

export const GEMINI_MODELS: GeminiModelId[] = ["gemini-3-flash-preview", "gemini-3.1-pro-preview"];
export const CODEX_MODELS: CodexModelId[] = ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4", "gpt-5.3-codex", "gpt-5.1-codex-max", "gpt-4.1", "gpt-4.1-mini", "codex-mini-latest", "o3", "o4-mini"];

const DEFAULT_SETTINGS: CopilotSettings = {
  provider: "server",
  gemini: { apiKey: "", model: "gemini-3-flash-preview" },
  codex: { model: "gpt-5.6-terra" },
  server: {},
  temperature: 0.3
};

function defaults(): CopilotSettings {
  return { ...DEFAULT_SETTINGS, gemini: { ...DEFAULT_SETTINGS.gemini }, codex: { ...DEFAULT_SETTINGS.codex }, server: {} };
}

export function loadCopilotSettings(): CopilotSettings {
  try {
    return parseCopilotSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaults();
  }
}

/** Parses saved settings (any older format). Pure: tests call it without localStorage. */
export function parseCopilotSettings(raw: string | null): CopilotSettings {
  try {
    if (!raw) return defaults();

    const parsed = JSON.parse(raw);

    // Migration: detect old flat format { apiKey, model, temperature }
    if (typeof parsed.apiKey === "string" && !parsed.provider) {
      return {
        provider: "gemini",
        gemini: {
          apiKey: parsed.apiKey,
          model: isGeminiModel(parsed.model) ? parsed.model : DEFAULT_SETTINGS.gemini.model
        },
        codex: { ...DEFAULT_SETTINGS.codex },
        server: {},
        temperature: validTemperature(parsed.temperature)
      };
    }

    // New format
    return {
      provider: isValidProvider(parsed.provider) ? parsed.provider : DEFAULT_SETTINGS.provider,
      gemini: {
        apiKey: typeof parsed.gemini?.apiKey === "string" ? parsed.gemini.apiKey : DEFAULT_SETTINGS.gemini.apiKey,
        model: isGeminiModel(parsed.gemini?.model) ? parsed.gemini.model : DEFAULT_SETTINGS.gemini.model
      },
      codex: {
        model: isCodexModel(parsed.codex?.model) ? parsed.codex.model : DEFAULT_SETTINGS.codex.model
      },
      // Added 2026-11-11. Older saved settings have no "server": the admin's default applies.
      server: validServer(parsed.server),
      temperature: validTemperature(parsed.temperature)
    };
  } catch {
    return defaults();
  }
}

const settingsListeners = new Set<() => void>();
let settingsVersion = 0;

/** Called after each save (the prompt input's model picker and the settings dialog stay in step). */
export function subscribeCopilotSettings(listener: () => void) {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}
/** Changes on each save. For useSyncExternalStore. */
export function getCopilotSettingsVersion() {
  return settingsVersion;
}

export function saveCopilotSettings(settings: CopilotSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  settingsVersion++;
  settingsListeners.forEach((l) => l());
}

/**
 * Model for one request. "design" = the slower quality stages (object modeling, image
 * analysis). Theras server: the user's choice, "" = the admin's default (the server picks).
 */
export function modelForStage(settings: CopilotSettings, stage: "default" | "design"): string {
  if (settings.provider === "gemini") return settings.gemini.model;
  if (settings.provider === "codex") return settings.codex.model;
  const model = settings.server.model ?? "";
  return stage === "design" ? (settings.server.designModel ?? model) : model;
}

export function isCopilotConfigured(settings?: CopilotSettings): boolean {
  const s = settings ?? loadCopilotSettings();

  if (s.provider === "gemini") {
    return s.gemini.apiKey.length > 0;
  }

  // The Theras server holds the API key; the admin picks provider and model there.
  if (s.provider === "server") {
    return true;
  }

  // Codex uses local login — always "configured" from the browser's perspective
  // (auth is checked server-side on connect)
  return true;
}

function isValidProvider(v: unknown): v is CopilotProviderId {
  return v === "server" || v === "gemini" || v === "codex";
}

function isGeminiModel(v: unknown): v is GeminiModelId {
  return typeof v === "string" && (GEMINI_MODELS as string[]).includes(v);
}

function isCodexModel(v: unknown): v is CodexModelId {
  return typeof v === "string" && (CODEX_MODELS as string[]).includes(v);
}

function cleanModelName(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const name = v.trim();
  return name && name.length <= 100 ? name : undefined;
}

/** The server checks the name against the admin's list, so any short string is kept here. */
function validServer(v: unknown): CopilotSettings["server"] {
  if (!v || typeof v !== "object") return {};
  const raw = v as Record<string, unknown>;
  const server: CopilotSettings["server"] = {};
  const model = cleanModelName(raw.model);
  const designModel = cleanModelName(raw.designModel);
  if (model) server.model = model;
  if (designModel) server.designModel = designModel;
  return server;
}

function validTemperature(v: unknown): number {
  return typeof v === "number" && v >= 0 && v <= 1 ? v : DEFAULT_SETTINGS.temperature;
}

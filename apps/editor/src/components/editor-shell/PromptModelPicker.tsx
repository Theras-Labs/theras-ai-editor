// Provider and model picker in the prompt input: an icon button that opens a compact list.
// Theras server models come from GET /api/ai/config (the admin's allowed list for the active
// provider); Codex and Gemini models come from lib/copilot/settings.ts. The choice is saved in
// the copilot settings (localStorage), so the next request uses it.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Server, Sparkles, SquareTerminal, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchTherasServerConfig, type TherasServerConfig } from "@/lib/copilot/server-provider";
import {
  CODEX_MODELS,
  GEMINI_MODELS,
  getCopilotSettingsVersion,
  loadCopilotSettings,
  saveCopilotSettings,
  subscribeCopilotSettings
} from "@/lib/copilot/settings";
import type { CodexModelId, CopilotProviderId, CopilotSettings, GeminiModelId } from "@/lib/copilot/types";
import { cn } from "@/lib/utils";

const PROVIDERS: { id: CopilotProviderId; name: string; hint: string; icon: LucideIcon }[] = [
  { id: "server", name: "Theras server", hint: "Key on the server", icon: Server },
  { id: "codex", name: "Codex CLI", hint: "Local ChatGPT login", icon: SquareTerminal },
  { id: "gemini", name: "Gemini", hint: "Your own API key", icon: Sparkles }
];

/** "gpt-5.6-luna" -> "5.6 luna", "gemini-3-flash-preview" -> "3 flash". */
export function shortModelName(model: string): string {
  return model
    .replace(/^(gpt-|gemini-)/, "")
    .replace(/-(preview|latest)$/, "")
    .replace(/-/g, " ");
}

function useCopilotSettings(): CopilotSettings {
  const version = useSyncExternalStore(subscribeCopilotSettings, getCopilotSettingsVersion, getCopilotSettingsVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => loadCopilotSettings(), [version]);
}

// One GET per page until the picker opens again (no polling).
let configCache: Promise<TherasServerConfig> | null = null;
function serverConfig(refresh = false): Promise<TherasServerConfig> {
  if (!configCache || refresh) {
    configCache = fetchTherasServerConfig();
    configCache.catch(() => {
      configCache = null;
    });
  }
  return configCache;
}

function Row({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors",
        active ? "bg-emerald-400/12 text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white"
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
      <Check className={cn("ml-auto size-3.5 shrink-0 text-emerald-300", !active && "invisible")} />
    </button>
  );
}

const sectionLabel = "px-2 pb-1 pt-1.5 text-[10px] font-medium tracking-[0.16em] text-white/40 uppercase";

export function PromptModelPicker({ onChanged }: { onChanged?: () => void }) {
  const settings = useCopilotSettings();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<TherasServerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.provider !== "server") return;
    let cancelled = false;
    serverConfig(open)
      .then((c) => {
        if (cancelled) return;
        setConfig(c);
        setConfigError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setConfigError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [open, settings.provider]);

  const update = (next: CopilotSettings) => {
    saveCopilotSettings(next);
    onChanged?.();
  };

  const provider = PROVIDERS.find((p) => p.id === settings.provider) ?? PROVIDERS[0]!;
  const ProviderIcon = provider.icon;
  const serverModels = config ? (config.providers[config.provider]?.models ?? []) : [];
  const serverDefault = config?.model ?? "";
  const savedServerModel = settings.server.model ?? "";
  const staleServerModel = !!config && !!savedServerModel && !serverModels.includes(savedServerModel);

  const model =
    settings.provider === "gemini" ? settings.gemini.model : settings.provider === "codex" ? settings.codex.model : savedServerModel || serverDefault;
  const designModel = settings.provider === "server" ? settings.server.designModel ?? "" : "";
  const tooltip =
    `${provider.name}: ${model || "server default"}` +
    (settings.provider === "server" ? `. Design: ${designModel || "same as model"}` : "") +
    ". Click to change.";

  const models: string[] =
    settings.provider === "gemini" ? GEMINI_MODELS : settings.provider === "codex" ? CODEX_MODELS : serverModels;

  const pickModel = (id: string) => {
    if (settings.provider === "gemini") update({ ...settings, gemini: { ...settings.gemini, model: id as GeminiModelId } });
    else if (settings.provider === "codex") update({ ...settings, codex: { ...settings.codex, model: id as CodexModelId } });
    else update({ ...settings, server: { ...settings.server, model: id || undefined } });
  };
  const pickDesign = (id: string) => update({ ...settings, server: { ...settings.server, designModel: id || undefined } });

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label={tooltip}
            className={cn(
              "flex h-6 max-w-32 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground",
              open && "bg-white/10 text-foreground",
              staleServerModel && "text-amber-300"
            )}
            data-no-ai-drag
            title={tooltip}
            type="button"
          />
        }
      >
        <ProviderIcon className="size-3.5 shrink-0" />
        <span className="truncate">{model ? shortModelName(model) : "default"}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 gap-0 rounded-2xl border border-white/10 bg-[#0b1512]/92 p-1.5 shadow-[0_18px_48px_rgba(4,12,10,0.5)] backdrop-blur-xl"
        side="top"
      >
        <div className={sectionLabel}>Provider</div>
        <div className="space-y-0.5">
          {PROVIDERS.map(({ id, name, hint, icon: Icon }) => (
            <Row active={settings.provider === id} key={id} onClick={() => update({ ...settings, provider: id })}>
              <Icon className="size-3.5 shrink-0 text-emerald-300/80" />
              <span className="font-medium">{name}</span>
              <span className="truncate text-[10px] text-white/35">{hint}</span>
            </Row>
          ))}
        </div>
        {settings.provider === "gemini" && !settings.gemini.apiKey ? (
          <p className="px-2 pt-1 text-[10px] text-amber-300/90">Add your Gemini key in the settings (gear icon).</p>
        ) : null}

        <div className="my-1.5 h-px bg-white/10" />
        <div className={sectionLabel}>Model</div>
        {settings.provider === "server" && configError ? (
          <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-amber-300">
            <AlertTriangle className="size-3.5 shrink-0" /> Server not reachable
          </p>
        ) : settings.provider === "server" && !config ? (
          <p className="px-2 py-1 text-[11px] text-white/40">Loading models...</p>
        ) : (
          <div className="max-h-48 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
            {settings.provider === "server" ? (
              <Row active={!savedServerModel} onClick={() => pickModel("")} title="The model the admin chose for everyone">
                <span>Server default</span>
                <span className="truncate text-[10px] text-white/35">{serverDefault}</span>
              </Row>
            ) : null}
            {models.map((m) => (
              <Row active={m === (settings.provider === "server" ? savedServerModel : model)} key={m} onClick={() => pickModel(m)}>
                <span className="truncate">{m}</span>
              </Row>
            ))}
          </div>
        )}
        {staleServerModel ? (
          <p className="px-2 pt-1 text-[10px] text-amber-300/90">{savedServerModel} is no longer on the server list. Pick another model.</p>
        ) : null}

        {settings.provider === "server" && config ? (
          <>
            <div className="my-1.5 h-px bg-white/10" />
            <div className={sectionLabel} title="Used for the slower quality stages: object modeling and image analysis">
              Design model
            </div>
            <select
              className="mx-1 mb-1 h-8 w-[calc(100%-0.5rem)] rounded-lg border border-white/10 bg-white/[0.045] px-2 text-[12px] text-foreground outline-none"
              onChange={(e) => pickDesign(e.target.value)}
              title="Used for object modeling and image analysis"
              value={designModel}
            >
              <option value="">Same as model</option>
              {serverModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

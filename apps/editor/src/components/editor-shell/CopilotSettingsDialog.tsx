import { useEffect, useState } from "react";
import { Settings, Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import type { CopilotSettings, CopilotProviderId, GeminiModelId, CodexModelId } from "@/lib/copilot/types";
import { loadCopilotSettings, saveCopilotSettings } from "@/lib/copilot/settings";
import {
  fetchTherasServerConfig,
  getTherasApiUrl,
  setTherasServerProvider,
  type TherasServerConfig
} from "@/lib/copilot/server-provider";

/** The AI connections the editor can use. Add new providers here. */
const PROVIDER_OPTIONS: { id: CopilotProviderId; label: string; hint: string }[] = [
  { id: "server", label: "Theras Server (admin's choice)", hint: "Key on the server. The admin picks OpenAI or Gemini and the model." },
  { id: "codex", label: "Codex CLI (local ChatGPT login)", hint: "Free for local development. Needs the Codex CLI on this computer." },
  { id: "gemini", label: "Gemini API (your own key)", hint: "Your Gemini key, kept in this browser only." }
];

type CodexStatus = { available: boolean; version?: string; error?: string } | null;

const selectClass = "h-10 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-foreground";

/** Shows the provider and model that the admin set on the Theras server, and lets the admin change them. */
function TherasServerSection({
  open,
  settings,
  onChange
}: {
  open: boolean;
  settings: CopilotSettings;
  onChange: (server: CopilotSettings["server"]) => void;
}) {
  const [config, setConfig] = useState<TherasServerConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [token, setToken] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  const apply = (next: TherasServerConfig) => {
    setConfig(next);
    setProvider(next.provider);
    setModel(next.model);
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    fetchTherasServerConfig()
      .then(apply)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [open]);

  const models = config?.providers[provider]?.models ?? [];

  const save = async () => {
    setBusy(true);
    setAdminMessage(null);
    try {
      apply(await setTherasServerProvider(token, provider, model));
      setAdminMessage("Saved. All users now use this provider until the server restarts.");
    } catch (e) {
      setAdminMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {error ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] text-amber-300">
            <AlertTriangle className="size-3.5" />
            Theras server not reachable
          </div>
          <p className="text-[10px] text-foreground/36">
            {error}. URL: <code className="rounded bg-white/10 px-1 py-px text-emerald-200">{getTherasApiUrl() ?? "not set"}</code>. Start it with{" "}
            <code className="rounded bg-white/10 px-1 py-px text-emerald-200">bun run dev:server</code>.
          </p>
        </div>
      ) : config === null ? (
        <p className="text-[11px] text-foreground/40">Checking Theras server...</p>
      ) : config.ready ? (
        <div className="flex items-center gap-2 text-[11px] text-emerald-300">
          <CheckCircle className="size-3.5" />
          {config.provider} / {config.model}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11px] text-amber-300">
          <AlertTriangle className="size-3.5" />
          The server has no API key for {config.provider}
        </div>
      )}
      <p className="text-[10px] text-foreground/36">
        The API key stays on the server. The admin chooses the provider and the models you may use.
      </p>

      {config?.ready ? (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-1">
            <span className="text-[10px] text-foreground/45">Your model</span>
            <select
              className={selectClass}
              onChange={(e) => onChange({ ...settings.server, model: e.target.value || undefined })}
              value={settings.server.model ?? ""}
            >
              <option value="">Server default ({config.model})</option>
              {(config.providers[config.provider]?.models ?? []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1" title="Used for the slower quality stages: object modeling and image analysis">
            <span className="text-[10px] text-foreground/45">Design model</span>
            <select
              className={selectClass}
              onChange={(e) => onChange({ ...settings.server, designModel: e.target.value || undefined })}
              value={settings.server.designModel ?? ""}
            >
              <option value="">Same as model</option>
              {(config.providers[config.provider]?.models ?? []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {config?.adminEnabled ? (
        <div className="space-y-2 rounded-xl border border-white/10 p-2.5">
          <button
            className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase"
            onClick={() => setAdminOpen(!adminOpen)}
            type="button"
          >
            Admin {adminOpen ? "-" : "+"}
          </button>
          {adminOpen ? (
            <>
              <Input
                autoComplete="off"
                className="h-9 rounded-xl border-white/10 bg-white/[0.045] text-sm font-mono"
                onChange={(e) => setToken(e.target.value)}
                placeholder="Admin token"
                type="password"
                value={token}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  className={selectClass}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setModel(config.providers[e.target.value]?.model ?? "");
                  }}
                  value={provider}
                >
                  {Object.entries(config.providers).map(([id, p]) => (
                    <option disabled={!p.configured} key={id} value={id}>
                      {id}{p.configured ? "" : " (no key)"}
                    </option>
                  ))}
                </select>
                <select className={selectClass} onChange={(e) => setModel(e.target.value)} value={model}>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <Button className="h-8 w-full rounded-xl text-xs" disabled={busy || token.length === 0} onClick={save} size="sm">
                Set for all users
              </Button>
              {adminMessage ? <p className="text-[10px] text-foreground/50">{adminMessage}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CopilotSettingsDialog({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CopilotSettings>(loadCopilotSettings);
  const [showKey, setShowKey] = useState(false);
  const [codexStatus, setCodexStatus] = useState<CodexStatus>(null);

  useEffect(() => {
    if (open) {
      setSettings(loadCopilotSettings());
      fetchCodexStatus();
    }
  }, [open]);

  const fetchCodexStatus = async () => {
    try {
      const res = await fetch("/api/codex/status");
      setCodexStatus(await res.json());
    } catch {
      setCodexStatus({ available: false, error: "Could not check Codex status" });
    }
  };

  const handleSave = () => {
    saveCopilotSettings(settings);
    setOpen(false);
    onSaved?.();
  };

  const setProvider = (provider: CopilotProviderId) => {
    setSettings({ ...settings, provider });
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button className="size-7 rounded-lg text-foreground/48 hover:text-foreground" size="icon-sm" variant="ghost" />
        }
      >
        <Settings className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0a1510] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ask Theras settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Provider selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
              Provider
            </label>
            <select
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-foreground"
              onChange={(e) => setProvider(e.target.value as CopilotProviderId)}
              value={settings.provider}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-foreground/36">
              {PROVIDER_OPTIONS.find((option) => option.id === settings.provider)?.hint}
            </p>
          </div>

          {/* Provider-specific settings */}
          {settings.provider === "server" ? (
            <TherasServerSection
              onChange={(server) => setSettings({ ...settings, server })}
              open={open}
              settings={settings}
            />
          ) : settings.provider === "gemini" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  API Key
                </label>
                <div className="relative">
                  <Input
                    className="h-10 rounded-xl border-white/10 bg-white/[0.045] pr-10 text-sm font-mono"
                    onChange={(e) => setSettings({ ...settings, gemini: { ...settings.gemini, apiKey: e.target.value } })}
                    placeholder="Enter your Gemini API key"
                    type={showKey ? "text" : "password"}
                    value={settings.gemini.apiKey}
                  />
                  <Button
                    className="absolute right-1 top-1 size-8 rounded-lg text-foreground/48"
                    onClick={() => setShowKey(!showKey)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
                <p className="text-[10px] text-foreground/36">
                  Stored locally in your browser. Never sent to our servers.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  Model
                </label>
                <select
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-foreground"
                  onChange={(e) => setSettings({ ...settings, gemini: { ...settings.gemini, model: e.target.value as GeminiModelId } })}
                  value={settings.gemini.model}
                >
                  <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
                  Model
                </label>
                <select
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-foreground"
                  disabled={!codexStatus?.available}
                  onChange={(e) => setSettings({ ...settings, codex: { ...settings.codex, model: e.target.value as CodexModelId } })}
                  value={settings.codex.model}
                >
                  <option value="gpt-5.6-terra">GPT-5.6 Terra (ChatGPT login default)</option>
                  <option value="gpt-5.6-luna">GPT-5.6 Luna</option>
                  <option value="gpt-5.4">GPT-5.4 (Flagship)</option>
                  <option value="gpt-5.3-codex">GPT-5.3 Codex</option>
                  <option value="gpt-5.1-codex-max">GPT-5.1 Codex Max</option>
                  <option value="gpt-4.1">GPT-4.1</option>
                  <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                  <option value="o3">o3 (Reasoning)</option>
                  <option value="o4-mini">o4-mini (Reasoning)</option>
                  <option value="codex-mini-latest">Codex Mini (Legacy)</option>
                </select>
              </div>

              {/* Codex status */}
              <div className="space-y-2">
                {codexStatus === null ? (
                  <p className="text-[11px] text-foreground/40">Checking Codex CLI...</p>
                ) : codexStatus.available ? (
                  <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                    <CheckCircle className="size-3.5" />
                    Codex CLI detected {codexStatus.version ? `(${codexStatus.version})` : ""}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-amber-300">
                      <AlertTriangle className="size-3.5" />
                      Codex CLI not found
                    </div>
                    <p className="text-[10px] text-foreground/36">
                      Install with: <code className="rounded bg-white/10 px-1 py-px text-emerald-200">npm install -g @openai/codex</code>
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-foreground/36">
                  Codex uses your local login session. Run <code className="rounded bg-white/10 px-1 py-px text-emerald-200">codex login</code> in your terminal to authenticate.
                </p>
              </div>
            </>
          )}

          {/* Temperature (shared) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium tracking-[0.18em] text-foreground/52 uppercase">
              Temperature ({settings.temperature.toFixed(1)})
            </label>
            <input
              className="w-full accent-emerald-400"
              max={1}
              min={0}
              onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
              step={0.1}
              type="range"
              value={settings.temperature}
            />
            <div className="flex justify-between text-[10px] text-foreground/36">
              <span>Precise</span>
              <span>Creative</span>
            </div>
            <p className="text-[10px] text-foreground/36">
              How much the AI varies its answers. Low: predictable, repeats the same layout. High: more varied ideas.
              GPT-5 models (Theras Server with OpenAI) ignore it.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button className="rounded-xl" onClick={() => setOpen(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={handleSave} size="sm">
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

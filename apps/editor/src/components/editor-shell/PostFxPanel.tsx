// Screen effects panel (top bar "Effects"): presets and sliders for the post processing of the
// viewport. Values are saved with the scene (sceneSettings.world.postFx); see lib/post-fx.ts.
import type { EditorCore } from "@theras/editor-core";
import type { ScenePostFx, SceneSettings } from "@theras/shared";
import { Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { cn } from "@/lib/utils";
import { editPostFx, flushPostFx, normalizePostFx, POST_FX_PRESETS, postFxStore, presetValues, setScenePostFx } from "@/lib/post-fx";

type NumberKey = { [K in keyof ScenePostFx]-?: ScenePostFx[K] extends number ? K : never }[keyof ScenePostFx];

const SECTIONS: { title: string; rows: { key: NumberKey; label: string; min: number; max: number; step: number }[] }[] = [
  {
    title: "Ink lines",
    rows: [
      { key: "outline", label: "Strength", min: 0, max: 1, step: 0.01 },
      { key: "outlineWidth", label: "Width", min: 0.5, max: 3, step: 0.05 }
    ]
  },
  {
    title: "Glow",
    rows: [
      { key: "bloom", label: "Amount", min: 0, max: 2, step: 0.01 },
      { key: "bloomThreshold", label: "Starts at", min: 0, max: 1.5, step: 0.01 },
      { key: "bloomRadius", label: "Spread", min: 0, max: 1, step: 0.01 }
    ]
  },
  {
    title: "Color",
    rows: [
      { key: "exposure", label: "Exposure", min: 0.3, max: 2.5, step: 0.01 },
      { key: "contrast", label: "Contrast", min: -0.5, max: 0.5, step: 0.01 },
      { key: "saturation", label: "Saturation", min: -1, max: 1, step: 0.01 },
      { key: "warmth", label: "Warmth", min: -1, max: 1, step: 0.01 }
    ]
  },
  {
    title: "Lens",
    rows: [
      { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.01 },
      { key: "grain", label: "Grain", min: 0, max: 0.3, step: 0.005 }
    ]
  }
];

export function PostFxPanel({ editor, sceneSettings }: { editor: EditorCore; sceneSettings: SceneSettings }) {
  const snap = useSnapshot(postFxStore);
  // A pending edit is written when the panel closes.
  useEffect(() => {
    if (!snap.open) flushPostFx(editor);
  }, [snap.open, editor]);
  if (!snap.open) return null;

  const fx = normalizePostFx((snap.live as ScenePostFx | null) ?? sceneSettings.world.postFx);
  const set = (patch: Partial<ScenePostFx>) => editPostFx(editor, { ...fx, ...patch, enabled: patch.enabled ?? true, preset: patch.preset ?? "custom" });
  const close = () => (postFxStore.open = false);

  return (
    <div
      className="fixed top-12 right-3 z-[90] flex max-h-[calc(100vh-4.5rem)] w-72 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a1210]/92 shadow-2xl backdrop-blur-2xl"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <Sparkles className="size-4 text-emerald-300" />
        <div className="flex-1 text-[13px] font-medium text-foreground/90">Screen effects</div>
        <button
          aria-pressed={fx.enabled}
          className={cn(
            "h-6 rounded-md border px-2 text-[11px] transition-colors",
            fx.enabled ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setScenePostFx(editor, { ...fx, enabled: !fx.enabled })}
          type="button"
        >
          {fx.enabled ? "On" : "Off"}
        </button>
        <button className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground" onClick={close} type="button">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1.5">
          {POST_FX_PRESETS.map((p) => (
            <button
              className={cn(
                "h-6 rounded-md border px-2 text-[11px] transition-colors",
                (fx.preset ?? "none") === p.id && (fx.enabled || p.id === "none")
                  ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
                  : "border-white/10 bg-white/[0.03] text-foreground/75 hover:bg-white/8"
              )}
              key={p.id}
              onClick={() => setScenePostFx(editor, presetValues(p.id))}
              title={p.hint}
              type="button"
            >
              {p.name}
            </button>
          ))}
        </div>

        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-foreground/80">{section.title}</span>
              {section.title === "Ink lines" ? (
                <input
                  aria-label="Line color"
                  className="ml-auto h-5 w-7 cursor-pointer rounded border border-white/15 bg-transparent p-0"
                  onChange={(e) => set({ outlineColor: e.target.value })}
                  type="color"
                  value={fx.outlineColor}
                />
              ) : null}
            </div>
            {section.rows.map((row) => (
              <label className="flex items-center gap-2 py-0.5" key={row.key}>
                <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{row.label}</span>
                <input
                  className="h-1 min-w-0 flex-1 cursor-pointer accent-emerald-400"
                  max={row.max}
                  min={row.min}
                  onChange={(e) => set({ [row.key]: Number(e.target.value) })}
                  step={row.step}
                  type="range"
                  value={fx[row.key]}
                />
                <span className="w-9 shrink-0 text-right font-mono text-[10.5px] text-foreground/70">{fx[row.key].toFixed(2)}</span>
              </label>
            ))}
          </div>
        ))}

        <p className="text-[10.5px] leading-snug text-muted-foreground">
          Saved with the scene, and Undo reverts it. Effects are skipped in VR. The desert's own ink lines are part of its materials, so they show
          with effects off.
        </p>
      </div>
    </div>
  );
}

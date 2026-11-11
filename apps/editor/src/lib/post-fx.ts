// Post processing settings: presets, the live edit store and the commit to scene settings.
// The values live in the scene (sceneSettings.world.postFx), so they are saved with the scene,
// undo reverts them, and a .whmap file carries them. The panel edits a live copy for an instant
// preview and writes it to the scene after a short pause (one undo step per pause).
// The render passes are in viewport/components/PostFx.tsx.
import { createSetSceneSettingsCommand, type EditorCore } from "@theras/editor-core";
import type { ScenePostFx, SceneSettings } from "@theras/shared";
import { proxy } from "valtio";

export const POST_FX_OFF: ScenePostFx = {
  enabled: false,
  preset: "none",
  outline: 0,
  outlineWidth: 1,
  outlineColor: "#1b1410",
  bloom: 0,
  bloomThreshold: 0.85,
  bloomRadius: 0.4,
  exposure: 1,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  vignette: 0,
  grain: 0
};

export type PostFxPreset = { id: string; name: string; hint: string; values: Partial<ScenePostFx> };

export const POST_FX_PRESETS: PostFxPreset[] = [
  { id: "none", name: "None", hint: "No screen effects", values: {} },
  { id: "soft", name: "Soft", hint: "Light glow and soft corners", values: { bloom: 0.45, bloomThreshold: 0.9, bloomRadius: 0.5, vignette: 0.3, contrast: 0.05 } },
  { id: "ink", name: "Ink", hint: "Ink lines on every edge, like a print", values: { outline: 0.85, outlineWidth: 1.2, outlineColor: "#1b1410", contrast: 0.08, saturation: -0.1, vignette: 0.2 } },
  { id: "storybook", name: "Storybook", hint: "Ink lines, warm light and glow", values: { outline: 0.6, outlineWidth: 1, outlineColor: "#3a2618", bloom: 0.35, bloomThreshold: 0.95, warmth: 0.35, saturation: 0.12, vignette: 0.25 } },
  { id: "cinematic", name: "Cinematic", hint: "Contrast, cool shadows, grain", values: { contrast: 0.18, saturation: -0.12, warmth: -0.15, vignette: 0.45, grain: 0.06, bloom: 0.25, bloomThreshold: 1 } },
  { id: "golden", name: "Golden hour", hint: "Warm, bright and glowing", values: { exposure: 1.12, warmth: 0.6, saturation: 0.18, bloom: 0.6, bloomThreshold: 0.8, bloomRadius: 0.6, vignette: 0.2 } },
  { id: "noir", name: "Noir", hint: "Black and white with hard contrast", values: { saturation: -1, contrast: 0.32, vignette: 0.55, grain: 0.1, outline: 0.35 } },
  { id: "dream", name: "Dream", hint: "Strong glow, pale and soft", values: { bloom: 1.2, bloomThreshold: 0.6, bloomRadius: 0.85, exposure: 1.08, contrast: -0.12, saturation: 0.2, warmth: 0.15 } }
];

export function presetValues(id: string): ScenePostFx {
  const preset = POST_FX_PRESETS.find((p) => p.id === id);
  return { ...POST_FX_OFF, ...(preset?.values ?? {}), enabled: id !== "none", preset: id };
}

/** True when the settings draw anything (the composer is skipped otherwise). */
export function postFxActive(fx: ScenePostFx | undefined): fx is ScenePostFx {
  if (!fx?.enabled) return false;
  return (
    fx.outline > 0.001 ||
    fx.bloom > 0.001 ||
    Math.abs(fx.exposure - 1) > 0.001 ||
    Math.abs(fx.contrast) > 0.001 ||
    Math.abs(fx.saturation) > 0.001 ||
    Math.abs(fx.warmth) > 0.001 ||
    fx.vignette > 0.001 ||
    fx.grain > 0.001
  );
}

export function normalizePostFx(fx: Partial<ScenePostFx> | undefined): ScenePostFx {
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const base = { ...POST_FX_OFF, ...(fx ?? {}) };
  return {
    enabled: Boolean(base.enabled),
    preset: typeof base.preset === "string" ? base.preset : undefined,
    outline: n(base.outline, 0, 1, 0),
    outlineWidth: n(base.outlineWidth, 0.5, 3, 1),
    outlineColor: typeof base.outlineColor === "string" && /^#[0-9a-f]{6}$/i.test(base.outlineColor) ? base.outlineColor : POST_FX_OFF.outlineColor,
    bloom: n(base.bloom, 0, 2, 0),
    bloomThreshold: n(base.bloomThreshold, 0, 1.5, 0.85),
    bloomRadius: n(base.bloomRadius, 0, 1, 0.4),
    exposure: n(base.exposure, 0.3, 2.5, 1),
    contrast: n(base.contrast, -0.5, 0.5, 0),
    saturation: n(base.saturation, -1, 1, 0),
    warmth: n(base.warmth, -1, 1, 0),
    vignette: n(base.vignette, 0, 1, 0),
    grain: n(base.grain, 0, 0.3, 0)
  };
}

/** live: the values being edited (null when the scene's own values apply). open: the panel. */
export const postFxStore = proxy<{ live: ScenePostFx | null; open: boolean }>({ live: null, open: false });

/** The values to draw: the live edit, else the scene's. */
export function effectivePostFx(settings: SceneSettings): ScenePostFx | undefined {
  return postFxStore.live ?? settings.world.postFx;
}

let commitTimer: number | undefined;

/** Writes the values to the scene settings now (one undo step). */
export function setScenePostFx(editor: EditorCore, fx: ScenePostFx) {
  window.clearTimeout(commitTimer);
  const next: SceneSettings = structuredClone(editor.scene.settings);
  next.world.postFx = normalizePostFx(fx);
  editor.execute(createSetSceneSettingsCommand(editor.scene, next));
  postFxStore.live = null;
}

/** Shows the values at once and writes them to the scene after a 400 ms pause. */
export function editPostFx(editor: EditorCore, fx: ScenePostFx) {
  postFxStore.live = fx;
  window.clearTimeout(commitTimer);
  commitTimer = window.setTimeout(() => {
    if (postFxStore.live) setScenePostFx(editor, postFxStore.live);
  }, 400);
}

/** Writes a pending edit now (the panel closes, a scene is saved). */
export function flushPostFx(editor: EditorCore) {
  if (postFxStore.live) setScenePostFx(editor, postFxStore.live);
}

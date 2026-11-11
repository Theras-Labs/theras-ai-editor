// Design playbook loader (plan docs/plans/realtime-ai-harness.md, 5.8).
// pickPlaybook chooses at most 1 playbook from trigger words, in code (no model call).
// playbookToText renders it as a short block (300 tokens or less) for the end of the
// user message, after the scene digest, so the static prompt prefix stays cache-stable.
import { paletteToText } from "../palettes";
import { CAMP_PLAYBOOK } from "./camp";
import { GARDEN_PLAYBOOK } from "./garden";
import { HARBOR_PLAYBOOK } from "./harbor";
import { SHRINE_PLAYBOOK } from "./shrine";
import type { Playbook } from "./types";

export type { Playbook, PlaybookExample, PlaybookItem, PlaybookLayout } from "./types";

/** All playbooks. On a tie, the earlier one wins. */
export const PLAYBOOKS: Playbook[] = [HARBOR_PLAYBOOK, CAMP_PLAYBOOK, GARDEN_PLAYBOOK, SHRINE_PLAYBOOK];

/** Token limit of playbookToText (tokens are counted as characters / 4). */
export const PLAYBOOK_MAX_TOKENS = 300;

/** Prompts that remove, ask or explain do not get a playbook. */
const NO_PLAYBOOK = /^\s*(please\s+)?(remove|delete|clear|undo|hide|rename|select|what|why|how|where|which|who|explain|list|describe|show me)\b/i;

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** Number of distinct triggers of a playbook in a normalized prompt (plural "s" / "es" allowed). */
export function triggerHits(playbook: Playbook, normalizedPrompt: string): number {
  let hits = 0;
  for (const trigger of playbook.triggers) {
    const t = normalize(trigger).trim();
    if (!t) continue;
    if ([` ${t} `, ` ${t}s `, ` ${t}es `].some((form) => normalizedPrompt.includes(form))) hits++;
  }
  return hits;
}

/**
 * The playbook for a prompt, or null when no trigger word matches.
 * sceneKinds: resource kinds in the scene ("water", "terrain", "sky", ...); they only break ties.
 */
export function pickPlaybook(prompt: string, sceneKinds: Iterable<string> = []): Playbook | null {
  if (NO_PLAYBOOK.test(prompt)) return null;
  const text = normalize(prompt);
  const kinds = new Set(sceneKinds);
  let best: Playbook | null = null;
  let bestScore = 0;
  for (const playbook of PLAYBOOKS) {
    const hits = triggerHits(playbook, text);
    if (hits === 0) continue;
    const score = hits + (playbook.sceneHints?.some((k) => kinds.has(k)) ? 0.5 : 0);
    if (score > bestScore) {
      best = playbook;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Text block for the model. sceneKinds: when the scene already has a sky or water,
 * those lines are left out (the playbook must not replace what the user has).
 */
export function playbookToText(playbook: Playbook, sceneKinds: Iterable<string> = []): string {
  const kinds = new Set(sceneKinds);
  const setup: string[] = [];
  if (!kinds.has("sky")) setup.push(`Set sky ${playbook.environment}`);
  if (playbook.water && !kinds.has("water")) setup.push(`water ${playbook.water}`);
  const lines = [
    `[Design playbook: ${playbook.name}. Follow it unless the user asks otherwise.]`,
    ...(setup.length ? [`${setup.join(", ")}.`] : []),
    `Palette ${paletteToText(playbook.palette)}.`,
    `Focal: ${playbook.focal.join(", ")}. Support: ${playbook.support.join(", ")}. Accents: ${playbook.accents.join(", ")}.`,
    ...playbook.rules.map((rule) => `- ${rule}`),
    `Example place_resources: ${JSON.stringify(playbook.example)}`
  ];
  return lines.join("\n");
}

/** Approximate token count (characters / 4). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** All library ids a playbook names (sky, water, focal, support, accents, example items). */
export function playbookIds(playbook: Playbook): string[] {
  return [
    playbook.environment,
    ...(playbook.water ? [playbook.water] : []),
    ...playbook.focal,
    ...playbook.support,
    ...playbook.accents,
    ...playbook.example.items.map((item) => item.id)
  ];
}

// Design playbooks (plan docs/plans/realtime-ai-harness.md, 5.8): curated design knowledge
// for one theme, loaded on demand into the user message. Plain data, no code paths.
import type { PaletteId } from "../palettes";

/** Layout of one place_resources item. Same shape as the fixed contract in plan section 5.7. */
export type PlaybookLayout = {
  pattern: "single" | "cluster" | "ring" | "row" | "scatter" | "shore" | "path";
  anchor?: string | { x: number; z: number };
  to?: string | { x: number; z: number };
  radius?: number;
  facing?: "anchor" | "away" | "random" | "along";
};

/** One place_resources item (plan 5.7). */
export type PlaybookItem = {
  id: string;
  count?: number;
  layout?: PlaybookLayout;
  seed?: number;
};

/** place_resources arguments (plan 5.7). */
export type PlaybookExample = {
  folder?: string;
  items: PlaybookItem[];
};

export type Playbook = {
  id: string;
  name: string;
  /** Words and phrases in a prompt that select this playbook (lower case). */
  triggers: string[];
  /** Scene kinds (resource kinds such as "water" or "terrain") that make this playbook a better fit on a tie. */
  sceneHints?: string[];
  palette: PaletteId;
  /** Library sky id (kind "sky"). */
  environment: string;
  /** Library water id (kind "water"). */
  water?: string;
  focal: string[];
  support: string[];
  accents: string[];
  /** 5 to 8 short design rules. */
  rules: string[];
  example: PlaybookExample;
};

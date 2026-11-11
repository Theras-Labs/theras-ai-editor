// One-shot script. Run it by hand in server:
//
//   bun scripts/build-asset-index.ts
//
// It makes two GET requests to huggingface.co (the dataset record, then metadata.jsonl), writes
// server/data/assets-index.json and ATTRIBUTION.md,
// and ends. Each request is tried one time. The server and the editor never run this script.
//
// It stops with an error, and writes nothing, when the dataset is not what the plan says
// (docs/plans/realtime-ai-harness.md, section 6): another license on the dataset card, a missing
// column, or many rows that the filter cannot read.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSET_DATASET,
  ASSET_HOST,
  ASSET_INDEX_FILE,
  ASSET_LIMITS,
  REDISTRIBUTABLE_LICENSES,
  REQUIRED_COLUMNS,
  assetFileUrl,
  buildAssetIndex,
  normalLicense,
  type AssetIndex
} from "../src/assets";

const ATTRIBUTION_FILE = fileURLToPath(new URL("../../ATTRIBUTION.md", import.meta.url));
const REQUEST_TIMEOUT_MS = 60_000;
/** More unreadable rows than this share means the dataset changed: stop. */
const MAX_INVALID_SHARE = 0.05;

const count = (n: number) => n.toLocaleString("en-US");

/** The credits file, made from the index. CC BY 4.0 asks for author, source, license and changes. */
export function attributionMarkdown(index: AssetIndex): string {
  const cell = (text: string) => text.replace(/\|/g, "\\|");
  const rows = index.assets.map((a) => `| ${cell(a.name)} | ${cell(a.category)} | ${a.source} |`);
  return `# Attribution

Theras AI can place scanned objects from an external source. Their license (CC BY 4.0) asks for a credit. This file is that credit.

Do not change this file by hand. The script \`server/scripts/build-asset-index.ts\` writes it from \`server/data/assets-index.json\`. Credits for the objects that are stored in this repository are in \`README.md\`, section "Credits and licenses".

## Scanned objects

- Work: Google Scanned Objects. The index has ${count(index.counts.kept)} of the ${count(index.counts.source)} models: those with a file of ${count(index.limits.maxBytes)} bytes or less and ${count(index.limits.maxTriangles)} triangles or less.
- Author: Google Research. Copyright 2020 Google LLC.
- License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/
- Source of the scans: https://app.gazebosim.org/GoogleResearch/fuel/models
- Files that the editor loads: the GLB copies in the Hugging Face dataset \`${index.dataset}\`, commit \`${index.revision}\`, ${ASSET_HOST}/datasets/${index.dataset}
- Changes: codepawl converted the scans from OBJ and PNG to GLB (Y up, meters, compressed geometry, 2048 px WebP texture). Theras AI does not change the files. The editor loads a file from the Hugging Face host when the object is placed.
- The files are not stored in this repository.
- Brands, logos and product names on the scanned products belong to their owners. Their use here does not mean that the owners support Theras AI.

Index written: ${index.generatedAt}.

### Models in the index

| Model | Category | Page of the original scan |
|---|---|---|
${rows.join("\n")}
`;
}

/** The index file as text: one model on each line, so a change shows as a small difference. */
export function indexFileText(index: AssetIndex): string {
  const { assets, ...head } = index;
  const headText = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  return `${headText},\n  "assets": [\n${assets.map((a) => `    ${JSON.stringify(a)}`).join(",\n")}\n  ]\n}\n`;
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "user-agent": "asset-index-script" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`GET ${url} answered HTTP ${res.status}.`);
  return res;
}

async function main() {
  // 1. The dataset record: license of the card and the commit that the URLs will point to.
  const record = (await (await get(`${ASSET_HOST}/api/datasets/${ASSET_DATASET}`)).json()) as {
    sha?: string;
    private?: boolean;
    gated?: boolean | string;
    disabled?: boolean;
    cardData?: { license?: unknown };
  };
  const cardLicense = normalLicense(record.cardData?.license);
  if (!REDISTRIBUTABLE_LICENSES.includes(cardLicense)) {
    throw new Error(`The dataset card of ${ASSET_DATASET} gives the license "${String(record.cardData?.license)}". The index needs one of: ${REDISTRIBUTABLE_LICENSES.join(", ")}. Nothing was written.`);
  }
  if (record.private || record.gated || record.disabled) throw new Error(`${ASSET_DATASET} is private, gated or disabled. Nothing was written.`);
  const revision = record.sha ?? "";
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error(`The dataset record of ${ASSET_DATASET} has no commit id. Nothing was written.`);

  // 2. The metadata: one JSON object on each line.
  const text = await (await get(assetFileUrl(revision, "metadata.jsonl"))).text();
  const rows: unknown[] = [];
  let unreadable = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      unreadable += 1;
    }
  }
  if (rows.length === 0) throw new Error("metadata.jsonl has no rows. Nothing was written.");
  const first = rows[0] as Record<string, unknown>;
  const missing = REQUIRED_COLUMNS.filter((column) => !(column in first));
  if (missing.length > 0) throw new Error(`metadata.jsonl has no column ${missing.join(", ")}. The dataset is not what the plan says. Nothing was written.`);

  // 3. Filter and write.
  const index = buildAssetIndex(rows, revision, new Date().toISOString());
  const invalid = index.counts.invalid + unreadable;
  if (invalid > rows.length * MAX_INVALID_SHARE) {
    throw new Error(`${invalid} of ${rows.length} rows are not readable by the filter. The dataset is not what the plan says. Nothing was written.`);
  }
  mkdirSync(dirname(ASSET_INDEX_FILE), { recursive: true });
  writeFileSync(ASSET_INDEX_FILE, indexFileText(index));
  writeFileSync(ATTRIBUTION_FILE, attributionMarkdown(index));

  const c = index.counts;
  console.log(`Dataset ${ASSET_DATASET}, commit ${revision}, card license ${cardLicense}.`);
  console.log(`Rows: ${c.source}. Kept: ${c.kept}.`);
  console.log(`Left out: ${c.bytes} over ${count(ASSET_LIMITS.maxBytes)} bytes, ${c.triangles} over ${count(ASSET_LIMITS.maxTriangles)} triangles, ${c.license} with another license, ${invalid} not readable.`);
  console.log(`Wrote ${ASSET_INDEX_FILE}`);
  console.log(`Wrote ${ATTRIBUTION_FILE}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

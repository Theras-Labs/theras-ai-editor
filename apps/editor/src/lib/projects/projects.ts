// Project import: the user gives the path of a project folder (a game repository, an asset
// folder) in Ask Theras or in the template gallery. The local Theras server scans it
// (server/src/projects.ts) and serves its asset files. This module turns the scan into:
// - library entries for the project's 3D models (category "Project: <name>"),
// - the project's environment: a known place builder ("adapter") fed with the project's own
//   files, or else the largest level/world/map model,
// - reference images (concept art, screenshots) the user can send to the AI,
// - a template card in the gallery.
// Imported projects are remembered per viewer (localStorage) and scanned again at start,
// because the server keeps scanned folders in memory only.
import { proxy, subscribe } from "valtio";
import { getTherasApiUrl } from "@/lib/copilot/server-provider";
import { registerRuntimeEntries } from "@/lib/resources/catalog";
import { modelInstance, titleCase } from "@/lib/resources/models/gltf-model";
import type { ResourceEntry, ResourceKind } from "@/lib/resources/types";

export type ProjectFile = { p: string; b: number };

export type ProjectScan = {
  id: string;
  name: string;
  root: string;
  about: string;
  deps: Record<string, string>;
  files: ProjectFile[];
  truncated: boolean;
};

/** A place builder in the library that can rebuild a project's environment from its files. */
export type ProjectAdapter = {
  id: string;
  label: string;
  /** The library entry that builds the place. */
  entryId: string;
  /** Sky for the scene around it. */
  sky: string;
  /** True when the scanned files belong to a project this adapter knows. */
  match: (files: Set<string>, scan: ProjectScan) => boolean;
  /** Entry params; fileUrl turns a project path into a URL the browser can load. */
  params?: (fileUrl: (path: string) => string, scan: ProjectScan) => Record<string, unknown>;
  camera?: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } };
};

export const PROJECT_ADAPTERS: ProjectAdapter[] = [
  {
    id: "alley-arena",
    label: "Cobbled alley arena",
    entryId: "env:alley-arena",
    sky: "lh:sky:anime_sunset",
    match: (files) =>
      files.has("src/shared/cheddar-alley/arena.generated.ts") || files.has("public/games/cheddar-alley/assets/world/manifest.json"),
    params: (fileUrl, scan) =>
      scan.files.some((f) => f.p === "public/games/cheddar-alley/assets/world/manifest.json")
        ? { assetBase: fileUrl("public/games/cheddar-alley/assets/world") }
        : {},
    camera: { position: { x: 15, y: 8, z: 17 }, target: { x: -2, y: 2, z: -2 } }
  },
  {
    id: "desert-world",
    label: "Desert world",
    entryId: "env:desert-ruins",
    sky: "lh:sky:summer_noon",
    match: (files, scan) =>
      files.has("src/world/desert/buildDesert.ts") || scan.files.some((f) => /^readable\/assets\/desert-data-/.test(f.p)),
    camera: { position: { x: -174.5, y: 2.4, z: 41.1 }, target: { x: 0, y: 4, z: 0 } }
  },
  {
    id: "island",
    label: "Island habitat",
    entryId: "lh:terrain:island",
    sky: "lh:sky:anime_day",
    match: (files) => files.has("src/landmarks/index.ts") || (has(files, "src/flora/") && has(files, "src/landmarks/") && has(files, "src/ecology/")),
    camera: { position: { x: 16, y: 11, z: 18 }, target: { x: 0, y: 1, z: 0 } }
  }
];

function has(files: Set<string>, prefix: string) {
  for (const f of files) if (f.startsWith(prefix)) return true;
  return false;
}

export type ImportedProject = {
  root: string;
  name: string;
  /** Server id of the scan (valid while the server runs). */
  id: string;
  importedAt: number;
  about: string;
  adapters: string[];
  /** Params for the first adapter's place builder (URLs of the project's own files). */
  environmentParams?: Record<string, unknown>;
  models: { id: string; path: string; name: string; kind: ResourceKind; bytes: number }[];
  /** The model used as the environment when no adapter matches (a level, world or map file). */
  levelModel?: string;
  references: string[];
  textures: number;
  sourceFiles: number;
  /** The scan is from this server run (assets load); false until the start-up scan finished. */
  live: boolean;
};

const KEY = "theras:projects";

function loadSaved(): ImportedProject[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as ImportedProject[];
    return Array.isArray(raw) ? raw.map((p) => ({ ...p, live: false })) : [];
  } catch {
    return [];
  }
}

export const projectStore = proxy<{ projects: ImportedProject[]; busy: string | null; error: string | null }>({
  projects: loadSaved(),
  busy: null,
  error: null
});

subscribe(projectStore, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(projectStore.projects.map(({ live: _live, ...p }) => p)));
  } catch {
    // per-viewer convenience only
  }
});

const MODEL_EXT = /\.(glb|gltf|vrm)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const LEVEL_WORDS = /(^|[/_-])(level|world|map|arena|scene|stage|terrain|environment|island|city|town)([/_.-]|$)/i;
const REFERENCE_FOLDER = /(^|\/)(references?|concept|concepts|moodboard|store-screenshots|screenshots)\//i;

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

function kindForPath(path: string): ResourceKind {
  const p = path.toLowerCase();
  if (LEVEL_WORDS.test(p)) return "environment";
  if (/(character|creature|enemy|npc|player|hero|monster|animal|guardian)/.test(p)) return "creature";
  if (/(tree|plant|bush|flower|grass|rock|stone)/.test(p)) return "plant";
  if (/(building|house|wall|tower|roof|castle|shop|door|window)/.test(p)) return "building";
  return "feature";
}

export function projectFileUrl(scanId: string, path: string): string {
  const base = getTherasApiUrl() ?? "";
  return `${base}/api/project/${scanId}/file/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Library entries for a scanned project's models. Replaced on every scan. */
function projectEntries(project: ImportedProject): ResourceEntry[] {
  return project.models.map((m) => ({
    id: m.id,
    name: m.name,
    kind: m.kind,
    source: "local" as const,
    origin: project.name,
    license: "From the user's project",
    category: `Project: ${project.name}`,
    tags: ["project", slug(project.name), ...m.path.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2).slice(-6)],
    description: `${m.name}: a model from the project ${project.name} (${m.path}).`,
    footprint: m.kind === "environment" ? 20 : 1,
    create: () => modelInstance(projectFileUrl(project.id, m.path), { scale: 1 })
  }));
}

/** Turns a scan into a project record (no network). */
export function analyzeScan(scan: ProjectScan): ImportedProject {
  const files = new Set(scan.files.map((f) => f.p));
  const matched = PROJECT_ADAPTERS.filter((a) => a.match(files, scan));
  const adapters = matched.map((a) => a.id);
  const environmentParams = matched[0]?.params?.((path) => projectFileUrl(scan.id, path), scan);
  const projectSlug = slug(scan.name) || "project";
  const models = scan.files
    .filter((f) => MODEL_EXT.test(f.p) && !/(^|\/)(tests?|fixtures?|__snapshots__)\//i.test(f.p))
    .slice(0, 400)
    .map((f) => {
      const file = f.p.split("/").pop() ?? f.p;
      return { id: `project:${projectSlug}:${slug(f.p)}`, path: f.p, name: titleCase(file.replace(/\.[a-z0-9]+$/i, "")), kind: kindForPath(f.p), bytes: f.b };
    });
  const levels = models.filter((m) => m.kind === "environment").sort((a, b) => b.bytes - a.bytes);
  // Concept art and photos: files in a reference folder, or camera photos (IMG_1234.jpg). One per file name.
  const seenNames = new Set<string>();
  const references = scan.files
    .filter((f) => IMAGE_EXT.test(f.p) && f.b > 20_000 && (REFERENCE_FOLDER.test(f.p) || /(^|\/)IMG_\d+/i.test(f.p)))
    .filter((f) => {
      const name = (f.p.split("/").pop() ?? f.p).replace(/-[A-Za-z0-9_-]{8}(?=\.)/, "").toLowerCase();
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    })
    .map((f) => f.p)
    .slice(0, 60);
  return {
    root: scan.root,
    name: scan.name,
    id: scan.id,
    importedAt: Date.now(),
    about: scan.about,
    adapters,
    environmentParams,
    models,
    levelModel: levels[0]?.id,
    references,
    textures: scan.files.filter((f) => /\.(png|jpe?g|webp|ktx2|hdr|exr)$/i.test(f.p)).length,
    sourceFiles: scan.files.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/i.test(f.p)).length,
    live: true
  };
}

export async function scanProjectFolder(path: string): Promise<ProjectScan> {
  const base = getTherasApiUrl();
  if (!base) throw new Error("Project import needs the local Theras server (open the editor on localhost).");
  let res: Response;
  try {
    res = await fetch(`${base}/api/project/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path })
    });
  } catch {
    throw new Error("The local Theras server does not answer (port 4310).");
  }
  const body = (await res.json().catch(() => ({}))) as ProjectScan & { error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `Scan failed (${res.status})`);
  return body;
}

/** Scans a folder, registers its models and remembers it. Returns the project record. */
export async function importProject(path: string): Promise<ImportedProject> {
  projectStore.busy = path;
  projectStore.error = null;
  try {
    const project = analyzeScan(await scanProjectFolder(path));
    registerRuntimeEntries(projectEntries(project));
    const rest = projectStore.projects.filter((p) => p.root !== project.root);
    projectStore.projects = [project, ...rest].slice(0, 12);
    return project;
  } catch (error) {
    projectStore.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    projectStore.busy = null;
  }
}

/** One paragraph for the chat: what the import found. */
export function describeImport(project: ImportedProject): string {
  const adapter = adapterOf(project);
  const parts = [
    `Imported ${project.name} (${project.root}): ${project.sourceFiles} source files, ${project.models.length} 3D models, ${project.textures} textures, ${project.references.length} reference images.`
  ];
  if (adapter) parts.push(`Environment: ${adapter.label}, built by the Theras library from the project's own files.`);
  else if (project.levelModel) parts.push(`Environment: the level model ${project.models.find((m) => m.id === project.levelModel)?.path}.`);
  if (project.models.length) parts.push(`Models are in the library under "Project: ${project.name}".`);
  return parts.join(" ");
}

export function findProject(nameOrPath: string): ImportedProject | undefined {
  const key = nameOrPath.trim().toLowerCase();
  return projectStore.projects.find(
    (p) => p.root.toLowerCase() === key || p.name.toLowerCase() === key || p.root.toLowerCase().endsWith(`/${key}`) || slug(p.name) === slug(key)
  );
}

export function adapterOf(project: ImportedProject): ProjectAdapter | undefined {
  return PROJECT_ADAPTERS.find((a) => project.adapters.includes(a.id));
}

/** Absolute folder paths in a chat message ("/Users/...", "~/..."), with quotes and @ removed. */
export function findProjectPaths(text: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[\s"'`(@])((?:~|\/)(?:Users|Volumes|home|tmp|private|opt|srv|mnt|var)?\/[^\s"'`)]+)/g;
  for (const m of text.matchAll(re)) {
    const path = m[1]!.replace(/[.,;:!?]+$/, "").replace(/\/+$/, "");
    if (path.split("/").filter(Boolean).length >= 2 && !out.includes(path)) out.push(path);
  }
  return out;
}

/** True when the message only asks to import or open the project (no other build request). */
export function isPlainImportRequest(text: string, paths: string[]): boolean {
  let rest = text;
  for (const p of paths) rest = rest.split(p).join(" ");
  rest = rest.replace(/[@"'`]/g, " ").toLowerCase();
  const words = rest.split(/[^a-z]+/).filter(Boolean);
  const allowed = new Set([
    "import", "load", "open", "scan", "use", "bring", "add", "the", "this", "my", "a", "project", "repo", "repository", "folder",
    "from", "in", "into", "and", "its", "it", "environment", "level", "world", "scene", "map", "please", "to", "theras", "as",
    "template", "here", "of", "game", "assets", "make", "show", "with", "at", "on", "editor"
  ]);
  return words.every((w) => allowed.has(w));
}

/** At start: scan remembered projects again (one local request each), so their files load. */
export async function rescanSavedProjects() {
  for (const saved of [...projectStore.projects]) {
    try {
      const fresh = analyzeScan(await scanProjectFolder(saved.root));
      registerRuntimeEntries(projectEntries(fresh));
      const i = projectStore.projects.findIndex((p) => p.root === saved.root);
      if (i >= 0) projectStore.projects[i] = { ...fresh, importedAt: saved.importedAt };
    } catch {
      // the folder or the server is gone: keep the record, its card shows it is offline
    }
  }
}

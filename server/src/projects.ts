// Project import: the editor asks the local server to look into a project folder on this
// computer (a game repository, an asset folder) and to serve its asset files.
//
// Safety rules:
// - The routes work only when the server listens on a loopback address (127.0.0.1, ::1,
//   localhost). A public server never reads its own disk for a browser.
// - Read only. The scan lists file names and sizes; it opens only package.json and README-type
//   text files (first 4 KB).
// - The file route serves only files inside a folder that was scanned in this server run,
//   only with an asset extension, never from a hidden folder, and never through a symbolic
//   link that leads out of the folder.
// - No database, no background work: one scan is one walk of the folder, with limits.

import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";

const MAX_FILES = 20_000;
const MAX_DEPTH = 12;
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const TEXT_PEEK_BYTES = 4096;

/** Folders that never hold source assets: dependencies, build output, caches, version control. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-portal",
  "build",
  "out",
  "target",
  "coverage",
  "artifacts",
  "store-screenshots",
  "vendor-cache",
  "__pycache__",
  "Pods",
  "DerivedData"
]);

/** Extensions the file route may serve (3D models, textures, images, model buffers). */
const SERVE_TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".obj": "text/plain",
  ".mtl": "text/plain",
  ".fbx": "application/octet-stream",
  ".vrm": "model/gltf-binary",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ktx2": "image/ktx2",
  ".hdr": "image/vnd.radiance",
  ".exr": "image/x-exr"
};

/** JSON is served only from asset folders (manifests), never from the project root or src. */
const JSON_FOLDER = /(^|\/)(public|assets|textures|models|data)\//;

export type ProjectFile = { p: string; b: number };

export type ProjectScan = {
  id: string;
  name: string;
  root: string;
  /** The first lines of README.md or PRODUCT.md. */
  about: string;
  /** Selected dependencies from package.json (three, @react-three/*, game engines). */
  deps: Record<string, string>;
  files: ProjectFile[];
  truncated: boolean;
};

const roots = new Map<string, string>();

export function projectRoutesEnabled(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || process.env.PROJECT_IMPORT === "on";
}

function projectId(root: string) {
  return createHash("sha256").update(root).digest("hex").slice(0, 12);
}

async function peekText(path: string): Promise<string> {
  try {
    const text = await readFile(path, "utf8");
    return text.slice(0, TEXT_PEEK_BYTES);
  } catch {
    return "";
  }
}

/** Walks a project folder. Throws a short message for the client when the path is not usable. */
export async function scanProject(input: string): Promise<ProjectScan> {
  const raw = input.trim().replace(/^~(?=\/)/, process.env.HOME ?? "~");
  if (!raw.startsWith("/")) throw new Error("Give the full path of the project folder (it starts with /).");
  let root: string;
  try {
    root = await realpath(resolve(raw));
  } catch {
    throw new Error(`No folder at ${raw}.`);
  }
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error(`${root} is a file, not a folder.`);
  if (root === "/" || root === process.env.HOME || root.split(sep).filter(Boolean).length < 2) {
    throw new Error("That folder is too wide. Give one project folder.");
  }

  const files: ProjectFile[] = [];
  let truncated = false;
  const walk = async (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full, depth + 1);
      } else if (entry.isFile()) {
        let size = 0;
        try {
          size = (await stat(full)).size;
        } catch {
          continue;
        }
        files.push({ p: relative(root, full).split(sep).join("/"), b: size });
      }
    }
  };
  await walk(root, 0);

  const name = basename(root);
  let about = "";
  const deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    // The folder name is what the user knows; the package name can be an old name.
    if (typeof pkg.name === "string" && pkg.name && pkg.name !== name) about = `Package: ${pkg.name}. `;
    const all = { ...pkg.devDependencies, ...pkg.dependencies };
    for (const [dep, version] of Object.entries(all)) {
      if (/^(three|@react-three\/|babylonjs|@babylonjs\/|playcanvas|phaser|pixi|@dimforge\/|ecctrl|koota)/.test(dep)) deps[dep] = String(version);
    }
  } catch {
    // no package.json: an asset folder
  }
  for (const doc of ["README.md", "PRODUCT.md", "readme.md"]) {
    const text = (await peekText(join(root, doc))).trim();
    if (text) {
      about += text;
      break;
    }
  }

  const id = projectId(root);
  roots.set(id, root);
  return { id, name, root, about: about.slice(0, 1200), deps, files, truncated };
}

/** Reads one asset file of a scanned project. Returns null when the file may not be served. */
export async function readProjectFile(id: string, path: string): Promise<{ body: Uint8Array; type: string } | null> {
  const root = roots.get(id);
  if (!root) return null;
  const rel = decodeURIComponent(path).replace(/^\/+/, "");
  if (!rel || rel.split("/").some((part) => part === ".." || part.startsWith("."))) return null;
  const ext = extname(rel).toLowerCase();
  let type = SERVE_TYPES[ext];
  if (!type && ext === ".json" && JSON_FOLDER.test(rel)) type = "application/json";
  if (!type) return null;
  let full: string;
  try {
    full = await realpath(join(root, rel));
  } catch {
    return null;
  }
  if (full !== root && !full.startsWith(root + sep)) return null;
  const info = await stat(full);
  if (!info.isFile() || info.size > MAX_FILE_BYTES) return null;
  return { body: new Uint8Array(await readFile(full)), type };
}

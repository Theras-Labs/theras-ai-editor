import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchForWorkspaceRoot, defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { createCodexBridgePlugin } from "./server/codex-bridge-plugin";
import { createEditorGameSyncPlugin } from "./server/editor-game-sync-plugin";
import { createObjectGenerationApiPlugin } from "./server/object-generation-api";
import { createTextureGenerationApiPlugin } from "./server/texture-generation-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const workspaceAliases = {
  "@theras/dev-sync": path.resolve(repoRoot, "packages/dev-sync/src/index.ts"),
  "@theras/editor-core": path.resolve(repoRoot, "packages/editor-core/src/index.ts"),
  "@theras/geometry-kernel": path.resolve(repoRoot, "packages/geometry-kernel/src/index.ts"),
  "@theras/render-pipeline": path.resolve(repoRoot, "packages/render-pipeline/src/index.ts"),
  "@theras/runtime-build": path.resolve(repoRoot, "packages/runtime-build/src/index.ts"),
  "@theras/shared": path.resolve(repoRoot, "packages/shared/src/index.ts"),
  "@theras/three-runtime": path.resolve(repoRoot, "packages/three-runtime/src/index.ts"),
  "@theras/tool-system": path.resolve(repoRoot, "packages/tool-system/src/index.ts"),
  "@theras/workers": path.resolve(repoRoot, "packages/workers/src/index.ts")
} as const;

/**
 * Stops a build at the first import of a project file that does not exist, before anything is
 * written. By default the bundler only warns, keeps the bare name ("@/lib/x") and writes a
 * bundle that shows a blank page. Several sessions build this folder; on 2026-11-11 a build that
 * ran while a file was still being written replaced the working editor on port 8080.
 */
function failOnMissingImport(): Plugin {
  return {
    name: "theras:fail-on-missing-import",
    apply: "build",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer.includes("/node_modules/")) return null;
      if (!(source.startsWith("@/") || source.startsWith("./") || source.startsWith("../"))) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) this.error(`Cannot find "${source}", imported by ${importer}. The build stops here, so the working build in dist stays.`);
      return resolved;
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const explicitBase = process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH;
  const githubRepository = process.env.GITHUB_REPOSITORY;
  const inferredGithubPagesBase =
    process.env.GITHUB_ACTIONS === "true" && githubRepository
      ? `/${githubRepository.split("/")[1]}/`
      : "/";

  if (env.FAL_KEY) {
    process.env.FAL_KEY = env.FAL_KEY;
  }

  return {
    base: explicitBase ?? inferredGithubPagesBase,
    plugins: [
      failOnMissingImport(),
      react(),
      tsconfigPaths(),
      tailwindcss(),
      createCodexBridgePlugin(),
      createEditorGameSyncPlugin(),
      createObjectGenerationApiPlugin(),
      createTextureGenerationApiPlugin()
    ],
    resolve: {
      alias: workspaceAliases
    },
    build: {
      rollupOptions: {
        // Second net behind failOnMissingImport (above), for imports that plugin does not
        // check (package names). This one fails after the files are written, so it only makes
        // the exit code tell the truth.
        onwarn(warning, warn) {
          if (warning.code === "UNRESOLVED_IMPORT") throw new Error(`Build stopped: ${warning.message}`);
          warn(warning);
        }
      }
    },
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd())]
      }
    }
  };
});

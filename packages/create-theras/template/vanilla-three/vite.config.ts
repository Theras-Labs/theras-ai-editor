import { defineConfig, searchForWorkspaceRoot, type PluginOption } from "vite";
import { createTherasGamePlugin } from "@theras/game-dev";

export default defineConfig({
  plugins: [createTherasGamePlugin({ initialSceneId: "main", projectName: "__PROJECT_NAME__" }) as PluginOption],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())]
    }
  }
});

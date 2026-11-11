import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createAnimationGameSyncPlugin } from './server/animation-game-sync-plugin'
import { createCodexBridgePlugin } from './server/codex-bridge-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    createAnimationGameSyncPlugin(),
    createCodexBridgePlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@theras/anim-compiler': path.resolve(__dirname, '../../packages/anim-compiler/src/index.ts'),
      '@theras/anim-core': path.resolve(__dirname, '../../packages/anim-core/src/index.ts'),
      '@theras/anim-editor-core': path.resolve(__dirname, '../../packages/anim-editor-core/src/index.ts'),
      '@theras/anim-exporter': path.resolve(__dirname, '../../packages/anim-exporter/src/index.ts'),
      '@theras/anim-runtime': path.resolve(__dirname, '../../packages/anim-runtime/src/index.ts'),
      '@theras/anim-schema': path.resolve(__dirname, '../../packages/anim-schema/src/index.ts'),
      '@theras/anim-three': path.resolve(__dirname, '../../packages/anim-three/src/index.ts'),
      '@theras/anim-utils': path.resolve(__dirname, '../../packages/anim-utils/src/index.ts'),
      '@theras/dev-sync': path.resolve(__dirname, '../../packages/dev-sync/src/index.ts'),
    },
  },
})

import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@webm': resolve(__dirname, 'src/webm'),
  '@render': resolve(__dirname, 'src/render')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { lib: { entry: resolve(__dirname, 'src/main/index.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      lib: {
        entry: {
          capture: resolve(__dirname, 'src/preload/capture.ts'),
          editor: resolve(__dirname, 'src/preload/editor.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
          hud: resolve(__dirname, 'src/preload/hud.ts'),
          ghost: resolve(__dirname, 'src/preload/ghost.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src',
    server: { port: 5199, strictPort: true },
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          capture: resolve(__dirname, 'src/capture/index.html'),
          editor: resolve(__dirname, 'src/editor/index.html'),
          overlay: resolve(__dirname, 'src/overlay/index.html'),
          cambubble: resolve(__dirname, 'src/cambubble/index.html'),
          hud: resolve(__dirname, 'src/hud/index.html'),
          ghost: resolve(__dirname, 'src/ghost/index.html'),
          regionframe: resolve(__dirname, 'src/regionframe/index.html')
        }
      }
    }
  }
})

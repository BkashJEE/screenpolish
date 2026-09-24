import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@webm': resolve(__dirname, 'src/webm'),
      '@render': resolve(__dirname, 'src/render')
    }
  },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], environment: 'node' }
})

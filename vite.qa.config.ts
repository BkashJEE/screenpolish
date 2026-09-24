import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Isolated visual QA. Only the DEV mock bridge is used; no recordings are opened.
export default defineConfig({
  root: 'src',
  server: {host: '127.0.0.1', port: 5301, strictPort: true},
  resolve: {alias: {'@shared': resolve(__dirname, 'src/shared'), '@render': resolve(__dirname, 'src/render')}},
  plugins: [
    {name: 'qa-assets', enforce: 'pre', transform(code, id) {
      if (/\.(css|tsx?)$/.test(id)) return code.replaceAll('polish://asset/', `/@fs/${resolve(__dirname, 'resources').replaceAll('\\', '/')}/`)
    }},
    react(), tailwindcss()
  ]
})

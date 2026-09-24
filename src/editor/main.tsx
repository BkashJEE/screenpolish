import { StrictMode } from 'react'
import { preloadBrandSprites } from '../brand'
import { loadImage } from './lib/media'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './omarchy-studio.css'
import { applyAppearance, readAppearance } from './lib/appearance'

applyAppearance(readAppearance())

const root = document.getElementById('root')
if (!root) throw new Error('editor: #root missing')

async function boot(): Promise<void> {
  // Canvas does not repaint text when a webfont finishes loading. Wait for
  // every face the renderer draws with before React can render preview or
  // start an export, so both paths measure and draw the same bundled glyphs.
  if (typeof document !== 'undefined' && document.fonts?.load) {
    await Promise.allSettled(['400 16px "Courier Prime"', '600 16px "Courier Prime"', '800 16px "Courier Prime"', '400 16px "Omarchy Brand"', '600 16px "Instrument Sans"'].map((spec) => document.fonts.load(spec)))
  }
  // Sprite pointers draw from images; load them before anything renders so
  // the first preview frame and every export frame have them. A pose that
  // fails to load falls back to the plain arrow rather than blocking start-up.
  await preloadBrandSprites(loadImage)
  // Visual QA outside Electron: ?mock=1 installs a fake bridge (dev builds only).
  if (import.meta.env.DEV && !window.polish && new URLSearchParams(location.search).has('mock')) {
    const { installMockBridge } = await import('./dev-mock')
    await installMockBridge()
  }
  createRoot(root!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void boot()

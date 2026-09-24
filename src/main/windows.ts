// Window management: editor (singleton), hidden capture host, region overlay.

import * as path from 'node:path'
import { BrowserWindow, app, ipcMain, type Display, type IpcMainEvent } from 'electron'
import { DEFAULT_CURSOR_SKIN, EDITOR, GHOST, OVERLAY, type OverlayRect } from '@shared/ipc'
import type { CaptureRegion } from '@shared/types'
import { regionFromOverlayRect } from './region-math'
import { whenReadyToShow } from './ready-to-show'

type Page = 'editor' | 'capture' | 'overlay' | 'cambubble' | 'hud' | 'ghost' | 'regionframe'

const devServerUrl = (): string | undefined => process.env.ELECTRON_RENDERER_URL

/** Window icon (Windows uses it in the taskbar and title bar). */
export function appIcon(): string {
  return path.join(app.getAppPath(), 'resources', 'icon.png')
}

export function preloadPath(name: 'editor' | 'capture' | 'overlay' | 'hud' | 'ghost'): string {
  return path.join(__dirname, '../preload', `${name}.js`)
}

export function loadPage(win: BrowserWindow, page: Page, hash?: string): Promise<void> {
  const dev = devServerUrl()
  // Dev-only automation hooks are URL-backed so the renderer cannot miss an
  // initial IPC message while React is still subscribing.
  const params = new URLSearchParams(page === 'editor' ? (process.env.POLISH_QUERY ?? '') : '')
  if (dev && page === 'editor' && process.env.POLISH_OPEN) params.set('open', process.env.POLISH_OPEN)
  const query = dev && page === 'editor' && params.size > 0 ? `?${params.toString()}` : ''
  const frag = hash ? `#${hash}` : ''
  if (dev) return win.loadURL(`${dev}/${page}/index.html${query}${frag}`)
  return win.loadFile(path.join(__dirname, '../renderer', page, 'index.html'), hash ? { hash } : undefined)
}

// --- Editor -----------------------------------------------------------------

let editorWindow: BrowserWindow | null = null

export function getEditorWindow(): BrowserWindow | null {
  return editorWindow && !editorWindow.isDestroyed() ? editorWindow : null
}

export function createEditorWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // The renderer switches to a single-pane Record / Library layout below
    // 760 px, so keep the native resize floor aligned with that compact UI.
    minWidth: 360,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1017',
    title: 'ScreenPolish',
    icon: appIcon(),
    webPreferences: {
      preload: preloadPath('editor'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })
  whenReadyToShow(win, () => win.show())
  win.on('closed', () => {
    if (editorWindow === win) editorWindow = null
  })
  loadPage(win, 'editor').catch((err) => console.error('[windows] editor failed to load', err))
  editorWindow = win
  return win
}

/** Create or focus the editor and tell it what to show: a folder, or '' for the library. */
export function openEditor(folder: string): BrowserWindow {
  let win = getEditorWindow()
  const send = (): void => {
    if (!win || win.isDestroyed()) return
    win.webContents.send(EDITOR.open, folder)
  }
  if (!win) {
    win = createEditorWindow()
    win.webContents.once('did-finish-load', send)
    return win
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
  return win
}

// --- Capture host -------------------------------------------------------------

export function createCaptureWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 480,
    height: 320,
    skipTaskbar: true,
    title: 'ScreenPolish capture host',
    webPreferences: {
      preload: preloadPath('capture'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  win.webContents.on('console-message', (event) => {
    const { level, message } = event
    const line = `[capture-host:${level}] ${message}`
    if (level === 'error' || level === 'warning') console.warn(line)
    else console.log(line)
  })
  return win
}

// --- Recording HUD (countdown, timer, pause, stop) ---------------------------------

let hud: BrowserWindow | null = null

export const HUD_W = 360
export const HUD_H = 150

/** Always-on-top control pill, excluded from capture. Sits top-centre of the recorded display. */
export function openHud(display: Display): BrowserWindow {
  if (hud && !hud.isDestroyed()) return hud
  const { x, y, width } = display.workArea
  const win = new BrowserWindow({
    x: Math.round(x + (width - HUD_W) / 2),
    y: Math.round(y + 12),
    width: HUD_W,
    height: HUD_H,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    title: 'ScreenPolish recording',
    webPreferences: { preload: preloadPath('hud'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  })
  win.setMenuBarVisibility(false)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.webContents.on('console-message', (event) => console.log(`[hud:${event.level}] ${event.message}`))
  win.webContents.on('preload-error', (_e, preloadPath, error) => console.error('[hud] preload error', preloadPath, error))
  try {
    win.setContentProtection(true)
  } catch {
    // no capture exclusion on this platform; the pill would be recorded
  }
  whenReadyToShow(win, () => win.showInactive())
  win.on('closed', () => {
    if (hud === win) hud = null
  })
  void loadPage(win, 'hud')
  hud = win
  return win
}

export function updateHud(state: unknown): void {
  if (hud && !hud.isDestroyed()) {
    const send = (): void => {
      if (hud && !hud.isDestroyed()) hud.webContents.send('polish:hud:state', state)
    }
    if (hud.webContents.isLoading()) hud.webContents.once('did-finish-load', send)
    else send()
  }
}

export function closeHud(): void {
  const win = hud
  hud = null
  if (win && !win.isDestroyed()) win.destroy()
}

// --- Ghost cursor ---------------------------------------------------------------------
// In 'overlay' cursor mode the OS cursor is swapped for a blank one, which hides
// it from the capture *and* from the user. These windows draw the replacement
// pointer that only the user sees.
//
// One click-through window per display, each covering that display's full
// bounds and never moving. The sprite inside is positioned with a CSS
// transform, so a pointer move costs one compositor frame instead of a
// SetWindowPos round trip from the main process, which is what made the old
// 40x40 follower window trail the real pointer.

let ghosts: BrowserWindow[] = []
let ghostTimer: NodeJS.Timeout | null = null

/** Slow safety net: forwarded mousemove stops while the pointer is over another always-on-top window. */
const GHOST_FALLBACK_MS = 40

export function openGhostCursor(skin: string = DEFAULT_CURSOR_SKIN): void {
  if (ghosts.length > 0) return
  const { screen } = require('electron') as typeof import('electron')

  for (const display of screen.getAllDisplays()) {
    const { x, y, width, height } = display.bounds
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      hasShadow: false,
      show: false,
      title: 'ScreenPolish cursor',
      webPreferences: {
        preload: preloadPath('ghost'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    win.setMenuBarVisibility(false)
    // Must be set before the window shows: this is what puts WS_EX_TRANSPARENT on
    // the layered window so clicks land on whatever is underneath. `forward` then
    // hands us the WM_MOUSEMOVE stream we drive the sprite with.
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    try {
      win.setContentProtection(true)
    } catch {
      // fall through: a visible ghost is still better than a blind user
    }
    void loadPage(win, 'ghost', `skin=${encodeURIComponent(skin)}&x=${x}&y=${y}`)
    whenReadyToShow(win, () => win.showInactive())
    ghosts.push(win)
  }
  if (ghosts.length === 0) return

  ghostTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint()
    for (const win of ghosts) {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue
      win.webContents.send(GHOST.point, p)
    }
  }, GHOST_FALLBACK_MS)
}

export function closeGhostCursor(): void {
  if (ghostTimer) {
    clearInterval(ghostTimer)
    ghostTimer = null
  }
  const open = ghosts
  ghosts = []
  for (const win of open) {
    if (win.isDestroyed()) continue
    win.setClosable(true)
    win.destroy()
  }
}

// --- Region frame ----------------------------------------------------------------------
// Outline of a user-drawn region while it records, click-through and capture-excluded.

let regionFrame: BrowserWindow | null = null

export function openRegionFrame(display: Display, region: CaptureRegion): void {
  closeRegionFrame()
  const s = display.scaleFactor > 0 ? display.scaleFactor : 1
  const pad = 3
  const win = new BrowserWindow({
    x: Math.round(region.x / s) - pad,
    y: Math.round(region.y / s) - pad,
    width: Math.round(region.width / s) + pad * 2,
    height: Math.round(region.height / s) + pad * 2,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    title: 'ScreenPolish region',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  })
  win.setMenuBarVisibility(false)
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  try {
    win.setContentProtection(true)
  } catch {
    // no capture exclusion here; the outline would be recorded
  }
  void loadPage(win, 'regionframe')
  whenReadyToShow(win, () => win.showInactive())
  win.on('closed', () => {
    if (regionFrame === win) regionFrame = null
  })
  regionFrame = win
}

export function closeRegionFrame(): void {
  const win = regionFrame
  regionFrame = null
  if (win && !win.isDestroyed()) win.destroy()
}

// --- Camera bubble ---------------------------------------------------------------

let camBubble: BrowserWindow | null = null

export const CAM_BUBBLE_SIZE = 220

/**
 * Floating live view of the webcam while recording. Draggable, always on top,
 * excluded from screen capture (setContentProtection) so the recording never
 * shows it; the composited bubble comes from webcam.mp4 at render time.
 */
export function openCamBubble(display: Display, deviceId: string): BrowserWindow {
  closeCamBubble()
  const size = CAM_BUBBLE_SIZE
  const { x, y, width, height } = display.workArea
  const win = new BrowserWindow({
    x: Math.round(x + width - size - 24),
    y: Math.round(y + height - size - 24),
    width: size,
    height: size,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    title: 'ScreenPolish camera',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  })
  win.setMenuBarVisibility(false)
  win.setAlwaysOnTop(true, 'screen-saver')
  // Windows 10 2004+ honours WDA_EXCLUDEFROMCAPTURE: the bubble is visible to the
  // user and invisible to getDisplayMedia.
  try {
    win.setContentProtection(true)
  } catch {
    // older platforms: the bubble would be captured; still better than blind recording
  }
  whenReadyToShow(win, () => win.showInactive())
  win.on('closed', () => {
    if (camBubble === win) camBubble = null
  })
  const query = `?device=${encodeURIComponent(deviceId)}`
  const dev = devServerUrl()
  if (dev) void win.loadURL(`${dev}/cambubble/index.html${query}`)
  else void win.loadFile(path.join(__dirname, '../renderer/cambubble/index.html'), { search: query })
  camBubble = win
  return win
}

export function closeCamBubble(): void {
  const win = camBubble
  camBubble = null
  if (win && !win.isDestroyed()) win.destroy()
}

export function getCamBubble(): BrowserWindow | null {
  return camBubble && !camBubble.isDestroyed() ? camBubble : null
}

// --- Region overlay -----------------------------------------------------------

/**
 * Show a transparent full-screen overlay on `display`; resolves with the
 * dragged rectangle as a physical-px CaptureRegion, or null on Escape/close.
 */
/**
 * Region picker across every display.
 *
 * One overlay per screen, each covering that screen's bounds, so the drag can
 * start on whichever monitor the target window is actually on. A single overlay
 * on one display was the old behaviour and it made a region on any other screen
 * unreachable.
 *
 * Resolves with the region in physical pixels plus the display it landed on, so
 * the caller records against the right screen rather than the one it guessed.
 */
let cancelPicker: (() => void) | null = null
export function cancelRegionPicker(): void { cancelPicker?.() }

export function pickRegion(): Promise<{ region: CaptureRegion; displayId: number } | null> {
  cancelRegionPicker()
  return new Promise((resolve) => {
    const { screen } = require('electron') as typeof import('electron')
    const displays = screen.getAllDisplays()
    const open: Array<{ win: BrowserWindow; display: Display }> = []
    let settled = false
    let timer: NodeJS.Timeout | undefined
    let visibilityTimer: NodeJS.Timeout | undefined

    const finish = (result: { region: CaptureRegion; displayId: number } | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(visibilityTimer)
      cancelPicker = null
      ipcMain.removeListener(OVERLAY.done, onDone)
      for (const { win } of open) if (!win.isDestroyed()) win.destroy()
      resolve(result)
    }
    cancelPicker = () => finish(null)
    timer = setTimeout(() => finish(null), 120000)
    visibilityTimer = setTimeout(() => {
      if (!open.some(({win}) => !win.isDestroyed() && win.isVisible())) finish(null)
    }, 15000)

    const onDone = (event: IpcMainEvent, rect: OverlayRect | null): void => {
      const hit = open.find(({ win }) => !win.isDestroyed() && event.sender === win.webContents)
      if (!hit) return
      // Any overlay can cancel for all of them; only a real drag resolves.
      if (!rect || rect.width <= 0 || rect.height <= 0) return finish(null)
      finish({ region: regionFromOverlayRect(hit.display, rect), displayId: hit.display.id })
    }
    ipcMain.on(OVERLAY.done, onDone)

    for (const display of displays) {
      const { x, y, width, height } = display.bounds
      const win = new BrowserWindow({
        x,
        y,
        width,
        height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false,
        show: false,
        enableLargerThanScreen: true,
        title: 'ScreenPolish region picker',
        webPreferences: {
          preload: preloadPath('overlay'),
          contextIsolation: true,
          sandbox: false,
          nodeIntegration: false
        }
      })
      win.setMenuBarVisibility(false)
      win.setAlwaysOnTop(true, 'screen-saver')
      win.on('closed', () => {
        // Closing every overlay is how a cancel looks; one closing on its own is not.
        if (open.every(({ win: w }) => w.isDestroyed())) finish(null)
      })
      whenReadyToShow(win, () => {
        win.setBounds({ x, y, width, height })
        win.showInactive()
      })
      open.push({ win, display })
      loadPage(win, 'overlay').catch((err) => {
        console.error('[windows] overlay failed to load', err)
        finish(null)
      })
    }

    if (open.length === 0) return finish(null)
    // Focus the screen the pointer is on so the first keypress (Esc) lands somewhere sane.
    const under = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const preferred = open.find(({ display }) => display.id === under.id) ?? open[0]
    whenReadyToShow(preferred.win, () => preferred.win.focus())
  })
}

/**
 * The desktop session the CLI needs, recovered when the agent host left it out.
 *
 * Agent hosts start MCP servers with a trimmed environment so API keys do not
 * leak into them, and some trim it to little more than PATH, HOME and XDG_*.
 * ScreenPolish is an Electron app: without WAYLAND_DISPLAY it cannot reach the
 * compositor, and the CLI hung for its whole timeout instead of answering. The
 * agent was then told a recording might still be running, which was never true.
 *
 * Everything needed is still findable from XDG_RUNTIME_DIR, which those hosts
 * keep. Values that are already set are never replaced.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface RuntimeDirReader {
  /** Entry names in a directory, or [] if it cannot be read. */
  list: (dir: string) => string[]
  /** Whether a path exists. */
  exists: (p: string) => boolean
  /** Modification time in ms, or 0 if it cannot be read. */
  mtime: (p: string) => number
}

const fsReader: RuntimeDirReader = {
  list: (dir) => {
    try {
      return fs.readdirSync(dir)
    } catch {
      return []
    }
  },
  exists: (p) => fs.existsSync(p),
  mtime: (p) => {
    try {
      return fs.statSync(p).mtimeMs
    } catch {
      return 0
    }
  }
}

/** The compositor's socket: the lowest-numbered `wayland-N`, which is the one a session starts first. */
function waylandDisplay(runtime: string, io: RuntimeDirReader): string | undefined {
  return io
    .list(runtime)
    .filter((name) => /^wayland-\d+$/.test(name))
    .sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)))[0]
}

/**
 * Hyprland's instance, for hyprctl. A crashed or logged-out session leaves its
 * directory behind, so only one with a live socket counts, newest first.
 */
function hyprlandInstance(runtime: string, io: RuntimeDirReader): string | undefined {
  const root = path.join(runtime, 'hypr')
  return io
    .list(root)
    .filter((name) => io.exists(path.join(root, name, '.socket.sock')))
    .sort((a, b) => io.mtime(path.join(root, b)) - io.mtime(path.join(root, a)))[0]
}

/**
 * The environment to run the CLI with: `env` as given, plus whichever of
 * WAYLAND_DISPLAY, HYPRLAND_INSTANCE_SIGNATURE and DBUS_SESSION_BUS_ADDRESS were
 * missing and can be found in XDG_RUNTIME_DIR.
 */
export function withDesktopSession(
  env: NodeJS.ProcessEnv,
  io: RuntimeDirReader = fsReader,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const runtime = env.XDG_RUNTIME_DIR
  if (platform !== 'linux' || !runtime) return env
  const out: NodeJS.ProcessEnv = { ...env }
  if (!out.WAYLAND_DISPLAY) {
    const display = waylandDisplay(runtime, io)
    if (display) out.WAYLAND_DISPLAY = display
  }
  if (!out.HYPRLAND_INSTANCE_SIGNATURE) {
    const instance = hyprlandInstance(runtime, io)
    if (instance) out.HYPRLAND_INSTANCE_SIGNATURE = instance
  }
  if (!out.DBUS_SESSION_BUS_ADDRESS) {
    const bus = path.join(runtime, 'bus')
    if (io.exists(bus)) out.DBUS_SESSION_BUS_ADDRESS = `unix:path=${bus}`
  }
  return out
}

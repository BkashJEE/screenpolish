/**
 * Hyprland IPC, used for one thing: the absolute pointer position.
 *
 * evdev gives relative motion, not a screen position, and reconstructing one
 * from deltas would have to model pointer acceleration — it would drift, and
 * the zoom would drift with it. The compositor already knows the answer, so we
 * ask it. Hyprland answers one request per connection and then closes, so a
 * poll is a socket round trip rather than a process spawn.
 */

import * as net from 'node:net'

/**
 * Candidate socket paths, newest layout first. Hyprland moved the socket under
 * XDG_RUNTIME_DIR in 0.40; older builds keep it in /tmp.
 */
export function hyprSocketPaths(env: NodeJS.ProcessEnv): string[] {
  const signature = env.HYPRLAND_INSTANCE_SIGNATURE
  if (!signature) return []
  const paths: string[] = []
  if (env.XDG_RUNTIME_DIR) paths.push(`${env.XDG_RUNTIME_DIR}/hypr/${signature}/.socket.sock`)
  paths.push(`/tmp/hypr/${signature}/.socket.sock`)
  return paths
}

/** `cursorpos` replies with "1920, 540". Returns null for anything else. */
export function parseCursorPos(reply: string): [number, number] | null {
  const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(reply)
  if (!m) return null
  const x = Number(m[1])
  const y = Number(m[2])
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? [x, y] : null
}

/** True when this process is running under a Hyprland session. */
export function isHyprland(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.HYPRLAND_INSTANCE_SIGNATURE)
}

/** One request/response round trip against the first socket path that answers. */
export async function hyprRequest(command: string, paths: readonly string[], timeoutMs = 200): Promise<string | null> {
  for (const socketPath of paths) {
    const reply = await new Promise<string | null>((resolve) => {
      let settled = false
      const done = (value: string | null): void => {
        if (settled) return
        settled = true
        socket.destroy()
        resolve(value)
      }
      const chunks: Buffer[] = []
      const socket = net.createConnection(socketPath)
      socket.setTimeout(timeoutMs, () => done(null))
      socket.on('connect', () => socket.write(command))
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.on('end', () => done(Buffer.concat(chunks).toString('utf8')))
      socket.on('error', () => done(null))
    })
    if (reply !== null) return reply
  }
  return null
}

/** Absolute pointer position in layout pixels, or null when Hyprland cannot be reached. */
export async function cursorPos(paths: readonly string[]): Promise<[number, number] | null> {
  const reply = await hyprRequest('cursorpos', paths)
  return reply === null ? null : parseCursorPos(reply)
}

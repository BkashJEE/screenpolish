import { spawn } from 'node:child_process'
import { clipboard } from 'electron'
import { uriList } from '@shared/file-uri'

/** Whether to hand the copy to wl-clipboard rather than Chromium's.
 *
 * Chromium can only take the Wayland selection from a surface the compositor
 * has focused, and on Hyprland a write from the main process was observed not
 * to reach the selection at all: the previous owner kept serving it. `wl-copy`
 * forks a tiny process that owns the selection outright, which does not depend
 * on focus, and a single call offers text/uri-list *and* text/plain, so a chat
 * window gets the file and a terminal gets something readable. */
export function useWlCopy(platform: string, env: NodeJS.ProcessEnv): boolean {
  return platform === 'linux' && Boolean(env.WAYLAND_DISPLAY)
}

export const WL_COPY_ARGS = ['--type', 'text/uri-list']

/** Put one file on the clipboard, for pasting into a chat or an upload box. */
export function copyFileToClipboard(
  target: string,
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env
): void {
  const payload = uriList([target])
  if (!useWlCopy(platform, env)) {
    clipboard.write({ text: target })
    clipboard.writeBuffer('text/uri-list', Buffer.from(payload, 'utf8'))
    return
  }
  // wl-copy forks and keeps serving the selection, so it is never awaited.
  const child = spawn('wl-copy', WL_COPY_ARGS, { stdio: ['pipe', 'ignore', 'ignore'], detached: true })
  child.on('error', () => {
    // No wl-clipboard installed: Chromium's clipboard is better than nothing.
    clipboard.write({ text: target })
    clipboard.writeBuffer('text/uri-list', Buffer.from(payload, 'utf8'))
  })
  child.stdin.end(payload)
  child.unref()
}

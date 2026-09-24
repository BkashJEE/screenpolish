// Library thumbnail: one frame from screen.mp4, written to exports/thumb.jpg
// right after a recording finishes. Best effort; the library shows a
// placeholder when it is missing.

import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const THUMB_RELATIVE = path.join('exports', 'thumb.jpg')

export function thumbnailArgs(screenMp4: string, output: string, atSec = 0.5, width = 640): string[] {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(atSec), '-i', screenMp4, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', output]
}

export function writeThumbnail(ffmpegPath: string, folder: string, timeoutMs = 8000): Promise<string | null> {
  const screen = path.join(folder, 'screen.mp4')
  const output = path.join(folder, THUMB_RELATIVE)
  if (!fs.existsSync(screen)) return Promise.resolve(null)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  return new Promise((resolve) => {
    execFile(ffmpegPath, thumbnailArgs(screen, output), { timeout: timeoutMs, windowsHide: true }, (err) => {
      if (err || !fs.existsSync(output)) {
        if (err) console.warn('[thumbnail] failed', err.message)
        resolve(null)
        return
      }
      resolve(output)
    })
  })
}

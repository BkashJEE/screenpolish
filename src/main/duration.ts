// Duration of a recorded MP4, probed with mediabunny in the main process and
// cached by path + mtime + size so the library list stays cheap.

import * as fs from 'node:fs'
import { FilePathSource, Input, MP4 } from 'mediabunny'

const cache = new Map<string, number | null>()

export async function durationOf(file: string): Promise<number | null> {
  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(file)
  } catch {
    return null
  }
  const key = `${file}|${stat.mtimeMs}|${stat.size}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  let result: number | null = null
  const input = new Input({ formats: [MP4], source: new FilePathSource(file) })
  try {
    result = (await input.getDurationFromMetadata()) ?? (await input.computeDuration())
    if (!Number.isFinite(result) || result <= 0) result = null
  } catch (err) {
    console.warn('[duration] probe failed for', file, err)
    result = null
  } finally {
    input.dispose()
  }
  cache.set(key, result)
  return result
}

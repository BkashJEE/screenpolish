// Pure project.json handling: tolerant merge with defaults so an older or
// hand-edited file never crashes the editor.

import { DEFAULT_PROJECT, type Project } from '@shared/types'
import { normalizeCrop } from '@shared/crop'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Merge a parsed project.json onto DEFAULT_PROJECT, one level deep per
 * section, so missing or new keys pick up defaults while user values win.
 * Garbage input yields a copy of the defaults.
 */
/** Projects saved by early window-tracking builds kept this switch under audio. */
function migrateClickSounds(parsed: Record<string, unknown>, out: Record<string, unknown>): void {
  const cursor = parsed.cursor
  if (isPlainObject(cursor) && cursor.clickSound !== undefined) return
  const audio = parsed.audio
  if (!isPlainObject(audio) || typeof audio.clickSounds !== 'boolean') return
  const merged = out.cursor as Record<string, unknown>
  merged.clickSound = { ...(merged.clickSound as object), enabled: audio.clickSounds }
}

export function mergeProject(parsed: unknown): Project {
  const out = structuredClone(DEFAULT_PROJECT) as unknown as Record<string, unknown>
  if (!isPlainObject(parsed)) return out as unknown as Project
  for (const key of Object.keys(DEFAULT_PROJECT) as Array<keyof Project>) {
    const def = DEFAULT_PROJECT[key]
    const given = parsed[key]
    if (given === undefined) continue
    if (Array.isArray(def)) {
      if (Array.isArray(given)) out[key] = given
    } else if (isPlainObject(def)) {
      if (isPlainObject(given)) out[key] = { ...(def as Record<string, unknown>), ...given }
    } else if (given !== null && typeof given === typeof def) {
      out[key] = given
    }
  }
  migrateClickSounds(parsed, out)
  const frame = out.frame as Record<string, unknown>
  frame.size = normalizeFrameSize(frame.size)
  out.crop = normalizeCrop(out.crop)
  out.version = 1
  return out as unknown as Project
}

function normalizeFrameSize(value: unknown): number {
  const size = typeof value === 'number' && Number.isFinite(value) ? value : 1
  return Math.min(1.5, Math.max(0.5, size))
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2) + '\n'
}

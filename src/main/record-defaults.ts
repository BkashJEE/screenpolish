// Last inputs chosen in the record panel, persisted so the hotkey, the tray
// and the CLI record with the same mic/camera the user picked in the app.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { RecordDefaults } from '@shared/ipc'

const FILE = 'record-defaults.json'

export const FALLBACK_DEFAULTS: RecordDefaults = { mic: '', webcam: 'default', system: true, fps: 30 }

function file(): string {
  return path.join(app.getPath('userData'), FILE)
}

export function sanitizeDefaults(raw: unknown): RecordDefaults {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof RecordDefaults, unknown>>
  return {
    mic: typeof r.mic === 'string' ? r.mic : FALLBACK_DEFAULTS.mic,
    webcam: typeof r.webcam === 'string' ? r.webcam : FALLBACK_DEFAULTS.webcam,
    system: typeof r.system === 'boolean' ? r.system : FALLBACK_DEFAULTS.system,
    fps: r.fps === 60 ? 60 : 30
  }
}

/** 'auto' (record panel: first camera / mic) becomes 'default', which the capture host treats as "no exact constraint". */
export function resolveDeviceChoice(choice: string): string | null {
  if (!choice) return null
  return choice === 'auto' ? 'default' : choice
}

export function loadRecordDefaults(): RecordDefaults {
  try {
    return sanitizeDefaults(JSON.parse(fs.readFileSync(file(), 'utf8')))
  } catch {
    return { ...FALLBACK_DEFAULTS }
  }
}

export function saveRecordDefaults(defaults: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(sanitizeDefaults(defaults), null, 2))
  } catch (err) {
    console.warn('[record-defaults] could not save', err)
  }
}

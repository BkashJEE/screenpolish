// Helpers for the record panel. Pure, tested.

import type { SourceInfo } from '../../shared/ipc'

/**
 * desktopCapturer screen ids look like "screen:<displayId>:0". Main may also
 * hand us the bare display id. Anything else falls back to 0 (primary), which
 * main should treat as "the primary display".
 */
export function displayIdOf(source: Pick<SourceInfo, 'id' | 'kind'>): number {
  const m = /^screen:(\d+)(?::\d+)?$/.exec(source.id)
  if (m) return Number(m[1])
  if (/^\d+$/.test(source.id)) return Number(source.id)
  return 0
}

export type RecordSource =
  | { kind: 'screen'; displayId: number }
  | { kind: 'window'; sourceId: string }
  | { kind: 'region'; displayId: number }

/** Human label for a chosen source in the Start button. */
export function describeSource(sel: RecordSource | null, sources: SourceInfo[]): string {
  if (!sel) return 'Choose a source'
  if (sel.kind === 'window') {
    const w = sources.find((s) => s.id === sel.sourceId)
    return w ? `Window: ${w.name}` : 'Window'
  }
  const screen = sources.find((s) => s.kind === 'screen' && displayIdOf(s) === sel.displayId)
  const name = screen?.name ?? `Display ${sel.displayId}`
  return sel.kind === 'region' ? `Region on ${name}` : name
}

/** Screen bounds formatted as "2560 x 1440" using the physical size when known. */
export function describeScreenSize(s: SourceInfo): string {
  if (!s.bounds) return ''
  const k = s.scaleFactor ?? 1
  return `${Math.round(s.bounds.width * k)} x ${Math.round(s.bounds.height * k)}`
}

/**
 * Captions: timed lines of text, transcribed locally and burned into the video.
 *
 * Cues are in source seconds, the same clock as trim, cuts and zoom, so a cue
 * inside a removed clip is skipped along with it and nothing needs retiming.
 * Transcription (main/captions.ts) runs whisper.cpp with the bundled English
 * model; nothing leaves the machine.
 */

/** Shown by the Captions panel, and the start of every packaged-build reason from main/captions.ts. */
export const CAPTIONS_NOT_INSTALLED = 'Offline captions are not installed on this build.'

/** Whether this build carries the speech engine and model; from main/captions.ts, shown by the Captions panel. */
export interface CaptionsStatus {
  /** Engine and model are both present, so Transcribe can run. */
  installed: boolean
  /** What is missing, fit to show; null when installed. */
  reason: string | null
}

export interface CaptionCue {
  id: string
  start: number
  end: number
  text: string
}

export type CaptionPosition = 'bottom' | 'top'

export interface CaptionSettings {
  enabled: boolean
  cues: CaptionCue[]
  /** Multiplier on the base text size. */
  size: number
  position: CaptionPosition
}

export const DEFAULT_CAPTIONS: CaptionSettings = { enabled: false, cues: [], size: 1, position: 'bottom' }
export const CAPTION_SIZE_RANGE = { min: 0.6, max: 1.8 } as const

/** Longest caption line whisper is asked for, in characters. */
export const CAPTION_LINE_CHARS = 42

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

export function normalizeCaptions(value: unknown): CaptionSettings {
  const raw = (value ?? {}) as Partial<CaptionSettings>
  const cues = Array.isArray(raw.cues)
    ? raw.cues
        .filter((c): c is CaptionCue => !!c && finite(c.start) && finite(c.end) && c.end > c.start && typeof c.text === 'string')
        .map((c, i) => ({ id: typeof c.id === 'string' && c.id ? c.id : `cue-${i}`, start: Math.max(0, c.start), end: c.end, text: c.text }))
        .sort((a, b) => a.start - b.start)
    : []
  const size = finite(raw.size) ? Math.min(CAPTION_SIZE_RANGE.max, Math.max(CAPTION_SIZE_RANGE.min, raw.size)) : DEFAULT_CAPTIONS.size
  return { enabled: raw.enabled === true, cues, size, position: raw.position === 'top' ? 'top' : 'bottom' }
}

/**
 * Whisper marks what is not speech as a bracketed tag: [BLANK_AUDIO], [Music],
 * (keyboard clicking). Those are not captions.
 */
export function isNonSpeech(text: string): boolean {
  const t = text.trim()
  return t === '' || /^[[(][^\])]*[\])]$/.test(t)
}

/** Cues from whisper-cli's `-oj` JSON. Unreadable input yields no cues. */
export function cuesFromWhisperJson(json: unknown): CaptionCue[] {
  const segments = (json as { transcription?: unknown })?.transcription
  if (!Array.isArray(segments)) return []
  const out: CaptionCue[] = []
  for (const seg of segments) {
    const from = seg?.offsets?.from
    const to = seg?.offsets?.to
    const text = typeof seg?.text === 'string' ? seg.text.trim() : ''
    if (!finite(from) || !finite(to) || to <= from || isNonSpeech(text)) continue
    out.push({ id: `cue-${from}`, start: from / 1000, end: to / 1000, text })
  }
  return out
}

/** The cue showing at source time `t`, if any. */
export function captionAt(t: number, cues: readonly CaptionCue[]): CaptionCue | null {
  for (const c of cues) {
    if (t >= c.start && t < c.end) return c
    if (c.start > t) break
  }
  return null
}

/**
 * Break `text` into at most `maxLines` lines no wider than `maxWidth`, at word
 * boundaries. What does not fit ends the last line with an ellipsis rather
 * than running off the frame.
 */
export function wrapCaption(text: string, maxWidth: number, measure: (s: string) => number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (measure(next) <= maxWidth || !line) {
      line = next
      continue
    }
    lines.push(line)
    line = words[i]
    if (lines.length === maxLines) {
      let last = lines[maxLines - 1]
      while (last.includes(' ') && measure(`${last}…`) > maxWidth) last = last.slice(0, last.lastIndexOf(' '))
      lines[maxLines - 1] = `${last}…`
      return lines
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Replace one cue's text; an emptied cue is removed. */
export function editCue(cues: readonly CaptionCue[], id: string, text: string): CaptionCue[] {
  return cues.flatMap((c) => (c.id !== id ? [c] : text.trim() ? [{ ...c, text }] : []))
}

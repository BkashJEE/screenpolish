import { useEffect, useState } from 'react'
import type { Project } from '../../shared/types'
import { CAPTION_SIZE_RANGE, DEFAULT_CAPTIONS, editCue, normalizeCaptions, type CaptionPosition, type CaptionSettings } from '../../shared/captions'
import { formatTime } from '../lib/time'
import { Spinner } from './icons'
import { Button, Chip, Row, Segmented, SliderField, Toggle } from './ui'

type Source = 'mic' | 'system'

/**
 * Transcribe the take on this machine, correct the text, and burn it in. The
 * cues are in source time, so removed clips take their captions with them.
 */
export function CaptionsPanel({
  project,
  onProject,
  folder,
  sources
}: {
  project: Project
  onProject: (update: (p: Project) => Project) => void
  folder: string
  sources: Source[]
}) {
  const captions = normalizeCaptions(project.captions ?? DEFAULT_CAPTIONS)
  const [source, setSource] = useState<Source>(sources[0] ?? 'mic')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = progress !== null

  useEffect(() => (busy ? window.polish.onTranscribeProgress((f) => setProgress(f)) : undefined), [busy])

  const patch = (update: Partial<CaptionSettings>) =>
    onProject((p) => ({ ...p, captions: { ...normalizeCaptions(p.captions), ...update } }))

  if (sources.length === 0) {
    return <p className="text-[11px] text-fg-dim">This recording has no audio track, so there is nothing to transcribe.</p>
  }

  const run = async () => {
    setError(null)
    setProgress(0)
    try {
      const cues = await window.polish.transcribe(folder, source)
      if (cues.length === 0) setError('No speech was found in that track.')
      else patch({ cues, enabled: true })
    } catch (e) {
      // Electron prefixes errors thrown in main; the user only needs the reason.
      setError((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] text-fg-muted">
        Transcribed on this computer, nothing is uploaded. Fix any word below and the video follows.
      </p>
      {sources.length > 1 && (
        <Segmented<Source>
          size="sm"
          value={source}
          onChange={setSource}
          options={[
            { value: 'mic', label: 'Microphone', title: 'Transcribe your voice.' },
            { value: 'system', label: 'System audio', title: 'Transcribe what the computer played.' }
          ]}
        />
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" variant={captions.cues.length ? 'default' : 'primary'} disabled={busy} icon={busy ? <Spinner size={12} /> : undefined} onClick={() => void run()}>
          {busy ? `Transcribing ${Math.round((progress ?? 0) * 100)}%` : captions.cues.length ? 'Transcribe again' : 'Transcribe'}
        </Button>
        {captions.cues.length > 0 && !busy && <span className="text-[11px] text-fg-dim">replaces your edits</span>}
      </div>
      {error && <p className="text-[11px] text-danger">{error}</p>}

      {captions.cues.length > 0 && (
        <>
          <Row label="Show in video">
            <Toggle checked={captions.enabled} onChange={(enabled) => patch({ enabled })} label="Show captions in video" />
          </Row>
          <Row label="Position">
            <Segmented<CaptionPosition>
              full={false}
              size="sm"
              value={captions.position}
              onChange={(position) => patch({ position })}
              options={[
                { value: 'bottom', label: 'Bottom' },
                { value: 'top', label: 'Top' }
              ]}
            />
          </Row>
          <SliderField
            label="Text size"
            value={captions.size}
            min={CAPTION_SIZE_RANGE.min}
            max={CAPTION_SIZE_RANGE.max}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(size) => patch({ size })}
          />
          <div className="flex items-center gap-2">
            <Chip tone="info">{captions.cues.length} lines</Chip>
          </div>
          <ol className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto pr-1" aria-label="Caption lines">
            {captions.cues.map((cue) => (
              <li key={cue.id} className="flex flex-col gap-1">
                <span className="font-mono text-[10.5px] tabular-nums text-fg-dim">
                  {formatTime(cue.start)} – {formatTime(cue.end)}
                </span>
                <textarea
                  aria-label={`Caption at ${formatTime(cue.start)}`}
                  className="min-h-[34px] resize-y rounded-[7px] border border-line-strong bg-bg-1 px-2 py-1.5 text-[12px] leading-[1.35] text-fg focus:border-accent"
                  style={{ userSelect: 'text' }}
                  rows={1}
                  defaultValue={cue.text}
                  onKeyDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const text = e.target.value
                    if (text !== cue.text) patch({ cues: editCue(captions.cues, cue.id, text) })
                  }}
                />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

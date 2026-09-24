import { useRef, useState } from 'react'
import type { Project } from '../../shared/types'
import { effectiveTrim } from '../../shared/layout'
import {
  DEFAULT_SILENCE,
  SILENCE_MIN_RANGE,
  SILENCE_THRESHOLD_RANGE,
  findSilences,
  removeSilences,
  restoreSilences,
  silenceSummary,
  type SilenceOptions
} from '../../shared/silence'
import { audioLevels } from '../lib/audio-levels'
import { Spinner } from './icons'
import { Button, Chip, Eyebrow, Segmented, SliderField } from './ui'

type Source = 'mic' | 'system'

/**
 * Find the quiet stretches of a take and remove them as clips. Running it
 * again with other settings replaces the previous result rather than adding
 * to it; the user's own cuts are never touched.
 */
export function SilencePanel({
  project,
  onProject,
  duration,
  urls
}: {
  project: Project
  onProject: (update: (p: Project) => Project) => void
  duration: number
  urls: { mic?: string; system?: string }
}) {
  const available: Source[] = [...(urls.mic ? (['mic'] as const) : []), ...(urls.system ? (['system'] as const) : [])]
  const [source, setSource] = useState<Source>(available[0] ?? 'mic')
  const [options, setOptions] = useState<SilenceOptions>(DEFAULT_SILENCE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFound, setLastFound] = useState<number | null>(null)
  // Decoding is the slow part; tweaking the sliders re-runs only the search.
  const cache = useRef(new Map<string, { levels: Float32Array; windowSec: number }>())
  const summary = silenceSummary(project.cuts)

  if (available.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <Eyebrow>Silence</Eyebrow>
        <p className="text-[11px] text-fg-dim">This recording has no audio track to listen to, so there is no silence to find.</p>
      </div>
    )
  }

  const run = async () => {
    const url = source === 'mic' ? urls.mic : urls.system
    if (!url || !(duration > 0)) return
    setBusy(true)
    setError(null)
    try {
      let analysed = cache.current.get(url)
      if (!analysed) {
        analysed = await audioLevels(url)
        cache.current.set(url, analysed)
      }
      const trim = effectiveTrim(project, duration)
      const silences = findSilences(analysed.levels, analysed.windowSec, trim, options)
      setLastFound(silences.length)
      onProject((p) => {
        const clean = restoreSilences(p.cuts, p.splits)
        return { ...p, ...removeSilences(silences, clean.cuts, clean.splits, effectiveTrim(p, duration)) }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Eyebrow>Silence</Eyebrow>
        {summary.count > 0 && (
          <Chip tone="info">
            {summary.count} removed · {summary.seconds.toFixed(1)}s
          </Chip>
        )}
      </div>
      <p className="text-[11px] text-fg-muted">
        Finds the pauses in the take and removes each as its own clip. Restore any one from the timeline, or put them all back.
      </p>
      {available.length > 1 && (
        <Segmented<Source>
          size="sm"
          value={source}
          onChange={setSource}
          options={[
            { value: 'mic', label: 'Microphone', title: 'Listen to your voice. Best for narrated takes.' },
            { value: 'system', label: 'System audio', title: 'Listen to what the computer played.' }
          ]}
        />
      )}
      <SliderField
        label="Quieter than"
        value={options.thresholdDb}
        min={SILENCE_THRESHOLD_RANGE.min}
        max={SILENCE_THRESHOLD_RANGE.max}
        step={1}
        format={(v) => `${v} dB`}
        onChange={(thresholdDb) => setOptions((o) => ({ ...o, thresholdDb }))}
      />
      <SliderField
        label="Longer than"
        value={options.minSec}
        min={SILENCE_MIN_RANGE.min}
        max={SILENCE_MIN_RANGE.max}
        step={0.1}
        format={(v) => `${v.toFixed(1)}s`}
        onChange={(minSec) => setOptions((o) => ({ ...o, minSec }))}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy || !(duration > 0)} icon={busy ? <Spinner size={12} /> : undefined} onClick={() => void run()}>
          {busy ? 'Listening' : summary.count > 0 ? 'Find again' : 'Remove silences'}
        </Button>
        {summary.count > 0 && (
          <Button size="sm" disabled={busy} onClick={() => { setLastFound(null); onProject((p) => ({ ...p, ...restoreSilences(p.cuts, p.splits) })) }}>
            Put them back
          </Button>
        )}
      </div>
      {lastFound === 0 && !busy && <p className="text-[11px] text-fg-dim">No pause matched. Raise the level or shorten the length.</p>}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  )
}

import { useState } from 'react'
import type { RecordingState } from '../../shared/ipc'
import { useElapsed } from '../hooks/useRecordingState'
import { formatElapsed } from '../lib/time'
import { Spinner, Stop } from './icons'
import { Button, Chip, Kbd } from './ui'

/** Slim strip above the app while main is picking, counting down, recording or finalizing. */
export function RecordingBanner({ state }: { state: RecordingState }) {
  const recording = state.status === 'recording' ? state : null
  const elapsed = useElapsed(recording ? recording.startedAt : null, recording?.paused ?? false)
  const [stopping, setStopping] = useState(false)

  if (state.status === 'idle') return null

  const stop = async () => {
    setStopping(true)
    try {
      await window.polish.stopRecording()
    } finally {
      setStopping(false)
    }
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-bg-1 px-3 text-[12.5px]">
      {state.status === 'picking' && (
        <>
          <Chip tone="accent">Region</Chip>
          <span className="text-fg">Drag a rectangle on the screen to pick the region</span>
          <span className="text-fg-dim">
            <Kbd>Esc</Kbd> cancels
          </span>
          <Button size="sm" onClick={stop} disabled={stopping}>Cancel selection</Button>
        </>
      )}
      {state.status === 'countdown' && (
        <>
          <Chip tone="rec">Counting in</Chip>
          <span className="text-fg">
            Recording starts in <span className="font-mono tabular-nums">{state.seconds}</span>
          </span>
        </>
      )}
      {recording && (
        <>
          <Chip tone={recording.paused ? 'idle' : 'rec'}>{recording.paused ? 'Paused' : 'Recording'}</Chip>
          <span className="font-mono tabular-nums text-fg-muted">{formatElapsed(elapsed)}</span>
          <span className="ml-auto flex items-center gap-1.5 text-fg-dim">
            <Kbd>Ctrl</Kbd>
            <Kbd>Shift</Kbd>
            <Kbd>P</Kbd>
            <span className="ml-0.5">{recording.paused ? 'resume' : 'pause'}</span>
          </span>
          <Button size="sm" variant="danger" icon={<Stop size={12} />} onClick={stop} disabled={stopping}>
            Stop
          </Button>
        </>
      )}
      {state.status === 'finalizing' && (
        <>
          <Chip tone="idle" dot={false}>
            <Spinner size={10} />
            Finalizing
          </Chip>
          <span className="text-fg">Writing the recording to disk</span>
        </>
      )}
    </div>
  )
}

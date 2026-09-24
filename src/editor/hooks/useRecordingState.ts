import { useEffect, useState } from 'react'
import type { RecordingState } from '../../shared/ipc'

const IDLE: RecordingState = { status: 'idle' }

/** Mirrors main's recording state: initial fetch plus push updates. */
export function useRecordingState(): RecordingState {
  const [state, setState] = useState<RecordingState>(IDLE)
  useEffect(() => {
    let alive = true
    window.polish
      .recordingState()
      .then((s) => {
        if (alive) setState(s)
      })
      .catch(() => undefined)
    const off = window.polish.onRecordingStateChanged((s) => {
      if (alive) setState(s)
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

/** Milliseconds since `since`, ticking twice a second. Frozen while paused. */
export function useElapsed(since: number | null, paused = false): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null || paused) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [since, paused])
  return since === null ? 0 : Math.max(0, now - since)
}

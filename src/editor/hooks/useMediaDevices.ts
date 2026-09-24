import { useCallback, useEffect, useState } from 'react'

export interface MediaDevices {
  /** Selectable microphones (those with a deviceId). */
  mics: MediaDeviceInfo[]
  /** Selectable cameras (those with a deviceId). */
  cams: MediaDeviceInfo[]
  /** Device labels are only exposed after a getUserMedia grant. */
  hasLabels: boolean
  /** Inputs exist but are hidden (no id or label) until permission is granted. */
  needsPermission: boolean
  requesting: boolean
  error: string | null
  requestPermission: () => Promise<void>
  refresh: () => Promise<void>
}

/** Microphone and camera lists from navigator.mediaDevices, with a one-time permission nudge. */
export function useMediaDevices(): MediaDevices {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [hasLabels, setHasLabels] = useState(false)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all.filter((d) => d.kind === 'audioinput' || d.kind === 'videoinput')
      // Before a getUserMedia grant Chromium lists inputs with empty ids and labels.
      const usable = inputs.filter((d) => d.deviceId.length > 0)
      setMics(usable.filter((d) => d.kind === 'audioinput'))
      setCams(usable.filter((d) => d.kind === 'videoinput'))
      const labels = usable.some((d) => d.label.length > 0)
      setHasLabels(labels)
      setNeedsPermission(inputs.length > 0 && (!labels || usable.length < inputs.length))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    setRequesting(true)
    setError(null)
    const attempts: MediaStreamConstraints[] = [{ audio: true, video: true }, { audio: true }, { video: true }]
    let granted = false
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        stream.getTracks().forEach((t) => t.stop())
        granted = true
        break
      } catch {
        // try the next, narrower request
      }
    }
    if (!granted) setError('Microphone and camera access was not granted')
    await refresh()
    setRequesting(false)
  }, [refresh])

  useEffect(() => {
    void refresh()
    const md = navigator.mediaDevices
    if (!md?.addEventListener) return
    const handler = () => void refresh()
    md.addEventListener('devicechange', handler)
    return () => md.removeEventListener('devicechange', handler)
  }, [refresh])

  return { mics, cams, hasLabels, needsPermission, requesting, error, requestPermission, refresh }
}

import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { LoadedProject } from '../../shared/ipc'
import { speedAt } from '../../shared/speed'
import { cutAt, normalizeCuts, skipCuts } from '../../shared/cuts'
import { CLICK_LOOKAHEAD_SEC, clickTimes, createClickPlaybackCursor, createPlaybackCursor, nextRateChange } from '../../shared/click-sound'
import { playClick, playZoomSound, stopScheduledSounds } from '../lib/click-player'
import { audibleZoomTransitions, zoomTransitions } from '../../shared/zoom-sound'
import type { Overlay, Project, RecordingEvents, ZoomSegment } from '../../shared/types'
import { outputSize } from '../../shared/layout'
import { layoutOverlays, type OverlayFrame } from '../../render/overlays'
import { overlayArgsFor, renderFrame } from '../../render/render-frame'
import { drawCutTransition, holdFrame } from '../../render/cut-transition'
import { cutTransitionActive, normalizeCutTransition } from '../../shared/cut-transition'
import { probeDuration } from '../lib/media'
import { handlePoint, hitTestOverlays, movedBy, resizedTo, rotatedTo, type OverlayPatch } from '../lib/overlays'
import { frameOffsetFromDelta } from '../lib/frame-drag'
import { Button } from './ui'
import { imageUrlForPath } from '../lib/project'
import { previewSize, PREVIEW_UI_INTERVAL_MS, previewPacer } from '../lib/preview-performance'

interface VideoFrameMeta {
  mediaTime: number
}
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: VideoFrameMeta) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

export interface PreviewProps {
  hideControls?: boolean
  urls: LoadedProject['urls']
  events: RecordingEvents
  project: Project
  segments: ZoomSegment[]
  pointerPath: Array<[number, number, number]>
  backgroundImage: CanvasImageSource | null
  overlayImages: Map<string, CanvasImageSource>
  selectedOverlayId: string | null
  duration: number
  time: number
  playing: boolean
  trim: { start: number; end: number }
  onTime: (t: number) => void
  onPlayingChange: (playing: boolean) => void
  onDuration: (seconds: number) => void
  onError: (message: string) => void
  onSelectOverlay: (id: string | null) => void
  onOverlayPatch: (id: string, patch: OverlayPatch) => void
  onFramePatch: (patch: { offsetX: number; offsetY: number }) => void
}

type OverlayDrag =
  | { mode: 'move'; id: string; start: { x: number; y: number }; origin: Pick<Overlay, 'x' | 'y'>; pinScale: number }
  | { mode: 'resize'; id: string; frame: OverlayFrame; pinScale: number }
  | { mode: 'rotate'; id: string; centre: { x: number; y: number }; start: { x: number; y: number }; startRotation: number }

type FrameDrag = { start: { x: number; y: number }; origin: { offsetX: number; offsetY: number }; pointerId: number; latest: { offsetX: number; offsetY: number } }

/** Selection chrome scale: 1 at 960 px wide so the outline looks the same at 720p and 4K. */
const chromeScale = (width: number) => Math.max(1, width / 960)
const HANDLE_PX = 10

/**
 * Hidden <video> elements (screen, webcam, mic, system) drive a visible canvas
 * rendered with renderFrame. While playing, a deadline-paced animation loop
 * renders from the media clock; otherwise the canvas is
 * redrawn after each seek and whenever a knob changes. Overlays are directly
 * manipulable on the canvas: click selects, drag moves, the corner handle
 * resizes (Shift rotates). The selection chrome is preview-only.
 */
export const Preview = memo(function Preview(props: PreviewProps) {
  const {
    urls,
    events,
    project,
    segments,
    pointerPath,
    backgroundImage,
    overlayImages,
    selectedOverlayId,
    duration,
    time,
    playing,
    trim,
    onTime,
    onPlayingChange,
    onDuration,
    onError,
    onSelectOverlay,
    onOverlayPatch,
    onFramePatch
  } = props

  const [moveScreen, setMoveScreen] = useState(false)
  const [previewQuality, setPreviewQuality] = useState<'sharp' | 'performance'>('sharp')
  const [framePreview, setFramePreview] = useState<Project | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const webcamRef = useRef<HTMLVideoElement>(null)
  const micRef = useRef<HTMLAudioElement>(null)
  const systemRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cursor, setCursor] = useState<string>('default')
  const drag = useRef<OverlayDrag | null>(null)
  const frameDrag = useRef<FrameDrag | null>(null)
  /** Overlay frames as of the last render, for hit testing. */
  const frames = useRef<OverlayFrame[]>([])

  const videoSize = useMemo(() => {
    const { width, height } = events.region
    return { width: Math.max(0, width), height: Math.max(0, height) }
  }, [events.region])

  const out = useMemo(() => outputSize(project, videoSize), [project.output.aspect, project.output.height, videoSize]) // eslint-disable-line react-hooks/exhaustive-deps
  const backing = previewSize(out, playing, previewQuality)
  const previewFps = previewQuality === 'performance' ? 30 : project.output.fps

  // Latest inputs for the render loop without re-subscribing every frame.
  const soundTimes = useMemo(() => clickTimes(events, trim, project.cuts), [events, trim, project.cuts])
  const zoomMoves = useMemo(() => audibleZoomTransitions(zoomTransitions(segments, project.zoom.easeSec ?? 0.6), trim, project.cuts), [segments, project.zoom.easeSec, trim, project.cuts])
  const latest = useRef({ events, project: framePreview ?? project, segments, pointerPath, backgroundImage, overlayImages, selectedOverlayId, duration, videoSize, trim, soundTimes, zoomMoves })
  latest.current = { events, project: framePreview ?? project, segments, pointerPath, backgroundImage, overlayImages, selectedOverlayId, duration, videoSize, trim, soundTimes, zoomMoves }
  const lastReported = useRef(time)
  const callbacks = useRef({ onTime, onPlayingChange, onDuration, onError, onSelectOverlay, onOverlayPatch })
  callbacks.current = { onTime, onPlayingChange, onDuration, onError, onSelectOverlay, onOverlayPatch }

  // The composed frame from just before a removed clip, dissolving out over the
  // frames after it. Wall-clock timed: at normal speed output seconds and real
  // seconds are the same, and a pause simply lets the transition finish.
  const heldFrame = useRef<{ canvas: CanvasImageSource; startedAt: number } | null>(null)

  const render = useCallback((tSec: number) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const l = latest.current
    const videoSize = l.videoSize.width > 0 && l.videoSize.height > 0 ? l.videoSize : { width: video.videoWidth, height: video.videoHeight }
    const webcamEl = webcamRef.current
    const webcam = l.project.webcam.enabled && webcamEl && webcamEl.readyState >= 2 ? webcamEl : null
    const input = {
      video,
      videoSize,
      tSec,
      events: l.events,
      project: l.project,
      segments: l.segments,
      pointerPath: l.pointerPath,
      webcam,
      backgroundImage: l.backgroundImage,
      overlayImages: l.overlayImages,
      duration: Number.isFinite(l.duration) && l.duration > 0 ? l.duration : undefined
    }
    renderFrame(ctx, input)

    const held = heldFrame.current
    if (held) {
      const transition = normalizeCutTransition(l.project.cutTransition)
      const progress = (performance.now() - held.startedAt) / (transition.durationSec * 1000)
      if (progress >= 1 || !cutTransitionActive(transition)) heldFrame.current = null
      else drawCutTransition(ctx, held.canvas, Math.max(0, progress), transition.style)
    }

    // Overlay geometry for hit testing, plus the selection chrome (never exported).
    const overlays = l.project.overlays
    const output = { width: canvas.width, height: canvas.height }
    frames.current = overlays.length > 0 && videoSize.width > 0 ? layoutOverlays(ctx, overlays, overlayArgsFor(input, output)) : []
    const selected = l.selectedOverlayId ? frames.current.find((f) => f.id === l.selectedOverlayId) : undefined
    if (selected) drawSelection(ctx, selected, output.width)
  }, [])

  // Canvas backing size follows the output size; a size change clears the canvas so redraw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvas.width !== backing.width || canvas.height !== backing.height) {
      canvas.width = backing.width
      canvas.height = backing.height
    }
    render(lastReported.current)
  }, [backing.width, backing.height, render])

  // Load the screen video and discover the duration.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    video.crossOrigin = 'anonymous'
    video.src = urls.screen
    video.load()

    const onMeta = async () => {
      try {
        const d = await probeDuration(urls.screen)
        if (!cancelled) callbacks.current.onDuration(d)
      } catch {
        if (cancelled) return
        if (Number.isFinite(video.duration) && video.duration > 0) {
          callbacks.current.onDuration(video.duration)
          return
        }
        // Fragmented MP4 without a duration: seek far ahead so Chromium scans the fragments.
        const onDur = () => {
          if (Number.isFinite(video.duration) && video.duration > 0) {
            video.removeEventListener('durationchange', onDur)
            if (!cancelled) callbacks.current.onDuration(video.duration)
            video.currentTime = lastReported.current
          }
        }
        video.addEventListener('durationchange', onDur)
        video.currentTime = 1e9
      }
    }
    const onSeeked = () => render(video.currentTime)
    const onLoadedData = () => render(video.currentTime)
    const onEnded = () => callbacks.current.onPlayingChange(false)
    const onErr = () => callbacks.current.onError('The screen recording could not be loaded for preview.')
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('loadeddata', onLoadedData)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onErr)
    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onErr)
      video.removeAttribute('src')
      video.load()
    }
  }, [urls.screen, render])

  // Companion media: webcam picture, mic and system audio follow the screen video.
  useEffect(() => {
    const pairs: Array<[HTMLMediaElement | null, string | undefined]> = [
      [webcamRef.current, urls.webcam],
      [micRef.current, urls.mic],
      [systemRef.current, urls.system]
    ]
    for (const [el, url] of pairs) {
      if (!el) continue
      if (url) {
        el.crossOrigin = 'anonymous'
        el.src = url
        el.load()
      } else {
        el.removeAttribute('src')
      }
    }
    const webcam = webcamRef.current
    const onWebcamSeeked = () => {
      if (!playingRef.current) render(lastReported.current)
    }
    webcam?.addEventListener('seeked', onWebcamSeeked)
    return () => webcam?.removeEventListener('seeked', onWebcamSeeked)
  }, [urls.webcam, urls.mic, urls.system, render])

  const companions = () => [webcamRef.current, micRef.current, systemRef.current].filter((el): el is HTMLMediaElement => !!el && !!el.getAttribute('src'))

  // Audio monitor follows the Audio knobs.
  useEffect(() => {
    const master = Math.max(0, Math.min(1, project.audio.masterVolume ?? 1))
    if (micRef.current) {
      micRef.current.muted = !project.audio.mic
      micRef.current.volume = Math.max(0, Math.min(1, (project.audio.micVolume ?? 1) * master))
    }
    if (systemRef.current) {
      systemRef.current.muted = !project.audio.system
      systemRef.current.volume = Math.max(0, Math.min(1, (project.audio.systemVolume ?? 1) * master))
    }
  }, [project.audio.masterVolume, project.audio.mic, project.audio.micVolume, project.audio.system, project.audio.systemVolume])

  // External seeks (scrub, keyboard, trim). Times we reported ourselves are skipped.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (Math.abs(time - lastReported.current) < 1e-6) return
    lastReported.current = time
    video.currentTime = time
    for (const el of companions()) el.currentTime = time
  }, [time])

  // Knob changes while paused: redraw the current frame.
  useEffect(() => {
    if (!playing) render(lastReported.current)
  }, [project, framePreview, segments, pointerPath, backgroundImage, overlayImages, selectedOverlayId, duration, playing, render])

  // Play / pause and the per-frame render loop.
  const playingRef = useRef(playing)
  playingRef.current = playing
  useEffect(() => {
    const video = videoRef.current as VideoWithRVFC | null
    if (!video) return
    if (!playing) {
      video.pause()
      for (const el of companions()) el.pause()
      // The UI is throttled during playback; pause on the actual decoded time,
      // not the last (up to 100 ms old) timeline update.
      lastReported.current = video.currentTime
      callbacks.current.onTime(video.currentTime)
      render(video.currentTime)
      return
    }
    let rafHandle = 0
    let alive = true
    let lastUiUpdate = -Infinity
    const drawDue = previewPacer(previewFps)
    // Which clicks still need a sound. Explicit seeks reset it; a jump over a
    // removed clip keeps a click exactly at the resume point.
    const clickClock = createClickPlaybackCursor(latest.current.soundTimes, video.currentTime)
    const zoomClock = createPlaybackCursor(latest.current.zoomMoves, video.currentTime, (m) => m.t)
    let cutSeek: number | null = null
    const onClickSeek = () => {
      const boundary = cutSeek !== null && Math.abs(video.currentTime - cutSeek) < 0.001
      clickClock.seek(video.currentTime, boundary)
      zoomClock.seek(video.currentTime, boundary)
      // Anything already queued belongs to where playback was, not where it lands.
      stopScheduledSounds()
      if (!boundary) heldFrame.current = null
      cutSeek = null
    }
    video.addEventListener('seeking', onClickSeek)

    const tick = (mediaTime: number) => {
      if (!alive) return
      if (video.seeking) { schedule(); return }
      const end = latest.current.trim.end
      // Removed clips are skipped live: jump every media element past the cut.
      const cuts = normalizeCuts(latest.current.project.cuts)
      if (cutAt(mediaTime, cuts)) {
        const resume = skipCuts(mediaTime, cuts)
        if (resume < end - 1e-3) {
          // The canvas still shows the frame before the removed clip; hold it
          // so the jump is covered rather than seen.
          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (ctx && cutTransitionActive(normalizeCutTransition(latest.current.project.cutTransition))) {
            const snapshot = holdFrame(ctx)
            if (snapshot) heldFrame.current = { canvas: snapshot, startedAt: performance.now() }
          }
          cutSeek = resume
          clickClock.seek(resume, true)
          zoomClock.seek(resume, true)
          video.currentTime = resume
          for (const el of companions()) el.currentTime = resume
          lastReported.current = resume
          callbacks.current.onTime(resume)
          render(resume)
          schedule()
          return
        }
        mediaTime = end
      }
      if (mediaTime >= end - 1e-3) {
        video.pause()
        lastReported.current = end
        callbacks.current.onTime(end)
        callbacks.current.onPlayingChange(false)
        render(end)
        return
      }
      const rate = speedAt(mediaTime, latest.current.project.speedRegions)
      // Schedule a little ahead so each tick lands on its click, not a frame
      // late. Stop at the next removed clip: playback jumps it, so a click
      // past it is handled after the jump rather than delayed by the cut.
      // Stop the look-ahead at the next removed clip and at the next speed
      // change: past either, the playhead does not arrive when this rate says.
      const nextCut = cuts.find((c) => c.start > mediaTime)?.start ?? Infinity
      const nextRate = nextRateChange(mediaTime, latest.current.project.speedRegions)
      const horizon = Math.max(mediaTime, Math.min(end, nextCut, nextRate, mediaTime + CLICK_LOOKAHEAD_SEC * rate))
      const dueClicks = clickClock.advance(horizon, cuts, latest.current.soundTimes)
      const clickSettings = latest.current.project.cursor.clickSound
      const zoomSettings = latest.current.project.zoom.sound
      const master = latest.current.project.audio.masterVolume ?? 1
      if (clickSettings?.enabled) {
        const volume = clickSettings.volume * master
        for (const t of dueClicks) playClick(clickSettings.style, volume, (t - mediaTime) / rate)
      }
      if (zoomSettings?.enabled) {
        const easeSec = latest.current.project.zoom.easeSec ?? 0.6
        for (const m of zoomClock.advance(horizon, cuts, latest.current.zoomMoves)) playZoomSound(m.move, easeSec, zoomSettings.volume * master, (m.t - mediaTime) / rate, zoomSettings.style)
      }
      if (video.playbackRate !== rate) video.playbackRate = rate
      const preservePitch = latest.current.project.preserveAudioPitch !== false
      if (video.preservesPitch !== preservePitch) video.preservesPitch = preservePitch
      for (const el of companions()) {
        if (el.playbackRate !== rate) el.playbackRate = rate
        if (el.preservesPitch !== preservePitch) el.preservesPitch = preservePitch
      }
      const now = performance.now()
      if (now - lastUiUpdate >= PREVIEW_UI_INTERVAL_MS) {
        lastReported.current = mediaTime
        callbacks.current.onTime(mediaTime)
        lastUiUpdate = now
      }
      if (drawDue(now)) {
        render(mediaTime)
      }
      schedule()
    }
    const schedule = () => {
      // Compose from the media clock even if the source holds a static frame.
      // This also keeps pointer/zoom animation independent of source FPS.
      rafHandle = requestAnimationFrame(() => tick(video.currentTime))
    }

    const others = companions()
    video.playbackRate = speedAt(video.currentTime, latest.current.project.speedRegions)
    video.preservesPitch = latest.current.project.preserveAudioPitch !== false
    video
      .play()
      .then(() => {
        for (const el of others) {
          el.currentTime = video.currentTime
          el.playbackRate = video.playbackRate
          el.preservesPitch = video.preservesPitch
          void el.play().catch(() => undefined)
        }
        schedule()
      })
      .catch((e: unknown) => {
        callbacks.current.onError(e instanceof Error ? e.message : 'Playback failed')
        callbacks.current.onPlayingChange(false)
      })

    return () => {
      alive = false
      video.removeEventListener('seeking', onClickSeek)
      stopScheduledSounds()
      if (rafHandle) cancelAnimationFrame(rafHandle)
    }
  }, [playing, render, previewFps])

  // --- Overlay direct manipulation -------------------------------------------

  /** Pointer position in canvas (output) pixels. */
  const canvasPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const r = canvas.getBoundingClientRect()
    if (!(r.width > 0) || !(r.height > 0)) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height }
  }

  /** Zoom factor a pinned overlay is drawn at right now (1 for screen-space overlays). */
  const pinScaleOf = (id: string): number => {
    const l = latest.current
    const o = l.project.overlays.find((x) => x.id === id)
    if (!o || !o.pinned) return 1
    const canvas = canvasRef.current
    if (!canvas) return 1
    const videoSize = l.videoSize
    if (!(videoSize.width > 0)) return 1
    const args = overlayArgsFor(
      { videoSize, project: l.project, tSec: lastReported.current, segments: l.segments, pointerPath: l.pointerPath, overlayImages: l.overlayImages },
      { width: canvas.width, height: canvas.height }
    )
    return args.toOutput ? args.toOutput(o.x, o.y).scale : 1
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const canvas = e.currentTarget
    const p = canvasPoint(e)
    if (moveScreen) {
      e.preventDefault()
      onPlayingChange(false)
      canvas.setPointerCapture(e.pointerId)
      const origin = { offsetX: project.frame.offsetX, offsetY: project.frame.offsetY }
      frameDrag.current = { start: p, origin, pointerId: e.pointerId, latest: origin }
      setFramePreview({ ...project, frame: { ...project.frame } })
      setCursor('grabbing')
      return
    }
    const k = chromeScale(canvas.width)
    const hit = hitTestOverlays(frames.current, p, { selectedId: latest.current.selectedOverlayId, handlePx: HANDLE_PX * k })
    if (!hit) {
      if (latest.current.selectedOverlayId) callbacks.current.onSelectOverlay(null)
      return
    }
    const overlay = latest.current.project.overlays.find((o) => o.id === hit.id)
    const frame = frames.current.find((f) => f.id === hit.id)
    if (!overlay || !frame) return
    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    if (hit.id !== latest.current.selectedOverlayId) callbacks.current.onSelectOverlay(hit.id)
    if (hit.kind === 'handle') {
      if (e.shiftKey) {
        drag.current = { mode: 'rotate', id: hit.id, centre: { x: frame.cx, y: frame.cy }, start: p, startRotation: overlay.rotation }
        setCursor('grabbing')
      } else {
        drag.current = { mode: 'resize', id: hit.id, frame, pinScale: pinScaleOf(hit.id) }
        setCursor('nwse-resize')
      }
      return
    }
    drag.current = { mode: 'move', id: hit.id, start: p, origin: { x: overlay.x, y: overlay.y }, pinScale: pinScaleOf(hit.id) }
    setCursor('move')
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const p = canvasPoint(e)
    const activeFrameDrag = frameDrag.current
    if (activeFrameDrag) {
      if (e.pointerId !== activeFrameDrag.pointerId) return
      const offset = frameOffsetFromDelta({ x: p.x - activeFrameDrag.start.x, y: p.y - activeFrameDrag.start.y }, activeFrameDrag.origin, { width: canvas.width, height: canvas.height })
      activeFrameDrag.latest = offset
      setFramePreview({ ...project, frame: { ...project.frame, ...offset } })
      return
    }
    const d = drag.current
    const output = { width: canvas.width, height: canvas.height }
    if (!d) {
      const k = chromeScale(canvas.width)
      const hit = frames.current.length ? hitTestOverlays(frames.current, p, { selectedId: latest.current.selectedOverlayId, handlePx: HANDLE_PX * k }) : null
      const next = hit ? (hit.kind === 'handle' ? (e.shiftKey ? 'grab' : 'nwse-resize') : 'move') : 'default'
      if (next !== cursor) setCursor(next)
      return
    }
    switch (d.mode) {
      case 'move': {
        const delta = { x: (p.x - d.start.x) / d.pinScale, y: (p.y - d.start.y) / d.pinScale }
        callbacks.current.onOverlayPatch(d.id, movedBy(d.origin, delta, output))
        break
      }
      case 'resize':
        callbacks.current.onOverlayPatch(d.id, { w: resizedTo(d.frame, p, output, d.pinScale) })
        break
      case 'rotate':
        callbacks.current.onOverlayPatch(d.id, { rotation: rotatedTo(d.centre, d.start, p, d.startRotation, e.shiftKey) })
        break
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const activeFrameDrag = frameDrag.current
    if (activeFrameDrag) {
      if (e.pointerId !== activeFrameDrag.pointerId) return
      const cancelled = e.type !== 'pointerup'
      frameDrag.current = null
      setFramePreview(null)
      if (!cancelled && (activeFrameDrag.latest.offsetX !== activeFrameDrag.origin.offsetX || activeFrameDrag.latest.offsetY !== activeFrameDrag.origin.offsetY)) {
        onFramePatch(activeFrameDrag.latest)
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      setCursor('default')
      return
    }
    if (!drag.current) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setCursor('default')
  }

  return (
    <div className="relative flex h-full w-full min-h-0 min-w-0 items-center justify-center">
      {!props.hideControls && <label className="absolute right-2 top-2 z-10 rounded bg-panel px-2 py-1 text-xs text-fg">
        Preview: <select aria-label="Preview quality" value={previewQuality} onChange={(e) => setPreviewQuality(e.target.value as 'sharp' | 'performance')} title="Preview only. Pause for full-resolution inspection; export always uses project settings.">
          <option value="sharp">Sharp · up to 1080p · {project.output.fps} fps</option>
          <option value="performance">Performance · 720p · 30 fps</option>
        </select>
      </label>}
      {!props.hideControls && <Button
        size="sm"
        variant={moveScreen ? 'primary' : 'ghost'}
        aria-pressed={moveScreen}
        className="absolute left-2 top-2 z-10"
        onClick={() => {
          if (frameDrag.current) return
          setMoveScreen((value) => {
            const next = !value
            if (next) callbacks.current.onSelectOverlay(null)
            return next
          })
        }}
      >
        Move screen
      </Button>}
      <canvas
        ref={canvasRef}
        width={backing.width}
        height={backing.height}
        className="rounded-[6px] shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
        style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', aspectRatio: `${out.width} / ${out.height}`, objectFit: 'contain', cursor, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onPointerLeave={() => !drag.current && setCursor('default')}
        aria-label="Preview"
      />
      <video ref={videoRef} crossOrigin="anonymous" muted playsInline preload="auto" className="hidden" />
      <video ref={webcamRef} crossOrigin="anonymous" muted playsInline preload="auto" className="hidden" />
      <audio ref={micRef} preload="auto" className="hidden" />
      <audio ref={systemRef} preload="auto" className="hidden" />
      {(project.audioRegions ?? []).map((region) => <ExtraAudio key={region.id} region={region} time={time} playing={playing} rate={speedAt(time, project.speedRegions)} master={project.audio.masterVolume ?? 1} preservePitch={project.preserveAudioPitch !== false} />)}
    </div>
  )
})

function ExtraAudio({ region, time, playing, rate, master, preservePitch }: { region: NonNullable<Project['audioRegions']>[number]; time: number; playing: boolean; rate: number; master: number; preservePitch: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    audio.volume = Math.max(0, Math.min(1, region.volume * master))
    audio.playbackRate = rate
    audio.preservesPitch = preservePitch
    const active = time >= region.start && time < region.end
    if (!playing || !active) audio.pause()
    if (active) {
      const desired = time - region.start + region.offset
      if (Math.abs(audio.currentTime - desired) > 0.12) audio.currentTime = desired
      if (playing && audio.paused) void audio.play().catch(() => undefined)
    }
  }, [region, time, playing, rate, master, preservePitch])
  return <audio ref={ref} src={imageUrlForPath(region.path)} preload="auto" className="hidden" />
}

/** Thin accent outline plus a square corner handle around the selected overlay. Preview only. */
function drawSelection(ctx: CanvasRenderingContext2D, f: OverlayFrame, outputWidth: number): void {
  const k = chromeScale(outputWidth)
  const w = f.width
  const h = f.height
  ctx.save()
  ctx.translate(f.cx, f.cy)
  if (f.rotation) ctx.rotate((f.rotation * Math.PI) / 180)
  ctx.globalAlpha = 1
  ctx.lineWidth = 3 * k
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  ctx.lineWidth = 1.5 * k
  ctx.strokeStyle = '#7c8cff'
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  const s = HANDLE_PX * k
  const hp = handlePoint({ cx: 0, cy: 0, width: w, height: h, rotation: 0 })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(hp.x - s / 2, hp.y - s / 2, s, s)
  ctx.strokeStyle = '#7c8cff'
  ctx.lineWidth = 1.5 * k
  ctx.strokeRect(hp.x - s / 2, hp.y - s / 2, s, s)
  ctx.restore()
}

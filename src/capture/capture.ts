// Hidden capture host. One mediabunny Output per stream writes fragmented MP4
// through a StreamTarget whose chunks are forwarded to main over IPC.

import {
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  type StreamTargetChunk
} from 'mediabunny'
import type { CaptureFileKey, CaptureStartMessage } from '@shared/ipc'
import { chooseCaptureEncoder } from './encoder-choice'
import { captureFrameRate } from './frame-timing'
import { CAPTURE_SIZE_CHANGE_BEHAVIOR, captureCropRect, captureSizeError, displayVideoConstraints } from './capture-size'
import { FINGERPRINT_HEIGHT, FINGERPRINT_WIDTH, fingerprintFromPixels } from '@shared/frame-fingerprint'

const bridge = window.polishCapture
const statusEl = document.getElementById('status')

type Source = MediaStreamVideoTrackSource | MediaStreamAudioTrackSource
// mediabunny narrows `kind`; lib.dom does not, so tracks are cast at the constructor.
type VideoTrack = ConstructorParameters<typeof MediaStreamVideoTrackSource>[0]
type AudioTrack = ConstructorParameters<typeof MediaStreamAudioTrackSource>[0]

interface Pipe {
  key: CaptureFileKey
  output: Output
  source: Source
  tracks: MediaStreamTrack[]
}

type Phase = 'idle' | 'starting' | 'recording' | 'stopping' | 'done'

let phase: Phase = 'idle'
const pipes: Pipe[] = []
/** Tracks not owned by a pipe (the raw display track when cropping). */
const extraTracks: MediaStreamTrack[] = []
let stopCropLoop: (() => void) | null = null

const describe = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err))

function setStatus(text: string): void {
  console.log(`[capture] ${text}`)
  if (statusEl) statusEl.textContent = text
}

function makeOutput(key: CaptureFileKey): Output {
  const writable = new WritableStream<StreamTargetChunk>({
    write: async (chunk) => {
      // Fresh, exactly-sized ArrayBuffer so structured clone ships only the bytes we mean.
      const copy = new ArrayBuffer(chunk.data.byteLength)
      new Uint8Array(copy).set(chunk.data)
      await bridge.sendChunk({ key, position: chunk.position, data: copy })
    }
  })
  return new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }),
    target: new StreamTarget(writable, { chunked: true, chunkSize: 1 << 20 })
  })
}

function watch(key: CaptureFileKey, source: Source): void {
  source.errorPromise.catch((err) => {
    console.error(`[capture] ${key} source error`, err)
    if (phase === 'recording' || phase === 'starting') void bridge.error(`${key}: ${describe(err)}`)
  })
}

async function addVideoPipe(
  key: CaptureFileKey,
  track: MediaStreamTrack,
  bitrate: number,
  fps: number,
  width: number,
  height: number
): Promise<void> {
  const choice = await chooseCaptureEncoder(({ codec, hardwareAcceleration }) =>
    canEncodeVideo(codec, { width, height, bitrate, hardwareAcceleration, latencyMode: 'realtime' })
  )
  if (!choice) throw new Error(`No supported video encoder for ${width}×${height} (tried avc, hevc, vp9)`)
  const { codec, hardwareAcceleration } = choice
  const output = makeOutput(key)
  const source = new MediaStreamVideoTrackSource(
    track as VideoTrack,
    {
      codec,
      bitrate,
      hardwareAcceleration,
      latencyMode: 'realtime',
      keyFrameInterval: 2,
      // PipeWire can renegotiate by a couple of pixels while a stream starts
      // (observed 2450x928 -> 2450x926). Keep the MP4 track fixed to its first
      // frame without distorting resized windows or aborting the recording.
      sizeChangeBehavior: CAPTURE_SIZE_CHANGE_BEHAVIOR
    },
    { frameRate: captureFrameRate(fps), timestampBase: 'zero' }
  )
  output.addVideoTrack(source, { frameRate: fps })
  watch(key, source)
  pipes.push({ key, output, source, tracks: [track] })
  setStatus(`${key}: ${codec} (${hardwareAcceleration}) ${width}×${height}@${fps} ${Math.round(bitrate / 1e6)} Mbps`)
}

async function addAudioPipe(key: CaptureFileKey, track: MediaStreamTrack): Promise<void> {
  const settings = track.getSettings()
  const numberOfChannels = settings.channelCount ?? 2
  const sampleRate = settings.sampleRate ?? 48000
  const codec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels, sampleRate })
  if (!codec) throw new Error('No supported audio encoder (tried aac, opus)')
  const output = makeOutput(key)
  const source = new MediaStreamAudioTrackSource(track as AudioTrack, { codec, bitrate: 128_000 })
  output.addAudioTrack(source)
  watch(key, source)
  pipes.push({ key, output, source, tracks: [track] })
  setStatus(`${key}: ${codec} ${numberOfChannels}ch ${sampleRate} Hz`)
}

async function getDisplayStream(message: CaptureStartMessage): Promise<MediaStream> {
  const video = displayVideoConstraints(message.fps)
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video, audio: message.system })
  } catch (err) {
    if (!message.system) throw err
    console.warn('[capture] system audio unavailable, retrying video only', err)
    return navigator.mediaDevices.getDisplayMedia({ video, audio: false })
  }
}

interface CropResult {
  track: MediaStreamTrack
  width: number
  height: number
}

/**
 * Real frame size of a video track. `getSettings()` can report a default
 * (e.g. 1920 high) before the first frame arrives, so wait for metadata.
 */
/** The frame on `video` reduced to a fingerprint, or undefined if it cannot be read. */
function frameFingerprint(video: HTMLVideoElement): number[] | undefined {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = FINGERPRINT_WIDTH
    canvas.height = FINGERPRINT_HEIGHT
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return undefined
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(video, 0, 0, FINGERPRINT_WIDTH, FINGERPRINT_HEIGHT)
    return fingerprintFromPixels(ctx.getImageData(0, 0, FINGERPRINT_WIDTH, FINGERPRINT_HEIGHT).data) ?? undefined
  } catch {
    return undefined
  }
}

/** Resolves once `video` has painted a frame, or after `ms`. */
function firstFrame(video: HTMLVideoElement, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    const done = () => {
      clearTimeout(timer)
      resolve(true)
    }
    video.requestVideoFrameCallback(done)
  })
}

async function probeTrackSize(track: MediaStreamTrack): Promise<{ width: number; height: number; fingerprint?: number[] }> {
  const settings = track.getSettings()
  const fallback = { width: settings.width ?? 0, height: settings.height ?? 0 }
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream([track])
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const timer = setTimeout(() => resolve(fallback), 3000)
      video.addEventListener(
        'loadedmetadata',
        () => {
          clearTimeout(timer)
          resolve(video.videoWidth > 0 ? { width: video.videoWidth, height: video.videoHeight } : fallback)
        },
        { once: true }
      )
      video.play().catch(() => resolve(fallback))
    })
    const fingerprint = (await firstFrame(video, 1000)) ? frameFingerprint(video) : undefined
    return { ...size, fingerprint }
  } finally {
    video.pause()
    video.srcObject = null
  }
}

/** Resolve only after the video element has presented a real PipeWire frame. */
async function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback
  if (typeof rvfc === 'function') {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Display stream did not present a frame within 5 s')), 5000)
      rvfc.call(video, () => {
        clearTimeout(timer)
        resolve()
      })
    })
    return
  }
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Display stream did not become drawable within 5 s')), 5000)
    video.addEventListener(
      'loadeddata',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

/** Draw the crop rectangle of the display stream into a software canvas and capture that. */
async function setupCrop(stream: MediaStream, crop: NonNullable<CaptureStartMessage['crop']>, fps: number): Promise<CropResult> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream(stream.getVideoTracks())
  document.body.append(video)

  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  document.body.append(canvas)
  // PipeWire commonly delivers DMA-BUF-backed frames on Wayland. An accelerated
  // desynchronised canvas can encode those as a uniform green surface; forcing
  // software backing makes drawImage perform a real pixel copy.
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable for cropping')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  let stopped = false
  const hasRvfc = typeof (video as HTMLVideoElement & { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function'
  const drawFrame = (): void => {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (vw > 0 && vh > 0) {
      const rect = captureCropRect(crop, { width: vw, height: vh })
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (rect.width > 0 && rect.height > 0) {
        ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height,
          rect.destinationX, rect.destinationY, rect.width, rect.height)
      }
    }
  }
  const draw = (): void => {
    if (stopped) return
    drawFrame()
    schedule()
  }
  const schedule = (): void => {
    if (stopped) return
    if (hasRvfc) (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(draw)
    else setTimeout(draw, 1000 / fps)
  }
  await video.play()
  await waitForVideoFrame(video)
  // Seed the canvas before captureStream/addVideoPipe starts. Starting from an
  // unpainted accelerated surface is what produced valid-size green MP4s.
  drawFrame()

  const captured = canvas.captureStream(fps)
  schedule()
  stopCropLoop = () => {
    stopped = true
    video.pause()
    video.srcObject = null
    video.remove()
    canvas.remove()
  }
  return { track: captured.getVideoTracks()[0], width: crop.width, height: crop.height }
}

/**
 * Open a device by exact id, falling back to the OS default when that id does
 * not resolve (unplugged, a virtual camera whose app is closed, or the CLI's
 * 'default' placeholder). The fallback is reported as a warning, not an error.
 */
async function openWithFallback(
  what: 'camera' | 'microphone',
  deviceId: string | null | undefined,
  constraints: (exact: string | null) => MediaStreamConstraints
): Promise<MediaStream> {
  const exact = deviceId && deviceId !== 'default' ? deviceId : null
  if (exact) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints(exact))
    } catch (err) {
      console.warn(`[capture] ${what} ${exact.slice(0, 8)} failed, trying the default`, err)
      void bridge.warning(`Selected ${what} could not be opened (${describe(err)}); using the default ${what}`)
    }
  }
  return navigator.mediaDevices.getUserMedia(constraints(null))
}

/** Microphone and webcam pipes; each is optional and warns rather than failing the take. */
async function addInputPipes(message: CaptureStartMessage): Promise<void> {
  if (message.mic) {
    try {
      const mic = await openWithFallback('microphone', message.mic.deviceId, (exact) => ({ audio: exact ? { deviceId: { exact } } : true }))
      await addAudioPipe('mic', mic.getAudioTracks()[0])
    } catch (err) {
      console.warn('[capture] microphone unavailable, continuing without', err)
      void bridge.warning(`Microphone unavailable: ${describe(err)}`)
    }
  }

  if (message.webcam) {
    try {
      const cam = await openWithFallback('camera', message.webcam.deviceId, (exact) => ({
        video: { ...(exact ? { deviceId: { exact } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } }
      }))
      const camTrack = cam.getVideoTracks()[0]
      const camSettings = camTrack.getSettings()
      await addVideoPipe('webcam', camTrack, 1_500_000, message.fps, camSettings.width ?? 1280, camSettings.height ?? 720)
    } catch (err) {
      console.warn('[capture] webcam unavailable, continuing without', err)
      void bridge.warning(`Webcam unavailable: ${describe(err)}`)
    }
  }
}

async function startInputsOnly(message: CaptureStartMessage): Promise<void> {
  setStatus('opening inputs')
  await addInputPipes(message)
  await Promise.all(pipes.map((p) => p.output.start()))
  phase = 'recording'
  setStatus(`recording ${pipes.map((p) => p.key).join('+') || 'nothing (screen recorded natively)'}`)
  await bridge.started({ startedAt: Date.now(), streamWidth: 0, streamHeight: 0 })
}

async function start(message: CaptureStartMessage): Promise<void> {
  if (phase !== 'idle') throw new Error(`start called while ${phase}`)
  phase = 'starting'
  // On Linux with gpu-screen-recorder the screen is recorded natively, without
  // the cursor, and this host only records the microphone and webcam.
  if (message.screen === false) return startInputsOnly(message)
  setStatus('requesting display')

  const display = await getDisplayStream(message)
  const displayVideo = display.getVideoTracks()[0]
  if (!displayVideo) throw new Error('Display stream has no video track')
  const { width: streamWidth, height: streamHeight, fingerprint } = await probeTrackSize(displayVideo)
  const streamError = captureSizeError(streamWidth, streamHeight)
  if (streamError) {
    for (const track of display.getTracks()) track.stop()
    throw new Error(streamError)
  }

  let videoTrack: MediaStreamTrack = displayVideo
  let width = streamWidth
  let height = streamHeight
  if (message.crop) {
    const cropError = captureSizeError(message.crop.width, message.crop.height)
    if (cropError) {
      for (const track of display.getTracks()) track.stop()
      throw new Error(cropError)
    }
    extraTracks.push(displayVideo)
    const cropped = await setupCrop(display, message.crop, message.fps)
    videoTrack = cropped.track
    width = cropped.width
    height = cropped.height
  }
  await addVideoPipe('screen', videoTrack, message.videoBitrate, message.fps, width, height)

  const systemTrack = display.getAudioTracks()[0]
  if (systemTrack) {
    if (message.system) {
      try {
        await addAudioPipe('system', systemTrack)
      } catch (err) {
        console.warn('[capture] system audio pipe failed, continuing without', err)
        systemTrack.stop()
      }
    } else {
      systemTrack.stop()
    }
  }

  await addInputPipes(message)

  await Promise.all(pipes.map((p) => p.output.start()))
  phase = 'recording'
  setStatus(`recording ${pipes.map((p) => p.key).join('+')}`)
  const cursor = (displayVideo.getSettings() as MediaTrackSettings & { cursor?: string }).cursor
  const cursorMode = cursor === 'always' || cursor === 'motion' || cursor === 'never' ? cursor : undefined
  await bridge.started({ startedAt: Date.now(), streamWidth, streamHeight, cursorMode, fingerprint })
}

async function stop(): Promise<void> {
  if (phase !== 'recording' && phase !== 'starting') return
  phase = 'stopping'
  setStatus('finalizing')
  await Promise.all(
    pipes.map(async (p) => {
      try {
        await p.output.finalize()
      } catch (err) {
        console.error(`[capture] finalize ${p.key} failed`, err)
        await bridge.error(`finalize ${p.key}: ${describe(err)}`)
      }
    })
  )
  stopCropLoop?.()
  stopCropLoop = null
  for (const t of [...extraTracks, ...pipes.flatMap((p) => p.tracks)]) t.stop()
  for (const p of pipes) await bridge.finalized(p.key)
  phase = 'done'
  setStatus('done')
}

function pauseAll(): void {
  if (phase !== 'recording') return
  for (const p of pipes) if (!p.source.paused) p.source.pause()
  setStatus('paused')
}

function resumeAll(): void {
  if (phase !== 'recording') return
  for (const p of pipes) if (p.source.paused) p.source.resume()
  setStatus('recording')
}

bridge.onStart((message) => {
  start(message).catch(async (err) => {
    console.error('[capture] start failed', err)
    phase = 'done'
    for (const t of [...extraTracks, ...pipes.flatMap((p) => p.tracks)]) t.stop()
    await bridge.error(describe(err))
  })
})
bridge.onStop(() => {
  stop().catch((err) => {
    console.error('[capture] stop failed', err)
    void bridge.error(`stop: ${describe(err)}`)
  })
})
bridge.onPause(pauseAll)
bridge.onResume(resumeAll)
setStatus('ready')

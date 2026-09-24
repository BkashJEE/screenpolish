// Plays click sounds live in the editor with Web Audio. Uses the exact samples
// export writes, so what you hear in preview is what the MP4 contains.

import { clickSound, type ClickSoundStyle } from '../../shared/click-sound'
import { zoomSound, type ZoomMove, type ZoomSoundStyle } from '../../shared/zoom-sound'

let context: AudioContext | null = null
// Sounds scheduled up to the look-ahead must not play after a pause or a seek.
const scheduled = new Set<AudioBufferSourceNode>()

function track(source: AudioBufferSourceNode): AudioBufferSourceNode {
  scheduled.add(source)
  source.onended = () => scheduled.delete(source)
  return source
}

/** Cancel sounds that were scheduled but have not played yet. */
export function stopScheduledSounds(): void {
  for (const source of [...scheduled]) {
    try {
      source.stop()
    } catch {
      // Already finished; onended removes it.
    }
    scheduled.delete(source)
  }
}
const buffers = new Map<ClickSoundStyle, AudioBuffer>()

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!context) context = new AudioContext()
  // Created during a user gesture (play, a toggle); resume in case the browser suspended it.
  if (context.state === 'suspended') void context.resume().catch(() => undefined)
  return context
}

function bufferFor(ctx: AudioContext, style: ClickSoundStyle): AudioBuffer {
  let buffer = buffers.get(style)
  if (!buffer || buffer.sampleRate !== ctx.sampleRate) {
    const samples = clickSound(style, ctx.sampleRate)
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
    buffer.copyToChannel(new Float32Array(samples), 0)
    buffers.set(style, buffer)
  }
  return buffer
}

/**
 * Play one click at `volume` (0..1), `delaySec` from now. Silently does
 * nothing where Web Audio is unavailable.
 */
export function playClick(style: ClickSoundStyle, volume: number, delaySec = 0): void {
  const ctx = audio()
  if (!ctx || !(volume > 0)) return
  const source = track(ctx.createBufferSource())
  source.buffer = bufferFor(ctx, style)
  const gain = ctx.createGain()
  gain.gain.value = Math.min(1, volume)
  source.connect(gain).connect(ctx.destination)
  source.start(ctx.currentTime + Math.max(0, delaySec))
}

const zoomBuffers = new Map<string, AudioBuffer>()

/** Play one zoom whoosh for `move` at `volume` (0..1), `delaySec` from now. */
export function playZoomSound(move: ZoomMove, easeSec: number, volume: number, delaySec = 0, style: ZoomSoundStyle = 'classic'): void {
  const ctx = audio()
  if (!ctx || !(volume > 0)) return
  const key = `${style}@${move}@${easeSec}@${ctx.sampleRate}`
  let buffer = zoomBuffers.get(key)
  if (!buffer) {
    const samples = zoomSound(move, easeSec, ctx.sampleRate, style)
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
    buffer.copyToChannel(new Float32Array(samples), 0)
    zoomBuffers.set(key, buffer)
  }
  const source = track(ctx.createBufferSource())
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.value = Math.min(1, volume)
  source.connect(gain).connect(ctx.destination)
  source.start(ctx.currentTime + Math.max(0, delaySec))
}

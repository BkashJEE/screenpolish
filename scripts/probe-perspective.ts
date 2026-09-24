import { drawPerspective } from '../src/render/perspective'
import { drawTilted } from '../src/render/tilt'
import { renderFrame } from '../src/render/render-frame'
import { DEFAULT_PROJECT, type RecordingEvents } from '../src/shared/types'

declare global { interface Window { probePerspective: () => unknown } }
window.probePerspective = () => {
  const source = new OffscreenCanvas(960, 540)
  const s = source.getContext('2d')!
  s.fillStyle = '#152234'; s.fillRect(0, 0, 960, 540)
  for (let y = 0; y < 540; y += 30) for (let x = 0; x < 960; x += 30) {
    s.fillStyle = (x / 30 + y / 30) % 2 ? '#294156' : '#1c3043'; s.fillRect(x, y, 30, 30)
  }
  s.fillStyle = '#ffffff'; s.font = 'bold 36px sans-serif'; s.fillText('ScreenPolish · Perspective check', 45, 85)
  s.fillStyle = '#f58042'; s.fillRect(45, 145, 330, 220)
  s.fillStyle = '#7bd5b1'; s.fillRect(585, 145, 330, 220)
  const rect = { x: 140, y: 90, width: 960, height: 540 }
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const images: Record<string, string> = {}
  const delta = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]); return sum / a.length
  }
  const samples: Record<string, number> = {}
  let available = false
  for (const mode of ['legacy', 'unified']) {
    const frames: Uint8ClampedArray[] = []
    for (const x of [7.9999, 8.0001]) {
      ctx.clearRect(0, 0, 1280, 720)
      if (mode === 'legacy') drawTilted(ctx, source, source, rect, x, 8)
      else available = drawPerspective(ctx, source, rect, x, 8)
      frames.push(ctx.getImageData(0, 0, 1280, 720).data)
    }
    samples[mode + 'AxisCrossingPixelDelta'] = delta(frames[0], frames[1])
    images[mode] = canvas.toDataURL()
    const times: number[] = []
    for (let i = 0; i < 90; i++) {
      const start = performance.now()
      ctx.clearRect(0, 0, 1280, 720)
      if (mode === 'legacy') drawTilted(ctx, source, source, rect, 12 * Math.sin(i / 45), 4)
      else drawPerspective(ctx, source, rect, 12 * Math.sin(i / 45), 4)
      ctx.getImageData(0, 0, 1, 1) // include completion, not merely command submission
      if (i >= 10) times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    samples[mode + 'P50ms'] = times[Math.floor(times.length * .5)]
    samples[mode + 'P95ms'] = times[Math.floor(times.length * .95)]
  }
  const events: RecordingEvents = { version: 1, startedAt: 0, region: { x: 0, y: 0, width: 960, height: 540, scale: 1 }, pointer: [], clicks: [], wheel: [], keys: [] }
  const project = structuredClone(DEFAULT_PROJECT)
  project.output = { aspect: '16:9', height: 720, fps: 60 }
  project.mockup.kind = 'browser'; project.zoom.perspective = 'unified'
  project.animation.style = 'none'
  renderFrame(ctx, { video: source, videoSize: source, tSec: 2, duration: 5, project, events, pointerPath: [], segments: [{ id: 'orbit', start: 0, end: 5, x: 480, y: 270, scale: 1.2, source: 'manual', style: 'orbit' }] })
  images.browser = canvas.toDataURL()
  images.source = (() => { const c = document.createElement('canvas'); c.width = 960; c.height = 540; c.getContext('2d')!.drawImage(source, 0, 0); return c.toDataURL() })()
  project.title = 'ScreenPolish motion demo'
  project.trim = { start: 0, end: 6 }
  project.zoom.auto = false
  project.zoom.manual = [{ id: 'demo-orbit', start: .5, end: 5.5, x: 480, y: 270, scale: 1.15, source: 'manual', style: 'orbit' }]
  return { ok: available && samples.unifiedAxisCrossingPixelDelta < .05, available, samples, images, project, events }
}

// Recording HUD: countdown, then a pill with the timer, Pause and Stop, plus
// what is being recorded and a low-disk warning. Only the user sees it; main
// excludes the window from screen capture.

import type { RecordingState } from '../shared/ipc'

const bridge = window.polishHud
const body = document.body
const countN = document.getElementById('countN') as HTMLDivElement
const dot = document.getElementById('dot') as HTMLSpanElement
const time = document.getElementById('time') as HTMLSpanElement
const pause = document.getElementById('pause') as HTMLButtonElement
const pauseText = document.getElementById('pauseText') as HTMLSpanElement
const pauseIcon = document.getElementById('pauseIcon') as unknown as SVGElement
const stop = document.getElementById('stop') as HTMLButtonElement
const cancel = document.getElementById('cancel') as HTMLButtonElement
const label = document.getElementById('label') as HTMLDivElement
const warn = document.getElementById('warn') as HTMLDivElement

let startedAt = 0
let paused = false
let pausedAt = 0
let pausedTotal = 0
let timer: number | null = null
let lastStatus: RecordingState['status'] | null = null
let lastCount = -1

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function tick(): void {
  const now = paused ? pausedAt : Date.now()
  time.textContent = fmt(now - startedAt - pausedTotal)
}

/** Short two-tone chime, synthesized so there is no asset to ship. */
function chime(kind: 'start' | 'tick'): void {
  try {
    const ctx = new AudioContext()
    const notes = kind === 'start' ? [[880, 0], [1320, 0.11]] : [[660, 0]]
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(kind === 'start' ? 0.18 : 0.08, ctx.currentTime + at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 0.2)
    }
    setTimeout(() => void ctx.close(), 600)
  } catch {
    // audio output unavailable; the visual HUD is enough
  }
}

function apply(state: RecordingState): void {
  if (state.status === 'countdown') {
    body.classList.add('counting')
    if (state.seconds !== lastCount) {
      lastCount = state.seconds
      countN.textContent = String(state.seconds)
      // Restart the pop animation.
      countN.style.animation = 'none'
      void countN.offsetWidth
      countN.style.animation = ''
      chime('tick')
    }
    lastStatus = 'countdown'
    return
  }
  body.classList.remove('counting')
  if (state.status === 'recording') {
    if (lastStatus !== 'recording') chime('start')
    lastStatus = 'recording'
    if (!startedAt) startedAt = state.startedAt
    if (state.paused && !paused) {
      paused = true
      pausedAt = Date.now()
    } else if (!state.paused && paused) {
      paused = false
      pausedTotal += Date.now() - pausedAt
    }
    dot.classList.toggle('paused', state.paused)
    pauseText.textContent = state.paused ? 'Resume' : 'Pause'
    pauseIcon.innerHTML = state.paused
      ? '<path d="M3 1.5 L10.5 6 L3 10.5 Z" />'
      : '<rect x="2" y="1.5" width="3" height="9" rx="0.8" /><rect x="7" y="1.5" width="3" height="9" rx="0.8" />'
    label.textContent = state.label ?? ''
    body.classList.toggle('lowdisk', Boolean(state.lowDisk))
    warn.textContent = state.lowDisk ? `Low disk space: ${state.lowDisk} free` : ''
    if (timer === null) timer = window.setInterval(tick, 250)
    tick()
  }
}

bridge.onState(apply)
stop.addEventListener('click', () => bridge.stop())
cancel.addEventListener('click', () => bridge.stop())
pause.addEventListener('click', () => bridge.togglePause())
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && body.classList.contains('counting')) bridge.stop()
})

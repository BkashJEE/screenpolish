// Region picker: drag a rectangle; mouseup or Enter confirms, Escape cancels.

import type { OverlayBridge, OverlayRect } from '@shared/ipc'

declare global {
  interface Window {
    polishOverlay: OverlayBridge
  }
}

const MIN_SIZE = 8

const dim = document.getElementById('dim') as HTMLDivElement
const sel = document.getElementById('sel') as HTMLDivElement
const label = document.getElementById('label') as HTMLDivElement

let anchor: { x: number; y: number } | null = null
let rect: OverlayRect | null = null
let finished = false

function normalize(a: { x: number; y: number }, b: { x: number; y: number }): OverlayRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  }
}

function render(): void {
  if (!rect) {
    sel.hidden = true
    label.hidden = true
    dim.hidden = false
    return
  }
  dim.hidden = true
  sel.hidden = false
  sel.style.left = `${rect.x}px`
  sel.style.top = `${rect.y}px`
  sel.style.width = `${rect.width}px`
  sel.style.height = `${rect.height}px`

  const dpr = window.devicePixelRatio || 1
  label.hidden = false
  label.textContent = `${Math.round(rect.width * dpr)} × ${Math.round(rect.height * dpr)}`
  const labelY = rect.y + rect.height + 8
  const flip = labelY + 28 > window.innerHeight
  label.style.left = `${Math.max(4, Math.min(rect.x, window.innerWidth - label.offsetWidth - 4))}px`
  label.style.top = `${flip ? Math.max(4, rect.y - 30) : labelY}px`
}

function finish(result: OverlayRect | null): void {
  if (finished) return
  finished = true
  window.polishOverlay.done(result)
}

function bigEnough(r: OverlayRect | null): r is OverlayRect {
  return r !== null && r.width >= MIN_SIZE && r.height >= MIN_SIZE
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  anchor = { x: e.clientX, y: e.clientY }
  rect = normalize(anchor, anchor)
  render()
})

window.addEventListener('mousemove', (e) => {
  if (!anchor) return
  rect = normalize(anchor, { x: e.clientX, y: e.clientY })
  render()
})

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !anchor) return
  rect = normalize(anchor, { x: e.clientX, y: e.clientY })
  anchor = null
  if (bigEnough(rect)) finish(rect)
  else {
    rect = null
    render()
  }
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    finish(null)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (bigEnough(rect)) finish(rect)
  }
})

window.addEventListener('contextmenu', (e) => e.preventDefault())
window.addEventListener('blur', () => {
  // Losing focus while nothing is drawn means the user clicked away; keep going otherwise.
  if (!rect) finish(null)
})

render()

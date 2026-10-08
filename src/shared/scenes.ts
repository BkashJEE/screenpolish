/**
 * Scenes: animated cards that play before the recording (an intro) or after it
 * (an outro) — a title, a line under it, and optionally a few steps that come
 * in one at a time.
 *
 * Everything here is pure. `sceneLayout` says where each piece of text is and
 * how far into its animation it is at a given moment, so the motion is tested
 * without a canvas and the preview and the export cannot disagree about it.
 * src/render/scene.ts only paints what this returns.
 */

export type SceneKind = 'intro' | 'outro'

/**
 * calm: soft fade-up, generous spacing, nothing overshoots.
 * bold: the title pops in past full size and settles, an accent bar wipes
 * under it, and the steps slide in behind numbered badges.
 */
export type SceneStyle = 'calm' | 'bold'

export interface Scene {
  id: string
  kind: SceneKind
  title: string
  subtitle?: string
  /** Shown one after another, in order. */
  steps?: string[]
  style: SceneStyle
  /** Seconds the card is on screen. */
  durationSec: number
  /** Bold style's bar and badges; a hex colour. */
  accent?: string
}

export const SCENE_MIN_SEC = 1.5
export const SCENE_MAX_SEC = 12
export const SCENE_DEFAULT_SEC = 3
export const SCENE_MAX_STEPS = 6
export const SCENE_DEFAULT_ACCENT = '#ff5a36'
/** Longest title, subtitle or step kept, so a pasted paragraph cannot fill the frame. */
export const SCENE_MAX_TEXT = 140

const HEX = /^#[0-9a-f]{6}$/i

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, SCENE_MAX_TEXT) : ''
}

/** A scene from whatever was saved, or null if nothing usable is left. */
export function normalizeScene(raw: unknown, index = 0): Scene | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<Scene>
  const title = text(r.title)
  const subtitle = text(r.subtitle)
  const steps = Array.isArray(r.steps) ? r.steps.map(text).filter((s) => s.length > 0).slice(0, SCENE_MAX_STEPS) : []
  if (!title && !subtitle && steps.length === 0) return null
  const duration = Number.isFinite(r.durationSec) ? (r.durationSec as number) : SCENE_DEFAULT_SEC
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `scene-${index + 1}`,
    kind: r.kind === 'outro' ? 'outro' : 'intro',
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(steps.length ? { steps } : {}),
    style: r.style === 'bold' ? 'bold' : 'calm',
    durationSec: Math.min(SCENE_MAX_SEC, Math.max(SCENE_MIN_SEC, duration)),
    ...(typeof r.accent === 'string' && HEX.test(r.accent) ? { accent: r.accent } : {})
  }
}

export function normalizeScenes(raw: unknown): Scene[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((s, i) => {
    const scene = normalizeScene(s, i)
    return scene ? [scene] : []
  })
}

export interface PlacedScene {
  scene: Scene
  /** Output seconds, measured on the finished video's own clock. */
  start: number
  end: number
}

export interface SceneTimeline {
  intros: PlacedScene[]
  outros: PlacedScene[]
  /** Seconds before the recording starts. */
  introSec: number
  /** Seconds after it ends. */
  outroSec: number
}

/**
 * Where each scene sits in the finished video, given how long the recording
 * part runs once trims, cuts and speed changes are applied. Intros play in the
 * order they are listed, then the recording, then the outros.
 */
export function sceneTimeline(scenes: readonly Scene[], recordingSec: number): SceneTimeline {
  const intros: PlacedScene[] = []
  let t = 0
  for (const scene of scenes) {
    if (scene.kind !== 'intro') continue
    intros.push({ scene, start: t, end: t + scene.durationSec })
    t += scene.durationSec
  }
  const introSec = t
  t = introSec + Math.max(0, recordingSec)
  const outros: PlacedScene[] = []
  for (const scene of scenes) {
    if (scene.kind !== 'outro') continue
    outros.push({ scene, start: t, end: t + scene.durationSec })
    t += scene.durationSec
  }
  return { intros, outros, introSec, outroSec: t - introSec - Math.max(0, recordingSec) }
}

/** The scene playing at output time `t`, and how far into it, or null during the recording. */
export function sceneAt(timeline: SceneTimeline, t: number): { scene: Scene; localSec: number } | null {
  for (const placed of [...timeline.intros, ...timeline.outros]) {
    if (t >= placed.start && t < placed.end) return { scene: placed.scene, localSec: t - placed.start }
  }
  return null
}

// ---------------------------------------------------------------------------
// Motion

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export const easeOutCubic = (p: number): number => 1 - Math.pow(1 - clamp01(p), 3)
/** Overshoots to about 1.1 and settles: the bold title's pop. */
export const easeOutBack = (p: number): number => {
  const x = clamp01(p)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export interface SceneMotion {
  /** Seconds one element takes to arrive. */
  enterSec: number
  /** Seconds between the subtitle and each step starting. */
  staggerSec: number
  /** Seconds the whole card takes to leave at the end. */
  exitSec: number
}

/**
 * Timings for a scene. Steps share whatever time the card has: a six-step
 * card in two seconds staggers them tightly rather than running out of time
 * before the last one arrives.
 */
export function sceneMotion(scene: Scene): SceneMotion {
  const enterSec = scene.style === 'bold' ? 0.45 : 0.6
  const exitSec = scene.style === 'bold' ? 0.3 : 0.45
  const items = 1 + (scene.subtitle ? 1 : 0) + (scene.steps?.length ?? 0)
  // Everything must have arrived with a third of the card still to go.
  const budget = Math.max(0, scene.durationSec * (2 / 3) - enterSec)
  const preferred = scene.style === 'bold' ? 0.22 : 0.3
  const staggerSec = items > 1 ? Math.min(preferred, budget / (items - 1)) : 0
  return { enterSec, staggerSec, exitSec }
}

// ---------------------------------------------------------------------------
// Layout

export type SceneRole = 'title' | 'subtitle' | 'step'

export interface SceneElement {
  role: SceneRole
  text: string
  /** 1-based, steps only. */
  index?: number
  /** Where the text is drawn, in output pixels: its left edge for steps, its centre otherwise. */
  x: number
  y: number
  align: 'left' | 'center'
  fontPx: number
  weight: number
  color: string
  /** 0..1, already including the exit. */
  alpha: number
  /** Multiplier around (x, y); 1 = natural size. */
  scale: number
  /** Pixels the element is still away from where it settles. */
  dx: number
  dy: number
}

export interface SceneLayout {
  /** How dark the veil over the background is, 0..1. */
  scrim: number
  elements: SceneElement[]
  /** Bold only: the bar under the title, full width when `progress` is 1. */
  accentBar?: { x: number; y: number; width: number; height: number; progress: number; color: string; alpha: number }
}

export type MeasureText = (text: string, fontPx: number, weight: number) => number

/**
 * A title on one line if it fits, otherwise on two lines split at the word
 * that balances them best. Shrinking alone made a long title unreadably small.
 */
export function wrapTitle(title: string, fontPx: number, weight: number, maxWidth: number, measure: MeasureText): string[] {
  if (measure(title, fontPx, weight) <= maxWidth) return [title]
  const words = title.split(/\s+/).filter(Boolean)
  if (words.length < 2) return [title]
  let best: [string, string] = [title, '']
  let bestWidth = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const widest = Math.max(measure(a, fontPx, weight), measure(b, fontPx, weight))
    if (widest < bestWidth) {
      bestWidth = widest
      best = [a, b]
    }
  }
  return best
}

/**
 * Where everything in `scene` is `localSec` into it, on an output of `output`
 * pixels. `measure` gives a string's width, so long titles shrink to fit
 * instead of running off the frame.
 */
export function sceneLayout(scene: Scene, localSec: number, output: { width: number; height: number }, measure: MeasureText): SceneLayout {
  const { width, height } = output
  const bold = scene.style === 'bold'
  const motion = sceneMotion(scene)
  const exit = clamp01((scene.durationSec - localSec) / motion.exitSec)
  const exitEase = easeOutCubic(exit)
  const short = Math.min(width, height)
  const maxText = width * 0.84

  const fit = (t: string, preferred: number, weight: number): number => {
    const natural = measure(t, preferred, weight)
    return natural > maxText ? (preferred * maxText) / natural : preferred
  }

  const steps = scene.steps ?? []
  const titleWeight = bold ? 800 : 600
  const titleLines = scene.title ? wrapTitle(scene.title, short * (bold ? 0.15 : 0.115), titleWeight, maxText, measure) : []
  const titlePx = titleLines.length ? Math.min(...titleLines.map((line) => fit(line, short * (bold ? 0.15 : 0.115), titleWeight))) : 0
  const titleLine = titlePx * 1.12
  const titleHeight = titleLines.length ? titlePx + titleLine * (titleLines.length - 1) : 0
  const subtitlePx = scene.subtitle ? fit(scene.subtitle, short * 0.058, 400) : 0
  const stepPx = steps.length ? Math.min(...steps.map((s) => fit(s, short * 0.054, 500))) : 0

  // Stack the blocks and centre the stack vertically.
  const gap = short * 0.035
  const barGap = bold && scene.title ? short * 0.05 : 0
  const stepLine = stepPx * 1.7
  const blocks = [
    scene.title ? titleHeight + barGap : 0,
    scene.subtitle ? subtitlePx * 1.3 : 0,
    steps.length ? stepLine * steps.length : 0
  ].filter((h) => h > 0)
  const total = blocks.reduce((a, b) => a + b, 0) + gap * Math.max(0, blocks.length - 1)
  let y = (height - total) / 2

  const elements: SceneElement[] = []
  let order = 0
  const arrival = (): number => {
    const start = order * motion.staggerSec
    order += 1
    return clamp01((localSec - start) / motion.enterSec)
  }

  let accentBar: SceneLayout['accentBar']
  const white = '#ffffff'

  if (scene.title) {
    // Both lines of a wrapped title move as one.
    const p = arrival()
    titleLines.forEach((line, i) => {
      elements.push({
        role: 'title',
        text: line,
        x: width / 2,
        y: y + titlePx / 2 + titleLine * i,
        align: 'center',
        fontPx: titlePx,
        weight: titleWeight,
        color: white,
        alpha: Math.min(clamp01(p * (bold ? 2.5 : 1)), 1) * exitEase,
        scale: (bold ? 0.6 + 0.4 * easeOutBack(p) : 1) * (bold ? 0.92 + 0.08 * exitEase : 1),
        dx: 0,
        dy: bold ? 0 : (1 - easeOutCubic(p)) * short * 0.04
      })
    })
    y += titleHeight
    if (bold) {
      const barWidth = Math.min(maxText, Math.max(...titleLines.map((line) => measure(line, titlePx, titleWeight)))) * 0.5
      accentBar = {
        x: width / 2 - barWidth / 2,
        // Below the descenders, not through them.
        y: y + barGap * 0.55,
        width: barWidth,
        height: Math.max(3, short * 0.008),
        // Wipes in once the title has landed.
        progress: easeOutCubic(clamp01((localSec - motion.enterSec * 0.6) / motion.enterSec)),
        color: scene.accent ?? SCENE_DEFAULT_ACCENT,
        alpha: exitEase
      }
      y += barGap
    }
    y += gap
  }

  if (scene.subtitle) {
    const p = arrival()
    elements.push({
      role: 'subtitle',
      text: scene.subtitle,
      x: width / 2,
      y: y + (subtitlePx * 1.3) / 2,
      align: 'center',
      fontPx: subtitlePx,
      weight: 400,
      color: 'rgba(255,255,255,0.82)',
      alpha: easeOutCubic(p) * exitEase,
      scale: 1,
      dx: 0,
      dy: (1 - easeOutCubic(p)) * short * 0.03
    })
    y += subtitlePx * 1.3 + gap
  }

  if (steps.length) {
    // Steps read as a left-aligned list, centred as a block.
    const badge = bold ? stepPx * 1.5 : 0
    const prefix = bold ? 0 : measure('0.', stepPx, 600) + stepPx * 0.5
    const widest = Math.max(...steps.map((s) => measure(s, stepPx, 500)))
    const left = Math.max(width * 0.08, (width - (widest + badge + prefix + stepPx * 0.6)) / 2)
    steps.forEach((step, i) => {
      const p = arrival()
      const e = easeOutCubic(p)
      elements.push({
        role: 'step',
        index: i + 1,
        text: step,
        x: left,
        y: y + stepLine * i + stepLine / 2,
        align: 'left',
        fontPx: stepPx,
        weight: 500,
        color: white,
        alpha: e * exitEase,
        scale: 1,
        dx: bold ? (1 - e) * -width * 0.06 : 0,
        dy: bold ? 0 : (1 - e) * short * 0.025
      })
    })
  }

  return { scrim: bold ? 0.5 : 0.3, elements, ...(accentBar ? { accentBar } : {}) }
}

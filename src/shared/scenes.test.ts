import { describe, expect, it } from 'vitest'
import {
  SCENE_MAX_SEC,
  SCENE_MAX_STEPS,
  SCENE_MIN_SEC,
  easeOutBack,
  normalizeScene,
  normalizeScenes,
  sceneAt,
  sceneLayout,
  sceneMotion,
  sceneTimeline,
  wrapTitle,
  type Scene
} from './scenes'

// Half an em per character: close enough to a real font to exercise fitting.
const measure = (text: string, fontPx: number): number => text.length * fontPx * 0.5
const HD = { width: 1920, height: 1080 }

function scene(overrides: Partial<Scene> = {}): Scene {
  return { id: 's1', kind: 'intro', title: 'How to export a GIF', style: 'calm', durationSec: 3, ...overrides }
}

describe('normalizeScene', () => {
  it('keeps a well-formed scene as it is', () => {
    const s = scene({ subtitle: 'In three steps', steps: ['Open', 'Pick GIF', 'Export'], accent: '#00aaff' })
    expect(normalizeScene(s)).toEqual(s)
  })

  it('drops a scene with nothing to show', () => {
    expect(normalizeScene({ title: '  ', steps: ['', '  '] })).toBeNull()
    expect(normalizeScene(null)).toBeNull()
    expect(normalizeScene('intro')).toBeNull()
  })

  it('fills in what an older or hand-written file left out', () => {
    expect(normalizeScene({ title: 'Hi' }, 2)).toEqual({ id: 'scene-3', kind: 'intro', title: 'Hi', style: 'calm', durationSec: 3 })
  })

  it('clamps duration, step count, text length and colour', () => {
    const s = normalizeScene({
      title: 'x'.repeat(500),
      steps: Array.from({ length: 10 }, (_, i) => `step ${i}`),
      durationSec: 99,
      accent: 'red',
      style: 'loud',
      kind: 'middle'
    })!
    expect(s.durationSec).toBe(SCENE_MAX_SEC)
    expect(s.steps).toHaveLength(SCENE_MAX_STEPS)
    expect(s.title.length).toBe(140)
    expect(s.accent).toBeUndefined()
    expect(s.style).toBe('calm')
    expect(s.kind).toBe('intro')
    expect(normalizeScene({ title: 'a', durationSec: 0.1 })!.durationSec).toBe(SCENE_MIN_SEC)
  })

  it('normalizes a list, skipping the unusable entries', () => {
    expect(normalizeScenes([scene(), { title: '' }, 7, scene({ id: 's2', kind: 'outro' })]).map((s) => s.id)).toEqual(['s1', 's2'])
    expect(normalizeScenes(undefined)).toEqual([])
  })
})

describe('sceneTimeline', () => {
  const scenes = [
    scene({ id: 'a', kind: 'intro', durationSec: 2 }),
    scene({ id: 'z', kind: 'outro', durationSec: 4 }),
    scene({ id: 'b', kind: 'intro', durationSec: 3 })
  ]

  it('plays intros in order before the recording and outros after it', () => {
    const t = sceneTimeline(scenes, 10)
    expect(t.intros.map((p) => [p.scene.id, p.start, p.end])).toEqual([['a', 0, 2], ['b', 2, 5]])
    expect(t.outros.map((p) => [p.scene.id, p.start, p.end])).toEqual([['z', 15, 19]])
    expect(t.introSec).toBe(5)
    expect(t.outroSec).toBe(4)
  })

  it('is empty when there are no scenes', () => {
    expect(sceneTimeline([], 10)).toEqual({ intros: [], outros: [], introSec: 0, outroSec: 0 })
  })

  it('finds the scene at a time, and nothing during the recording', () => {
    const t = sceneTimeline(scenes, 10)
    expect(sceneAt(t, 0)?.scene.id).toBe('a')
    expect(sceneAt(t, 2.5)).toEqual({ scene: scenes[2], localSec: 0.5 })
    expect(sceneAt(t, 5)).toBeNull()
    expect(sceneAt(t, 14.99)).toBeNull()
    expect(sceneAt(t, 16)?.scene.id).toBe('z')
    expect(sceneAt(t, 19)).toBeNull()
  })
})

describe('sceneMotion', () => {
  it('has every element arrive with a third of the card still to go', () => {
    for (const style of ['calm', 'bold'] as const) {
      for (const steps of [0, 3, 6]) {
        for (const durationSec of [SCENE_MIN_SEC, 3, SCENE_MAX_SEC]) {
          const s = scene({ style, durationSec, subtitle: 'sub', steps: Array.from({ length: steps }, (_, i) => `s${i}`) })
          const m = sceneMotion(s)
          const last = (1 + 1 + steps - 1) * m.staggerSec + m.enterSec
          expect(last).toBeLessThanOrEqual(durationSec * (2 / 3) + 1e-9)
        }
      }
    }
  })
})

describe('sceneLayout', () => {
  const full = scene({ subtitle: 'In three steps', steps: ['Open the take', 'Pick GIF', 'Export'] })

  it('starts with nothing visible and ends with nothing visible', () => {
    for (const style of ['calm', 'bold'] as const) {
      const s = { ...full, style }
      expect(sceneLayout(s, 0, HD, measure).elements.every((e) => e.alpha === 0)).toBe(true)
      expect(sceneLayout(s, s.durationSec, HD, measure).elements.every((e) => e.alpha === 0)).toBe(true)
    }
  })

  it('has everything settled and fully visible in the middle', () => {
    for (const style of ['calm', 'bold'] as const) {
      const s = { ...full, style }
      const mid = sceneLayout(s, s.durationSec * 0.7, HD, measure)
      expect(mid.elements.map((e) => e.role)).toEqual(['title', 'subtitle', 'step', 'step', 'step'])
      for (const e of mid.elements) {
        expect(e.alpha).toBeCloseTo(1, 5)
        expect(e.scale).toBeCloseTo(1, 5)
        expect(e.dx).toBeCloseTo(0, 5)
        expect(e.dy).toBeCloseTo(0, 5)
      }
    }
  })

  it('brings the steps in one after another', () => {
    // Calm staggers 0.3 s: at 1.1 s the first step is nearly in, the second partway, the third not yet.
    const early = sceneLayout(full, 1.1, HD, measure).elements.filter((e) => e.role === 'step').map((e) => e.alpha)
    expect(early[0]).toBeGreaterThan(early[1]!)
    expect(early[1]).toBeGreaterThan(early[2]!)
  })

  it('stacks title, subtitle and steps top to bottom, centred in the frame', () => {
    const els = sceneLayout(full, 2, HD, measure).elements
    const ys = els.map((e) => e.y)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)
    const top = ys[0]! - els[0]!.fontPx / 2
    const bottom = ys.at(-1)! + els.at(-1)!.fontPx
    expect(Math.abs(top - (HD.height - bottom))).toBeLessThan(HD.height * 0.08)
  })

  it('wraps a long title onto two balanced lines that fit the frame', () => {
    const long = scene({ title: 'A title that goes on for a very long time indeed, far too long' })
    const lines = sceneLayout(long, 2, HD, measure).elements.filter((e) => e.role === 'title')
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.text).join(' ')).toBe(long.title)
    for (const l of lines) expect(measure(l.text, l.fontPx)).toBeLessThanOrEqual(HD.width * 0.84 + 1e-6)
    expect(lines[1]!.y).toBeGreaterThan(lines[0]!.y)
    // Wrapping, not shrinking, does the work: still big enough to read.
    expect(lines[0]!.fontPx).toBeGreaterThan(HD.height * 0.07)
  })

  it('keeps a short title on one line', () => {
    expect(wrapTitle('Short', 100, 600, 1000, measure)).toEqual(['Short'])
    expect(wrapTitle('Supercalifragilisticexpialidocious', 100, 600, 100, measure)).toEqual(['Supercalifragilisticexpialidocious'])
  })

  it('pops the bold title past full size before it settles', () => {
    const bold = { ...full, style: 'bold' as const }
    const motion = sceneMotion(bold)
    const peak = Math.max(...Array.from({ length: 30 }, (_, i) => sceneLayout(bold, (i / 30) * motion.enterSec, HD, measure).elements[0]!.scale))
    expect(peak).toBeGreaterThan(1.02)
    expect(easeOutBack(1)).toBeCloseTo(1, 10)
  })

  it('wipes the bold accent bar in after the title, and the calm style has none', () => {
    const bold = { ...full, style: 'bold' as const, accent: '#00aaff' }
    expect(sceneLayout(bold, 0, HD, measure).accentBar?.progress).toBe(0)
    const settled = sceneLayout(bold, 2, HD, measure).accentBar!
    expect(settled.progress).toBeCloseTo(1, 3)
    expect(settled.color).toBe('#00aaff')
    expect(sceneLayout(full, 2, HD, measure).accentBar).toBeUndefined()
  })

  it('lays out a portrait frame without anything leaving it', () => {
    const portrait = { width: 1080, height: 1920 }
    for (const e of sceneLayout(full, 2, portrait, measure).elements) {
      const w = measure(e.text, e.fontPx)
      const left = e.align === 'center' ? e.x - w / 2 : e.x
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + w).toBeLessThanOrEqual(portrait.width)
      expect(e.y).toBeGreaterThan(0)
      expect(e.y).toBeLessThan(portrait.height)
    }
  })
})

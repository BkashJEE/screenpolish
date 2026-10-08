// Turning a recording plan into the record panel's own choices. Pure, tested.

import type { CursorSkin, SourceInfo } from '../../shared/ipc'
import type { PlanContext, RecordPlan } from '../../shared/record-plan'
import { displayIdOf, type RecordSource } from './sources'

export interface PanelChoices {
  mic: string
  system: boolean
  fps: 30 | 60
}

export interface AppliedPlan {
  selection: RecordSource | null
  choices: PanelChoices
  cursorSkin?: CursorSkin
  /** What could not be matched, said plainly in the panel. */
  notes: string[]
}

const fold = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The source named by `target`: an exact name first, then one that contains
 * it or is contained by it, so "Firefox" finds "Firefox — GitHub". Ties go to
 * the shortest name, the most specific match.
 */
export function matchSource(target: string | undefined, candidates: SourceInfo[]): SourceInfo | undefined {
  if (!target || candidates.length === 0) return undefined
  const t = fold(target)
  const exact = candidates.find((c) => fold(c.name) === t)
  if (exact) return exact
  return candidates
    .filter((c) => fold(c.name).includes(t) || t.includes(fold(c.name)))
    .sort((a, b) => a.name.length - b.name.length)[0]
}

/**
 * The record panel's selection and inputs for `plan`. Anything the plan does
 * not mention keeps its current value; the microphone is switched on with the
 * first device ('auto') only if it was off.
 */
export function applyPlan(plan: RecordPlan, sources: SourceInfo[], current: PanelChoices): AppliedPlan {
  const screens = sources.filter((s) => s.kind === 'screen')
  const windows = sources.filter((s) => s.kind === 'window')
  const notes: string[] = []
  const firstScreen = screens[0]
  let selection: RecordSource | null = firstScreen ? { kind: 'screen', displayId: displayIdOf(firstScreen) } : null

  if (plan.source.kind === 'window') {
    const win = matchSource(plan.source.target, windows)
    if (win) selection = { kind: 'window', sourceId: win.id }
    else notes.push(`No open window matches "${plan.source.target ?? 'the planned window'}"; open it and pick it under Window, or record the screen.`)
  } else {
    const screen = matchSource(plan.source.target, screens) ?? firstScreen
    if (screen) selection = plan.source.kind === 'region' ? { kind: 'region', displayId: displayIdOf(screen) } : { kind: 'screen', displayId: displayIdOf(screen) }
  }

  const look = plan.look
  const choices: PanelChoices = {
    mic: look.mic === undefined ? current.mic : look.mic ? current.mic || 'auto' : '',
    system: look.systemAudio ?? current.system,
    fps: look.fps ?? current.fps
  }
  return { selection, choices, ...(look.pointer ? { cursorSkin: look.pointer } : {}), notes }
}

/** What the agent is told this machine can record, from the panel's own lists. */
export function planContextFrom(sources: SourceInfo[], hasMic: boolean, hasWebcam: boolean): PlanContext {
  return {
    screens: sources
      .filter((s) => s.kind === 'screen')
      .map((s) => ({ name: s.name, width: Math.round((s.bounds?.width ?? 0) * (s.scaleFactor ?? 1)), height: Math.round((s.bounds?.height ?? 0) * (s.scaleFactor ?? 1)) })),
    windows: sources.filter((s) => s.kind === 'window').map((s) => s.name),
    hasMic,
    hasWebcam
  }
}

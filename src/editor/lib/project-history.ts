import type { Project } from '../../shared/types'

export interface ProjectHistory {
  past: Project[]
  present: Project
  future: Project[]
}

const MAX_HISTORY = 80
const same = (a: Project, b: Project) => a === b || JSON.stringify(a) === JSON.stringify(b)
const append = (items: Project[], value: Project) => [...items, value].slice(-MAX_HISTORY)

export const createProjectHistory = (project: Project): ProjectHistory => ({ past: [], present: project, future: [] })

export function applyProject(history: ProjectHistory, next: Project, record = true): ProjectHistory {
  if (same(history.present, next)) return history
  return {
    past: record ? append(history.past, history.present) : history.past,
    present: next,
    future: []
  }
}

/** Record the state from before a pointer drag as one history entry. */
export function commitProjectBatch(history: ProjectHistory, base: Project): ProjectHistory {
  if (same(base, history.present)) return history
  if (history.past.length > 0 && same(history.past[history.past.length - 1], base)) return history
  return { ...history, past: append(history.past, base), future: [] }
}

export function undoProject(history: ProjectHistory): ProjectHistory {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  }
}

export function redoProject(history: ProjectHistory): ProjectHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    past: append(history.past, history.present),
    present: next,
    future: history.future.slice(1)
  }
}

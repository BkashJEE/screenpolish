import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT } from '../../shared/types'
import { patchGroup } from './project'
import { applyProject, commitProjectBatch, createProjectHistory, redoProject, undoProject } from './project-history'

describe('project history', () => {
  it('undoes and redoes a normal change', () => {
    const initial = createProjectHistory(DEFAULT_PROJECT)
    const changed = applyProject(initial, patchGroup(DEFAULT_PROJECT, 'frame', { radius: 30 }))
    expect(undoProject(changed).present.frame.radius).toBe(DEFAULT_PROJECT.frame.radius)
    expect(redoProject(undoProject(changed)).present.frame.radius).toBe(30)
  })

  it('records a whole drag as one undo step', () => {
    const initial = createProjectHistory(DEFAULT_PROJECT)
    const step1 = applyProject(initial, patchGroup(DEFAULT_PROJECT, 'frame', { padding: 0.1 }), false)
    const step2 = applyProject(step1, patchGroup(step1.present, 'frame', { padding: 0.2 }), false)
    const committed = commitProjectBatch(step2, DEFAULT_PROJECT)
    expect(committed.past).toHaveLength(1)
    expect(undoProject(committed).present.frame.padding).toBe(DEFAULT_PROJECT.frame.padding)
  })

  it('does not add no-op updates', () => {
    const initial = createProjectHistory(DEFAULT_PROJECT)
    expect(applyProject(initial, { ...DEFAULT_PROJECT })).toBe(initial)
    expect(commitProjectBatch(initial, DEFAULT_PROJECT)).toBe(initial)
  })
})

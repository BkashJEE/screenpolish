import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Project } from '../../shared/types'
import { applyProject, commitProjectBatch, createProjectHistory, redoProject, undoProject } from '../lib/project-history'

export function useProjectHistory(initial: Project): {
  project: Project
  setProject: Dispatch<SetStateAction<Project>>
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  beginBatch: () => void
  endBatch: () => void
} {
  const [history, setHistory] = useState(() => createProjectHistory(initial))
  const historyRef = useRef(history)
  historyRef.current = history
  const batchBase = useRef<Project | null>(null)

  const setProject = useCallback<Dispatch<SetStateAction<Project>>>((update) => {
    setHistory((current) => {
      const next = typeof update === 'function' ? update(current.present) : update
      return applyProject(current, next, batchBase.current === null)
    })
  }, [])

  const beginBatch = useCallback(() => {
    if (batchBase.current === null) batchBase.current = historyRef.current.present
  }, [])

  const endBatch = useCallback(() => {
    const base = batchBase.current
    batchBase.current = null
    if (base) setHistory((current) => commitProjectBatch(current, base))
  }, [])

  const undo = useCallback(() => {
    batchBase.current = null
    setHistory(undoProject)
  }, [])

  const redo = useCallback(() => {
    batchBase.current = null
    setHistory(redoProject)
  }, [])

  return {
    project: history.present,
    setProject,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    beginBatch,
    endBatch
  }
}

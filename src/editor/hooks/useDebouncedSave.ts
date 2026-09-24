import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '../../shared/types'
import { debounce } from '../lib/debounce'
import { createSaveGate } from '../lib/save-gate'

export type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error'

/**
 * Persist the project 500 ms after the last change. The initial (loaded)
 * project is not re-saved, but an Undo back to it is (see save-gate.ts).
 * Pending saves flush on unmount so leaving the editor never drops an edit.
 */
export function useDebouncedSave(folder: string, project: Project, initial: Project): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('clean')
  const mounted = useRef(true)
  const gate = useRef({ initial, gate: createSaveGate(initial) })
  // A different loaded project starts a fresh gate.
  if (gate.current.initial !== initial) gate.current = { initial, gate: createSaveGate(initial) }

  const save = useMemo(
    () =>
      debounce((f: string, p: Project) => {
        if (mounted.current) setStatus('saving')
        window.polish
          .save(f, p)
          .then(() => mounted.current && setStatus('saved'))
          .catch((e: unknown) => {
            console.error('project save failed', e)
            if (mounted.current) setStatus('error')
          })
      }, 500),
    []
  )

  useEffect(() => {
    if (!gate.current.gate.shouldSave(project)) return
    setStatus('dirty')
    save(folder, project)
  }, [folder, project, save])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      save.flush()
    }
  }, [save])

  return status
}

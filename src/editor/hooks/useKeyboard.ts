import { useEffect, useRef } from 'react'

export type KeyHandler = (event: KeyboardEvent) => boolean | void

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    // Sliders, checkboxes and colour pickers should not swallow the shortcuts.
    return !['range', 'checkbox', 'radio', 'color', 'button', 'submit'].includes(type)
  }
  return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Window-level shortcuts. The handler map is keyed by a normalised chord:
 * "Space", "ArrowLeft", "Shift+ArrowLeft", "Ctrl+e", "Delete". Letters are
 * lower-cased. A handler returning false lets the event through; anything else
 * calls preventDefault. Text inputs are ignored unless `always` lists the chord.
 */
export function useKeyboard(handlers: Record<string, KeyHandler>, opts: { enabled?: boolean; always?: string[] } = {}): void {
  const ref = useRef(handlers)
  ref.current = handlers
  const enabled = opts.enabled ?? true
  const always = opts.always ?? []

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && (e.key === ' ' || e.key.toLowerCase() === 'i' || e.key.toLowerCase() === 'o')) return
      const chord = chordOf(e)
      const handler = ref.current[chord]
      if (!handler) return
      if (isEditable(e.target) && !always.includes(chord)) return
      const result = handler(e)
      if (result !== false) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `always` is a fresh array each render; join it so the effect stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, always.join('|')])
}

export function chordOf(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toLowerCase()
  parts.push(key)
  return parts.join('+')
}

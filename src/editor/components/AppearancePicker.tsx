import { useState } from 'react'
import { APPEARANCES, APPEARANCE_KEY, appearanceOf, applyAppearance, readAppearance } from '../lib/appearance'

export function AppearancePicker() {
  const [value, setValue] = useState(readAppearance)
  const [unsaved, setUnsaved] = useState(false)
  return <label className="appearance-picker no-drag" title={unsaved ? 'Appearance applies this session; storage is unavailable.' : 'App appearance only. Manual selection; does not sync with the desktop theme.'}>
    <span className="appearance-swatch" aria-hidden="true" />
    <select aria-label="App appearance" value={value} onChange={event => {
      const next = appearanceOf(event.target.value)
      setValue(next); applyAppearance(next)
      try { localStorage.setItem(APPEARANCE_KEY, next); setUnsaved(false) } catch { setUnsaved(true) }
    }}>
      {Object.entries(APPEARANCES).map(([id, preset]) => <option value={id} key={id}>{preset.label}</option>)}
    </select>
    {unsaved && <span role="status">Not saved</span>}
  </label>
}

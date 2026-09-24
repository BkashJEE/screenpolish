import { useState } from 'react'
import type { AppSettings } from '../../shared/ipc'
import { DEFAULT_SHORTCUTS, validateShortcuts, type RecordingShortcuts } from '../../shared/shortcuts'
import { Button } from './ui'

export function ShortcutSettings({ settings, disabled, onSaved }: { settings: AppSettings; disabled: boolean; onSaved: (settings: AppSettings) => void }) {
  const [draft, setDraft] = useState(settings.shortcuts ?? DEFAULT_SHORTCUTS)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const result = await window.polish.saveSettings({ shortcuts: validateShortcuts(draft) })
      onSaved(result)
      window.dispatchEvent(new CustomEvent('screenpolish-settings', { detail: result }))
    } catch (error) { setError(String(error)) }
    finally { setSaving(false) }
  }
  return <details className="rounded border border-line p-2 text-xs">
    <summary className="cursor-pointer">Recording shortcuts</summary>
    <p className="py-2 text-fg-muted">Type a combination, e.g. Control+Shift+R or Super+F8. Desktop conflicts are checked on save.</p>
    {(Object.keys(draft) as Array<keyof RecordingShortcuts>).map(action => <label key={action} className="mb-2 flex flex-col gap-1 capitalize">
      {action === 'record' ? 'Record / stop' : action === 'pause' ? 'Pause / resume' : 'Stop only'}
      <input aria-label={`${action} shortcut`} className="rounded border border-line bg-bg-2 p-2 font-mono" value={draft[action]} disabled={disabled || saving}
        onChange={event => setDraft(previous => ({ ...previous, [action]: event.target.value }))} />
    </label>)}
    {error && <p role="alert" className="py-2 text-danger">{error}</p>}
    <div className="flex gap-2">
      <Button size="sm" disabled={disabled || saving} onClick={() => void save()}>Save shortcuts</Button>
      <Button size="sm" disabled={disabled || saving} onClick={() => setDraft({ ...DEFAULT_SHORTCUTS })}>Defaults</Button>
    </div>
    {disabled && <p className="pt-2 text-fg-muted">Available when recording is idle.</p>}
  </details>
}

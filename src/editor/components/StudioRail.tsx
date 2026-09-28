import { Film, Record, Screen } from './icons'
import { cx } from './ui'

export type StudioDestination = 'capture' | 'library' | 'editor'

export function StudioRail({
  active,
  editorAvailable,
  onCapture,
  onLibrary,
  onEditor
}: {
  active: StudioDestination
  editorAvailable: boolean
  onCapture: () => void
  onLibrary: () => void
  onEditor: () => void
}) {
  const item = (destination: StudioDestination, label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <button
      type="button"
      className={cx('studio-rail-item no-drag', active === destination && 'is-active')}
      onClick={onClick}
      disabled={disabled}
      aria-current={active === destination ? 'page' : undefined}
      title={disabled ? `${label} opens once you have opened a recording from the library` : label}
    >
      {icon}
      <span>{label}</span>
    </button>
  )

  return (
    <aside className="studio-rail" aria-label="ScreenPolish workspace">
      <div className="studio-mark drag" aria-label="ScreenPolish">
        {/* The real mark, served from resources by the polish:// asset route. */}
        <img src="polish://asset/icon-256.png" alt="" width={30} height={30} draggable={false} />
      </div>
      <nav>
        {item('capture', 'Capture', <Record size={17} />, onCapture)}
        {item('library', 'Library', <Film size={17} />, onLibrary)}
        {item('editor', 'Edit', <Screen size={17} />, onEditor, !editorAvailable)}
      </nav>
      <div className="studio-local-state" title="All recording and rendering stays on this computer">
        <span className="studio-local-dot" />
        Local
      </div>
    </aside>
  )
}

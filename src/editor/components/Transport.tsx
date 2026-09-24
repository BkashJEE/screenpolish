import { formatTime } from '../lib/time'
import { Pause, Play, Refresh, Scissors, SkipEnd, SkipStart, Trash } from './icons'
import { IconButton, Kbd, cx } from './ui'

export function Transport({
  time,
  duration,
  trim,
  playing,
  onToggle,
  onSeek,
  onSetIn,
  onSetOut,
  disabled,
  keptSeconds,
  canSplit,
  onSplit,
  selectedClip,
  onRemoveClip,
  onRestoreClip
}: {
  time: number
  duration: number
  trim: { start: number; end: number }
  playing: boolean
  onToggle: () => void
  onSeek: (t: number) => void
  onSetIn: () => void
  onSetOut: () => void
  disabled?: boolean
  /** Exported length after trim and removed clips; shown when it differs from the source. */
  keptSeconds?: number
  canSplit?: boolean
  onSplit?: () => void
  selectedClip?: { removed: boolean } | null
  onRemoveClip?: () => void
  onRestoreClip?: () => void
}) {
  const kept = keptSeconds ?? trim.end - trim.start
  const trimmed = trim.start > 0 || (Number.isFinite(duration) && trim.end < duration - 1e-3) || kept < trim.end - trim.start - 1e-3
  return (
    <div className={cx('flex h-10 items-center gap-1 px-1', disabled && 'opacity-50 pointer-events-none')}>
      <IconButton label="Go to trim start (Home)" onClick={() => onSeek(trim.start)}>
        <SkipStart size={14} />
      </IconButton>
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg-0 transition-transform duration-100 hover:scale-105 active:scale-95"
      >
        {playing ? <Pause size={14} /> : <Play size={14} className="ml-[1px]" />}
      </button>
      <IconButton label="Go to trim end (End)" onClick={() => onSeek(trim.end)}>
        <SkipEnd size={14} />
      </IconButton>

      <div className="ml-2 font-mono text-[12px] tabular-nums text-fg">
        {formatTime(time)}
        <span className="text-fg-dim"> / {formatTime(duration)}</span>
      </div>
      {trimmed && (
        <div className="ml-2 font-mono text-[11px] tabular-nums text-fg-dim" title="Length after trim and removed clips" data-testid="kept-length">
          [{formatTime(kept, { fraction: false })}]
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onSplit}
          disabled={!canSplit}
          className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] text-fg-muted hover:bg-bg-3 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          title="Split the timeline at the playhead"
        >
          <Scissors size={13} /> <Kbd>S</Kbd> Split
        </button>
        {selectedClip && !selectedClip.removed && (
          <button
            type="button"
            onClick={onRemoveClip}
            className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] text-[#ff8a8a] hover:bg-bg-3"
            title="Remove the selected clip from playback and export"
          >
            <Trash size={13} /> <Kbd>Del</Kbd> Remove clip
          </button>
        )}
        {selectedClip?.removed && (
          <button
            type="button"
            onClick={onRestoreClip}
            className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] text-fg-muted hover:bg-bg-3 hover:text-fg"
            title="Bring the selected clip back"
          >
            <Refresh size={13} /> Restore clip
          </button>
        )}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <button
          type="button"
          onClick={onSetIn}
          className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] text-fg-muted hover:bg-bg-3 hover:text-fg"
          title="Set trim start at playhead"
        >
          <Kbd>I</Kbd> In
        </button>
        <button
          type="button"
          onClick={onSetOut}
          className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] text-fg-muted hover:bg-bg-3 hover:text-fg"
          title="Set trim end at playhead"
        >
          <Kbd>O</Kbd> Out
        </button>
      </div>
    </div>
  )
}

import { memo, useState } from 'react'
import type { Overlay, OverlayKind, OverlayShape, OverlayText } from '../../shared/types'
import {
  DEFAULT_TEXT_BACKGROUND,
  EMOJI_PICKS,
  MAX_OVERLAY_W,
  MIN_OVERLAY_W,
  MIN_OVERLAY_LENGTH,
  OVERLAY_FONTS,
  SHAPE_COLORS,
  overlayLabel,
  type OverlayPatch
} from '../lib/overlays'
import { formatTime } from '../lib/time'
import { ArrowIcon, BlurIcon, BoxIcon, Copy, ImageIcon, Smile, TextIcon, Trash, X } from './icons'
import { Button, ColorField, Kbd, NumberField, Row, Section, Segmented, Select, SliderField, TextInput, Toggle, cx } from './ui'

export interface OverlaysProps {
  overlays: Overlay[]
  selectedId: string | null
  duration: number
  time: number
  onSelect: (id: string | null) => void
  onAdd: (kind: OverlayKind, content: string) => void
  onPatch: (id: string, patch: OverlayPatch) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

const KIND_ICON: Record<OverlayKind, (p: { size?: number; className?: string }) => React.ReactNode> = {
  emoji: (p) => <Smile {...p} />,
  text: (p) => <TextIcon {...p} />,
  image: (p) => <ImageIcon {...p} />,
  arrow: (p) => <ArrowIcon {...p} />,
  box: (p) => <BoxIcon {...p} />,
  blur: (p) => <BlurIcon {...p} />
}

export const Overlays = memo(function Overlays(props: OverlaysProps) {
  const { overlays, selectedId, duration, time, onSelect, onAdd, onPatch, onDelete, onDuplicate } = props
  const [picker, setPicker] = useState(false)
  const selected = overlays.find((o) => o.id === selectedId) ?? null
  const hasDuration = Number.isFinite(duration) && duration > 0

  const addImage = async () => {
    const path = await window.polish.pickImage()
    if (path) onAdd('image', path)
  }

  return (
    <Section title="Overlays" right={overlays.length > 0 ? <span className="font-mono text-[10.5px] tabular-nums text-fg-dim">{overlays.length}</span> : undefined}>
      <div className="grid grid-cols-3 gap-1.5">
        <Button size="sm" icon={<Smile size={13} />} onClick={() => setPicker((p) => !p)} disabled={!hasDuration} title="Add an emoji sticker" className={cx(picker && 'bg-bg-4')}>
          Emoji
        </Button>
        <Button
          size="sm"
          icon={<TextIcon size={13} />}
          onClick={() => {
            setPicker(false)
            onAdd('text', 'Your text')
          }}
          disabled={!hasDuration}
          title="Add a caption"
        >
          Text
        </Button>
        <Button
          size="sm"
          icon={<ImageIcon size={13} />}
          onClick={() => {
            setPicker(false)
            void addImage()
          }}
          disabled={!hasDuration}
          title="Add a picture"
        >
          Image
        </Button>
        <Button size="sm" icon={<ArrowIcon size={13} />} onClick={() => { setPicker(false); onAdd('arrow', '') }} disabled={!hasDuration} title="Add an arrow that points at something">
          Arrow
        </Button>
        <Button size="sm" icon={<BoxIcon size={13} />} onClick={() => { setPicker(false); onAdd('box', '') }} disabled={!hasDuration} title="Add a box that highlights an area">
          Box
        </Button>
        <Button size="sm" icon={<BlurIcon size={13} />} onClick={() => { setPicker(false); onAdd('blur', '') }} disabled={!hasDuration} title="Hide something private, like a key or an email address">
          Blur
        </Button>
      </div>

      {picker && (
        <EmojiPicker
          onPick={(content) => {
            onAdd('emoji', content)
            setPicker(false)
          }}
          onClose={() => setPicker(false)}
        />
      )}

      {overlays.length > 0 && (
        <div className="flex max-h-[152px] flex-col gap-[2px] overflow-y-auto rounded-[8px] border border-line bg-bg-1 p-1" role="listbox" aria-label="Overlays">
          {overlays.map((o) => {
            const active = o.id === selectedId
            const end = o.end > 0 ? o.end : hasDuration ? duration : NaN
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(active ? null : o.id)}
                className={cx(
                  'flex h-7 items-center gap-2 rounded-[6px] px-2 text-left text-[12px] transition-colors duration-100',
                  active ? 'bg-accent-soft text-fg' : 'text-fg-muted hover:bg-bg-3 hover:text-fg'
                )}
                title={o.kind === 'image' ? o.content : o.content}
              >
                <span className={cx('shrink-0', o.kind === 'emoji' ? 'text-[15px] leading-none' : 'text-fg-dim')}>{o.kind === 'emoji' ? o.content : KIND_ICON[o.kind]({ size: 13 })}</span>
                <span className="min-w-0 flex-1 truncate">{o.kind === 'emoji' ? (o.pinned ? 'Pinned sticker' : 'Sticker') : overlayLabel(o)}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-dim">
                  {formatTime(o.start, { fraction: false })}–{Number.isFinite(end) ? formatTime(end, { fraction: false }) : 'end'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {selected ? (
        <OverlayEditor
          overlay={selected}
          duration={duration}
          time={time}
          onPatch={(p) => onPatch(selected.id, p)}
          onDelete={() => onDelete(selected.id)}
          onDuplicate={() => onDuplicate(selected.id)}
          onClose={() => onSelect(null)}
        />
      ) : (
        overlays.length === 0 && (
          <div className="rounded-[8px] border border-dashed border-line px-3 py-2.5 text-[11.5px] text-fg-dim">
            Stickers, captions, pictures, arrows, highlight boxes and blur over the video. Drag them on the preview; the corner handle resizes, <Kbd>Shift</Kbd> + drag rotates.
          </div>
        )
      )}
    </Section>
  )
})

function EmojiPicker({ onPick, onClose }: { onPick: (content: string) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('')
  const submit = () => {
    const v = custom.trim()
    if (v) onPick(v)
  }
  return (
    <div className="fade-in flex flex-col gap-2 rounded-[8px] border border-line bg-bg-1 p-2">
      <div className="grid grid-cols-8 gap-[2px]">
        {EMOJI_PICKS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="flex h-7 items-center justify-center rounded-[6px] text-[17px] leading-none hover:bg-bg-3"
            title={e}
            aria-label={`Add ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <TextInput
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Paste any emoji or text"
          className="min-w-0 flex-1"
          aria-label="Custom sticker"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
            e.stopPropagation()
          }}
        />
        <Button size="sm" onClick={submit} disabled={!custom.trim()}>
          Add
        </Button>
      </div>
    </div>
  )
}

function OverlayEditor({
  overlay,
  duration,
  time,
  onPatch,
  onDelete,
  onDuplicate,
  onClose
}: {
  overlay: Overlay
  duration: number
  time: number
  onPatch: (patch: OverlayPatch) => void
  onDelete: () => void
  onDuplicate: () => void
  onClose: () => void
}) {
  const hasDuration = Number.isFinite(duration) && duration > 0
  const style = overlay.text
  const setText = (patch: Partial<OverlayText>) => {
    if (!style) return
    onPatch({ text: { ...style, ...patch } })
  }
  const shape = overlay.shape
  const setShape = (patch: Partial<OverlayShape>) => {
    if (!shape) return
    onPatch({ shape: { ...shape, ...patch } })
  }
  return (
    <div className="fade-in flex flex-col gap-2.5 rounded-[8px] border border-overlay/40 bg-overlay-soft/30 p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-fg-dim">{KIND_ICON[overlay.kind]({ size: 13 })}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg" title={overlay.content}>
          {overlay.kind === 'emoji' ? `${overlay.content} Sticker` : overlayLabel(overlay)}
        </span>
        <button type="button" className="text-fg-dim hover:text-fg" onClick={onClose} aria-label="Deselect overlay">
          <X size={13} />
        </button>
      </div>

      {overlay.kind === 'text' && (
        <textarea
          aria-label="Overlay text"
          value={overlay.content}
          rows={2}
          spellCheck={false}
          onChange={(e) => onPatch({ content: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full resize-y rounded-[7px] border border-line-strong bg-bg-1 px-2.5 py-1.5 text-[12.5px] text-fg focus:border-accent"
          style={{ userSelect: 'text', minHeight: 44 }}
        />
      )}
      {overlay.kind === 'emoji' && (
        <Row label="Sticker">
          <TextInput value={overlay.content} onChange={(e) => onPatch({ content: e.target.value })} className="w-[110px] text-center text-[16px]" aria-label="Sticker" spellCheck={false} onKeyDown={(e) => e.stopPropagation()} />
        </Row>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
          <span className="flex items-center justify-between">
            Start
            <button type="button" className="text-accent hover:text-accent-hover" onClick={() => onPatch({ start: time })} title="Start at the playhead">
              Playhead
            </button>
          </span>
          <NumberField ariaLabel="Overlay start" value={overlay.start} min={0} max={hasDuration ? duration : undefined} step={0.1} suffix="s" onChange={(start) => onPatch({ start })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
          <span className="flex items-center justify-between">
            End
            <button type="button" className="text-accent hover:text-accent-hover" onClick={() => onPatch({ end: Math.max(time, overlay.start + MIN_OVERLAY_LENGTH) })} title="End at the playhead">
              Playhead
            </button>
          </span>
          <NumberField ariaLabel="Overlay end (0 = until the end)" value={overlay.end} min={0} max={hasDuration ? duration : undefined} step={0.1} suffix="s" onChange={(end) => onPatch({ end })} />
        </label>
      </div>
      <div className="-mt-1.5 text-[10.5px] text-fg-dim">End 0 keeps it until the end of the recording.</div>

      <SliderField label="Size" value={overlay.w} min={MIN_OVERLAY_W} max={MAX_OVERLAY_W} step={0.005} onChange={(w) => onPatch({ w })} format={(v) => `${Math.round(v * 100)}%`} />
      {shape && (
        <SliderField label={overlay.kind === 'arrow' ? 'Head size' : 'Height'} value={shape.aspect} min={0.05} max={overlay.kind === 'arrow' ? 1 : 2} step={0.01} onChange={(aspect) => setShape({ aspect })} format={(v) => `${Math.round(v * 100)}%`} />
      )}
      {overlay.kind !== 'blur' && (
        <SliderField label="Rotation" value={overlay.rotation} min={-180} max={180} step={1} onChange={(rotation) => onPatch({ rotation })} format={(v) => `${Math.round(v)}°`} />
      )}
      <SliderField label="Fade" value={overlay.fadeSec} min={0} max={2} step={0.05} onChange={(fadeSec) => onPatch({ fadeSec })} format={(v) => (v === 0 ? 'None' : `${v.toFixed(2)} s`)} />
      <Row label="Pinned to video" hint="Moves and scales with the zoom">
        <Toggle checked={overlay.pinned} onChange={(pinned) => onPatch({ pinned })} label="Pinned to video" />
      </Row>

      {overlay.kind === 'text' && style && (
        <>
          <Row label="Font">
            <Select<string> ariaLabel="Font" value={style.font} onChange={(font) => setText({ font })} options={OVERLAY_FONTS.map((f) => ({ value: f, label: f }))} className="w-[132px]" />
          </Row>
          <Row label="Weight">
            <Segmented<OverlayText['weight']>
              full={false}
              size="sm"
              value={style.weight}
              onChange={(weight) => setText({ weight })}
              options={[
                { value: 400, label: 'Regular' },
                { value: 600, label: 'Semi' },
                { value: 800, label: 'Bold' }
              ]}
            />
          </Row>
          <Row label="Align">
            <Segmented<OverlayText['align']>
              full={false}
              size="sm"
              value={style.align}
              onChange={(align) => setText({ align })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Right' }
              ]}
            />
          </Row>
          <Row label="Color">
            <ColorField label="Text color" value={style.color} onChange={(color) => setText({ color })} />
          </Row>
          <Row label="Outline">
            <ColorField label="Outline color" value={style.outline} onChange={(outline) => setText({ outline })} />
          </Row>
          <SliderField label="Outline width" value={style.outlineWidth} min={0} max={25} step={1} onChange={(outlineWidth) => setText({ outlineWidth })} format={(v) => (v === 0 ? 'None' : `${v}%`)} />
          <Row label="Background">
            <div className="flex items-center gap-2">
              {style.background && <ColorField label="Background color" value={style.background} onChange={(background) => setText({ background })} />}
              <Toggle checked={!!style.background} onChange={(on) => setText({ background: on ? DEFAULT_TEXT_BACKGROUND : undefined })} label="Text background" />
            </div>
          </Row>
        </>
      )}

      {shape && (overlay.kind === 'arrow' || overlay.kind === 'box') && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-fg-muted">Color</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {SHAPE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setShape({ color: c })}
                  aria-label={`Use ${c}`}
                  aria-pressed={shape.color.toLowerCase() === c}
                  className={cx('h-5 w-5 rounded-full border border-line-strong', shape.color.toLowerCase() === c && 'ring-2 ring-fg ring-offset-1 ring-offset-bg-1')}
                  style={{ background: c }}
                />
              ))}
              <ColorField label="Custom color" value={shape.color} onChange={(color) => setShape({ color })} />
            </div>
          </div>
          <SliderField label="Thickness" value={shape.thickness} min={1} max={10} step={1} onChange={(thickness) => setShape({ thickness })} format={(v) => `${v}`} />
          {overlay.kind === 'box' && (
            <Row label="Tinted fill" hint="Soft colour inside the outline">
              <Toggle checked={!!shape.fill} onChange={(fill) => setShape({ fill })} label="Tinted fill" />
            </Row>
          )}
        </>
      )}

      {shape && overlay.kind === 'blur' && (
        <>
          <Row label="Style" hint={shape.mode === 'blur' ? 'Soft blur can leave large text readable' : 'Hides text reliably'}>
            <Segmented<'pixelate' | 'blur'>
              full={false}
              size="sm"
              value={shape.mode ?? 'pixelate'}
              onChange={(mode) => setShape({ mode })}
              options={[
                { value: 'pixelate', label: 'Pixelate' },
                { value: 'blur', label: 'Blur' }
              ]}
            />
          </Row>
          <SliderField label="Strength" value={shape.amount ?? 8} min={1} max={10} step={1} onChange={(amount) => setShape({ amount })} format={(v) => `${v}`} />
        </>
      )}

      {overlay.kind === 'image' && (
        <div className="truncate text-[11px] text-fg-dim" title={overlay.content}>
          {overlay.content}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" icon={<Copy size={12} />} onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button size="sm" variant="danger" icon={<Trash size={12} />} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  )
}

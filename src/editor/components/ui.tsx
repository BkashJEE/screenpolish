// Small design system for the editor. Every control here is dark, dense and
// keyboard-friendly. No external UI packages.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Eyedropper, X } from './icons'
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from '../../shared/color'
import { placePopover } from '../lib/popover'
import { rememberColour, stepHue, stepSv } from '../lib/color-controls'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Buttons

type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'record'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover disabled:hover:bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
  default: 'bg-bg-3 text-fg hover:bg-bg-4 border border-line-strong disabled:hover:bg-bg-3',
  ghost: 'bg-transparent text-fg-muted hover:bg-bg-3 hover:text-fg disabled:hover:bg-transparent',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white border border-danger/30 disabled:hover:bg-danger-soft disabled:hover:text-danger',
  record: 'bg-rec text-white hover:brightness-110 shadow-[0_0_0_4px_rgba(255,59,48,0.18)]'
}
const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-[6px]',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-[8px]',
  lg: 'h-10 px-4 text-[14px] gap-2 rounded-[10px] font-medium'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
}

export function Button({ variant = 'default', size = 'md', icon, iconRight, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap select-none transition-colors duration-100 disabled:opacity-45',
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {icon && <span className="shrink-0 -ml-0.5 flex items-center">{icon}</span>}
      {children}
      {iconRight && <span className="shrink-0 -mr-0.5 flex items-center">{iconRight}</span>}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  size?: number
  tone?: 'default' | 'danger'
}

export function IconButton({ label, active, size = 28, tone = 'default', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex items-center justify-center rounded-[7px] transition-colors duration-100 disabled:opacity-40',
        tone === 'danger' ? 'text-fg-muted hover:bg-danger-soft hover:text-danger' : 'text-fg-muted hover:bg-bg-3 hover:text-fg',
        active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
        className
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Form controls

export function Toggle({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-bg-4 hover:bg-line-strong'
      )}
    >
      <span
        className={cx(
          'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[16px]' : 'translate-x-[2px]'
        )}
        style={{ left: 0 }}
      />
    </button>
  )
}

export function Row({ label, hint, children, disabled }: { label: ReactNode; hint?: ReactNode; children: ReactNode; disabled?: boolean }) {
  return (
    <div className={cx('flex min-h-[28px] items-center justify-between gap-3', disabled && 'opacity-45')}>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-fg">{label}</div>
        {hint && <div className="mt-[1px] text-[11px] leading-[1.35] text-fg-dim">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled
}: {
  label: ReactNode
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  disabled?: boolean
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  const origin = useRef<number | null>(null)
  const [stretch, setStretch] = useState(0)
  const sliderId = useId()
  const release = () => { origin.current = null; setStretch(0) }
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (origin.current !== null) setStretch(28 * Math.tanh((event.clientY - origin.current) / 65))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
    }
  }, [])
  return (
    <div className={cx('flex flex-col gap-1', disabled && 'opacity-45')}>
      <div className="flex items-center justify-between">
        <label htmlFor={sliderId} className="text-[12.5px] text-fg">{label}</label>
        <span className="font-mono text-[11px] tabular-nums text-fg-muted">{format ? format(value) : value}</span>
      </div>
      <input
        id={sliderId}
        type="range"
        aria-label={typeof label === 'string' ? label : undefined}
        className={cx('slider elastic-slider', stretch !== 0 && 'elastic-dragging')}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--fill' as string]: `${Math.max(0, Math.min(100, fill))}%`, ['--stretch' as string]: `${stretch}px`, ['--lean' as string]: `${stretch / 3}deg` }}
        onPointerDown={(e) => {
          if (!e.currentTarget.closest('[data-playful-sliders="true"]') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
          origin.current = e.clientY
        }}
        onPointerMove={(e) => {
          if (origin.current !== null) setStretch(28 * Math.tanh((e.clientY - origin.current) / 65))
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onBlur={release}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => undefined}
      />
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  full = true,
  size = 'md'
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; title?: string }>
  onChange: (v: T) => void
  disabled?: boolean
  full?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="radiogroup"
      className={cx('inline-flex rounded-[8px] bg-bg-1 p-[2px] border border-line', full && 'w-full', disabled && 'opacity-45 pointer-events-none')}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex-1 rounded-[6px] px-2 whitespace-nowrap transition-colors duration-100',
              size === 'sm' ? 'h-[22px] text-[11.5px]' : 'h-[26px] text-[12px]',
              active ? 'bg-bg-4 text-fg shadow-[0_1px_2px_rgba(0,0,0,0.4)]' : 'text-fg-muted hover:text-fg'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  className,
  ariaLabel
}: {
  value: T
  options: Array<{ value: T; label: string; disabled?: boolean }>
  onChange: (v: T) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  const numeric = typeof value === 'number'
  return (
    <select
      aria-label={ariaLabel}
      className={cx(
        'select h-7 min-w-0 rounded-[7px] border border-line-strong bg-bg-3 pl-2.5 text-[12px] text-fg hover:bg-bg-4 disabled:opacity-45',
        className
      )}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange((numeric ? Number(e.target.value) : e.target.value) as T)}
    >
      {options.map((o, i) => (
        <option key={`${i}:${String(o.value)}`} value={String(o.value)} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-7 rounded-[7px] border border-line-strong bg-bg-1 px-2.5 text-[12.5px] text-fg placeholder:text-fg-dim focus:border-accent disabled:opacity-45',
        className
      )}
      style={{ userSelect: 'text' }}
      {...rest}
    />
  )
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  suffix,
  className,
  disabled,
  ariaLabel
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  className?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const [text, setText] = useState(formatNum(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(formatNum(value))
  }, [value, focused])
  const commit = () => {
    const n = Number(text)
    if (Number.isFinite(n)) {
      const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
      onChange(clamped)
      setText(formatNum(clamped))
    } else setText(formatNum(value))
  }
  return (
    <div className={cx('relative', className)}>
      <input
        type="number"
        aria-label={ariaLabel}
        className={cx(
          'h-7 w-full rounded-[7px] border border-line-strong bg-bg-1 px-2 font-mono text-[12px] tabular-nums text-fg focus:border-accent disabled:opacity-45',
          suffix && 'pr-7'
        )}
        style={{ userSelect: 'text' }}
        value={text}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setText(formatNum(value))
            ;(e.target as HTMLInputElement).blur()
          }
          e.stopPropagation()
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-fg-dim">{suffix}</span>}
    </div>
  )
}

function formatNum(v: number): string {
  if (!Number.isFinite(v)) return ''
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

/** Picker popover size; placement maths uses it, so keep both in step with the JSX. */
const PICKER_W = 208
const PICKER_H = 254

/** Recent colours are a per-viewer convenience; a browser without storage just gets none. */
const RECENT_KEY = 'polish.recentColours'

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? rememberColour(raw.filter((c): c is string => typeof c === 'string'), '') : []
  } catch {
    return []
  }
}

function saveRecent(list: readonly string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* storage is optional */
  }
}

/**
 * Colour control: a swatch that opens an in-window picker, plus a hex field.
 *
 * The swatch used to be `<input type="color">`, whose picker Chromium draws
 * itself and anchors to the swatch — from the inspector at the right edge of
 * the window that popup ran outside the window on Hyprland. This one is our own
 * DOM, portalled to the body and clamped inside the viewport by `placePopover`.
 */
export function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const id = useId()
  const hex = normalizeHex(value) ?? '#000000'
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const swatch = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!focused) setText(value)
  }, [value, focused])

  // Place on open, and follow window resizes while it is open.
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const a = swatch.current?.getBoundingClientRect()
      if (!a) return
      setAt(placePopover({
        anchor: { left: a.left, top: a.top, width: a.width, height: a.height },
        size: { width: PICKER_W, height: PICKER_H },
        viewport: { width: window.innerWidth, height: window.innerHeight }
      }))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  // Escape closes; so does a press anywhere outside the swatch and the popover.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        swatch.current?.focus()
      }
    }
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node
      if (!popover.current?.contains(t) && !swatch.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  return (
    <div className="flex items-center gap-2">
      <button
        id={id}
        ref={swatch}
        type="button"
        className="h-6 w-6 shrink-0 rounded-[6px] border border-line-strong"
        style={{ background: hex }}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => {
            if (!v) setRecent(loadRecent())
            else {
              const next = rememberColour(loadRecent(), hex)
              saveRecent(next)
            }
            return !v
          })
        }}
      />
      <input
        className="h-7 w-[84px] rounded-[7px] border border-line-strong bg-bg-1 px-2 font-mono text-[11.5px] uppercase text-fg focus:border-accent"
        style={{ userSelect: 'text' }}
        value={text}
        spellCheck={false}
        aria-label={label ? `${label} hex` : 'hex'}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          const norm = normalizeHex(text)
          if (norm) onChange(norm)
          else setText(value)
        }}
        onChange={(e) => {
          setText(e.target.value)
          const norm = normalizeHex(e.target.value)
          if (norm) onChange(norm)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
      {open && at && createPortal(
        <div
          ref={popover}
          role="dialog"
          aria-label={label ? `${label} picker` : 'Colour picker'}
          className="fixed z-50 rounded-[10px] border border-line-strong bg-bg-2 p-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
          style={{ left: at.left, top: at.top, width: PICKER_W }}
        >
          <ColorPicker hex={hex} recent={recent} onPick={onChange} />
        </div>,
        document.body
      )}
    </div>
  )
}

/** Saturation/value square, hue slider and the current colour, all pointer-draggable. */
function ColorPicker({ hex, recent, onPick }: { hex: string; recent: readonly string[]; onPick: (hex: string) => void }) {
  /**
   * HSV is the picker's own state while it is open, not something derived from
   * the hex each render: hex has only 8 bits a channel, so a 1% keyboard step
   * can land on the same hex, and re-deriving would throw the step away and
   * leave the arrow keys stuck. An outside change to the colour still wins.
   */
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(hex))
  useEffect(() => {
    setHsv((current) => (hsvToHex(current) === hex ? current : hexToHsv(hex)))
  }, [hex])
  const hue = hsv.h

  const pick = (next: Partial<Hsv>): void => {
    const merged = { ...hsv, ...next }
    setHsv(merged)
    onPick(hsvToHex(merged))
  }

  const drag = (e: ReactPointerEvent<HTMLDivElement>, to: (x: number, y: number, rect: DOMRect) => void): void => {
    const el = e.currentTarget
    const apply = (clientX: number, clientY: number): void => {
      const r = el.getBoundingClientRect()
      to(Math.min(Math.max(clientX - r.left, 0), r.width), Math.min(Math.max(clientY - r.top, 0), r.height), r)
    }
    el.setPointerCapture(e.pointerId)
    apply(e.clientX, e.clientY)
    const move = (ev: PointerEvent): void => apply(ev.clientX, ev.clientY)
    const up = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const pure = hsvToHex({ h: hue, s: 1, v: 1 })
  // Chromium's eyedropper, the one thing the native picker had that this did not.
  const eyedropper = typeof window !== 'undefined' && 'EyeDropper' in window
  const pickFromScreen = async (): Promise<void> => {
    try {
      const Picker = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
      const { sRGBHex } = await new Picker().open()
      const norm = normalizeHex(sRGBHex)
      if (norm) onPick(norm)
    } catch {
      /* the viewer cancelled */
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-[120px] w-full cursor-crosshair rounded-[7px] border border-line"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${pure}` }}
        onPointerDown={(e) => drag(e, (x, y, r) => pick({ s: x / r.width, v: 1 - y / r.height }))}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onKeyDown={(e) => {
          const next = stepSv({ h: hue, s: hsv.s, v: hsv.v }, e.key, e.shiftKey)
          if (!next) return
          e.preventDefault()
          e.stopPropagation()
          pick(next)
        }}
      >
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>
      <div
        className="relative h-3.5 w-full cursor-pointer rounded-full border border-line"
        style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
        onPointerDown={(e) => drag(e, (x, _y, r) => {
          pick({ h: (x / r.width) * 360 })
        })}
        role="slider"
        aria-label="Hue"
        aria-valuenow={Math.round(hue)}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
        onKeyDown={(e) => {
          const next = stepHue(hue, e.key, e.shiftKey)
          if (next === null) return
          e.preventDefault()
          e.stopPropagation()
          pick({ h: next })
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{ left: `${(hue / 360) * 100}%`, background: pure }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="h-5 w-5 shrink-0 rounded-[5px] border border-line-strong" style={{ background: hex }} />
        <span className="font-mono text-[11px] uppercase text-fg-muted">{hex}</span>
        {eyedropper && (
          <button
            type="button"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-[6px] border border-line-strong text-fg-muted hover:text-fg"
            title="Pick a colour from the screen"
            aria-label="Pick a colour from the screen"
            onClick={() => void pickFromScreen()}
          >
            <Eyedropper size={13} />
          </button>
        )}
      </div>
      {recent.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Recent colours">
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              className="h-4 w-4 rounded-[4px] border border-line-strong"
              style={{ background: c }}
              title={c.toUpperCase()}
              aria-label={`Use ${c.toUpperCase()}`}
              onClick={() => onPick(c)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout pieces

export function Section({
  title,
  right,
  children,
  defaultOpen = true,
  disabled
}: {
  title: string
  right?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section data-section={title} className="border-b border-line">
      <header className="flex h-9 items-center gap-1.5 px-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="group/sec flex flex-1 items-center gap-1.5 text-left"
          aria-expanded={open}
        >
          <span className="text-fg-dim">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          <Eyebrow className="group-hover/sec:text-fg-muted">{title}</Eyebrow>
        </button>
        {right && <div className="flex items-center gap-1.5">{right}</div>}
      </header>
      {open && <div className={cx('flex flex-col gap-2.5 px-3 pb-3.5', disabled && 'opacity-45 pointer-events-none')}>{children}</div>}
    </section>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line-strong bg-bg-3 px-1 font-sans text-[10.5px] text-fg-muted shadow-[0_1px_0_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="fade-in flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-2 text-fg-dim">{icon}</div>
      <div className="text-[14px] font-medium text-fg">{title}</div>
      {body && <div className="max-w-[320px] text-[12.5px] text-fg-muted">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 440,
  closable = true
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: number
  closable?: boolean
}) {
  useEffect(() => {
    if (!open || !closable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, closable, onClose])
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (closable && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fade-in flex max-h-[90vh] flex-col rounded-[14px] bg-bg-2"
        style={{ width, boxShadow: 'var(--shadow-pop)' }}
      >
        <div className="flex h-11 items-center justify-between border-b border-line pl-4 pr-2">
          <div className="text-[13.5px] font-semibold text-fg">{title}</div>
          <IconButton label="Close" onClick={onClose} disabled={!closable}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}

// A status pill: a 6px dot in the state colour and a short label. Used wherever
// the answer is a state rather than a value, so states read the same way in the
// record panel, the library and the inspector.
export type ChipTone = 'ok' | 'warn' | 'danger' | 'info' | 'accent' | 'idle' | 'rec'

const CHIP: Record<ChipTone, { wrap: string; dot: string }> = {
  ok: { wrap: 'bg-ok/12 text-ok', dot: 'bg-ok' },
  warn: { wrap: 'bg-manual-soft text-manual', dot: 'bg-manual' },
  danger: { wrap: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  info: { wrap: 'bg-auto-soft text-auto', dot: 'bg-auto' },
  accent: { wrap: 'bg-accent-soft text-accent', dot: 'bg-accent' },
  idle: { wrap: 'bg-bg-3 text-fg-muted', dot: 'bg-fg-dim' },
  rec: { wrap: 'bg-rec/15 text-rec', dot: 'bg-rec chip-live' }
}

export function Chip({ tone = 'idle', dot = true, children, className, title }: { tone?: ChipTone; dot?: boolean; children: ReactNode; className?: string; title?: string }) {
  const t = CHIP[tone]
  return (
    <span
      title={title}
      className={cx('inline-flex h-[20px] shrink-0 items-center gap-[6px] rounded-full px-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]', t.wrap, className)}
    >
      {dot && <span className={cx('h-[6px] w-[6px] shrink-0 rounded-full', t.dot)} />}
      {children}
    </span>
  )
}

// Group heading: quiet, uppercase, wide-tracked. One weight for every group
// label in the app so the eye reads structure before it reads words.
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-dim', className)}>{children}</span>
}

// A count that sits beside a heading. Mono and tabular so it never shifts.
export function Count({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[11px] tabular-nums text-fg-dim', className)}>{children}</span>
}

export function Divider() {
  return <div className="h-px w-full bg-line" />
}

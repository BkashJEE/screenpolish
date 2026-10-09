import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 16, ...rest }: IconProps, children: React.ReactNode, fill = false) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const Play = (p: IconProps) => base(p, <path d="M4.5 2.8v10.4L13 8z" />, true)
export const Pause = (p: IconProps) => base(p, <><rect x="3.5" y="2.5" width="3" height="11" rx="0.8" /><rect x="9.5" y="2.5" width="3" height="11" rx="0.8" /></>, true)
export const SkipStart = (p: IconProps) => base(p, <><path d="M12.5 3v10L6 8z" /><rect x="3" y="3" width="1.6" height="10" rx="0.5" /></>, true)
export const SkipEnd = (p: IconProps) => base(p, <><path d="M3.5 3v10L10 8z" /><rect x="11.4" y="3" width="1.6" height="10" rx="0.5" /></>, true)
export const Stop = (p: IconProps) => base(p, <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />, true)
export const Record = (p: IconProps) => base(p, <circle cx="8" cy="8" r="5" />, true)
export const Folder = (p: IconProps) => base(p, <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />)
export const Trash = (p: IconProps) => base(p, <><path d="M2.5 4.5h11" /><path d="M6 4.5V3a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1.5" /><path d="M4 4.5l.6 8a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8" /><path d="M6.5 7v4M9.5 7v4" /></>)
export const Export = (p: IconProps) => base(p, <><path d="M8 10V2.5" /><path d="M5 5.5L8 2.5l3 3" /><path d="M3 9.5v3A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-3" /></>)
export const Back = (p: IconProps) => base(p, <><path d="M9.5 3.5L5 8l4.5 4.5" /></>)
export const Screen = (p: IconProps) => base(p, <><rect x="1.5" y="3" width="13" height="8.5" rx="1.5" /><path d="M5.5 14h5" /></>)
export const WindowIcon = (p: IconProps) => base(p, <><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2 6h12" /><circle cx="4.2" cy="4.3" r="0.6" fill="currentColor" stroke="none" /></>)
export const Region = (p: IconProps) => base(p, <><path d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5" /><path d="M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5" /><path d="M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11" /><path d="M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11" /><rect x="5.5" y="5.5" width="5" height="5" rx="0.5" strokeDasharray="1.5 1.5" /></>)
export const Mic = (p: IconProps) => base(p, <><rect x="5.5" y="1.5" width="5" height="8" rx="2.5" /><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" /><path d="M8 12v2.5" /></>)
export const Camera = (p: IconProps) => base(p, <><rect x="1.5" y="4" width="9" height="8" rx="1.5" /><path d="M10.5 7l4-2v6l-4-2" /></>)
export const Speaker = (p: IconProps) => base(p, <><path d="M2.5 6.5h2.5L8.5 3.5v9L5 9.5H2.5z" /><path d="M11 5.5a3.5 3.5 0 0 1 0 5" /><path d="M12.8 3.6a6 6 0 0 1 0 8.8" /></>)
export const Check = (p: IconProps) => base(p, <path d="M3 8.5l3 3 7-7" />)
export const X = (p: IconProps) => base(p, <path d="M4 4l8 8M12 4l-8 8" />)
export const Plus = (p: IconProps) => base(p, <path d="M8 3v10M3 8h10" />)
export const ZoomIn = (p: IconProps) => base(p, <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /><path d="M7 5v4M5 7h4" /></>)
export const ChevronDown = (p: IconProps) => base(p, <path d="M4 6l4 4 4-4" />)
export const ChevronRight = (p: IconProps) => base(p, <path d="M6 4l4 4-4 4" />)
export const ImageIcon = (p: IconProps) => base(p, <><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><circle cx="5.5" cy="6" r="1.2" /><path d="M14 10.5l-3.5-3.5L4 13" /></>)
export const Refresh = (p: IconProps) => base(p, <><path d="M13 8A5 5 0 1 1 11.5 4.5" /><path d="M11.5 2v2.8h2.8" /></>)
export const Warning = (p: IconProps) => base(p, <><path d="M8 2.5l6 10.5H2z" /><path d="M8 6.5v3" /><circle cx="8" cy="11.3" r="0.5" fill="currentColor" stroke="none" /></>)
export const Film = (p: IconProps) => base(p, <><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M5 2.5v11M11 2.5v11M2 5.5h3M2 8h3M2 10.5h3M11 5.5h3M11 8h3M11 10.5h3" /></>)
export const Eyedropper = (p: IconProps) => base(p, <><path d="M13.6 2.4a1.9 1.9 0 0 0-2.7 0L9.4 3.9l2.7 2.7 1.5-1.5a1.9 1.9 0 0 0 0-2.7z" /><path d="M10.7 5.2L4.3 11.6 2.6 14l2.4-1.7 6.4-6.4" /></>)
export const Scissors = (p: IconProps) => base(p, <><circle cx="4.5" cy="4.5" r="2" /><circle cx="4.5" cy="11.5" r="2" /><path d="M6.2 5.6L14 12.5M6.2 10.4L14 3.5" /></>)
export const ArrowIcon = (p: IconProps) => base(p, <><path d="M2.5 13.5L13 3" /><path d="M7 3h6v6" /></>)
export const BoxIcon = (p: IconProps) => base(p, <rect x="2.5" y="4" width="11" height="8" rx="1.8" />)
export const BlurIcon = (p: IconProps) => base(p, <><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11" /></>)
export const Undo = (p: IconProps) => base(p, <><path d="M6 4.5L3 7.5l3 3" /><path d="M3 7.5h6.5a3.5 3.5 0 0 1 0 7H8" /></>)
export const Redo = (p: IconProps) => base(p, <><path d="M10 4.5l3 3-3 3" /><path d="M13 7.5H6.5a3.5 3.5 0 0 0 0 7H8" /></>)
export const Dot = (p: IconProps) => base(p, <circle cx="8" cy="8" r="3" />, true)
export const Keyboard = (p: IconProps) => base(p, <><rect x="1.5" y="4" width="13" height="8" rx="1.5" /><path d="M4 7h1M6.5 7h1M9 7h1M11.5 7h1M5 9.5h6" /></>)
export const Smile = (p: IconProps) => base(p, <><circle cx="8" cy="8" r="6" /><path d="M5.5 9.5a3 3 0 0 0 5 0" /><circle cx="6" cy="6.5" r="0.6" fill="currentColor" stroke="none" /><circle cx="10" cy="6.5" r="0.6" fill="currentColor" stroke="none" /></>)
export const TextIcon = (p: IconProps) => base(p, <><path d="M3 4V2.5h10V4" /><path d="M8 2.5v11" /><path d="M6 13.5h4" /></>)
export const Copy = (p: IconProps) => base(p, <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H4A1.5 1.5 0 0 0 2.5 3.5v5A1.5 1.5 0 0 0 4 10h1.5" /></>)
export const Pin = (p: IconProps) => base(p, <><path d="M9.5 2.5l4 4-2 .5-2.5 2.5v3.5L6 10 3 13M6 10l-3-3 3.5-.5L9 4l.5-1.5z" /></>)
export const Snapshot = (p: IconProps) => base(p, <><rect x="2" y="3" width="12" height="10" rx="1.5" /><circle cx="8" cy="8" r="2.5" /><path d="M5 3l1-1.5h4L11 3" /></>)
export const Spinner = ({ size = 16, className = '', ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={`spin ${className}`} aria-hidden="true" {...rest}>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
    <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/** A speedometer: the clip speed control. */
export const Gauge = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" />
      <path d="M8 11.5l2.6-3.4" />
      <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
    </>
  )

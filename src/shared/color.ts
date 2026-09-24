/**
 * Colour conversions for the editor's colour picker. Hex is the stored form in
 * project.json, HSV is what the picker's square and hue slider work in.
 * Everything is pure so preview, export and the UI agree on what a colour is.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsv {
  /** Degrees, 0–360. */
  h: number
  /** 0–1. */
  s: number
  /** 0–1. */
  v: number
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n)
const byte = (n: number): number => clamp(Math.round(n), 0, 255)

/** `#rgb`, `rgb`, `#rrggbb` or `rrggbb` in any case → `#rrggbb`, or null. */
export function normalizeHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s}`.toLowerCase()
  return null
}

export function hexToRgb(hex: string): Rgb {
  const norm = normalizeHex(hex) ?? '#000000'
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16)
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => byte(n).toString(16).padStart(2, '0')).join('')}`
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = clamp(r, 0, 255) / 255
  const gn = clamp(g, 0, 255) / 255
  const bn = clamp(b, 0, 255) / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 1)
  const val = clamp(v, 0, 1)
  const c = val * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = val - c
  const i = Math.floor(hue / 60) % 6
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x]
  ][i]
  return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255) }
}

export function hexToHsv(hex: string): Hsv {
  return rgbToHsv(hexToRgb(hex))
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv))
}

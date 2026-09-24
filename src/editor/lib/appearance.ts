/** App chrome only. Never changes a recording's background or exported pixels. */
export const APPEARANCES = {
  charcoal: { label: 'Charcoal', colors: ['#101010', '#181818', '#202020', '#282828', '#323232', '#f2f2f2', '#b8b8b8', '#a3a3a3', '#d8913f', '#303030', '#525252'] },
  warm: { label: 'Warm graphite', colors: ['#1d2021', '#252827', '#2e302c', '#383b34', '#44463e', '#f4e9cd', '#c5bba5', '#b7ad98', '#e5b566', '#45473f', '#686a5f'] },
  midnight: { label: 'Midnight', colors: ['#161922', '#1d2230', '#252b3b', '#2d3548', '#384158', '#e2e8ff', '#b5bfdc', '#a5b0d0', '#94b6ff', '#394258', '#596985'] }
} as const
export type Appearance = keyof typeof APPEARANCES
export const APPEARANCE_KEY = 'screenpolish.appearance.v1'
export function appearanceOf(value: unknown): Appearance {
  return typeof value === 'string' && Object.hasOwn(APPEARANCES, value) ? value as Appearance : 'charcoal'
}
export function readAppearance(): Appearance {
  try { return appearanceOf(localStorage.getItem(APPEARANCE_KEY)) } catch { return 'charcoal' }
}
export function applyAppearance(value: Appearance): void {
  const keys = ['bg-0', 'bg-1', 'bg-2', 'bg-3', 'bg-4', 'fg', 'fg-muted', 'fg-dim', 'accent', 'line', 'line-strong']
  const colors = APPEARANCES[value].colors
  keys.forEach((key, i) => document.documentElement.style.setProperty(`--color-${key}`, colors[i]))
  document.documentElement.style.setProperty('--color-accent-hover', colors[8])
  document.documentElement.style.setProperty('--color-accent-soft', `${colors[8]}22`)
  document.documentElement.style.setProperty('--color-accent-fg', colors[0])
  document.documentElement.dataset.appearance = value
}

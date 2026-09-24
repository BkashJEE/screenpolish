import type { Crop } from './types'

const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 }

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * Normalize a project crop to a non-empty rectangle inside the source.
 * Missing, malformed, non-finite, or non-positive dimensions use full source.
 * Finite coordinates and dimensions are clamped so the rectangle stays in 0..1.
 */
export function normalizeCrop(raw: unknown): Crop {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...FULL_CROP }
  const value = raw as Record<string, unknown>
  const rawX = value.x
  const rawY = value.y
  const rawWidth = value.width
  const rawHeight = value.height
  if (!isFiniteNumber(rawX) || !isFiniteNumber(rawY) || !isFiniteNumber(rawWidth) || !isFiniteNumber(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return { ...FULL_CROP }
  }

  const x = clamp01(rawX)
  const y = clamp01(rawY)
  const width = Math.min(rawWidth, 1 - x)
  const height = Math.min(rawHeight, 1 - y)
  if (width <= 0 || height <= 0) return { ...FULL_CROP }
  return { x, y, width, height }
}

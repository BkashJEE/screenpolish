export interface OutputSize {
  width: number
  height: number
}

export interface FrameOffset {
  offsetX: number
  offsetY: number
}

/** Convert a pointer delta in output pixels into bounded frame offsets. */
export function frameOffsetFromDelta(
  delta: { x: number; y: number },
  origin: FrameOffset,
  output: OutputSize
): FrameOffset {
  const dx = output.width > 0 && Number.isFinite(output.width) ? delta.x / output.width : 0
  const dy = output.height > 0 && Number.isFinite(output.height) ? delta.y / output.height : 0
  return {
    offsetX: clampOffset(Number((origin.offsetX + (Number.isFinite(dx) ? dx : 0)).toFixed(12))),
    offsetY: clampOffset(Number((origin.offsetY + (Number.isFinite(dy) ? dy : 0)).toFixed(12)))
  }
}

const clampOffset = (value: number): number => Math.max(-0.5, Math.min(0.5, Number.isFinite(value) ? value : 0))

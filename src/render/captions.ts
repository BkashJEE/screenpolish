// Burns the current caption into the frame. Screen space, on top of
// everything, outside the camera: captions do not zoom with the content.

import { captionAt, wrapCaption, type CaptionSettings } from '../shared/captions'
import type { Ctx2D } from './render-frame'

/** Base text height as a fraction of the shorter output side, at size 1. */
export const CAPTION_BASE = 0.042
export const CAPTION_FONT = '"Instrument Sans"'

export function drawCaptions(ctx: Ctx2D, output: { width: number; height: number }, captions: CaptionSettings | undefined, tSec: number): void {
  if (!captions?.enabled || captions.cues.length === 0) return
  const cue = captionAt(tSec, captions.cues)
  if (!cue) return
  const minSide = Math.min(output.width, output.height)
  const fontPx = minSide * CAPTION_BASE * captions.size
  const lineHeight = fontPx * 1.25
  const padX = fontPx * 0.6
  const padY = fontPx * 0.32
  const maxText = output.width * 0.84 - padX * 2

  ctx.save()
  ctx.font = `600 ${fontPx}px ${CAPTION_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = wrapCaption(cue.text, maxText, (s) => ctx.measureText(s).width)
  if (lines.length === 0) {
    ctx.restore()
    return
  }
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const boxW = textWidth + padX * 2
  const boxH = lines.length * lineHeight + padY * 2
  const margin = output.height * 0.07
  const x = (output.width - boxW) / 2
  const y = captions.position === 'top' ? margin : output.height - margin - boxH

  ctx.fillStyle = 'rgba(8, 12, 16, 0.78)'
  const r = Math.min(fontPx * 0.35, boxH / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r)
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r)
  ctx.arcTo(x, y + boxH, x, y, r)
  ctx.arcTo(x, y, x + boxW, y, r)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  lines.forEach((line, i) => ctx.fillText(line, output.width / 2, y + padY + lineHeight * (i + 0.5)))
  ctx.restore()
}

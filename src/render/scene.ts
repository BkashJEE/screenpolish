// Paints one moment of a scene: the project's own background, a veil so the
// text reads on any wallpaper, then whatever sceneLayout placed. All the
// timing lives in shared/scenes.ts; nothing here decides when.

import type { Ctx2D } from '../shared/ctx2d'
import type { Project } from '../shared/types'
import { sceneLayout, type MeasureText, type Scene, type SceneElement } from '../shared/scenes'
import { drawBackground } from './render-frame'

export const SCENE_FONT = '"Instrument Sans"'

function fontFor(px: number, weight: number): string {
  return `${weight} ${Math.round(px)}px ${SCENE_FONT}`
}

/** Text widths from the context itself, so layout fits the font that is actually drawn. */
export function measureWith(ctx: Ctx2D): MeasureText {
  return (text, fontPx, weight) => {
    ctx.font = fontFor(fontPx, weight)
    return ctx.measureText(text).width
  }
}

function drawElement(ctx: Ctx2D, el: SceneElement, accent: string, bold: boolean): void {
  if (el.alpha <= 0.001) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, el.alpha)
  ctx.translate(el.x + el.dx, el.y + el.dy)
  if (el.scale !== 1) ctx.scale(el.scale, el.scale)
  ctx.textBaseline = 'middle'
  let x = 0
  if (el.role === 'step' && el.index !== undefined) {
    if (bold) {
      // Numbered badge in the accent colour, then the text beside it.
      const r = el.fontPx * 0.62
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(r, 0, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = fontFor(el.fontPx * 0.78, 700)
      ctx.textAlign = 'center'
      ctx.fillText(String(el.index), r, 0)
      x = r * 2 + el.fontPx * 0.6
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.font = fontFor(el.fontPx, 600)
      ctx.textAlign = 'left'
      const label = `${el.index}.`
      ctx.fillText(label, 0, 0)
      x = ctx.measureText('0.').width + el.fontPx * 0.5
    }
  }
  ctx.fillStyle = el.color
  ctx.font = fontFor(el.fontPx, el.weight)
  ctx.textAlign = el.align
  ctx.fillText(el.text, x, 0)
  ctx.restore()
}

/**
 * One frame of `scene`, `localSec` into it, filling `output`. The background
 * is the project's, so a card looks like part of the same video.
 */
export function drawScene(
  ctx: Ctx2D,
  output: { width: number; height: number },
  project: Pick<Project, 'background'>,
  scene: Scene,
  localSec: number,
  backgroundImage?: CanvasImageSource | null
): void {
  drawBackground(ctx, output, project.background, backgroundImage)
  const layout = sceneLayout(scene, localSec, output, measureWith(ctx))
  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = `rgba(0,0,0,${layout.scrim})`
  ctx.fillRect(0, 0, output.width, output.height)
  ctx.restore()

  const bar = layout.accentBar
  if (bar && bar.progress > 0 && bar.alpha > 0) {
    ctx.save()
    ctx.globalAlpha = bar.alpha
    ctx.fillStyle = bar.color
    // Wipes outward from the centre.
    const w = bar.width * bar.progress
    ctx.fillRect(bar.x + (bar.width - w) / 2, bar.y, w, bar.height)
    ctx.restore()
  }

  const accent = scene.accent ?? bar?.color ?? '#ff5a36'
  for (const el of layout.elements) drawElement(ctx, el, accent, scene.style === 'bold')
}

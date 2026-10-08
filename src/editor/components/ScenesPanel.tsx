import { useEffect, useRef, useState } from 'react'
import type { Project } from '../../shared/types'
import { SCENE_DEFAULT_ACCENT, SCENE_DEFAULT_SEC, SCENE_MAX_SEC, SCENE_MAX_STEPS, SCENE_MIN_SEC, normalizeScenes, type Scene, type SceneKind, type SceneStyle } from '../../shared/scenes'
import { drawScene } from '../../render/scene'
import { Button, ColorField, Row, Segmented, SliderField, TextInput } from './ui'

const PREVIEW_W = 320
const PREVIEW_H = 180

/** A new card, worded so it reads as an example rather than a finished title. */
function newScene(kind: SceneKind): Scene {
  return kind === 'intro'
    ? { id: crypto.randomUUID(), kind, style: 'bold', title: 'What this video shows', subtitle: 'In under a minute', durationSec: SCENE_DEFAULT_SEC }
    : { id: crypto.randomUUID(), kind, style: 'calm', title: 'Thanks for watching', durationSec: 2.5 }
}

/**
 * Intro and outro cards: add, edit and preview them. The preview plays the
 * card on a loop with the same drawing code the export uses, over this
 * project's background; the editor's own playback shows the recording only.
 */
export function ScenesPanel({ project, onProject }: { project: Project; onProject: (update: (p: Project) => Project) => void }) {
  const scenes = project.scenes ?? []
  const has = (kind: SceneKind) => scenes.some((s) => s.kind === kind)
  const write = (next: Scene[]) => onProject((p) => ({ ...p, scenes: normalizeScenes(next) }))
  const patch = (id: string, value: Partial<Scene>) => onProject((p) => ({ ...p, scenes: (p.scenes ?? []).map((s) => (s.id === id ? { ...s, ...value } : s)) }))
  const add = (kind: SceneKind) => {
    const card = newScene(kind)
    // Intros first, then outros, whichever was added first.
    write(kind === 'intro' ? [card, ...scenes] : [...scenes, card])
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-[1.45] text-fg-muted">
        A card before the recording or after it, in the export. Plan with an agent on the Capture screen to have one written for you.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => add('intro')} disabled={has('intro')}>
          Add intro
        </Button>
        <Button size="sm" onClick={() => add('outro')} disabled={has('outro')}>
          Add outro
        </Button>
      </div>
      {scenes.map((scene) => (
        <SceneEditor key={scene.id} scene={scene} project={project} onPatch={(v) => patch(scene.id, v)} onRemove={() => write(scenes.filter((s) => s.id !== scene.id))} />
      ))}
    </div>
  )
}

function SceneEditor({ scene, project, onPatch, onRemove }: { scene: Scene; project: Project; onPatch: (v: Partial<Scene>) => void; onRemove: () => void }) {
  // Steps are edited as lines; empty lines are kept while typing and dropped on save by normalizeScenes.
  const [stepsText, setStepsText] = useState((scene.steps ?? []).join('\n'))
  useEffect(() => {
    setStepsText((current) => (current.split('\n').map((l) => l.trim()).filter(Boolean).join('\n') === (scene.steps ?? []).join('\n') ? current : (scene.steps ?? []).join('\n')))
  }, [scene.steps])

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-dim">{scene.kind === 'intro' ? 'Intro' : 'Outro'}</span>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <ScenePreview scene={scene} project={project} />
      <TextInput aria-label="Card title" placeholder="Title" value={scene.title} maxLength={140} onChange={(e) => onPatch({ title: e.target.value })} />
      <TextInput aria-label="Card subtitle" placeholder="A line under it (optional)" value={scene.subtitle ?? ''} maxLength={140} onChange={(e) => onPatch({ subtitle: e.target.value || undefined })} />
      <textarea
        aria-label="Card steps"
        className="min-h-[52px] resize-y rounded-[7px] border border-line-strong bg-bg-1 px-2.5 py-1.5 text-[12.5px] text-fg placeholder:text-fg-dim focus:border-accent"
        style={{ userSelect: 'text' }}
        placeholder={`Steps, one per line (up to ${SCENE_MAX_STEPS}, optional)`}
        value={stepsText}
        onChange={(e) => {
          setStepsText(e.target.value)
          const steps = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, SCENE_MAX_STEPS)
          onPatch({ steps: steps.length ? steps : undefined })
        }}
      />
      <Row label="Style">
        <Segmented<SceneStyle>
          value={scene.style}
          onChange={(style) => onPatch({ style })}
          options={[
            { value: 'calm', label: 'Calm' },
            { value: 'bold', label: 'Bold' }
          ]}
        />
      </Row>
      <SliderField label="Length" value={scene.durationSec} min={SCENE_MIN_SEC} max={SCENE_MAX_SEC} step={0.5} onChange={(durationSec) => onPatch({ durationSec })} format={(v) => `${v.toFixed(1)} s`} />
      {scene.style === 'bold' && (
        <Row label="Accent">
          <ColorField value={scene.accent ?? SCENE_DEFAULT_ACCENT} onChange={(accent) => onPatch({ accent })} />
        </Row>
      )}
    </div>
  )
}

/** The card on a loop, drawn exactly as the export draws it. */
function ScenePreview({ scene, project }: { scene: Scene; project: Project }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ scene, project })
  latest.current = { scene, project }

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    let frame = 0
    const started = performance.now()
    const draw = (now: number) => {
      const { scene: s, project: p } = latest.current
      // A short rest after each run, so the settled card can be read.
      const loop = s.durationSec + 0.8
      const t = Math.min(s.durationSec - 0.001, ((now - started) / 1000) % loop)
      // The project background without its image (images load in the main preview).
      drawScene(ctx, { width: PREVIEW_W, height: PREVIEW_H }, { background: p.background.kind === 'image' ? { ...p.background, kind: 'solid' } : p.background }, s, t)
      frame = requestAnimationFrame(draw)
    }
    void document.fonts.ready.then(() => {
      frame = requestAnimationFrame(draw)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvas} width={PREVIEW_W} height={PREVIEW_H} className="w-full rounded-[8px] border border-line" aria-label={`${scene.kind} card preview`} />
}

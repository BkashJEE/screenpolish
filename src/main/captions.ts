/**
 * Local transcription for captions: whisper.cpp with the English base model.
 *
 * Both ship with the app (vendor/whisper, fetched and checksummed by
 * scripts/fetch-whisper.sh, packaged as resources/whisper). Nothing is sent
 * anywhere: the audio is converted to 16 kHz mono WAV with the bundled ffmpeg,
 * handed to whisper-cli, and its JSON is read back as caption cues.
 */

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CAPTION_LINE_CHARS, cuesFromWhisperJson, type CaptionCue } from '../shared/captions'

export const WHISPER_MODEL_FILE = 'ggml-base.en.bin'

export interface WhisperFiles {
  bin: string
  model: string
}

/** Where the bundled whisper-cli and model live, packaged or in a dev checkout. */
export function whisperFiles(opts: { isPackaged: boolean; resourcesPath: string; appPath: string; platform: NodeJS.Platform }): WhisperFiles {
  const dir = opts.isPackaged ? path.join(opts.resourcesPath, 'whisper') : path.join(opts.appPath, 'vendor', 'whisper')
  return { bin: path.join(dir, opts.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'), model: path.join(dir, WHISPER_MODEL_FILE) }
}

/** Why captions cannot run, or null when both files are in place. */
export function whisperMissing(files: WhisperFiles, exists: (p: string) => boolean = fs.existsSync): string | null {
  if (!exists(files.bin)) return `The speech engine is missing (${files.bin}). Run scripts/fetch-whisper.sh and rebuild.`
  if (!exists(files.model)) return `The speech model is missing (${files.model}). Run scripts/fetch-whisper.sh and rebuild.`
  return null
}

/** Leave a couple of cores for the editor; whisper gains little past eight. */
export function whisperThreads(cores: number = os.availableParallelism()): number {
  return Math.max(1, Math.min(8, cores - 2))
}

export function whisperArgs(files: WhisperFiles, wav: string, outBase: string, threads: number): string[] {
  return ['-m', files.model, '-f', wav, '-t', String(threads), '-l', 'en', '-oj', '-of', outBase, '-np', '-pp', '-ml', String(CAPTION_LINE_CHARS), '-sow']
}

/** Percent from a whisper-cli progress line on stderr, e.g. "... progress =  45%". */
export function parseWhisperProgress(line: string): number | null {
  const m = /progress\s*=\s*(\d+)%/.exec(line)
  return m ? Math.min(100, Number(m[1])) : null
}

function run(bin: string, args: string[], onStderr?: (text: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let tail = ''
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      tail = (tail + text).slice(-2000)
      onStderr?.(text)
    })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(bin)} exited with ${code}: ${tail.trim().split('\n').slice(-3).join(' ')}`))))
  })
}

/**
 * Transcribe one of a recording's audio tracks. `onProgress` gets 0..1.
 * Throws with a message fit to show when the track is empty or unreadable.
 */
export async function transcribe(opts: {
  audioFile: string
  ffmpeg: string
  whisper: WhisperFiles
  onProgress?: (fraction: number) => void
}): Promise<CaptionCue[]> {
  const missing = whisperMissing(opts.whisper)
  if (missing) throw new Error(missing)
  const stat = await fs.promises.stat(opts.audioFile).catch(() => null)
  // An audio track that never received a sample is a bare MP4 header.
  if (!stat || stat.size < 1024) throw new Error('That audio track is empty, so there is nothing to transcribe.')

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'polish-captions-'))
  try {
    const wav = path.join(dir, 'audio.wav')
    opts.onProgress?.(0)
    await run(opts.ffmpeg, ['-nostdin', '-loglevel', 'error', '-y', '-i', opts.audioFile, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav])
    const outBase = path.join(dir, 'captions')
    await run(opts.whisper.bin, whisperArgs(opts.whisper, wav, outBase, whisperThreads()), (text) => {
      for (const line of text.split('\n')) {
        const pct = parseWhisperProgress(line)
        if (pct !== null) opts.onProgress?.(pct / 100)
      }
    })
    const json = JSON.parse(await fs.promises.readFile(`${outBase}.json`, 'utf8'))
    opts.onProgress?.(1)
    return cuesFromWhisperJson(json)
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

// Dev-only end-to-end check: `POLISH_SELFTEST=1 npm run dev` records the
// primary display for ~5 s while wiggling the mouse, then prints what landed
// on disk and quits. Never runs in a packaged build.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { app, net, screen } from 'electron'
import type { RecordingEvents } from '@shared/types'
import { mouseWiggler } from './win/mouse-wiggler'
import { durationOf } from './duration'
import { listRecordings, loadProject } from './ipc'
import { recordingsRoot } from './media-protocol'
import type { RecordingSession } from './recording-session'

const RECORD_MS = 5000

const micSelfTestRequested = (): boolean => process.env.POLISH_SELFTEST_MIC === '1'

export function selfTestRequested(): boolean {
  return !app.isPackaged && process.env.POLISH_SELFTEST === '1'
}

export async function runSelfTest(session: RecordingSession): Promise<void> {
  const log = (...args: unknown[]): void => console.log('[selftest]', ...args)
  let exitCode = 0
  try {
    const display = screen.getPrimaryDisplay()
    log('starting recording on display', display.id, display.size, 'x', display.scaleFactor)
    const finished = new Promise<string>((resolve) => {
      session.onFinished = (folder) => resolve(folder)
    })
    session.onError = (message) => {
      console.error('[selftest] session error:', message)
    }
    const withMic = micSelfTestRequested()
    const region = process.env.POLISH_SELFTEST_REGION ? { x: 200, y: 200, width: 1280, height: 720, scale: 1 } : null
    await session.start({ source: region ? { kind: 'region', displayId: display.id, region } : { kind: 'screen', displayId: display.id }, mic: withMic ? { deviceId: 'default' } : null, system: true, webcam: process.env.POLISH_SELFTEST_WEBCAM ? { deviceId: 'default' } : null, fps: 30 })
    log('recording; state =', JSON.stringify(session.state))
    const stopWiggle = mouseWiggler()
    await new Promise((r) => setTimeout(r, RECORD_MS))
    stopWiggle()
    log('stopping')
    await session.stop()
    const folder = await Promise.race([finished, new Promise<string>((_, rej) => setTimeout(() => rej(new Error('no onFinished')), 15000))])
    log('folder', folder)

    const files = fs.readdirSync(folder).map((name) => {
      const size = fs.statSync(path.join(folder, name)).size
      return `${name} (${size} bytes)`
    })
    log('files:', files.join(', '))
    const events = JSON.parse(fs.readFileSync(path.join(folder, 'events.json'), 'utf8')) as RecordingEvents
    log(
      `events: pointer=${events.pointer.length} clicks=${events.clicks.length} wheel=${events.wheel.length} keys=${events.keys.length} region=${JSON.stringify(events.region)}`
    )
    const duration = await durationOf(path.join(folder, 'screen.mp4'))
    log('screen.mp4 duration (mediabunny):', duration)
    const micPath = path.join(folder, 'mic.mp4')
    const micSize = fs.existsSync(micPath) ? fs.statSync(micPath).size : 0
    const micDuration = micSize > 0 ? await durationOf(micPath) : null
    if (withMic) log(`mic.mp4: ${micSize} bytes; duration (mediabunny):`, micDuration)

    // Editor-facing IPC paths, called directly.
    const loaded = await loadProject(recordingsRoot(), folder)
    log('loadProject urls:', JSON.stringify(loaded.urls), 'project.version', loaded.project.version)
    const list = await listRecordings(recordingsRoot(), durationOf)
    log(`listRecordings: ${list.length} entries; newest = ${list[0]?.name} (${list[0]?.durationSec}s)`)

    // polish:// with a Range header through Chromium's network stack.
    const full = await net.fetch(loaded.urls.screen, { method: 'HEAD' })
    const partial = await net.fetch(loaded.urls.screen, { headers: { Range: 'bytes=100-199' } })
    const partialBytes = (await partial.arrayBuffer()).byteLength
    log(
      `polish:// HEAD ${full.status} len=${full.headers.get('content-length')} type=${full.headers.get('content-type')}; ` +
        `Range 100-199 -> ${partial.status} ${partial.headers.get('content-range')} got=${partialBytes} bytes`
    )
    const bad = await net.fetch(loaded.urls.screen.replace(/\/screen\.mp4$/, '/..%2F..%2Fsecret'))
    log(`polish:// traversal -> ${bad.status}`)

    const ok =
      duration !== null &&
      duration > 3 &&
      events.pointer.length > 50 &&
      full.status === 200 &&
      partial.status === 206 &&
      partialBytes === 100 &&
      bad.status === 404 &&
      list.length > 0 &&
      (!withMic || (micSize > 1_000 && micDuration !== null && micDuration > 3))
    log(ok ? 'RESULT: PASS' : 'RESULT: FAIL')
    if (!ok) exitCode = 2
  } catch (err) {
    console.error('[selftest] failed', err)
    exitCode = 1
  }
  setTimeout(() => app.exit(exitCode), 500)
}

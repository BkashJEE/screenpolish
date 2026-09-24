// Run with Node so invalid options are rejected before Electron starts.
const { spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

if (process.argv.length > 2) {
  console.error('Usage: npm run probe:codecs (no flags). Headless Electron crashes on this machine; this probe uses the desktop session.')
  process.exit(2)
}
if (!process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) {
  console.error('Run this probe from the logged-in desktop session. Do not add headless flags.')
  process.exit(2)
}

const profile = mkdtempSync(path.join(tmpdir(), 'screenpolish-codec-probe-'))
try {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [
    `--user-data-dir=${profile}`,
    path.join(__dirname, 'codec-probe', 'main.cjs')
  ], { env, stdio: 'inherit', timeout: 45000, killSignal: 'SIGKILL' })
  if (result.error) console.error(result.error.message)
  if (result.signal) console.error(`Codec probe terminated with ${result.signal}`)
  process.exitCode = result.status ?? 1
} finally {
  rmSync(profile, { recursive: true, force: true })
}

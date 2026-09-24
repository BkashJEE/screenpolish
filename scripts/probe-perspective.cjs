// Desktop-only deterministic render probe. Never pass headless Electron flags.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
if (!process.versions.electron) {
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error('A desktop display is required')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenpolish-perspective-'))
  require('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'probe-perspective.ts')], outfile: path.join(dir, 'probe.js'), bundle: true, platform: 'browser', format: 'iife' })
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><script src="probe.js"></script>')
  const run = require('node:child_process').spawnSync(require('electron'), [__filename, dir], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })
  process.exit(run.status ?? 1)
}
const { app, BrowserWindow } = require('electron')
const dir = process.argv[2]
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: { backgroundThrottling: false } })
  await win.loadFile(path.join(dir, 'index.html'))
  const result = await win.webContents.executeJavaScript('window.probePerspective()')
  for (const [name, data] of Object.entries(result.images)) fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(data.split(',')[1], 'base64'))
  delete result.images
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(result.project, null, 2))
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(result.events, null, 2))
  delete result.project
  delete result.events
  console.log(JSON.stringify({ dir, ...result }, null, 2))
  app.exit(result.ok ? 0 : 1)
}).catch((error) => { console.error(error); app.exit(1) })

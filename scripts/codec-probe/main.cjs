const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const deadline = setTimeout(() => {
  console.error('Codec probe timed out.')
  app.exit(1)
}, 30000)

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false })
  // A local page exposes WebCodecs; the original data: page did not.
  await window.loadFile(path.join(__dirname, 'index.html'))
  const results = await window.webContents.executeJavaScript(`(async () => {
    if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs VideoEncoder is unavailable')
    const rows = []
    const cases = [[1920,1080,30,8e6],[1920,1080,60,25.6e6],[1920,1080,60,12.8e6],[2560,1440,60,44.8e6],[3840,2160,60,89.6e6],[3840,2160,30,28e6],[1080,1920,60,25e6],[1080,1080,30,4.5e6]]
    for (const [width,height,framerate,bitrate] of cases) {
      for (const codec of ['avc1.640028','avc1.42001f','vp09.00.10.08']) {
        for (const hardwareAcceleration of ['prefer-hardware','prefer-software','no-preference']) {
          const config = { codec, width, height, framerate, bitrate, hardwareAcceleration }
          try {
            const { supported } = await VideoEncoder.isConfigSupported(config)
            rows.push({ ...config, supported })
          } catch (error) {
            rows.push({ ...config, error: error.message })
          }
        }
      }
    }
    return rows
  })()`)
  console.log(JSON.stringify(results, null, 2))
  clearTimeout(deadline)
  app.quit()
}).catch(error => {
  console.error(error)
  clearTimeout(deadline)
  app.exit(1)
})

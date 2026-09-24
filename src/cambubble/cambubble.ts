// Live camera bubble shown while recording. It only previews: the webcam is
// recorded by the capture host, and the bubble window is excluded from screen
// capture by main (setContentProtection), so it never lands in the video.
//
// The device id arrives on the query string; 'default' means the OS default.

const params = new URLSearchParams(location.search)
const deviceId = params.get('device') ?? 'default'
const shape = params.get('shape') === 'square' ? 'square' : 'round'

const video = document.getElementById('cam') as HTMLVideoElement
const status = document.getElementById('status') as HTMLDivElement
const bubble = document.getElementById('bubble') as HTMLDivElement
if (shape === 'square') bubble.classList.add('square')

async function open(): Promise<void> {
  const exact = deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}
  const attempts: MediaStreamConstraints[] = [
    { video: { ...exact, width: { ideal: 640 }, height: { ideal: 640 } } },
    { video: true }
  ]
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      video.srcObject = stream
      status.textContent = ''
      return
    } catch (err) {
      console.warn('[cambubble] getUserMedia failed', err)
    }
  }
  status.textContent = 'No camera'
}

void open()

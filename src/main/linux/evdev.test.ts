import { describe, expect, it } from 'vitest'
import {
  BTN_LEFT,
  BTN_MIDDLE,
  BTN_RIGHT,
  EVENT_SIZE,
  EV_KEY,
  EV_REL,
  REL_WHEEL,
  decodeEvents,
  eventNodesFrom,
  keyStateFromEvdev,
  mapEvdevButton,
  wheelDyFromEvdev
} from './evdev'

/** Build one 24-byte struct input_event the way the kernel writes it. */
function event(type: number, code: number, value: number): Buffer {
  const buf = Buffer.alloc(EVENT_SIZE)
  buf.writeBigInt64LE(1n, 0) // tv_sec
  buf.writeBigInt64LE(2n, 8) // tv_usec
  buf.writeUInt16LE(type, 16)
  buf.writeUInt16LE(code, 18)
  buf.writeInt32LE(value, 20)
  return buf
}

describe('decodeEvents', () => {
  it('decodes whole events', () => {
    const buf = Buffer.concat([event(EV_KEY, BTN_LEFT, 1), event(EV_REL, REL_WHEEL, -1)])
    const { events, rest } = decodeEvents(buf)
    expect(events).toEqual([
      { type: EV_KEY, code: BTN_LEFT, value: 1 },
      { type: EV_REL, code: REL_WHEEL, value: -1 }
    ])
    expect(rest.length).toBe(0)
  })

  it('keeps a trailing partial struct for the next read', () => {
    const whole = event(EV_KEY, BTN_RIGHT, 1)
    const buf = Buffer.concat([whole, whole.subarray(0, 7)])
    const { events, rest } = decodeEvents(buf)
    expect(events).toHaveLength(1)
    expect(rest.length).toBe(7)
  })

  it('returns nothing when the buffer is shorter than one event', () => {
    const { events, rest } = decodeEvents(Buffer.alloc(10))
    expect(events).toEqual([])
    expect(rest.length).toBe(10)
  })

  it('reads a negative value as signed', () => {
    const { events } = decodeEvents(event(EV_REL, REL_WHEEL, -3))
    expect(events[0].value).toBe(-3)
  })
})

describe('mapEvdevButton', () => {
  it('maps the three buttons the recorder knows', () => {
    expect(mapEvdevButton(BTN_LEFT)).toBe('left')
    expect(mapEvdevButton(BTN_RIGHT)).toBe('right')
    expect(mapEvdevButton(BTN_MIDDLE)).toBe('middle')
  })

  it('ignores side buttons and keyboard keys', () => {
    expect(mapEvdevButton(0x113)).toBeNull()
    expect(mapEvdevButton(30)).toBeNull()
  })
})

describe('wheelDyFromEvdev', () => {
  it('flips the sign: evdev +1 is scroll up, dy positive is scroll down', () => {
    expect(wheelDyFromEvdev(REL_WHEEL, 1)).toBe(-1)
    expect(wheelDyFromEvdev(REL_WHEEL, -2)).toBe(2)
  })

  it('ignores other relative axes and no-op values', () => {
    expect(wheelDyFromEvdev(0x00, 1)).toBe(0) // REL_X
    expect(wheelDyFromEvdev(REL_WHEEL, 0)).toBe(0)
    expect(wheelDyFromEvdev(REL_WHEEL, Number.NaN)).toBe(0)
  })
})

describe('keyStateFromEvdev', () => {
  it('treats autorepeat as neither a press nor a release', () => {
    expect(keyStateFromEvdev(1)).toEqual({ down: true })
    expect(keyStateFromEvdev(0)).toEqual({ down: false })
    expect(keyStateFromEvdev(2)).toBeNull()
  })
})

describe('eventNodesFrom', () => {
  const procDevices = `I: Bus=0019 Vendor=0000 Product=0001 Version=0000
N: Name="Power Button"
H: Handlers=kbd event0
B: EV=3

I: Bus=0003 Vendor=046d Product=c52b Version=0111
N: Name="Logitech USB Receiver Mouse"
H: Handlers=mouse0 event3
B: EV=17

I: Bus=0011 Vendor=0001 Product=0001 Version=ab41
N: Name="AT Translated Set 2 keyboard"
H: Handlers=sysrq kbd event4
B: EV=120013

I: Bus=0003 Vendor=1532 Product=0084 Version=0111
N: Name="Razer Mouse"
H: Handlers=mouse1 event5
B: EV=17
`

  it('finds mouse event nodes', () => {
    expect(eventNodesFrom(procDevices, ['mouse'])).toEqual(['/dev/input/event3', '/dev/input/event5'])
  })

  it('finds keyboards separately, so mice can be opened without them', () => {
    expect(eventNodesFrom(procDevices, ['kbd'])).toEqual(['/dev/input/event0', '/dev/input/event4'])
  })

  it('collapses duplicates and survives an empty or malformed file', () => {
    expect(eventNodesFrom('', ['mouse'])).toEqual([])
    expect(eventNodesFrom('nonsense\n\nmore nonsense', ['mouse'])).toEqual([])
    const twice = `${procDevices}\n${procDevices}`
    expect(eventNodesFrom(twice, ['mouse'])).toEqual(['/dev/input/event3', '/dev/input/event5'])
  })

  it('skips a device that has a handler but no event node', () => {
    expect(eventNodesFrom('H: Handlers=mouse2\nB: EV=17', ['mouse'])).toEqual([])
  })
})

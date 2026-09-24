/**
 * Pure Linux evdev decoding. No I/O here, so every rule below is unit-tested.
 *
 * A kernel `struct input_event` on 64-bit Linux is 24 bytes: `struct timeval`
 * (two 64-bit fields), then `__u16 type`, `__u16 code`, `__s32 value`. We read
 * the kernel's own timestamps only to keep the layout honest — the recorder
 * stamps events with its own clock so they line up with the video.
 */

import type { MouseButton } from '@shared/types'

/** sizeof(struct input_event) on a 64-bit kernel. */
export const EVENT_SIZE = 24

export const EV_KEY = 0x01
export const EV_REL = 0x02

/** linux/input-event-codes.h */
export const BTN_LEFT = 0x110
export const BTN_RIGHT = 0x111
export const BTN_MIDDLE = 0x112
export const REL_WHEEL = 0x08

export interface EvdevEvent {
  type: number
  code: number
  value: number
}

/**
 * Decode whole events from a read buffer. A read can end mid-struct, so the
 * trailing partial bytes are returned in `rest` for the next read to prepend.
 */
export function decodeEvents(buffer: Buffer): { events: EvdevEvent[]; rest: Buffer } {
  const events: EvdevEvent[] = []
  let offset = 0
  while (buffer.length - offset >= EVENT_SIZE) {
    events.push({
      type: buffer.readUInt16LE(offset + 16),
      code: buffer.readUInt16LE(offset + 18),
      value: buffer.readInt32LE(offset + 20)
    })
    offset += EVENT_SIZE
  }
  return { events, rest: buffer.subarray(offset) }
}

/** Mouse button codes -> the recorder's button names. Anything else is ignored. */
export function mapEvdevButton(code: number): MouseButton | null {
  switch (code) {
    case BTN_LEFT:
      return 'left'
    case BTN_RIGHT:
      return 'right'
    case BTN_MIDDLE:
      return 'middle'
    default:
      return null
  }
}

/**
 * Wheel notches -> dy in the recorder's convention, where positive is scrolling
 * DOWN. evdev reports +1 for a notch away from the user, so the sign flips.
 */
export function wheelDyFromEvdev(code: number, value: number): number {
  if (code !== REL_WHEEL || !Number.isFinite(value) || value === 0) return 0
  return -value
}

/** evdev key value: 1 = press, 2 = autorepeat, 0 = release. Repeats are not new presses. */
export function keyStateFromEvdev(value: number): { down: boolean } | null {
  if (value === 1) return { down: true }
  if (value === 0) return { down: false }
  return null
}

export type DeviceKind = 'mouse' | 'kbd'

/**
 * Event nodes to open, parsed from /proc/bus/input/devices. Blocks are separated
 * by blank lines and name their handlers, e.g.
 *
 *   H: Handlers=mouse0 event3
 *
 * A device is taken when it exposes a handler of a requested kind AND an
 * `eventN` node to read from. Duplicates are collapsed; order is preserved.
 */
export function eventNodesFrom(procDevices: string, kinds: readonly DeviceKind[]): string[] {
  const wanted = new Set(kinds)
  const out: string[] = []
  const seen = new Set<string>()
  for (const block of procDevices.split(/\n\s*\n/)) {
    const line = block.split('\n').find((l) => l.startsWith('H: Handlers='))
    if (!line) continue
    const handlers = line.slice('H: Handlers='.length).trim().split(/\s+/)
    const kindMatch = handlers.some((h) => (wanted.has('mouse') && /^mouse\d+$/.test(h)) || (wanted.has('kbd') && /^kbd$/.test(h)))
    if (!kindMatch) continue
    const node = handlers.find((h) => /^event\d+$/.test(h))
    if (!node || seen.has(node)) continue
    seen.add(node)
    out.push(`/dev/input/${node}`)
  }
  return out
}

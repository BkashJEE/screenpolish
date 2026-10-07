import { describe, expect, it } from 'vitest'
import { waitForFinishedClip } from './replay'

/**
 * A directory where a clip appears and then grows, the way gsr writes one:
 * the file exists from the first poll and reaches its final size later.
 */
function growing(sizes: number[], appearsAtPoll = 0) {
  let poll = 0
  return {
    io: {
      list: () => (poll >= appearsAtPoll ? ['/r/Replays/clip.mp4'] : []),
      size: () => sizes[Math.min(poll - appearsAtPoll, sizes.length - 1)] ?? -1,
      sleep: async () => { poll += 1 }
    },
    polls: () => poll
  }
}

const fast = { timeoutMs: 5_000, pollMs: 0 }

describe('waitForFinishedClip', () => {
  it('does not return a clip while it is still being written', async () => {
    // Growing for four polls, then steady. Returning on first sight - what the
    // fixed sleep effectively did - would hand back the 1 MB version.
    const dir = growing([1_000_000, 8_000_000, 20_000_000, 40_000_000, 40_000_000, 40_000_000])
    const clip = await waitForFinishedClip('/r/Replays', new Set(), fast, dir.io)
    expect(clip).toBe('/r/Replays/clip.mp4')
    // It only returned once the size had stopped moving.
    expect(dir.polls()).toBeGreaterThanOrEqual(5)
  })

  it('waits for the file to appear at all before judging its size', async () => {
    const dir = growing([500, 500, 500], 3)
    expect(await waitForFinishedClip('/r/Replays', new Set(), fast, dir.io)).toBe('/r/Replays/clip.mp4')
  })

  it('ignores clips that were already there before the save', async () => {
    const io = {
      list: () => ['/r/Replays/old.mp4'],
      size: () => 999,
      sleep: async () => undefined
    }
    expect(await waitForFinishedClip('/r/Replays', new Set(['/r/Replays/old.mp4']), { timeoutMs: 30, pollMs: 0 }, io)).toBeNull()
  })

  it('does not treat an empty file as finished, however long it stays empty', async () => {
    const dir = growing([0, 0, 0, 0, 0, 0, 0, 0])
    // Times out still at zero bytes; it is named, because it exists, but it was
    // never accepted as settled.
    const clip = await waitForFinishedClip('/r/Replays', new Set(), { timeoutMs: 30, pollMs: 0 }, dir.io)
    expect(clip).toBe('/r/Replays/clip.mp4')
  })

  it('reports nothing when no clip ever appears', async () => {
    const io = { list: () => [] as string[], size: () => -1, sleep: async () => undefined }
    expect(await waitForFinishedClip('/r/Replays', new Set(), { timeoutMs: 30, pollMs: 0 }, io)).toBeNull()
  })
})

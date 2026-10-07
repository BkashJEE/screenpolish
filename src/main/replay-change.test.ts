import { describe, expect, it } from 'vitest'
import { ReplayBuffer } from './replay'

describe('ReplayBuffer announces changes', () => {
  it('tells its listener when it stops, so the tray stops offering Save', async () => {
    const buffer = new ReplayBuffer()
    let changes = 0
    buffer.onChange = () => { changes += 1 }
    await buffer.stop()
    expect(changes).toBe(1)
    expect(buffer.running).toBe(false)
  })

  it('is safe with no listener at all', async () => {
    await expect(new ReplayBuffer().stop()).resolves.toMatchObject({ running: false })
  })
})

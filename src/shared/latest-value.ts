/** Replay the latest navigation intent when the renderer subscribes after load. */
export function latestValue<T>() {
  let present = false
  let value: T
  const listeners = new Set<(value: T) => void>()
  return {
    publish(next: T): void {
      present = true
      value = next
      for (const listener of listeners) listener(next)
    },
    subscribe(listener: (value: T) => void): () => void {
      listeners.add(listener)
      if (present) listener(value)
      return () => { listeners.delete(listener) }
    }
  }
}

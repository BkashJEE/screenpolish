import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { assertInsideRoot } from './export-sink'

describe('assertInsideRoot', () => {
  const root = path.resolve('C:/Users/x/Videos/Polish')

  it('accepts subfolders and normalizes', () => {
    expect(assertInsideRoot(root, path.join(root, '2026-09-01_00-00-00'))).toBe(path.join(root, '2026-09-01_00-00-00'))
    expect(assertInsideRoot(root, path.join(root, 'a', '..', 'b'))).toBe(path.join(root, 'b'))
  })

  it('rejects the root itself, siblings and traversal', () => {
    expect(() => assertInsideRoot(root, root)).toThrow()
    expect(() => assertInsideRoot(root, path.join(root, '..', 'Polish2', 'x'))).toThrow()
    expect(() => assertInsideRoot(root, path.join(root, 'x', '..', '..', 'y'))).toThrow()
    expect(() => assertInsideRoot(root, 'C:/Windows')).toThrow()
  })
})

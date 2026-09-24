import { describe, expect, it } from 'vitest'
import knobs from './Knobs.tsx?raw'
import { INSPECTOR_TABS, inspectorTabCss } from '../lib/inspector-tabs'

// The inspector shows a section only when a tab lists it. Cuts, Speed regions
// and Editor feel once shipped on no list, so they never appeared.

/** Titles of every <Section> in Knobs, plus the wrapper sections it renders directly. */
function sectionTitles(): string[] {
  const titles = [...knobs.matchAll(/<Section\s+title="([^"]+)"/g)].map((m) => m[1])
  const wrappers = [...knobs.matchAll(/<div data-section="([^"]+)"/g)].map((m) => m[1])
  return [...new Set([...titles, ...wrappers])]
}

const listed = INSPECTOR_TABS.flatMap((tab) => [...tab.sections]) as string[]

describe('inspector tabs', () => {
  it('finds the sections it is checking', () => {
    expect(sectionTitles()).toEqual(expect.arrayContaining(['Layout', 'Cuts', 'Speed regions', 'Zoom', 'Audio', 'Layers', 'Editor feel']))
  })

  it('puts every section in Knobs on a tab', () => {
    expect(sectionTitles().filter((t) => !listed.includes(t))).toEqual([])
  })

  it('puts no section on two tabs, and lists no section that does not exist', () => {
    expect(listed.filter((s, i) => listed.indexOf(s) !== i)).toEqual([])
    expect(listed.filter((s) => !sectionTitles().includes(s))).toEqual([])
  })

  it('generates a rule per tab that shows exactly its sections', () => {
    const css = inspectorTabCss()
    expect(css).toContain('.studio-inspector-groups > [data-section] { display: none; }')
    for (const tab of INSPECTOR_TABS) {
      const rule = css.split('\n').find((line) => line.includes(`[data-panel="${tab.id}"]`))
      expect(rule).toBeDefined()
      for (const section of tab.sections) expect(rule).toContain(`[data-section="${section}"]`)
    }
  })
})

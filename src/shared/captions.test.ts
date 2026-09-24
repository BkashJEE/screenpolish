import { describe, expect, it } from 'vitest'
import { captionAt, cuesFromWhisperJson, editCue, isNonSpeech, normalizeCaptions, wrapCaption } from './captions'

// What whisper-cli -oj -ml 42 -sow wrote for its own jfk.wav sample.
const jfk = {
  transcription: [
    { offsets: { from: 0, to: 5410 }, text: ' And so my fellow Americans, ask not what' },
    { offsets: { from: 5410, to: 9040 }, text: ' your country can do for you, ask what you' },
    { offsets: { from: 9040, to: 11000 }, text: ' can do for your country.' }
  ]
}

describe('cuesFromWhisperJson', () => {
  it('turns whisper segments into cues in seconds, trimmed', () => {
    const cues = cuesFromWhisperJson(jfk)
    expect(cues.map((c) => [c.start, c.end, c.text])).toEqual([
      [0, 5.41, 'And so my fellow Americans, ask not what'],
      [5.41, 9.04, 'your country can do for you, ask what you'],
      [9.04, 11, 'can do for your country.']
    ])
    expect(new Set(cues.map((c) => c.id)).size).toBe(3)
  })

  it('drops what whisper marks as not speech, and anything malformed', () => {
    const cues = cuesFromWhisperJson({
      transcription: [
        { offsets: { from: 0, to: 1000 }, text: ' [BLANK_AUDIO]' },
        { offsets: { from: 1000, to: 2000 }, text: ' (keyboard clicking)' },
        { offsets: { from: 2000, to: 3000 }, text: 'Hello.' },
        { offsets: { from: 3000, to: 3000 }, text: 'zero length' },
        { offsets: {}, text: 'no times' },
        null
      ]
    })
    expect(cues.map((c) => c.text)).toEqual(['Hello.'])
    expect(cuesFromWhisperJson(null)).toEqual([])
    expect(cuesFromWhisperJson({ transcription: 'nope' })).toEqual([])
  })

  it('does not mistake speech with brackets inside for a tag', () => {
    expect(isNonSpeech('Open the [settings] menu')).toBe(false)
    expect(isNonSpeech('[Music]')).toBe(true)
  })
})

describe('captionAt', () => {
  const cues = cuesFromWhisperJson(jfk)
  it('shows the cue covering the time, and nothing between or after', () => {
    expect(captionAt(0, cues)?.text).toMatch(/^And so/)
    expect(captionAt(5.41, cues)?.text).toMatch(/^your country/)
    expect(captionAt(11, cues)).toBeNull()
    expect(captionAt(-1, cues)).toBeNull()
  })
})

describe('wrapCaption', () => {
  const measure = (s: string) => s.length * 10

  it('keeps a short line whole', () => {
    expect(wrapCaption('Hello there', 200, measure)).toEqual(['Hello there'])
  })

  it('breaks at words to fit the width', () => {
    // 16 characters fit: "ask not what your" would be 17.
    expect(wrapCaption('ask not what your country', 160, measure)).toEqual(['ask not what', 'your country'])
  })

  it('never splits a word that is wider than the line on its own', () => {
    expect(wrapCaption('Supercalifragilistic word', 100, measure)).toEqual(['Supercalifragilistic', 'word'])
  })

  it('ends with an ellipsis when the text runs past the last line', () => {
    const lines = wrapCaption('one two three four five six seven eight', 100, measure)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(100)
  })
})

describe('normalizeCaptions', () => {
  it('defaults to off with no cues', () => {
    expect(normalizeCaptions(undefined)).toEqual({ enabled: false, cues: [], size: 1, position: 'bottom' })
  })

  it('keeps valid cues in order, drops broken ones, and bounds the size', () => {
    const n = normalizeCaptions({
      enabled: true,
      size: 9,
      position: 'top',
      cues: [
        { id: 'b', start: 3, end: 4, text: 'second' },
        { id: 'a', start: 1, end: 2, text: 'first' },
        { id: 'x', start: 5, end: 4, text: 'backwards' },
        { id: 'y', start: 6, end: 7 }
      ]
    })
    expect(n.cues.map((c) => c.id)).toEqual(['a', 'b'])
    expect(n.size).toBe(1.8)
    expect(n.position).toBe('top')
    expect(n.enabled).toBe(true)
  })
})

describe('editCue', () => {
  const cues = cuesFromWhisperJson(jfk)
  it('replaces the text of one cue', () => {
    const edited = editCue(cues, cues[1].id, 'your company can do for you')
    expect(edited[1].text).toBe('your company can do for you')
    expect(edited[0]).toBe(cues[0])
  })

  it('removes a cue whose text is cleared', () => {
    expect(editCue(cues, cues[1].id, '   ')).toHaveLength(2)
  })
})

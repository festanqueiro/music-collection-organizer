import { describe, it, expect } from 'vitest'
import type { TrackCue } from '../types'
import { HOT_CUE_DEFAULT_COLORS, firstEmptySlot, firstSoundTime, suggestedCues } from './hotCues'

const hot = (slot: number, start: number): TrackCue => ({ id: slot + 1, kind: 'hot', slot, start, end: null, color: null, name: '' })

describe('hot cue default colours', () => {
  it('gives each of the eight pads its own colour', () => {
    expect(new Set(HOT_CUE_DEFAULT_COLORS).size).toBe(8)
  })
})

describe('suggestedCues', () => {
  // 120 BPM: a bar is 2 s, so bar 16 is 32 s after the first beat.
  const track = { bpm: 120, firstBeat: 0.5, waveformPeaks: null }

  it('suggests bars 16, 32, 48 and 64 from the first beat', () => {
    expect(suggestedCues(track, 300, []).map((s) => [s.bar, s.time, s.slot])).toEqual([
      [16, 32.5, null],
      [32, 64.5, null],
      [48, 96.5, null],
      [64, 128.5, null],
    ])
  })

  it('leaves out bars past the end of the track', () => {
    expect(suggestedCues(track, 100, []).map((s) => s.bar)).toEqual([16, 32, 48])
  })

  it('knows which pad a suggestion is already on (within half a beat)', () => {
    const s = suggestedCues(track, 300, [hot(2, 32.6), hot(0, 70)])
    expect(s.map((x) => x.slot)).toEqual([2, null, null, null])
  })

  it('needs a BPM', () => {
    expect(suggestedCues({ ...track, bpm: null }, 300, [])).toEqual([])
  })

  it('guesses the first beat from the waveform for tracks analysed before it was kept', () => {
    const peaks = [0, 0, 0, 0.5, 1, 1, 1, 1, 1, 1]
    expect(firstSoundTime(peaks, 100)).toBe(30)
    expect(suggestedCues({ bpm: 120, firstBeat: null, waveformPeaks: peaks }, 100, [])[0].time).toBe(62)
  })
})

describe('firstEmptySlot', () => {
  it('is the first pad without a cue, or null when all eight are set', () => {
    expect(firstEmptySlot([hot(0, 1), hot(2, 3)])).toBe(1)
    expect(firstEmptySlot(Array.from({ length: 8 }, (_, i) => hot(i, i)))).toBeNull()
  })
})

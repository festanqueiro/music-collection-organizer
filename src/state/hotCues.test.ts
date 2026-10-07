import { describe, it, expect } from 'vitest'
import type { TrackCue } from '../types'
import { HOT_CUE_DEFAULT_COLORS, barCounter, detectedStart, firstEmptySlot, firstSoundTime, gridPosition, gridStart, snapToBeat, suggestedCues } from './hotCues'

const hot = (slot: number, start: number): TrackCue => ({ id: slot + 1, kind: 'hot', slot, start, end: null, color: null, name: '' })

describe('hot cue default colours', () => {
  it('gives each of the eight pads its own colour', () => {
    expect(new Set(HOT_CUE_DEFAULT_COLORS).size).toBe(8)
  })
})

describe('suggestedCues', () => {
  // 120 BPM: a bar is 2 s, so bar 16 is 32 s after the start.
  const unset = { bpm: 120, firstBeat: 0.5, gridStart: null, waveformPeaks: null }
  const track = { ...unset, gridStart: 0.5 }

  it('counts from 0:00 until the start of the tune is moved — neither the first beat nor a cue is a start', () => {
    expect(suggestedCues(unset, 300, []).map((s) => s.time)).toEqual([16, 32, 64, 96, 128])
    expect(suggestedCues(unset, 300, [hot(0, 0.5)]).map((s) => s.time)).toEqual([16, 32, 64, 96, 128])
  })

  it('depends on the tempo: 16 bars are 16 × 4 beats', () => {
    // 128 BPM: 64 beats × 60 / 128 = 30 s (bar 8: 15 s); 90 BPM: 42.667 s.
    expect(suggestedCues({ ...unset, bpm: 128 }, 300, []).slice(0, 2).map((s) => s.time)).toEqual([15, 30])
    expect(suggestedCues({ ...unset, bpm: 90 }, 300, [])[1].time).toBe(42.667)
  })

  it('offers the analysed first beat as the start, or a guess from the waveform', () => {
    expect(detectedStart(unset, 300)).toBe(0.5)
    const peaks = [0, 0, 0, 0.5, 1, 1, 1, 1, 1, 1]
    expect(firstSoundTime(peaks, 100)).toBe(30)
    expect(detectedStart({ firstBeat: null, waveformPeaks: peaks }, 100)).toBe(30)
  })

  it('suggests bars 8, 16, 32, 48 and 64 from the start — wherever it is', () => {
    expect(suggestedCues(track, 300, []).map((s) => [s.bar, s.time, s.slot])).toEqual([
      [8, 16.5, null],
      [16, 32.5, null],
      [32, 64.5, null],
      [48, 96.5, null],
      [64, 128.5, null],
    ])
    // The user's start, not the analysed first beat: the grid moves with it.
    expect(suggestedCues({ ...track, gridStart: 4 }, 300, []).map((s) => s.time)).toEqual([20, 36, 68, 100, 132])
    expect(gridStart({ ...track, gridStart: 4 })).toBe(4)
    expect(gridStart(unset)).toBe(0)
  })

  it('leaves out bars past the end of the track', () => {
    expect(suggestedCues(track, 100, []).map((s) => s.bar)).toEqual([8, 16, 32, 48])
  })

  it('knows which pad a suggestion is already on (within half a beat) — pad A included', () => {
    const s = suggestedCues(track, 300, [hot(0, 32.6), hot(3, 70)])
    expect(s.map((x) => x.slot)).toEqual([null, 0, null, null, null])
  })

  it('needs a BPM', () => {
    expect(suggestedCues({ ...track, bpm: null }, 300, [])).toEqual([])
  })
})

describe('firstEmptySlot', () => {
  it('is the first pad without a cue, or null when all eight are set', () => {
    expect(firstEmptySlot([hot(0, 1), hot(2, 3)])).toBe(1)
    expect(firstEmptySlot(Array.from({ length: 8 }, (_, i) => hot(i, i)))).toBeNull()
  })
})

describe('the beat grid (dragging a cue)', () => {
  // 120 BPM from 0.5 s: a beat is 0.5 s, a bar 2 s.
  it('says how many bars and beats in a time is, like the suggestions count', () => {
    expect(gridPosition(32.5, 120, 0.5)).toEqual({ bars: 16, beats: 0 })
    expect(gridPosition(33.6, 120, 0.5)).toEqual({ bars: 16, beats: 2 })
    expect(gridPosition(0.2, 120, 0.5)).toEqual({ bars: -1, beats: 3 })
  })

  it('snaps to the nearest beat', () => {
    expect(snapToBeat(32.7, 120, 0.5)).toBe(32.5)
    expect(snapToBeat(32.8, 120, 0.5)).toBe(33)
  })
})

describe('barCounter', () => {
  it('counts bars and beats from the start (bar 0)', () => {
    // 120 BPM: a beat is 0.5 s, a bar 2 s; the start is at 0.5 s.
    expect(barCounter(0.5, 120, 0.5)).toEqual({ bar: 0, beat: 0, phrase: 0 })
    expect(barCounter(1.6, 120, 0.5)).toEqual({ bar: 0, beat: 2, phrase: 2 / 64 })
    expect(barCounter(49.5, 120, 0.5)).toEqual({ bar: 24, beat: 2, phrase: 34 / 64 })
  })

  it('reads 8, 16, 32, 48, 64 on the suggestions, counted from the start the user set', () => {
    const track = { bpm: 120, firstBeat: 0.5, gridStart: 4, waveformPeaks: null }
    const at = suggestedCues(track, 600, []).map((s) => barCounter(s.time, 120, gridStart(track)))
    expect(at.map((c) => c?.bar)).toEqual([8, 16, 32, 48, 64])
    // Bar 8 is half-way through the first 16-bar phrase; the others start one.
    expect(at.map((c) => [c?.beat, c?.phrase])).toEqual([[0, 0.5], [0, 0], [0, 0], [0, 0], [0, 0]])
    expect(barCounter(4, 120, 4)).toMatchObject({ bar: 0, beat: 0 })
  })

  it('has nothing to show before the start or without a tempo', () => {
    expect(barCounter(0.2, 120, 0.5)).toBeNull()
    expect(barCounter(10, null, 0)).toBeNull()
  })
})

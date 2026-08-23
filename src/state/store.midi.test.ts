import { describe, it, expect, beforeEach, vi } from 'vitest'

// store.ts is written for the renderer, where `window.api` (the preload
// bridge) always exists — stub just enough of it for the MIDI-handling
// path under test, before the module (which builds its zustand store at
// import time) loads.
;(globalThis as unknown as { window: unknown }).window = {
  api: {
    setMidiMappings: vi.fn().mockResolvedValue(undefined),
    setEffectsSettings: vi.fn().mockResolvedValue(undefined),
  },
}

const { useCollectionStore } = await import('./store')

describe('handleMidiControlChange — delay.enabled/reverb.enabled toggle', () => {
  beforeEach(() => {
    useCollectionStore.setState({
      midiMappings: { 'delay.enabled': { channel: 0, controller: 1, kind: 'cc' } },
      effectsSettings: {
        delay: { enabled: false, timeMs: 300, feedback: 0.3, mix: 0.3 },
        reverb: { enabled: false, mix: 0.3, decaySeconds: 2, preDelayMs: 0 },
        filter: { enabled: true, lowpass: 0, highpass: 0, resonance: 1 },
        eq: { enabled: true, low: 0, mid: 0, high: 0 },
        siren: {
          enabled: false,
          mode: 'siren',
          pitchHz: 350,
          speedHz: 6,
          depth: 1,
          level: 0.8,
          echoFeedback: 0.45,
          beat: 'off',
        },
      },
    })
  })

  it('flips off -> on on a press (nonzero value)', () => {
    useCollectionStore.getState().handleMidiControlChange(0, 1, 127, 'cc')
    expect(useCollectionStore.getState().effectsSettings.delay.enabled).toBe(true)
  })

  it('flips on -> off on the next press', () => {
    useCollectionStore.getState().handleMidiControlChange(0, 1, 127, 'cc')
    expect(useCollectionStore.getState().effectsSettings.delay.enabled).toBe(true)
    useCollectionStore.getState().handleMidiControlChange(0, 1, 127, 'cc')
    expect(useCollectionStore.getState().effectsSettings.delay.enabled).toBe(false)
  })

  it('a release message (value 0) after a press does not flip it back', () => {
    useCollectionStore.getState().handleMidiControlChange(0, 1, 127, 'cc')
    expect(useCollectionStore.getState().effectsSettings.delay.enabled).toBe(true)
    useCollectionStore.getState().handleMidiControlChange(0, 1, 0, 'cc')
    expect(useCollectionStore.getState().effectsSettings.delay.enabled).toBe(true)
  })

  it('a bare release with nothing pressed first is a no-op', () => {
    useCollectionStore.getState().handleMidiControlChange(0, 1, 0, 'cc')
    expect(useCollectionStore.getState().effectsSettings.delay.enabled).toBe(false)
  })

  it('ignores messages on an unbound channel/controller', () => {
    useCollectionStore.getState().handleMidiControlChange(5, 99, 127, 'cc')
    expect(useCollectionStore.getState().effectsSettings.delay.enabled).toBe(false)
  })
})

describe('handleMidiControlChange — delay.division (discrete, not a persisted setting)', () => {
  beforeEach(() => {
    useCollectionStore.setState({
      midiMappings: { 'delay.division': { channel: 2, controller: 7, kind: 'cc' } },
      delayDivisionSync: null,
    })
  })

  it('calls the registered delayDivisionSync with the quantized index, not effectsSettings', () => {
    const sync = vi.fn()
    useCollectionStore.getState().setDelayDivisionSync(sync)
    // DELAY_DIVISIONS has 9 entries; ccValue 127 should quantize to the last index (8).
    useCollectionStore.getState().handleMidiControlChange(2, 7, 127, 'cc')
    expect(sync).toHaveBeenCalledWith(8)
    // A control-plane-only action — never touches persisted effects settings.
    expect(useCollectionStore.getState().effectsSettings.delay.timeMs).toBe(300)
  })

  it('is a silent no-op when nothing has registered a sync handler', () => {
    expect(() => useCollectionStore.getState().handleMidiControlChange(2, 7, 64, 'cc')).not.toThrow()
  })
})

describe('handleMidiControlChange — player.playPause/playNext', () => {
  beforeEach(() => {
    useCollectionStore.setState({
      midiMappings: {},
      midiLearningControl: null,
      playbackControls: null,
    })
  })

  it('learning player.playPause onto a physical button removes a stale mapping already on that same button', () => {
    // Simulates a button that was previously (mis)learned for playNext,
    // then re-learned for playPause without explicitly unbinding the old
    // one first — before the fix, both mappings pointed at channel 0/
    // controller 10, and the lookup in handleMidiControlChange picked
    // whichever key it found first, so the newly learned control could
    // silently never fire.
    useCollectionStore.setState({
      midiMappings: { 'player.playNext': { channel: 0, controller: 10, kind: 'note' } },
      midiLearningControl: 'player.playPause',
    })

    useCollectionStore.getState().handleMidiControlChange(0, 10, 127, 'note')

    const mappings = useCollectionStore.getState().midiMappings
    expect(mappings['player.playPause']).toEqual({ channel: 0, controller: 10, kind: 'note' })
    expect(mappings['player.playNext']).toBeUndefined()
  })

  it('toggles playback on a press and ignores the release', () => {
    const toggle = vi.fn()
    useCollectionStore.setState({
      midiMappings: { 'player.playPause': { channel: 1, controller: 20, kind: 'note' } },
      playbackControls: { toggle },
    })

    useCollectionStore.getState().handleMidiControlChange(1, 20, 127, 'note')
    expect(toggle).toHaveBeenCalledTimes(1)

    useCollectionStore.getState().handleMidiControlChange(1, 20, 0, 'note')
    expect(toggle).toHaveBeenCalledTimes(1) // release is a no-op, not a second toggle
  })

  it('is a silent no-op when nothing is loaded (playbackControls is null)', () => {
    useCollectionStore.setState({
      midiMappings: { 'player.playPause': { channel: 1, controller: 20, kind: 'note' } },
      playbackControls: null,
    })
    expect(() => useCollectionStore.getState().handleMidiControlChange(1, 20, 127, 'note')).not.toThrow()
  })
})

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
        reverb: { enabled: false, mix: 0.3 },
        siren: {
          enabled: false,
          mode: 'siren',
          pitchHz: 350,
          speedHz: 6,
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

import { describe, it, expect, vi } from 'vitest'

// Seed localStorage with only the pre-options key before the store module
// (which reads preferences at import time) loads.
const storage = new Map<string, string>([['visualizerThemeVariants', JSON.stringify({ soundsystem: 'natural' })]])
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
  key: () => null,
  length: 0,
}
;(globalThis as unknown as { window: unknown }).window = { api: { analyzeCollection: vi.fn() } }

const { useCollectionStore } = await import('./store')

describe('visualizer theme options', () => {
  it('migrates the old per-theme variant into the colours option', () => {
    expect(useCollectionStore.getState().visualizerThemeOptions).toEqual({ soundsystem: { colours: 'natural' } })
  })

  it('sets one option without touching the others, and persists', () => {
    useCollectionStore.getState().setVisualizerThemeOption('soundsystem', 'background', 'urban')
    expect(useCollectionStore.getState().visualizerThemeOptions).toEqual({
      soundsystem: { colours: 'natural', background: 'urban' },
    })
    expect(JSON.parse(storage.get('visualizerThemeOptions')!)).toEqual({
      soundsystem: { colours: 'natural', background: 'urban' },
    })
  })
})

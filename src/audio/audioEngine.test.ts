import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioEngine, IDLE_SUSPEND_MS } from './audioEngine'

// Just enough of an AudioContext for the engine's bus and idle logic.
function fakeContext() {
  const gainNode = () => ({ connect: vi.fn(), gain: { setTargetAtTime: vi.fn() } })
  const context = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    destination: {},
    createGain: vi.fn(gainNode),
    resume: vi.fn(async () => {
      context.state = 'running'
    }),
    suspend: vi.fn(async () => {
      context.state = 'suspended'
    }),
  }
  return context
}

describe('AudioEngine', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('wakes when a source becomes active and stays awake while it is', async () => {
    const context = fakeContext()
    const engine = new AudioEngine(context as never)
    const track = {}
    engine.setActive(track, true)
    await Promise.resolve()
    expect(context.state).toBe('running')
    vi.advanceTimersByTime(IDLE_SUSPEND_MS * 3)
    expect(context.suspend).not.toHaveBeenCalled()
  })

  it('suspends once the last source has been quiet for the idle delay', async () => {
    const context = fakeContext()
    const engine = new AudioEngine(context as never)
    const track = {}
    const siren = {}
    engine.setActive(track, true)
    engine.setActive(siren, true)
    await Promise.resolve()
    engine.setActive(track, false)
    vi.advanceTimersByTime(IDLE_SUSPEND_MS)
    expect(context.suspend).not.toHaveBeenCalled()
    engine.setActive(siren, false)
    vi.advanceTimersByTime(IDLE_SUSPEND_MS - 1)
    expect(context.suspend).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(context.suspend).toHaveBeenCalledOnce()
  })

  it('goes back to sleep after a wake-up that nothing followed', async () => {
    const context = fakeContext()
    const engine = new AudioEngine(context as never)
    engine.resume()
    await Promise.resolve()
    expect(context.state).toBe('running')
    vi.advanceTimersByTime(IDLE_SUSPEND_MS)
    expect(context.suspend).toHaveBeenCalledOnce()
  })

  it('ignores a source going quiet that was never active', () => {
    const context = fakeContext()
    const engine = new AudioEngine(context as never)
    engine.setActive({}, true)
    engine.setActive({}, false)
    expect(engine.isActive()).toBe(true)
  })
})

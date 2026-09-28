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
    createDelay: vi.fn((maxDelay: number) => ({
      maxDelay,
      connect: vi.fn(),
      delayTime: { value: 0, setValueAtTime: vi.fn(function (this: { value: number }, v: number) { this.value = v }) },
    })),
    createAnalyser: vi.fn(() => ({ fftSize: 0, smoothingTimeConstant: 0 })),
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

  it('builds the visual tap on first use, with the delay already set', () => {
    const context = fakeContext()
    const engine = new AudioEngine(context as never)
    engine.setVisualDelay(1.5)
    expect(context.createDelay).not.toHaveBeenCalled()
    const analyser = engine.getVisualAnalyser()
    expect(engine.getVisualAnalyser()).toBe(analyser)
    expect(context.createDelay).toHaveBeenCalledTimes(1)
    const delay = context.createDelay.mock.results[0].value
    expect(delay.delayTime.value).toBe(1.5)
    expect(engine.input.connect).toHaveBeenCalledWith(delay)
  })

  it('clamps the visual delay and applies changes to the live tap', () => {
    const context = fakeContext()
    const engine = new AudioEngine(context as never)
    engine.getVisualAnalyser()
    const delay = context.createDelay.mock.results[0].value
    engine.setVisualDelay(9)
    expect(engine.visualDelay).toBe(5)
    expect(delay.delayTime.value).toBe(5)
    engine.setVisualDelay(-1)
    expect(engine.visualDelay).toBe(0)
  })
})

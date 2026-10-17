import { describe, expect, it } from 'vitest'
import { getVisualizerTheme } from 'threejs-visualisers'
import { resolveThemeOptions, visibleThemeOptions } from './visualizerQuality'

describe('visualizer theme options', () => {
  const soundSystem = getVisualizerTheme('soundsystem')

  it('falls back to the first value for a missing or stale choice', () => {
    const resolved = resolveThemeOptions(soundSystem, { colours: 'not-a-colour' })
    for (const option of soundSystem.options ?? []) expect(resolved[option.id]).toBe(option.values[0].id)
  })

  it('hides an option whose `when` the other choices fail', () => {
    const mode = soundSystem.options?.find((option) => option.when)
    expect(mode).toBeDefined()
    const [otherId, allowed] = Object.entries(mode!.when!)[0]
    const otherValues = soundSystem.options!.find((option) => option.id === otherId)!.values
    const disallowed = otherValues.find((v) => !allowed.includes(v.id))!.id
    const ids = (values: Record<string, string>) => visibleThemeOptions(soundSystem, values).map((o) => o.id)
    expect(ids({ [otherId]: allowed[0] })).toContain(mode!.id)
    expect(ids({ [otherId]: disallowed })).not.toContain(mode!.id)
  })
})

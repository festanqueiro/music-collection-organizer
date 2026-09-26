// Which of MCO's effects are audibly engaged right now, for the TV to
// show as lit labels. An effect that's switched on but dialled to nothing
// (zero mix, filters fully open, EQ flat) isn't shown.
import type { EffectsSettings } from '../types'

const OPEN = 0.02 // a filter stage this close to fully open is inaudible

export function activeEffects(settings: EffectsSettings, sirenHeld: boolean): string[] {
  const { delay, reverb, filter, eq, siren } = settings
  const active: string[] = []
  if (filter.enabled && filter.mix > 0 && (filter.lowpass > OPEN || filter.highpass > OPEN)) active.push('Filter')
  if (eq.enabled && eq.mix > 0 && (eq.low !== 0 || eq.mid !== 0 || eq.high !== 0)) active.push('EQ')
  if (delay.enabled && delay.mix > 0) active.push('Delay')
  if (reverb.enabled && reverb.mix > 0) active.push('Reverb')
  if (siren.enabled && (sirenHeld || siren.beat !== 'off')) active.push('Siren')
  return active
}

// Which of MCO's effects are audibly engaged right now, for the TV to
// show as lit labels. An effect that's switched on but dialled to nothing
// (zero mix, filters fully open, EQ flat) isn't shown.
import type { EffectsSettings, MicSettings } from '../types'

const OPEN = 0.02 // a filter stage this close to fully open is inaudible

export function activeEffects(settings: EffectsSettings, sirenHeld: boolean): string[] {
  const { delay, reverb, filter, eq, siren } = settings
  const active: string[] = []
  if (filter.enabled && filter.mix > 0 && (filter.lowpass > OPEN || filter.highpass > OPEN)) active.push('Filter')
  if (eq.low !== 0 || eq.mid !== 0 || eq.high !== 0) active.push('EQ')
  if (delay.enabled && delay.mix > 0) active.push('Delay')
  if (reverb.enabled && reverb.mix > 0) active.push('Reverb')
  if (siren.enabled && (sirenHeld || siren.beat !== 'off')) active.push('Siren')
  return active
}

// The mic's effects that are audibly engaged: only while the mic is on
// (its effects do nothing otherwise). For the FX button and the FX/Live
// screens' "Engaged" line; the TV doesn't show them.
export function activeMicEffects(mic: MicSettings): string[] {
  if (!mic.enabled) return []
  const active: string[] = []
  if (mic.eq.low !== 0 || mic.eq.mid !== 0 || mic.eq.high !== 0) active.push('Mic EQ')
  if (mic.pitch.enabled && mic.pitch.mix > 0 && mic.pitch.semitones !== 0) active.push('Mic Pitch')
  if (mic.radio.enabled) active.push('Mic Radio')
  if (mic.echo.enabled && mic.echo.mix > 0) active.push('Mic Echo')
  if (mic.reverb.enabled && mic.reverb.mix > 0) active.push('Mic Reverb')
  return active
}

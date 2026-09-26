// Visualizers made for the Cast receiver on the TV, alongside the
// threejs-visualisers themes. A Chromecast's GPU only runs the lightest
// three.js theme (Paint) smoothly, so these don't use it at all: plain 2D
// drawing on a small canvas that Chromium rasterizes in software (see
// TvVisualizer below), at 30 fps. They're offered only while casting to a
// screen, and only the receiver renders them.
import type { ThemeOption, VisualizerThemeId } from 'threejs-visualisers'

export type TvVisualizerId = 'tv-spectrum' | 'tv-scope' | 'tv-vu' | 'tv-drift' | 'tv-ripples' | 'tv-ridges'
// Any theme MCO can show: a threejs-visualisers theme or a TV-only one.
export type AnyVisualizerThemeId = VisualizerThemeId | TvVisualizerId

export interface TvVisualizerDef {
  id: TvVisualizerId
  name: string
  options: ThemeOption[]
}

export const TV_VISUALIZERS: TvVisualizerDef[] = [
  {
    id: 'tv-spectrum',
    name: 'Spectrum',
    options: [
      {
        id: 'colours',
        name: 'Colours',
        values: [
          { id: 'classic', name: 'Classic' },
          { id: 'mco', name: 'MCO' },
          { id: 'amber', name: 'Amber' },
        ],
      },
    ],
  },
  {
    id: 'tv-scope',
    name: 'Scope',
    options: [
      {
        id: 'colour',
        name: 'Colour',
        values: [
          { id: 'green', name: 'Green' },
          { id: 'cyan', name: 'Cyan' },
          { id: 'amber', name: 'Amber' },
        ],
      },
    ],
  },
  {
    id: 'tv-vu',
    name: 'VU Meters',
    options: [
      {
        id: 'face',
        name: 'Face',
        values: [
          { id: 'cream', name: 'Cream' },
          { id: 'black', name: 'Black' },
        ],
      },
    ],
  },
  {
    id: 'tv-drift',
    name: 'Drift',
    options: [
      {
        id: 'palette',
        name: 'Palette',
        values: [
          { id: 'aurora', name: 'Aurora' },
          { id: 'ember', name: 'Ember' },
          { id: 'mono', name: 'Mono' },
        ],
      },
    ],
  },
  {
    id: 'tv-ripples',
    name: 'Ripples',
    options: [
      {
        id: 'palette',
        name: 'Palette',
        values: [
          { id: 'neon', name: 'Neon' },
          { id: 'ice', name: 'Ice' },
          { id: 'sunset', name: 'Sunset' },
        ],
      },
    ],
  },
  {
    id: 'tv-ridges',
    name: 'Ridges',
    options: [
      {
        id: 'ink',
        name: 'Ink',
        values: [
          { id: 'white', name: 'White on black' },
          { id: 'paper', name: 'Black on paper' },
        ],
      },
    ],
  },
]

export function isTvVisualizer(id: string): id is TvVisualizerId {
  return TV_VISUALIZERS.some((v) => v.id === id)
}

export function getTvVisualizer(id: TvVisualizerId): TvVisualizerDef {
  return TV_VISUALIZERS.find((v) => v.id === id)!
}

// --- Audio maths (pure, tested) ----------------------------------------------

// `count` bands spaced logarithmically from `lowHz` to `highHz`, each the
// peak of its FFT bins, scaled 0..1. Log spacing gives the bass as many
// bars as the treble, as a hardware analyser does.
export function logBands(freq: Uint8Array, sampleRate: number, count: number, lowHz = 40, highHz = 16000): number[] {
  const binHz = sampleRate / 2 / freq.length
  const bands: number[] = []
  for (let i = 0; i < count; i++) {
    const from = lowHz * (highHz / lowHz) ** (i / count)
    const to = lowHz * (highHz / lowHz) ** ((i + 1) / count)
    const start = Math.max(0, Math.floor(from / binHz))
    const end = Math.min(freq.length - 1, Math.max(start, Math.ceil(to / binHz) - 1))
    let peak = 0
    for (let b = start; b <= end; b++) peak = Math.max(peak, freq[b])
    bands.push(peak / 255)
  }
  return bands
}

// Loudness of a time-domain frame (bytes centred on 128) in dBFS.
export function rmsDb(time: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < time.length; i++) {
    const v = (time[i] - 128) / 128
    sum += v * v
  }
  const rms = Math.sqrt(sum / time.length)
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity
}

// Moves `current` towards `target`, fast when rising and slowly when
// falling — a meter's ballistics (and the bars' falling peak caps).
export function ballistic(current: number, target: number, dt: number, riseTau: number, fallTau: number): number {
  const tau = target > current ? riseTau : fallTau
  return current + (target - current) * (1 - Math.exp(-dt / tau))
}

// A kick: the bass jumping up sharply from one frame to the next (not just
// being loud — in most dance music it hardly drops between kicks), at most
// one every quarter second.
export class BeatDetector {
  private previous = 0
  private sinceBeat = Infinity

  update(bass: number, dt: number): boolean {
    const rise = bass - this.previous
    this.previous = bass
    this.sinceBeat += dt
    if (bass > 0.3 && rise > 0.06 && this.sinceBeat >= 0.25) {
      this.sinceBeat = 0
      return true
    }
    return false
  }
}

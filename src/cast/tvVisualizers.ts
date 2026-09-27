// Visualizers made for the Cast receiver on the TV, alongside the
// threejs-visualisers themes. A Chromecast's GPU only runs the lightest
// three.js theme (Paint) smoothly, so these don't use it at all: plain 2D
// drawing on a small canvas that Chromium rasterizes in software (see
// TvVisualizer below), at 30 fps. They're offered only while casting to a
// screen, and only the receiver renders them.
import type { VisualizerThemeId } from 'threejs-visualisers'

export type TvVisualizerId = 'tv-drift' | 'tv-ripples' | 'tv-mandala' | 'tv-scope'
// Any theme MCO can show: a threejs-visualisers theme or a TV-only one.
export type AnyVisualizerThemeId = VisualizerThemeId | TvVisualizerId

// What the TV shows while casting, picked in MCO's Cast menu: the
// now-playing screen or one of these visualizers.
export type CastScreen = 'now-playing' | TvVisualizerId

export interface TvVisualizerDef {
  id: TvVisualizerId
  name: string
}

export const TV_VISUALIZERS: TvVisualizerDef[] = [
  { id: 'tv-drift', name: 'Drift' },
  { id: 'tv-ripples', name: 'Ripples' },
  { id: 'tv-mandala', name: 'Mandala' },
  { id: 'tv-scope', name: 'Scope' },
]

// No options to pick for now: every TV visualizer's colours keep shifting
// slowly, and the Mandala is 6-fold. The receiver still understands the
// other values (palettes, symmetries), should they come back.
export const TV_VISUALIZER_OPTIONS: Record<string, string> = { palette: 'changing', colour: 'changing', symmetry: '6' }

export function isCastScreen(id: string): id is CastScreen {
  return id === 'now-playing' || isTvVisualizer(id)
}

export function isTvVisualizer(id: string): id is TvVisualizerId {
  return TV_VISUALIZERS.some((v) => v.id === id)
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


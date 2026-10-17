// src/components/visualizerQuality.ts
import { QUALITY_CHOICES, StutterDetector, type VisualizerEngine, type VisualizerQuality, type VisualizerTheme } from 'threejs-visualisers'
import type { VisualizerQualitySetting } from '../state/store'

// threejs-visualisers' Visualizer shell does this itself; MCO drives
// VisualizerEngine directly (its own render loop, fps readout, second
// screen), so it follows the same rules here: a fixed level stays put,
// Auto starts at High and steps down a level whenever frames keep coming
// late. Low and HD scale the pixel ratio (0.6×, 1.5×, up to 3×).
const MAX_PIXEL_RATIO = 3

export class EngineQuality {
  private stutter = new StutterDetector()
  private auto = true
  private current: VisualizerQuality = 'high'

  constructor(
    private readonly engine: VisualizerEngine,
    // The High resolution, which Low and HD scale from.
    private readonly basePixelRatio: number,
    private readonly onChange?: (quality: VisualizerQuality) => void,
  ) {}

  get quality(): VisualizerQuality {
    return this.current
  }

  set(setting: VisualizerQualitySetting): void {
    this.auto = setting === 'auto'
    this.apply(setting === 'auto' ? 'high' : setting)
  }

  // A theme switch or fps change: new shaders compile on the first frames,
  // which isn't stutter.
  reset(): void {
    this.stutter.reset(performance.now())
  }

  // Call after every frame rendered; fps 0 (no cap) is judged against 60.
  frame(nowMs: number, fps: number): void {
    if (!this.stutter.frame(nowMs, 1000 / (fps || 60)) || !this.auto) return
    const index = QUALITY_CHOICES.findIndex((c) => c.quality === this.current)
    if (index > 0) this.apply(QUALITY_CHOICES[index - 1].quality)
  }

  private apply(quality: VisualizerQuality): void {
    const choice = QUALITY_CHOICES.find((c) => c.quality === quality)!
    this.current = quality
    this.engine.setPixelRatio(Math.min(MAX_PIXEL_RATIO, this.basePixelRatio * choice.scale))
    this.engine.setQuality(quality)
    this.reset()
    this.onChange?.(quality)
  }
}

// A theme's option values: the stored choice, or the first value when
// there's none or it's no longer valid.
export function resolveThemeOptions(theme: VisualizerTheme, stored: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    (theme.options ?? []).map((option) => {
      const value = stored?.[option.id]
      return [option.id, option.values.some((v) => v.id === value) ? value! : option.values[0].id]
    }),
  )
}

// The options worth showing alongside `values` (ThemeOption.when, e.g.
// Sound System's Mode only applies to the Mais Baixo stack).
export function visibleThemeOptions(theme: VisualizerTheme, values: Record<string, string>) {
  return (theme.options ?? []).filter((option) =>
    Object.entries(option.when ?? {}).every(([otherId, allowed]) => allowed.includes(values[otherId])),
  )
}

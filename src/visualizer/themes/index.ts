import { nebulaTheme } from './nebula'
import { warpTheme } from './warp'
import { horizonTheme } from './horizon'
import { soundSystemTheme } from './soundsystem'
import type { VisualizerTheme, VisualizerThemeId } from '../types'

// Order here is the order in the picker and the 1/2/3/4 keyboard shortcuts.
export const VISUALIZER_THEMES: VisualizerTheme[] = [nebulaTheme, warpTheme, horizonTheme, soundSystemTheme]

export function getVisualizerTheme(id: VisualizerThemeId): VisualizerTheme {
  return VISUALIZER_THEMES.find((theme) => theme.id === id) ?? VISUALIZER_THEMES[0]
}

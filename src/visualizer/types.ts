import type * as THREE from 'three'

export type VisualizerThemeId = 'nebula' | 'warp' | 'horizon' | 'soundsystem'

// Themes that only appear for some tracks (see VisualizerTheme.isAvailable).
// Listed here, not derived from the theme modules, so the store can tell
// special from regular themes without importing three.js.
export const SPECIAL_VISUALIZER_THEME_IDS: VisualizerThemeId[] = ['soundsystem']

// Everything a theme needs from the audio for one frame. Computed once
// by the Visualizer shell (so themes don't each redo band/beat analysis),
// already smoothed where that matters.
export interface AudioFrame {
  t: number // seconds, monotonic
  dt: number // seconds since last frame, clamped
  bass: number // 0..1, smoothed
  mid: number // 0..1, smoothed
  high: number // 0..1, smoothed
  energy: number // average of bass/mid/high
  beat: boolean // true on the frame a kick is detected
  flash: number // 1 on a beat, decaying to 0 over ~1/3s
  hue: number // 0..1, slowly drifting, nudged forward on each beat
  freq: Uint8Array // raw getByteFrequencyData() output; empty when nothing is loaded
  sampleRate: number
}

// One live instance of a theme — owns its own scene and camera; the
// shell owns the renderer, bloom pass and render loop.
export interface ThemeInstance {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  // Advances the scene one frame; returns the bloom strength to use.
  update(frame: AudioFrame): number
  dispose(): void
  // Renderer settings the shell applies while this theme is active —
  // lit, daylight scenes want shadows and filmic tone mapping; the
  // emissive/bloom themes want neither.
  shadows?: boolean
  toneMapping?: THREE.ToneMapping
  // Switches to one of the theme's `variants` in place (no rebuild).
  setVariant?: (variantId: string) => void
}

export interface VisualizerTheme {
  id: VisualizerThemeId
  name: string
  create(): ThemeInstance
  // Omitted = always available. Otherwise shown only for tracks whose tag
  // and subtag names satisfy it.
  isAvailable?: (tagNames: string[]) => boolean
  // Optional user-selectable looks (e.g. colour schemes), shown in the
  // Visualizer's bottom-right picker while this theme is active. The
  // first is the default.
  variants?: Array<{ id: string; name: string }>
}

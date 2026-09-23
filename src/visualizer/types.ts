import type * as THREE from 'three'

export type VisualizerThemeId = 'nebula' | 'warp' | 'horizon'

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
}

export interface VisualizerTheme {
  id: VisualizerThemeId
  name: string
  create(): ThemeInstance
}

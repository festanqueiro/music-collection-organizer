import * as THREE from 'three'
import { logBinRanges, follow } from '../audio/audioAnalysis'
import type { AudioFrame } from './types'

// Smoothed per-bar levels (0..1) over log-spaced frequency bands, for
// themes that draw a spectrum. Bin ranges are recomputed only when the
// analyser's bin count or sample rate changes (i.e. basically never).
export class SpectrumBars {
  readonly levels: Float32Array
  private ranges: Array<[number, number]> = []
  private rangesKey = ''

  constructor(
    private readonly bars: number,
    private readonly minHz = 30,
    private readonly maxHz = 16000,
  ) {
    this.levels = new Float32Array(bars)
  }

  update(frame: AudioFrame, attack = 0.6, release = 0.12): Float32Array {
    const { freq, sampleRate } = frame
    const key = `${freq.length}@${sampleRate}`
    if (freq.length > 0 && key !== this.rangesKey) {
      this.ranges = logBinRanges(freq.length, sampleRate, this.bars, this.minHz, this.maxHz)
      this.rangesKey = key
    }
    for (let i = 0; i < this.bars; i++) {
      let peak = 0
      if (freq.length > 0) {
        const [start, end] = this.ranges[i]
        for (let b = start; b <= end; b++) if (freq[b] > peak) peak = freq[b]
      }
      this.levels[i] = follow(this.levels[i], peak / 255, attack, release)
    }
    return this.levels
  }
}

// Round, soft-edged dot for particle fields — PointsMaterial draws hard
// squares otherwise.
export function createDotTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// Disposes every geometry/material/texture reachable from a scene — themes
// call this from dispose() instead of tracking each resource by hand.
export function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}

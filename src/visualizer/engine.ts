import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { getActiveAnalyser, computeBands, BeatDetector, follow } from '../audio/audioAnalysis'
import type { AudioFrame, ThemeInstance } from './types'

const SILENT = new Uint8Array(0)

// Everything shared across themes — the WebGL renderer + bloom, and
// per-frame audio analysis (bands, beats, hue drift) — minus the render
// loop, which the caller drives: the full-screen Visualizer overlay ticks
// it from requestAnimationFrame, the cast stream (src/cast/) from a timer
// so it keeps running while the window is hidden. Reads the current
// track's AnalyserNode every frame (getActiveAnalyser) rather than
// capturing one, so it keeps running seamlessly across track changes and
// idles gently when nothing is playing.
export class VisualizerEngine {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private renderPass: RenderPass
  private bloom: UnrealBloomPass
  private theme: ThemeInstance | null = null
  private width: number
  private height: number
  private beatDetector = new BeatDetector()
  private frame: AudioFrame = {
    t: 0,
    dt: 0,
    bass: 0,
    mid: 0,
    high: 0,
    energy: 0,
    beat: false,
    flash: 0,
    hue: Math.random(),
    freq: new Uint8Array(0),
    sampleRate: 48000,
  }
  private freq: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  private lastMs = performance.now()

  constructor(width: number, height: number, pixelRatio: number) {
    this.width = width
    this.height = height
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 1)
    renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer = renderer
    this.canvas = renderer.domElement

    // The composer renders into its own off-screen targets, so the
    // renderer's `antialias` never applies — without a multisampled
    // target every edge is aliased and crawls as the camera drifts.
    // Sized in device pixels; later composer.setSize() calls (CSS pixels)
    // are scaled by the renderer's pixel ratio.
    this.composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
        samples: 4,
        type: THREE.HalfFloatType,
      }),
    )
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera())
    this.composer.addPass(this.renderPass)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1, 0.5, 0.3)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  setSize(width: number, height: number): void {
    this.width = width
    this.height = height
    this.renderer.setSize(width, height)
    this.composer.setSize(width, height)
    this.fitCamera()
  }

  setTheme(instance: ThemeInstance): void {
    this.theme = instance
    this.renderer.shadowMap.enabled = !!instance.shadows
    this.renderer.toneMapping = instance.toneMapping ?? THREE.NoToneMapping
    this.renderPass.scene = instance.scene
    this.renderPass.camera = instance.camera
    this.fitCamera()
  }

  // Analyses the current audio and renders one frame of the active theme.
  render(nowMs = performance.now()): void {
    const frame = this.frame
    frame.dt = Math.min(0.05, (nowMs - this.lastMs) / 1000)
    frame.t = nowMs / 1000
    this.lastMs = nowMs

    const analyser = getActiveAnalyser()
    let bands = { bass: 0, mid: 0, high: 0 }
    if (analyser) {
      if (this.freq.length !== analyser.frequencyBinCount) this.freq = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(this.freq)
      frame.freq = this.freq
      frame.sampleRate = analyser.context.sampleRate
      bands = computeBands(this.freq, frame.sampleRate)
    } else {
      frame.freq = SILENT
    }
    frame.bass = follow(frame.bass, bands.bass)
    frame.mid = follow(frame.mid, bands.mid)
    frame.high = follow(frame.high, bands.high)
    frame.energy = (frame.bass + frame.mid + frame.high) / 3
    frame.beat = this.beatDetector.update(bands.bass, nowMs)
    if (frame.beat) {
      frame.flash = 1
      frame.hue = (frame.hue + 0.06) % 1
    }
    frame.flash = Math.max(0, frame.flash - frame.dt * 3)
    frame.hue = (frame.hue + frame.dt * 0.01) % 1

    if (!this.theme) return
    this.bloom.strength = this.theme.update(frame)
    this.composer.render()
  }

  dispose(): void {
    this.theme = null
    this.composer.dispose()
    this.bloom.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }

  private fitCamera(): void {
    if (!this.theme) return
    this.theme.camera.aspect = this.width / this.height
    this.theme.camera.updateProjectionMatrix()
  }
}

// Draws the picture that gets cast: either the visualizer (its own
// off-screen VisualizerEngine, independent of the full-screen overlay) or
// a simple now-playing card, into a fixed-size 2D canvas the cast
// recorder captures. Track info is drawn onto the canvas itself, since
// the overlay's DOM text isn't part of any stream.
import { useCollectionStore } from '../state/store'
import { VisualizerEngine } from '../visualizer/engine'
import { getVisualizerTheme } from '../visualizer/themes'
import type { ThemeInstance, VisualizerThemeId } from '../visualizer/types'
import { decodeHtmlEntities } from '../format'
import type { Track } from '../types'

export const CAST_WIDTH = 1280
export const CAST_HEIGHT = 720

function currentTrack(): Track | null {
  const { playlist, tracks } = useCollectionStore.getState()
  const id = playlist[0]
  return id != null ? (tracks.find((t) => t.id === id) ?? null) : null
}

function themeOptions(themeId: VisualizerThemeId): Record<string, string> {
  const stored = useCollectionStore.getState().visualizerThemeOptions[themeId]
  const theme = getVisualizerTheme(themeId)
  return Object.fromEntries(
    (theme.options ?? []).map((option) => {
      const value = stored?.[option.id]
      return [option.id, option.values.some((v) => v.id === value) ? value! : option.values[0].id]
    }),
  )
}

// Ellipsizes `text` to fit `maxWidth` in the context's current font.
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 0 && ctx.measureText(text.slice(0, end) + '…').width > maxWidth) end--
  return text.slice(0, end) + '…'
}

export class CastFrameRenderer {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private engine: VisualizerEngine | null = null
  private theme: ThemeInstance | null = null
  private themeKey = ''
  private optionsKey = ''
  private artwork: HTMLImageElement | null = null
  private artworkTrackId: number | null = null

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = CAST_WIDTH
    this.canvas.height = CAST_HEIGHT
    this.ctx = this.canvas.getContext('2d')!
  }

  draw(): void {
    const state = useCollectionStore.getState()
    const track = currentTrack()
    this.loadArtwork(track)
    if (state.castShowVisualizer) {
      this.drawVisualizer(state.visualizerTheme)
      if (track && !state.visualizerHideTrackInfo) this.drawTrackInfoOverlay(track)
    } else {
      this.disposeEngine()
      this.drawNowPlaying(track, state.playbackProgress)
    }
  }

  dispose(): void {
    this.disposeEngine()
  }

  private drawVisualizer(themeId: VisualizerThemeId): void {
    if (!this.engine) this.engine = new VisualizerEngine(CAST_WIDTH, CAST_HEIGHT, 1)
    const activeId = getVisualizerTheme(themeId).id
    if (activeId !== this.themeKey) {
      this.theme?.dispose()
      this.theme = getVisualizerTheme(activeId).create()
      this.engine.setTheme(this.theme)
      this.themeKey = activeId
      this.optionsKey = ''
    }
    const options = themeOptions(activeId)
    const optionsKey = JSON.stringify(options)
    if (optionsKey !== this.optionsKey) {
      for (const [optionId, valueId] of Object.entries(options)) this.theme?.setOption?.(optionId, valueId)
      this.optionsKey = optionsKey
    }
    this.engine.render()
    // Copied in the same task as the WebGL render, while its drawing
    // buffer is still valid.
    this.ctx.drawImage(this.engine.canvas, 0, 0, CAST_WIDTH, CAST_HEIGHT)
  }

  private drawTrackInfoOverlay(track: Track): void {
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'top'
    ctx.font = '500 32px Roboto, system-ui, sans-serif'
    ctx.fillText(fitText(ctx, decodeHtmlEntities(track.title ?? track.filename), CAST_WIDTH - 96), 48, 40)
    if (track.artist) {
      ctx.globalAlpha = 0.7
      ctx.font = '22px Roboto, system-ui, sans-serif'
      ctx.fillText(fitText(ctx, decodeHtmlEntities(track.artist), CAST_WIDTH - 96), 48, 84)
    }
    ctx.restore()
  }

  private drawNowPlaying(track: Track | null, progress: number): void {
    const ctx = this.ctx
    const gradient = ctx.createLinearGradient(0, 0, CAST_WIDTH, CAST_HEIGHT)
    gradient.addColorStop(0, '#1b2230')
    gradient.addColorStop(1, '#0b0d12')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, CAST_WIDTH, CAST_HEIGHT)

    const art = 360
    const artX = 120
    const artY = (CAST_HEIGHT - art) / 2
    if (this.artwork?.complete && this.artwork.naturalWidth > 0) {
      ctx.drawImage(this.artwork, artX, artY, art, art)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fillRect(artX, artY, art, art)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '160px "Material Symbols Outlined"'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('music_note', artX + art / 2, artY + art / 2)
      ctx.textAlign = 'left'
    }

    const textX = artX + art + 64
    const textWidth = CAST_WIDTH - textX - 100
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#fff'
    ctx.font = '500 44px Roboto, system-ui, sans-serif'
    ctx.fillText(fitText(ctx, track ? decodeHtmlEntities(track.title ?? track.filename) : 'Nothing playing', textWidth), textX, CAST_HEIGHT / 2 - 20)
    if (track?.artist) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.font = '30px Roboto, system-ui, sans-serif'
      ctx.fillText(fitText(ctx, decodeHtmlEntities(track.artist), textWidth), textX, CAST_HEIGHT / 2 + 30)
    }
    if (track) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(textX, CAST_HEIGHT / 2 + 80, textWidth, 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(textX, CAST_HEIGHT / 2 + 80, textWidth * Math.min(1, Math.max(0, progress)), 6)
    }
  }

  private loadArtwork(track: Track | null): void {
    const id = track?.id ?? null
    if (id === this.artworkTrackId) return
    this.artworkTrackId = id
    this.artwork = null
    if (id == null) return
    window.api.getTrackArtwork(id).then((url) => {
      if (this.artworkTrackId !== id || !url) return
      const image = new Image()
      image.src = url
      this.artwork = image
    })
  }

  private disposeEngine(): void {
    this.theme?.dispose()
    this.theme = null
    this.themeKey = ''
    this.engine?.dispose()
    this.engine = null
  }
}

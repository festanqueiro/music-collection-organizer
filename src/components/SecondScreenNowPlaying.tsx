// src/components/SecondScreenNowPlaying.tsx
//
// The second screen's "Now playing" (docs/features/second-screen.md): the
// Cast receiver's now-playing screen (cast-receiver/nowPlaying.ts — the
// artwork, details and stats, the queue, the waveform), fed from MCO's
// store with the same messages the receiver gets over Cast. Everything on
// it runs the Visual delay behind the player, like the visualizer.
import { useEffect, useRef } from 'react'
import { NowPlayingScreen, type NowPlayingQueue } from '../../cast-receiver/nowPlaying'
import nowPlayingCss from '../../cast-receiver/nowPlaying.css?inline'
import { useCollectionStore, type CollectionState } from '../state/store'
import { buildReceiverQueue } from '../cast/receiverQueue'
import { PlaybackTimeline } from '../state/playbackTimeline'

// Tracks change in bursts while a folder is being analysed; the queue
// panel can lag by this much (as on the TV, src/cast/receiverSync.ts).
const QUEUE_THROTTLE_MS = 500

function sample(state: CollectionState) {
  const trackId = state.playlist[0] ?? null
  const duration = trackId !== null ? (state.tracks.find((t) => t.id === trackId)?.duration ?? NaN) : NaN
  return {
    at: performance.now(),
    trackId,
    currentTime: Number.isFinite(duration) ? state.playbackProgress * duration : 0,
    duration,
    playing: state.playerPlaying,
  }
}

export function SecondScreenNowPlaying({ child }: { child: Window }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // A constructed sheet, not a <style>: the child inherits the page's
    // Content-Security-Policy, which blocks inline <style> elements (the
    // screen then showed just the full-size logo).
    const ChildStyleSheet = (child as Window & { CSSStyleSheet: typeof CSSStyleSheet }).CSSStyleSheet
    const sheet = new ChildStyleSheet()
    sheet.replaceSync(nowPlayingCss)
    child.document.adoptedStyleSheets = [...child.document.adoptedStyleSheets, sheet]

    const delayMs = () => useCollectionStore.getState().visualDelayMs
    const timeline = new PlaybackTimeline()
    timeline.push(sample(useCollectionStore.getState()))
    const screen = new NowPlayingScreen(host, () => timeline.at(performance.now() - delayMs()))

    // Shown after the Visual delay, so the screen changes with the music
    // as the room hears it.
    const pending = new Set<ReturnType<typeof setTimeout>>()
    const later = (show: () => void) => {
      const ms = delayMs()
      if (ms <= 0) return show()
      const timer = setTimeout(() => {
        pending.delete(timer)
        show()
      }, ms)
      pending.add(timer)
    }

    // Artwork comes from the files (data URLs); a track without any is
    // remembered as null.
    const artwork = new Map<number, string | null>()
    let shownTrackId: number | null = null
    const show = (queue: NowPlayingQueue) => {
      const current = queue.current
      later(() => {
        screen.setQueue(queue)
        if (!current) {
          shownTrackId = null
          if (screen.loaded) screen.clear()
        } else if (current.trackId !== shownTrackId) {
          shownTrackId = current.trackId
          screen.load(current, 0)
        }
      })
    }
    let disposed = false
    const pushQueue = () => {
      const queue = buildReceiverQueue(useCollectionStore.getState())
      const tracks = [queue.current, ...queue.upNext].filter((t) => t !== null)
      const missing = tracks.filter((t) => !artwork.has(t.trackId))
      if (missing.length > 0) {
        // Fetched first (a quick local read), then built again.
        Promise.all(
          missing.map((t) =>
            window.api
              .getTrackArtwork(t.trackId)
              .catch(() => null)
              .then((url) => artwork.set(t.trackId, url)),
          ),
        ).then(() => {
          if (!disposed) pushQueue()
        })
        return
      }
      for (const t of tracks) t.artworkUrl = artwork.get(t.trackId) ?? null
      show(queue)
    }

    let queueTimer: ReturnType<typeof setTimeout> | null = null
    const pushQueueSoon = () => {
      if (queueTimer) return
      queueTimer = setTimeout(() => {
        queueTimer = null
        pushQueue()
      }, QUEUE_THROTTLE_MS)
    }

    const initial = useCollectionStore.getState()
    screen.setEffects(initial.effectsSettings)
    screen.setSirenHeld(initial.sirenTriggered)
    pushQueue()

    const unsubscribe = useCollectionStore.subscribe((state, previous) => {
      if (
        state.playbackProgress !== previous.playbackProgress ||
        state.playerPlaying !== previous.playerPlaying ||
        state.playlist[0] !== previous.playlist[0]
      ) {
        timeline.push(sample(state))
      }
      if (state.playlist[0] !== previous.playlist[0]) {
        // A new track: show its details as soon as it loads.
        pushQueue()
      } else if (
        state.playlist !== previous.playlist ||
        state.tracks !== previous.tracks ||
        state.trackTags !== previous.trackTags ||
        state.genres !== previous.genres ||
        state.subgenres !== previous.subgenres ||
        state.keyNotation !== previous.keyNotation
      ) {
        pushQueueSoon()
      }
      if (state.effectsSettings !== previous.effectsSettings) {
        const effects = state.effectsSettings
        later(() => screen.setEffects(effects))
      }
      if (state.sirenTriggered !== previous.sirenTriggered) {
        const held = state.sirenTriggered
        later(() => screen.setSirenHeld(held))
      }
    })

    return () => {
      disposed = true
      unsubscribe()
      if (queueTimer) clearTimeout(queueTimer)
      for (const timer of pending) clearTimeout(timer)
      screen.dispose()
      host.replaceChildren()
      child.document.adoptedStyleSheets = child.document.adoptedStyleSheets.filter((s) => s !== sheet)
    }
  }, [child])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
}

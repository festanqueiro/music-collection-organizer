// Direct cast mode, renderer side: the device plays the track file itself
// and MCO's own <audio> element keeps playing (muted, if "Mute this Mac"
// is on) as the remote control. Its play/pause/seek events become
// commands to the device; what the device reports back (paused from the
// TV remote or the Google Home app, or simply running a little behind
// after buffering) is applied to the local element, so MCO's seekbar
// shows where the device actually is.

// Right after MCO sends a command the device's state is stale (it's still
// loading or buffering), so its reports are ignored for this long.
const COMMAND_GRACE_MS = 3000
// Position differences smaller than this are left alone — nudging the
// local element for less would just jitter the seekbar with the reports'
// own timing noise.
const DRIFT_TOLERANCE_SECONDS = 0.35

export interface DeviceReport {
  playerState: 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'LOADING'
  idleReason: string | null
  currentTime: number
}

export interface LocalAction {
  pause: boolean
  play: boolean
  seekTo: number | null
}

// What to do to the local element given a device report. Pure, so the
// rules are testable without a device or an <audio> element.
export function reconcile(report: DeviceReport, local: { paused: boolean; currentTime: number }, msSinceCommand: number): LocalAction {
  const none = { pause: false, play: false, seekTo: null }
  if (msSinceCommand < COMMAND_GRACE_MS) return none
  // Loading/buffering says nothing about where the user wants playback;
  // a finished track is handled by the local element ending on its own.
  if (report.playerState !== 'PLAYING' && report.playerState !== 'PAUSED') return none
  const drift = Math.abs(report.currentTime - local.currentTime)
  return {
    pause: report.playerState === 'PAUSED' && !local.paused,
    play: report.playerState === 'PLAYING' && local.paused,
    seekTo: drift > DRIFT_TOLERANCE_SECONDS ? report.currentTime : null,
  }
}

// Mirrors `audio` (playing track `trackId`) to the device until the
// returned cleanup runs. Loads the track on the device straight away, at
// the element's current position and play state.
export function attachDirectCast(audio: HTMLAudioElement, trackId: number): () => void {
  let lastCommandAt = performance.now()
  // Local changes made to follow the device fire the same events as the
  // user's — these counters swallow them so they aren't sent back.
  const suppress = { play: 0, pause: 0, seeked: 0 }
  const send = (command: Parameters<typeof window.api.sendCastCommand>[0]) => {
    lastCommandAt = performance.now()
    window.api.sendCastCommand(command)
  }

  send({ type: 'load', trackId, position: audio.currentTime, autoplay: !audio.paused })

  const onPlay = () => {
    if (suppress.play > 0) suppress.play--
    else send({ type: 'play' })
  }
  const onPause = () => {
    // The element pauses itself at the end of the track; the device ends
    // on its own too.
    if (audio.ended) return
    if (suppress.pause > 0) suppress.pause--
    else send({ type: 'pause' })
  }
  const onSeeked = () => {
    if (suppress.seeked > 0) suppress.seeked--
    else send({ type: 'seek', position: audio.currentTime })
  }
  audio.addEventListener('play', onPlay)
  audio.addEventListener('pause', onPause)
  audio.addEventListener('seeked', onSeeked)

  const offMedia = window.api.onCastMedia((event) => {
    if (event.trackId !== trackId) return
    const action = reconcile(event, audio, performance.now() - lastCommandAt)
    if (action.pause) {
      suppress.pause++
      audio.pause()
    }
    if (action.play) {
      suppress.play++
      audio.play().catch(() => {
        suppress.play = Math.max(0, suppress.play - 1)
      })
    }
    if (action.seekTo !== null) {
      suppress.seeked++
      audio.currentTime = action.seekTo
    }
  })

  return () => {
    audio.removeEventListener('play', onPlay)
    audio.removeEventListener('pause', onPause)
    audio.removeEventListener('seeked', onSeeked)
    offMedia()
  }
}

// Renderer side of casting: records MCO's live output — the mixed audio
// (castMixer) plus the cast picture (castFrames) — with MediaRecorder and
// streams the chunks to the main process, which encodes them to HLS for
// the TV (electron/main/cast/). The TV plays a few seconds behind.
import { useCollectionStore } from '../state/store'
import { startCastMixer, stopCastMixer } from './castMixer'
import { CastFrameRenderer } from './castFrames'
import type { CastDevice, CastStatus } from '../types'

const FPS = 30
const CHUNK_MS = 250

// Best first: lossless audio (pcm) and a cheap-to-decode H.264 video
// where this Chromium build can record them; ffmpeg re-encodes either way.
const VIDEO_MIME_CANDIDATES = [
  'video/x-matroska;codecs=avc1,pcm',
  'video/webm;codecs=h264,pcm',
  'video/webm;codecs=vp8,pcm',
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]
const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=pcm', 'audio/webm;codecs=opus', 'audio/webm']

// `video` is null when casting to a speaker (audio only).
interface LocalSession {
  video: { frames: CastFrameRenderer; timer: ReturnType<typeof setInterval>; track: CanvasCaptureMediaStreamTrack } | null
  recorder: MediaRecorder | null
}

let local: LocalSession | null = null

export function isCastActive(status: CastStatus): boolean {
  return status.state === 'connecting' || status.state === 'buffering' || status.state === 'casting'
}

export async function startCasting(device: CastDevice): Promise<void> {
  teardownLocal()
  const setStatus = useCollectionStore.getState().setCastStatus

  const audioTrack = startCastMixer()
  const session: LocalSession = { video: null, recorder: null }
  if (!device.audioOnly) {
    const frames = new CastFrameRenderer()
    const track = frames.canvas.captureStream(0).getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
    // A timer, not requestAnimationFrame: rAF stops while the window is
    // hidden or minimised, which would freeze the picture on the TV.
    const timer = setInterval(() => {
      frames.draw()
      track.requestFrame()
    }, 1000 / FPS)
    session.video = { frames, timer, track }
  }
  local = session

  try {
    await window.api.startCast(device.id)
  } catch (err) {
    teardownLocal()
    setStatus({ state: 'error', error: err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err) })
    return
  }
  if (local !== session) return

  const candidates = session.video ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES
  const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type))
  const tracks = session.video ? [session.video.track, audioTrack] : [audioTrack]
  const recorder = new MediaRecorder(new MediaStream(tracks), {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 320_000,
  })
  session.recorder = recorder
  // Chunks must reach ffmpeg in order; Blob.arrayBuffer() is async, so
  // each one waits for the previous.
  let queue = Promise.resolve()
  recorder.ondataavailable = (e) => {
    if (e.data.size === 0) return
    const blob = e.data
    queue = queue.then(async () => {
      const buffer = await blob.arrayBuffer()
      if (local === session) window.api.sendCastChunk(buffer)
    })
  }
  recorder.start(CHUNK_MS)
}

export function stopCasting(): void {
  teardownLocal()
  window.api.stopCast()
}

function teardownLocal(): void {
  const session = local
  if (!session) return
  local = null
  if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop()
  if (session.video) {
    clearInterval(session.video.timer)
    session.video.track.stop()
    session.video.frames.dispose()
  }
  stopCastMixer()
}

// Wires main-process cast events into the store; call once at startup.
// A session that ends on the main side (TV turned off, error) also stops
// the local recording.
export function initCast(): () => void {
  const store = useCollectionStore.getState()
  const offStatus = window.api.onCastStatus((status) => {
    useCollectionStore.getState().setCastStatus(status)
    if (!isCastActive(status)) teardownLocal()
  })
  const offDevices = window.api.onCastDevices((devices) => useCollectionStore.getState().setCastDevices(devices))
  // A session still running in main without a local recorder (the
  // renderer reloaded mid-cast) has nothing feeding it — end it.
  window.api.getCastStatus().then((status) => {
    if (isCastActive(status) && !local) window.api.stopCast()
    else store.setCastStatus(status)
  })
  return () => {
    offStatus()
    offDevices()
  }
}

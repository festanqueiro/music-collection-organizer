// Renderer side of casting. In stream mode (a TV with "Show visualizer"
// on) it records MCO's live output — the mixed audio (castMixer) plus the
// visualizer picture (castFrames) — with MediaRecorder and streams the
// chunks to the main process, which encodes them to HLS for the TV
// (electron/main/cast/); the TV plays a few seconds behind. In direct mode
// (speakers, or "Show visualizer" off) nothing is recorded: the device
// plays each track file itself, driven by the Player (directCast.ts).
import { useCollectionStore } from '../state/store'
import { startCastMixer, stopCastMixer } from './castMixer'
import { CastFrameRenderer } from './castFrames'
import { FramePacer } from './framePacer'
import type { CastDevice, CastMode, CastStatus } from '../types'

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

interface LocalSession {
  video: { frames: CastFrameRenderer; pacer: FramePacer; track: CanvasCaptureMediaStreamTrack } | null
  recorder: MediaRecorder | null
}

let local: LocalSession | null = null
// The device of the current (or last) session, so switching mode can
// restart casting to the same device.
let currentDevice: CastDevice | null = null

export function isCastActive(status: CastStatus): boolean {
  return status.state === 'connecting' || status.state === 'buffering' || status.state === 'casting'
}

// Speakers can't show the visualizer, and without it there's nothing the
// live stream gives that the device playing the file itself doesn't do
// better (instant controls, full quality) — except MCO's effects.
export function castModeFor(device: CastDevice, showVisualizer: boolean): CastMode {
  return device.audioOnly || !showVisualizer ? 'direct' : 'stream'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

export async function startCasting(device: CastDevice): Promise<void> {
  teardownLocal()
  currentDevice = device
  const { setCastStatus: setStatus, castShowVisualizer } = useCollectionStore.getState()
  const mode = castModeFor(device, castShowVisualizer)

  if (mode === 'direct') {
    try {
      await window.api.startCast(device.id, 'direct')
    } catch (err) {
      setStatus({ state: 'error', error: errorMessage(err) })
    }
    return
  }

  const audioTrack = startCastMixer()
  const session: LocalSession = { video: null, recorder: null }
  const frames = new CastFrameRenderer()
  const track = frames.canvas.captureStream(0).getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  // A failing frame (e.g. a theme throwing) is logged once rather than
  // every tick, and doesn't stop the stream — the next frame may work.
  let loggedDrawError = false
  const pacer = new FramePacer(
    FPS,
    () => {
      try {
        frames.draw()
      } catch (err) {
        if (!loggedDrawError) console.error('cast frame failed', err)
        loggedDrawError = true
      }
      track.requestFrame()
    },
    (stats) => {
      if (local === session) useCollectionStore.getState().setCastFrameStats(stats)
    },
  )
  session.video = { frames, pacer, track }
  local = session

  try {
    await window.api.startCast(device.id, 'stream')
  } catch (err) {
    teardownLocal()
    setStatus({ state: 'error', error: errorMessage(err) })
    return
  }
  if (local !== session) return

  const mimeType = VIDEO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
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

// Restarts a running cast to the same device in whichever mode the
// current settings call for (e.g. after "Show visualizer" was toggled).
export function restartCasting(): void {
  const status = useCollectionStore.getState().castStatus
  if (!currentDevice || !isCastActive(status)) return
  const mode = castModeFor(currentDevice, useCollectionStore.getState().castShowVisualizer)
  if (mode !== status.mode) void startCasting(currentDevice)
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
    session.video.pacer.stop()
    session.video.track.stop()
    session.video.frames.dispose()
  }
  stopCastMixer()
  useCollectionStore.getState().setCastFrameStats(null)
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

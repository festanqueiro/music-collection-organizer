// src/audio/recordingSession.ts
//
// Starting and stopping a recording from the UI (the REC popover), with
// the rule that recording and casting never run together: REC is refused
// while casting, and casting while recording (cast/castSession.ts).
import { useCollectionStore } from '../state/store'
import { isCastActive } from '../cast/castSession'
import { Recorder } from './recorder'

let recorder: Recorder | null = null

export function getActiveRecorder(): Recorder | null {
  return recorder
}

export async function startRecording(): Promise<void> {
  const store = useCollectionStore.getState()
  if (store.recordingState !== 'idle') return
  if (isCastActive(store.castStatus)) {
    store.showToast('Stop casting to record')
    return
  }
  store.setRecordingState('starting')
  store.setLastRecordingPath(null)
  try {
    recorder = await Recorder.start()
    useCollectionStore.getState().setRecordingState('recording')
  } catch (err) {
    console.error('failed to start recording', err)
    recorder = null
    useCollectionStore.getState().setRecordingState('idle')
    useCollectionStore.getState().showToast("Couldn't start recording")
  }
}

export async function stopRecording(): Promise<void> {
  const store = useCollectionStore.getState()
  if (!recorder || store.recordingState !== 'recording') return
  const active = recorder
  store.setRecordingState('stopping')
  try {
    const result = await active.stop(store.recordingFormat)
    const after = useCollectionStore.getState()
    after.setLastRecordingPath(result.path)
    after.showToast(result.error ?? 'Recording saved')
  } catch (err) {
    console.error('failed to stop recording', err)
    useCollectionStore.getState().showToast("Couldn't finish the recording")
  } finally {
    recorder = null
    useCollectionStore.getState().setRecordingState('idle')
  }
}

// Call once at startup: a full WAV (~6 h) stops the recording.
export function initRecording(): () => void {
  return window.api.onRecordingFull(() => {
    void stopRecording()
  })
}

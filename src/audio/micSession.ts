// src/audio/micSession.ts
//
// Keeps the mic's audio chain (mic.ts) in step with the store: opens the
// input when the Mic is switched on (asking macOS for permission the first
// time), closes it when switched off, reopens it on a device change, and
// passes on settings, Talk and Throw. The mic always starts off, so MCO
// never opens a microphone on its own.
import { useCollectionStore } from '../state/store'
import { MicChain, type MicLevels } from './mic'
import type { MicSettings } from '../types'

let chain: MicChain | null = null
let opening: Promise<void> | null = null
const levelListeners = new Set<(levels: MicLevels) => void>()

// The mic's input level (and the gated voice), about 50 times a second,
// for the level meter. Nothing is sent while the mic is off.
export function subscribeToMicLevels(listener: (levels: MicLevels) => void): () => void {
  levelListeners.add(listener)
  return () => levelListeners.delete(listener)
}

function turnOff(message: string): void {
  const store = useCollectionStore.getState()
  store.setMicSettings({ ...store.micSettings, enabled: false })
  store.showToast(message)
}

async function open(settings: MicSettings): Promise<void> {
  const allowed = await window.api.requestMicAccess()
  if (!allowed) {
    turnOff('MCO isn’t allowed to use the microphone — allow it in System Settings → Privacy & Security → Microphone')
    return
  }
  try {
    const opened = await MicChain.open(settings)
    // Switched off (or the input changed) while it was opening.
    const current = useCollectionStore.getState()
    if (
      !current.micSettings.enabled ||
      current.micSettings.deviceId !== settings.deviceId ||
      current.micSettings.noiseSuppression !== settings.noiseSuppression
    ) {
      opened.close()
      return
    }
    chain = opened
    chain.onLevels((levels) => {
      for (const listener of levelListeners) listener(levels)
    })
    chain.update(current.micSettings)
    chain.setLive(current.micLive)
    chain.setThrow(current.micThrow)
  } catch (err) {
    console.error('failed to open the mic', err)
    turnOff(`Couldn’t open the microphone${err instanceof Error ? `: ${err.message}` : ''}`)
  }
}

function close(): void {
  chain?.close()
  chain = null
}

function sync(): void {
  const { micSettings } = useCollectionStore.getState()
  if (!micSettings.enabled) {
    close()
    return
  }
  if (chain || opening) return
  opening = open(micSettings).finally(() => {
    opening = null
    // Settings may have changed while it opened (off again, another device).
    const latest = useCollectionStore.getState().micSettings
    if (!latest.enabled && chain) close()
    else if (latest.enabled && !chain) sync()
  })
}

// Call once at startup.
export function initMic(): () => void {
  const unsubscribe = useCollectionStore.subscribe((state, previous) => {
    if (state.micSettings !== previous.micSettings) {
      // Both are fixed when the input is opened, so a change reopens it.
      const inputChanged =
        state.micSettings.deviceId !== previous.micSettings.deviceId ||
        state.micSettings.noiseSuppression !== previous.micSettings.noiseSuppression
      if (state.micSettings.enabled !== previous.micSettings.enabled || inputChanged) {
        if (inputChanged) close()
        sync()
      } else {
        chain?.update(state.micSettings)
      }
    }
    if (state.micLive !== previous.micLive) chain?.setLive(state.micLive)
    if (state.micThrow !== previous.micThrow) chain?.setThrow(state.micThrow)
  })
  return () => {
    unsubscribe()
    close()
  }
}

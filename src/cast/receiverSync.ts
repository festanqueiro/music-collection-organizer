// Keeps MCO's own Cast app on the device in step with MCO — what it
// displays (the now-playing screen or a TV visualizer, as picked in the
// Cast menu), the FX chain and volume,
// the Dub Siren trigger, and the current track's details and the queue
// for the now-playing screen. Sends everything once when a session starts
// in MCO's app, then just what changes.
import { useCollectionStore, type CollectionState } from '../state/store'
import type { ReceiverSettingsMessage } from './receiverProtocol'
import { buildReceiverQueue } from './receiverQueue'
import { TV_VISUALIZER_OPTIONS } from './tvVisualizers'

// FX knobs (and MIDI) can move many times a second; the TV only needs the
// latest value about this often.
const EFFECTS_THROTTLE_MS = 50
// Tracks change in bursts while a folder is being analysed; the queue
// summary on the TV can lag by this much.
const QUEUE_THROTTLE_MS = 500

function receiverActive(state: CollectionState): boolean {
  return state.castStatus.state === 'casting' && state.castStatus.mode === 'receiver'
}

function displayMessage(state: CollectionState): ReceiverSettingsMessage {
  return {
    type: 'display',
    // Picked in the Cast menu. Speakers have nothing to show it on.
    showVisualizer: state.castScreen !== 'now-playing' && !state.castStatus.audioOnly,
    // The TV shows its own (GPU-free) themes only.
    theme: state.castScreen === 'now-playing' ? 'tv-drift' : state.castScreen,
    options: TV_VISUALIZER_OPTIONS,
    hideTrackInfo: state.visualizerHideTrackInfo,
  }
}

function effectsMessage(state: CollectionState): ReceiverSettingsMessage {
  return { type: 'effects', settings: state.effectsSettings, volume: state.playerVolume }
}

export function initReceiverSync(): () => void {
  const send = (message: ReceiverSettingsMessage) => window.api.sendReceiverSettings(message)
  let effectsTimer: ReturnType<typeof setTimeout> | null = null
  let queueTimer: ReturnType<typeof setTimeout> | null = null

  const sendEffectsSoon = () => {
    if (effectsTimer) return
    effectsTimer = setTimeout(() => {
      effectsTimer = null
      const state = useCollectionStore.getState()
      if (receiverActive(state)) send(effectsMessage(state))
    }, EFFECTS_THROTTLE_MS)
  }

  const sendQueueSoon = () => {
    if (queueTimer) return
    queueTimer = setTimeout(() => {
      queueTimer = null
      const state = useCollectionStore.getState()
      if (receiverActive(state)) send(buildReceiverQueue(state))
    }, QUEUE_THROTTLE_MS)
  }

  const unsubscribe = useCollectionStore.subscribe((state, previous) => {
    if (!receiverActive(state)) return
    if (!receiverActive(previous)) {
      // Session just started: bring the TV fully up to date.
      send(displayMessage(state))
      send(effectsMessage(state))
      send(buildReceiverQueue(state))
      return
    }
    if (
      state.castScreen !== previous.castScreen ||
      state.visualizerHideTrackInfo !== previous.visualizerHideTrackInfo
    ) {
      send(displayMessage(state))
    }
    if (state.effectsSettings !== previous.effectsSettings || state.playerVolume !== previous.playerVolume) {
      sendEffectsSoon()
    }
    if (state.playlist[0] !== previous.playlist[0]) {
      // A new track: show its details as soon as it loads.
      send(buildReceiverQueue(state))
    } else if (
      state.playlist !== previous.playlist ||
      state.tracks !== previous.tracks ||
      state.trackTags !== previous.trackTags ||
      state.genres !== previous.genres ||
      state.subgenres !== previous.subgenres ||
      state.keyNotation !== previous.keyNotation
    ) {
      sendQueueSoon()
    }
    if (state.sirenTriggered !== previous.sirenTriggered) send({ type: 'siren', held: state.sirenTriggered })
  })

  return () => {
    unsubscribe()
    if (effectsTimer) clearTimeout(effectsTimer)
    if (queueTimer) clearTimeout(queueTimer)
  }
}

// Receiver cast mode: keeps MCO's own receiver app on the TV in step with
// MCO — what it displays (visualizer theme/options, or the now-playing
// screen), the FX chain and volume, and the Dub Siren trigger. Sends
// everything once when a receiver session starts, then just what changes.
import { useCollectionStore, type CollectionState } from '../state/store'
import type { ReceiverSettingsMessage } from './receiverProtocol'

// FX knobs (and MIDI) can move many times a second; the TV only needs the
// latest value about this often.
const EFFECTS_THROTTLE_MS = 50

function receiverActive(state: CollectionState): boolean {
  return state.castStatus.state === 'casting' && state.castStatus.mode === 'receiver'
}

function displayMessage(state: CollectionState): ReceiverSettingsMessage {
  return {
    type: 'display',
    // Speakers have nothing to show it on.
    showVisualizer: state.castShowVisualizer && !state.castStatus.audioOnly,
    theme: state.visualizerTheme,
    options: state.visualizerThemeOptions[state.visualizerTheme] ?? {},
    hideTrackInfo: state.visualizerHideTrackInfo,
  }
}

function effectsMessage(state: CollectionState): ReceiverSettingsMessage {
  return { type: 'effects', settings: state.effectsSettings, volume: state.playerVolume }
}

export function initReceiverSync(): () => void {
  const send = (message: ReceiverSettingsMessage) => window.api.sendReceiverSettings(message)
  let effectsTimer: ReturnType<typeof setTimeout> | null = null

  const sendEffectsSoon = () => {
    if (effectsTimer) return
    effectsTimer = setTimeout(() => {
      effectsTimer = null
      const state = useCollectionStore.getState()
      if (receiverActive(state)) send(effectsMessage(state))
    }, EFFECTS_THROTTLE_MS)
  }

  const unsubscribe = useCollectionStore.subscribe((state, previous) => {
    if (!receiverActive(state)) return
    if (!receiverActive(previous)) {
      // Session just started: bring the TV fully up to date.
      send(displayMessage(state))
      send(effectsMessage(state))
      return
    }
    if (
      state.castShowVisualizer !== previous.castShowVisualizer ||
      state.visualizerTheme !== previous.visualizerTheme ||
      state.visualizerThemeOptions !== previous.visualizerThemeOptions ||
      state.visualizerHideTrackInfo !== previous.visualizerHideTrackInfo
    ) {
      send(displayMessage(state))
    }
    if (state.effectsSettings !== previous.effectsSettings || state.playerVolume !== previous.playerVolume) {
      sendEffectsSoon()
    }
    if (state.sirenTriggered !== previous.sirenTriggered) send({ type: 'siren', held: state.sirenTriggered })
  })

  return () => {
    unsubscribe()
    if (effectsTimer) clearTimeout(effectsTimer)
  }
}

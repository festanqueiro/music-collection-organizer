// Renderer side of starting and stopping a cast. The device plays each
// track itself — in MCO's own Cast app where it can, Google's player
// otherwise (see electron/main/cast/castSession.ts) — with the Player as
// its remote (directCast.ts) and MCO's app kept in step with MCO's
// effects, siren and visualizer (receiverSync.ts).
import { useCollectionStore } from '../state/store'
import type { CastDevice, CastStatus } from '../types'

export function isCastActive(status: CastStatus): boolean {
  return status.state === 'connecting' || status.state === 'casting'
}

// Casting to a device with a screen, in MCO's own app: the TV shows what's
// picked in the Cast menu (now playing or a TV visualizer), and MCO's own
// visualizer is off.
export function castingToAScreen(status: CastStatus): boolean {
  return isCastActive(status) && status.mode === 'receiver' && !status.audioOnly
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

export async function startCasting(device: CastDevice): Promise<void> {
  // Recording and casting never run together (docs/features/recording.md).
  if (useCollectionStore.getState().recordingState !== 'idle') {
    useCollectionStore.getState().showToast('Stop recording to cast')
    return
  }
  try {
    await window.api.startCast(device.id)
  } catch (err) {
    useCollectionStore.getState().setCastStatus({ state: 'error', error: errorMessage(err) })
  }
}

export function stopCasting(): void {
  window.api.stopCast()
}

// Wires main-process cast events into the store; call once at startup.
export function initCast(): () => void {
  const offStatus = window.api.onCastStatus((status) => useCollectionStore.getState().setCastStatus(status))
  const offDevices = window.api.onCastDevices((devices) => useCollectionStore.getState().setCastDevices(devices))
  // Next, pressed on the TV's remote: move the queue on as MCO's own Next
  // button does (the TV then gets the new track like any other).
  const offRemote = window.api.onCastRemote((command) => {
    if (command === 'next') void useCollectionStore.getState().advanceToNext()
  })
  // Picks up a session that outlived a renderer reload.
  window.api.getCastStatus().then((status) => useCollectionStore.getState().setCastStatus(status))
  return () => {
    offStatus()
    offDevices()
    offRemote()
  }
}

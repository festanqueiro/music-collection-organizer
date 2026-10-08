// src/components/MicButton.tsx
//
// Player-bar button + popover for the mic (docs/features/recording.md#mic):
// on/off, the input, its level, Talk and Hear myself — like Cast's menu.
// The mic's effects are in the Mic FX group of the FX and Live screens.
import { useToolbarPopover } from './useToolbarPopover'
import { useCollectionStore } from '../state/store'
import { MidiLearnBadge } from './MidiLearnBadge'
import { ToggleSwitch } from './ToggleSwitch'
import { HoldButton, LevelMeter, useInputDevices } from './MicWidgets'
import { barIconButtonStyle } from './playerBarStyles'

const POPOVER_WIDTH = 320

export function MicButton() {
  const { open, anchor, buttonRef, popoverRef, toggleOpen } = useToolbarPopover(POPOVER_WIDTH)
  const mic = useCollectionStore((s) => s.micSettings)
  const setMic = useCollectionStore((s) => s.setMicSettings)
  const live = useCollectionStore((s) => s.micLive)
  const talkDown = useCollectionStore((s) => s.micTalkDown)
  const talkUp = useCollectionStore((s) => s.micTalkUp)
  const devices = useInputDevices()
  const update = (partial: Partial<typeof mic>) => setMic({ ...useCollectionStore.getState().micSettings, ...partial })

  const title = !mic.enabled ? 'Microphone' : live ? 'Mic on and live' : 'Mic on, muted (Talk or T to unmute)'
  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title={title}
        aria-label="Microphone"
        // Lit while the mic is live; on but muted shows the muted icon.
        style={barIconButtonStyle(open, mic.enabled && live)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          {mic.enabled && !live ? 'mic_off' : 'mic'}
        </span>
      </button>
      {open && anchor && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            left: anchor.left,
            bottom: anchor.bottom,
            width: POPOVER_WIDTH,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '10px',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 500, flex: 1 }}>Mic</span>
            <MidiLearnBadge control="mic.enabled" />
            <ToggleSwitch checked={mic.enabled} onChange={(checked) => update({ enabled: checked })} title="Mic on/off" />
          </div>

          <select
            value={mic.deviceId ?? ''}
            onChange={(e) => update({ deviceId: e.target.value || null })}
            title="Microphone"
            style={{ fontSize: '12px', width: '100%' }}
          >
            <option value="">System default input</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || 'Microphone'}
              </option>
            ))}
          </select>

          <LevelMeter active={mic.enabled} />

          <label
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            title="Takes out steady background noise (fans, hum, street), at some cost to the voice. Reopens the mic."
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              noise_control_off
            </span>
            <span style={{ flex: 1 }}>Noise suppression</span>
            <ToggleSwitch
              checked={mic.noiseSuppression}
              onChange={(checked) => update({ noiseSuppression: checked })}
              title="Noise suppression on/off"
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HoldButton
              label={live ? 'TALK · live' : 'TALK · muted'}
              lit={mic.enabled && live}
              disabled={!mic.enabled}
              title="Tap to mute or unmute; hold while muted to talk (T)"
              onDown={talkDown}
              onUp={talkUp}
            />
            <MidiLearnBadge control="mic.talk" />
            <label
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              title="Hear the mic through the speakers — use headphones, or it feeds back"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                headphones
              </span>
              Hear myself
              <ToggleSwitch checked={mic.monitor} onChange={(checked) => update({ monitor: checked })} title="Hear the mic through the speakers" />
            </label>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
            Recorded when on; heard through the speakers only with Hear myself. Its effects are under Mic FX on
            the FX and Live screens.
          </div>
        </div>
      )}
    </>
  )
}

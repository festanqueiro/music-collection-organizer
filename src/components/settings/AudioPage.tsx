import { useEffect, useState } from 'react'
import { useCollectionStore } from '../../state/store'
import { Hint, Message, Page, Section } from './ui'

export function AudioPage() {
  const audioOutputDeviceId = useCollectionStore((s) => s.audioOutputDeviceId)
  const setAudioOutputDeviceId = useCollectionStore((s) => s.setAudioOutputDeviceId)
  const cueOutputDeviceId = useCollectionStore((s) => s.cueOutputDeviceId)
  const setCueOutputDeviceId = useCollectionStore((s) => s.setCueOutputDeviceId)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  // Real device names come from main's 'media' permission-check grant
  // (see registerPermissionHandlers in electron/main/index.ts) — no mic
  // stream is ever opened, which would otherwise drop Bluetooth
  // headphones into their low-quality hands-free profile. Only listed
  // once this page is actually opened.
  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (cancelled) return
        setDevices(all.filter((d) => d.kind === 'audiooutput'))
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError('Could not list audio output devices.')
        console.error('enumerateDevices failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const deviceSelect = (value: string | null, onChange: (id: string | null) => void) => (
    <div>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} style={{ maxWidth: '100%' }}>
        <option value="">System default</option>
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Audio output ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <Page title="Audio" description="Where MCO's sound goes.">
      <Section
        title="Main output"
        description="Route playback to a specific audio interface instead of the system default — applies to both track playback and the Dub Siren."
      >
        {deviceSelect(audioOutputDeviceId, setAudioOutputDeviceId)}
        {error && <Message error>{error}</Message>}
      </Section>

      <Section
        title="Cue output (headphones)"
        description="Where pre-listen plays (the headphones icon on a track, or P) — pick your headphones or a second output on your audio interface so you can audition the next track while the main output keeps playing."
      >
        {deviceSelect(cueOutputDeviceId, setCueOutputDeviceId)}
        {(cueOutputDeviceId ?? '') === (audioOutputDeviceId ?? '') && (
          <Hint>Same as the main output, so previews will be heard on the main speakers too.</Hint>
        )}
      </Section>
    </Page>
  )
}

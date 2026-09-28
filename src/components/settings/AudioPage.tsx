import { useCollectionStore } from '../../state/store'
import { Hint, Message, Page, Section } from './ui'
import { VisualDelayControl } from '../VisualDelayControl'
import { OutputSelect, sameOutput, useAudioOutputs } from '../audioOutputs'

export function AudioPage() {
  const audioOutputDeviceId = useCollectionStore((s) => s.audioOutputDeviceId)
  const setAudioOutputDeviceId = useCollectionStore((s) => s.setAudioOutputDeviceId)
  const cueOutputDeviceId = useCollectionStore((s) => s.cueOutputDeviceId)
  const setCueOutputDeviceId = useCollectionStore((s) => s.setCueOutputDeviceId)
  const { devices, error } = useAudioOutputs()

  const deviceSelect = (value: string | null, onChange: (id: string | null) => void) => (
    <div>
      <OutputSelect value={value} onChange={onChange} devices={devices} />
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
        {sameOutput(cueOutputDeviceId, audioOutputDeviceId) && (
          <Hint>Same as the main output, so previews will be heard on the main speakers too.</Hint>
        )}
      </Section>

      <Section
        title="Visual delay"
        description="Holds the visualizer (on the Mac and on a second screen) back, to line it up with sound that reaches the room late — AirPlay to an Apple TV is usually 1–2 s behind, Bluetooth speakers a little. The sound itself isn't delayed."
      >
        <VisualDelayControl />
      </Section>
    </Page>
  )
}

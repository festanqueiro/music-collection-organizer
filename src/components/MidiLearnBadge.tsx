// src/components/MidiLearnBadge.tsx
import { useCollectionStore } from '../state/store'
import type { MidiControlKey } from '../types'

// Three-state MIDI-learn toggle for one control: unbound (click to start
// listening) → learning (move a hardware knob to bind it, or click to
// cancel) → bound (shows the CC number, click to unbind). Styled by the
// .midi-badge class in theme.css. Hidden entirely when the "Show MIDI
// mapping buttons" setting is off — existing bindings keep working.
export function MidiLearnBadge({ control }: { control: MidiControlKey }) {
  const showMidiControls = useCollectionStore((s) => s.showMidiControls)
  const midiMappings = useCollectionStore((s) => s.midiMappings)
  const midiLearningControl = useCollectionStore((s) => s.midiLearningControl)
  const startMidiLearn = useCollectionStore((s) => s.startMidiLearn)
  const cancelMidiLearn = useCollectionStore((s) => s.cancelMidiLearn)
  const clearMidiMapping = useCollectionStore((s) => s.clearMidiMapping)

  const binding = midiMappings[control]
  if (!showMidiControls) return null

  if (midiLearningControl === control) {
    return (
      <button
        onClick={cancelMidiLearn}
        title="Move a MIDI knob to bind, or click to cancel"
        className="midi-badge"
        data-state="learning"
      >
        Listening…
      </button>
    )
  }

  if (binding) {
    return (
      <button
        onClick={() => clearMidiMapping(control)}
        title={`Bound to CC${binding.controller} (channel ${binding.channel + 1}) — click to unbind`}
        className="midi-badge"
        data-state="bound"
      >
        CC{binding.controller}
      </button>
    )
  }

  return (
    <button
      onClick={() => startMidiLearn(control)}
      title="Click, then move a MIDI knob to bind it"
      className="midi-badge"
      data-state="unbound"
    >
      <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>
        piano
      </span>
    </button>
  )
}

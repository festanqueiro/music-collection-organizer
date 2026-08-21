// src/components/MidiLearnBadge.tsx
import { useCollectionStore } from '../state/store'
import type { MidiControlKey } from '../types'

// Three-state MIDI-learn toggle for one control: unbound (click to start
// listening) → learning (move a hardware knob to bind it, or click to
// cancel) → bound (shows the CC number, click to unbind).
export function MidiLearnBadge({ control }: { control: MidiControlKey }) {
  const midiMappings = useCollectionStore((s) => s.midiMappings)
  const midiLearningControl = useCollectionStore((s) => s.midiLearningControl)
  const startMidiLearn = useCollectionStore((s) => s.startMidiLearn)
  const cancelMidiLearn = useCollectionStore((s) => s.cancelMidiLearn)
  const clearMidiMapping = useCollectionStore((s) => s.clearMidiMapping)

  const binding = midiMappings[control]
  const badgeStyle = { fontSize: '10px', padding: '0 4px' }

  if (midiLearningControl === control) {
    return (
      <button onClick={cancelMidiLearn} title="Move a MIDI knob to bind, or click to cancel" style={badgeStyle}>
        Listening…
      </button>
    )
  }

  if (binding) {
    return (
      <button
        onClick={() => clearMidiMapping(control)}
        title={`Bound to CC${binding.controller} (channel ${binding.channel + 1}) — click to unbind`}
        style={badgeStyle}
      >
        CC{binding.controller}
      </button>
    )
  }

  return (
    <button onClick={() => startMidiLearn(control)} title="Click, then move a MIDI knob to bind it" style={badgeStyle}>
      <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>
        piano
      </span>
    </button>
  )
}

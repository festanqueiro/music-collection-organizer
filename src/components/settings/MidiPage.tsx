import { useState } from 'react'
import { useCollectionStore } from '../../state/store'
import type { MidiMappings } from '../../types'
import { ConfirmDialog } from '../ConfirmDialog'
import { ButtonRow, Hint, Message, Page, Section, ToggleRow } from './ui'

export function MidiPage() {
  const showMidiControls = useCollectionStore((s) => s.showMidiControls)
  const setShowMidiControls = useCollectionStore((s) => s.setShowMidiControls)
  const midiBindingCount = useCollectionStore((s) => Object.keys(s.midiMappings).length)
  const resetMidiMappings = useCollectionStore((s) => s.resetMidiMappings)
  const replaceMidiMappings = useCollectionStore((s) => s.replaceMidiMappings)
  const showToast = useCollectionStore((s) => s.showToast)
  // Both reset and an import that would overwrite existing bindings go
  // through the same warning popup.
  const [confirm, setConfirm] = useState<
    { kind: 'reset' } | { kind: 'import'; mappings: MidiMappings; skipped: string[] } | null
  >(null)
  const [message, setMessage] = useState<string | null>(null)

  function applyImport(mappings: MidiMappings, skipped: string[]) {
    replaceMidiMappings(mappings)
    const count = Object.keys(mappings).length
    setMessage(
      `Imported ${count} binding${count === 1 ? '' : 's'}` +
        (skipped.length > 0 ? ` — skipped ${skipped.length} unknown/invalid: ${skipped.join(', ')}` : '')
    )
  }

  async function handleImport() {
    const result = await window.api.readMidiMappingsFile()
    if (!result) return
    if ('error' in result) {
      setMessage(result.error)
      return
    }
    if (Object.keys(result.mappings).length === 0) {
      setMessage("That file doesn't contain any bindings this version can use.")
      return
    }
    if (midiBindingCount > 0) setConfirm({ kind: 'import', ...result })
    else applyImport(result.mappings, result.skipped)
  }

  return (
    <Page title="MIDI" description="Map a controller's knobs, faders and buttons to the player and FX.">
      <Section title="Mapping buttons">
        <ToggleRow
          label="Show MIDI mapping buttons"
          hint="The small MIDI-learn buttons next to the player and FX controls. Hiding them doesn't remove any bindings — a mapped controller keeps working."
          checked={showMidiControls}
          onChange={setShowMidiControls}
        />
      </Section>

      <Section title="Bindings">
        <Hint>
          {midiBindingCount === 0
            ? 'No controls mapped yet.'
            : `${midiBindingCount} control${midiBindingCount === 1 ? '' : 's'} mapped.`}{' '}
          Export them to keep a copy or move them to another Mac.
        </Hint>
        <ButtonRow>
          <button
            onClick={async () => {
              const result = await window.api.exportMidiMappings()
              if (result) setMessage(`Exported to ${result.path}`)
            }}
            disabled={midiBindingCount === 0}
            title={midiBindingCount === 0 ? 'No MIDI bindings to export' : undefined}
          >
            Export…
          </button>
          <button onClick={handleImport}>Import…</button>
          <button
            onClick={() => setConfirm({ kind: 'reset' })}
            disabled={midiBindingCount === 0}
            title={midiBindingCount === 0 ? 'No MIDI bindings to reset' : undefined}
          >
            Reset all…
          </button>
        </ButtonRow>
        {message && <Message>{message}</Message>}
      </Section>

      {confirm?.kind === 'reset' && (
        <ConfirmDialog
          title="Reset all MIDI bindings?"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            resetMidiMappings()
            setConfirm(null)
            setMessage(null)
            showToast('All MIDI bindings removed')
          }}
        >
          This removes all {midiBindingCount} MIDI binding{midiBindingCount === 1 ? '' : 's'} — every mapped knob, fader
          and button will stop controlling the app until you map it again. This can't be undone.
        </ConfirmDialog>
      )}
      {confirm?.kind === 'import' && (
        <ConfirmDialog
          title="Replace your MIDI bindings?"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            applyImport(confirm.mappings, confirm.skipped)
            setConfirm(null)
          }}
        >
          Importing replaces all {midiBindingCount} current MIDI binding{midiBindingCount === 1 ? '' : 's'} with the{' '}
          {Object.keys(confirm.mappings).length} in this file. Export first if you want to keep the current ones — this
          can't be undone.
        </ConfirmDialog>
      )}
    </Page>
  )
}

# MIDI

Any FX knob or toggle, the player volume, and playback can be driven from a
hardware MIDI controller.

## Mapping a control (MIDI learn)

1. Turn on **Settings → MIDI → Show MIDI mapping buttons** (on by
   default). A small piano badge appears next to every mappable control.
2. Click the badge — it pulses while it's listening.
3. Move a knob/fader or press a button/pad on your controller. Done.

Click a mapped badge again to re-learn it. Bindings are saved.

- **Knobs and faders** (Control Change messages) move continuous controls
  and step through option lists (Delay Division, Siren Mode, Siren Beat).
- **Buttons and pads** (Note or CC) flip on/off toggles and fire
  momentary actions (Siren trigger, play/pause, next track, CUE). CUE
  reacts to both press and release, so holding a pad previews from the
  cue point.
- **LED feedback**: toggles and play/pause send their state back to the
  button's LED on controllers that support it.
- Fast MIDI bursts are applied at most once per frame so the on-screen
  knobs keep up with the hardware.

## Mappable controls

Player volume, master volume, play/pause, next track, CUE, and every control
in the [FX panel](fx.md): EQ, Filter, Delay (including Division), Reverb,
and the Dub Siren (including its trigger, Mode, and Beat), plus each
module's on/off toggle.

## Managing bindings

In **Settings → MIDI**:

- **Export…** saves all bindings to a JSON file;
- **Import…** loads a file (asks before replacing existing bindings;
  unknown controls in the file are skipped and listed);
- **Reset all MIDI bindings…** removes them all.

Code: `src/audio/midi.ts`, `src/components/MidiLearnBadge.tsx`,
`src/state/store.ts` (MIDI section), `electron/main/midiExport.ts`.

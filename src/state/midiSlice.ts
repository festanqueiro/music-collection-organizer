// src/state/midiSlice.ts
//
// The store's MIDI side (docs/features/midi.md): learning a control,
// the mappings, and what each mapped control does when it moves.
import type { MidiControlKey, MidiBinding } from '../types'
import { SIREN_MODES, SIREN_BEATS, DELAY_DIVISIONS } from '../types'
import { scaleMidiValue, scaleMidiValueToOption, sendMidiFeedback } from '../audio/midi'
import { MIC_KNOBS, MIC_TOGGLES, echoTimeForDivision } from '../audio/micControls'
import { getDubSirenEngine } from '../audio/sirenEngine'
import type { StoreApi } from 'zustand'
import type { CollectionState } from './store'

// Coalesces rapid MIDI CC bursts to at most one store update per animation
// frame, per control — a touch-sensitive hardware knob/fader can send
// hundreds of CC messages a second, and applying every single one
// synchronously (a full setEffectsSettings call: re-renders every knob in
// FxPanel, which subscribes to the whole effectsSettings object, plus
// reschedules the debounced-save timer) floods the render loop far faster
// than the UI can keep up — the on-screen knob visibly lags well behind
// the physical one. This is the same reasoning as FxPanel's own
// useRafThrottledCommit for mouse-dragged knobs, just applied at the
// actual bottleneck (every MIDI-driven continuous control, not only the
// two knobs that hook happens to cover) — mouse drags fire at the
// browser's own pointermove rate (already frame-aligned-ish), MIDI CC
// bursts don't. Keyed per control so turning two knobs in the same frame
// commits both, and each commit re-reads the store fresh when it actually
// runs (not a snapshot captured back when it was scheduled), so neither
// clobbers a change the other already applied earlier in the same frame.
const pendingMidiCommits = new Map<string, () => void>()
let midiRafScheduled = false

function scheduleMidiCommit(key: string, commit: () => void): void {
  pendingMidiCommits.set(key, commit)
  if (midiRafScheduled) return
  midiRafScheduled = true
  const flush = () => {
    midiRafScheduled = false
    const commits = [...pendingMidiCommits.values()]
    pendingMidiCommits.clear()
    for (const c of commits) c()
  }
  // requestAnimationFrame doesn't exist outside a real browser environment
  // (e.g. this module under Vitest's node environment) — a ~60fps
  // setTimeout fallback keeps the same coalescing behavior there instead
  // of throwing.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
  else setTimeout(flush, 16)
}

type Set = StoreApi<CollectionState>['setState']
type Get = StoreApi<CollectionState>['getState']

// What this slice gives the store.
type MidiSliceKeys =
  | 'startMidiLearn'
  | 'cancelMidiLearn'
  | 'clearMidiMapping'
  | 'resetMidiMappings'
  | 'replaceMidiMappings'
  | 'handleMidiControlChange'

export function createMidiSlice(set: Set, get: Get): Pick<CollectionState, MidiSliceKeys> {
  return {
    startMidiLearn: (control) => set({ midiLearningControl: control }),

    cancelMidiLearn: () => set({ midiLearningControl: null }),

    clearMidiMapping: (control) => {
      const mappings = { ...get().midiMappings }
      delete mappings[control]
      set({ midiMappings: mappings })
      window.api.setMidiMappings(mappings).catch((err) => console.error('failed to save midi mappings', err))
    },

    resetMidiMappings: () => get().replaceMidiMappings({}),

    replaceMidiMappings: (mappings) => {
      set({ midiMappings: mappings, midiLearningControl: null })
      window.api.setMidiMappings(mappings).catch((err) => console.error('failed to save midi mappings', err))
    },

    // Called by the single global MIDI listener mounted in App.tsx — either
    // binds the incoming CC to whichever control is in "learn" mode, or (if
    // nothing is learning) looks up a matching existing binding and applies
    // the scaled value to the corresponding piece of state.
    handleMidiControlChange: (channel, controller, value, kind) => {
      // The mic's controls (micControls.ts): toggles flip on the press,
      // Talk and Throw act on press and release, knobs commit once a frame.
      function handleMicMidi(control: MidiControlKey, midiValue: number): void {
        if (control === 'mic.talk') {
          if (midiValue !== 0) get().micTalkDown()
          else get().micTalkUp()
          return
        }
        if (control === 'mic.echo.throw') {
          get().setMicThrow(midiValue !== 0)
          return
        }
        if (control === 'mic.echo.division') {
          const { playlist, tracks } = get()
          const bpm = tracks.find((t) => t.id === playlist[0])?.bpm
          if (!bpm) return
          const division = scaleMidiValueToOption(DELAY_DIVISIONS, midiValue)
          const ms = echoTimeForDivision(bpm, division.beats)
          get().setMicSettings({ ...get().micSettings, echo: { ...get().micSettings.echo, timeMs: ms } })
          return
        }
        const toggle = MIC_TOGGLES[control]
        if (toggle) {
          if (midiValue === 0) return
          const mic = get().micSettings
          get().setMicSettings(toggle.set(mic, !toggle.get(mic)))
          return
        }
        const knob = MIC_KNOBS[control]
        if (knob) {
          const scaledValue = scaleMidiValue(control, midiValue)
          scheduleMidiCommit(control, () => get().setMicSettings(knob(get().micSettings, scaledValue)))
        }
      }

      const learning = get().midiLearningControl
      if (learning) {
        const binding: MidiBinding = { channel, controller, kind }
        // A stale binding on another control key can already occupy this
        // exact physical channel+controller+kind (e.g. it was tried against
        // a different control earlier, or the same hardware button was
        // re-learned for something else without unbinding the old one
        // first) — handleMidiControlChange's lookup below picks the FIRST
        // key it finds for a given channel+controller, so leaving that
        // stale entry in place meant the button just learned here could
        // silently keep triggering the OLD control instead, looking exactly
        // like "I assigned it and now it does nothing". Learning a control
        // onto a physical button always makes that button exclusively its.
        const previousMappings = { ...get().midiMappings }
        for (const key of Object.keys(previousMappings) as MidiControlKey[]) {
          if (key === learning) continue
          const existing = previousMappings[key]
          if (existing && existing.channel === channel && existing.controller === controller && (existing.kind ?? 'cc') === kind) {
            delete previousMappings[key]
          }
        }
        const mappings = { ...previousMappings, [learning]: binding }
        set({ midiMappings: mappings, midiLearningControl: null })
        window.api.setMidiMappings(mappings).catch((err) => console.error('failed to save midi mappings', err))
        // Sync the LED to the control's current state right away, rather
        // than leaving it showing whatever it happened to be at (e.g. lit
        // from a previous binding) until the next toggle.
        const currentEffectsSettings = get().effectsSettings
        if (learning === 'delay.enabled') sendMidiFeedback(binding, currentEffectsSettings.delay.enabled)
        else if (learning === 'reverb.enabled') sendMidiFeedback(binding, currentEffectsSettings.reverb.enabled)
        else if (learning === 'filter.enabled') sendMidiFeedback(binding, currentEffectsSettings.filter.enabled)
        else if (learning === 'siren.enabled') sendMidiFeedback(binding, currentEffectsSettings.siren.enabled)
        else if (learning === 'mic.talk') sendMidiFeedback(binding, get().micLive)
        else if (MIC_TOGGLES[learning]) sendMidiFeedback(binding, MIC_TOGGLES[learning].get(get().micSettings))
        return
      }

      const mappings = get().midiMappings
      // kind must match too, not just channel+controller — Note and CC
      // messages occupy independent number spaces on real hardware (Note 25
      // and CC 25 are unrelated), so a Note-mapped control and a CC-mapped
      // control can legitimately share the same controller number without
      // being the same physical button. Ignoring kind here meant a Note
      // press could match whichever CC-bound control happened to iterate
      // first instead of the Note-bound control it was actually meant for —
      // e.g. a "Play Next" pad (Note 25) got treated as a filter.highpass
      // (CC 25) knob move and silently never advanced the queue.
      const match = (Object.keys(mappings) as MidiControlKey[]).find((key) => {
        const binding = mappings[key]
        return binding && binding.channel === channel && binding.controller === controller && (binding.kind ?? 'cc') === kind
      })
      if (!match) return

      // Discrete controls (a fixed option list, not a continuous range) are
      // handled before scaleMidiValue — a knob bound to one of these sweeps
      // through the options in order rather than producing a raw number.
      if (match === 'siren.mode' || match === 'siren.beat') {
        const effectsSettings = get().effectsSettings
        if (match === 'siren.mode') {
          get().setEffectsSettings({
            ...effectsSettings,
            siren: { ...effectsSettings.siren, mode: scaleMidiValueToOption(SIREN_MODES, value) },
          })
        } else {
          get().setEffectsSettings({
            ...effectsSettings,
            siren: { ...effectsSettings.siren, beat: scaleMidiValueToOption(SIREN_BEATS, value) },
          })
        }
        return
      }

      // Also discrete, but not a persisted setting — the same one-shot
      // "recompute delay.timeMs from the current track's BPM" action the
      // Division knob's UI performs on change, not a value that sticks
      // around (a track swap doesn't retroactively resync it, same as
      // turning the on-screen knob wouldn't either without moving it again).
      if (match === 'delay.division') {
        const index = DELAY_DIVISIONS.indexOf(scaleMidiValueToOption(DELAY_DIVISIONS, value))
        get().delayDivisionSync?.(index)
        return
      }

      // Momentary trigger, not a toggle like delay.enabled/reverb.enabled —
      // press (nonzero) sounds the siren for as long as it's held, release
      // (0) stops it, mirroring the on-screen button and the hold-S
      // keyboard shortcut exactly (same enabled/beat guard, same engine
      // calls) rather than flipping a persisted setting.
      if (match === 'siren.trigger') {
        const { siren } = get().effectsSettings
        const engine = getDubSirenEngine()
        if (value !== 0) {
          if (siren.enabled && siren.beat === 'off') {
            engine.resume()
            engine.triggerDown()
            set({ sirenTriggered: true })
          }
        } else {
          engine.triggerUp()
          set({ sirenTriggered: false })
        }
        return
      }

      // player.playPause toggles on the press edge (mirrors delay.enabled's
      // momentary-button handling) via the imperative toggle Player.tsx
      // registers on mount — a no-op if nothing's loaded. player.playNext
      // fires once per press with no release behavior, same as any other
      // one-shot trigger; it works even with nothing currently mounted,
      // since advanceToNext is a plain store action.
      if (match === 'player.playPause') {
        if (value !== 0) get().playbackControls?.toggle()
        return
      }
      if (match === 'player.playNext') {
        if (value !== 0) get().advanceToNext()
        return
      }
      // CDJ-style CUE: press and release both matter (holding at the cue
      // point previews, releasing snaps back), unlike playPause's press-only
      // edge.
      // Hot cue pads: press only (set or jump); release does nothing.
      if (match.startsWith('player.hotCue')) {
        if (value !== 0) get().playbackControls?.hotCue(Number(match.slice('player.hotCue'.length)) - 1)
        return
      }
      if (match === 'player.cue') {
        const controls = get().playbackControls
        if (value !== 0) controls?.cueDown()
        else controls?.cueUp()
        return
      }

      if (match.startsWith('mic.')) {
        handleMicMidi(match, value)
        return
      }

      const scaled = scaleMidiValue(match, value)
      if (match === 'volume') {
        scheduleMidiCommit('volume', () => get().setPlayerVolume(scaled))
        return
      }

      const effectsSettings = get().effectsSettings
      // delay.enabled/reverb.enabled are bound to a MIDI Mix mute-style
      // button, confirmed momentary (sends a nonzero message on press and a
      // 0 on release, rather than a hardware-latched on/off state) — mirroring
      // the raw value directly made the effect only stay on while physically
      // held. Toggle once on the press edge instead, and ignore the release
      // message entirely, so one tap flips the state and it stays there.
      // These are one-shot presses, not a continuous stream, so — unlike
      // every branch below — they apply immediately rather than through
      // scheduleMidiCommit.
      if (match === 'delay.enabled') {
        if (value === 0) return
        get().setEffectsSettings({
          ...effectsSettings,
          delay: { ...effectsSettings.delay, enabled: !effectsSettings.delay.enabled },
        })
      } else if (match === 'delay.timeMs') {
        scheduleMidiCommit('delay.timeMs', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, delay: { ...es.delay, timeMs: scaled } })
        })
      } else if (match === 'delay.feedback') {
        scheduleMidiCommit('delay.feedback', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, delay: { ...es.delay, feedback: scaled } })
        })
      } else if (match === 'delay.mix') {
        scheduleMidiCommit('delay.mix', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, delay: { ...es.delay, mix: scaled } })
        })
      } else if (match === 'reverb.enabled') {
        if (value === 0) return
        get().setEffectsSettings({
          ...effectsSettings,
          reverb: { ...effectsSettings.reverb, enabled: !effectsSettings.reverb.enabled },
        })
      } else if (match === 'reverb.mix') {
        scheduleMidiCommit('reverb.mix', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, reverb: { ...es.reverb, mix: scaled } })
        })
      } else if (match === 'reverb.decaySeconds') {
        scheduleMidiCommit('reverb.decaySeconds', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, reverb: { ...es.reverb, decaySeconds: scaled } })
        })
      } else if (match === 'reverb.preDelayMs') {
        scheduleMidiCommit('reverb.preDelayMs', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, reverb: { ...es.reverb, preDelayMs: scaled } })
        })
      } else if (match === 'filter.enabled') {
        if (value === 0) return
        get().setEffectsSettings({
          ...effectsSettings,
          filter: { ...effectsSettings.filter, enabled: !effectsSettings.filter.enabled },
        })
      } else if (match === 'filter.lowpass') {
        scheduleMidiCommit('filter.lowpass', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, filter: { ...es.filter, lowpass: scaled } })
        })
      } else if (match === 'filter.highpass') {
        scheduleMidiCommit('filter.highpass', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, filter: { ...es.filter, highpass: scaled } })
        })
      } else if (match === 'filter.resonance') {
        scheduleMidiCommit('filter.resonance', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, filter: { ...es.filter, resonance: scaled } })
        })
      } else if (match === 'filter.mix') {
        scheduleMidiCommit('filter.mix', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, filter: { ...es.filter, mix: scaled } })
        })
      } else if (match === 'eq.low') {
        scheduleMidiCommit('eq.low', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, eq: { ...es.eq, low: scaled } })
        })
      } else if (match === 'eq.mid') {
        scheduleMidiCommit('eq.mid', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, eq: { ...es.eq, mid: scaled } })
        })
      } else if (match === 'eq.high') {
        scheduleMidiCommit('eq.high', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, eq: { ...es.eq, high: scaled } })
        })

      } else if (match === 'siren.enabled') {
        if (value === 0) return
        get().setEffectsSettings({
          ...effectsSettings,
          siren: { ...effectsSettings.siren, enabled: !effectsSettings.siren.enabled },
        })
      } else if (match === 'siren.pitchHz') {
        scheduleMidiCommit('siren.pitchHz', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, siren: { ...es.siren, pitchHz: scaled } })
        })
      } else if (match === 'siren.speedHz') {
        scheduleMidiCommit('siren.speedHz', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, siren: { ...es.siren, speedHz: scaled } })
        })
      } else if (match === 'siren.depth') {
        scheduleMidiCommit('siren.depth', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, siren: { ...es.siren, depth: scaled } })
        })
      } else if (match === 'siren.level') {
        scheduleMidiCommit('siren.level', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, siren: { ...es.siren, level: scaled } })
        })
      } else if (match === 'siren.echoFeedback') {
        scheduleMidiCommit('siren.echoFeedback', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, siren: { ...es.siren, echoFeedback: scaled } })
        })
      } else if (match === 'master.volume') {
        scheduleMidiCommit('master.volume', () => {
          const es = get().effectsSettings
          get().setEffectsSettings({ ...es, masterVolume: scaled })
        })
      }
    },
  }
}

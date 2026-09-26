---
status: shipped
updated: 2026-09-26
adrs: [0023, 0025, 0029, 0034]
---
# FX

The **FX** screen (the **FX** button on the right of the player bar; it
lights up while an effect is engaged) processes playback through a Web
Audio graph. Each effect is a card, laid out in as many columns as fit. Every control is a rotary knob that shows its live value;
**double-click** a knob to reset it. Each module has its own on/off toggle
in its header. All settings are saved and restored on the next launch, and
every knob and toggle can be [MIDI-mapped](midi.md).

| Module | Controls | Notes |
| --- | --- | --- |
| **Master** | Volume | Overall output level. |
| **EQ** | Low, Mid, High, Mix | 3-band EQ. |
| **Filter** | LP, HP, Resonance, Mix | Separate low-pass and high-pass amounts ("Open" = off); a reset button opens both fully. Resonance fades in over the first quarter of each knob's travel and the filtered level is compensated, so it's transparent at rest and doesn't hiss, rumble or clip ([ADR 0029](../adr/0029-filter-resonance-fades-in.md)). |
| **Delay** | Time, Feedback, Division, Mix | Division snaps the time to a note value (1/1, 1/2, 1/4, 1/8, 1/16, dotted 1/4 and 1/8, triplet 1/4 and 1/8) at the loaded track's BPM. |
| **Reverb** | Decay, Pre-delay, Mix | Synthesized impulse response (no bundled assets). |
| **Dub Siren** | Mode, Beat, Pitch, Speed, Depth, Echo, Mix, trigger | See below. |

Delay and reverb are fed after the volume fader, so muting stops new
signal from entering them while the existing tail rings out.

## Dub Siren

A synthesized dub siren with four modes: **Siren**, **Bomb**, **Gun**,
**Laser**.

- **Pitch** — base frequency; **Speed** — how fast the pitch wobbles;
  **Depth** — how wide the wobble is; **Echo** — the siren's own echo
  feedback; **Mix** — its level (independent of the track volume). The
  knob follows perceived loudness, and Bomb, Gun, and Laser are trimmed
  so they come out at about the same volume as Siren.
- **Beat: Off** — fire it by holding the **SIREN** button or the **S**
  key (or a mapped MIDI pad).
- **Beat: Slow / Medium / Fast** — it stabs automatically in rhythm.

The siren works even when nothing is playing.

Code: `src/components/FxPanel.tsx`, `Knob.tsx`, `src/audio/effectsChain.ts`,
`src/audio/sirenEngine.ts`, `src/audio/sirenSchedule.ts`.

## Behaviour notes
- The FX screen **scales up to fill the window** (the largest size that fits
  without scrolling; never smaller than normal) — [ADR 0034](../adr/0034-fx-screen-fits-the-window.md).
- Knobs don't redraw the rest of the app while you turn them
  ([ADR 0023](../adr/0023-fx-settings-outside-react.md)).
- The audio engines pause 15 s after going quiet and resume on play or a
  siren trigger, so MCO uses ~0 % CPU while idle ([ADR 0025](../adr/0025-suspend-idle-audio-engines.md)).
- While casting to a TV, the same effects run on the TV ([Casting](casting.md)).

## Tests
- `src/audio/effectsChain.test.ts` (filter resonance and compensation),
  `sirenEngine.test.ts`, `sirenSchedule.test.ts`, `midi.test.ts`.

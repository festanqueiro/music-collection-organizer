---
status: shipped
updated: 2026-10-01
adrs: [0055, 0052]
---
# Hot cues

## What it does
Eight hot cues per track, **A–H**, like a CDJ or Rekordbox: mark the intro, the drop, the break,
then jump straight there while mixing. They're saved with the track, drawn on the player's
waveform in their colours, played from pads in the player, keys **1–8** or MIDI pads, and they
travel to and from Rekordbox — your Rekordbox cues come into MCO, and MCO's go out in its Rekordbox
export.

## Behaviour
- **Pads A–H** on their own row under the player (*Hot cues*), so the transport and the waveform
  keep their room; the empty player has the same row, disabled. An empty pad (outlined)
  **sets** a hot cue where the track is now — playing or paused; a set pad (filled with its colour)
  **jumps** there and plays.
- **Keys 1–8** do the same as the pads; **Shift-1–8** deletes that cue. Not while typing, not with
  a dialog open, and not while the visualizer is open (it keeps 1–8 for its themes).
- **Right-click** (or Shift-click) a set pad: **Name…** (e.g. "Drop", shown in the pad's tooltip),
  a colour from Rekordbox's hot-cue palette, **Delete hot cue**.
- **Colours**: new cues take their slot's default — the ones the user's Rekordbox uses for A–D (pink,
  blue, green, purple), then magenta, cyan, green, rose for E–H — so a cue looks the same in both apps.
- **Waveform**: each hot cue is a line in its colour with its letter on top; Rekordbox's memory cues
  (thin lines) and loops (a light band) show too, from an import.
- **MIDI**: learnt like the other controls — each pad has a learn badge, shown only while
  **Settings → MIDI → Show MIDI mapping buttons** is on; a press sets or jumps (release does
  nothing); a bound pad's LED is lit while its cue is set.
- **Table**: a **Cues** column (from the columns menu) with how many hot cues a track has, sortable.
- The CDJ-style **CUE** button is unchanged: one temporary cue point, set by pausing, not saved.

### With Rekordbox
- **In**: Settings → Import & export → **Compare with Rekordbox…** → *Cue points* lists songs whose
  cues differ (only in Rekordbox, only in MCO, different — same slot, time within 10 ms and colour
  count as the same). **Bring Rekordbox's cues into MCO** copies them — hot cues, memory cues and
  loops with their colours — for every matched song **that has no cues in MCO yet**; songs with
  their own are left alone and counted. The user's 111 hot cues on 76 songs come in this way.
- **Out**: MCO's **Export to Rekordbox** writes each track's cues as `POSITION_MARK`s — hot cues
  `Num` 0–7 with their RGB colour and name, memory cues `Num -1`, loops `Type 4` with `End`. What
  Rekordbox does with them on songs it already has is what the
  [probe](../research/rekordbox-xml-import.md) finds out.

## How it works
- **DB** `track_cues(id, track_id, kind 'hot'|'memory'|'loop', slot, start, end, color, name)`;
  one hot cue per slot per track (a partial unique index); `ON DELETE CASCADE` with the track
  ([ADR 0055](../adr/0055-cue-points-in-mco-kept-rekordbox-compatible.md)).
- **Main** `electron/main/cues.ts`: `getTrackCues`, `setHotCue` (moving a set slot keeps its colour
  and name), `updateHotCue`, `deleteHotCue`, `getHotCueCounts`, `importRekordboxCues`; IPC `cues:*`
  returns the track's cues after each write; `rekordboxExport.ts` writes them; `rekordboxCompare.ts`
  compares them.
- **Renderer**: `src/state/hotCues.ts` (letters, default colours, palette, hex↔RGB);
  `trackCues` / `hotCueCounts` in the store, loaded per track when the player mounts;
  `src/components/HotCuePads.tsx` (pads, menu, `CueMarkers` on the waveform); `Player.tsx` adds
  `hotCue(slot)` to `playbackControls`, which MIDI (`player.hotCue1`–`8`) and the keys call.

## Tests
- `electron/main/cues.test.ts`: set, move (colour/name kept), recolour, rename, delete, slot and
  colour checks, cascade with the track, Rekordbox import (hot, memory, loop, colours; songs with
  MCO cues skipped; songs outside the collection ignored).
- `rekordboxExport.test.ts`: `POSITION_MARK`s with default and chosen colours and names, read back.
- `rekordboxCompare.test.ts`: only in Rekordbox, only in MCO, different, the same (±10 ms) left out.
- `store.midi.test.ts`: pads 1 and 8 on press only.
- In the real app (Linux/xvfb): keys 1/2 set A/B, 1 jumps back, the pad menu, markers, the import
  from a Rekordbox export.

## Limits & open questions
- **Loops** (set, active, exit) aren't playable yet — imported loops show on the waveform only;
  memory cues likewise (roadmap: loops later).
- No zoomed waveform yet: on a long track, cues placed by ear land within the waveform's precision.
- **Quantize** (snapping a cue to the beat grid) needs MCO's own grid; not done.
- MP3 cue times may differ from Rekordbox's by 20–50 ms (decoder offsets) — the probe measures it.
- The pads aren't on the Live screen yet.

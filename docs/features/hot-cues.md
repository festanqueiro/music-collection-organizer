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
- **Suggested** (after the pads): bars **16, 32, 48, 64** from the first beat — 4 beats a bar at
  the track's BPM — where most dance music changes phrase; past the end of the track they're left
  out. Each is also a dashed line on the waveform. Click one to put it on the **first empty pad**
  (with all eight set, it asks which); once a pad holds it (within half a beat) the button shows
  that pad's letter and colour (*D·16*) and jumps there like the pad. **Right-click** one to pick
  the pad, A–H: an empty pad takes it, a set pad is replaced, and a suggestion already on a pad
  moves (the old pad is cleared). Marked **≈** while the first beat is only a guess (below).
- **Keys 1–8** do the same as the pads; **Shift-1–8** deletes that cue. Not while typing, not with
  a dialog open, and not while the visualizer is open (it keeps 1–8 for its themes).
- **Right-click** (or Shift-click) a set pad: **Name…** (e.g. "Drop", shown in the pad's tooltip),
  a colour from Rekordbox's hot-cue palette, **Delete hot cue**.
- **Colours**: new cues take their slot's default — the ones the user's Rekordbox uses for A–D (pink,
  blue, green, purple), then orange, cyan, yellow, magenta for E–H from its palette — eight
  clearly different colours, so no two pads look alike, and a cue looks the same in both apps.
- **Dragging**: grab a hot cue's line or letter on the waveform and drag it; release to move it
  there (colour and name kept); a click without moving jumps there and plays, like its pad. While
  dragging, a **zoom** opens above the waveform: a detailed waveform of the 8 bars around the cue
  (12 s without a BPM), which slides under the cue held in the middle; bar lines numbered like the
  suggestions (bars since the first beat; 16/32/48/64 brighter), faint beat lines, the other cues
  in view, and a dashed line where it started. The header reads the time to the millisecond, *bar
  N + M beats*, and how far it has moved (seconds and beats). **⌥** (Alt) moves it at the zoom's
  scale — the waveform under the pointer moves with it — for fine placement; **Shift** snaps to the
  nearest beat; **Esc** cancels.
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
- **First beat**: analysis (`analysis/bpmKey.ts`) keeps where the beat grid starts in
  `tracks.first_beat` — the first of essentia's beat ticks at the first sound (`firstBeatFrom`;
  the tracker extrapolates ticks into a silent intro, which would put every suggestion a beat or
  two early). Tracks analysed before it existed are re-analysed when played or queued (like
  energy); until then the first beat is guessed from the waveform (`firstSoundTime`, ≈).
- **Renderer**: `src/state/hotCues.ts` (letters, default colours, palette, hex↔RGB,
  `suggestedCues`, `firstEmptySlot`, `gridStart`, `gridPosition`, `snapToBeat`); `CueMarkers` handles
  the drag and `src/components/CueZoom.tsx` draws the zoom on a canvas from
  `electron/main/waveformSection.ts` (IPC `waveform:section`): ffmpeg decodes just ~80 s around the
  cue (`-ss`/`-t`, 11 kHz mono) into 200 peaks a second — the whole-track waveform's 800 peaks are
  under half a second each on a six-minute track — fetched again when the view nears its edge;
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
- `src/state/hotCues.test.ts`: eight distinct default colours; suggestions at bars 16–64, cut at the
  end, which pad holds one, none without a BPM, the waveform guess; the first empty pad.
- `hotCues.test.ts` also: bar/beat position, snapping to the beat. `waveformSection.test.ts`: only the
  asked part is decoded, at the asked detail.
- In the real app (xvfb): dragging B 7.6 s later with ⌥ and Shift (snapped, *bar 12 + 1 beat*),
  Esc leaving C where it was, the zoom drawn over the table.
- `analysis/bpmKey.test.ts`: the first beat of a 120 BPM click track after 1.5 s of silence;
  ticks in a silent intro skipped.
- In the real app (Linux/xvfb): keys 1/2 set A/B, 1 jumps back, the pad menu, markers, the import
  from a Rekordbox export.

## Limits & open questions
- **Loops** (set, active, exit) aren't playable yet — imported loops show on the waveform only;
  memory cues likewise (roadmap: loops later).
- No zoomed waveform yet: on a long track, cues placed by ear land within the waveform's precision.
- Suggestions assume 4/4 and a steady tempo from the first beat; a track whose first beat isn't a
  downbeat (a pickup) has them off by that much — move the cue by ear.
- **Quantize** (snapping a cue to the beat grid) needs MCO's own grid; not done.
- MP3 cue times may differ from Rekordbox's by 20–50 ms (decoder offsets) — the probe measures it.
- The pads aren't on the Live screen yet.

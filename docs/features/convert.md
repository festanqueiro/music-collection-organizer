---
status: shipped
updated: 2026-10-08
adrs: [0061]
---
# Convert to…

## What it does
Right-click a track → **Convert to…** writes its file again in another format, bit depth or
sampling frequency — a WAV as AIFF, a 32-bit float WAV a CDJ refuses as 24-bit, a FLAC as an MP3
for a phone. The converted file is saved next to the original (or in a folder you choose), and can
take the original's place in the collection.

## Behaviour
- **Where**: a row's right-click menu, **Convert to…**; with several rows checked, **Convert all
  to…** converts them all with the same settings.
- **The dialog**:
  - **Format**: WAV, AIFF, FLAC, Apple Lossless (.m4a), MP3, AAC (.m4a) — the formats a CDJ reads.
  - **Bit depth** (WAV, AIFF, FLAC, Apple Lossless): *Same as the file*, 16-bit or 24-bit. *Same
    as the file* keeps a 16-bit file at 16 and takes anything deeper (32-bit, float) to 24; a lossy
    file (MP3, AAC), which has no depth, becomes 16-bit.
  - **Bit rate** (MP3, AAC, instead of the bit depth): 320, 256, 192 or 128 kbps.
  - **Sampling frequency**: *Same as the file*, 44.1, 48, 88.2 or 96 kHz; MP3 and AAC stop at
    48 kHz (a 96 kHz file becomes 48).
  - **Save in**: *The same folder as the original* by default; **Choose…** picks any other folder
    (a USB stick, a folder of the collection), **Reset** goes back.
  - **Replace the original** (off by default, and only when saving in the original's folder): see
    below.
  - For one track, the line under the title says what the file is now (`PCM · 32-bit float ·
    96 kHz`); a note warns that a lossy file made lossless gets bigger, not better.
  - The format, depth, bit rate and frequency last used are remembered (per computer); the folder
    and *Replace the original* start afresh every time.
- **A copy** (the default): the original is untouched. The copy is named after it with the new
  extension; if that name is taken — or is the original's own, as for a WAV made 16-bit — it gets
  ` (2)`, ` (3)`… Nothing is ever overwritten. A copy saved inside the collection folder is a new
  file: MCO scans for it when the conversion ends and it shows as a new track, without the
  original's Tags or cues.
- **Replace the original**: the converted file takes the track's place — the same track, with its
  Tags, Subtags, hot cues, start, playlists, play count, analysis and waveform — and the original
  goes to the **Trash** (recoverable). If a different file already has the new name, that track
  is not converted. A lossless file already in the format, depth and frequency asked for is
  skipped. With the same file name (only the depth or frequency changes) the original has to go to
  the Trash before the new file can take its name; if that last step fails the converted file is
  kept next to it under its temporary name and the message says so — nothing is deleted.
- **What's carried over**: the file's tags (title, artist, album, genre, year…) and, except into
  WAV, the cover.
- **While it runs**: one file at a time, with *Converting 3 of 20…*, the file's name and a bar.
  **Stop** finishes the file in hand and stops. Then a summary: how many were converted, and each
  one that wasn't or needs a word, with why (cloud-only, missing, name taken, ffmpeg's error, the
  original that wouldn't go to the Trash). For one copy, **Show in Finder**.
- Tracks that aren't downloaded, or whose file is missing, aren't converted.

## How it works
- `electron/main/convert.ts`, with the bundled ffmpeg (`resolveFfmpegPath()`):
  - `probeAudio` runs `ffmpeg -i` and `parseAudioInfo` reads the codec, bit depth and frequency
    from what it prints.
  - `resolveTarget` turns the choices and the file into the depth, bit rate and frequency to
    write; `alreadyConverted` spots a replace that would change nothing.
  - `buildConvertArgs`: `-map 0:a:0 -map_metadata 0`, the cover as an attached picture
    (`-map 0:v?`, tried again without if the writer refuses it), and per format `pcm_s16le/s24le`
    (WAV), `pcm_s16be/s24be` + an ID3 chunk (AIFF), `flac`, `alac` and `aac` in an `ipod` (.m4a)
    container, `libmp3lame` with ID3v2.3. Going down to 16-bit is dithered (triangular), in the
    same `aresample` step as a frequency change.
  - `planOutput` names the file; `convertTracks` runs them in turn. ffmpeg writes to
    `<name>.<random>.mcotmp` — not an audio extension, so a scan never sees a half-written file —
    renamed into place only when ffmpeg succeeded.
  - Replacing ([ADR 0061](../adr/0061-convert-copies-by-default-and-replaces-in-place.md)): the
    track's row gets the new `path`, `filename`, `format`, `size`, `mtime` and `bitrate` (the real
    file's, so the next scan sees nothing changed and analysis isn't redone), then the original is
    trashed with `shell.trashItem`. Same name: the original is trashed first, then the new file
    renamed in.
- IPC (`electron/main/ipcConvert.ts`): `tracks:audioInfo`, `tracks:pickConvertFolder`, `tracks:convert` (one run at a time;
  `tracks:convertProgress` events; returns the results and whether a scan is needed),
  `tracks:convertStop`.
- Renderer: `src/components/ConvertDialog.tsx`, opened from `TrackTable`'s menus. After a run it
  rescans (copies inside the collection) or reloads the list (replaced tracks).

## Tests
- `electron/main/convert.test.ts`: reading ffmpeg's description (PCM 16/24/float, FLAC, ALAC,
  MP3, AAC, no audio); the depth and frequency rules; what counts as already converted; the
  arguments per format, the cover, the dither; file names for a replace and for a copy; and
  `convertTracks` against a temp folder and DB with a stand-in ffmpeg — copy, another folder,
  replace, same-name replace, skip, name taken, ffmpeg failing (nothing left behind), the cover
  retry, the Trash failing, missing and cloud-only tracks, stop.
- With the real bundled ffmpeg (2026-10-08): a 96 kHz 32-bit float WAV and a 48 kHz MP3 with a
  cover, through all six formats × (same / 16-bit 44.1 kHz / 24-bit 48 kHz). All 36 came out in the
  codec, depth and frequency asked for, with title and artist; the cover arrived in every format
  but WAV.
- The dialog and the menu weren't driven in the app by their author; check in BETA.

## Limits & open questions
- **No cover in WAV**: ffmpeg's WAV writer can't hold one.
- **AAC's bit rate is a target**: simple material comes out lower than asked.
- **MP3 and AAC add a few milliseconds** at the start (the encoder's delay, which most players
  compensate): hot cues and the start of a replaced track aren't shifted to match.
- Converting the track that's playing with *Replace the original* may restart it when the list
  reloads.
- 32-bit and float output isn't offered (CDJs don't read it); nor are other frequencies.
- A batch can't be given per-track settings, and its *Same as the file* isn't previewed (that
  would mean reading every file first).
- Rekordbox knows the file by its old path: after a replace, relocate or re-import it there.

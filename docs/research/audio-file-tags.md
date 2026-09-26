---
updated: 2026-09-26
---
# How the collection's files carry their tags

Read-only inspection of the user's collection (Google Drive, `DJ_COLLECTION_RECORDBOX`) on
2026-09-26, to decide how to write tags safely ([ADR 0026](../adr/0026-write-tags-byte-for-byte.md)).

## Formats (present tracks)
| Format | Local | Cloud-only |
|---|---|---|
| AIFF (`.aiff`) | 2,228 | 43 |
| WAV | 260 | – |
| AIF (`.aif`) | 100 | – |
| FLAC | 6 | – |
| MP3 | 6 | – |

## Chunk / frame layout (random sample of 40 AIFF/AIF/WAV)
- **AIFF**: `COMT COMM SSND ID3 ` — the ID3 chunk (v2.4) comes **after** the audio. Frames seen:
  `APIC COMM TALB TIT2 TPE1 TPE2 TRCK TYER`, sometimes `TSRC`. Note `TYER` (a v2.3 frame) inside
  v2.4 tags — readers accept it, so the writer updates whichever year frame exists.
- **AIF**: some have a native `NAME` chunk before `COMM`, plus ID3 v2.4 with `TCON TDRC TPUB TSSE TXXX`.
- **WAV**: mostly **no ID3**; `LIST/INFO`, `bext` (broadcast), `cue ` + `LIST/adtl` (cue points),
  `smpl`, `JUNK`/`junk`, and other apps' chunks (`LGWV`, `ResU`).
- **MP3**: ID3v2.3 leading tags, some with an ID3v1 block at the end; 2 of 6 use **ID3v2.2**
  (3-character frames).

## What that means for writing
- Rewriting whole files (ffmpeg) would drop `bext`, cue points, `LGWV`/`ResU`, and unknown frames.
- Editing only the text frames and copying everything else byte-for-byte kept every chunk and frame
  identical, and the decoded PCM identical, on copies of 16 real files.
- An empty ID3v1 block isn't recognised as ID3v1 by `music-metadata` (it reads it as audio), so it's
  dropped rather than left empty.
- MP3 duration without a full frame count is estimated from size and bitrate, which shifts with the
  tag's size — verification parses with `duration: true`.

## Tags present (after the background read)
- 2,483 tracks with an artist tag; 117 without (the Untagged filter).
- Filenames: `Artist - Title`, `NN - Artist - Title`, Bandcamp's `Artist - Album - NN Title`, Beatport's
  `12345_Title_(Mix)`, vinyl sides (`A1`, `B1.`), mastering suffixes (`_DM_Master_Loud`,
  `_SC_Master_1644`, ` Master`). The filename parser guesses an artist for all but 38 filenames.

## Sources
- [ID3v2.4 structure](https://id3.org/id3v2.4.0-structure), [ID3v2.3](https://id3.org/id3v2.3.0),
  AIFF and RIFF/WAVE chunk formats; `music-metadata` behaviour as observed.

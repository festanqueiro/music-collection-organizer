---
updated: 2026-10-01
---
# What the user's Rekordbox library holds

Read-only look at the user's Rekordbox 7.2.7 library on 2026-10-01, for
[Rekordbox sync](../features/rekordbox-sync.md) and [Playlists](../features/playlists.md)
([ADR 0050](../adr/0050-playlists-in-mco-imported-from-rekordbox-xml.md),
[ADR 0051](../adr/0051-update-rekordbox-through-xml-and-file-tags.md)). Two sources: the
collection XML (**File → Export Collection in xml format**) and Rekordbox's settings files.
Counts only; the files themselves stay out of the repo (personal library, and the settings file
holds account tokens).

## Collection XML
2,777 tracks (`COLLECTION Entries`), 2.8 MB. `PRODUCT Company="AlphaTheta"` (was "Pioneer DJ").

### Where the files are
| Location | Tracks |
|---|---|
| Google Drive `…/My Drive/DJ_COLLECTION_RECORDBOX/…` (MCO's collection folder) | 2,590 |
| `~/Music/PioneerDJ/Imported from Device/Contents/…` (copied in from a USB stick) | most of the rest |
| `~/Music/rekordbox/Sampler/…`, `~/Downloads/…` | a few |

No path is NFD (all already NFC); 67 have non-ASCII characters. `Location` is
`file://localhost` + percent-encoded path, as the importer expects.

### Formats and fields
- AIFF 2,483 · WAV 278 · FLAC 8 · MP3 8. So MCO's byte-for-byte tag writer (AIFF, WAV, MP3)
  covers 99% of the tracks; FLAC waits for wider tag writing.
- Filled on most tracks: Name, Size, TotalTime, DateAdded, SampleRate, Location, Tonality (all),
  AverageBpm (2,774), BitRate (2,769), Artist (2,653), Album (2,416), **Comments (2,390)**,
  TrackNumber (2,342).
- Rarely filled: **Genre (166, 6%)** — 32 distinct values, inconsistent ("Junlge", "dance" and
  "Dance", "Drum & Bass / Jungle"); Year 210; PlayCount > 0 on 131; Label 107; Composer 1.
- Never used: Rating (all 0), Colour (absent), Grouping (all empty), Remixer, Mix.
- **Comments** are mostly the stores' text: "Visit https://….bandcamp.com", "Distributed by
  Cygnus Music for Eyesome.org".
- Tonality is classic notation: `Fm`, `Em`, `F#m`, `Ebm`, `E`… (minor keys ~92%).

### Beat grids
Every track has at least one `TEMPO` (`Inizio`, `Bpm`, `Metro="4/4"`, `Battito`). 2,051 have one;
726 have several (up to 290) — all at the same BPM within a track, i.e. Rekordbox's adjusted grid
anchors, not tempo changes.

### Cue points
- **111 `POSITION_MARK`s on 76 tracks** (44 of them inside `DJ_COLLECTION_RECORDBOX`).
- All `Type="0"` with `Num` 0–3 (hot cues A 66, B 31, C 11, D 3). No memory cues (`Num="-1"`),
  no loops (`Type="4"`, `End`), no names (`Name=""`).
- Each has `Red`/`Green`/`Blue` from Rekordbox's hot-cue palette: (255,55,111) ×36,
  (40,226,20) ×33, (69,172,219) ×19, (125,193,61) ×10, (222,68,207) ×5, then (170,114,255),
  (60,235,80), (0,224,255), (100,115,255), (255,18,123).
- `Start` in seconds with 3 decimals, e.g. `Start="15.230"`.

### Playlists
24 playlists: a **2026** folder with 9, and 15 at the top level; all `KeyType="0"` (TrackID keys).
MCO's parser (`parseRekordboxXml`, PR #99) reads the same tree with every song's path. By path,
the share inside `DJ_COLLECTION_RECORDBOX`:
- 15 playlists entirely (e.g. 2025-JUNGLE 306/306, 2026-ALL-OTHER-DUBS 160/160);
- HNI-10-YEARS-140-DUB 0/19, the five 2025-KIOSK-DUB-* 0/148, 2026-PORTO-COUNTERPOINT 1/36 —
  their songs are in "Imported from Device", outside the collection;
- 2026-MAC-EZZY_PLAYLIST 0/3 (in Downloads);
- two empty ones (2026-DUB-STEPPAS-EASY, Rekordbox's own "CUE Analysis Playlist").

## Settings files
From Rekordbox's settings folder (`rekordbox3.settings`, `masterPlaylists6.xml`,
`contents.xml`, and others with nothing relevant: `browseSetting.xml`, `PlaySettings.xml`,
`SamplerSettings1.xml`, `activations.xml`, the USB-stick `MYSETTING*.DAT`).
- `LaunchedVersion 70207` (7.2.7), `CONTENT_NUM 2777`, library in `~/Library/Pioneer/rekordbox`.
- **`bridgeImportedLibraryFile = ~/Library/rekordbox/rekordbox/rekordbox.xml`** — the
  "rekordbox xml" library is already pointed at a file; `showRbXml = 0` (its tree is hidden in the
  sidebar). `rekordbox3.settings` is plain XML, so MCO can read this path.
- `writeKeyInTag = 0`, `writeMytag = 0` — Rekordbox doesn't write key or My Tags into the files,
  so it won't overwrite tags MCO writes.
- `AutoAnalysis = 1` — new tracks are analysed on import (Rekordbox makes its own grid).
- `bridgeExportBeatGrid = 1` — its XML export includes grids (seen above).
- `HotCueColorType = 4` — the hot-cue colour scheme in use.
- `masterPlaylists6.xml`: 23 nodes with ids, parents and timestamps only — no names or tracks
  (as ADR 0050 says).
- `rekordbox3.settings` also holds the Rekordbox account's login tokens: never read beyond the
  keys MCO needs, never copied or logged.

## What it changes
- Genre is a real gap in Rekordbox (6% filled) — MCO's Tags as Genre adds the most.
- Comments carry store text on 86% of tracks — an export must add MCO's Tags to them, not
  replace them.
- The 111 cues can seed MCO's hot cues (import), and an export must use the same colours.
- *Update Rekordbox* can default to the path Rekordbox already reads.
- Playlist import: expect 8 of 24 playlists to come in empty or nearly empty until "Imported from
  Device" songs are moved into the collection folder.

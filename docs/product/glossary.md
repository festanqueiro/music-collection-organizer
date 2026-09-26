---
updated: 2026-09-26
---
# Glossary

- **Collection / collection folder** — the one folder of music MCO works on.
- **`.mco` folder** — hidden folder inside the collection holding `collection.db` and `config.json`.
- **Track** — one audio file in the collection (a row in the table).
- **Tags / Subtags** — MCO's own two-level labels (genres and sub-genres in the code). Stored in the
  database, not in files. A subtag belongs to one tag.
- **ID3 tags / file tags** — the tags inside the audio file (title, artist, album, genre, year),
  shown under "Full ID3 tags" and editable there.
- **Genre (ID3)** — the file's own genre text; distinct from MCO's Tags.
- **Untagged** — a track whose file has no artist tag.
- **Pending / analysed** — analysis status: BPM, key, waveform, loudness and energy computed or not.
- **Energy** — a 1–10 rating from loudness (55 %) and onset rate (45 %) ([casting](../features/casting.md)).
- **Camelot key** — key notation used by DJ software (8A = A minor, 8B = C major).
- **Compatible** — tracks whose key is the same, ±1 on the wheel or relative major/minor, and whose
  BPM is within 6 % (or half/double time) of the playing track.
- **Queue** — the FIFO list of what plays; its head is the track playing.
- **Cue point / CUE** — the CDJ-style cue button and its single point per track.
- **Pre-listen** — playing a track on the headphone (cue) output while the main output continues.
- **Cloud-only** — a Google Drive placeholder not downloaded to this Mac.
- **Present / missing** — a track whose file the last scan found or didn't; missing rows are hidden,
  not deleted.
- **Filters** — the sidebar view with Compatible, Analysed, Duplicates and Untagged.
- **Chip** — a pill above the table showing an active narrowing (search, folder, tags, a filter).
- **FX** — the effects: EQ, Filter (LP/HP), Delay, Reverb, Dub Siren, Master.
- **Dub Siren** — the synthesized siren effect (Siren, Bomb, Gun, Laser; manual or Beat).
- **Cast / receiver** — playing on a Cast device; the receiver is the app running on the device
  (MCO's own, `E056A69A`, or Google's Default Media Receiver).
- **Direct mode** — casting where the device plays the files itself and MCO's player is the remote.
- **BETA** — a separate local build (`npm run dist:beta`) with its own data, for testing.

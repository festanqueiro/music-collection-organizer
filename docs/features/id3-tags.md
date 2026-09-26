---
status: shipped
updated: 2026-09-26
adrs: [0026, 0027, 0028, 0008]
---
# ID3 tags (file tags)

## What it does
Shows the tags stored inside each audio file and lets you edit Title, Artist, Album, Genre and Year —
written into the file itself, without touching anything else in it. For files missing tags, MCO
suggests them from the filename; nothing is written until you press **Save to file**.

## Behaviour
- **Full ID3 tags** in the track details lists Title, Artist, Album, Genre (ID3), Year, BPM, Key,
  Format, Duration. It reads the file's current tags when you select the track.
- **Edit** turns the five text fields into inputs; **Save to file** writes them, **Cancel** / Esc
  discards. An empty field removes that tag from the file. Year takes up to 4 digits.
- **Use tags** (next to Genre) fills it with the track's MCO Tags then Subtags, e.g. `House, Deep
  House` — MCO's own tags otherwise live only in its database ([ADR 0008](../adr/0008-tags-live-in-the-database.md)).
- Edit is unavailable (with the reason) for cloud-only tracks and FLAC/M4A files; MP3s with the old
  ID3v2.2 tag are refused with a message.
- Saving keeps the file's creation date (Date Added in MCO), and the track isn't marked for
  re-analysis.

### Suggestions from the filename
- For fields the file leaves empty, a **Suggested from the filename** box shows the guessed Artist /
  Title / Album. **Review…** opens the editor with them filled in; the editor also has **Fill from
  filename**, and the guesses appear as placeholders.
- **Nothing is saved automatically** — one explicit Save per track ([ADR 0028](../adr/0028-suggest-never-auto-write-file-tags.md)).
- Recognised shapes: `Artist - Title`, `01 - Artist - Title`, Bandcamp's `Artist - Album - 03 Title`
  (and `… - 03 Artist - Title`), `Artist - Artist - Title`, vinyl sides (`A1`, `B1.`), underscores
  (`Artist_-_Title`, `Artist_Name-Title`), store ids (`12345_Title_(Original Mix)`), and noise like
  `_DM_Master_Loud`, `_SC_Master_1644`, ` Master`, `-Free DL-`.

## How it works
- Writing: `electron/main/tagWriter.ts` — edits only the text frames of ID3v2.3/2.4 (MP3's leading
  tag, AIFF's `ID3 ` chunk, WAV's `id3 ` chunk, added if missing), keeps WAV LIST/INFO, AIFF NAME/AUTH
  and MP3 ID3v1 in step, copies every other frame and chunk byte for byte, re-parses the result and
  checks tags, duration and sample count, then overwrites the file in place (same inode) with a backup
  restored on failure ([ADR 0026](../adr/0026-write-tags-byte-for-byte.md)). IPC `tracks:writeTags`
  updates the DB (tags, size, mtime, `tags_read_at`).
- Reading: `electron/main/tagReader.ts`, IPC `tracks:readFileTags` ([ADR 0027](../adr/0027-read-file-tags-in-background.md)).
- Suggestions: `src/state/filenameTags.ts`; UI in `src/components/DetailPanel.tsx`.

## Tests
- `electron/main/tagWriter.test.ts` (synthetic WAV/AIFF: frames and chunks preserved, clearing,
  refusals), `src/state/filenameTags.test.ts`.
- Real files (copies): 1 AIFF, 3 AIF, 6 WAV with cue/bext/INFO/LGWV/ResU, MP3s — tags read back
  (incl. non-ASCII), decoded PCM identical, other chunks/frames byte-identical, inode and birth time
  kept ([research](../research/audio-file-tags.md)).

## Limits & open questions
- FLAC/M4A and ID3v2.2 aren't writable yet.
- No bulk apply of suggestions (by design, [ADR 0028](../adr/0028-suggest-never-auto-write-file-tags.md)).
- Editing a file changes its mtime, so AIFF is re-transcoded for playback next time.

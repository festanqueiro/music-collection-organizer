---
status: accepted
date: 2026-09-26
---
# 0026. Write file tags by editing bytes in place — never re-encode, never rebuild the tag

## Context
Users edit Title / Artist / Album / Genre / Year. DJ files carry much more: cover art, comments,
ISRCs, WAV cue points and `bext`, other apps' private chunks and frames (Serato/Traktor data). Tools
that rewrite the whole tag or file (ffmpeg included) drop what they don't understand. The collection
is ~90 % AIFF with an ID3v2.4 chunk at the end, and WAVs mostly with LIST/INFO and no ID3
([research](../research/audio-file-tags.md)).

## Decision
`electron/main/tagWriter.ts` edits only those five text frames in ID3v2.3/2.4 (MP3's leading tag,
AIFF's `ID3 ` chunk, WAV's `id3 ` chunk — added if missing), copying every other frame and chunk
byte for byte. It keeps WAV LIST/INFO, AIFF NAME/AUTH and MP3 ID3v1 in step where present. Before
touching the file it re-parses the new bytes: tags must read back as asked and duration and sample
count must be identical. The file is then overwritten **in place** (same inode, so the birth time —
MCO's Date Added — is kept), with a backup copy restored on failure. The DB takes the new size and
mtime so the next scan doesn't queue a re-analysis. Refused: ID3v2.2, unsynchronised / extended-header
/ footer tags, malformed chunks, FLAC/M4A, cloud-only files.

## Alternatives considered
- ffmpeg `-c copy -metadata`: re-muxes and loses unknown frames/chunks.
- `node-id3` and similar: rebuild the tag; WAV/AIFF chunk handling still needed.

## Consequences
- Verified on copies of real files: decoded PCM identical, all other chunks/frames byte-identical,
  inode and birth time kept.
- FLAC and ID3v2.2 need their own writers later.

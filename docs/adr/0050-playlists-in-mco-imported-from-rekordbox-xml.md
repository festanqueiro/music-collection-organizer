---
status: proposed — the one-way part superseded by 0052
date: 2026-10-01
---
# 0050. Keep playlists in MCO's database and import them from Rekordbox's XML export

## Context
Users want playlists (named, ordered lists in folders) in MCO, and the ones they already have in
Rekordbox. On this Mac, Rekordbox 7.2.7 keeps its library in `~/Library/Pioneer/rekordbox/master.db`,
a SQLCipher-encrypted SQLite file (its first bytes aren't the SQLite header); `masterPlaylists6.xml`
beside it lists only node ids, no names or tracks. MCO uses `node:sqlite`, which can't open SQLCipher,
and deliberately has no native modules. Rekordbox can export its whole collection, playlists included,
as the documented "rekordbox xml" format (**File → Export Collection in xml format**) — the same
format MCO already writes for its Rekordbox export (`electron/main/rekordboxExport.ts`).

## Decision
- Playlists live in MCO's own database (`playlist_nodes`, `playlist_tracks`) and are edited in MCO.
- Rekordbox playlists come in by importing that XML file, picked by the user — or single playlists
  exported from Rekordbox's playlist menu as **m3u8** (file paths) or **text** (titles and
  artists only, matched by name), which is where most users look first. MCO playlists go back
  to Rekordbox as m3u8 files it imports. Imported nodes remember
  their name path in Rekordbox's tree; importing again refreshes those (replaces a playlist's songs,
  adds new ones, keeps ones gone from the XML) and never touches playlists made in MCO or detached
  with *Keep as my own*.
- Songs are matched to MCO's tracks by file path (decoded `Location`, NFC, then case-insensitive).

## Alternatives considered
- **Read `master.db` directly**: no export step, but needs a SQLCipher build (a native module, or a
  WASM SQLCipher) and Rekordbox's key, which is only publicly known through reverse engineering and
  has changed between versions; any Rekordbox update could break it, and it means decrypting
  another vendor's database. Can be revisited as an optional extra reading the same tables.
- **One-time copy** (each import adds new playlists): re-importing after changes in Rekordbox would
  duplicate everything.
- **Read-only mirror of Rekordbox**: simpler refresh, but playlists couldn't be made or edited in MCO.

## Consequences
- The user repeats the export in Rekordbox whenever they want MCO refreshed (a few clicks).
- A playlist renamed or moved in Rekordbox arrives as a new one on refresh (the XML has no stable
  id); the old one is kept and flagged, not deleted.
- MCO edits to an imported playlist are overwritten by its next refresh unless detached — the
  import summary says so before anything is written.
- Playlists are tied to absolute paths, like tags, until paths become relative (roadmap).

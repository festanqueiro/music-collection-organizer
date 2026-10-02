---
status: proposed
date: 2026-10-01
supersedes: the "one-way" parts of 0050 and 0051
---
# 0052. Sync with Rekordbox both ways: a three-way diff of its XML export, resolved in a wizard

## Context
[ADR 0050](0050-playlists-in-mco-imported-from-rekordbox-xml.md) brings playlists from Rekordbox
into MCO and [ADR 0051](0051-update-rekordbox-through-xml-and-file-tags.md) sends MCO's changes
to Rekordbox, each one-way, with two-way sync left out. The user edits in both apps — playlists,
titles and artists, genres (MCO's Tags), cue points — and wants them reconciled, deciding where
the two disagree. Rekordbox's library is still only reachable through its collection XML (export
and import) and the files' tags; its XML has no stable playlist ids and probably no way to delete.
A plain comparison of the two sides can't say which one changed a value.

## Decision
- Two-way sync through two files: Rekordbox's collection export (read) and the XML Rekordbox reads
  as its "rekordbox xml" library (written), plus file tags where the user chooses. Rekordbox's
  database stays closed.
- Each sync stores a snapshot of the values both sides agreed on. The next sync is a three-way diff
  (snapshot, Rekordbox, MCO): one-sided changes are carried over automatically (shown, pre-ticked,
  reversible before applying); both-sided different changes are conflicts the user resolves.
- Differences are presented as findings in four groups — playlists, music info, cue points,
  files — in a wizard, one by one or in bulk; nothing is written before *Apply*. A database backup
  and a journal of file-tag changes make the last sync undoable on MCO's side.
- Writing a file's tags from a finding is an explicit choice in the wizard, so ADR 0028 holds
  (no tags written without the user's say), at the granularity of a confirmed bulk choice.
- Songs match by path, then Rekordbox's TrackID kept in the snapshot, then offered (never assumed)
  matches by file name + size or title + artist + duration. Playlists match by name path, with
  renames offered when the songs mostly agree.
- What Rekordbox can't receive through an XML (deletions, maybe updates to things it has) becomes
  a checklist after applying, adjusted to what phase 0 measures.

## Alternatives considered
- **Two-way diff without a snapshot**: simpler, but every difference would be a question forever,
  including ones only one side touched.
- **Last write wins** (by timestamps): Rekordbox's XML has no per-field modification times, and a
  silent wrong pick loses the user's edits.
- **MCO as master, Rekordbox a mirror** (or the reverse): no wizard needed, but edits made on the
  other side are lost — exactly what the user wants to avoid.
- **Reading/writing `master.db`**: rejected as in ADR 0050.

## Consequences
- MCO keeps a snapshot per synced song and playlist (small: paths, a few fields, cue lists).
- Cue points need a home in MCO before the full Hot cues feature: the sync brings `track_cues`.
- The first sync is the big one (every difference is a conflict); bulk choices are essential.
- How automatic the Rekordbox side is stays open until phase 0; the design degrades to a checklist
  rather than failing.
- ADR 0050's "two-way sync is out of scope" and ADR 0051's "both stay one-way" no longer hold.

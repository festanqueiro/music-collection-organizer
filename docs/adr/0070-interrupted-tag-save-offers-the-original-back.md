---
status: accepted
date: 2026-10-12
---
# 0070. An interrupted tag save offers the original back, and never restores it unasked

## Context
Saving tags rewrites the audio file in place, so that it stays the same file (its creation date is
MCO's Date Added; [ADR 0026](0026-write-tags-byte-for-byte.md)). The original bytes were saved
first, but only used inside the same call: after a quit, a crash or a power cut during the write,
the file could be half written and nothing put it back. The copy sat in the media cache, which is
pruned by size, and a write that stopped short without an error went unnoticed.

A write-to-a-new-file-and-rename would be atomic, but makes a new file: the creation date changes
and the track looks newly added.

## Decision
- The copy goes to `<userData>/tag-edit-recovery/` (never pruned), with a note beside it naming the
  file it is the original of. Both are removed when the write is known whole, or when a failed
  write was put back.
- The write goes on until every byte is down (`writeWhole`), then is synced.
- At launch, a copy still there means a save never finished. If the file is identical to its
  original, the copy is dropped. Otherwise MCO **asks**: *Put the Original Back* (the default) or
  *Keep the File As It Is*. It never rewrites an audio file by itself — the same rule as for tags
  (they are written only on Save).
- If neither the new bytes nor the old ones could be written, the error says where the original is
  kept.

## Alternatives considered
- Restore silently at launch: the safest for the file, but an audio file rewritten with nobody
  asking, and a save that had in fact completed (the crash came after it) silently undone.
- Atomic replace by rename: loses the creation date, see above.

## Consequences
- A modal question at launch after a crash during a save. Rare, and it names the file.
- One full copy of the file on the system disk for the length of each save, as before.

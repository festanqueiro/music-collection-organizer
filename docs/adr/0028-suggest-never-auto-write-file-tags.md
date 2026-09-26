---
status: accepted
date: 2026-09-26
---
# 0028. Tag changes to files are suggested, never saved automatically

## Context
Filename-based tag suggestions could fill in hundreds of untagged tracks. The files are the user's
DJ collection, on Google Drive and shared with Rekordbox; an unreviewed bulk write is risky. The user
asked explicitly: "Suggest but don't update automatically (save)".

## Decision
Anything that changes a file's tags needs an explicit **Save to file** per track. Suggestions only
prefill the editor ("Review…", "Fill from filename", placeholders). No background or bulk writes.

## Consequences
- Tagging 117 untagged tracks takes a click per track; a reviewed bulk flow could come later, still
  with explicit confirmation.

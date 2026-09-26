---
status: accepted
date: 2026-08-20
---
# 0005. Detect cloud-only files from allocated blocks vs size

## Context
The collection lives in Google Drive for Desktop (stream mode). Files that haven't been downloaded
are placeholders: reading them triggers a download, which analysis must not do for thousands of
files at once. There's no Google Drive API integration (and none wanted).

## Decision
A file is **cloud-only** when `stat.blocks * 512 < size * 0.5` (`electron/main/cloudDetect.ts`).
Cloud-only tracks get a cloud badge, are skipped by analysis, tag reading and backups, and are
downloaded on demand (Download in the details, or playing them).

## Consequences
- Works for Google Drive for Desktop on APFS/macOS; other providers and platforms need checking.
- On the user's collection: 43 of 2,643 tracks are cloud-only (2026-09-26).

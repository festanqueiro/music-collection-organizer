---
updated: 2026-10-01
status: to run (on the Mac, with Rekordbox 7.2.7)
---
# What a Rekordbox XML import overwrites — the probe

Phase 0 of [Rekordbox sync](../features/rekordbox-sync.md) ([ADR 0052](../adr/0052-two-way-rekordbox-sync-with-a-merge-wizard.md)):
before building "to Rekordbox", find out what Rekordbox does when an XML brings in tracks and
playlists **it already has**. About 15 minutes.

The probe changes three of your real tracks in known ways (nothing else), so start with a backup.

## Make the probe
1. Rekordbox: **File → Library → Backup Library…** (keep the file; *Restore Library* undoes
   everything below).
2. Rekordbox: **File → Export Collection in xml format** → e.g. `~/Desktop/Collection.xml`.
3. In the MCO repo:
   ```bash
   npm run rekordbox:probe -- ~/Desktop/Collection.xml ~/Desktop/mco-probe.xml
   ```
   It prints the tracks it picked and what it changed. On the 2026-10-01 export it picked:
   - **A — Decisions (Cosmin TRG)**: title → "Decisions [MCO probe]", genre → "MCO Probe Genre",
     a comment added, BPM 138 → 139, key Em → Am, hot cue A moved 28.849 → 29.849 s and turned
     cyan (cue C kept), hot cue H added at 30.000 s (pink).
   - **B — G Pulse (VIP) (Goosensei feat. Natty D)**: hot cue A at 10 s (green), B at 20 s (blue),
     a memory cue at 5 s, a memory loop 40–44 s.
   - **C** (an MP3 with a hot cue: a white copy of cue A in a free slot, at the same time) — none of
     the 8 MP3s has a hot cue, so skipped. Add a hot cue to one MP3 first if you want this check.
   - Playlists: **MCO Probe** (new: A, B) and **2026-ALL-NEW-DUBS-SCRAPPED** — the same name as
     your existing one, holding only A.

## Run it in Rekordbox
4. **Preferences → Advanced → Database → rekordbox xml → Imported Library**: choose
   `mco-probe.xml`. (It's set to `~/Library/rekordbox/rekordbox/rekordbox.xml` today — note it to
   put back.) If *rekordbox xml* isn't in the tree, turn it on in **Preferences → View → Layout** (it's
   hidden on this Mac: `showRbXml = 0`).
5. Tree → **rekordbox xml → All Tracks**: right-click **A** → **Import To Collection**. Note any
   dialog word for word. Then look at A in your Collection: title, genre, comment, BPM, key, the
   hot cues (A where? which colour? C still there? H added?), the beat grid.
6. Same for **B**: are the new cues there? Did anything else change?
7. Tree → **rekordbox xml → Playlists**: right-click **MCO Probe** → **Import Playlist**; then
   **2026-ALL-NEW-DUBS-SCRAPPED** → Import Playlist. Did the second replace your playlist, merge
   into it, or come in as a new one (e.g. "… (2)")?
8. **TrackIDs**: **File → Export Collection in xml format** again, to `Collection-2.xml`, then
   ```bash
   npm run rekordbox:probe -- --compare ~/Desktop/Collection.xml ~/Desktop/Collection-2.xml
   ```
   (Same file, same TrackID across exports means MCO can use TrackID to follow a file Rekordbox
   relocated.) Bonus: relocate one file in Rekordbox (right-click → *Relocate*), export again, and
   compare — does its TrackID survive?
9. **Reload Tag**: in MCO (BETA), select track B → *Full ID3 tags* → **Edit** → Genre "MCO Reload
   Test" → **Save to file**. In Rekordbox: right-click B → **Reload Tag**. Did the genre change? Did
   its cues, grid and play count survive?
10. Put the Imported Library path back (step 4), and restore the backup from step 1 if you want
    the three tracks as they were.

## Results (fill in)
| # | What | What Rekordbox did |
|---|---|---|
| 5 | Dialog when importing a track it has | |
| 5 | A's title / genre / comment | |
| 5 | A's BPM / key / beat grid | |
| 5 | A's hot cue A moved & recoloured; cue C kept; cue H added | |
| 6 | B's new hot cues, memory cue, memory loop | |
| 7 | Playlist with an existing name | |
| 8 | TrackIDs between two exports (and after Relocate) | |
| 9 | Reload Tag picks up the file's Genre; cues/grid kept | |

## What depends on it
- Rows 5–6 decide whether "to Rekordbox" can update info and cues of songs Rekordbox has, or
  whether info goes through the files + Reload Tag (row 9) and cues become a checklist item.
- Row 7 decides whether MCO names its playlists "name (MCO)" and asks you to replace yours.
- Row 8 decides whether the sync's snapshot can follow relocated files by TrackID.

The probe code: `electron/main/rekordboxProbe.ts` (tested in `rekordboxProbe.test.ts`), run by
`scripts/rekordbox-probe.ts`.

---
updated: 2026-09-26
---
# Vision

**MCO — Music Collection Organizer** is a Mac app for a DJ's music collection: one folder of tracks
(often on Google Drive), organised with the DJ's own tags, analysed for BPM, key and energy, and
played through a small set of live effects — at home, or on a TV or speaker over Cast.

## Who it's for
A DJ who keeps their collection as plain files in folders (and in Rekordbox), wants to find tracks by
their own genres and moods, prepare what mixes with what, and play it back with dub-style effects.

## Principles
- **The files are the user's.** MCO never rewrites audio, never deletes a track's data because a
  file went missing, and only writes tags into a file when the user presses Save
  ([ADR 0026](../adr/0026-write-tags-byte-for-byte.md), [0028](../adr/0028-suggest-never-auto-write-file-tags.md)).
  Deleting moves to the Trash ([ADR 0031](../adr/0031-delete-moves-to-trash.md)).
- **Tags are MCO's, and they travel with the music** — in the database inside the collection
  ([ADR 0008](../adr/0008-tags-live-in-the-database.md), [0009](../adr/0009-data-folder-inside-collection.md)).
- **Local and private.** No accounts, no cloud service; Google Drive is just a folder
  ([ADR 0005](../adr/0005-cloud-only-detection.md)).
- **Fast with a real collection.** Thousands of tracks at 120 fps; heavy work off the UI thread
  ([research](../research/performance.md)).
- **Live, not laggy.** Effects, siren and visualizer respond immediately — also on the TV
  ([ADR 0017](../adr/0017-own-cast-receiver-app.md)).
- **Free to ship.** No paid Apple developer account: ad-hoc signed releases and a self-updater
  ([ADR 0013](../adr/0013-github-releases-updater-ad-hoc-signing.md)).

## Not (yet)
Multiple collection folders, a two-deck mixer, Windows/Linux, writing MCO's tags into files
automatically, cloud sync.

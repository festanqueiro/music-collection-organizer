---
date: 2026-10-11
---
# Whole-app code review, 2026-10-11: findings to fix

Nine reviewers read the app in parallel, read-only: three on the unpushed branch
`last-row-clear-of-scrollbar` (the last row, the Bit depth column, Order by Harmonic Mixing, ⌘A)
and six on the rest (file handling, database and IPC, app shell, store, audio engine, the other
screens). Nothing was changed. This is the list to work from; tick an item when its fix is merged.

**How sure:** *checked* = the code was read again after the reviewer and it holds; *reproduced* =
the reviewer ran it in a scratch script; *traced* = followed in the code, not run; *plausible* =
depends on timing or runtime behaviour nobody observed.

Suggested order: the branch's own items first (it isn't pushed yet), then group 1 as its own PR.

## 1. Can lose or damage data

**Fixed on 2026-10-12** ([session](2026-10-12-session.md)), on the branch, not yet merged. Notes:
- Moves: names compared as the disk does (capitals, NFC/NFD); `moveFile` refuses a destination
  that exists; a UNIQUE clash fails that one file and the batch goes on. Convert checks the
  database for the output path before converting.
- Hot cues: `loadAll` keeps the cues already read and reads them again, instead of emptying them.
- ID3 editor: keyed by track in `DetailPanel`.
- Update Collection: the walk reports what it couldn't read; nothing under it is removed. The
  dialog's count is still taken before the scan, and nothing tells the user a folder was skipped.
- Restore, data-folder move, tag save: see [ADR 0070](../adr/0070-interrupted-tag-save-offers-the-original-back.md)
  and [Settings & data](../features/settings-and-data.md#backups).
- Table keys: off under Queue/FX/Live/visualizer and under `ConfirmDialog`.
- Checked tracks no longer listed: the selection is pruned to the rows listed. The move dialog's
  default button is still **Move**.
- Two machines: a warning, not a lock ([ADR 0069](../adr/0069-warn-when-open-on-another-computer.md));
  the second machine's `collectionFolder` in the shared config is not addressed.

- [x] **Moving files can destroy one.** Two dragged files whose names differ only by capitals (or
  NFC/NFD) both pass `planMove`; the second `rename` overwrites the first, not via the Trash.
  `electron/main/moveTracks.ts:26-39` — the `taken` set and `exists` are case-sensitive
  (`convert.ts` already lower-cases its own). *Reproduced on APFS, checked.*
- [x] **Hot cues silently moved.** `loadAll` sets `trackCues: new Map()` (`src/state/store.ts:1064`)
  and the Player loads cues only on mount (`src/components/Player.tsx:152`). After any reload (a
  Tag created or renamed, the folder watcher, a cloud prefetch) the pads show empty; the next pad
  press takes the "empty" branch and `electron/main/cues.ts:41` updates the stored cue's start.
  Also skips the Undo in `cueSlice.ts:108`. *Checked.*
- [x] **One track's ID3 values saved into another's file.** `startEditing` awaits the tag read and
  then sets the draft for the track captured at the click; the component isn't keyed by track.
  Edit on A, click B before the read returns, Save writes A's values to B.
  `src/components/detail/FileTagsSection.tsx:85-112`. A save still in flight also closes an editor
  opened on the next track. *Checked; timing-dependent.*
- [x] **Update Collection with remove-missing deletes tracks of a folder that failed to read.**
  `walkAudioFiles` swallows `readdirSync`/`statSync` errors (`folderWalk.ts:22-27, 51-53`); the
  only guard in `scan.ts:82-85` is `diskFiles.length > 0`. The dialog's "N missing" is counted
  before the scan. *Walk reproduced (one unreadable folder: 19,950 of 20,000 files, no error),
  checked.*
- [x] **Restore overwrites the live database in place.** `backup:restore` closes the DB and
  `copyFileSync`s over `collection.db` then `config.json`: no integrity check of the backup, no
  snapshot of the current DB first, a failed copy leaves a truncated DB and a closed handle with no
  relaunch. `electron/main/ipc.ts:370-382`, `backup.ts:135-138`. *Checked.*
- [x] **Moving the data folder can adopt a half-copied database.** Copy goes straight to
  `<new>/collection.db`; "already has data" is `existsSync`. A failed copy, then the same folder
  picked again, adopts the partial file. A throw after `db.close()` leaves the session without a
  DB. `dataMigration.ts:38-44`, `ipc.ts:391-402`. *Traced.*
- [x] **Tag save rewrites the audio file in place and never restores its safety copy.** The backup
  `tag-edit-backup-<pid>-<ts>` in the media cache is only used inside the same call; after a crash
  or quit mid-write nothing restores it, and the cache prune can evict it. `bytesWritten` isn't
  checked; a failed write whose restore succeeds leaks the backup.
  `electron/main/tagWriter.ts:329-351`. *Checked; crash not reproduced.*
- [x] **Order by Harmonic Mixing can overwrite the wrong playlist** (branch). `selectPlaylist` sets
  the new id before its track ids arrive; the action reads `selectedPlaylistTrackIds` (still the
  old playlist's) and writes them to the new id. Undo restores the same wrong ids.
  `src/state/savedPlaylistSlice.ts:67-73, 143-156`. `moveTracksInSelectedPlaylist` has the same
  pattern. *Reproduced with mocked IPC, checked; window is one IPC round trip.*
- [x] **The table's keys act under other screens.** TrackTable's window keydown stays live under
  Queue / FX / Live and the visualizer (`setPlayerScreen` and `setVisualizerOpen` don't set
  `modalOpen`): ⌫ removes songs from the hidden playlist, ⌘A checks everything, arrows and P act on
  hidden rows. `ConfirmDialog` doesn't set `modalOpen` either. `TrackTable.tsx:507-559`,
  `App.tsx:640-647`, `store.ts:1173`. *Traced.*
- [x] **`applyMoves` aborts mid-batch on a UNIQUE violation.** A hidden row (`present = 0`) keeps
  its path; moving another file to that path throws outside the `try`, files already moved stay
  moved and the page isn't told. `moveTracks.ts:74`; `convert.ts:214-219` has the same collision.
  *Reproduced.*
- [x] **Bulk actions include checked tracks no longer listed.** "Show in Folder Tree View"
  (`App.tsx:836-839`) and the Compatible filter don't clear the checks; a drag, Convert all, Refine
  BPM of all then act on hidden tracks. The move dialog's default button is Move. *Traced.*
- [x] **No protection against two machines on one database** (data folder in a synced folder):
  rollback journal, no lock or "open elsewhere" marker; the last upload wins. A fresh second machine
  also writes its own `collectionFolder` into the shared config (`dataMigration.ts:46-51`).
  `db.ts:120-126`. *Plausible.*

## 2. Broken, and a user would notice

**Fixed on 2026-10-12** ([session](2026-10-12-session.md)), on the branch, not yet merged. Notes on
what was done differently from the finding, or left:
- ⌘A after a checkbox: the checkboxes are gone ([ADR 0068](../adr/0068-select-rows-without-checkboxes.md));
  the table's keys are also off under Queue, FX, Live and the visualizer (part of the group 1 item;
  `ConfirmDialog` still doesn't set `modalOpen`).
- Harmonic order: the objective was changed, not the claim — most harmonic changes first. Exact up
  to 18 keys; beyond, the count of harmonic changes is searched exactly
  ([ADR 0067](../adr/0067-harmonic-order-over-keys-not-songs.md), note of 2026-10-12).
- Element errors: a toast now says the track couldn't play. The queue does **not** move on by
  itself — with the collection's drive unplugged that would empty the queue in seconds.
- Long tracks: essentia reads the first 20 minutes; a 50-minute track now analyses (150 s). The
  heap that stays large per worker, and the retry of a failed track in bulk runs, are unchanged.
- Tag import: names in other capitals now match. A file that isn't JSON still shows the raw parse
  error.
- m3u relative paths: resolved against the playlist's folder; no test yet.
- Queue view's progress bar (`[~]`): not found — `Player.tsx` sets `setPlaybackProgress(ratio)` on
  every `timeupdate`. Left as it is; to check in the app.

### This branch
- [x] **⌘A (and ⌫, arrows, P) dead after ticking a checkbox or pressing a row button.** The guard
  skips every `INPUT` and `BUTTON`, and focus stays on a clicked checkbox or button.
  `TrackTable.tsx:511`. Fix: exempt only text-entry inputs, `textarea`, `select`. Also give the
  handler a notion of "the table is showing" (group 1). *Checked.*
- [x] **Bit depth wrong or missing for some lossless files** (`bitDepthOf`,
  `electron/main/analysis/metadata.ts:19-22`; music-metadata 11.16.1), all *reproduced*:
  - 24-bit ALAC from Apple's encoder (`afconvert`, Music) reads as 16: the MP4 `sampleSize` field.
  - AIFF-C (`sowt`, `fl32`, `BEI24`): the library sets `lossless = false` for every `FORM AIFC`.
  - 32-bit float WAV with a `fact` chunk (ffmpeg `pcm_f32le`): `lossless = false`.
- [x] **A failed read during the backfill marks a lossless track "none" for good.** The catch
  writes `bit_depth = COALESCE(bit_depth, 0)`; with the collection's drive unplugged at first
  launch every track gets 0 and nothing re-reads. `tagReader.ts:91`; `tagReader.test.ts` asserts
  it. *Checked.*
- [x] **The reader can write stale tags over a save or a convert made while it parses** (holds
  `{id, path}` across the await). `tagReader.ts:88`. *Plausible.*
- [x] **Harmonic order: wording.** The code comment (`harmonicOrder.ts:18-20`), ADR 0067 and a test
  title say lowest cost = most harmonic changes. False: 9A 11B 9B 10B 7B 12B gives 3 of 5 where 4
  of 5 exists (52 of 600 random sets). Either change the claim or the objective. *Reproduced.*
- [x] **Harmonic order: 17–24 keys.** The heuristic was worse than optimal in up to 4 of 12 random
  sets (gap of cost 2); its move step only moves forward. `harmonicOrder.ts:77-118`. *Reproduced.*
- [x] **Undo of the ordering discards a drag made after it** (`moveTracksInSelectedPlaylist` leaves
  `playlistUndo` alone). `savedPlaylistSlice.ts:177`. *Traced.*
- [x] **The button shows where the table can't show the result** (Missing or Duplicates filter on).
  Use the `canReorder` condition. `TrackTable.tsx:930`. *Traced.*
- [x] **Smoke test gaps** (`tests/app/smoke.mjs`): the harmonic group never asserts the order
  changed and accepts the "Already in harmonic order" toast (`:356-364`); nothing compares the
  table's row order; 'select all' can't see the native menu and clicks a row first, so it misses
  the guard bug; `:371` removes whichever chip is first.
- [x] **Unit test gaps:** no `bitDepthOf` tests for M4A, AIFF-C, float WAV; no 17–23 key or 13–16
  key cases; nothing for `orderSelectedPlaylistByKey` or the reorder undo.

### Rest of the app
- [x] **Rename of a Tag or Subtag does nothing**: `window.prompt` isn't supported in Electron.
  `src/components/TagTree.tsx:180`. *Checked in code, not run.*
- [x] **Same track queued twice in a row stops the queue.** Player is keyed on `currentTrack.id`
  (`App.tsx:882`), so no remount and no autoplay. *Traced.*
- [x] **Element errors are silent and stall the queue.** `onError={() => setPlaying(false)}`,
  `play().catch(() => {})`; no toast, `ended` never fires. `Player.tsx:529`. *Traced.*
- [x] **The queue keeps ids of tracks that left `tracks`**: "Nothing queued" with Next disabled
  while more are waiting. `store.ts:1046-1067, 1162`. *Traced.*
- [x] **`playTrackNow` / `playPlaylistNode` have no "superseded" guard after a cloud download**: a
  late download cuts off what is playing. `store.ts:1077-1082`, `savedPlaylistSlice.ts:192-194`.
- [x] **`advanceToNext` gives up if the queue changed during the next track's download.**
  `store.ts:1162-1164`.
- [x] **No window and no message when startup fails**: `openDatabase` inside `whenReady().then`
  with no catch (drive unplugged, malformed DB), and a cut-off `config.json` throws in `new Store`.
  `electron/main/index.ts:259-329`, `config.ts:55`. A data folder without `collection.db` yet
  silently gets a new empty one. *Throws reproduced.*
- [x] **No navigation guard on the main window.** No `will-navigate` handler and no document-level
  drop `preventDefault`: a file or link dropped outside a drop area replaces the app, and that page
  gets the preload API. `index.ts:177-216`. *Checked (no handler exists); not run.*
- [x] **Tracks over about 45–60 minutes can't be analysed**: essentia aborts
  (`abort(undefined)`), the WASM heap stays at about 2 GB per worker, PCM is held three times in
  `decodeToPcm`, and bulk runs retry the failed track every time. `analysis/decode.ts:17-32`,
  `bpmKey.ts:26-30`. *Reproduced.*
- [x] **Table blank for seconds when the list shrinks while scrolled far down**: `firstRendered`
  isn't clamped and `scrollTop` isn't reset on a filter change (about 9 s from row 20,000).
  `TrackTable.tsx:490-492`. *By arithmetic.*
- [x] **In the Tags view any tag change clears the checked tracks.** `TagTree.tsx:143-152` with
  `App.tsx:792-797`. *Traced.*
- [x] **The Subtags view filters against a stale copy of the tags.** `SubtagTree.tsx:45-59`.
- [x] **Unmute after a track change jumps to full volume** (`lastVolumeRef` lives in a component
  remounted per track). `Player.tsx:80, 780-786`. `playerVolume` is also never persisted.
- [x] **Duplicates filter flags unrelated non-Latin titles**: `normalise` strips everything outside
  `[a-z0-9]`. `src/state/duplicates.ts:8-21`. *Reproduced.*
- [x] **Undo of a Tag or Subtag delete fails entirely if a track it was on is gone** (plain
  `INSERT`, foreign key). `tags.ts:110-117, 165-179`. *Reproduced.*
- [x] **Tag import aborts on names differing only by capitals.** `tagExport.ts:68-95`; errors are
  rethrown raw in `ipcTags.ts:169-177`. *Reproduced.*
- [x] **Rekordbox .txt import matches a blank or symbol-only title to an arbitrary untagged
  track.** `playlists.ts:477-488`. *Reproduced.*
- [x] **Rekordbox import drops cue names** (`RekordboxCue` has no name; export writes it).
  `rekordboxXml.ts:251-261`, `cues.ts:107`. *Reproduced.*
- [x] **m3u entries with relative paths never match by path.** `ipcPlaylists.ts:93-98`. *Plausible.*
- [x] **The second machine on a shared data folder takes no daily backup** (`lastBackupAt` is in
  the shared config, backups are local). `backup.ts:92`. *Traced.*
- [x] **"Add to playlist…" in Similar tracks probably closes on the click that opens it** (no
  `stopPropagation`). `detail/SimilarTracksSection.tsx:158`. *Plausible.*
- [x] **Undo toasts overlap**, so Undo hits the wrong action (tag delete, then a playlist remove).
  `App.tsx:615-633`.
- [~] **Queue view's progress bar never moves** (`setPlaybackProgress` only ever gets 0).
- [x] **A column header stays dimmed after an abandoned drag** (no `onDragEnd`).
  `TrackTable.tsx:1046-1051`.
- [x] **⌘S / ⌘T can latch the siren or mic Talk on** (no modifier check). `App.tsx:481-496`.
  *Plausible.*

## 3. The slow player after saving tags (still open)

No single cause proven. What a tag save does, in order:
1. `writeTags` reads the whole file, builds a second full-size buffer and parses it twice in the
   main process, writes a full-size backup, then rewrites the file and `fsync`s (`tagWriter.ts`).
2. One `statSync` and one `UPDATE`; the page patches one track, the player's `src` doesn't change.
3. Three seconds later the folder watcher runs a synchronous full scan on the main thread, which
   also serves `media://` (`ipc.ts:456-469`).
4. AIFF: the FLAC cache key is `sha256(path:mtime)`, so the next request re-transcodes, and the new
   FLAC has different offsets (tags are copied in). MP3/WAV: the tag block changes size, so the
   audio bytes move under the open stream and later range requests.
5. If the write takes longer than the 3 s debounce, the scan resets the track to `pending` and
   triggers `loadAll` and a re-analysis (`ipc.ts:826-831`).

Measured earlier on the real collection: the scan walk 31 ms (2,698 files on Drive), the FLAC
remake 0–2 s, the save 234 ms for a 106 MB AIFF. So the untested suspect is step 4: the file
changing under the playing stream. Open question to the user: is it the saved track that turns slow
while it plays, or every track afterwards?

## 4. Smaller or narrower

- [ ] **Updater:** integrity is TLS to GitHub only; `browser_download_url`'s host isn't checked, no
  checksum, any ad-hoc signature passes. ADR 0013's "verifies it" overstates it.
  `updater.ts:71-84, 255-293`. The swap script can restore the old app into a half-copied new one
  (`:142-147`, cross-volume or full disk only).
- [ ] **Release workflow** publishes whatever ref it runs on under main's version tag; no check
  that the ref is `main` or that the tag points at the commit. `release.yml:103-116`.
- [ ] **Cast media server:** `createReadStream().pipe(res)` with no error listener (an uncaught
  exception in main on a read error) and no destroy on abort (a file descriptor per seek).
  `cast/castMediaServer.ts:108`.
- [ ] **Cast receiver:** a pause or seek before metadata is undone, and `loadedmetadata` listeners
  stack across quick skips. `cast-receiver/main.ts:171-199`.
- [ ] **Stop doesn't stop the download phase of "Analyse selected"**; a cancelled re-analysis
  resets a `done` track to `pending`. `ipc.ts:519-557`, `queue.ts:233`.
- [ ] **`IN (...)` lists fail above 32,766 ids** (analyse, drag, move). `ipc.ts:525, 539, 676, 699`.
  *Reproduced.*
- [ ] **ffmpeg children are never killed** (no `.kill(` in `electron/main`): quitting mid-convert
  leaves `.mcotmp` files in the collection.
- [ ] **No single-instance lock** (`open -n`, Windows).
- [ ] **Windows drive root:** `media://` returns 404 for everything (`mediaProtocol.ts:45`,
  `ipcConvert.ts:48`) and the folder tree is empty (`src/state/folderTree.ts:17`); `parentPath`
  edge cases.
- [ ] **Performance:** every analysis progress event reloads the whole track list
  (`App.tsx:550-559`); sorting by Tags/Subtags rebuilds names in the comparator (about 200 ms at
  30,000 tracks, `TrackTable.tsx:424-437`); `TrackTable.tsx:857-858` is quadratic after ⌘A; rows
  aren't memoised; the Queue list isn't virtualised and fetches artwork per row; reverb decay
  regenerates the impulse every frame (`fxModules.ts:21-32`).
- [ ] **Audio:** no limiter on the master (EQ ±24 dB clips output and recordings); MIDI faders go
  through `requestAnimationFrame` and do nothing while the window is hidden (`midiSlice.ts:32-48`);
  MIDI bindings ignore the device; a failed recorder worklet load is cached until restart
  (`recorder.ts:33-38`); an unplugged mic stays "on".
- [ ] **Store:** `trashTrack` patches only part of what main changed (`store.ts:1377-1389`); checks
  in the Missing view are dropped by any `loadAll`; unsaved ID3 edits are dropped without a prompt
  when another row is clicked.

## Checked and found clean
Schema migrations and cascades; transactions; backup creation (`VACUUM INTO`) and pruning; no SQL
injection; IPC handlers take ids, not paths; Rekordbox XML escaping; the additive-only tag rule;
`contextIsolation` on, `nodeIntegration` off, CSP present, `shell.openExternal` only with checked
URLs; `media://` confined to the collection by realpath, range handling correct; transcode cache
never serves a half-written file; convert's temp-then-rename-then-Trash order; cross-volume moves;
the Cast server's token and id-only lookups; no HTML injection in the receiver or the page; the
Held–Karp ordering up to 16 keys (matched an independent solver on 612 random sets) and its speed
(under 70 ms); the bit depth backfill doesn't loop and only rewrites title, artist, album, genre,
year and bit depth; shuffle; Camelot helpers; no hand-rolled path splitting in the page.

## Not covered
Settings pages (Appearance, Audio, MIDI, Updates, ThemePicker), `RekordboxImportSummary`,
`CoverSection`, `UpdateBanner`; FX, Live, Mic and second-screen components; `micWorklet`,
`pitchShifter`, `sirenSchedule`, `audioAnalysis`; `tempoRefine`, `waveform`; Cast discovery and
the TV visualizer; `src/types.ts`; AudioContext behaviour after sleep or an output device change.

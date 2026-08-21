# Playlist Feature Design

**Status:** Approved for planning.
**Builds on:** the merged player work (footer player, load-to-player, MIDI, delay/reverb FX — now on `main`). This work is on its own new branch, `playlist`.
**Source:** `FUTURE_TODO.md`'s "Playlist management on the player" note, refined through brainstorming.

## Goal

Replace the single "loaded track" model with a real queue the player draws from:

1. A full-screen player view (collapsed footer ↔ full-screen, via a chevron) that shows the current playlist and lets you add/remove/reorder tracks.
2. Two playback-advancement modes: continuous (auto-advance when a track ends) and manual (only advances on an explicit "Play next").
3. Three track-list actions replacing the current single "Load track in Player": **Play track now**, **Add to playlist**, **Play next**.

## Decisions from brainstorming

- Full-screen keeps a compact transport strip (title/BPM/status, play/pause/seek/volume, FX row) pinned at the top; the playlist fills the rest of the screen below it. Controls are never only reachable by collapsing.
- The playlist is the single source of truth for what's playing — there's no separate "loaded track" concept anymore. The footer player derives its track from `playlist[playlistCursor]`.
- **Play track now** does **not** clear the queue — it replaces only the current cursor position, leaving everything before and after it untouched. If nothing is currently active (empty playlist, or the cursor became `null` because the last-playing track was removed), it appends instead of replacing nothing.
- **Add to playlist** appends to the end. If the playlist was empty, the new track becomes the cursor target but does **not** auto-play — adding is not the same as playing.
- **Play next** inserts immediately after the current cursor position.
- Reordering is drag-and-drop, not up/down buttons.
- Session-only: the playlist, cursor, and continuous/manual mode all reset to empty/default on every app launch — no electron-store persistence.
- No wraparound: reaching the end of the playlist (continuous mode, or manual "Play next" at the last track) just stops there.

## 1. Pure playlist logic (`src/state/playlist.ts`)

All the array/cursor arithmetic — the part most likely to have an off-by-one bug, especially remove/reorder interacting with the current-track pointer — lives in one small, dependency-free module and is unit-tested directly, separate from the zustand store wiring. Every function takes and returns a plain `PlaylistState`; the store wraps these with `get()`/`set()`.

```ts
export interface PlaylistState {
  playlist: number[]
  cursor: number | null
}

// Replaces just the current cursor position, preserving everything before
// and after it. If there's no current position (empty playlist, or cursor
// is null because the last-playing track was removed), appends instead of
// replacing nothing.
export function playTrackNow(state: PlaylistState, trackId: number): PlaylistState {
  if (state.cursor === null) {
    return { playlist: [...state.playlist, trackId], cursor: state.playlist.length }
  }
  const playlist = [...state.playlist]
  playlist[state.cursor] = trackId
  return { playlist, cursor: state.cursor }
}

// Appends to the end. If nothing was active, the new track becomes the
// cursor target (but the caller must NOT auto-play from this — adding
// isn't playing).
export function addToPlaylist(state: PlaylistState, trackId: number): PlaylistState {
  const playlist = [...state.playlist, trackId]
  const cursor = state.cursor === null ? playlist.length - 1 : state.cursor
  return { playlist, cursor }
}

// Inserts immediately after the current cursor position (or at the start
// if nothing is active).
export function playNext(state: PlaylistState, trackId: number): PlaylistState {
  const insertAt = state.cursor === null ? 0 : state.cursor + 1
  const playlist = [...state.playlist.slice(0, insertAt), trackId, ...state.playlist.slice(insertAt)]
  const cursor = state.cursor === null ? 0 : state.cursor
  return { playlist, cursor }
}

// Removing a row before the cursor shifts the cursor down by one (same
// track stays "current"). Removing the row at the cursor means whatever
// shifted into that index becomes current, or nothing does if it was the
// last row.
export function removeFromPlaylist(state: PlaylistState, index: number): PlaylistState {
  const playlist = state.playlist.filter((_, i) => i !== index)
  if (state.cursor === null) return { playlist, cursor: null }
  if (index > state.cursor) return { playlist, cursor: state.cursor }
  if (index < state.cursor) return { playlist, cursor: state.cursor - 1 }
  return { playlist, cursor: index < playlist.length ? index : null }
}

// Drag-and-drop reorder. The cursor is tracked through the move so
// playback never silently jumps to the wrong track: if the moved item
// WAS the cursor, the cursor follows it to toIndex; otherwise the cursor
// shifts by one only if the move crossed over it.
export function movePlaylistItem(state: PlaylistState, fromIndex: number, toIndex: number): PlaylistState {
  if (fromIndex === toIndex) return state
  const playlist = [...state.playlist]
  const [moved] = playlist.splice(fromIndex, 1)
  playlist.splice(toIndex, 0, moved)

  let cursor = state.cursor
  if (cursor !== null) {
    if (fromIndex === cursor) cursor = toIndex
    else if (fromIndex < cursor && toIndex >= cursor) cursor -= 1
    else if (fromIndex > cursor && toIndex <= cursor) cursor += 1
  }
  return { playlist, cursor }
}

// No wraparound — returns the SAME state object (reference-equal) when
// already at the end or the playlist is empty, so callers can cheaply
// detect "couldn't advance" via `result === state` and stop playback
// instead of looping.
export function advanceToNext(state: PlaylistState): PlaylistState {
  if (state.cursor === null) return state
  const next = state.cursor + 1
  if (next >= state.playlist.length) return state
  return { playlist: state.playlist, cursor: next }
}
```

**Test file:** `src/state/playlist.test.ts` — direct cases for each function, with particular attention to the cursor-adjustment branches in `removeFromPlaylist` and `movePlaylistItem` (removing/moving before the cursor, at the cursor, after the cursor; moving across the cursor in both directions; removing the last item while it's current).

## 2. Store integration (`src/state/store.ts`)

Removes `loadedTrackId`/`loadTrackInPlayer` entirely, replaced by:

```ts
playlist: number[]
playlistCursor: number | null
continuousPlay: boolean
playerExpanded: boolean

playTrackNow: (trackId: number) => Promise<void>
addToPlaylist: (trackId: number) => void
playNext: (trackId: number) => void
removeFromPlaylist: (index: number) => void
movePlaylistItem: (fromIndex: number, toIndex: number) => void
advanceToNext: () => Promise<void>
setContinuousPlay: (value: boolean) => void
setPlayerExpanded: (value: boolean) => void
```

Initial state: `playlist: []`, `playlistCursor: null`, `continuousPlay: false`, `playerExpanded: false`.

`playTrackNow` and `advanceToNext` are the two actions that can land the cursor on a **new current track**, so they're the two places that need the existing auto-download/auto-analyze behavior (previously in `loadTrackInPlayer`): download the track first if it's cloud-only (nothing to stream otherwise), then kick off a background `runAnalysis([trackId])` if its status is `pending`/`error`. This logic is factored into a module-level helper (not a store action — same pattern as the existing `setTrackTags` helper already in `store.ts`, which also takes `set`/`get` as parameters rather than being called via `get()`):

```ts
async function ensureTrackReady(
  set: StoreApi<CollectionState>['setState'],
  get: StoreApi<CollectionState>['getState'],
  trackId: number
): Promise<void> {
  // same body as the old loadTrackInPlayer's download/analyze branch
}
```

Called by both actions after computing the new playlist/cursor — but **not** by `addToPlaylist`/`playNext`, which only queue a track without making it current, so downloading/analyzing it immediately would be wasted work for a large queue that may never reach that track.

```ts
playTrackNow: async (trackId) => {
  const result = playTrackNowPure({ playlist: get().playlist, cursor: get().playlistCursor }, trackId)
  set({ playlist: result.playlist, playlistCursor: result.cursor })
  await ensureTrackReady(set, get, trackId)
},

addToPlaylist: (trackId) => {
  const result = addToPlaylistPure({ playlist: get().playlist, cursor: get().playlistCursor }, trackId)
  set({ playlist: result.playlist, playlistCursor: result.cursor })
},

playNext: (trackId) => {
  const result = playNextPure({ playlist: get().playlist, cursor: get().playlistCursor }, trackId)
  set({ playlist: result.playlist, playlistCursor: result.cursor })
},

removeFromPlaylist: (index) => {
  const result = removeFromPlaylistPure({ playlist: get().playlist, cursor: get().playlistCursor }, index)
  set({ playlist: result.playlist, playlistCursor: result.cursor })
},

movePlaylistItem: (fromIndex, toIndex) => {
  const result = movePlaylistItemPure({ playlist: get().playlist, cursor: get().playlistCursor }, fromIndex, toIndex)
  set({ playlist: result.playlist, playlistCursor: result.cursor })
},

advanceToNext: async () => {
  const before = { playlist: get().playlist, cursor: get().playlistCursor }
  const result = advanceToNextPure(before)
  if (result === before) return // already at the end (or empty) — no-op
  set({ playlistCursor: result.cursor })
  const trackId = result.playlist[result.cursor!]
  await ensureTrackReady(set, get, trackId)
},

setContinuousPlay: (value) => set({ continuousPlay: value }),
setPlayerExpanded: (value) => set({ playerExpanded: value }),
```

(The `...Pure` names above are the `src/state/playlist.ts` imports, aliased on import to avoid clashing with the store's own action names of the same shape.)

## 3. Player changes (`src/components/Player.tsx`)

- Add an up-chevron button (rendered next to the existing controls) that calls `setPlayerExpanded(true)`.
- `onEnded` on the `<audio>` element changes from just `setPlaying(false)` to: if `continuousPlay` is true, call `advanceToNext()` (which updates `playlistCursor`, causing `App.tsx` to pass a new `track` prop with a new `key`, so `Player` remounts and its existing autoplay-on-mount effect naturally starts the next track — no new autoplay logic needed here); otherwise `setPlaying(false)` as today.

## 4. Full-screen view (`src/components/PlaylistView.tsx`, new)

Rendered by `App.tsx` in place of the normal three-pane layout when `playerExpanded` is true (the footer's compact `Player` is not rendered in this state — its transport strip is duplicated at the top of `PlaylistView` instead, reusing the same sub-pieces `Player.tsx` already renders for play/pause, seek/waveform, volume, and the FX row, rather than duplicating that JSX — see "File layout" below for how `Player.tsx` is split to make this possible without duplication).

Contents, top to bottom:
- Transport strip: same content as the collapsed footer bar, plus a down-chevron that calls `setPlayerExpanded(false)`.
- A continuous/manual mode toggle and a "Play next" button (calls `advanceToNext()` directly — usable in either mode, but the only way to advance in manual mode).
- The playlist itself: one row per queued track (title/artist/duration), the current cursor row visually marked, a remove (×) button per row, and native HTML5 drag-and-drop (`draggable`, `onDragStart`/`onDragOver`/`onDrop`) calling `movePlaylistItem(fromIndex, toIndex)` on drop.
- Empty state: "No tracks queued — right-click a track and choose Add to playlist or Play next" when `playlist.length === 0`.

## 5. Track-list actions (`src/components/TrackTable.tsx`, `src/components/DetailPanel.tsx`)

The right-click context menu becomes four items: **Play track now**, **Add to playlist**, **Play next**, **Analyse/Re-analyse track** (unchanged). The row's play-circle icon and `DetailPanel`'s play button both switch from the old `loadTrackInPlayer` to `playTrackNow`.

## File layout

- `src/state/playlist.ts` (new) — pure functions above.
- `src/state/playlist.test.ts` (new) — direct tests.
- `src/state/store.ts` — remove `loadedTrackId`/`loadTrackInPlayer`; add the playlist state/actions above, plus the private `ensureTrackReady` helper (the download/analyze logic factored out of the old `loadTrackInPlayer`).
- `src/components/Player.tsx` — split so its transport-strip/waveform/volume/FX JSX can be reused (as sub-components or an internal render function) by both the collapsed footer and `PlaylistView`; add the chevron and the `onEnded` → `advanceToNext` wiring.
- `src/components/PlaylistView.tsx` (new) — full-screen view.
- `src/components/TrackTable.tsx`, `src/components/DetailPanel.tsx` — context menu / play button changes.
- `src/App.tsx` — render `PlaylistView` instead of the normal layout when `playerExpanded`; derive the footer `Player`'s track from `playlist[playlistCursor]` instead of the removed `loadedTrackId`.

## Testing

- `src/state/playlist.test.ts` — the pure cursor/array logic, as described above (Vitest, no DOM/Electron dependency).
- Everything else (store wiring, `Player`/`PlaylistView`/`TrackTable`/`DetailPanel` UI, drag-and-drop) is verified via `tsc -b --noEmit` and a manual `npm run dev` walkthrough, matching this codebase's existing precedent for UI-adjacent code (no `@testing-library/react` is set up — see `FUTURE_TODO.md`).

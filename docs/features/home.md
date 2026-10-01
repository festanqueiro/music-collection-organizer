---
status: planned
updated: 2026-10-01
adrs: [0053]
---
# Home

## What it does
A calm first page to start the day: a few **mixes** to play straight away (like *50 random from
Dub*, *Not played in a while*, *Just added*), and a short look at the collection with anything
that needs attention (*Last backup 9 days ago*, *12 files not found*). Nothing on it changes the
collection or the Playlists box: a mix is a list of songs for now — play it, queue it, look at
it in the table — and becomes a playlist only if you press *Save as playlist…*
([ADR 0053](../adr/0053-mixes-are-temporary-lists.md)).

## Behaviour (planned)

### Opening it
- A **Home** icon (🏠) first in the toolbar, before Update Collection and Stats. MCO opens on Home
  at launch (Settings → General → *Open on Home*, on by default); otherwise it opens on the table
  as today.
- Home takes the centre pane (where the table is); the sidebar, player and queue stay as they are,
  so music keeps playing. Clicking a folder, tag, playlist or **Esc** goes back to the table.
- Laid out as one centred column of cards, generous spacing, no more than fits a laptop screen
  without scrolling much. Calm colours; warnings in the cue/amber colour, never red unless
  something is broken.

### The greeting
- "Good morning / afternoon / evening" by the time of day, and one line: "2,590 songs ·
  187 hours · 12 added this week".

### Mixes
A row of mix cards, each with its name, a line about it ("50 songs · 3 h 12 min · 128–142 BPM"),
and three actions: **▶ Play** (replaces the queue from its first song — *Undo* brings the old
queue back, as Play playlist does), **+ Queue** (adds to the end), **Show** (the table lists the
mix, below). A 🎲 on each card draws it again.

- **50 random from a Tag** — and **from a Subtag**: a chip to pick the tag (the last ones picked
  are remembered); "Dub", "Dub › Steppers". The cards shown: the user's three most used Tags by
  default, changeable with *Choose tags…*.
- **Not played in a while** — songs played before but not in the last 60 days, oldest first,
  shuffled within that (needs MCO's play counts, so it fills in over time; hidden until there are
  20).
- **Never played** — 50 random songs with no plays, favouring the most recently added.
- **Just added** — songs added in the last 14 days (by Date Added), newest first; hidden when there
  are none.
- **Around a tempo** — 50 random songs within ±3 BPM of a tempo you pick (default: the collection's
  most common, e.g. 140).
- **A harmonic run** — starts from a random song and chains up to 30 songs that are each
  key-compatible (Camelot) and within the tempo range of the one before, using the same rules as
  the *Compatible* filter ([DJ tools](dj-tools.md)). A mix to try, not a set.
- Mixes **of the day**: the random draws are seeded with today's date, so Home shows the same mixes
  all day (and on the next launch) until 🎲 or the next day. Each mix leaves out songs whose file is
  missing; cloud-only songs are included and downloaded before they play, as elsewhere.
- Nothing is saved: a mix has no row in the Playlists box. **Save as playlist…** (in Show and on
  the card's ⋯) asks for a name and creates a normal playlist with those songs, in that order.

### Showing a mix in the table
- **Show** puts the mix in the table like a playlist: in the mix's order (a `#` column), a chip
  above the table (🎲 *50 random from Dub* ×), sortable by column with *Mix order* to return,
  search and Filters narrowing it. Selecting a folder, tag or playlist replaces it; × goes back to
  the whole collection.
- It's read-only: no reorder or ⌫ (those belong to playlists); *Save as playlist…* sits next to
  the chip to keep it.
- The table remembers the mix only for this session.

### At a glance, and what needs attention
A small card with facts, and below it the warnings, each with one action and a × to hide it for a
week. Shown only when there is something to say; with nothing to warn about, a quiet "All good".

Facts:
- **Last music added**: when, and the newest 5 songs (click one to show it in the table); *Show
  all 12 added this week*.
- **Last database backup**: "today 09:14" (the daily backup), and the external-disk backup if one
  is set up ("Backup disk: 3 days ago").
- **Last played**: the last song played and when, with ▶ to start from it.

Warnings (examples, in this order):
- **Backup**: the daily backup failed (its error), or is more than 2 days old → *Back up now*.
  External-disk backup set up but not run for 14 days → *Back up to disk*.
- **Files not found**: N songs missing since the last scan → *Show them* (the Missing Tracks
  filter).
- **Not analysed**: N songs without BPM/key yet, or N whose analysis failed → *Analyse*.
- **In the cloud only**: N songs not downloaded → *Show them*.
- **Untagged**: N songs with no Tag → *Show them* (the Untagged filter).
- **Update available**: MCO x.y.z → *Install* (the updater's state; not shown on BETA/dev).
- **Rekordbox**: when [Rekordbox sync](rekordbox-sync.md) exists — Rekordbox exported changes
  since the last sync → *Sync*.

## How it works (planned)
- `src/state/homeMixes.ts` (pure): a seeded shuffle (a small PRNG seeded by `date + mix + tag`),
  and one builder per mix taking the tracks, tags, play counts and dates, returning ordered ids
  and the card's line. `harmonicRun` reuses `src/state/harmonic.ts`.
- `src/state/homeInfo.ts` (pure): facts and warnings from the store's tracks, missing tracks, tags,
  analysis status, plus backup and updater status from main (existing IPC: the backup info the
  Settings tab shows, the updater state).
- Store: `homeOpen`, `selectedMix: { name, trackIds } | null` alongside `selectedPlaylistId`
  (mutually exclusive with it, the folder and tag selection); the table's ordered-list mode
  (today the playlist's) takes either. Hidden warnings and chosen tags in localStorage (per
  computer conveniences).
- `src/components/HomeView.tsx` in the centre pane; the Home icon in `Toolbar.tsx`; *Open on Home*
  in config.

## Tests (planned)
- `homeMixes.test.ts`: the same seed gives the same mix, another day another; each mix's rules
  (random from a Tag includes its Subtags' songs, Subtag only its own; not played in a while;
  never played; just added; tempo window; the harmonic run's every step compatible); missing files
  left out; fewer songs than 50.
- `homeInfo.test.ts`: each warning's threshold (backup age, error, external disk, missing, not
  analysed, cloud-only, untagged), "All good", hidden warnings.
- Store: Show replaces the folder/tag/playlist selection and vice versa; Play replaces the queue
  with Undo; Save as playlist creates one.
- In BETA: launch opens on Home; play a mix; show one, sort it, save it.

## Limits & open questions
- *Not played in a while* and *Last played* only know plays in MCO, not Rekordbox's (until
  [Rekordbox sync](rekordbox-sync.md) brings play counts, if ever).
- Energy (only on the TV today, roadmap) would make good mixes ("warm-up", "peak") once it's in
  the desktop app.
- Should a mix's size be adjustable (25 / 50 / 100), or by duration ("one hour")?
- Should Home show the last few playlists played, as quick picks?

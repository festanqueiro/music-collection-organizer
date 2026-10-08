# The promo video

About 75 seconds of the real app on the demo collection, with captions, over one of the demo
tracks: `MCO-promo.mp4`, 1600×900, H.264 + AAC. This file is its **script** — the words on screen
are read from here — and the notes for recording it again.

## Recording it again

```bash
npx electron-vite build
node website/capture/promo.mjs ~/Desktop/MCO-promo.mp4
```

- **Needs**: Playwright (`npm i -g playwright`) and the demo library. `npm run test:app` prepares the
  library the first time (it scans, analyses and tags the made-up collection in
  `/Users/Shared/Music/MCO Demo Collection`; your own library is never touched).
- **While it runs** (about a minute and a half): a window opens and the app is driven in it.
  Leave it alone — a click or a key lands in the recording.
- **Where it goes**: the path you give (default `website/capture/.work/MCO-promo.mp4`). It writes
  nothing to `website/assets`; putting the video on the website is a separate step.
- **Check it**: watch it once. The things that have gone wrong before are listed under *Gotchas*.

## When to record it again

After a change to anything a scene shows: the track table, the details panel (its Playlists and
Similar tracks sections), the player and its waveform, the Convert dialog, the Playlists box, the
FX screen, the visualizer's themes — or to the words below.

Left out on purpose (decided 2026-10-09): the three waveform styles and Refine BPM.

## The script

Each scene is a heading with its id, the words shown (the lines starting with `>`), and what
happens. **To change the words, edit them here** and record again; nothing else needs touching.
To change what happens in a scene, edit the block with the same id in `promo.mjs`.

## title
> MCO
> Music Collection Organizer
> Your tracks, analysed, tagged and ready to play

The opening card, three seconds, then it fades to the app.

## collection
> Your whole collection: BPM, key, energy, loudness

The table scrolls down and back; a click on *Deep Water* opens its details.

## tags
> Your own Tags and Subtags, in colour

The Tags view; *Dubstep* is picked, then back to Folders.

## details
> Every playlist a track is in, and the tracks that mix with it

The track that is in the most playlists is selected; its details scroll to **Playlists**, then
to **Similar tracks**.

## player
> Play it: a waveform with bar lines and hot cues

*Basement (Dub)* is played from its row menu, the player is made larger, hot cues B and C are
pressed.

## convert
> Convert a file to another format without leaving

A row's menu → Convert to… (closed without converting).

## playlists
> Playlists and folders, in and out of Rekordbox

*Sunday Session* is opened; the Playlists box is searched for "late".

## effects
> Effects, a mic and a dub siren

The FX screen, a few seconds. (*Basement (Dub)* is started again just before: see Gotchas.)

## visualizer
> And a visualizer for the room

The visualizer opens on its current theme with the caption, then Tangle, Crystal and Sponge,
three seconds each, without one.

## end
> MCO
> Music Collection Organizer
> festanqueiro.github.io/music-collection-organizer

The closing card.

## How it's made

- `promo.mjs` launches the built app as the website captures do (`app.mjs`: its own data folder,
  1600 px wide), restores the demo library, and drives it with Playwright.
- **Frames** come from Chromium's own screencast over the DevTools protocol
  (`Page.startScreencast`): a JPEG each time the page paints, about 27 a second, each with its
  time. Playwright's `recordVideo` leaves the window blank with this Electron on a Mac.
- **Over the app**, drawn by the script in the page: a pointer that follows the mouse (the real
  one isn't in a screencast), the caption, and the two cards.
- **ffmpeg** (the bundled one) lays the frames out by their times at 30 fps, fits them into
  1600×900 (the window is as tall as the screen allows, so there are thin bars above and below
  on a laptop), and adds the soundtrack: *Amber Riddim — Basement (Dub)* from the demo
  collection, looped, faded in and out. The demo tracks are synthesised by
  `make-demo-collection.py`, so there is nothing to license.

## Gotchas

- **The demo tracks are 48 seconds long.** By the effects scene the first one has played out, and
  the FX screen and the visualizer need a track playing (the Visualizer button is disabled
  without one): the script starts *Basement (Dub)* again before them.
- **A screencast only sends a frame when something changes.** On the two cards nothing does, so
  the script moves the pointer across them; without that the opening card is a single frame.
- **Rows have to be on screen to be clicked**: with the larger player the table is short. The
  scenes use rows near the top (*Deep Water*, *Basement (Dub)*, *Bassline Science*), and the
  details scene comes before the player is made larger.
- **Selectors** are the app's own labels (`aria-label="Larger player"`, `button:has-text("Convert
  to…")`…): a renamed button stops the script at that scene with the selector in the error.
- **The recording leaves the demo app's waveform style and player size as it found them** (Classic,
  normal) so the smoke test and the website captures start from the same place.

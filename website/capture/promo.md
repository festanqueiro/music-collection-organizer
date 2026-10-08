# The promo video

About 85 seconds of the real app on the demo collection, shown in a window frame with each scene's
words above it, over a soundtrack: `MCO-promo.mp4`, 1600×900, H.264 + AAC. This file is its **script** — the words on screen
are read from here — and the notes for recording it again.

## Recording it again

```bash
npx electron-vite build
node website/capture/promo.mjs ~/Desktop/MCO-promo.mp4
# with your own soundtrack, from 92.5 seconds into the file:
node website/capture/promo.mjs ~/Desktop/MCO-promo.mp4 --music "/path/to/track.wav" --music-start 92.5
```

- **The soundtrack**: `--music` takes any audio file ffmpeg reads, `--music-start` the second to
  start from (pick a drop: the video opens on it). It is looped if shorter than the video and
  faded in and out. Without `--music` it is a demo track. Only use music you may publish.

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

The opening card alone on the backdrop, three seconds, then the app arrives in its frame.

## collection
> Your whole collection: BPM, key, energy, loudness

Yellow. The table scrolls down and back, then a close-up of the BPM to Volume Score columns with
an outline around them; a click on *Deep Water* opens its details.

## tags
> Your own Tags and Subtags, in colour

Pink. The Tags view; *Dubstep* is picked, a close-up of the Tags and Subtags columns, then back to
Folders.

## details
> Every playlist a track is in, and the tracks that mix with it

Blue. The track that is in the most playlists is selected; a close-up of its details' **Playlists**
section, outlined, then of **Similar tracks**.

## player
> Play it: a waveform with bar lines and hot cues

Lime. *Basement (Dub)* is played from its row menu, the player is made larger, a close-up of the
waveform, hot cues B and C are pressed.

## convert
> Convert a file to another format without leaving

Orange. A row's menu → Convert to…, a close-up of the dialog (closed without converting).

## playlists
> Playlists and folders, in and out of Rekordbox

Pink. *Sunday Session* is opened; a close-up of the Playlists box, which is searched for "late".

## effects
> Effects, a mic and a dub siren

Red. The FX screen, closer, a few seconds. (*Basement (Dub)* is started again just before: see Gotchas.)

## visualizer
> And a visualizer for the room

Blue. The visualizer opens on its current theme, then Tangle, Crystal and Sponge, three seconds
each.

## end
> MCO
> Music Collection Organizer
> festanqueiro.github.io/music-collection-organizer

The frame leaves; the closing card.

## How it's made

- `promo.mjs` launches the built app as the website captures do (`app.mjs`: its own data folder,
  1600 px wide), restores the demo library, and drives it with Playwright.
- **Frames** come from Chromium's own screencast over the DevTools protocol
  (`Page.startScreencast`): a JPEG each time the page paints, about 27 a second, each with its
  time. Playwright's `recordVideo` leaves the window blank with this Electron on a Mac.
- **Around and over the app**, drawn in the page by `promoStage.js`: a dark backdrop with fat
  ribbons that wiggle slowly upwards like smoke (a canvas; slate, two in the scene's colour — the
  `RIBBONS` list sets where, how fat and how fast); a window
  frame (title bar, border and glow in the scene's colour) the app is fitted into and never
  leaves; **the scene's words in a band above the frame, always**, arriving a word at a time with a line
  drawn under them while the frame flashes in the scene's colour (the cards' letters arrive one
  by one too); close-ups, which enlarge the
  app inside the frame; a marching outline around what is being shown; a pointer that follows
  the mouse (the real one isn't in a screencast); and the two cards. The app's own layout isn't
  touched — `#root` is moved into the frame and only gets a transform.
- **The font** of the words and cards is Space Grotesk (`fonts/SpaceGrotesk.ttf`, SIL Open Font
  License, `fonts/OFL.txt`). To change it, put another `.ttf` there and its name in `promo.mjs`.
- **In `promo.mjs`**: `scene(id, colour)` puts up a scene's words and colour, `zoomTo(locator,
  scale)` goes closer on something, `spot(locator, extra)` outlines it, `home()` shows the whole
  app again. The colours are the `ACCENTS` of `promoStage.js`.
- **ffmpeg** (the bundled one) lays the frames out by their times at 30 fps, fits them into
  1600×900 (the window is as tall as the screen allows, so there are thin bars above and below
  on a laptop), and adds the soundtrack: the `--music` file, or *Amber Riddim — Basement (Dub)*
  from the demo collection, looped, faded in and out. The demo tracks are synthesised by
  `make-demo-collection.py`, so there is nothing to license; a track of your own is yours to
  clear.

## Gotchas

- **The demo tracks are 48 seconds long.** By the effects scene the first one has played out, and
  the FX screen and the visualizer need a track playing (the Visualizer button is disabled
  without one): the script starts *Basement (Dub)* again before them.
- **A screencast only sends a frame when something changes.** On the two cards nothing does, so
  the script moves the pointer across them; without that the opening card is a single frame.
- **Rows have to be on screen to be clicked**: with the larger player the table is short. The
  scenes use rows near the top (*Deep Water*, *Basement (Dub)*, *Bassline Science*), and the
  details scene comes before the player is made larger.
- **A `<style>` written into the page is refused** by the app's Content-Security-Policy, and so
  are `style="…"` attributes and fonts from a URL: the stage adopts a constructed stylesheet,
  sets styles from script, and makes the font from the file's bytes (`FontFace`).
- **A close-up can't centre something at the edge of the app** (the app never leaves the frame),
  so the details sections are scrolled into the middle of their panel before their close-ups.
- **Menus and dialogs** are the app's own and are shown at the fitted size or closer like the
  rest; nothing is drawn outside the frame but the words, the cards and the pointer.
- **Selectors** are the app's own labels (`aria-label="Larger player"`, `button:has-text("Convert
  to…")`…): a renamed button stops the script at that scene with the selector in the error.
- **The recording leaves the demo app's waveform style and player size as it found them** (Classic,
  normal) so the smoke test and the website captures start from the same place.

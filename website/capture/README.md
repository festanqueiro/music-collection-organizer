# Website screenshots and clips

`website/assets/shots/*.png` and `website/assets/clips/*.{mp4,gif,jpg}` are
made from the **real app**, driven by Playwright, on a **made-up demo
collection** — so they can be redone after any UI change with one command:

```bash
npm run site:capture              # build, then everything below
npm run site:capture -- shots     # only the screenshots
npm run site:capture -- clips     # only the clips
```

Then look at `website/index.html` (open it, or `npx serve website`) and
commit `website/assets/`.

## What it does
1. **Demo collection** (`make-demo-collection.py`, once): 40 tracks by
   fictional artists, synthesized with ffmpeg — kick, hats, a bass line and
   chords at a set BPM and key — so MCO's analysis finds real tempos and keys
   and the waveforms look like music. AIFF, WAV, FLAC and MP3, tagged, in a
   few folders. It goes to `/Users/demo/Music/MCO Demo Collection` when that
   can be created (it shows in the details panel), else `~/Music/…`
   (override: `MCO_DEMO_COLLECTION`).
2. **Library** (`setup.mjs`): the app runs with its own data folder
   (`website/capture/.work/`, git-ignored — your real library is never
   touched), scans and analyses the collection, and adds Tags/Subtags with
   colours and a few playlists through the app's own API. That state is kept
   and restored before every session, so runs are repeatable.
3. **Screenshots and clips** (`capture.mjs`): `app.mjs` launches the built
   app (`out/`) at 1600×1000 with the columns worth showing (and no MIDI
   learn badges). Clips are recorded straight from the virtual screen with
   ffmpeg (x11grab) on Linux, or by Playwright's own video of the page on a
   Mac, with a drawn mouse pointer, then encoded as an mp4 (1280 wide, for
   the site), a gif (for READMEs and posts) and a jpg poster.

To add a shot or a clip, add a step to `screenshots()` or a `clip(name, …)`
in `capture.mjs` and use it in `website/index.html`.

## Requirements
- **Linux** (a container, CI or a VM): Python 3, ffmpeg with x11grab and
  libx264, `xvfb-run`, Playwright (`npm i -g playwright`, or set
  `PLAYWRIGHT_MODULE_DIR`), and Electron's binary
  (`cd node_modules/electron && node install.js`). The script re-runs
  itself under `xvfb-run` on a 1600×1000 screen, and turns on software WebGL
  so the visualizer draws without a GPU.
- **macOS**: Python 3, ffmpeg (`brew install ffmpeg`) and Playwright. The page
  is sized to 1600×1000 at 1× whatever the screen, the app's data goes to
  `.work/` through `--user-data-dir`, and the demo collection to
  `/Users/Shared/Music` (so your user name isn't in the shots). A window
  opens while it runs; leave it be. The GPU draws the visualizer, so it
  looks better than on Linux's software WebGL.

Audio plays into the void (no sound device) but the player, waveform and
visualizer behave as they do on a Mac.

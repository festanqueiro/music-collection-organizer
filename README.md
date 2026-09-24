<p align="center">
  <img src="resources/icon.png" alt="MCO logo" width="160" />
</p>

# MCO - Music Collection Organizer

MCO is a desktop app for DJs who keep their music as files on disk. Point
it at your collection folder and it finds every track, works out its BPM,
musical key, and waveform, and lets you browse, search, tag, and play the
whole collection in one place. It also has a play queue, DJ-style effects,
MIDI controller support, and a full-screen music visualizer.

Everything stays on your machine. MCO never uploads your music, and it
never changes your audio files: tags and analysis results are kept in
MCO's own database.

> **Platform:** macOS only for now. Builds are unsigned and meant for local
> use; there are no downloadable releases yet, so you build it yourself
> (see below).

## Features

- **Your collection, organized** — scans a folder of WAV, AIFF, and FLAC
  files, reads their tags and cover art, and measures BPM, key, and
  waveform. Sort, search, and filter by folder or tag. Files that go
  missing are hidden, not forgotten, so their tags come back when the
  drive does.
- **Your own tags** — organize tracks with your own genres and
  sub-genres, colour-coded, filterable with AND/OR, taggable in bulk, with
  undo and export/import.
- **Play queue** — "play now", "add to queue", or "play next" from any
  track, then reorder, shuffle, and play through the queue continuously.
- **Player** — a waveform you can click to seek, volume and mute, macOS
  media keys and AirPods controls, and a choice of audio output device.
- **Effects** — EQ, low/high-pass filter, a tempo-synced delay, reverb,
  and a dub siren, all as rotary knobs in their own panel.
- **MIDI** — map any knob, toggle, or playback button to your controller
  in two clicks, with LED feedback where your controller supports it.
- **Visualizer** — a full-screen, audio-reactive visualizer with four
  themes: Horizon, Nebula, Warp, and Sound System (a speaker stack that
  thumps along with the music).
- **Google Drive for Desktop** — cloud-only placeholder files are shown
  with a cloud badge and downloaded when you play them.
- **Drag and drop out** — drag tracks straight into Finder, a DAW, or any
  other app.
- **Backups** — automatic daily backups of your library and settings,
  with one-click restore.

The full guide to every feature is in
[`docs/features/`](docs/features/README.md).

## Getting started

You'll need macOS, [Node.js](https://nodejs.org/) 22.13 or newer, and npm.

```bash
git clone https://github.com/festanqueiro/music-collection-organizer.git
cd music-collection-organizer
npm install
npm run dev     # start the app in development mode (hot reload)
```

On first launch, pick your music folder, then choose whether to analyse
it. Analysis runs in the background and can take a while on a large
collection. You can play and tag tracks in the meantime.

> If `npm run dev` complains that Electron failed to install, run
> `cd node_modules/electron && node install.js` and try again.

### Building the app

```bash
npm run dist            # build "MCO - Music Collection Organizer.app" into release/
npm run dist:install    # build it and copy it into ~/Applications
```

There's also `npm run dist:beta`, which installs a separate "BETA" copy
of the app with its own data, handy for testing changes without touching
your main library.

### Running the tests

```bash
npm test                # unit tests (Vitest)
npx tsc -b --noEmit     # type-check
```

## Where your data lives

MCO keeps a database (`collection.db`) and a settings file
(`config.json`). When you first choose your music folder, both move into a
hidden `.mco` folder inside it, so your music and its tags stay together.
You can move them somewhere else in **Settings → General**.

Tracks are remembered by their full path, so if you move the collection
to a different location, a rescan treats the files as new. Keep the same
path (for example the same drive name) to keep your tags.

Daily backups are kept in
`~/Library/Application Support/<app name>/backups/` (the last 30).

## How it's built

Electron, React, and TypeScript, built with `electron-vite`. It uses
Node's built-in SQLite (`node:sqlite`) for the library, `essentia.js` for
BPM and key detection (in background worker threads), `ffmpeg-static` for
audio decoding, `music-metadata` for tags, the Web Audio and Web MIDI APIs
for effects and controllers, `three.js` for the visualizer, and `zustand`
for app state.

- `electron/main/` — the app's back end: database, folder scanning,
  audio analysis, AIFF playback support, backups.
- `electron/preload/` — the bridge that gives the interface a safe,
  limited API into the back end.
- `src/` — the interface (React): track table, tag and folder trees,
  player, queue, effects (`src/audio/`), and visualizer
  (`src/visualizer/`).
- `docs/features/` — the feature guide.
- `TODO.md` — known issues and ideas for what's next.

## License

[ISC](LICENSE) © Francisco Estanqueiro

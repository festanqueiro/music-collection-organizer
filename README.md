<p align="center">
  <img src="resources/icon.png" alt="MCO logo" width="160" />
</p>

# MCO - Music Collection Organizer

MCO is a desktop app for DJs who keep their music as files on disk. Point
it at your collection folder and it finds every track, works out its BPM,
musical key, energy, and waveform, and lets you browse, search, tag, and
play the whole collection in one place. It also has a play queue, DJ-style
effects, MIDI controller support, a full-screen music visualizer, and
casting to your TV.

Everything stays on your machine. MCO never uploads your music, and it
never changes your audio files: tags and analysis results are kept in
MCO's own database.

> **Platform:** macOS on Apple silicon (M1 or newer).

## Features

- **Your collection, organized** — scans a folder of WAV, AIFF, FLAC, MP3,
  M4A/AAC, and OGG/Opus files, picks up new downloads on its own, reads
  their tags and cover art, and measures BPM, key, loudness, a 1–10
  energy rating, and waveform. Keeps a play count and when each track was
  last played. Sort, search, and filter by folder or tag. Files that go
  missing are hidden, not forgotten, so their tags come back when the
  drive does.
- **Your own tags** — organize tracks with your own genres and
  sub-genres, filterable with AND/OR, taggable in bulk, with undo and
  export/import. Every tag and subtag gets its own colour automatically
  (change it any time): tag badges are filled with it, subtag badges
  outlined in theirs.
- **Play queue** — "play now", "add to queue", or "play next" from any
  track, then reorder, shuffle, and play through the queue continuously,
  on its own full screen.
- **Player** — a waveform you can click to seek, a CDJ-style cue button,
  volume and mute, macOS media keys and AirPods controls, and a choice of
  audio output device. Queue, FX, Visualizer and Cast sit together at the
  right of the player bar.
- **Effects** — EQ, low/high-pass filter, a tempo-synced delay, reverb,
  and a dub siren, all as rotary knobs on their own full screen. The FX
  button lights up while an effect is engaged.
- **DJ tools** — keys in Camelot notation with a "Compatible" filter for
  harmonic mixing (same key, one step round the [Camelot wheel](https://mixedinkey.com/wp-content/uploads/2024/09/CamelotWheel-Official.webp), or
  the relative major/minor, at a BPM that matches), headphone pre-listen
  on a second output, and export of your tags as Rekordbox playlists.
- **MIDI** — map any knob, toggle, or playback button to your controller
  in two clicks, with LED feedback where your controller supports it.
- **Visualizer** — a full-screen, audio-reactive visualizer with eight
  themes: Nebula, Warp, Horizon, Sound System (a speaker stack that thumps
  along with the music), Smoke, Kaleidoscope, Paint, and Liquid 3D.
- **Casting** — play to a Chromecast, Google TV, or Nest speaker. On a
  TV, MCO's own Cast app plays the music with your effects and dub siren,
  runs the visualizer, and shows a now-playing screen: artwork, tags, BPM,
  key, energy, what's up next (and whether it mixes), and the effects
  you're using.
- **Themes** — three dark (MCO Dark, Midnight, Carbon) and three light
  (MCO Light, Paper, Arctic) colour themes, in **Settings → Appearance**.
- **Settings** — organised into pages: Library, Appearance, Audio, MIDI,
  Import & export, Backups & data, and Updates.
- **Google Drive for Desktop** — cloud-only placeholder files are shown
  with a cloud badge and downloaded when you play them.
- **Drag and drop out** — drag tracks straight into Finder, a DAW, or any
  other app.
- **Backups** — automatic daily backups of your library and settings,
  with one-click restore.
- **Automatic updates** — MCO tells you when a new version is out and
  installs it with one click.

The full guide to every feature is in
[`docs/features/`](docs/features/README.md).

## Install

1. Download the latest `MCO-<version>-arm64.dmg` from the
   [Releases page](https://github.com/festanqueiro/music-collection-organizer/releases),
   open it, and drag **MCO** into **Applications**.
2. Open MCO. The first time, macOS warns that it *"could not verify"* the
   app, because MCO isn't registered with Apple's paid developer program.
   Click **Done**, then go to **System Settings → Privacy & Security**,
   click **Open Anyway** next to the MCO message, and confirm.

That's only needed once per Mac. After that, MCO updates itself: when a
new version is out, click **Update and restart** in the banner.

## Building from source


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

These local builds are meant for the Mac that built them. The
downloadable installer is made by the Release workflow; see
[docs/releasing.md](docs/releasing.md).

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
You can move them somewhere else in **Settings → Backups & data**.

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
  player, queue, effects (`src/audio/`), casting (`src/cast/`), and the
  visualizer (themes from the
  [threejs-visualisers](https://github.com/festanqueiro/threejs-visualisers)
  package).
- `docs/features/` — the feature guide.
- `TODO.md` — known issues; `IDEAS.md` — prioritized ideas for what's next.

## License

[ISC](LICENSE) © Francisco Estanqueiro

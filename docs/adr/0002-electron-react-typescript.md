---
status: accepted
date: 2026-08-20
---
# 0002. Build MCO as an Electron + React + TypeScript desktop app, macOS only

## Context
MCO needs direct access to a large local music folder (including a Google Drive for Desktop mount),
native file dialogs, drag-out to Finder and DAWs, background audio analysis and a rich UI. The user
is on an Apple silicon Mac.

## Decision
Electron with `electron-vite`, React and TypeScript. Two processes: the main process owns the
database, scanning, analysis and all filesystem access; the renderer is pure UI with
`contextIsolation: true` and `nodeIntegration: false`, talking to main through a typed preload
bridge (`ipcRenderer.invoke` / `ipcMain.handle`, plus events pushed from main). `zustand` holds
renderer state. macOS only for now.

## Alternatives considered
- A web app: no reliable access to the collection folder or drag-out to other apps.
- Native Swift: slower to build the UI; the Web Audio / Web MIDI stack used for FX and controllers
  comes for free in Chromium.

## Consequences
- Web Audio and Web MIDI are available for [FX](../features/fx.md) and [MIDI](../features/midi.md).
- Chromium can't decode AIFF — see [ADR 0010](0010-aiff-playback-via-flac-cache.md).
- Windows/Linux would need the cloud-only heuristic revisited ([ADR 0005](0005-cloud-only-detection.md)).

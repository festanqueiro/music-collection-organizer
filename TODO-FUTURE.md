# Future TODO

Longer-term ideas — improvements or features that could help the app
overall, not urgent bugs (see `TODO.md` for those) and not yet scoped for
active work. A grab-bag to draw from when picking the next thing to build,
not a commitment list.

## Explicitly deferred from the v1 spec

- **Rekordbox read/write integration** — noted in the v1 design spec as
  future work once the local-collection foundation is solid.
- **Playlist creation/export.**
- **Multiple collection folders** — v1 supports exactly one at a time.
- **Fuller DJ mixing/deck features** — the player is a single deck with a
  queue and FX, not a two-deck mixing surface.

## Platform/infra

- **Windows/Linux support.** v1 is explicitly macOS-only (the cloud-only
  detection heuristic, in particular, is tuned to APFS/Google Drive for
  Desktop's macOS behavior and would need revisiting).
- **React component test coverage.** No `@testing-library/react` (or
  similar) is set up — all UI component correctness is currently verified
  by manual `npm run dev` walkthroughs. Worth adding if UI regressions
  start slipping through.
- **`node:sqlite` stability watch** — still flagged experimental in the
  Node versions this app currently targets; keep an eye on it as
  Electron/Node versions move forward (already noted in `TODO.md`).

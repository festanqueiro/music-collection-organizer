# TODO — Ideas

Feature ideas and requests not yet scoped/implemented. Distinct from
`TODO.md`, which tracks known bugs/gaps in what's already built.

## Urgent

- **Analysis progress indicator.** When BPM/key/waveform analysis is
  running (after a scan), show progress somewhere visible: per-track (a
  spinner/status on the row while it's `analyzing`) and a global progress
  bar in the footer (e.g. "Analyzing 12 of 47…"), driven by the existing
  `scan:progress` IPC event that's already emitted but currently only
  used to trigger a full reload.

- **Settings modal.** A modal with, for now, two things:
  - "Choose collection folder" (already exists in the toolbar — surface
    it here too, or move it here).
  - "Backup collection folder" — where the app's SQLite DB (and
    presumably the config store) get backed up to. Backups should run
    daily, and also on every app build/launch (dev, prod, etc.), and
    should never overwrite/replace older backups (each backup gets its
    own timestamped file).

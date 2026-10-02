---
status: shipped
updated: 2026-10-02
adrs: [0054, 0056, 0057]
---
# Website

## What it does
A one-page marketing site for MCO on GitHub Pages: what it is, its advantages, the main features
with short looping clips of them in action, a gallery, the full feature list, and how to install,
with the download button going to the latest GitHub release.

## Behaviour
- Sections: hero (download, the library screenshot), four advantages (local, your own tags, made
  for DJs, Rekordbox), seven features each with a clip or screenshot (Tags & search, Playlists,
  Harmonic mixing, Hot cues, Visualizer, Effects/mic/recording, Stats), a gallery, *Everything in the box*,
  Install (the "could not verify" → *Open Anyway* step), footer.
- Clips are mp4s that play muted, looped and inline, with a jpg poster; the same clips also exist
  as gifs for READMEs and posts.
- Dark, in the app's MCO Dark colours and teal accent; works down to phone width (one column).
- The footer says the screens show a made-up demo collection.

## How it works
- `website/index.html` and `style.css`, no build step and no JavaScript; Inter from Google Fonts.
- **Screenshots and clips are made from the real app** by `npm run site:capture`
  (`website/capture/`, see its README): a synthesized demo collection, a library set up through
  the app's API, Playwright driving the built app, ffmpeg recording the virtual screen on Linux
  ([ADR 0054](../adr/0054-website-captured-from-the-real-app.md)) or Playwright's video of the
  page on a Mac ([ADR 0056](../adr/0056-website-clips-recorded-on-a-mac-too.md)). Re-run after UI changes and
  commit `website/assets/`.
- Deployed by `.github/workflows/pages.yml` on every push to `main`, at the site's root, in the same
  deploy as the Cast receiver (`/cast-receiver/`) — a Pages deploy replaces the whole site
  ([ADR 0057](../adr/0057-one-pages-deploy-for-website-and-receiver.md)). The capture tooling is
  left out. The app's package leaves `website/` out (`build.files`).

## Tests
- The capture run itself is the check: it fails when a step's button or row isn't found.
- Checked in Chromium at 1440 and 390 px wide: no missing files, no horizontal scroll.

## Limits & open questions
- **One-time setup**: Settings → Pages → Source: *GitHub Actions*, before the first deploy.
- Mac clips (Playwright's video) are a little softer than Linux's, and fonts differ between the
  two: redo everything on one OS. The 1.0.53 set was captured on a Mac.
- The demo tracks are 48 s loops; Duration (and the identical Date Added, and Format) are hidden in
  captures, and column widths set so Energy, LUFS and Volume Score fit.
- A custom domain, analytics and a light theme are not set up.

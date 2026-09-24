# Releasing

Releases are built by GitHub Actions and published as a DMG installer on
the repo's Releases page. There are no accounts to set up and no secrets
to configure.

## Cutting a release

1. Merge to `main`. The Version Bump workflow bumps the patch version and
   tags it (`vX.Y.Z`).
2. Go to **Actions → Release → Run workflow** on `main`. Tick "draft" if
   you want to check the release before it goes public.
3. The workflow type-checks and tests, builds the app, checks its
   signature, and creates the GitHub release `vX.Y.Z` with:
   - `MCO-X.Y.Z-arm64.dmg` — the installer (drag MCO to Applications);
   - `MCO-X.Y.Z-arm64.zip` — the same app, zipped;
   - install instructions (`docs/release-notes-install.md`) followed by
     the auto-generated list of merged PRs.
4. If you made a draft, open it on the Releases page and **Publish**.

`npm run dist:release` builds the same DMG/ZIP locally into `release/`.

## Why macOS shows a warning, and why that's OK

macOS only opens downloaded apps silently if they're signed with an Apple
**Developer ID** certificate and **notarized** by Apple. That needs the
Apple Developer Program (US$99/year), which MCO doesn't use.

Instead, the release is **ad-hoc signed** (`"identity": "-"` in
`package.json`): a free signature with no Apple account behind it. It
matters because:

- **With** it, macOS shows *"Apple could not verify 'MCO' is free of
  malware"* the first time, and the user allows it once in **System
  Settings → Privacy & Security → Open Anyway**. The steps are in every
  release's notes.
- **Without** it, a downloaded Apple-silicon app is reported as
  *"damaged and can't be opened"*, with no Open Anyway button. Only a
  Terminal command gets past that.

Local `npm run dist` / `dist:beta` builds skip signing entirely. That's
fine because they never leave the Mac that built them, and macOS only
checks apps that were downloaded.

## Good to know

- **Apple silicon only.** Releases are built for arm64 (M1 and newer).
  `ffmpeg-static` downloads an ffmpeg for the architecture that runs
  `npm install`, so an Intel build would need its own Intel runner.
- **Same data folder as local builds.** The release app uses the same
  internal name (`v1-library-organizer`) as `npm run dist`, so on a Mac
  that already has MCO it opens the existing library. On a new Mac it
  starts fresh: pick your music folder. If that folder already has a
  `.mco` folder from another Mac, that library is adopted.
- **No auto-update.** Users install a new version by downloading the new
  DMG and replacing the app. Their library is kept.

## If you ever get a Developer ID

To get rid of the warning, join the Apple Developer Program and:

1. Create a "Developer ID Application" certificate. Export it as a `.p12`
   and store it (base64-encoded) with its password as secrets of a
   protected GitHub **Environment** (admin-only secrets, `main` only,
   required reviewers): `CSC_LINK`, `CSC_KEY_PASSWORD`, plus `APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for notarization.
   Never commit them.
2. In `package.json`, remove `"identity": "-"` and set
   `"hardenedRuntime": true`, with an entitlements plist that allows JIT
   (`com.apple.security.cs.allow-jit` and
   `com.apple.security.cs.allow-unsigned-executable-memory`).
3. In the Release workflow, add `environment: <that environment>` and
   pass the secrets to the build step only. electron-builder then signs
   and notarizes automatically. Also notarize and staple the DMG with
   `xcrun notarytool submit … --wait` and `xcrun stapler staple`.

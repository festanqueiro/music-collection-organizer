# Releasing a signed installer

A plain `npm run dist` build is unsigned. It works on the Mac that built
it, but on any other Mac, Gatekeeper blocks it ("MCO can't be opened
because Apple cannot check it for malicious software"). To install on
other Macs without that warning, the app has to be **signed** with a
Developer ID certificate and **notarized** by Apple. This page covers the
one-time setup and how to cut a release.

## What you need (one-time)

### 1. An Apple Developer Program membership

Enrol at <https://developer.apple.com/programs/> (US$99/year, individual
is fine). Signing and notarization aren't available without it.

### 2. A "Developer ID Application" certificate

On your Mac:

1. Open **Xcode → Settings → Accounts**, add your Apple ID, select the
   team, click **Manage Certificates…**, then **+ → Developer ID
   Application**.
   (Or create it at <https://developer.apple.com/account/resources/certificates>
   from a Certificate Signing Request made in Keychain Access.)
2. In **Keychain Access → login → My Certificates**, find
   "Developer ID Application: <your name> (<TEAM ID>)", expand it so the
   private key shows, select both, and **Export 2 items…** as a `.p12`
   file with a strong password.
3. Base64-encode it for GitHub:

   ```bash
   base64 -i DeveloperID.p12 | pbcopy
   ```

Keep the `.p12` and its password somewhere safe (a password manager).
Anyone who has both can sign apps as you.

### 3. Notarization credentials

- **Team ID**: 10 characters, shown at
  <https://developer.apple.com/account> under Membership details.
- **App-specific password**: create one at <https://account.apple.com> →
  Sign-In and Security → App-Specific Passwords (name it e.g.
  "MCO notarization").

### 4. Store the keys as protected GitHub secrets (admins only)

The keys go into a GitHub **Environment** called `release`, not into
plain repository secrets and never into the repo itself. Environment
secrets can only be created, changed, or deleted by repository admins,
and nobody can read them back, admins included. The protection rules
below mean the keys are handed to a workflow only when it runs from
`main` *and* an admin approves that run. So a collaborator with write
access can't get at them by editing a workflow on a branch.

In the repo, as an admin:

1. **Settings → Environments → New environment**, name it `release`.
2. Under **Deployment protection rules**, tick **Required reviewers** and
   add the admin(s) who may approve releases. Optionally tick **Prevent
   self-review** if there's more than one admin.
3. Under **Deployment branches and tags**, choose **Selected branches and
   tags** and add `main`.
4. Under **Environment secrets**, add:

   | Secret | Value |
   | --- | --- |
   | `CSC_LINK` | the base64 text from step 2.3 |
   | `CSC_KEY_PASSWORD` | the `.p12` export password |
   | `APPLE_ID` | your Apple ID email |
   | `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password |
   | `APPLE_TEAM_ID` | your Team ID |

Then delete the local `.p12` export and the copied base64 text (keep the
certificate in your keychain, or the `.p12` in a password manager, for
re-exporting later).

To rotate a key (for example a revoked certificate or a new app-specific
password), just replace that environment secret. Nothing in the repo
changes.

## Cutting a release

1. Merge to `main`. The Version Bump workflow bumps the patch version and
   tags it (`vX.Y.Z`).
2. Go to **Actions → Release → Run workflow** on `main`. Leave "draft"
   ticked.
3. The run pauses on "Waiting for review". An admin clicks **Review
   deployments → release → Approve**. Only then does the job get the
   signing keys.
4. The workflow type-checks and tests, then builds the app, signs it with
   hardened runtime, and notarizes it with Apple (usually a few minutes).
   It then notarizes the DMG, checks the result with Gatekeeper
   (`spctl`, `stapler validate`), and creates a draft GitHub release
   `vX.Y.Z` with:
   - `MCO-X.Y.Z-arm64.dmg` — the installer (drag MCO to Applications);
   - `MCO-X.Y.Z-arm64.zip` — the same app, zipped.
5. Open the draft release, check the notes, download the DMG on a
   *different* Mac if you can, and **Publish**.

If a required secret is missing, the workflow fails on its first step and
names it. It never publishes an unsigned build.

## Building a signed release locally

With the Developer ID certificate in your login keychain:

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCDE12345
npm run dist:release
```

electron-builder finds the certificate in the keychain automatically.
Without the three `APPLE_*` variables it still signs but **skips
notarization** (with a warning), and that build won't open cleanly on
other Macs.

## Good to know

- **Apple silicon only.** Releases are built for arm64 (M1 and newer).
  `ffmpeg-static` downloads an ffmpeg for the architecture that runs
  `npm install`, so an Intel build needs its own Intel runner. Add one if
  anyone needs it.
- **Same data folder as local builds.** The release app uses the same
  internal name (`v1-library-organizer`) as `npm run dist`, so on a Mac
  that already has MCO it opens the existing library. On a new Mac it
  starts fresh: pick your music folder. If the folder already has a
  `.mco` folder from another Mac, that library is adopted.
- **Bundle ID.** The app ID is `com.local.music-collection-organizer`.
  It works for signing, but if you want a "real" reverse-DNS ID (e.g.
  `com.festanqueiro.mco`), change it *before* the first public release.
  macOS treats a different ID as a different app.
- **No auto-update yet.** Users install new versions by downloading the
  new DMG. Adding `electron-updater` is a possible follow-up, and the ZIP
  asset is what it would use.
- **Entitlements** live in `resources/entitlements.mac.plist`: only JIT and
  writable executable memory, which Electron and WebAssembly need.

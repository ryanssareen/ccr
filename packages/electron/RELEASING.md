# Releasing the desktop app

Releases are built by CI. Push a `desktop-vX.Y.Z` tag and
[`.github/workflows/desktop-release.yml`](../../.github/workflows/desktop-release.yml)
builds all three platforms and creates the GitHub Release.

> **Builds are currently unsigned.** No signing secrets are configured, so macOS
> users must run `sudo xattr -cr /Applications/ccr.app` after installing — which
> the `/download` page tells them to. See [Signing](#signing-currently-off) to
> change that.

---

## Cutting a release

1. **Bump the version** in `packages/electron/package.json`. Nothing derives it
   automatically — the tag, the artifact filenames and the download page all
   have to agree, and they only agree because you make them.

2. **Commit and tag.** The tag must point at the commit you want built:

   ```sh
   git commit -am "chore(desktop): 0.1.6"
   git push origin main
   git tag -a desktop-v0.1.6 -m "ccr Desktop v0.1.6 — <what changed>"
   git push origin desktop-v0.1.6
   ```

3. **Watch the build** (~3 min; mac, win and linux run in parallel):

   ```sh
   gh run list --workflow=desktop-release.yml --limit 1
   ```

   `fail-fast: false`, so one platform failing still lets the others through —
   and the `release` job runs on `needs: build`. **A partial failure can produce
   a release with missing installers**, so always check step 4.

4. **Verify all five assets landed** before pointing anyone at it:

   ```sh
   gh release view desktop-v0.1.6 --json assets -q '.assets[].name'
   ```

   Expected, from `electron-builder.yml`'s `artifactName` settings:

   | File | Platform |
   |---|---|
   | `ccr-<ver>-mac-arm64.dmg` | macOS Apple Silicon |
   | `ccr-<ver>-mac-x64.dmg` | macOS Intel |
   | `ccr-setup-<ver>-win-x64.exe` | Windows installer (NSIS) |
   | `ccr-portable-<ver>-win-x64.exe` | Windows portable |
   | `ccr-<ver>-linux-x86_64.AppImage` | Linux |

   (electron-builder emits the AppImage as `x86_64` even though the config says
   `x64`.)

5. **Point the website at it** — `web/app/download/page.tsx`:

   ```ts
   const VERSION = "0.1.6";
   const RELEASE_URL  = ".../releases/tag/desktop-v0.1.6";
   const RELEASE_BASE = ".../releases/download/desktop-v0.1.6";
   ```

   Every download URL is built from these three. **Nothing validates them** — a
   typo or a missing asset is a 404 on every button, live. Check first:

   ```sh
   curl -o /dev/null -w "%{http_code}\n" -LI \
     "https://github.com/ryanssareen/ccr/releases/download/desktop-v0.1.6/ccr-0.1.6-mac-arm64.dmg"
   ```

   Push to `main` and Vercel deploys it.

6. **Title the release.** CI leaves the bare tag as the title. Give it a real
   one and notes users can act on:

   ```sh
   gh release edit desktop-v0.1.6 --title "ccr Desktop v0.1.6 — ..." --notes-file notes.md
   ```

---

## Local builds

For testing an installer without cutting a release:

```sh
npm run -w @ccr/desktop dist:mac     # or dist:win / dist:linux / dist:all
```

Output lands in `packages/electron/dist-installers/`. `dist:*` runs
`electron-vite build` first, so it always packages current source.

Cross-compiling is not set up; build each platform on that platform. That's what
the CI matrix is for.

---

## Signing (currently off)

`CSC_LINK` and `CSC_KEY_PASSWORD` are read by the workflow but **not configured
as repository secrets**, so every build is unsigned and macOS shows the
"unidentified developer" / "damaged" warning.

Two hooks exist for signing and **neither is wired into `electron-builder.yml`**:

| Script | Intended hook | Status |
|---|---|---|
| `scripts/adhoc-sign.cjs` | `afterPack` — ad-hoc sign local dev builds | **Orphaned** |
| `scripts/notarize.cjs` | `afterSign` — submit to Apple's notary service | **Orphaned** |

They are written and look correct, but nothing references them, so they never
run. Turning signing on means both adding the secrets **and** wiring the hooks
up — the scripts alone won't do it.

To enable signed + notarized macOS builds:

1. Enrol in the [Apple Developer Program](https://developer.apple.com/programs/)
   ($99/yr) and create a **Developer ID Application** certificate (Xcode →
   Settings → Accounts → Manage Certificates → `+`). Verify with:
   ```sh
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```
2. Export it as a `.p12`, base64 it, and add repository secrets `CSC_LINK` (the
   base64 blob or a `data:` URL) and `CSC_KEY_PASSWORD`.
3. Wire `afterSign: scripts/notarize.cjs` into `electron-builder.yml` and give
   the workflow `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (appleid.apple.com →
   App-Specific Passwords) and `APPLE_TEAM_ID` (Membership details).

The build step already guards the unsigned case: an unset GitHub secret arrives
as an **empty string**, and an empty `CSC_LINK` makes electron-builder think a
cert path was supplied and fail with `<projectDir> not a file`. The workflow
clears the vars when no cert is present. Set a real `CSC_LINK` and the guard
stops firing on its own — no workflow edit needed.

Verify a signed build before shipping:

```sh
spctl -a -vv -t execute packages/electron/dist-installers/mac-arm64/ccr.app
# want: "accepted" + "source=Notarized Developer ID"
```

---

## Troubleshooting

**`Cannot detect repository by .git/config`** — electron-builder is trying to
publish. It only does that when it sees a `GH_TOKEN` on a tag build. Publishing
belongs to the workflow's `release` job, not the builder: keep `--publish never`
on the build step and don't pass it a token. This broke every tagged run before
0.1.5.

**`<projectDir> not a file` on macOS only** — an empty `CSC_LINK`. See
[Signing](#signing-currently-off). Windows and Linux ignore the variable, so
macOS fails alone.

**Release exists but is missing installers** — a platform failed while others
passed (`fail-fast: false`, and upload uses `if-no-files-found: warn`). Check
per-job status with `gh run view <id>`, fix, then re-tag:

```sh
git tag -d desktop-v0.1.6
git push --delete origin desktop-v0.1.6
git tag -a desktop-v0.1.6 main -m "..."
git push origin desktop-v0.1.6
```

Re-tagging is safe as long as no one has downloaded the release yet. Once it's
public, burn the version and bump instead.

**Gatekeeper blocks the app** — expected while unsigned:
`sudo xattr -cr /Applications/ccr.app`.

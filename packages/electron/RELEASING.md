# Releasing the desktop app

Two flavors of build:

| Script | What it produces | Gatekeeper verdict |
|---|---|---|
| `npm run -w @ccr/desktop package:mac` | ad-hoc signed DMG, no Apple needed | "ccr is from an unidentified developer" — right-click → Open works |
| `npm run -w @ccr/desktop package:mac:release` | Developer-ID signed + notarized DMG | Silent acceptance, double-click → launch |

Use `package:mac:release` for anything you publish on the website.

---

## One-time Apple setup (do this once)

### 1. Enroll in the Apple Developer Program — $99/yr

[developer.apple.com/programs](https://developer.apple.com/programs/) → enroll as an individual (or LLC if you have one). Pay. Approval is usually a few hours but Apple sometimes takes 24–48h.

### 2. Get the "Developer ID Application" certificate

Once your account is active:

1. Open **Xcode → Settings → Accounts**, add your Apple ID, click **Manage Certificates** → `+` → **Developer ID Application**. (Easier than the dev portal — Xcode handles the keypair generation + Keychain install in one step.)
2. Or, on the [developer portal](https://developer.apple.com/account/resources/certificates/list): create a Developer ID Application cert manually, download the `.cer`, double-click to install in Keychain Access.

Verify with:
```sh
security find-identity -v -p codesigning | grep "Developer ID Application"
```
You should see one line with your team name. The cert is now ready to sign with.

### 3. Generate an app-specific password

For notarization auth, Apple requires either an API key OR an app-specific password. The password is simpler:

1. Sign in to [appleid.apple.com](https://appleid.apple.com)
2. **App-Specific Passwords** → `+` → label it `ccr-notarize` → copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`)

You'll never see this again — store it in 1Password / your password manager.

### 4. Note your Team ID

[developer.apple.com/account](https://developer.apple.com/account) → **Membership details** → Team ID (10 chars, like `K8XYZ12ABC`).

---

## Releasing

Set the three env vars, then run the release script:

```sh
export APPLE_ID="ryansareen6@gmail.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="K8XYZ12ABC"

npm run -w @ccr/desktop package:mac:release
```

What happens:
1. `electron-vite build` produces the renderer/main/preload bundles
2. `electron-builder` packages them into `ccr.app`, signs with your Developer ID cert from Keychain (auto-discovered), staples hardened-runtime entitlements
3. The afterSign hook (`scripts/notarize.cjs`) submits to Apple's notary service via `notarytool` and waits for the green light (~1–5 min)
4. Apple staples a notarization ticket to the bundle
5. The DMG wrapper is built and itself notarized
6. Output: `packages/electron/release/ccr-<ver>-arm64.dmg`

**Verify before shipping**:
```sh
spctl -a -vv -t execute packages/electron/release/mac-arm64/ccr.app
# should print: "accepted" + "source=Notarized Developer ID"

# Or after mounting the DMG:
spctl -a -vv -t open --context context:primary-signature packages/electron/release/ccr-<ver>-arm64.dmg
# should print: "accepted"
```

If both say "accepted", users will see no warning — double-click to launch.

---

## Troubleshooting

**"No identity found"** — your Developer ID cert isn't in Keychain. Run `security find-identity -v -p codesigning` to list. If empty, redo step 2.

**Notarization fails with "The signature of the binary is invalid"** — usually means `hardenedRuntime` isn't enabled or an entitlement is missing. Check `build/entitlements.mac.plist` and ensure all three Electron requirements are present (`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`).

**Notarization hangs > 10 min** — check status manually:
```sh
xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID"
xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID"
```

**Want to skip notarization for a quick test build** — `SKIP_NOTARIZE=1 npm run -w @ccr/desktop package:mac:release` will sign with Developer ID but won't submit to Apple. The .app will run on your machine but Gatekeeper will flag it on a fresh Mac.

---

## CI / GitHub Actions (later)

When you want CI to build releases, store the same three vars (plus a base64 of your `.p12` exported cert) as GitHub Secrets. The workflow imports the cert into a temporary keychain at build time. We'll wire this up after the first manual release succeeds.

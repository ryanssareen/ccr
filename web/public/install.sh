#!/usr/bin/env bash
# CCR macOS one-line installer.
# Usage: curl -fsSL https://ccr-ebon.vercel.app/install.sh | bash
#
# Downloads the latest CCR desktop DMG, mounts it, copies ccr.app to
# /Applications, strips macOS quarantine + Gatekeeper signature warnings,
# and ejects the volume — so first launch just works (no "ccr is damaged",
# no right-click → Open dance).

set -euo pipefail

VERSION="${CCR_VERSION:-0.1.1}"
DMG_URL="https://github.com/ryanssareen/ccr/releases/download/desktop-v${VERSION}/ccr-${VERSION}-arm64.dmg"
DMG_FILE="/tmp/ccr-${VERSION}-arm64.dmg"
APP_PATH="/Applications/ccr.app"
MOUNT_POINT="/Volumes/ccr ${VERSION}"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This installer is macOS-only. CLI users: npm install -g @ryanisavibecoder/ccr" >&2
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "Note: only Apple Silicon (arm64) builds exist today. Intel coming soon." >&2
  exit 1
fi

echo "▸ Downloading ccr ${VERSION}…"
curl -fsSL --progress-bar -o "$DMG_FILE" "$DMG_URL"

echo "▸ Mounting DMG…"
hdiutil attach -nobrowse -quiet "$DMG_FILE"

if [[ ! -d "$MOUNT_POINT/ccr.app" ]]; then
  # Fallback: use whatever .app the DMG actually has
  MOUNT_POINT=$(ls -1d /Volumes/ccr* 2>/dev/null | head -n1 || true)
  if [[ -z "$MOUNT_POINT" ]]; then
    echo "✗ Couldn't find mounted ccr volume." >&2
    exit 1
  fi
fi

echo "▸ Installing to /Applications…"
if [[ -d "$APP_PATH" ]]; then
  rm -rf "$APP_PATH"
fi
cp -R "$MOUNT_POINT/ccr.app" "$APP_PATH"

echo "▸ Unmounting DMG…"
hdiutil detach -quiet "$MOUNT_POINT" || true
rm -f "$DMG_FILE"

echo "▸ Stripping macOS quarantine…"
xattr -cr "$APP_PATH" 2>/dev/null || sudo xattr -cr "$APP_PATH"
spctl --add "$APP_PATH" 2>/dev/null || true

echo ""
echo "✓ ccr installed to $APP_PATH"
echo "  Launch it from Spotlight, Launchpad, or:  open -a ccr"

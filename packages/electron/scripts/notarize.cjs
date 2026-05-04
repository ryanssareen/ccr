// electron-builder afterSign hook — submits the .app to Apple's notary
// service via @electron/notarize, then staples the ticket to the bundle.
//
// Required env vars when building a release for distribution:
//   APPLE_ID                       — your Apple Developer account email
//   APPLE_APP_SPECIFIC_PASSWORD    — generate at appleid.apple.com → "App-Specific Passwords"
//   APPLE_TEAM_ID                  — your 10-char team ID (developer.apple.com → Membership)
//
// If any of these are missing the hook is a no-op (signing-only build).
// Local dev builds therefore never need an Apple account; only releases.
const path = require("node:path");
const { notarize } = require("@electron/notarize");

exports.default = async function notarizeApp(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.SKIP_NOTARIZE === "1") {
    console.log("  • SKIP_NOTARIZE=1 — skipping Apple notarization");
    return;
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log(
      "  • notarization skipped: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`  • notarizing ${appPath} with Apple notary service…`);
  console.log(`    (this typically takes 1–5 minutes; ☕)`);

  await notarize({
    tool: "notarytool",
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });

  console.log("  ✓ notarization succeeded; ticket stapled.");
};

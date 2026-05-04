// electron-builder afterPack hook: ad-hoc codesign the .app on macOS for
// LOCAL DEV builds where no Apple Developer ID cert is available.
//
// For release builds (APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
// set), this hook skips itself — electron-builder + the afterSign notarize
// hook will produce a properly Developer-ID-signed and notarized bundle
// instead, which Gatekeeper will accept silently.
//
// Ad-hoc signing only stops the harshest "is damaged" Gatekeeper message;
// users still see "unidentified developer" and need to right-click → Open.
const { execSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  // If a real signing+notarization flow is active, defer to electron-builder.
  if (
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
  ) {
    return;
  }

  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`  • ad-hoc signing ${appPath} (no Apple cert detected)`);
  try {
    execSync(
      `codesign --force --deep --sign - "${appPath}"`,
      { stdio: "inherit" },
    );
  } catch (err) {
    console.error("  ✗ ad-hoc codesign failed:", err.message);
    throw err;
  }
};

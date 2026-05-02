// electron-builder afterPack hook: ad-hoc codesign the produced .app on macOS.
// Ad-hoc signing (`codesign --sign -`) doesn't require an Apple Developer
// account but it's enough to stop Gatekeeper from showing the harsher
// "ccr is damaged and can't be opened" error. Users still see "from
// unidentified developer" on first launch and need to right-click → Open
// once, but at least double-click + Trash isn't the only option.
const { execSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`  • ad-hoc signing ${appPath}`);
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

const fs = require("node:fs");
const path = require("node:path");
const { collectOwnedFiles, removalMacro } = require("./installer-manifest.cjs");
module.exports = async ({ appOutDir, packager, electronPlatformName }) => {
  if (electronPlatformName !== "win32") return;
  fs.writeFileSync(
    path.join(appOutDir, ".pomelene-install"),
    "studio.noteblock.editor-owned-v1",
  );
  const files = collectOwnedFiles(appOutDir);
  const folder = path.join(packager.projectDir, "test-results", "installer");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "owned-files.nsh"), removalMacro(files));
  fs.writeFileSync(
    path.join(folder, "owned-files.json"),
    JSON.stringify(files, null, 2),
  );
};

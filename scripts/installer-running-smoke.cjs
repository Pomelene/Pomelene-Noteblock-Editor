const { _electron: electron } = require("playwright");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const exe = process.env.NBE_EXE,
    setup = process.env.NBE_INSTALLER,
    uninstaller = process.env.NBE_UNINSTALLER;
  assert(exe && setup && uninstaller);
  const app = await electron.launch({
    executablePath: exe,
    env: { ...process.env, NBE_SMOKE_TEST: "1" },
  });
  try {
    const page = await app.firstWindow();
    await page.locator(".start-screen").waitFor();
    const before = await page.evaluate(() => window.studio.getSnapshot());
    const userData = await app.evaluate(({ app }) => app.getPath("userData"));
    for (const [file, args] of [
      [setup, ["/S", "/currentuser", `/D=${path.dirname(exe)}`]],
      [uninstaller, ["/S", "/currentuser", `_?=${path.dirname(exe)}`]],
    ]) {
      const result = spawnSync(file, args, {
        timeout: 60000,
        windowsHide: true,
        windowsVerbatimArguments: true,
      });
      assert.ifError(result.error);
      assert.equal(
        result.status,
        10,
        `Running editor must prevent ${path.basename(file)}`,
      );
      assert(fs.existsSync(exe));
      assert.deepEqual(
        await page.evaluate(() => window.studio.getSnapshot()),
        before,
      );
    }
    console.log(
      "PASS install and uninstall refuse a running editor without changing its session",
    );
    fs.writeFileSync(
      path.resolve("test-results/installer/runtime.json"),
      JSON.stringify({ userData, runningAppChecks: 2 }, null, 2),
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const { _electron: electron, expect } = require("playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const packaged = process.argv.includes("--packaged");
const exe =
  process.env.NBE_EXE ||
  path.resolve(
    `../deliverables/PomeleneNoteblockEditor-${require("../package.json").version}/win-unpacked/Pomelene Noteblock Editor.exe`,
  );
const results = path.resolve("test-results/boot");
fs.mkdirSync(results, { recursive: true });
const checks = [],
  errors = [];
let app;
(async () => {
  app = await electron.launch({
    executablePath: packaged ? exe : require("electron"),
    args: packaged ? [] : ["."],
    env: { ...process.env, NBE_SMOKE_TEST: "1" },
  });
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.waitForSelector(".studio");
    const snapshot = await page.evaluate(() => window.studio.getSnapshot());
    // Hold the real snapshot IPC in the test process; no production delay or test hook.
    await app.evaluate(({ ipcMain, BrowserWindow }, snapshot) => {
      globalThis.bootSnapshot = snapshot;
      ipcMain.removeHandler("studio:snapshot");
      ipcMain.handle(
        "studio:snapshot",
        () =>
          new Promise((resolve) => {
            globalThis.releaseBoot = resolve;
          }),
      );
      BrowserWindow.getAllWindows()[0].setSize(1280, 800);
      BrowserWindow.getAllWindows()[0].show();
    }, snapshot);
    await page.reload();
    await expect(page.getByRole("status")).toHaveText("正在打开工作区…");
    assert.equal(await page.locator(".studio").count(), 0);
    assert.equal(
      await page
        .locator(".boot-splash")
        .evaluate((el) => getComputedStyle(el).backgroundImage),
      "none",
    );
    await page.screenshot({
      path: path.join(results, packaged ? "packaged-splash.png" : "splash.png"),
    });
    checks.push(
      "real desktop shows a solid startup while host snapshot is pending",
    );
    await app.evaluate(() => globalThis.releaseBoot(globalThis.bootSnapshot));
    await page.waitForSelector(".studio");
    assert.equal(await page.locator(".boot-splash").count(), 0);
    checks.push("first authoritative snapshot opens the actual workspace");
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("studio:snapshot");
      ipcMain.handle("studio:snapshot", () => {
        throw new Error("Startup test: host unavailable");
      });
    });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("host unavailable");
    await page.screenshot({
      path: path.join(
        results,
        packaged ? "packaged-failure.png" : "failure.png",
      ),
    });
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("studio:snapshot");
      ipcMain.handle("studio:snapshot", () => globalThis.bootSnapshot);
    });
    await page.getByRole("button", { name: "重新尝试", exact: true }).click();
    await page.waitForSelector(".studio");
    assert.equal(await page.getByRole("alert").count(), 0);
    checks.push(
      "failed initialization retries the connection into the real workspace without page navigation",
    );
    assert.deepEqual(errors, []);
    checks.push(
      "no unhandled renderer errors across loading, failure and retry",
    );
    fs.writeFileSync(
      path.join(results, packaged ? "packaged-results.json" : "results.json"),
      JSON.stringify({ packaged, checks, errors }, null, 2),
    );
    checks.forEach((check) => console.log("PASS " + check));
  } finally {
    await app?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

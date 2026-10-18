const { _electron: electron, expect } = require("playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const packaged = process.argv.includes("--packaged");
const version = require("../package.json").version;
(async () => {
  const app = await electron.launch({
    executablePath: packaged
      ? process.env.NBE_EXE ||
        path.resolve(
          `../deliverables/NoteBlockEditor-${version}/win-unpacked/NoteBlock Editor.exe`,
        )
      : require("electron"),
    args: packaged ? [] : ["."],
    env: { ...process.env, NBE_SMOKE_TEST: "1" },
  });
  const checks = [],
    errors = [];
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(String(e)));
    await app.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0].show();
      globalThis.openPaths = [];
      globalThis.savePaths = [];
      dialog.showMessageBox = async () => ({ response: 1 });
      dialog.showOpenDialog = async () => ({
        canceled: !globalThis.openPaths.length,
        filePaths: globalThis.openPaths.splice(0, 1),
      });
      dialog.showSaveDialog = async () => {
        const filePath = globalThis.savePaths.shift();
        return { canceled: !filePath, filePath };
      };
    });
    await page.waitForSelector(".studio");
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await page
      .getByText("自定义音色与映射…", { exact: true })
      .click({ timeout: 3000 });
    await expect(
      page.getByRole("dialog").getByText("自定义音色与映射", { exact: true }),
    ).toBeVisible();
    checks.push(
      "Custom instrument mapping manager is reachable from the desktop menu",
    );
    await page.getByRole("button", { name: "关闭对话框" }).click();
    const project = (await page.evaluate(() => window.studio.getSnapshot()))
      .project;
    project.samples.push({
      id: "missing-test",
      name: "Missing bass",
      color: "#fff",
      rootKey: 66,
      volume: 100,
      panning: 100,
      originalPath: "never-exists-bass.ogg",
    });
    project.instruments.push({
      id: 16,
      name: "Missing bass",
      sampleId: "missing-test",
      key: 57,
      pressKey: false,
    });
    project.patterns[0].notes[0].instrument = 16;
    const fixture = path.resolve("test-results/mapping-input.nbproject"),
      saved = path.resolve("test-results/mapping-saved.nbproject");
    fs.writeFileSync(
      fixture,
      JSON.stringify({ format: "note-block-project", version: 2, project }),
    );
    await app.evaluate((_, file) => globalThis.openPaths.push(file), fixture);
    assert.equal(
      (await page.evaluate(() => window.studio.file("open"))).ok,
      true,
    );
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await page.getByText("自定义音色与映射…", { exact: true }).click();
    const target = page.getByLabel("乐器 16 映射目标", { exact: true });
    await expect(target).toHaveValue("");
    await target.selectOption("1");
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() => window.studio.getSnapshot())
          ).project.instruments.find((i) => i.id === 16).mappingTargetId,
      )
      .toBe(1);
    await expect(target).toHaveValue("1");
    await page.getByLabel("试听映射乐器 16", { exact: true }).click();
    await expect(page.locator(".error-banner")).toHaveCount(0);
    checks.push(
      "Missing source maps to playable audio and updates in the open manager",
    );
    await page.getByRole("button", { name: "关闭对话框" }).click();
    await app.evaluate((_, file) => globalThis.savePaths.push(file), saved);
    assert.equal(
      (await page.evaluate(() => window.studio.file("saveAs"))).ok,
      true,
    );
    await page.evaluate(() =>
      window.studio.dispatch({ type: "instrument:map", id: 16, targetId: 5 }),
    );
    await app.evaluate((_, file) => globalThis.openPaths.push(file), saved);
    assert.equal(
      (await page.evaluate(() => window.studio.file("open"))).ok,
      true,
    );
    assert.equal(
      (
        await page.evaluate(() => window.studio.getSnapshot())
      ).project.instruments.find((i) => i.id === 16).mappingTargetId,
      1,
    );
    checks.push(
      "Binding survives native file save and reopen with unavailable original audio",
    );
    const density = page.getByLabel("编排行高", { exact: true });
    await density.fill("24");
    await expect(density).toHaveValue("24");
    const scroll = page.locator(".arrangement-scroll"),
      box = await scroll.boundingBox();
    const before = Number(
      await page.getByLabel("编排缩放", { exact: true }).inputValue(),
    );
    await page.mouse.move(box.x + Math.min(400, box.width - 30), box.y + 90);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -140);
    await page.keyboard.up("Control");
    await expect
      .poll(async () =>
        Number(await page.getByLabel("编排缩放", { exact: true }).inputValue()),
      )
      .toBeGreaterThan(before);
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
      ),
      1,
    );
    checks.push(
      "Native Ctrl+wheel changes time scale without changing Chromium zoom; compact row control works",
    );
    await page.screenshot({
      path: `test-results/editor-capacity-${packaged ? "packaged" : "source"}.png`,
    });
    assert.deepEqual(errors, []);
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(
      `test-results/editor-capacity-${packaged ? "packaged" : "source"}.json`,
      JSON.stringify({ version, packaged, checks, errors }, null, 2),
    );
    for (const check of checks) console.log("PASS " + check);
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

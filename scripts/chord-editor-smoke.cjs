const { _electron: electron, expect } = require("playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { encodeProject, decodeProject } = require("./project-fixture.cjs");
const packaged = process.argv.includes("--packaged");
const folder = path.resolve("test-results/chord-editor");
fs.mkdirSync(folder, { recursive: true });
(async () => {
  const app = await electron.launch({
    executablePath: packaged
      ? path.resolve(
          `../deliverables/PomeleneNoteblockEditor-${require("../package.json").version}/win-unpacked/Pomelene Noteblock Editor.exe`,
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
      const w = BrowserWindow.getAllWindows()[0];
      w.setSize(1440, 960);
      w.show();
      globalThis.openPaths = [];
      globalThis.savePaths = [];
      dialog.showOpenDialog = async () => ({
        canceled: !globalThis.openPaths.length,
        filePaths: globalThis.openPaths.splice(0, 1),
      });
      dialog.showSaveDialog = async () => {
        const filePath = globalThis.savePaths.shift();
        return { canceled: !filePath, filePath };
      };
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await page.waitForSelector(".studio");
    const snapshot = () => page.evaluate(() => window.studio.getSnapshot());
    const initial = (await snapshot()).project;
    const pat = initial.patterns[0];
    pat.name = "Chord integration";
    pat.notes = [];
    pat.length = 64;
    initial.patterns = [pat];
    initial.clips = [];
    initial.phrases = [];
    const fixture = path.join(folder, "initial.nbproject");
    fs.writeFileSync(fixture, await encodeProject(initial));
    await app.evaluate((_, file) => globalThis.openPaths.push(file), fixture);
    await page.evaluate(() => window.studio.file("open"));
    await page
      .locator(".browser-items")
      .getByText("Chord integration", { exact: true })
      .dblclick();
    const editor = page.getByTestId("pattern-editor").last();
    await editor.waitFor();
    // Maximize the actual internal window so all panel controls can be inspected.
    const floating = editor.locator(
      'xpath=ancestor::*[contains(@class,"workspace-frame")][1]',
    );
    if (await floating.count())
      await floating
        .getByRole("button", { name: "最大化或还原", exact: true })
        .click();
    await editor
      .getByRole("button", { name: "和弦生成器", exact: true })
      .click();
    await expect(editor.getByLabel("和弦生成面板")).toBeVisible();
    await editor.getByRole("button", { name: "NBS 图层", exact: true }).click();
    const canvas = editor.getByTestId("note-canvas");
    const b = await canvas.boundingBox();
    await page.mouse.click(b.x + 82 + 4 * 25 + 2, b.y + 26 + 18);
    assert.equal((await snapshot()).project.patterns[0].notes.length, 0);
    await editor.getByLabel("和弦根音 MIDI").fill("60");
    await editor.getByLabel("落笔音色", { exact: true }).selectOption("15");
    await editor.getByRole("button", { name: "放置和弦", exact: true }).click();
    await expect
      .poll(async () => (await snapshot()).project.patterns[0].notes.length)
      .toBe(3);
    let notes = (await snapshot()).project.patterns[0].notes;
    assert.deepEqual(
      notes.map((n) => [n.tick, n.pitch, n.instrument]),
      [
        [4, 60, 15],
        [4, 64, 15],
        [4, 67, 15],
      ],
    );
    checks.push(
      "grid chooses tick; placement uses current instrument and allocates real notes",
    );
    await editor.getByRole("button", { name: "试听和弦", exact: true }).click();
    await expect(
      editor.getByRole("button", { name: "试听和弦", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".error-banner")).toHaveCount(0);
    checks.push(
      "grouped real-sample audition completes without renderer errors",
    );
    await page.evaluate(() => window.studio.dispatch({ type: "undo" }));
    assert.equal((await snapshot()).project.patterns[0].notes.length, 0);
    await page.evaluate(() => window.studio.dispatch({ type: "redo" }));
    assert.equal((await snapshot()).project.patterns[0].notes.length, 3);
    checks.push("whole chord undo and redo through host history");
    await editor.locator("summary").filter({ hasText: "转位与排列" }).click();
    await editor.getByLabel("和弦转位").selectOption("1");
    await editor.getByLabel("和弦附加音").selectOption("9");
    await editor.getByLabel("和弦触发方式").selectOption("up");
    await editor.getByRole("button", { name: "放置和弦", exact: true }).click();
    await expect
      .poll(async () => (await snapshot()).project.patterns[0].notes.length)
      .toBe(7);
    notes = (await snapshot()).project.patterns[0].notes;
    assert.deepEqual(
      notes.slice(3).map((n) => [n.tick, n.pitch]),
      [
        [4, 64],
        [5, 67],
        [6, 72],
        [7, 74],
      ],
    );
    checks.push(
      "custom inversion and add9 arpeggio preserve fractional-capable event timing",
    );
    await editor
      .getByLabel("和弦生成面板")
      .evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: path.join(folder, packaged ? "packaged-panel.png" : "panel.png"),
    });
    const saved = path.join(folder, "chords.nbproject");
    await app.evaluate((_, file) => globalThis.savePaths.push(file), saved);
    assert.equal(
      (await page.evaluate(() => window.studio.file("saveAs"))).ok,
      true,
    );
    assert.deepEqual(
      (await decodeProject(fs.readFileSync(saved))).patterns[0].notes,
      notes,
    );
    await app.evaluate((_, file) => globalThis.openPaths.push(file), saved);
    assert.equal(
      (await page.evaluate(() => window.studio.file("open"))).ok,
      true,
    );
    assert.deepEqual((await snapshot()).project.patterns[0].notes, notes);
    checks.push(
      "v2 project save and desktop reopen retain all generated notes",
    );
    // Sweep across the visible three chord layers in one captured gesture.
    await page
      .locator(".browser-items")
      .getByText("Chord integration", { exact: true })
      .dblclick();
    const current = page.getByTestId("pattern-editor").last();
    await current
      .getByRole("button", { name: "NBS 图层", exact: true })
      .click();
    const cb = await current.getByTestId("note-canvas").boundingBox();
    await page.mouse.move(cb.x + 82 + 4 * 25 + 3, cb.y + 26 + 18);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(cb.x + 82 + 4 * 25 + 3, cb.y + 26 + 2 * 36 + 18, {
      steps: 1,
    });
    await page.mouse.up({ button: "right" });
    await expect
      .poll(async () => (await snapshot()).project.patterns[0].notes.length)
      .toBe(4);
    await page.evaluate(() => window.studio.dispatch({ type: "undo" }));
    assert.deepEqual((await snapshot()).project.patterns[0].notes, notes);
    checks.push(
      "fast right sweep erases touched layers and one undo restores the entire sweep",
    );
    const nativeReady = app.waitForEvent("window");
    await page.evaluate(
      (id) => window.studio.openEditor("pattern", id),
      pat.id,
    );
    const native = await nativeReady;
    native.on("pageerror", (e) => errors.push(String(e)));
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        new URL(w.webContents.getURL()).searchParams.has("kind"),
      );
      if (w) {
        w.setMinimumSize(520, 400);
        w.setSize(610, 820);
        w.show();
      }
    });
    await native.getByTestId("pattern-editor").waitFor();
    await native
      .getByRole("button", { name: "和弦生成器", exact: true })
      .click();
    await native.getByLabel("和弦根音 MIDI").fill("72");
    await native.getByRole("button", { name: "放置和弦", exact: true }).click();
    await expect
      .poll(async () => (await snapshot()).project.patterns[0].notes.length)
      .toBe(10);
    const nativeCanvas = await native.getByTestId("note-canvas").boundingBox(),
      nativePanel = await native.getByLabel("和弦生成面板").boundingBox();
    assert.ok(nativeCanvas.height >= 120);
    assert.ok(
      nativePanel.y >= nativeCanvas.y + nativeCanvas.height - 1,
      JSON.stringify({ nativeCanvas, nativePanel }),
    );
    await native
      .getByLabel("和弦生成面板")
      .evaluate((el) => (el.scrollTop = 0));
    await native.screenshot({
      path: path.join(
        folder,
        packaged ? "packaged-native-panel.png" : "native-panel.png",
      ),
    });
    await page.evaluate(() => window.studio.dispatch({ type: "undo" }));
    assert.deepEqual((await snapshot()).project.patterns[0].notes, notes);
    checks.push(
      "compact native editor panel places into the shared project and main-window undo restores it",
    );
    assert.deepEqual(errors, []);
    checks.push("no renderer exceptions");
    fs.writeFileSync(
      path.join(folder, packaged ? "packaged-results.json" : "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(JSON.stringify({ checks, errors }, null, 2));
  } finally {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      })
      .catch(() => {});
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

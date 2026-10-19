const { _electron: electron, expect } = require("playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const version = require("../package.json").version,
  packaged = process.argv.includes("--packaged");
const smart = process.argv.includes("--smart");
const corpus = process.argv.find((x) => x.startsWith("--corpus="))?.slice(9);
if (!corpus) throw Error("Provide --corpus=<NBS folder>");
function walk(folder) {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(folder, e.name))
        : e.isFile() && e.name.toLowerCase().endsWith(".nbs")
          ? [path.join(folder, e.name)]
          : [],
    )
    .sort();
}
let app, page;
const errors = [],
  rows = [];
(async () => {
  app = await electron.launch({
    executablePath: packaged
      ? process.env.NBE_EXE ||
        path.resolve(
          `../deliverables/PomeleneNoteblockEditor-${version}/win-unpacked/Pomelene Noteblock Editor.exe`,
        )
      : require("electron"),
    args: packaged ? [] : ["."],
    env: { ...process.env, NBE_SMOKE_TEST: "1" },
  });
  try {
    page = await app.firstWindow();
    page.setDefaultTimeout(60000);
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
    await require("./enter-workspace.cjs")(page);
    await page.evaluate(
      (smart) =>
        window.studio.onImportPrompt((p) => {
          if (p)
            void window.studio.respondImport(
              p.id,
              smart && p.summary.applicable ? "smart" : "original",
            );
        }),
      smart,
    );
    let largest;
    for (const file of walk(corpus)) {
      await app.evaluate((_, file) => globalThis.openPaths.push(file), file);
      const result = await page.evaluate(async () => {
        const result = await window.studio.file("open");
        return {
          ok: result.ok,
          notes: result.snapshot.project.patterns.reduce(
            (sum, p) => sum + p.notes.length,
            0,
          ),
          warnings: result.warnings.length,
          title: result.snapshot.project.title,
          organized: !!result.snapshot.project.importOrganization,
          tracks: result.snapshot.project.tracks.length,
          sourceNotes:
            result.snapshot.project.importOrganization?.summary.noteCount,
        };
      });
      assert.equal(result.ok, true);
      rows.push({ file: path.relative(corpus, file), ...result });
      if (!largest || result.notes > largest.notes)
        largest = { file, notes: result.notes };
      console.log(
        "PASS " + path.relative(corpus, file) + " " + result.notes + " notes",
      );
      const close = page
        .getByRole("dialog")
        .getByRole("button", { name: "关闭", exact: true });
      if (await close.count()) await close.click();
    }
    await app.evaluate(
      (_, file) => globalThis.openPaths.push(file),
      largest.file,
    );
    await page.evaluate(async () => {
      await window.studio.file("open");
    });
    const close = page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true });
    if (await close.count()) await close.click();
    await page.keyboard.press("F7");
    const editor = page
      .locator(".studio-window.active")
      .getByTestId("pattern-editor");
    await expect(editor).toBeVisible();
    await editor.focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Shift+5");
    await expect(page.locator(".error-banner")).toHaveCount(0);
    await expect(editor.getByLabel("复制音符", { exact: true })).toBeEnabled();
    const save = path.resolve(
      `test-results/largest-${packaged ? "packaged" : "source"}.nbproject`,
    );
    await app.evaluate((_, file) => globalThis.savePaths.push(file), save);
    const saved = await page.evaluate(async () => {
      const r = await window.studio.file("saveAs");
      return r.ok;
    });
    assert.equal(saved, true);
    await app.evaluate((_, file) => globalThis.openPaths.push(file), save);
    const restored = await page.evaluate(async () => {
      const r = await window.studio.file("open");
      return r.snapshot.project.patterns.reduce(
        (sum, p) => sum + p.notes.length,
        0,
      );
    });
    assert.equal(restored, largest.notes);
    assert.deepEqual(errors, []);
    const result = {
      version,
      packaged,
      smart,
      files: rows.length,
      imported: rows.length,
      largest: largest.notes,
      largeSelectionAndProjectRoundTrip: true,
      errors,
      rows,
    };
    fs.writeFileSync(
      path.resolve(
        `test-results/nbs-desktop-${packaged ? "packaged" : "source"}${smart ? "-smart" : ""}.json`,
      ),
      JSON.stringify(result, null, 2),
    );
    console.log(
      `ALL ${rows.length} NBS DESKTOP IMPORTS + LARGE EDIT/SAVE/REOPEN PASSED`,
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

const { _electron: electron, expect } = require("playwright/test");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const version = require("../package.json").version,
  packaged = process.argv.includes("--packaged");
const executable = packaged
  ? process.env.NBE_EXE ||
    path.resolve(
      `../deliverables/NoteBlockEditor-${version}/win-unpacked/NoteBlock Editor.exe`,
    )
  : require("electron");
const resultDir = path.resolve("test-results");
fs.mkdirSync(resultDir, { recursive: true });
const checks = [],
  errors = [];
let app, page;
const snap = () => page.evaluate(() => window.studio.getSnapshot());
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
async function open(file) {
  await app.evaluate((_, p) => globalThis.testOpen.push(p), file);
  await page.getByLabel("打开工程", { exact: true }).click();
}
async function exportNbs(file) {
  await app.evaluate((_, p) => globalThis.testSave.push(p), file);
  const result = await page.evaluate(() => window.studio.file("exportNbs"));
  assert.equal(result.ok, true);
}
function canonical(p) {
  const list = [];
  for (const c of p.clips) {
    if (c.kind !== "pattern") continue;
    const pattern = p.patterns.find((x) => x.id === c.sourceId);
    for (const n of pattern.notes) {
      if (
        n.tick < c.offset ||
        n.tick >= c.offset + c.length ||
        n.tick >= pattern.length
      )
        continue;
      const l = pattern.layers[n.layer];
      list.push(
        JSON.stringify([
          c.tick + n.tick - c.offset,
          l.sourceIndex ?? n.layer,
          n.pitch,
          n.instrument,
          n.velocity,
          n.panning ?? 100,
          n.finePitch ?? 0,
          l.name,
          l.volume,
          l.panning,
          l.locked,
          l.muted,
          l.solo,
        ]),
      );
    }
  }
  return list.sort();
}
(async () => {
  app = await electron.launch({
    executablePath: executable,
    args: packaged ? [] : ["."],
    env: { ...process.env, NBE_SMOKE_TEST: "1" },
  });
  try {
    page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(String(e)));
    await app.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0].show();
      globalThis.testOpen = [];
      globalThis.testSave = [];
      dialog.showOpenDialog = async () => ({
        canceled: !globalThis.testOpen.length,
        filePaths: globalThis.testOpen.splice(0, 1),
      });
      dialog.showSaveDialog = async () => {
        const p = globalThis.testSave.shift();
        return { canceled: !p, filePath: p };
      };
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await page.waitForSelector(".studio");
    const seed = (await snap()).project;
    seed.title = "Pattern Beta · 实际导入测试";
    seed.bpm = 120;
    const names = [
      "Melody",
      "Harmony 1",
      "Harmony 2",
      "Harmony 3",
      "Drum 1",
      "Drum 2",
      "Drum 3",
    ];
    const layers = names.map((name, i) => ({
      id: "layer-" + i,
      name,
      volume: i === 2 ? 65 : 100,
      panning: i === 3 ? 140 : 100,
      locked: false,
      muted: false,
      solo: false,
    }));
    const notes = [];
    function add(tick, layer, pitch, instrument, velocity = 80, finePitch = 0) {
      notes.push({
        id: "n-" + notes.length,
        tick,
        layer,
        pitch,
        instrument,
        velocity,
        panning: layer === 3 ? 70 : 100,
        finePitch,
      });
    }
    for (let rep = 0; rep < 4; rep++)
      for (let bar = 0; bar < 3; bar++) {
        const base = rep * 48 + bar * 16;
        [60, 64, 67, 72].forEach((p, i) =>
          add(base + i * 4, 0, p + bar, 0, 80, i === 3 ? 25 : 0),
        );
        for (const at of [0, 8]) {
          [48, 52, 55].forEach((p, i) => add(base + at, 1 + i, p + bar, 5, 66));
          add(base + at, 4, 66, 2, 90);
        }
        for (const at of [4, 12]) add(base + at, 5, 66, 3, 75);
        for (let at = 0; at < 16; at += 2)
          add(base + at, 6, 66, 4, at % 4 ? 45 : 60);
      }
    seed.patterns = [
      {
        id: "smart-original",
        name: "Original NBS",
        color: "#82b5a2",
        length: 192,
        notes,
        layers,
      },
    ];
    seed.clips = [
      {
        id: "whole",
        kind: "pattern",
        sourceId: "smart-original",
        tick: 0,
        length: 192,
        offset: 0,
        track: 0,
        muted: false,
      },
    ];
    seed.loop = { enabled: false, start: 0, end: 192 };
    const source = path.join(resultDir, "smart-seed.nbproject"),
      song = path.join(resultDir, "smart-input.nbs"),
      saved = path.join(resultDir, "smart-saved.nbproject"),
      exported = path.join(resultDir, "smart-exported.nbs");
    fs.writeFileSync(
      source,
      JSON.stringify({
        format: "note-block-project",
        version: 2,
        project: seed,
      }),
    );
    await open(source);
    await expect
      .poll(async () => (await snap()).project.title)
      .toBe(seed.title);
    await exportNbs(song);
    const preview = () => page.getByRole("dialog", { name: "导入预览" });
    const checkbox = () =>
      preview().getByRole("checkbox", {
        name: "智能 Pattern 整理（Beta）",
        exact: true,
      });
    await check(
      "NBS import displays a real optional Beta preview without replacing current edits",
      async () => {
        await page.evaluate(() =>
          window.studio.dispatch({
            type: "project:update",
            patch: { title: "Unsaved work" },
          }),
        );
        const before = await snap();
        await open(song);
        await expect(preview()).toBeVisible();
        await expect(checkbox()).toBeChecked();
        assert.equal((await snap()).project.id, before.project.id);
        await preview()
          .getByRole("button", { name: "取消", exact: true })
          .click();
        await expect(preview()).toHaveCount(0);
        assert.equal((await snap()).project.title, "Unsaved work");
        assert.equal((await snap()).document.dirty, true);
      },
    );
    let original;
    await check(
      "unchecked Beta imports the untouched single-Pattern arrangement",
      async () => {
        await open(song);
        await expect(preview()).toBeVisible();
        await checkbox().uncheck();
        await preview()
          .getByRole("button", { name: "导入", exact: true })
          .click();
        await expect(preview()).toHaveCount(0);
        await expect
          .poll(async () => (await snap()).project.title)
          .toBe(seed.title);
        original = (await snap()).project;
        assert.equal(original.patterns.length, 1);
        assert.equal(original.importOrganization, undefined);
      },
    );
    await check(
      "Escape and stale import responses cannot commit or strand the document",
      async () => {
        const before = await snap();
        await open(song);
        await expect(preview()).toBeVisible();
        await assert.rejects(
          page.evaluate(() =>
            window.studio.respondImport("obsolete-token", "smart"),
          ),
        );
        await expect(preview()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(preview()).toHaveCount(0);
        assert.equal((await snap()).generation, before.generation);
      },
    );
    let smart;
    await check(
      "smart import creates reusable variable-length parts with unchanged musical events",
      async () => {
        await open(song);
        await expect(preview()).toBeVisible();
        await expect(checkbox()).toBeChecked();
        await expect(
          preview().getByRole("table", { name: "整理前后布局对比" }),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(
            resultDir,
            packaged ? "packaged-smart-preview.png" : "smart-preview.png",
          ),
        });
        await preview()
          .getByRole("button", { name: "导入", exact: true })
          .click();
        await expect
          .poll(async () => !!(await snap()).project.importOrganization)
          .toBe(true);
        smart = (await snap()).project;
        assert.ok(smart.patterns.length > 1);
        assert.ok(smart.tracks.length > 1);
        assert.ok(smart.importOrganization.summary.proposed.reusedClips > 0);
        assert.deepEqual(canonical(smart), canonical(original));
        assert.equal(
          Math.max(...smart.clips.map((c) => c.tick + c.length)),
          192,
        );
        assert.ok(smart.clips.every((c) => c.tailTicks !== undefined));
        await page.screenshot({
          path: path.join(
            resultDir,
            packaged
              ? "packaged-smart-arrangement.png"
              : "smart-arrangement.png",
          ),
        });
      },
    );
    await check(
      "persisted report is accessible from Help and names the algorithm version",
      async () => {
        await page.getByRole("button", { name: "帮助", exact: true }).click();
        await page
          .getByRole("menuitem", { name: "智能整理报告…", exact: true })
          .click();
        const report = page.getByRole("dialog", { name: "智能整理报告" });
        await expect(report).toContainText("nbs-structure-1");
        await report.getByRole("button", { name: "关闭", exact: true }).click();
      },
    );
    await check(
      "restore original layout and undo are real reversible commands",
      async () => {
        await page.getByRole("button", { name: "编辑", exact: true }).click();
        await page
          .getByRole("menuitem", { name: "恢复原始导入布局…", exact: true })
          .click();
        await page
          .getByRole("button", { name: "恢复原始布局", exact: true })
          .click();
        await expect
          .poll(async () => (await snap()).project.patterns.length)
          .toBe(1);
        assert.equal((await snap()).project.importOrganization, undefined);
        assert.deepEqual(
          canonical((await snap()).project),
          canonical(original),
        );
        await page.keyboard.press("Control+z");
        await expect
          .poll(async () => !!(await snap()).project.importOrganization)
          .toBe(true);
        assert.deepEqual(
          canonical((await snap()).project),
          canonical(original),
        );
      },
    );
    await check(
      "save/reopen preserves the chosen organization, version and original backup",
      async () => {
        await app.evaluate((_, p) => globalThis.testSave.push(p), saved);
        await page.getByLabel("保存工程", { exact: true }).click();
        await expect.poll(async () => (await snap()).document.path).toBe(saved);
        const stored = JSON.parse(fs.readFileSync(saved, "utf8")).project;
        assert.equal(stored.importOrganization.version, "nbs-structure-1");
        assert.equal(typeof stored.importOrganization.originalData, "string");
        const generation = (await snap()).generation;
        await open(saved);
        await expect
          .poll(async () => (await snap()).generation)
          .toBeGreaterThan(generation);
        assert.equal(await preview().count(), 0);
        assert.equal(
          (await snap()).project.patterns.length,
          stored.patterns.length,
        );
        assert.deepEqual(
          canonical((await snap()).project),
          canonical(original),
        );
      },
    );
    await check(
      "NBS export after organization preserves notes and original layer settings",
      async () => {
        await exportNbs(exported);
        await open(exported);
        await expect(preview()).toBeVisible();
        await checkbox().uncheck();
        await preview()
          .getByRole("button", { name: "导入", exact: true })
          .click();
        await expect
          .poll(async () => !(await snap()).project.importOrganization)
          .toBe(true);
        assert.deepEqual(
          canonical((await snap()).project),
          canonical(original),
        );
        assert.equal(
          (await snap()).project.patterns[0].layers.length,
          original.patterns[0].layers.length,
        );
      },
    );
    await check(
      "Ctrl+O shares the same import dialog and cancels cleanly",
      async () => {
        await app.evaluate((_, p) => globalThis.testOpen.push(p), song);
        await page.keyboard.press("Control+o");
        await expect(preview()).toBeVisible();
        await preview()
          .getByRole("button", { name: "取消", exact: true })
          .click();
        await expect(preview()).toHaveCount(0);
      },
    );
    await check(
      "native editor owns its preview and closing it cancels pending import",
      async () => {
        const before = await snap();
        const ready = app.waitForEvent("window");
        await page.evaluate(
          (id) => window.studio.openEditor("pattern", id),
          before.project.patterns[0].id,
        );
        const native = await ready;
        native.on("pageerror", (e) => errors.push(String(e)));
        await native.waitForSelector(".native-studio");
        const win = await app.browserWindow(native);
        await win.evaluate((w) => {
          w.setContentSize(640, 500);
          w.show();
          w.focus();
        });
        await app.evaluate((_, p) => globalThis.testOpen.push(p), song);
        await native.evaluate(() => {
          void window.studio.file("open");
        });
        const modal = native.getByRole("dialog", { name: "导入预览" });
        await expect(modal).toBeVisible();
        assert.equal(await preview().count(), 0);
        const importButton = modal.getByRole("button", {
          name: "导入",
          exact: true,
        });
        const bounds = await importButton.boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 500);
        await native.screenshot({
          path: path.join(
            resultDir,
            packaged ? "packaged-smart-compact.png" : "smart-compact.png",
          ),
        });
        await native.close();
        assert.equal((await snap()).generation, before.generation);
        // A subsequent request verifies the cancelled window released the file lock.
        await open(song);
        await expect(preview()).toBeVisible();
        await preview()
          .getByRole("button", { name: "取消", exact: true })
          .click();
        await expect(preview()).toHaveCount(0);
      },
    );
    await check("no renderer exceptions or error recovery", async () => {
      assert.deepEqual(errors, []);
      assert.equal(await page.locator(".recovery,.error-banner").count(), 0);
    });
    await check(
      "closing main cancels an editor-owned preview and closes all windows",
      async () => {
        const before = await snap();
        const ready = app.waitForEvent("window");
        await page.evaluate(
          (id) => window.studio.openEditor("pattern", id),
          before.project.patterns[0].id,
        );
        const native = await ready;
        await native.waitForSelector(".native-studio");
        const win = await app.browserWindow(native);
        await win.evaluate((w) => {
          w.show();
          w.focus();
        });
        await app.evaluate((_, p) => globalThis.testOpen.push(p), song);
        await native.evaluate(() => {
          void window.studio.file("open");
        });
        await expect(
          native.getByRole("dialog", { name: "导入预览" }),
        ).toBeVisible();
        const mainWin = await app.browserWindow(page);
        const mainClosed = page.waitForEvent("close");
        const nativeClosed = native.waitForEvent("close");
        await mainWin.evaluate((w) => w.close());
        await Promise.all([mainClosed, nativeClosed]);
        assert.deepEqual(errors, []);
      },
    );
    fs.writeFileSync(
      path.join(
        resultDir,
        packaged
          ? "packaged-smart-import-smoke.json"
          : "smart-import-smoke.json",
      ),
      JSON.stringify(
        {
          version,
          packaged,
          checks,
          errors,
          summary: smart.importOrganization.summary,
          date: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(`ALL ${checks.length} SMART IMPORT CHECKS PASSED`);
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(resultDir, "smart-failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

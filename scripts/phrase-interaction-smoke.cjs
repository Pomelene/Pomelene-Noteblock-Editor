const { encodeProject, decodeProject } = require("./project-fixture.cjs");
const { _electron: electron, expect } = require("playwright/test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const version = require("../package.json").version,
  packaged = process.argv.includes("--packaged");
const executablePath = packaged
  ? process.env.NBE_EXE ||
    path.resolve(
      `../deliverables/PomeleneNoteblockEditor-${version}/win-unpacked/Pomelene Noteblock Editor.exe`,
    )
  : require("electron");
const results = path.resolve("test-results");
fs.mkdirSync(results, { recursive: true });
const checks = [],
  errors = [];
let app, page;
const snapshot = () => page.evaluate(() => window.studio.getSnapshot());
const project = async () => (await snapshot()).project;
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
async function fileOpen(file) {
  await app.evaluate((_, file) => globalThis.testOpen.push(file), file);
  return page.evaluate(() => window.studio.file("open"));
}
async function move(canvas, x, y) {
  const b = await canvas.boundingBox();
  assert.ok(b);
  await page.mouse.move(b.x + x, b.y + y);
}
async function stroke(canvas, from, to, button = "left", revisit = false) {
  await move(canvas, ...from);
  await page.mouse.down({ button });
  await move(canvas, ...to);
  if (revisit) await move(canvas, ...from);
  await page.mouse.up({ button });
}
async function closeEditors() {
  await page.getByRole("button", { name: "窗口", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "关闭全部编辑窗口", exact: true })
    .click();
}
(async () => {
  app = await electron.launch({
    executablePath,
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
        const filePath = globalThis.testSave.shift();
        return { canceled: !filePath, filePath };
      };
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await require("./enter-workspace.cjs")(page);
    const seed = await project();
    seed.title = "Interaction and phrase acceptance";
    seed.phrases = [];
    seed.patterns = [
      {
        ...seed.patterns[0],
        id: "gesture-pattern",
        name: "Reusable phrase",
        length: 8,
        notes: [0, 1.25, 4].map((tick, i) => ({
          id: "note-" + i,
          tick,
          layer: 0,
          pitch: 60 + i,
          instrument: 0,
          velocity: 80,
          panning: 100,
          finePitch: 0,
        })),
      },
    ];
    seed.clips = [];
    seed.loop = { enabled: false, start: 0, end: 64 };
    const seedPath = path.join(results, "gesture-seed.nbproject");
    fs.writeFileSync(seedPath, await encodeProject(seed));
    await fileOpen(seedPath);
    await expect.poll(async () => (await project()).title).toBe(seed.title);
    const clips = () => page.getByTestId("playlist-canvas");
    await page.getByTestId("source-gesture-pattern").click();
    await page
      .getByLabel("编排吸附", { exact: true })
      .selectOption("quarter-beat");
    await check(
      "musical snap selector has explicit free, automatic, beat, triplet and meter options",
      async () => {
        const options = await page
          .getByLabel("编排吸附", { exact: true })
          .locator("option")
          .allTextContents();
        assert.ok(
          options.some((t) => t.includes("关闭")) &&
            options.some((t) => t.includes("自动")),
        );
        assert.ok(
          options.some((t) => t.includes("1/3 拍")) &&
            options.some((t) => t.includes("跟随拍号")),
        );
        assert.equal(
          options.some((t) => t === "三连音" || t.includes("1/2 tick")),
          false,
        );
      },
    );
    await check(
      "short sources start on the chosen coarse snap before continuing by source length",
      async () => {
        await page.evaluate(() =>
          window.studio.dispatch({
            type: "pattern:update",
            id: "gesture-pattern",
            patch: { length: 1 },
          }),
        );
        await page.getByLabel("编排吸附", { exact: true }).selectOption("beat");
        await page.getByLabel("编排笔刷", { exact: true }).click();
        await clips().click({ position: { x: 160 + 3 * 11, y: 60 } });
        await expect.poll(async () => (await project()).clips.length).toBe(1);
        assert.equal((await project()).clips[0].tick, 0);
        await page.keyboard.press("Control+z");
        await page.keyboard.press("Control+z");
        await expect
          .poll(async () => (await project()).patterns[0].length)
          .toBe(8);
        assert.equal((await project()).clips.length, 0);
        await page
          .getByLabel("编排吸附", { exact: true })
          .selectOption("quarter-beat");
      },
    );
    await check(
      "fast continuous placement fills gaps and backtracking adds no duplicates in one undo step",
      async () => {
        await page.getByLabel("编排笔刷", { exact: true }).click();
        await stroke(clips(), [161, 60], [160 + 24 * 11 + 1, 60], "left", true);
        await expect.poll(async () => (await project()).clips.length).toBe(4);
        assert.deepEqual(
          (await project()).clips.map((c) => c.tick),
          [0, 8, 16, 24],
        );
        await page.keyboard.press("Control+z");
        await expect.poll(async () => (await project()).clips.length).toBe(0);
        await page.keyboard.press("Control+y");
        await expect.poll(async () => (await project()).clips.length).toBe(4);
      },
    );
    await check(
      "right-button sweep erases crossed clips with one reversible transaction",
      async () => {
        await stroke(clips(), [161, 60], [160 + 31 * 11, 60], "right");
        await expect.poll(async () => (await project()).clips.length).toBe(0);
        await page.keyboard.press("Control+z");
        await expect.poll(async () => (await project()).clips.length).toBe(4);
      },
    );
    await check(
      "Escape and blur cancel uncommitted brush strokes",
      async () => {
        const before = await snapshot();
        await move(clips(), 161, 124);
        await page.mouse.down();
        await move(clips(), 160 + 24 * 11, 124);
        assert.equal((await snapshot()).revision, before.revision);
        await page.keyboard.press("Escape");
        await page.mouse.up();
        assert.equal((await snapshot()).revision, before.revision);
        await move(clips(), 161, 124);
        await page.mouse.down();
        await move(clips(), 160 + 24 * 11, 124);
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await page.mouse.up();
        assert.equal((await snapshot()).revision, before.revision);
      },
    );
    await check(
      "single clip tail works from title edge despite multiselection and pads silence",
      async () => {
        await page.getByLabel("编排绘制", { exact: true }).click();
        await page.locator(".playlist").focus();
        await page.keyboard.press("Control+a");
        const before = await project();
        await move(clips(), 160 + 8 * 11 - 2, 39);
        assert.equal(
          await clips().evaluate((e) => getComputedStyle(e).cursor),
          "ew-resize",
        );
        await page.mouse.down();
        await move(clips(), 160 + 20 * 11 - 2, 39);
        await expect(page.locator(".gesture-feedback")).toContainText("补白");
        await page.mouse.up();
        await expect
          .poll(async () => (await project()).clips[0].length)
          .toBe(20);
        assert.deepEqual(
          (await project()).clips.slice(1),
          before.clips.slice(1),
        );
        assert.deepEqual((await project()).patterns, before.patterns);
        assert.equal(await page.getByRole("menu").count(), 0);
        // Crop on a different row to avoid intentional clip overlaps obscuring the handle.
        await page.evaluate(
          (id) =>
            window.studio.dispatch({
              type: "clips:move",
              ids: [id],
              ticks: 0,
              tracks: 1,
            }),
          before.clips[0].id,
        );
        await stroke(
          clips(),
          [160 + 20 * 11 - 2, 103],
          [160 + 4 * 11 - 2, 103],
        );
        await expect
          .poll(async () => (await project()).clips[0].length)
          .toBe(4);
        assert.deepEqual((await project()).patterns, before.patterns);
        await page.keyboard.press("Control+z");
        await expect
          .poll(async () => (await project()).clips[0].length)
          .toBe(20);
      },
    );
    await check(
      "very short clip edge remains draggable without opening its menu",
      async () => {
        const id = (await project()).clips[0].id;
        await page.evaluate(
          (id) =>
            window.studio.dispatch({
              type: "clips:update",
              ids: [id],
              patch: { length: 0.5 },
            }),
          id,
        );
        await stroke(
          clips(),
          [160 + 0.5 * 11 - 1, 103],
          [160 + 2.5 * 11 - 1, 103],
        );
        await expect
          .poll(async () => (await project()).clips[0].length)
          .toBe(2.5);
        assert.equal(await page.getByRole("menu").count(), 0);
      },
    );
    await check(
      "a replaced project with the same ID discards an active gesture",
      async () => {
        await page.getByLabel("编排笔刷", { exact: true }).click();
        await move(clips(), 161, 188);
        await page.mouse.down();
        await move(clips(), 400, 188);
        await fileOpen(seedPath);
        await page.mouse.up();
        assert.equal((await project()).clips.length, 0);
        assert.equal(await page.locator(".gesture-feedback").count(), 0);
      },
    );
    let frozen;
    await check(
      "saving a Pattern creates a readonly note phrase with a real preview",
      async () => {
        await page
          .getByTestId("source-gesture-pattern")
          .click({ button: "right" });
        await page
          .getByRole("menuitem", { name: "保存为片段采样", exact: true })
          .click();
        await expect(
          page.getByRole("region", { name: "片段采样只读预览" }),
        ).toBeVisible();
        frozen = (await project()).phrases[0];
        assert.equal(frozen.notes.length, 3);
        assert.notEqual(frozen.notes[0].id, seed.patterns[0].notes[0].id);
        const before = JSON.stringify(frozen);
        const sizes = await page
          .getByTestId("phrase-canvas")
          .evaluate(async (el) => {
            const sizes = [];
            for (let i = 0; i < 12; i++) {
              await new Promise(requestAnimationFrame);
              const r = el.getBoundingClientRect();
              if (i >= 4) sizes.push([r.width, r.height]);
            }
            return sizes;
          });
        assert.ok(
          Math.max(...sizes.map((s) => s[0])) -
            Math.min(...sizes.map((s) => s[0])) <
            1,
        );
        assert.ok(
          Math.max(...sizes.map((s) => s[1])) -
            Math.min(...sizes.map((s) => s[1])) <
            1,
        );
        await page
          .getByTestId("phrase-canvas")
          .click({ position: { x: 150, y: 70 } });
        await page.keyboard.press("Delete");
        assert.equal(JSON.stringify((await project()).phrases[0]), before);
        assert.equal(
          await page.locator('.phrase-preview [aria-label="音符力度"]').count(),
          0,
        );
        await page.getByLabel("预听片段采样", { exact: true }).click();
        await expect(
          page.getByLabel("暂停片段采样", { exact: true }),
        ).toBeVisible();
        await page.getByLabel("终止片段采样", { exact: true }).click();
        await page.screenshot({
          path: path.join(
            results,
            packaged ? "packaged-phrase-preview.png" : "phrase-preview.png",
          ),
        });
      },
    );
    await check(
      "creating a Pattern from a phrase yields an independent editable source",
      async () => {
        await page
          .getByRole("button", { name: "根据采样创建 Pattern", exact: true })
          .click();
        const editor = page.locator(".studio-window").last();
        await expect(editor.getByTestId("pattern-editor")).toBeVisible();
        const copy = (await project()).patterns.at(-1);
        assert.notEqual(copy.id, frozen.id);
        assert.notEqual(copy.notes[0].id, frozen.notes[0].id);
        await editor
          .getByLabel("音符吸附", { exact: true })
          .selectOption("quarter-beat");
        await editor
          .getByTestId("note-canvas")
          .click({ position: { x: 82 + 6 * 25 + 6, y: 26 + 5 * 18 + 9 } });
        await expect
          .poll(async () => (await project()).patterns.at(-1).notes.length)
          .toBe(4);
        assert.deepEqual((await project()).phrases[0], frozen);
      },
    );
    await check(
      "note brush sweeps and triplet placement respect snap without quantizing existing notes",
      async () => {
        const editor = page.locator(".studio-window").last(),
          canvas = editor.getByTestId("note-canvas");
        await editor.getByLabel("音符笔刷", { exact: true }).click();
        const before = (await project()).patterns.at(-1).notes.length;
        await stroke(
          canvas,
          [82 + 8 * 25 + 2, 26 + 7 * 18 + 9],
          [82 + 12 * 25 + 2, 26 + 7 * 18 + 9],
          "left",
          true,
        );
        await expect
          .poll(async () => (await project()).patterns.at(-1).notes.length)
          .toBe(before + 5);
        await page.keyboard.press("Control+z");
        await expect
          .poll(async () => (await project()).patterns.at(-1).notes.length)
          .toBe(before);
        await editor.getByLabel("音符绘制", { exact: true }).click();
        await editor
          .getByLabel("音符吸附", { exact: true })
          .selectOption("third-beat");
        await canvas.click({
          position: { x: 82 + 2.8 * 25, y: 26 + 8 * 18 + 9 },
        });
        await expect
          .poll(async () => (await project()).patterns.at(-1).notes.at(-1).tick)
          .toBeCloseTo(8 / 3, 8);
        assert.ok(
          (await project()).patterns.at(-1).notes.some((n) => n.tick === 1.25),
        );
        await page.screenshot({
          path: path.join(
            results,
            packaged ? "packaged-musical-snap.png" : "musical-snap.png",
          ),
        });
        await closeEditors();
      },
    );
    await check(
      "readonly phrases paint and trim just like Pattern references without editing their source",
      async () => {
        await page
          .locator(".browser-filters")
          .getByRole("button", { name: "采样", exact: true })
          .click();
        await page.getByTestId("source-" + frozen.id).click();
        await page.getByLabel("编排笔刷", { exact: true }).click();
        await stroke(clips(), [161, 60], [160 + 16 * 11 + 1, 60]);
        await expect.poll(async () => (await project()).clips.length).toBe(3);
        assert.ok((await project()).clips.every((c) => c.kind === "phrase"));
        await page.getByLabel("编排绘制", { exact: true }).click();
        await stroke(clips(), [160 + 24 * 11 - 2, 60], [160 + 32 * 11 - 2, 60]);
        await expect
          .poll(async () => (await project()).clips.at(-1).length)
          .toBe(16);
        assert.deepEqual((await project()).phrases[0], frozen);
        await page.screenshot({
          path: path.join(
            results,
            packaged
              ? "packaged-phrase-arrangement.png"
              : "phrase-arrangement.png",
          ),
        });
      },
    );
    const saved = path.join(results, "phrase-saved.nbproject"),
      nbs = path.join(results, "phrase-export.nbs");
    await check(
      "clip menus cut the clicked selection and can freeze its cropped arrangement",
      async () => {
        const before = await project();
        // Last clip is selected after resizing, so opening the first clip's menu
        // must replace the action's selection before cutting.
        await clips().click({ position: { x: 173, y: 39 } });
        await page.getByRole("menuitem", { name: /^剪切/ }).click();
        await expect.poll(async () => (await project()).clips.length).toBe(2);
        assert.deepEqual(
          (await project()).clips.map((c) => c.id),
          before.clips.slice(1).map((c) => c.id),
        );
        await page.keyboard.press("Control+z");
        await expect.poll(async () => (await project()).clips.length).toBe(3);
        await page.locator(".playlist").focus();
        await page.keyboard.press("Control+a");
        await clips().click({ position: { x: 173, y: 39 } });
        await page
          .getByRole("menuitem", { name: "保存选区为片段采样", exact: true })
          .click();
        await expect.poll(async () => (await project()).phrases.length).toBe(2);
        const phrase = (await project()).phrases[1];
        assert.equal(phrase.length, 32);
        assert.equal(phrase.notes.length, 9);
        await page.keyboard.press("Control+z");
        await expect.poll(async () => (await project()).phrases.length).toBe(1);
      },
    );
    await check(
      "mute and slip tools affect the clicked reference and remain undoable",
      async () => {
        const before = await project();
        await page.getByLabel("编排静音", { exact: true }).click();
        await clips().click({ position: { x: 160 + 4 * 11, y: 60 } });
        await expect
          .poll(async () => (await project()).clips[0].muted)
          .toBe(true);
        await page.keyboard.press("Control+z");
        await expect
          .poll(async () => (await project()).clips[0].muted)
          .toBe(false);
        await page.getByLabel("编排滑移", { exact: true }).click();
        await stroke(clips(), [160 + 4 * 11, 60], [160 + 2 * 11, 60]);
        await expect
          .poll(async () => (await project()).clips[0].offset)
          .toBe(2);
        assert.equal((await project()).clips[0].tick, before.clips[0].tick);
        assert.equal((await project()).clips[0].length, before.clips[0].length);
        assert.deepEqual((await project()).phrases[0], frozen);
        await page.keyboard.press("Control+z");
        await expect
          .poll(async () => (await project()).clips[0].offset)
          .toBe(0);
        await page.getByLabel("编排绘制", { exact: true }).click();
      },
    );
    await check(
      "phrase library persists in actual project files and exports actual NBS notes",
      async () => {
        await app.evaluate((_, p) => globalThis.testSave.push(p), saved);
        await page.getByRole("button", { name: "文件", exact: true }).click();
        await page.getByRole("menuitem", { name: /^工程另存为…/ }).click();
        await expect
          .poll(async () => (await snapshot()).document.path)
          .toBe(saved);
        assert.deepEqual(
          (await decodeProject(fs.readFileSync(saved))).phrases[0],
          frozen,
        );
        await fileOpen(saved);
        assert.deepEqual((await project()).phrases[0], frozen);
        await app.evaluate((_, p) => globalThis.testSave.push(p), nbs);
        const result = await page.evaluate(() =>
          window.studio.file("exportNbs"),
        );
        assert.equal(result.ok, true);
        assert.ok(fs.readFileSync(nbs).length > 100);
        assert.equal(
          result.warnings.some((w) => w.includes("已从 NBS 导出中省略")),
          false,
        );
      },
    );
    await check(
      "NBS phrase import adds to the library without replacing the current project",
      async () => {
        const before = await snapshot();
        await app.evaluate((_, p) => globalThis.testOpen.push(p), nbs);
        await page.getByRole("button", { name: "文件", exact: true }).click();
        await page
          .getByRole("menuitem", { name: "导入 NBS 片段采样…", exact: true })
          .click();
        await expect.poll(async () => (await project()).phrases.length).toBe(2);
        assert.equal((await snapshot()).generation, before.generation);
        assert.equal((await project()).id, before.project.id);
        assert.deepEqual((await project()).clips, before.project.clips);
        assert.equal((await project()).phrases[1].notes.length, 9);
        assert.equal(
          await page.getByRole("dialog", { name: "导入预览" }).count(),
          0,
        );
        await page.keyboard.press("Control+z");
        await expect.poll(async () => (await project()).phrases.length).toBe(1);
        await closeEditors();
      },
    );
    await check(
      "native phrase preview is readonly and creates a separate native Pattern editor",
      async () => {
        const ready = app.waitForEvent("window");
        await page.evaluate(
          (id) => window.studio.openEditor("phrase", id),
          frozen.id,
        );
        const native = await ready;
        native.on("pageerror", (e) => errors.push(String(e)));
        await expect(
          native.getByRole("region", { name: "片段采样只读预览" }),
        ).toBeVisible();
        const win = await app.browserWindow(native);
        await win.evaluate((w) => w.show());
        const next = app.waitForEvent("window");
        await native
          .getByRole("button", { name: "根据采样创建 Pattern", exact: true })
          .click();
        const editable = await next;
        await editable.waitForSelector(".pattern-editor");
        assert.deepEqual((await project()).phrases[0], frozen);
        await editable.close();
        await native.close();
      },
    );
    await check(
      "compact window retains snap controls, preview conversion and no renderer errors",
      async () => {
        const win = await app.browserWindow(page);
        await win.evaluate((w) => {
          w.setContentSize(1000, 650);
          w.show();
        });
        await expect(
          page.getByLabel("编排吸附", { exact: true }),
        ).toBeVisible();
        await page.getByTestId("source-" + frozen.id).dblclick();
        await expect(
          page.getByRole("button", {
            name: "根据采样创建 Pattern",
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(
            results,
            packaged ? "packaged-phrase-compact.png" : "phrase-compact.png",
          ),
        });
        assert.deepEqual(errors, []);
        assert.equal(await page.locator(".recovery,.error-banner").count(), 0);
      },
    );
    fs.writeFileSync(
      path.join(
        results,
        packaged
          ? "packaged-phrase-interaction-smoke.json"
          : "phrase-interaction-smoke.json",
      ),
      JSON.stringify(
        { version, packaged, checks, errors, date: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.log(`ALL ${checks.length} PHRASE AND INTERACTION CHECKS PASSED`);
  } catch (e) {
    if (page && !page.isClosed())
      await page
        .screenshot({ path: path.join(results, "phrase-failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

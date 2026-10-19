const { _electron: electron, expect } = require("playwright/test");
const { encodeProject } = require("./project-fixture.cjs");
const path = require("node:path"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const packaged = process.argv.includes("--packaged");
const exe =
  process.env.NBE_EXE ||
  path.resolve(
    `../deliverables/PomeleneNoteblockEditor-${require("../package.json").version}/win-unpacked/Pomelene Noteblock Editor.exe`,
  );
const output = path.resolve("test-results/start-screen");
fs.mkdirSync(output, { recursive: true });
const checks = [],
  errors = [];
let app;
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
(async () => {
  app = await electron.launch({
    executablePath: packaged ? exe : require("electron"),
    args: packaged ? [] : ["."],
    env: { ...process.env, NBE_SMOKE_TEST: "1" },
  });
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.locator(".start-screen").waitFor();
    await app.evaluate(({ BrowserWindow, dialog }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(1440, 900);
      win.show();
      globalThis.startChoices = [];
      globalThis.startDialogs = [];
      dialog.showOpenDialog = async (...args) => {
        const options = args.at(-1);
        globalThis.startDialogs.push({
          title: options.title,
          filters: options.filters,
        });
        const file = globalThis.startChoices.shift();
        return { canceled: !file, filePaths: file ? [file] : [] };
      };
      dialog.showMessageBox = async () => ({ response: 1 });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: globalThis.startExport,
      });
    });
    const snapshot = () => page.evaluate(() => window.studio.getSnapshot());
    const choose = async (file) =>
      app.evaluate((_, file) => globalThis.startChoices.push(file), file);
    const project = await snapshot(),
      projectPath = path.join(output, "source.nbproject"),
      songPath = path.join(output, "source.nbs"),
      brokenPath = path.join(output, "broken.nbs");
    fs.writeFileSync(projectPath, await encodeProject(project.project));
    fs.writeFileSync(brokenPath, Buffer.from([1, 2, 3]));
    await app.evaluate((_, p) => (globalThis.startExport = p), songPath);
    await page.evaluate(() => window.studio.file("exportNbs"));
    await check(
      "EXE starts at three real entry actions, with the editor hidden",
      async () => {
        await expect(
          page.getByRole("button", { name: "打开 .nbs 歌曲", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: /打开工程文件/ }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "新建工程", exact: true }),
        ).toBeVisible();
        await expect(page.locator(".menubar")).toBeHidden();
      },
    );
    await check(
      "procedural art runs, pauses and respects reduced motion",
      async () => {
        await page.waitForFunction(
          () =>
            +(document.querySelector(".start-art").dataset.frames || 0) > 25,
        );
        await page
          .getByRole("button", { name: "暂停开屏动画", exact: true })
          .click();
        await expect(page.locator(".start-art")).toHaveAttribute(
          "data-animating",
          "false",
        );
        const frozen = await page
          .locator(".start-art")
          .getAttribute("data-frames");
        await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
        assert.equal(
          await page.locator(".start-art").getAttribute("data-frames"),
          frozen,
        );
        await page
          .getByRole("button", { name: "继续开屏动画", exact: true })
          .click();
        await expect(page.locator(".start-art")).toHaveAttribute(
          "data-animating",
          "true",
        );
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page.locator(".start-art")).toHaveAttribute(
          "data-animating",
          "false",
        );
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await expect(page.locator(".start-art")).toHaveAttribute(
          "data-animating",
          "true",
        );
      },
    );
    await check(
      "minimizing the native window pauses animation until focus returns",
      async () => {
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].minimize(),
        );
        await expect(page.locator(".start-art")).toHaveAttribute(
          "data-animating",
          "false",
        );
        await app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          win.restore();
          win.focus();
        });
        await expect(page.locator(".start-art")).toHaveAttribute(
          "data-animating",
          "true",
        );
      },
    );
    await page.screenshot({
      path: path.join(output, packaged ? "packaged-start.png" : "start.png"),
    });
    await check(
      "canceling selection stays on the start page and preserves the session",
      async () => {
        const before = await snapshot();
        await page.getByRole("button", { name: /打开工程文件/ }).click();
        await expect(
          page.getByRole("button", { name: /打开工程文件/ }),
        ).toBeEnabled();
        assert.deepEqual(await snapshot(), before);
        await expect(page.locator(".start-screen")).toBeVisible();
        const last = await app.evaluate(() => globalThis.startDialogs.at(-1));
        assert.deepEqual(last.filters[0].extensions, ["nbproject"]);
      },
    );
    await check(
      "wrong project content and corrupt songs display recoverable start-page errors",
      async () => {
        const before = await snapshot();
        await choose(songPath);
        await page.getByRole("button", { name: /打开工程文件/ }).click();
        await expect(page.getByRole("alert")).toContainText(
          "请选择 .nbproject",
        );
        assert.deepEqual(await snapshot(), before);
        await choose(brokenPath);
        await page
          .getByRole("button", { name: "打开 .nbs 歌曲", exact: true })
          .click();
        await expect(page.getByRole("alert")).toBeVisible();
        await expect(
          page.getByRole("button", { name: "新建工程", exact: true }),
        ).toBeEnabled();
        assert.deepEqual(await snapshot(), before);
        const last = await app.evaluate(() => globalThis.startDialogs.at(-1));
        assert.deepEqual(last.filters[0].extensions, ["nbs"]);
      },
    );
    await check(
      "new action creates an empty project and releases the art canvas",
      async () => {
        await page
          .getByRole("button", { name: "新建工程", exact: true })
          .click();
        await page.locator(".menubar").waitFor();
        assert.equal((await snapshot()).project.patterns.length, 0);
        assert.equal(await page.locator(".start-art").count(), 0);
      },
    );
    await page.reload();
    await page.locator(".start-screen").waitFor();
    await check("project action opens real v2 bytes into editing", async () => {
      await choose(projectPath);
      await page.getByRole("button", { name: /打开工程文件/ }).click();
      await page.locator(".menubar").waitFor();
      assert.equal((await snapshot()).document.path, projectPath);
      assert.equal((await snapshot()).project.patterns.length, 4);
    });
    await check(
      "file and history controls are grouped at the upper left",
      async () => {
        const buttons = await page
          .getByRole("button", { name: "保存工程", exact: true })
          .boundingBox();
        const bar = await page.locator(".menubar").boundingBox();
        assert(
          buttons.y >= bar.y &&
            buttons.y + buttons.height <= bar.y + bar.height + 1,
        );
        assert(buttons.x < 700);
      },
    );
    await page.reload();
    await page.locator(".start-screen").waitFor();
    await choose(songPath);
    await page
      .getByRole("button", { name: "打开 .nbs 歌曲", exact: true })
      .click();
    await check(
      "NBS import dialog is reachable from the start page and cancel returns safely",
      async () => {
        await page.locator("dialog[open]").waitFor();
        await expect(page.locator(".start-art")).toHaveAttribute(
          "data-animating",
          "false",
        );
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "新建工程", exact: true }),
        ).toBeEnabled();
        await expect(page.locator(".start-screen")).toBeVisible();
      },
    );
    await choose(songPath);
    await page
      .getByRole("button", { name: "打开 .nbs 歌曲", exact: true })
      .click();
    await page.locator("dialog[open]").waitFor();
    await page.getByRole("button", { name: "导入", exact: true }).click();
    await page.locator(".menubar").waitFor();
    checks.push(
      "NBS import completes through the actual import choice into editing",
    );
    const current = await snapshot();
    await page.evaluate(
      (id) => window.studio.openEditor("pattern", id),
      current.project.patterns[0].id,
    );
    await check("native editors bypass the start page", async () => {
      await expect.poll(() => app.windows().length).toBe(2);
      const native = app
        .windows()
        .find((p) => new URL(p.url()).searchParams.get("kind"));
      await native.locator(".native-bar").waitFor();
      assert.equal(await native.locator(".start-screen").count(), 0);
    });
    assert.deepEqual(errors, []);
    checks.push("no unhandled renderer errors");
    fs.writeFileSync(
      path.join(output, packaged ? "packaged-results.json" : "results.json"),
      JSON.stringify({ packaged, checks, errors }, null, 2),
    );
  } finally {
    await app?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

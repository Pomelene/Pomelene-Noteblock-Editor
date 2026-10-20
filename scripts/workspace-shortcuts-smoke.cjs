const { _electron: electron, expect } = require("playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const version = require("../package.json").version;
const packaged = process.argv.includes("--packaged");
const results = path.resolve("test-results");
fs.mkdirSync(results, { recursive: true });
const checks = [],
  errors = [];
let app, page;
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
const snapshot = () => page.evaluate(() => window.studio.getSnapshot());
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
    page.on("pageerror", (e) => errors.push(String(e)));
    await app.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0].show();
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await require("./enter-workspace.cjs")(page);
    const arrangement = page.locator(".arrangement-window");
    await expect(arrangement.getByLabel("放置来源")).toBeVisible();
    await check(
      "Playlist starts in its own maximized child window",
      async () => {
        await expect(arrangement).toHaveAttribute("data-kind", "playlist");
        await expect(arrangement).toHaveAttribute("data-state", "maximized");
        await arrangement.getByLabel("最大化或还原", { exact: true }).click();
        await expect(arrangement).toHaveAttribute("data-state", "normal");
      },
    );
    await check("Playlist can be moved and resized independently", async () => {
      const before = await arrangement.boundingBox();
      const title = await arrangement
        .locator(".studio-window-title")
        .boundingBox();
      await page.mouse.move(title.x + 30, title.y + 10);
      await page.mouse.down();
      await page.mouse.move(title.x + 60, title.y + 30);
      await page.mouse.up();
      const after = await arrangement.boundingBox();
      assert.ok(after.x > before.x);
      const edge = await arrangement
        .locator('[data-resize-edge="se"]')
        .boundingBox();
      await page.mouse.move(edge.x + 4, edge.y + 4);
      await page.mouse.down();
      await page.mouse.move(edge.x - 50, edge.y - 30);
      await page.mouse.up();
      assert.ok((await arrangement.boundingBox()).width < after.width);
    });
    await check(
      "F5 restores a minimized Playlist without hiding other editors",
      async () => {
        await arrangement.getByLabel("最小化窗口", { exact: true }).click();
        await expect(arrangement).toBeHidden();
        await page.keyboard.press("F5");
        await expect(arrangement).toBeVisible();
      },
    );
    const id = (await snapshot()).project.patterns[0].id;
    await check(
      "F7 opens a source instance and Ctrl Tab switches windows",
      async () => {
        await page.getByTestId(`source-${id}`).click();
        await page.keyboard.press("F7");
        await expect(page.locator(".studio-window")).toHaveCount(1);
        await page.keyboard.press("Control+Tab");
        await expect(arrangement).toHaveClass(/active/);
        await page.keyboard.press("Control+Tab");
        await expect(page.locator(".studio-window")).toHaveClass(/active/);
      },
    );
    await check(
      "Window tiling includes both Playlist and source editors",
      async () => {
        await page.keyboard.press("Control+Shift+h");
        const a = await arrangement.boundingBox(),
          b = await page.locator(".studio-window").boundingBox();
        assert.ok(
          a.x + a.width <= b.x + 2 ||
            b.x + b.width <= a.x + 2 ||
            a.y + a.height <= b.y + 2 ||
            b.y + b.height <= a.y + 2,
        );
        assert.ok(a.width > 100 && b.width > 100);
      },
    );
    await check(
      "F1 opens searchable shortcut help without editing the project",
      async () => {
        const revision = (await snapshot()).revision;
        await page.keyboard.press("F1");
        await expect(page.getByRole("dialog")).toBeVisible();
        const search = page.getByLabel("搜索快捷键");
        await search.fill("复制");
        await expect(page.getByRole("dialog")).toContainText("Ctrl+C");
        await search.fill("b");
        assert.equal((await snapshot()).revision, revision);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      },
    );
    await check(
      "Text inputs keep normal editing and do not switch tools",
      async () => {
        const input = page.getByLabel("搜索对象");
        await input.fill("pbed");
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Backspace");
        assert.equal(await input.inputValue(), "");
      },
    );
    let detached;
    await check(
      "Playlist detaches to a real OS window with a placement-source selector",
      async () => {
        await page.keyboard.press("F5");
        const promise = app.waitForEvent("window");
        await arrangement.getByLabel("弹出桌面窗口", { exact: true }).click();
        detached = await promise;
        detached.on("pageerror", (e) => errors.push(String(e)));
        await detached.waitForSelector(".playlist");
        await (await app.browserWindow(detached)).evaluate((win) => win.show());
        assert.ok(detached.url().includes("kind=playlist"));
        await expect(detached.getByLabel("放置来源")).toBeVisible();
        await expect(arrangement).toBeHidden();
      },
    );
    await check(
      "Detached Playlist edits share the authoritative project and undo history",
      async () => {
        await detached.getByLabel("放置来源").selectOption(`pattern:${id}`);
        const c = detached.getByTestId("playlist-canvas");
        const count = (await snapshot()).project.clips.length;
        const before = (await snapshot()).project;
        const track = before.tracks.findIndex(
          (_, index) => !before.clips.some((clip) => clip.track === index),
        );
        assert.ok(track >= 0 && track < 6, "fixture has a visible empty track");
        await c.click({ position: { x: 270, y: 30 + track * 64 + 20 } });
        await expect
          .poll(async () => (await snapshot()).project.clips.length)
          .toBe(count + 1);
        await detached.keyboard.press("Control+z");
        await expect
          .poll(async () => (await snapshot()).project.clips.length)
          .toBe(count);
      },
    );
    await check(
      "Detached Playlist docks back into the main workspace",
      async () => {
        await detached.getByLabel("停靠回主窗口").click();
        await expect.poll(() => detached.isClosed()).toBe(true);
        await expect(arrangement).toBeVisible();
      },
    );
    await check(
      "F12 minimizes child windows and F5/F7 recover them",
      async () => {
        await page.keyboard.press("F12");
        await expect(arrangement).toBeHidden();
        await expect(page.locator(".studio-window")).toBeHidden();
        await page.keyboard.press("F5");
        await expect(arrangement).toBeVisible();
        await page.keyboard.press("F7");
        await expect(page.locator(".studio-window").last()).toBeVisible();
      },
    );
    await check(
      "F4 creates a Pattern and undo returns source selection to an existing object",
      async () => {
        await page.keyboard.press("F4");
        await expect
          .poll(async () => (await snapshot()).project.patterns.length)
          .toBe(5);
        await page.keyboard.press("Control+z");
        await expect
          .poll(async () => (await snapshot()).project.patterns.length)
          .toBe(4);
        await page.keyboard.press("F7");
        await expect(
          page.locator('.studio-window.active [data-testid="pattern-editor"]'),
        ).toBeVisible();
      },
    );
    await check(
      "F2 renames the selected source with normal dialog text editing and undo",
      async () => {
        const original = (await snapshot()).project.patterns[0].name;
        await page.keyboard.press("F2");
        await page
          .getByRole("dialog")
          .getByLabel("重命名", { exact: true })
          .fill("Keyboard rename");
        await page.keyboard.press("Enter");
        await expect
          .poll(async () => (await snapshot()).project.patterns[0].name)
          .toBe("Keyboard rename");
        await page.keyboard.press("Control+z");
        await expect
          .poll(async () => (await snapshot()).project.patterns[0].name)
          .toBe(original);
      },
    );
    await check(
      "Source desktop window docks with paused playback position preserved",
      async () => {
        await page.evaluate(() => {
          window.transportSignals = [];
          window.studio.onAudioSignal((s) => {
            if (s.type === "state") window.transportSignals.push(s.state);
          });
        });
        const promise = app.waitForEvent("window");
        await page
          .locator(".studio-window.active")
          .getByLabel("弹出桌面窗口", { exact: true })
          .click();
        const editor = await promise;
        editor.on("pageerror", (e) => errors.push(String(e)));
        await editor.waitForSelector(".pattern-editor");
        await (await app.browserWindow(editor)).evaluate((win) => win.show());
        await editor.getByLabel("播放", { exact: true }).click();
        await expect(editor.getByLabel("暂停", { exact: true })).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(() => window.transportSignals.at(-1)?.tick ?? 0),
          )
          .toBeGreaterThan(0.5);
        await editor.getByLabel("暂停", { exact: true }).click();
        await expect
          .poll(() =>
            page.evaluate(() => window.transportSignals.at(-1)?.status),
          )
          .toBe("paused");
        const paused = await page.evaluate(() =>
          window.transportSignals.at(-1),
        );
        await editor.getByLabel("停靠回主窗口").click();
        await expect.poll(() => editor.isClosed()).toBe(true);
        await expect(page.locator(".transport-play")).toHaveAttribute("aria-label", "播放");
        await expect
          .poll(() => page.evaluate(() => window.transportSignals.at(-1)))
          .toEqual(paused);
        await page.getByLabel("终止", { exact: true }).click();
      },
    );
    await check(
      "Closing the active source returns keyboard focus to a visible window",
      async () => {
        await page
          .locator(".studio-window.active")
          .getByLabel("关闭窗口", { exact: true })
          .click();
        await expect(arrangement).toHaveClass(/active/);
        await page.keyboard.press("Enter");
        await expect(arrangement).toHaveAttribute("data-state", "maximized");
      },
    );
    assert.deepEqual(errors, []);
    await page.keyboard.press("F7");
    await page.keyboard.press("Control+Shift+h");
    await page.evaluate(async (id) => {
      await window.studio.dispatch({
        type: "notes:add",
        patternId: id,
        notes: [
          ...[0, 8, 16, 24].map((tick) => ({
            tick,
            layer: 0,
            pitch: 60,
            instrument: 1,
            velocity: 75,
            panning: 100,
            finePitch: 0,
          })),
          ...[4, 12, 20, 28].map((tick) => ({
            tick,
            layer: 0,
            pitch: 72,
            instrument: 7,
            velocity: 80,
            panning: 100,
            finePitch: 0,
          })),
        ],
      });
    }, id);
    await expect(
      page
        .locator(".studio-window.active")
        .getByRole("radio", { name: "Bell · 4 音符", exact: true }),
    ).toHaveCount(1);
    await page.screenshot({
      path: path.join(
        results,
        `workspace-shortcuts-${packaged ? "packaged" : "source"}.png`,
      ),
    });
    fs.writeFileSync(
      path.join(
        results,
        `workspace-shortcuts-${packaged ? "packaged" : "source"}.json`,
      ),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(`PASS ${checks.length} workspace checks`);
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

const { _electron: electron, expect } = require("playwright/test");
const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs");
const version = require("../package.json").version,
  packaged = process.argv.includes("--packaged");
const checks = [],
  errors = [];
let app, page;
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
(async () => {
  app = await electron.launch({
    executablePath: packaged
      ? process.env.NBE_EXE ||
        path.resolve(
          `../deliverables/NoteBlockEditor-${version}/win-unpacked/NoteBlock Editor.exe`,
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
    await page.waitForSelector(".studio");
    const p = (await page.evaluate(() => window.studio.getSnapshot())).project;
    const [a, b, c] = p.patterns;
    await page.evaluate(() => {
      window.signals = [];
      window.studio.onAudioSignal((s) => {
        if (s.type === "state") window.signals.push(s.state);
      });
    });
    const last = () => page.evaluate(() => window.signals.at(-1));
    async function selectClip(id) {
      const clip = p.clips.find((c) => c.sourceId === id);
      assert.ok(clip);
      await page
        .getByTestId("playlist-canvas")
        .click({
          position: {
            x: 160 + clip.tick * 11 + 24,
            y: 30 + clip.track * 64 + 28,
          },
        });
    }
    await check(
      "A Playlist clip selects the PAT playback source instead of retaining the browser source",
      async () => {
        await page.getByTestId(`source-${a.id}`).click();
        await selectClip(b.id);
        await page.getByRole("button", { name: "PAT", exact: true }).click();
        await page.getByLabel("播放", { exact: true }).click();
        await expect.poll(async () => (await last())?.scope).toBe(b.id);
        await page.getByLabel("终止", { exact: true }).click();
      },
    );
    await check(
      "Selecting a different clip during PAT playback switches scope and audio updates do not revert selection",
      async () => {
        await page.getByLabel("播放", { exact: true }).click();
        await expect.poll(async () => (await last())?.status).toBe("playing");
        await selectClip(c.id);
        await expect.poll(async () => (await last())?.scope).toBe(c.id);
        await expect
          .poll(async () => (await last())?.tick ?? 0)
          .toBeGreaterThan(1);
        await expect(page.getByLabel("放置来源")).toHaveValue(
          `pattern:${c.id}`,
        );
        await page.getByLabel("暂停", { exact: true }).click();
        await selectClip(b.id);
        await page.getByLabel("播放", { exact: true }).click();
        await expect.poll(async () => (await last())?.scope).toBe(b.id);
        await page.getByLabel("终止", { exact: true }).click();
      },
    );
    await check(
      "Focusing an existing Pattern editor chooses its own playback source",
      async () => {
        await page.getByTestId(`source-${a.id}`).dblclick();
        await page.getByTestId(`source-${b.id}`).dblclick();
        const first = page.locator(`.studio-window[data-source-id="${a.id}"]`),
          second = page.locator(`.studio-window[data-source-id="${b.id}"]`);
        await first.locator(".studio-window-title").click();
        await page.getByLabel("播放", { exact: true }).click();
        await expect.poll(async () => (await last())?.scope).toBe(a.id);
        await page
          .locator(".window-dock")
          .getByRole("button", { name: b.name, exact: true })
          .click();
        await expect.poll(async () => (await last())?.scope).toBe(b.id);
        await page.getByLabel("终止", { exact: true }).click();
      },
    );
    await check(
      "Selecting a Pattern while SONG plays preserves song playback",
      async () => {
        await page.keyboard.press("F5");
        await page.getByRole("button", { name: "SONG", exact: true }).click();
        await page.getByLabel("播放", { exact: true }).click();
        await expect.poll(async () => (await last())?.scope).toBe("song");
        await selectClip(a.id);
        await expect
          .poll(async () => (await last())?.tick ?? 0)
          .toBeGreaterThan(1);
        assert.equal((await last()).scope, "song");
        await page.getByLabel("终止", { exact: true }).click();
      },
    );
    assert.deepEqual(errors, []);
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(
      path.resolve(
        `test-results/playback-target-${packaged ? "packaged" : "source"}.json`,
      ),
      JSON.stringify({ version, checks, errors }, null, 2),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

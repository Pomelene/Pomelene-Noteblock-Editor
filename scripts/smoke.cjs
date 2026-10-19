const { encodeProject, decodeProject } = require("./project-fixture.cjs");
const { _electron: electron, expect } = require("playwright/test");
const path = require("node:path"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const packaged = process.argv.includes("--packaged");
const exe =
  process.env.NBE_EXE ||
  path.resolve(
    `../deliverables/PomeleneNoteblockEditor-${require("../package.json").version}/win-unpacked/Pomelene Noteblock Editor.exe`,
  );
const results = path.resolve("test-results"),
  fixture = path.join(results, "roundtrip.nbproject"),
  exported = path.join(results, "roundtrip.nbs");
fs.mkdirSync(results, { recursive: true });
const checks = [],
  errors = [];
let app, page;
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
async function snapshot() {
  return page.evaluate(() => window.studio.getSnapshot());
}
async function command(c) {
  return page.evaluate((c) => window.studio.dispatch(c), c);
}
async function closeInfo() {
  const d = page.locator("dialog[open]");
  if (await d.count())
    await d.getByRole("button", { name: "关闭", exact: true }).last().click();
}
async function drag(locator, from, to) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + from.x, b.y + from.y);
  await page.mouse.down();
  await page.mouse.move(b.x + to.x, b.y + to.y, { steps: 8 });
  await page.mouse.up();
}
(async () => {
  app = await electron.launch({
    executablePath: packaged ? exe : require("electron"),
    args: packaged ? [] : ["."],
    env: { ...process.env, NBE_SMOKE_TEST: "1" },
  });
  try {
    page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(String(e)));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].show(),
    );
    await page.waitForSelector(".studio");
    // Keep this baseline's pixel coordinates on the original one-tick grid;
    // the new adaptive/triplet/free modes have dedicated interaction tests.
    await page
      .getByLabel("编排吸附", { exact: true })
      .selectOption("quarter-beat");
    await app.evaluate(({ dialog }) => {
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
    await page.evaluate(() =>
      window.studio.onImportPrompt((p) => {
        if (p) void window.studio.respondImport(p.id, "original");
      }),
    );
    await check("production IPC and demo load", async () => {
      const s = await snapshot();
      assert.equal(s.project.patterns.length, 4);
      assert.equal(s.project.clips.length, 16);
      assert.equal(s.project.samples.length, 16);
      assert.equal(
        await page.evaluate(() => typeof window.require),
        "undefined",
      );
    });
    await page.screenshot({
      path: path.join(
        results,
        packaged ? "packaged-playlist.png" : "playlist.png",
      ),
    });
    await check(
      "scroll thumb drag and rapid two-axis viewport remain usable",
      async () => {
        const sc = page.locator(".arrangement-scroll"),
          b = await sc.boundingBox();
        await page.mouse.move(b.x + 90, b.y + b.height - 5);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width * 0.65, b.y + b.height - 5, {
          steps: 12,
        });
        await page.mouse.up();
        await sc.evaluate((e) => {
          e.scrollLeft = 1800;
          e.scrollTop = 100;
          e.dispatchEvent(new Event("scroll"));
        });
        await expect(
          page.locator("[data-testid=playlist-canvas]"),
        ).toBeVisible();
        assert.equal(await page.locator(".recovery").count(), 0);
        await sc.evaluate((e) => {
          e.scrollLeft = 0;
          e.scrollTop = 0;
        });
      },
    );
    const canvas = page.getByTestId("playlist-canvas");
    await check(
      "Pattern placement accepts arbitrary lengths rather than one-bar blocks",
      async () => {
        await canvas.click({ position: { x: 175, y: 30 + 4 * 64 + 25 } });
        await expect
          .poll(async () => (await snapshot()).project.clips.length)
          .toBe(17);
        let s = await snapshot();
        assert.equal(s.project.clips.at(-1).length, 32);
      },
    );
    await check(
      "clip edge extends silence and crops without modifying source notes",
      async () => {
        let s = await snapshot();
        const before = structuredClone(s.project.patterns[0]);
        await drag(
          canvas,
          { x: 160 + 33 * 11 - 3, y: 30 + 4 * 64 + 30 },
          { x: 160 + 38 * 11 - 3, y: 30 + 4 * 64 + 30 },
        );
        await expect
          .poll(async () => (await snapshot()).project.clips.at(-1).length)
          .toBe(37);
        assert.deepEqual((await snapshot()).project.patterns[0], before);
        const field = page.getByLabel("引用长度");
        if (await field.count()) {
          await field.fill("7");
          await field.press("Enter");
          await expect
            .poll(async () => (await snapshot()).project.clips.at(-1).length)
            .toBe(7);
        }
      },
    );
    await check(
      "canvas right-click deletes while browser right-click opens object menu",
      async () => {
        await canvas.click({
          position: { x: 180, y: 30 + 4 * 64 + 25 },
          button: "right",
        });
        await expect
          .poll(async () => (await snapshot()).project.clips.length)
          .toBe(16);
        const id = (await snapshot()).project.patterns[0].id;
        await page.getByTestId("source-" + id).click({ button: "right" });
        await expect(
          page.getByRole("menuitem", { name: "打开编辑实例", exact: true }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
      },
    );
    const pid = (await snapshot()).project.patterns[0].id;
    await check("multiple instances of the same Pattern", async () => {
      await page.getByTestId("source-" + pid).dblclick();
      await page.getByTestId("source-" + pid).dblclick();
      await expect(page.locator(".studio-window")).toHaveCount(2);
    });
    let frame = page.locator(".studio-window").last();
    await check(
      "window maximum, restore, resize and minimize retain state",
      async () => {
        const b = await frame.boundingBox();
        await frame.getByLabel("最大化或还原").click();
        await expect(frame).toHaveAttribute("data-state", "maximized");
        const max = await frame.boundingBox();
        assert.ok(max.width > b.width);
        await frame.getByLabel("最大化或还原").click();
        await expect(frame).toHaveAttribute("data-state", "normal");
        const restored = await frame.boundingBox();
        assert.ok(Math.abs(restored.width - b.width) < 2);
        const edge = frame.locator("[data-resize-edge=w]"),
          eb = await edge.boundingBox();
        await page.mouse.move(eb.x + 2, eb.y + eb.height / 2);
        await page.mouse.down();
        await page.mouse.move(eb.x + 42, eb.y + eb.height / 2, { steps: 5 });
        await page.mouse.up();
        assert.ok((await frame.boundingBox()).width < restored.width - 20);
        await frame.getByLabel("最小化窗口").click();
        await expect(frame).toBeHidden();
        await page.locator(".window-dock button").last().click();
        await expect(frame).toBeVisible();
        await frame.getByLabel("最大化或还原").click();
      },
    );
    await check(
      "note insertion, right erase and actual instrument selection",
      async () => {
        const before = (await snapshot()).project.patterns[0].notes.length;
        const notes = frame.getByTestId("note-canvas");
        await notes.click({
          position: { x: 82 + 2 * 25 + 8, y: 26 + 5 * 18 + 9 },
        });
        await expect
          .poll(async () => (await snapshot()).project.patterns[0].notes.length)
          .toBe(before + 1);
        await notes.click({
          position: { x: 82 + 2 * 25 + 8, y: 26 + 5 * 18 + 9 },
          button: "right",
        });
        await expect
          .poll(async () => (await snapshot()).project.patterns[0].notes.length)
          .toBe(before);
        await frame.getByLabel("落笔音色").selectOption("7");
        await notes.click({
          position: { x: 82 + 5 * 25 + 8, y: 26 + 6 * 18 + 9 },
        });
        await expect
          .poll(
            async () =>
              (await snapshot()).project.patterns[0].notes.at(-1).instrument,
          )
          .toBe(7);
      },
    );
    await check(
      "note clipboard and keyboard edits commit through the shared session",
      async () => {
        const n = (await snapshot()).project.patterns[0].notes.at(-1),
          count = (await snapshot()).project.patterns[0].notes.length;
        await page.keyboard.press("Control+c");
        await frame
          .getByTestId("note-canvas")
          .click({ position: { x: 82 + 10 * 25 + 2, y: 12 } });
        await page.keyboard.press("Control+v");
        await expect
          .poll(async () => (await snapshot()).project.patterns[0].notes.length)
          .toBe(count + 1);
        assert.equal(
          (await snapshot()).project.patterns[0].notes.at(-1).tick,
          10,
        );
        await page.keyboard.press("ArrowUp");
        await expect
          .poll(
            async () =>
              (await snapshot()).project.patterns[0].notes.at(-1).pitch,
          )
          .toBe(n.pitch + 1);
        await page.keyboard.press("Delete");
        await expect
          .poll(async () => (await snapshot()).project.patterns[0].notes.length)
          .toBe(count);
      },
    );
    await page.screenshot({
      path: path.join(
        results,
        packaged ? "packaged-pattern.png" : "pattern.png",
      ),
    });
    await check(
      "pause holds the audio clock position; one Stop returns cursor and viewport to start",
      async () => {
        await page.getByRole("button", { name: "SONG", exact: true }).click();
        await page
          .getByRole("button", { name: "播放此 Pattern", exact: true })
          .last()
          .click();
        await expect(
          page.getByRole("button", { name: "暂停", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "PAT", exact: true }),
        ).toHaveClass("on");
        await expect
          .poll(
            async () =>
              await page
                .getByLabel("播放位置")
                .getAttribute("aria-description"),
          )
          .not.toContain("拍内 0 tick");
        await page.getByRole("button", { name: "暂停", exact: true }).click();
        const paused = await page.getByLabel("播放位置").innerText();
        await page.waitForTimeout(200);
        assert.equal(await page.getByLabel("播放位置").innerText(), paused);
        await page.getByLabel("终止", { exact: true }).click();
        await expect(page.locator(".transport-position-value")).toHaveText([
          "001",
          "01",
          "000",
        ]);
        assert.equal(
          await page
            .locator(".arrangement-scroll")
            .evaluate((e) => e.scrollLeft),
          0,
        );
      },
    );
    await frame.getByLabel("关闭窗口").click();
    await page.locator(".studio-window").getByLabel("关闭窗口").click();
    await check(
      "sample editor renders decoded PCM rather than a decorative waveform",
      async () => {
        await page.locator(".audio-resource-library > summary").click();
        await page.getByTestId("source-vanilla-0").dblclick();
        await expect(page.getByLabel("实际采样波形")).toBeVisible();
        assert.equal(
          await page.getByLabel("实际采样波形").locator("line").count(),
          161,
        );
        await page.getByLabel("试听采样").click();
      },
    );
    await page.screenshot({ path: path.join(results, "sample.png") });
    await page.locator(".studio-window").getByLabel("关闭窗口").click();
    await check(
      "save-as writes a real project and clears dirty state",
      async () => {
        await app.evaluate((_, p) => globalThis.testSave.push(p), fixture);
        await page.getByLabel("保存工程", { exact: true }).click();
        await expect(page.locator(".studio")).toHaveAttribute(
          "data-dirty",
          "false",
        );
        await expect
          .poll(async () => (await snapshot()).document.path)
          .toBe(fixture);
        const saved = await decodeProject(fs.readFileSync(fixture));
        assert.equal(
          fs.readFileSync(fixture).subarray(0, 15).toString(),
          "PNE-PROJECT v2\n",
        );
        assert.equal(saved.patterns.length, 4);
      },
    );
    await check(
      "Ctrl+S overwrites only the established project and retains edits on disk",
      async () => {
        await command({
          type: "project:update",
          patch: { title: "Roundtrip verification" },
        });
        await page.keyboard.press("Control+s");
        await expect(page.locator(".studio")).toHaveAttribute(
          "data-dirty",
          "false",
        );
        assert.equal(
          (await decodeProject(fs.readFileSync(fixture))).title,
          "Roundtrip verification",
        );
      },
    );
    await check(
      "NBS export produces a binary song, then reopens into an independent editable project",
      async () => {
        await app.evaluate((_, p) => globalThis.testSave.push(p), exported);
        await page.getByLabel("导出 NBS", { exact: true }).click();
        await expect.poll(() => fs.existsSync(exported)).toBe(true);
        assert.equal(fs.readFileSync(exported).readUInt16LE(0), 0);
        await closeInfo();
        await app.evaluate((_, p) => globalThis.testOpen.push(p), exported);
        await page.getByLabel("打开工程", { exact: true }).click();
        await expect
          .poll(async () => (await snapshot()).generation)
          .toBeGreaterThan(0);
        assert.equal((await snapshot()).document.path, undefined);
        assert.ok((await snapshot()).project.patterns[0].notes.length > 100);
      },
    );
    await check(
      "project reopen restores Pattern references and settings",
      async () => {
        await app.evaluate((_, p) => globalThis.testOpen.push(p), fixture);
        await page.getByLabel("打开工程", { exact: true }).click();
        await expect
          .poll(async () => (await snapshot()).project.title)
          .toBe("Roundtrip verification");
        assert.equal((await snapshot()).project.patterns.length, 4);
      },
    );
    await check(
      "two native desktop editors share edits and opening them preserves running audio",
      async () => {
        await page.evaluate(() => {
          globalThis.audioState = undefined;
          window.studio.onAudioSignal((s) => {
            if (s.type === "state") globalThis.audioState = s.state;
          });
        });
        await page.getByRole("button", { name: "播放", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "暂停", exact: true }),
        ).toBeVisible();
        const id = (await snapshot()).project.patterns[0].id;
        const ready = app.waitForEvent("window");
        await page.evaluate(
          (id) => window.studio.openEditor("pattern", id),
          id,
        );
        const native = await ready;
        await native.waitForSelector(".native-studio");
        await expect(
          page.getByRole("button", { name: "暂停", exact: true }),
        ).toBeVisible();
        await native.evaluate(async () => {
          const s = await window.studio.getSnapshot();
          await window.studio.dispatch({
            type: "pattern:update",
            id: s.project.patterns[0].id,
            patch: { name: "Shared native edit" },
          });
        });
        await expect(page.getByTestId("source-" + id)).toContainText(
          "Shared native edit",
        );
        await page.getByLabel("终止", { exact: true }).click();
        await native
          .getByRole("button", { name: "播放", exact: true })
          .click({ force: true });
        await expect
          .poll(
            async () =>
              (await page.evaluate(() => globalThis.audioState))?.scope,
          )
          .toBe(id);
        await native.close();
        await expect(
          page.getByRole("button", { name: "播放", exact: true }),
        ).toBeVisible();
        await expect(page.locator(".transport-position-value")).toHaveText([
          "001",
          "01",
          "000",
        ]);
        await page.getByRole("button", { name: "播放", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "暂停", exact: true }),
        ).toBeVisible();
        await page.getByLabel("终止", { exact: true }).click();
      },
    );
    await check(
      "custom instrument ZIP export and automatic path matching preserve actual audio",
      async () => {
        const seed = (await snapshot()).project;
        const bytes = fs.readFileSync("src/renderer/public/sounds/harp.ogg");
        const dataUrl = "data:audio/ogg;base64," + bytes.toString("base64");
        seed.samples.push({
          id: "test-custom",
          name: "Custom piano",
          color: "#aabbcc",
          originalPath: "Piano/soft.ogg",
          dataUrl,
          rootKey: 66,
          volume: 100,
          panning: 100,
        });
        seed.instruments.push({
          id: 16,
          name: "Custom piano",
          sampleId: "test-custom",
          key: 45,
          pressKey: false,
        });
        seed.patterns[0].notes.push({
          id: "custom-note",
          tick: 2,
          layer: 0,
          pitch: 66,
          instrument: 16,
          velocity: 80,
        });
        const custom = path.join(results, "custom.nbproject"),
          pack = path.join(results, "instruments.zip"),
          song = path.join(results, "custom.nbs");
        fs.writeFileSync(custom, await encodeProject(seed));
        await app.evaluate((_, p) => globalThis.testOpen.push(p), custom);
        await page.evaluate(() => window.studio.file("open"));
        await app.evaluate((_, p) => globalThis.testSave.push(p), pack);
        let result = await page.evaluate(() =>
          window.studio.file("exportInstruments"),
        );
        assert.equal(result.ok, true);
        assert.equal(fs.readFileSync(pack).readUInt32LE(0), 0x04034b50);
        await app.evaluate((_, p) => globalThis.testSave.push(p), song);
        await page.evaluate(() => window.studio.file("exportNbs"));
        await app.evaluate((_, p) => globalThis.testOpen.push(p), song);
        result = await page.evaluate(() => window.studio.file("open"));
        assert.equal(
          result.snapshot.project.instruments.at(-1).name,
          "Custom piano",
        );
        assert.equal(result.snapshot.project.samples.at(-1).dataUrl, undefined);
        await app.evaluate((_, p) => globalThis.testOpen.push(p), pack);
        result = await page.evaluate(() =>
          window.studio.file("importInstruments"),
        );
        assert.equal(result.snapshot.project.samples.at(-1).dataUrl, dataUrl);
        assert.equal(result.snapshot.project.instruments.at(-1).key, 45);
        const id = result.snapshot.project.samples.at(-1).id,
          ready = app.waitForEvent("window");
        await page.evaluate((id) => window.studio.openEditor("sample", id), id);
        const native = await ready;
        await native.waitForSelector(".native-studio");
        await expect(native.getByLabel("实际采样波形")).toBeVisible();
        await native.close();
      },
    );
    await check(
      "35,000-note project remains editable after scrolling and window resize",
      async () => {
        const seed = (await snapshot()).project;
        const pattern = seed.patterns[0];
        pattern.notes = Array.from({ length: 35000 }, (_, i) => ({
          id: "stress-" + i,
          tick: i,
          layer: 0,
          pitch: 54 + (i % 25),
          instrument: i % 16,
          velocity: 60 + (i % 40),
        }));
        pattern.length = 35001;
        seed.clips = [
          {
            id: "stress-clip",
            kind: "pattern",
            sourceId: pattern.id,
            tick: 0,
            length: 35001,
            offset: 0,
            track: 0,
            muted: false,
          },
        ];
        const file = path.join(results, "dense.nbproject");
        fs.writeFileSync(file, await encodeProject(seed));
        await app.evaluate((_, p) => globalThis.testOpen.push(p), file);
        await page.evaluate(() => window.studio.file("open"));
        await page.getByTestId("source-" + pattern.id).dblclick();
        const frame = page.locator(".studio-window");
        await frame.getByLabel("最大化或还原").click();
        await frame.locator(".note-scroll").evaluate((e) => {
          e.scrollLeft = 400000;
          e.scrollTop = 900;
        });
        await expect(frame.getByTestId("note-canvas")).toBeVisible();
        assert.equal(
          (await snapshot()).project.patterns[0].notes.length,
          35000,
        );
        const mainWindow = await app.browserWindow(page);
        await mainWindow.evaluate((w) => {
          w.unmaximize();
          w.setContentSize(1000, 650);
          w.show();
        });
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1000);
        await page.screenshot({
          path: path.join(results, "compact-dense.png"),
        });
        await expect(page.getByLabel("BPM")).toBeVisible();
        await expect(page.getByLabel("终止", { exact: true })).toBeVisible();
        assert.equal(await page.locator(".recovery").count(), 0);
        await mainWindow.evaluate((w) => w.setContentSize(1466, 864));
      },
    );
    await check(
      "pending sample decode cannot place a clip into a replacement project",
      async () => {
        await page.locator(".studio-window").getByLabel("关闭窗口").click();
        // Use a fresh, unused audio URL. Earlier playback can legitimately cache
        // any built-in sample before this asynchronous-decode regression runs.
        const wav = Buffer.alloc(46);
        wav.write("RIFF", 0);
        wav.writeUInt32LE(38, 4);
        wav.write("WAVEfmt ", 8);
        wav.writeUInt32LE(16, 16);
        wav.writeUInt16LE(1, 20);
        wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(8000, 24);
        wav.writeUInt32LE(16000, 28);
        wav.writeUInt16LE(2, 32);
        wav.writeUInt16LE(16, 34);
        wav.write("data", 36);
        wav.writeUInt32LE(2, 40);
        const pendingFile = path.join(results, "pending-decode.wav");
        fs.writeFileSync(pendingFile, wav);
        await app.evaluate(
          (_, file) => globalThis.testOpen.push(file),
          pendingFile,
        );
        const imported = await page.evaluate(() =>
          window.studio.file("importSample"),
        );
        assert.equal(imported.ok, true);
        const pendingSampleId = imported.snapshot.project.samples.at(-1).id;
        await page.evaluate(() => {
          const original = AudioContext.prototype.decodeAudioData;
          globalThis.restoreDecode = () => {
            AudioContext.prototype.decodeAudioData = original;
          };
          AudioContext.prototype.decodeAudioData = function (...args) {
            return original.apply(this, args).then(
              (buffer) =>
                new Promise((resolve) => {
                  globalThis.releaseDecode = () => resolve(buffer);
                }),
            );
          };
        });
        await page.getByTestId("source-" + pendingSampleId).click();
        await page
          .getByTestId("playlist-canvas")
          .click({ position: { x: 180, y: 30 + 5 * 64 + 25 } });
        await page.waitForFunction(
          () => typeof globalThis.releaseDecode === "function",
        );
        const before = (await snapshot()).generation;
        await page.evaluate(() => window.studio.file("new"));
        assert.ok((await snapshot()).generation > before);
        await page.evaluate(() => {
          globalThis.restoreDecode();
          globalThis.releaseDecode();
        });
        await page.waitForTimeout(150);
        assert.equal((await snapshot()).project.clips.length, 0);
        assert.equal((await snapshot()).document.dirty, false);
      },
    );
    await check("no renderer exceptions or recovery screen", async () => {
      assert.deepEqual(errors, []);
      assert.equal(await page.locator(".recovery").count(), 0);
      assert.equal(await page.locator(".error-banner").count(), 0);
    });
    fs.writeFileSync(
      path.join(results, packaged ? "packaged-smoke.json" : "smoke.json"),
      JSON.stringify(
        { packaged, checks, errors, date: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.log(`ALL ${checks.length} CHECKS PASSED`);
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(results, "failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

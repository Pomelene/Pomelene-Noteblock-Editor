const { _electron: electron, expect } = require("playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { encodeProject, decodeProject } = require("./project-fixture.cjs");
const packaged = process.argv.includes("--packaged");
const version = require("../package.json").version;
const folder = path.resolve("test-results/nbs-v2-desktop");
fs.mkdirSync(folder, { recursive: true });

(async () => {
  const app = await electron.launch({
    executablePath: packaged
      ? process.env.NBE_EXE ||
        path.resolve(
          `../deliverables/PomeleneNoteblockEditor-${version}/win-unpacked/Pomelene Noteblock Editor.exe`,
        )
      : require("electron"),
    args: packaged ? [] : ["."],
    env: { ...process.env, NBE_SMOKE_TEST: "1" },
  });
  const errors = [],
    checks = [];
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(String(e)));
    await app.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0].show();
      globalThis.openPaths = [];
      globalThis.savePaths = [];
      globalThis.saveRequests = 0;
      dialog.showOpenDialog = async () => ({
        canceled: !globalThis.openPaths.length,
        filePaths: globalThis.openPaths.splice(0, 1),
      });
      dialog.showSaveDialog = async () => {
        globalThis.saveRequests++;
        const filePath = globalThis.savePaths.shift();
        return { canceled: !filePath, filePath };
      };
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await page.waitForSelector(".studio");
    await page.evaluate(() =>
      window.studio.onImportPrompt((prompt) => {
        if (prompt) void window.studio.respondImport(prompt.id, "original");
      }),
    );
    const snapshot = () => page.evaluate(() => window.studio.getSnapshot());
    const action = (name) =>
      page.evaluate((name) => window.studio.file(name), name);
    const open = async (file) => {
      await app.evaluate((_, file) => globalThis.openPaths.push(file), file);
      return action("open");
    };
    const project = (await snapshot()).project;
    project.title = "NBS controls and v2 desktop verification";
    project.patterns = [
      {
        ...project.patterns[0],
        length: 16,
        notes: [
          {
            id: "ordinary-a",
            tick: 0,
            layer: 0,
            pitch: 66,
            velocity: 80,
            instrument: 0,
          },
          {
            id: "ordinary-b",
            tick: 9,
            layer: 0,
            pitch: 69,
            velocity: 80,
            instrument: 0,
          },
        ],
      },
    ];
    project.phrases = [];
    project.clips = [
      {
        id: "clip",
        sourceId: project.patterns[0].id,
        kind: "pattern",
        tick: 0,
        track: 0,
        length: 16,
        offset: 0,
        muted: false,
      },
    ];
    project.loop = { enabled: false, start: 0, end: 16 };
    project.nbs = {
      version: 5,
      vanillaInstrumentCount: 16,
      author: "",
      originalAuthor: "",
      description: "",
      autosave: 0,
      autosaveMinutes: 10,
      timeSignature: 4,
      minutesSpent: 0,
      leftClicks: 0,
      rightClicks: 0,
      notesAdded: 0,
      notesRemoved: 0,
      midiFile: "",
      loop: 0,
      maxLoopCount: 0,
      loopStartTick: 0,
      layers: [],
      rawStrings: {},
      warnings: [],
      customInstruments: [
        "Tempo Changer",
        "Sound Stopper",
        "Show Save Popup",
      ].map((name) => ({
        name,
        file: "not-an-audio-resource.ogg",
        key: 45,
        pressKey: 0,
      })),
    };
    project.nbsEvents = [
      { id: "tempo", kind: "tempo", tick: 4, instrument: 16, finePitch: 240 },
      { id: "stop", kind: "stop", tick: 8, instrument: 17, finePitch: 0 },
      { id: "visual", kind: "visual", tick: 10, instrument: 18, finePitch: 0 },
    ].map((event) => ({
      layer: 0,
      pitch: 66,
      velocity: 100,
      panning: 100,
      ...event,
    }));
    const fixture = path.join(folder, "controls.nbproject");
    const song = path.join(folder, "controls.nbs");
    const saved = path.join(folder, "saved.nbproject");
    fs.writeFileSync(fixture, await encodeProject(project));
    assert.equal((await open(fixture)).ok, true);
    assert.equal((await snapshot()).document.path, fixture);
    checks.push(
      "v2 project opens with control events and becomes the save target",
    );

    await app.evaluate((_, file) => globalThis.savePaths.push(file), song);
    assert.equal((await action("exportNbs")).ok, true);
    const imported = await open(song);
    assert.equal(imported.ok, true);
    assert.equal(imported.snapshot.project.nbsEvents.length, 3);
    assert.equal(imported.snapshot.project.patterns[0].notes.length, 2);
    assert.equal(imported.snapshot.document.path, undefined);
    assert.equal(
      imported.warnings.some((w) => /采样缺失|找不到|missing/i.test(w)),
      false,
    );
    checks.push(
      "NBS export/reopen retains three protocol events without missing-audio lookup",
    );
    const close = page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true });
    if (await close.count()) await close.click();
    await page
      .locator(".browser-filters")
      .getByRole("button", { name: "音频", exact: true })
      .click();
    await page.locator(".browser-items .nbs-event-summary summary").click();
    await expect(page.getByLabel("NBS 控制事件位置")).toContainText("tick 10");
    await expect(page.locator(".nbs-event-summary")).toContainText(
      "不会保存文件",
    );
    await page.locator(".browser-items").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({
      path: path.join(folder, packaged ? "packaged-events.png" : "events.png"),
    });
    checks.push(
      "event disclosure shows types, original positions and visual-only behavior",
    );

    const requests = await app.evaluate(() => globalThis.saveRequests);
    await page.getByRole("button", { name: "整曲", exact: true }).click();
    await page
      .getByRole("button", { name: "播放", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "暂停", exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "播放", exact: true }).first(),
    ).toBeVisible({ timeout: 5000 });
    assert.equal(await app.evaluate(() => globalThis.saveRequests), requests);
    await expect(page.locator(".error-banner")).toHaveCount(0);
    checks.push(
      "real audio playback crosses tempo/stop/visual events without initiating a save",
    );

    await app.evaluate((_, file) => globalThis.savePaths.push(file), saved);
    assert.equal((await action("saveAs")).ok, true);
    const restored = await decodeProject(fs.readFileSync(saved));
    assert.equal(restored.nbsEvents.length, 3);
    assert.equal((await open(saved)).ok, true);
    checks.push("imported controls survive v2 save and desktop reopen");
    const before = await snapshot();
    const corrupt = fs.readFileSync(saved);
    corrupt[corrupt.length - 3] ^= 1;
    const badPath = path.join(folder, "corrupt.nbproject");
    fs.writeFileSync(badPath, corrupt);
    await assert.rejects(() => open(badPath), /校验失败/);
    assert.deepEqual((await snapshot()).project, before.project);
    checks.push("bad checksum is rejected without replacing the open song");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(folder, packaged ? "packaged.json" : "source.json"),
      JSON.stringify({ version, packaged, checks, errors }, null, 2),
    );
    checks.forEach((check) => console.log("PASS " + check));
    console.log(`ALL ${checks.length} NBS/V2 DESKTOP CHECKS PASSED`);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

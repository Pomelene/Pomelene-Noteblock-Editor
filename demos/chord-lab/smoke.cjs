const { chromium, expect } = require("playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const executablePath = [
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(fs.existsSync);

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const errors = [],
    checks = [],
    result = path.resolve("test-results/chord-lab");
  fs.mkdirSync(result, { recursive: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
      acceptDownloads: true,
    });
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
    await expect(page.locator(".chord-pad")).toHaveCount(7);
    const state = () =>
      page.evaluate(() => window.PomeleneChordDemo.getState());
    const notes = async () => (await state()).groups.flatMap((g) => g.notes);
    const selectTick = async (bar, beat) =>
      page
        .getByRole("button", {
          name: `选择第 ${bar} 小节第 ${beat} 拍`,
          exact: true,
        })
        .click();
    assert.equal((await notes()).length, 0);
    await expect(page.locator(".note.ghost")).toHaveCount(3);
    checks.push(
      "standalone file opens offline with seven real chord pads and an unwritten ghost preview",
    );

    const edge = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    edge.on("pageerror", (error) => errors.push(String(error)));
    await edge.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
    await edge.locator("#tonic").selectOption("11");
    await edge.locator("#strip-octave").selectOption("5");
    await edge.locator(".chord-pad").nth(1).click();
    await expect(edge.locator("#octave")).toHaveValue("6");
    assert.equal(
      await edge.evaluate(
        () => window.PomeleneChordDemo.getState().groups[0].notes[0].pitch,
      ),
      85,
    );
    checks.push(
      "high-register chord strips keep the custom octave selector consistent with the generated notes",
    );
    await edge.locator("#tonic").selectOption("0");
    await edge.locator("#strip-octave").selectOption("4");
    await edge.locator("#snap").selectOption("1");
    await edge
      .getByRole("button", { name: "选择第 4 小节第 4 拍", exact: true })
      .click();
    await edge.locator(".workspace-heading").click();
    await edge.keyboard.press("ArrowRight");
    await edge.keyboard.press("ArrowRight");
    await edge.keyboard.press("ArrowRight");
    await edge.locator("#snap").selectOption("4");
    await edge.locator("#advance").check();
    await edge.locator(".chord-pad").first().click();
    assert.equal(
      await edge.evaluate(() => window.PomeleneChordDemo.getState().cursor),
      63,
    );
    await edge.close();
    checks.push(
      "auto-advance at the end of the fragment never moves the selected time backwards",
    );

    await selectTick(2, 1);
    await page
      .getByRole("button", { name: "放置 Dm 和弦", exact: true })
      .click();
    assert.deepEqual(
      (await notes()).map((n) => [n.tick, n.pitch]),
      [
        [16, 62],
        [16, 65],
        [16, 69],
      ],
    );
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    assert.equal((await notes()).length, 0);
    await page.getByRole("button", { name: "重做", exact: true }).click();
    assert.equal((await notes()).length, 3);
    checks.push(
      "chosen time and D-minor pitches are correct; one undo/redo covers all generated notes",
    );

    await page
      .getByRole("button", { name: "放置 C 和弦", exact: true })
      .click();
    assert.deepEqual(
      (await notes()).map((n) => n.pitch),
      [60, 64, 67],
    );
    await page.locator("#collision").selectOption("add");
    await page
      .getByRole("button", { name: "放置 Dm 和弦", exact: true })
      .click();
    assert.equal((await notes()).length, 6);
    checks.push(
      "replacement and additive placement are distinct working operations",
    );

    await page.locator("#root").selectOption("0");
    await page.locator("#octave").selectOption("4");
    await page.locator("#quality").selectOption("dom7");
    await page.locator("#inversion").selectOption("1");
    await page.locator("#extension").selectOption("9");
    await selectTick(3, 1);
    await page.locator("#place").click();
    assert.deepEqual(
      (await state()).groups.at(-1).notes.map((n) => n.pitch),
      [64, 67, 70, 72, 74],
    );
    await page.locator("#advance").check();
    await page.locator("#advance-step").selectOption("8");
    await page.locator("#place").click();
    assert.equal((await state()).cursor, 40);
    checks.push(
      "custom ninth and inversion generate correct pitches; optional advance moves the editing cursor",
    );

    const beforeDelete = (await notes()).length;
    await page.locator("#notes .note").last().click({ button: "right" });
    assert.equal((await notes()).length, beforeDelete - 1);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    assert.equal((await notes()).length, beforeDelete);
    await page.locator("#placement").selectOption("up");
    await selectTick(4, 4);
    await expect(page.locator("#place")).toBeDisabled();
    await expect(page.locator("#feedback")).toContainText("时间范围");
    assert.equal((await notes()).length, beforeDelete);
    checks.push(
      "individual note erase is reversible; out-of-range arpeggios cannot partially write a chord",
    );

    await page.locator("#placement").selectOption("block");
    await page.locator("#stop").click();
    await page.locator("#preview").click();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.PomeleneChordDemo.getPlaybackState().sources,
        ),
      )
      .toBeGreaterThan(0);
    await page.locator("#stop").click();
    assert.equal(
      await page.evaluate(
        () => window.PomeleneChordDemo.getPlaybackState().sources,
      ),
      0,
    );
    checks.push(
      "actual embedded note-block audio decodes and plays; Stop cancels active sources",
    );

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export").click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(exported.format, "pomelene-chord-lab");
    assert.equal(exported.groups.flatMap((g) => g.notes).length, beforeDelete);
    const savedNotes = await notes();
    await page.reload();
    assert.deepEqual(await notes(), savedNotes);
    await page.locator("#clear").click();
    assert.equal((await notes()).length, 0);
    await page.locator("#undo").click();
    assert.deepEqual(await notes(), savedNotes);
    checks.push(
      "JSON export, reload recovery and undoable clear preserve the actual note list",
    );

    await selectTick(2, 3);
    await page.screenshot({
      path: path.join(result, "desktop.png"),
      fullPage: true,
    });
    for (const width of [768, 375, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        `body overflow at ${width}px`,
      );
    }
    await page.screenshot({
      path: path.join(result, "mobile.png"),
      fullPage: true,
    });
    checks.push(
      "desktop and 768/375/320px layouts keep controls inside the page",
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(result, "results.json"),
      JSON.stringify({ checks, errors }, null, 2),
    );
    checks.forEach((check) => console.log("PASS " + check));
    console.log(`ALL ${checks.length} CHORD DEMO CHECKS PASSED`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

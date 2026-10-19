import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
const executablePath = [
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
describe.skipIf(!executablePath)(
  "Pattern chords and erase transactions",
  () => {
    let server: ViteDevServer, browser: Browser, url: string;
    beforeAll(async () => {
      server = await createServer({
        configFile: false,
        cacheDir: "node_modules/.vite-chord-erase",
        plugins: [
          react(),
          {
            name: "chord-erase-harness",
            configureServer(s) {
              s.middlewares.use(async (req, res, next) => {
                if (!req.url?.startsWith("/harness.html")) return next();
                res.setHeader("Content-Type", "text/html");
                res.end(
                  await s.transformIndexHtml(
                    "/harness.html",
                    `<!doctype html><html><body><div id="root"></div><script type="module">
          import React from 'react';import {createRoot} from 'react-dom/client';
          import {PatternEditor} from '/src/renderer/src/PatternEditor.tsx';
          import {Session,createEmptyProject,newLayer} from '/src/shared/session.ts';
          import {audio} from '/src/renderer/src/audio.ts';import '/src/renderer/src/studio.css';
          window.commands=[];window.previews=[];window.studio={readClipboard:async()=>[],writeClipboard:async()=>{}};
          audio.preview=()=>{};audio.previewNotes=async(_,notes)=>window.previews.push(notes);audio.stopPreview=()=>{};
          const initial=createEmptyProject();initial.patterns=[{id:'p',name:'Pattern',color:'#75b9ab',length:64,layers:Array.from({length:8},(_,i)=>newLayer(i)),notes:[]}];
          let session=new Session(initial);window.getSnapshot=()=>session.snapshot();
          function App(){const [snapshot,setSnapshot]=React.useState(session.snapshot());window.seed=(notes,meter="4/4")=>{const p=structuredClone(initial);p.meter=meter;p.patterns[0].notes=notes;p.patterns[0].layers[3].locked=true;session=new Session(p);setSnapshot(session.snapshot());window.commands=[]};window.undo=()=>setSnapshot(session.dispatch({type:'undo'}));return React.createElement(PatternEditor,{project:snapshot.project,pattern:snapshot.project.patterns[0],generation:snapshot.generation,run:async c=>{window.commands.push(c);const next=session.dispatch(c);setSnapshot(next);return next},menu:()=>{},open:()=>{},report:()=>{},seek:()=>{},stopped:0})}
          createRoot(document.getElementById('root')).render(React.createElement(App));
          </script><style>body{margin:0}#root{height:100vh;width:100vw}.pattern-editor{height:100%}</style></body></html>`,
                  ),
                );
              });
            },
          },
        ],
        server: { host: "127.0.0.1", port: 0 },
      });
      await server.listen();
      url = server.resolvedUrls!.local[0] + "harness.html";
      browser = await chromium.launch({ executablePath, headless: true });
    }, 20000);
    afterAll(async () => {
      await browser?.close();
      await server?.close();
    });
    async function setup(width = 1000) {
      const p = await browser.newPage({ viewport: { width, height: 700 } });
      await p.goto(url);
      await p.getByTestId("note-canvas").waitFor();
      await p.getByRole("button", { name: "NBS 图层", exact: true }).click();
      return p;
    }
    const note = (id: string, tick: number, layer = 0, instrument = 0) => ({
      id,
      tick,
      layer,
      instrument,
      pitch: 60,
      velocity: 85,
      panning: 100,
      finePitch: 0,
    });
    async function seed(p: Page, notes: unknown[]) {
      await p.evaluate((n) => (window as any).seed(n), notes);
      await p.waitForTimeout(40);
    }
    async function notes(p: Page) {
      return p.evaluate(
        () => (window as any).getSnapshot().project.patterns[0].notes,
      );
    }
    async function click(p: Page, x: number, y: number) {
      const b = (await p.getByTestId("note-canvas").boundingBox())!;
      await p.mouse.click(b.x + x, b.y + y, { button: "right" });
    }
    it("does not erase empty space beyond the drawn note with bar snap", async () => {
      const p = await setup();
      try {
        await seed(p, [note("a", 2)]);
        await p.getByLabel("音符吸附", { exact: true }).selectOption("bar");
        await click(p, 82 + 5 * 25, 26 + 18);
        expect(await notes(p)).toHaveLength(1);
      } finally {
        await p.close();
      }
    });
    it("erases the visible right tip at low zoom and fine snap", async () => {
      const p = await setup();
      try {
        await seed(p, [note("a", 2)]);
        await p.getByLabel("音符缩放", { exact: true }).selectOption("12");
        await p.getByLabel("音符吸附", { exact: true }).selectOption("none");
        await click(p, 82 + 2 * 12 + 7.5, 26 + 18);
        expect(await notes(p)).toHaveLength(0);
      } finally {
        await p.close();
      }
    });
    it("fast right sweep includes other instruments, protects locks and undoes once", async () => {
      const p = await setup();
      try {
        const initial = [
          note("a", 2),
          note("b", 4, 1, 1),
          note("c", 6, 2),
          note("lock", 8, 3),
        ];
        await seed(p, initial);
        await p.getByRole("button", { name: "钢琴卷帘", exact: true }).click();
        await p.waitForTimeout(40);
        const b = (await p.getByTestId("note-canvas").boundingBox())!;
        const y = b.y + 26 + 16 * 18 + 9;
        await p.mouse.move(b.x + 82 + 2 * 25 + 3, y);
        await p.mouse.down({ button: "right" });
        await p.mouse.move(b.x + 82 + 8 * 25 + 3, y, { steps: 1 });
        await p.mouse.up({ button: "right" });
        expect((await notes(p)).map((n: any) => n.id)).toEqual(["lock"]);
        expect(await p.evaluate(() => (window as any).commands)).toHaveLength(
          1,
        );
        await p.evaluate(() => (window as any).undo());
        expect(await notes(p)).toEqual(initial);
      } finally {
        await p.close();
      }
    });
    it("Escape cancels a whole erase preview", async () => {
      const p = await setup();
      try {
        await seed(p, [note("a", 2)]);
        const b = (await p.getByTestId("note-canvas").boundingBox())!;
        await p.mouse.move(b.x + 135, b.y + 44);
        await p.mouse.down({ button: "right" });
        await p.keyboard.press("Escape");
        await p.mouse.up({ button: "right" });
        expect(await notes(p)).toHaveLength(1);
        expect(await p.evaluate(() => (window as any).commands)).toHaveLength(
          0,
        );
      } finally {
        await p.close();
      }
    });
    it("chooses a time without drawing, places a real chord and undoes atomically", async () => {
      const p = await setup();
      try {
        await p
          .getByRole("button", { name: "和弦生成器", exact: true })
          .click();
        const b = (await p.getByTestId("note-canvas").boundingBox())!;
        await p.mouse.click(b.x + 82 + 4 * 25 + 2, b.y + 26 + 18);
        expect(await notes(p)).toHaveLength(0);
        await p.getByLabel("和弦根音 MIDI").fill("60");
        await p.getByRole("button", { name: "放置和弦", exact: true }).click();
        expect((await notes(p)).map((n: any) => [n.tick, n.pitch])).toEqual([
          [4, 60],
          [4, 64],
          [4, 67],
        ]);
        await p.getByRole("button", { name: "试听和弦", exact: true }).click();
        expect(await p.evaluate(() => (window as any).previews)).toHaveLength(
          1,
        );
        await p.evaluate(() => (window as any).undo());
        expect(await notes(p)).toHaveLength(0);
      } finally {
        await p.close();
      }
    });
    it("shows a usable canvas and scrollable panel in a compact editor", async () => {
      const p = await setup(520);
      try {
        await p
          .getByRole("button", { name: "和弦生成器", exact: true })
          .click();
        const canvas = (await p.getByTestId("note-canvas").boundingBox())!,
          panel = (await p.getByLabel("和弦生成面板").boundingBox())!;
        expect(canvas.height).toBeGreaterThanOrEqual(120);
        expect(panel.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);
        expect(panel.x + panel.width).toBeLessThanOrEqual(521);
        await p.getByLabel("和弦根音 MIDI").fill("60");
        await p.getByRole("button", { name: "放置和弦", exact: true }).click();
        expect(await notes(p)).toHaveLength(3);
      } finally {
        await p.close();
      }
    });
    it("takes current instrument and layer, arpeggiates and advances past the generated tail", async () => {
      const p = await setup();
      try {
        await p
          .getByRole("button", { name: "和弦生成器", exact: true })
          .click();
        const b = (await p.getByTestId("note-canvas").boundingBox())!;
        await p.mouse.click(b.x + 84, b.y + 26 + 2 * 36 + 18);
        await p.getByLabel("落笔音色", { exact: true }).selectOption("15");
        await p.getByLabel("和弦根音 MIDI").fill("60");
        await p.getByLabel("和弦触发方式").selectOption("up");
        await p.getByLabel("和弦音符间隔").selectOption("4");
        await p.getByRole("checkbox", { name: "放置后前进" }).check();
        await p.getByRole("button", { name: "放置和弦", exact: true }).click();
        expect(
          (await notes(p)).map((n: any) => [n.tick, n.layer, n.instrument]),
        ).toEqual([
          [0, 2, 15],
          [4, 2, 15],
          [8, 2, 15],
        ]);
        expect(
          await p.locator(".chord-target span").last().getAttribute("title"),
        ).toBe("12 tick");
        await p.getByRole("button", { name: "放置和弦", exact: true }).click();
        expect((await notes(p)).slice(3).map((n: any) => n.tick)).toEqual([
          12, 16, 20,
        ]);
      } finally {
        await p.close();
      }
    });
    it("replaces only the current unlocked instrument and still allows right erase with the panel open", async () => {
      const p = await setup();
      try {
        const initial = [
          note("old", 0),
          note("other", 0, 1, 1),
          note("locked", 0, 3),
          note("later", 8, 0),
        ];
        await seed(p, initial);
        await p
          .getByRole("button", { name: "和弦生成器", exact: true })
          .click();
        await p.getByLabel("和弦根音 MIDI").fill("60");
        await p.getByRole("checkbox", { name: "替换落点处当前音色" }).check();
        await p.getByRole("button", { name: "放置和弦", exact: true }).click();
        expect((await notes(p)).map((n: any) => n.id)).toEqual(
          expect.arrayContaining(["other", "locked", "later"]),
        );
        expect((await notes(p)).some((n: any) => n.id === "old")).toBe(false);
        await click(p, 82 + 8 * 25 + 3, 26 + 18);
        expect((await notes(p)).some((n: any) => n.id === "later")).toBe(false);
      } finally {
        await p.close();
      }
    });
    it("commits when the initiating right button is released while left is still held", async () => {
      const p = await setup();
      try {
        await seed(p, [note("a", 2)]);
        const b = (await p.getByTestId("note-canvas").boundingBox())!;
        await p.mouse.move(b.x + 135, b.y + 44);
        await p.mouse.down({ button: "right" });
        await p.mouse.down({ button: "left" });
        await p.mouse.up({ button: "right" });
        expect(await notes(p)).toHaveLength(0);
        await p.mouse.up({ button: "left" });
        expect(await p.evaluate(() => (window as any).commands)).toHaveLength(
          1,
        );
      } finally {
        await p.close();
      }
    });
    it("shows the meter denominator in the chord insertion position", async () => {
      const p = await setup();
      try {
        await p.evaluate(() => (window as any).seed([], "6/8"));
        await p
          .getByRole("button", { name: "和弦生成器", exact: true })
          .click();
        const b = (await p.getByTestId("note-canvas").boundingBox())!;
        await p.mouse.click(b.x + 82 + 5 * 25 + 2, b.y + 44);
        expect(await p.locator(".chord-target b").textContent()).toBe("1:03:1");
      } finally {
        await p.close();
      }
    });
  },
);

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
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
  "Pattern instrument focus and local shortcuts",
  () => {
    let server: ViteDevServer, browser: Browser, page: Page, url: string;
    beforeAll(async () => {
      server = await createServer({
        configFile: false,
        cacheDir: "node_modules/.vite-instrument-focus",
        optimizeDeps: {
          include: ["react", "react-dom/client", "lucide-react"],
        },
        plugins: [
          react(),
          {
            name: "pattern-focus-harness",
            configureServer(s) {
              s.middlewares.use(async (req, res, next) => {
                if (req.url !== "/pattern-focus.html") return next();
                const html = await s.transformIndexHtml(
                  req.url,
                  `<!doctype html><html><body><div id="root"></div><script type="module">
            import React from 'react'; import {createRoot} from 'react-dom/client';
            import {PatternEditor} from '/src/renderer/src/PatternEditor.tsx';
            import '/src/renderer/src/studio.css';
            import {audio} from '/src/renderer/src/audio.ts';
            window.previews=[]; audio.preview=async(...args)=>window.previews.push(args.slice(1));
            window.commands=[]; window.seeks=[]; window.studio={readClipboard:async()=>[],writeClipboard:async()=>{}};
            const pattern={id:'p',name:'Pattern',color:'#75b9b0',length:16,layers:[{id:'l',name:'Layer',locked:false,muted:false}],notes:[{id:'a',tick:0,layer:0,pitch:66,instrument:7,velocity:85},{id:'b',tick:1,layer:0,pitch:68,instrument:11,velocity:70}]};
            const project={id:'project',meter:'4/4',patterns:[pattern],samples:[],instruments:[{id:7,name:'Harp'},{id:2,name:'Bass'},{id:11,name:'Bell'},...Array.from({length:10},(_,i)=>({id:12+i,name:'Instrument '+(i+4)}))]};
            window.project=project; window.originalProject=JSON.stringify(project);
            const style=document.createElement('style');style.textContent='#root{width:1000px;height:600px;display:flex}.pattern-editor{width:100%;height:100%}';document.head.appendChild(style);
            createRoot(document.getElementById('root')).render(React.createElement(PatternEditor,{project,pattern,run:async c=>{window.commands.push(c)},seek:n=>window.seeks.push(n),open:()=>{},menu:()=>{},report:()=>{},stopped:0}));
          </script></body></html>`,
                );
                res.setHeader("Content-Type", "text/html");
                res.end(html);
              });
            },
          },
        ],
        server: { host: "127.0.0.1", port: 0 },
      });
      await server.listen();
      url = server.resolvedUrls!.local[0] + "pattern-focus.html";
      browser = await chromium.launch({ executablePath, headless: true });
    }, 20000);
    beforeEach(async () => {
      page = await browser.newPage();
      await page.goto(url);
      await page.getByTestId("pattern-editor").waitFor();
    });
    afterEach(async () => {
      await page?.close();
    });
    afterAll(async () => {
      await browser?.close();
      await server?.close();
    });
    it("provides named counted choices, dims velocity with note focus, and preserves selection", async () => {
      const harp = page.getByRole("radio", { name: "Harp · 1 音符" });
      await harp.waitFor();
      expect(await harp.getAttribute("aria-checked")).toBe("true");
      const bellVelocity = page.getByRole("button", {
        name: "力度 Tick 1 图层 1",
        exact: true,
      });
      expect(await bellVelocity.evaluate((el) => el.style.opacity)).toBe(
        "0.22",
      );
      await page
        .getByRole("button", { name: "显示全部音色", exact: true })
        .click();
      expect(await bellVelocity.evaluate((el) => el.style.opacity)).toBe("1");
      await page
        .getByRole("button", { name: "显示全部音色", exact: true })
        .click();
      await page.getByTestId("pattern-editor").focus();
      await page.keyboard.press("Control+a");
      expect(await bellVelocity.evaluate((el) => el.style.opacity)).toBe("1");
      expect(await page.evaluate(() => (window as any).commands)).toEqual([]);
      expect(
        await page.evaluate(
          () =>
            JSON.stringify((window as any).project) ===
            (window as any).originalProject,
        ),
      ).toBe(true);
      expect(await page.evaluate(() => (window as any).previews)).toEqual([]);
    });
    it("renders actual canvas notes with ghost opacity and restores them with show all", async () => {
      const pixel = () =>
        page.getByTestId("note-canvas").evaluate((el) => {
          const canvas = el as HTMLCanvasElement;
          const scroll = document.querySelector(".note-scroll")!;
          const ratio = window.devicePixelRatio || 1;
          return [
            ...canvas
              .getContext("2d")!
              .getImageData(
                (82 + 25 + 4) * ratio,
                (26 + (108 - 68) * 18 - scroll.scrollTop + 6) * ratio,
                1,
                1,
              ).data,
          ];
        });
      const ghost = await pixel();
      await page
        .getByRole("button", { name: "显示全部音色", exact: true })
        .click();
      const full = await pixel();
      expect(
        full
          .slice(0, 3)
          .reduce(
            (sum, value, index) => sum + Math.abs(value - ghost[index]),
            0,
          ),
      ).toBeGreaterThan(50);
      await page
        .getByRole("button", { name: "显示全部音色", exact: true })
        .click();
      expect(
        (await pixel()).every(
          (value, index) => Math.abs(value - ghost[index]) <= 2,
        ),
      ).toBe(true);
      await page.getByTestId("pattern-editor").focus();
      await page.keyboard.press("Control+a");
      const selected = await pixel();
      expect(selected[0]).toBeGreaterThan(190);
      expect(await page.evaluate(() => (window as any).commands)).toEqual([]);
    });
    it("navigates all/used instruments without editing notes and supports radio arrow selection", async () => {
      const editor = page.getByTestId("pattern-editor");
      await editor.focus();
      await page.keyboard.press("k");
      expect(await page.getByLabel("落笔音色").inputValue()).toBe("2");
      await page.keyboard.press("j");
      expect(await page.getByLabel("落笔音色").inputValue()).toBe("11");
      await page.getByRole("radio", { name: "Harp · 1 音符" }).focus();
      await page.keyboard.press("ArrowRight");
      expect(await page.getByLabel("落笔音色").inputValue()).toBe("2");
      expect(await page.evaluate(() => (window as any).commands)).toEqual([]);
    });
    it("toggles snap without deleting, restores previous snap, deselects and seeks locally", async () => {
      const editor = page.getByTestId("pattern-editor");
      await editor.focus();
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      expect(await page.getByLabel("音符吸附").inputValue()).toBe("none");
      await page.keyboard.press("Backspace");
      expect(await page.getByLabel("音符吸附").inputValue()).toBe("auto");
      await page.keyboard.press("Control+ArrowUp");
      expect(await page.evaluate(() => (window as any).commands)).toEqual([
        {
          type: "notes:move",
          patternId: "p",
          ids: ["a", "b"],
          ticks: 0,
          pitches: 12,
        },
      ]);
      await page.keyboard.press("Control+d");
      await page.keyboard.press("Delete");
      await page.keyboard.press("End");
      await page.keyboard.press("Home");
      expect(await page.evaluate(() => (window as any).seeks)).toEqual([16, 0]);
      expect(await page.evaluate(() => (window as any).commands.length)).toBe(
        1,
      );
    });
    it("keeps a usable canvas and footer inside the smallest supported editor", async () => {
      await page.locator("#root").evaluate((el) => {
        el.style.width = "320px";
        el.style.height = "188px";
      });
      const canvas = await page.getByTestId("note-canvas").boundingBox();
      const editor = await page.getByTestId("pattern-editor").boundingBox();
      const footer = await page.locator(".canvas-footer").boundingBox();
      expect(canvas!.height).toBeGreaterThanOrEqual(30);
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(
        editor!.y + editor!.height,
      );
      expect(await page.getByLabel("落笔音色").isVisible()).toBe(true);
      expect(
        await page.getByRole("radiogroup", { name: "音色列表" }).isVisible(),
      ).toBe(false);
    });
    it("scrolls the current chip into view after shortcuts and dropdown selection", async () => {
      await page.locator("#root").evaluate((el) => {
        el.style.width = "320px";
      });
      const currentVisible = () =>
        page.locator(".instrument-chip.current").evaluate((el) => {
          const chip = el.getBoundingClientRect(),
            strip = el.parentElement!.getBoundingClientRect();
          return chip.left >= strip.left && chip.right <= strip.right;
        });
      await page.getByTestId("pattern-editor").focus();
      await page.keyboard.press("g");
      expect(await page.getByLabel("落笔音色").inputValue()).toBe("21");
      expect(await currentVisible()).toBe(true);
      await page.getByLabel("落笔音色").selectOption("7");
      expect(await currentVisible()).toBe(true);
    });
  },
);

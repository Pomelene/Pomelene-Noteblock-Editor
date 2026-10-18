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

describe.skipIf(!executablePath)("editor row density and time zoom", () => {
  let server: ViteDevServer, browser: Browser, url: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      cacheDir: "node_modules/.vite-editor-viewport",
      optimizeDeps: { include: ["react", "react-dom/client", "lucide-react"] },
      plugins: [
        react(),
        {
          name: "editor-viewport-harness",
          configureServer(s) {
            s.middlewares.use(async (req, res, next) => {
              if (!req.url?.startsWith("/editor-viewport.html")) return next();
              const html = await s.transformIndexHtml(
                "/editor-viewport.html",
                `<!doctype html><html><body><div id="root"></div><script type="module">
            import React from 'react'; import {createRoot} from 'react-dom/client';
            import {Playlist} from '/src/renderer/src/Playlist.tsx';
            import {PatternEditor} from '/src/renderer/src/PatternEditor.tsx';
            import '/src/renderer/src/studio.css';
            window.commands=[]; window.seeks=[]; window.studio={readClipboard:async()=>[],writeClipboard:async()=>{}};
            const pattern={id:'p',name:'Pattern',color:'#75b9b0',length:512,layers:Array.from({length:48},(_,i)=>({id:'l'+i,name:'Layer '+i,locked:false,muted:false})),notes:[]};
            const project={id:'project',meter:'4/4',bpm:120,patterns:[pattern],phrases:[],clips:[],loop:{enabled:false,start:0,end:64},tracks:Array.from({length:48},(_,i)=>({id:'t'+i,name:'Track '+i,color:'#75b9b0',locked:false,muted:false,solo:false})),samples:[],instruments:[{id:0,name:'Harp'}]};
            const style=document.createElement('style');style.textContent='body{margin:0}#root{width:100vw;height:100vh;display:flex}.playlist,.pattern-editor{width:100%;height:100%}';document.head.appendChild(style);
            const common={project,pattern,source:{kind:'pattern',id:'p'},run:async c=>{window.commands.push(c)},seek:n=>window.seeks.push(n),open:()=>{},menu:()=>{},text:()=>{},report:()=>{},stopped:0,tick:0};
            createRoot(document.getElementById('root')).render(React.createElement(location.search.includes('pattern')?PatternEditor:Playlist,common));
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
    url = server.resolvedUrls!.local[0] + "editor-viewport.html";
    browser = await chromium.launch({ executablePath, headless: true });
  }, 20000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  const configs = [
    {
      name: "playlist",
      scroll: ".arrangement-scroll",
      canvas: "playlist-canvas",
      row: "编排行高",
      zoom: "编排缩放",
      left: 160,
      top: 30,
      initial: 11,
      min: 4,
      max: 36,
    },
    {
      name: "pattern",
      scroll: ".note-scroll",
      canvas: "note-canvas",
      row: "图层行高",
      zoom: "音符缩放",
      left: 82,
      top: 26,
      initial: 25,
      min: 4,
      max: 64,
    },
  ];
  async function setup(name: string, width = 1000) {
    const page = await browser.newPage({ viewport: { width, height: 650 } });
    await page.goto(url + "?" + name);
    await page
      .getByTestId(name === "pattern" ? "note-canvas" : "playlist-canvas")
      .waitFor();
    if (name === "pattern")
      await page.getByRole("button", { name: "NBS 图层", exact: true }).click();
    return page;
  }
  async function wheel(
    page: Page,
    selector: string,
    clientX: number,
    deltaY: number,
    ctrlKey = true,
    deltaMode = 0,
  ) {
    return page.locator(selector).evaluate(
      (el, data) => {
        const event = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: data.clientX,
          deltaY: data.deltaY,
          ctrlKey: data.ctrlKey,
          deltaMode: data.deltaMode,
        });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      },
      { clientX, deltaY, ctrlKey, deltaMode },
    );
  }
  for (const c of configs) {
    it(`${c.name} compacts rows and maps editing to the resized row`, async () => {
      const page = await setup(c.name);
      try {
        await page.getByLabel(c.row, { exact: true }).fill("24");
        const scroll = page.locator(c.scroll);
        expect(await scroll.evaluate((el) => el.scrollHeight)).toBe(
          c.top + 48 * 24,
        );
        const box = (await page.getByTestId(c.canvas).boundingBox())!;
        await page.mouse.click(
          box.x + c.left + 30,
          box.y + c.top + 24 * 7 + 12,
        );
        const commands = await page.evaluate(() => (window as any).commands);
        expect(commands).toHaveLength(1);
        if (c.name === "playlist") expect(commands[0].clips[0].track).toBe(7);
        else expect(commands[0].notes[0].layer).toBe(7);
      } finally {
        await page.close();
      }
    });
    it(`${c.name} anchors Ctrl+wheel at the pointer and bounds zoom without consuming normal wheel`, async () => {
      const page = await setup(c.name);
      try {
        const scroll = page.locator(c.scroll);
        await scroll.evaluate((el) => {
          el.scrollLeft = 300;
        });
        await page.waitForTimeout(40);
        const box = (await scroll.boundingBox())!,
          offset = 260;
        const initialLeft = await scroll.evaluate((el) => el.scrollLeft);
        expect(await wheel(page, c.scroll, box.x + c.left + offset, -100)).toBe(
          true,
        );
        await page.waitForTimeout(50);
        const next = +(await page
          .getByLabel(c.zoom, { exact: true })
          .inputValue());
        expect(next).toBeGreaterThan(c.initial);
        expect(
          Math.abs(
            (await scroll.evaluate((el) => el.scrollLeft)) -
              (((initialLeft + offset) / c.initial) * next - offset),
          ),
        ).toBeLessThanOrEqual(1);
        expect(
          await wheel(page, c.scroll, box.x + c.left + offset, 100, false),
        ).toBe(false);
        expect(
          +(await page.getByLabel(c.zoom, { exact: true }).inputValue()),
        ).toBe(next);
        for (let i = 0; i < 12; i++)
          await wheel(page, c.scroll, box.x + c.left + offset, -10000, true, 1);
        await page.waitForTimeout(40);
        expect(
          +(await page.getByLabel(c.zoom, { exact: true }).inputValue()),
        ).toBe(c.max);
        for (let i = 0; i < 12; i++)
          await wheel(page, c.scroll, box.x + c.left + offset, 10000, true, 2);
        await page.waitForTimeout(40);
        expect(
          +(await page.getByLabel(c.zoom, { exact: true }).inputValue()),
        ).toBe(c.min);
        expect(await page.evaluate(() => (window as any).commands)).toEqual([]);
      } finally {
        await page.close();
      }
    });
    it(`${c.name} cancels an active brush when the time scale changes`, async () => {
      const page = await setup(c.name);
      try {
        const box = (await page.getByTestId(c.canvas).boundingBox())!;
        await page.mouse.move(box.x + c.left + 30, box.y + c.top + 10);
        await page.mouse.down();
        await wheel(page, c.scroll, box.x + c.left + 40, -100);
        await page.mouse.up();
        expect(await page.evaluate(() => (window as any).commands)).toEqual([]);
      } finally {
        await page.close();
      }
    });
    it(`${c.name} preserves the top visible row when compacting near the end and still scrolls normally`, async () => {
      const page = await setup(c.name);
      try {
        const scroll = page.locator(c.scroll);
        const initialHeight = c.name === "playlist" ? 64 : 36;
        await scroll.evaluate((el, y) => {
          el.scrollTop = y;
        }, 24 * initialHeight);
        await page.waitForTimeout(40);
        await page.getByLabel(c.row, { exact: true }).fill("24");
        await page.waitForTimeout(40);
        expect(await scroll.evaluate((el) => el.scrollTop)).toBe(24 * 24);
        const box = (await scroll.boundingBox())!;
        await page.mouse.move(box.x + c.left + 50, box.y + 80);
        await page.mouse.wheel(0, -120);
        await page.waitForFunction(
          (selector) => document.querySelector(selector)!.scrollTop < 24 * 24,
          c.scroll,
        );
        expect(
          +(await page.getByLabel(c.zoom, { exact: true }).inputValue()),
        ).toBe(c.initial);
      } finally {
        await page.close();
      }
    });
    it(`${c.name} keeps density and zoom controls reachable in a small detached window`, async () => {
      const page = await setup(c.name, 420);
      try {
        await page.getByLabel(c.row, { exact: true }).scrollIntoViewIfNeeded();
        await page.getByLabel(c.row, { exact: true }).fill("32");
        expect(await page.getByLabel(c.row, { exact: true }).inputValue()).toBe(
          "32",
        );
        const toolbar = page.locator(
          c.name === "playlist" ? ".canvas-toolbar" : ".editor-tools",
        );
        expect(
          await toolbar.evaluate((el) => getComputedStyle(el).overflowX),
        ).toBe("auto");
        expect(
          await page.locator(c.scroll).evaluate((el) => el.clientHeight),
        ).toBeGreaterThan(100);
      } finally {
        await page.close();
      }
    });
    it(`${c.name} accepts a typed multi-digit row height without clamping each digit`, async () => {
      const page = await setup(c.name);
      try {
        const input = page.getByLabel(c.row, { exact: true });
        await input.fill("");
        await input.pressSequentially("52");
        expect(await input.inputValue()).toBe("52");
        await input.blur();
        expect(
          await page.locator(c.scroll).evaluate((el) => el.scrollHeight),
        ).toBe(c.top + 48 * 52);
      } finally {
        await page.close();
      }
    });
  }
});

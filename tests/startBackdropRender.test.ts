import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
const executablePath = [
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
describe.skipIf(!executablePath)("whole-screen background rendering", () => {
  let server: ViteDevServer, browser: Browser, url: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      cacheDir: "node_modules/.vite-backdrop",
      plugins: [
        {
          name: "backdrop-harness",
          configureServer(s) {
            s.middlewares.use(async (req, res, next) => {
              if (!req.url?.startsWith("/backdrop.html")) return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await s.transformIndexHtml(
                  "/backdrop.html",
                  `<html><body><canvas id="art"></canvas><script type="module">
  import {createStartBackdrop} from '/src/renderer/src/startBackdrop.ts';
  window.make=prefer=>{window.renderer?.dispose();const old=document.querySelector('canvas');const canvas=document.createElement('canvas');old.replaceWith(canvas);window.art=canvas;window.renderer=createStartBackdrop(canvas,prefer);window.renderer.resize(320,200);};
  window.read=()=>{const c=window.art;if(window.renderer.mode==='webgl'){const gl=c.getContext('webgl');const data=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;}return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
  window.pixels=t=>{window.renderer.draw(t);return window.read();};
  window.audit=()=>{const first=window.pixels(0),last=window.pixels(9);const stats=Array.from({length:4},()=>({light:0,change:0,n:0}));for(let y=8;y<200;y+=16)for(let x=8;x<320;x+=16){const region=(x>=160?1:0)+(y>=100?2:0),i=(y*320+x)*4;let light=0,change=0;for(let k=0;k<3;k++){light+=first[i+k];change+=Math.abs(last[i+k]-first[i+k]);}stats[region].light+=light;stats[region].change+=change;stats[region].n++;}return {mode:window.renderer.mode,regions:stats.map(v=>({light:v.light/v.n,change:v.change/v.n}))};};
  </script></body></html>`,
                ),
              );
            });
          },
        },
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    url = server.resolvedUrls!.local[0] + "backdrop.html";
    browser = await chromium.launch({ executablePath, headless: true });
  }, 20000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  for (const gpu of [true, false])
    it(`${gpu ? "preferred GPU" : "Canvas fallback"} covers and changes all four background regions`, async () => {
      const p = await browser.newPage();
      try {
        await p.goto(url);
        await p.waitForFunction(
          () => typeof (window as any).make === "function",
        );
        const result = await p.evaluate((gpu) => {
          (window as any).make(gpu);
          return (window as any).audit();
        }, gpu);
        expect(result.mode).toBe(gpu ? "webgl" : "canvas");
        for (const region of result.regions) {
          expect(region.light).toBeGreaterThan(20);
          expect(region.change).toBeGreaterThan(15);
        }
      } finally {
        await p.close();
      }
    });
  it("restores the paused frame without an animation loop or another draw", async () => {
    const p = await browser.newPage();
    try {
      await p.goto(url);
      await p.waitForFunction(() => typeof (window as any).make === "function");
      await p.evaluate(() => {
        (window as any).make(true);
        (window as any).pixels(9);
        const c = (window as any).art,
          gl = c.getContext("webgl"),
          ext = gl.getExtension("WEBGL_lose_context");
        (window as any).lossExtension = ext;
        (window as any).restored = false;
        c.addEventListener("webglcontextrestored", () => {
          (window as any).restoredPixels = Array.from((window as any).read());
          (window as any).restored = true;
        });
        ext.loseContext();
      });
      await p.waitForFunction(() =>
        (window as any).art.getContext("webgl").isContextLost(),
      );
      await p.evaluate(
        () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              (window as any).lossExtension.restoreContext();
              resolve();
            }, 100),
          ),
      );
      await p.waitForFunction(() => (window as any).restored);
      const brightness = await p.evaluate(() => {
        const pixels = (window as any).restoredPixels as number[];
        return (
          pixels.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : value), 0) /
          (pixels.length / 4)
        );
      });
      expect(brightness).toBeGreaterThan(20);
    } finally {
      await p.close();
    }
  });
});

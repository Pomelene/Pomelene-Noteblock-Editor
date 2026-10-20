import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
const executablePath = [
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
describe.skipIf(!executablePath)("plain startup and readiness", () => {
  let server: ViteDevServer, browser: Browser, url: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      cacheDir: "node_modules/.vite-boot-components",
      plugins: [
        react(),
        {
          name: "boot-test",
          configureServer(s) {
            s.middlewares.use(async (req, res, next) => {
              if (!req.url?.startsWith("/boot-test.html")) return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await s.transformIndexHtml(
                  "/boot-test.html",
                  `<!doctype html><html lang="zh-CN"><body><div id="root"></div><script type="module">
    import React from 'react';import {createRoot} from 'react-dom/client';import {BootGate} from '/src/renderer/src/BootSplash.tsx';import '/src/renderer/src/studio.css';
    window.hostRequests=0;window.studio={onSnapshot:fn=>{window.hostUpdate=fn;return()=>{}},getSnapshot:()=>{window.hostRequests++;return new Promise((resolve,reject)=>{window.resolveHost=()=>resolve({generation:1,revision:1});window.failHost=()=>reject(Error('Host unavailable'));})}};
    createRoot(document.getElementById('root')).render(React.createElement(BootGate,null,React.createElement('div',{className:'studio','data-testid':'ready'},React.createElement('div',{className:'transport-bar'},React.createElement('button',{className:'transport-play playing'},'Pause')))));
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
    url = server.resolvedUrls!.local[0] + "boot-test.html";
    browser = await chromium.launch({ executablePath, headless: true });
  }, 20000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  async function setup() {
    const p = await browser.newPage({ viewport: { width: 1000, height: 650 } });
    await p.goto(url);
    await p.waitForFunction(
      () => typeof (window as any).resolveHost === "function",
    );
    return p;
  }
  it("shows a solid splash until a real snapshot arrives, then opens immediately", async () => {
    const p = await setup();
    try {
      expect(await p.getByTestId("ready").count()).toBe(0);
      expect(await p.getByRole("status").textContent()).toContain("正在打开");
      expect(
        await p
          .getByLabel("Pomelene 启动界面")
          .evaluate((el) => getComputedStyle(el).backgroundImage),
      ).toBe("none");
      await p.evaluate(() => (window as any).resolveHost());
      await p.getByTestId("ready").waitFor();
      expect(await p.getByLabel("Pomelene 启动界面").count()).toBe(0);
    } finally {
      await p.close();
    }
  });
  it("exposes failure and retry without leaving a blank or forever-loading screen", async () => {
    const p = await setup();
    try {
      await p.evaluate(() => (window as any).failHost());
      await p.getByRole("alert").waitFor();
      expect(await p.getByRole("alert").textContent()).toContain(
        "Host unavailable",
      );
      await p.getByRole("button", { name: "重新尝试", exact: true }).click();
      await p.waitForFunction(() => (window as any).hostRequests === 2);
      // The host request starts before React commits the cleared error state.
      await p.getByRole("alert").waitFor({ state: "hidden" });
      expect(await p.getByRole("alert").count()).toBe(0);
      await p.evaluate(() => (window as any).resolveHost());
      await p.getByTestId("ready").waitFor();
    } finally {
      await p.close();
    }
  });
  it("recovers when a host snapshot is broadcast after the initial request failed", async () => {
    const p = await setup();
    try {
      await p.evaluate(() => (window as any).failHost());
      await p.getByRole("alert").waitFor();
      await p.evaluate(() =>
        (window as any).hostUpdate({ generation: 2, revision: 1 }),
      );
      await p.getByTestId("ready").waitFor();
      expect(await p.getByRole("alert").count()).toBe(0);
    } finally {
      await p.close();
    }
  });
});

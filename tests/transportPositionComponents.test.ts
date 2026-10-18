import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

const executablePath = [
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

describe.skipIf(!executablePath)("transport position layout", () => {
  let server: ViteDevServer, browser: Browser, url: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      cacheDir: "node_modules/.vite-transport-position",
      plugins: [
        react(),
        {
          name: "transport-position-harness",
          configureServer(s) {
            s.middlewares.use(async (req, res, next) => {
              if (req.url !== "/transport-position.html") return next();
              const html = await s.transformIndexHtml(
                req.url,
                `<!doctype html><html><body><div id="root"></div><script type="module">
              import React from 'react'; import {createRoot} from 'react-dom/client';
              import {TransportPosition} from '/src/renderer/src/TransportPosition.tsx';
              import '/src/renderer/src/studio.css';
              const root=createRoot(document.getElementById('root'));
              window.setPosition=(tick,meter='4/4')=>root.render(React.createElement('header',{className:'transport-bar'},React.createElement(TransportPosition,{tick,meter}),React.createElement('button',{id:'neighbor'},'Save')));
              window.setPosition(0);
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
    url = server.resolvedUrls!.local[0] + "transport-position.html";
    browser = await chromium.launch({ executablePath, headless: true });
  }, 20000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it.each([1400, 1000])(
    "keeps fields, separators, labels and neighbor anchored at viewport %s",
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 250 } });
      try {
        await page.goto(url);
        await page.locator(".transport-position").waitFor();
        const geometry = () =>
          page
            .locator(
              ".transport-position, .transport-position-value, .transport-position-label, .transport-position-separator, #neighbor",
            )
            .evaluateAll((elements) =>
              elements.map((el) => {
                const { x, y, width, height } = el.getBoundingClientRect();
                return { x, y, width, height };
              }),
            );
        const original = await geometry();
        for (const [tick, meter] of [
          [0.09, "4/4"],
          [0.99, "4/4"],
          [1, "4/4"],
          [3.1, "4/4"],
          [15.99, "4/4"],
          [16, "4/4"],
          [15968, "4/4"],
          [15984, "4/4"],
          [1_048_576, "1/16"],
          [11.99, "6/8"],
          [7.99, "2/2"],
        ] as const) {
          await page.evaluate(
            ([tick, meter]) => (window as any).setPosition(tick, meter),
            [tick, meter],
          );
          await page.waitForFunction(
            ([tick]) =>
              document
                .querySelector(".transport-position")
                ?.getAttribute("data-tick") === String(tick),
            [tick],
          );
          expect(await geometry()).toEqual(original);
        }
        expect(
          await page.locator(".transport-position-value").allTextContents(),
        ).toEqual(["001", "01", "799"]);
        const counter = await page.locator(".transport-position").boundingBox();
        expect(counter!.x + counter!.width).toBeLessThan(width);
        expect(
          await page
            .locator(".transport-position-value")
            .evaluateAll((elements) =>
              elements.every((el) => el.scrollWidth <= el.clientWidth),
            ),
        ).toBe(true);
      } finally {
        await page.close();
      }
    },
  );
});

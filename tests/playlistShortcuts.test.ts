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
const browserPath = [
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
describe.skipIf(!browserPath)(
  "Playlist keyboard editing in a real browser",
  () => {
    let server: ViteDevServer, browser: Browser, page: Page, url: string;
    beforeAll(async () => {
      server = await createServer({
        configFile: false,
        cacheDir: "node_modules/.vite-playlist-shortcuts",
        optimizeDeps: {
          include: ["react", "react-dom/client", "lucide-react"],
        },
        plugins: [
          react(),
          {
            name: "playlist-harness",
            configureServer(server) {
              server.middlewares.use(async (request, response, next) => {
                if (request.url?.split("?")[0] !== "/playlist-test.html")
                  return next();
                const html = await server.transformIndexHtml(
                  "/playlist-test.html",
                  `<!doctype html><html><body><style>.playlist{width:1000px;height:600px}.canvas-scroll{height:400px}</style><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{Playlist}from'/src/renderer/src/Playlist.tsx';import{ShortcutHelp}from'/src/renderer/src/ShortcutHelp.tsx';
const project={id:'project',schema:2,title:'Test',bpm:120,meter:'4/4',patterns:[{id:'p',name:'Pattern',color:'#abcdef',length:16,notes:[],layers:[]}],phrases:[{id:'h',name:'Phrase',color:'#abcdef',length:8,notes:[],layers:[]}],samples:[],instruments:[],tracks:[{id:'t',name:'Track',color:'#abcdef',muted:false,solo:false,locked:false}],clips:[{id:'a',kind:'pattern',sourceId:'p',tick:8,length:16,track:0,offset:0,muted:false},{id:'b',kind:'pattern',sourceId:'p',tick:40,length:16,track:0,offset:0,muted:false}],loop:{enabled:false,start:0,end:64}};
function Harness(){const[source,setSource]=React.useState({kind:'pattern',id:'p'});const[events,setEvents]=React.useState([]);const[tick,setTick]=React.useState(0);return React.createElement(React.Fragment,null,React.createElement(Playlist,{project,source,chooseSource:setSource,run:async command=>{setEvents(old=>[...old,command]);},open:()=>{},menu:()=>{},text:()=>{},tick,seek:setTick,stopped:0,report:()=>{}}),React.createElement('output',{id:'events'},JSON.stringify(events)),React.createElement('output',{id:'tick'},tick),React.createElement('output',{id:'source'},source.kind+':'+source.id),React.createElement(ShortcutHelp));}createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>`,
                );
                response.setHeader("Content-Type", "text/html");
                response.end(html);
              });
            },
          },
        ],
        server: { host: "127.0.0.1", port: 0 },
      });
      await server.listen();
      url = server.resolvedUrls!.local[0] + "playlist-test.html";
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, 20000);
    beforeEach(async () => {
      page = await browser.newPage();
      await page.goto(url);
      await page.locator(".playlist").waitFor();
      await page.locator(".playlist").focus();
    });
    afterEach(async () => {
      await page?.close();
    });
    afterAll(async () => {
      await browser?.close();
      await server?.close();
    });
    it("Backspace toggles the chosen snap without deleting selected clips", async () => {
      await page.getByLabel("编排吸附").selectOption("third-beat");
      await page.locator(".playlist").focus();
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      expect(await page.getByLabel("编排吸附").inputValue()).toBe("none");
      expect(await page.locator("#events").textContent()).toBe("[]");
      await page.keyboard.press("Backspace");
      expect(await page.getByLabel("编排吸附").inputValue()).toBe("third-beat");
    });
    it("deselects and inverts selection, then emits only selected clip delete commands", async () => {
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Control+d");
      expect(await page.getByLabel("删除引用").isDisabled()).toBe(true);
      await page.keyboard.press("Shift+i");
      await page.keyboard.press("Delete");
      expect(
        JSON.parse((await page.locator("#events").textContent())!),
      ).toEqual([{ type: "clips:remove", ids: ["a", "b"] }]);
    });
    it("seeks to actual content end and changes zoom from toolbar focus", async () => {
      await page.keyboard.press("End");
      expect(await page.locator("#tick").textContent()).toBe("56");
      await page.keyboard.press("Home");
      expect(await page.locator("#tick").textContent()).toBe("0");
      await page.getByLabel("编排笔刷").click();
      await page.keyboard.press("PageUp");
      expect(
        await page.getByLabel("编排缩放", { exact: true }).inputValue(),
      ).toBe("14");
      await page.keyboard.press("Shift+1");
      expect(
        await page.getByLabel("编排缩放", { exact: true }).inputValue(),
      ).toBe("4");
    });
    it("keeps input editing safe and selects real phrase placement sources", async () => {
      await page.getByLabel("放置来源").selectOption("phrase:h");
      expect(await page.locator("#source").textContent()).toBe("phrase:h");
      await page.getByLabel("搜索快捷键").fill("复制");
      expect(await page.locator(".shortcut-help").textContent()).toContain(
        "Ctrl+C",
      );
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Delete");
      expect(await page.locator("#events").textContent()).toBe("[]");
    });
  },
);

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

// Exercise real DOM pointer capture and focus behavior; no simulated layout metrics.
describe.skipIf(!browserPath)(
  "floating editor and object menu interactions",
  () => {
    let server: ViteDevServer;
    let browser: Browser;
    let page: Page;
    let url: string;

    beforeAll(async () => {
      server = await createServer({
        configFile: false,
        plugins: [
          react(),
          {
            name: "window-test-harness",
            configureServer(testServer) {
              testServer.middlewares.use(async (request, response, next) => {
                if (request.url?.split("?")[0] !== "/window-test.html")
                  return next();
                const html = await testServer.transformIndexHtml(
                  "/window-test.html",
                  `<!doctype html><html><body>
        <div id="root"></div><script type="module">
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {WindowFrame} from '/src/renderer/src/WindowFrame.tsx';
        import {ContextMenu} from '/src/renderer/src/ContextMenu.tsx';
        function Harness(){
          const [view,setView]=React.useState({id:'one',kind:'pattern',sourceId:'source-a',x:30,y:30,w:700,h:400,state:'normal',z:1});
          const [menu,setMenu]=React.useState(null);const [events,setEvents]=React.useState([]);
          const record=value=>setEvents(old=>[...old,value]);
          return React.createElement(React.Fragment,null,
            React.createElement('button',{id:'open-menu',onClick:()=>setMenu({x:990,y:750,items:[{label:'不可用',disabled:true},{label:'确认',action:()=>record('confirmed')},{label:'',separator:true},{label:'更多',children:[{label:'子命令',action:()=>record('child')}]}]})},'打开菜单'),
            React.createElement('button',{id:'restore',onClick:()=>setView(old=>({...old,state:'normal'}))},'还原窗口'),
            React.createElement('output',{id:'events'},events.join(',')),
            React.createElement('div',{id:'workspace',style:{position:'absolute',left:40,top:80,width:900,height:600}},
              React.createElement(WindowFrame,{view,title:'测试 Pattern',active:true,onChange:change=>setView(old=>({...old,...change})),onFocus:()=>{},onClose:()=>record('close'),onPopout:()=>record('popout')},React.createElement('input',{id:'retained-value',defaultValue:'保留内容'}))),
            React.createElement(ContextMenu,{menu,onClose:()=>setMenu(null)}));
        }
        createRoot(document.getElementById('root')).render(React.createElement(Harness));
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
      url = `${server.resolvedUrls!.local[0]}window-test.html`;
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, 20000);

    beforeEach(async () => {
      page = await browser.newPage({ viewport: { width: 1040, height: 780 } });
      await page.goto(url);
      await page.getByTestId("editor-window-one").waitFor();
    });
    afterEach(async () => {
      await page?.close();
    });
    afterAll(async () => {
      await browser?.close();
      await server?.close();
    });

    it("uses captured pointer coordinates to resize and drag, then restores exact normal geometry", async () => {
      const window = page.getByTestId("editor-window-one");
      const handle = await window
        .locator('[data-resize-edge="se"]')
        .boundingBox();
      await page.mouse.move(handle!.x + 5, handle!.y + 5);
      await page.mouse.down();
      await page.mouse.move(handle!.x + 105, handle!.y + 85);
      await page.mouse.up();
      let rect = await window.boundingBox();
      expect(rect).toMatchObject({ x: 70, y: 110, width: 800, height: 480 });
      await window
        .locator(".studio-window-title")
        .dragTo(page.locator("#workspace"), {
          targetPosition: { x: 450, y: 20 },
        });
      rect = await window.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(40);
      expect(rect!.y).toBeGreaterThanOrEqual(80);
      await window.getByRole("button", { name: "最大化或还原" }).click();
      expect(await window.boundingBox()).toEqual({
        x: 40,
        y: 80,
        width: 900,
        height: 600,
      });
      await window.getByRole("button", { name: "最大化或还原" }).click();
      expect(await window.boundingBox()).toEqual(rect);
      await page.locator("#retained-value").fill("已编辑");
      await window.getByRole("button", { name: "最小化窗口" }).click();
      expect(await window.isVisible()).toBe(false);
      await page.locator("#restore").click();
      expect(await page.locator("#retained-value").inputValue()).toBe("已编辑");
      await window.getByRole("button", { name: "弹出桌面窗口" }).click();
      await window.getByRole("button", { name: "关闭窗口" }).click();
      expect(await page.locator("#events").textContent()).toBe("popout,close");
      expect(await window.boundingBox()).toEqual(rect);
    });

    it("clamps to the viewport, skips disabled rows, invokes a command and restores the opener focus", async () => {
      await page.locator("#open-menu").click();
      const menu = page.getByRole("menu", { name: "对象菜单", exact: true });
      await menu.waitFor();
      const rect = await menu.boundingBox();
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(1032);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(772);
      await page.waitForFunction(() =>
        document.activeElement?.textContent?.includes("确认"),
      );
      await page.keyboard.press("Enter");
      await menu.waitFor({ state: "detached" });
      expect(await page.locator("#events").textContent()).toBe("confirmed");
      expect(
        await page
          .locator("#open-menu")
          .evaluate((element) => element === document.activeElement),
      ).toBe(true);
    });

    it("supports submenu arrows, disabled no-op, outside closing and Escape focus restoration", async () => {
      await page.locator("#open-menu").click();
      await page
        .getByRole("menuitem", { name: "不可用" })
        .dispatchEvent("click");
      expect(await page.getByRole("menu").count()).toBe(1);
      expect(await page.locator("#events").textContent()).toBe("");
      await page.keyboard.press("End");
      await page.keyboard.press("ArrowRight");
      await page.getByRole("menuitem", { name: "子命令" }).waitFor();
      await page.waitForFunction(() =>
        document.activeElement?.textContent?.includes("子命令"),
      );
      await page.keyboard.press("ArrowLeft");
      expect(await page.getByRole("menu").count()).toBe(1);
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() =>
        document.activeElement?.textContent?.includes("子命令"),
      );
      await page.keyboard.press("Enter");
      expect(await page.locator("#events").textContent()).toBe("child");
      await page.locator("#open-menu").click();
      await page.keyboard.press("Escape");
      expect(await page.getByRole("menu").count()).toBe(0);
      expect(
        await page
          .locator("#open-menu")
          .evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await page.locator("#open-menu").click();
      await page.mouse.click(10, 740);
      expect(await page.getByRole("menu").count()).toBe(0);
      expect(
        await page
          .locator("#open-menu")
          .evaluate((element) => element === document.activeElement),
      ).toBe(true);
    });
  },
);

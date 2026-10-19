import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AudioSignal,
  Command,
  FileAction,
  Note,
  TransportState,
  EditorKind,
  DockedEditor,
} from "../shared/model";
import { Session } from "../shared/session";
import { ProjectFiles } from "./files";
import { ImportBroker } from "./importBroker";

const here = dirname(fileURLToPath(import.meta.url)),
  rendererFile = resolve(here, "../renderer/index.html"),
  preload = resolve(here, "../preload/index.cjs");
const session = new Session(),
  windows = new Set<BrowserWindow>(),
  editors = new Set<BrowserWindow>();
const editorSources = new Map<
  BrowserWindow,
  { kind: EditorKind; id: string }
>();
const imports = new ImportBroker();
let main: BrowserWindow | undefined,
  allowClose = false,
  closing = false;
let audioOwner:
  | { window: BrowserWindow; owner: string; state?: TransportState }
  | undefined;
const files = new ProjectFiles({
  session,
  getWindow: () => BrowserWindow.getFocusedWindow() ?? main,
  chooseImport: (summary, owner) => {
    const win = owner ?? main;
    if (!win || win.isDestroyed()) return Promise.resolve("cancel");
    return imports.request(win.id, summary, (prompt) => {
      if (!win.isDestroyed())
        win.webContents.send("studio:importPrompt", prompt);
    });
  },
  onReplace: () => {
    for (const win of editors) win.destroy();
    editors.clear();
    broadcast("studio:audio", { type: "control", command: "stop" });
  },
});
function broadcast(channel: string, value: unknown): void {
  for (const win of windows)
    if (!win.isDestroyed()) win.webContents.send(channel, value);
}
function update(): void {
  const snapshot = session.snapshot();
  broadcast("studio:snapshot", snapshot);
  if (main && !main.isDestroyed())
    main.setTitle(
      `${snapshot.document.dirty ? "● " : ""}${snapshot.project.title} — Pomelene Noteblock Editor`,
    );
}
function trusted(event: IpcMainInvokeEvent): void {
  const win = BrowserWindow.fromWebContents(event.sender),
    frame = event.senderFrame;
  if (!win || !windows.has(win) || !frame || frame !== event.sender.mainFrame)
    throw new Error("不受信任的窗口来源");
  const url = new URL(frame.url),
    dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) {
    if (url.origin !== new URL(dev).origin)
      throw new Error("不受信任的页面来源");
  } else if (
    url.protocol !== "file:" ||
    resolve(fileURLToPath(url)) !== rendererFile
  )
    throw new Error("不受信任的页面来源");
}
function current(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("请求无效");
  const object = payload as Record<string, unknown>;
  if (object.generation !== session.documentGeneration)
    throw new Error("工程已切换，请使用当前工程视图");
  return object;
}
function createWindow(kind?: EditorKind, id?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: kind ? 1000 : 1480,
    height: kind ? 700 : 900,
    minWidth: kind ? 640 : 1000,
    minHeight: kind ? 400 : 640,
    show: false,
    backgroundColor: "#171d1b",
    title: "Pomelene Noteblock Editor",
    icon: join(here, "../renderer/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  windows.add(win);
  if (kind && id) {
    editors.add(win);
    editorSources.set(win, { kind, id });
  }
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  win.once("ready-to-show", () => {
    if (!process.env.NBE_SMOKE_TEST) win.show();
    if (audioOwner?.state)
      win.webContents.send("studio:audio", {
        type: "state",
        owner: audioOwner.owner,
        state: audioOwner.state,
      });
  });
  win.on("closed", () => {
    imports.cancelFor(win.id);
    windows.delete(win);
    editors.delete(win);
    editorSources.delete(win);
    if (audioOwner?.window === win) {
      const owner = audioOwner.owner;
      audioOwner = undefined;
      broadcast("studio:audio", { type: "release", owner });
    }
  });
  win.webContents.on("render-process-gone", () => imports.cancelFor(win.id));
  win.webContents.on("did-start-loading", () => imports.cancelFor(win.id));
  const query: Record<string, string> =
    kind && id ? { kind, id, view: crypto.randomUUID() } : {};
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) {
    const url = new URL(dev);
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    void win.loadURL(url.href);
  } else void win.loadFile(rendererFile, { query });
  return win;
}
function validNotes(value: unknown): value is Omit<Note, "id">[] {
  if (!Array.isArray(value) || value.length > 10000) return false;
  const number = (v: unknown, min: number, max: number, integer = true) =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= min &&
    v <= max &&
    (!integer || Number.isInteger(v));
  return value.every(
    (n) =>
      n &&
      typeof n === "object" &&
      number(n.tick, 0, 1_048_576, false) &&
      number(n.layer, 0, 4095) &&
      number(n.pitch, 0, 127) &&
      number(n.instrument, 0, 255) &&
      number(n.velocity, 0, 100) &&
      (n.panning === undefined || number(n.panning, 0, 200)) &&
      (n.finePitch === undefined || number(n.finePitch, -32768, 32767)),
  );
}
function validAudio(signal: unknown): signal is AudioSignal {
  if (!signal || typeof signal !== "object") return false;
  const s = signal as Record<string, unknown>,
    owner =
      typeof s.owner === "string" &&
      s.owner.length > 0 &&
      s.owner.length <= 128;
  if (s.type === "claim") return owner;
  if (s.type === "control")
    return (
      ["pause", "stop", "play", "seek"].includes(s.command as string) &&
      (s.tick === undefined ||
        (typeof s.tick === "number" &&
          Number.isFinite(s.tick) &&
          s.tick >= 0 &&
          s.tick <= 1_048_576))
    );
  if (s.type === "state" && owner && s.state && typeof s.state === "object") {
    const state = s.state as Record<string, unknown>;
    return (
      ["stopped", "loading", "playing", "paused"].includes(
        state.status as string,
      ) &&
      typeof state.tick === "number" &&
      Number.isFinite(state.tick) &&
      state.tick >= 0 &&
      state.tick <= 1_048_576 &&
      typeof state.scope === "string" &&
      state.scope.length <= 256 &&
      (state.error === undefined ||
        (typeof state.error === "string" && state.error.length <= 4096))
    );
  }
  return false;
}
function handle(
  channel: string,
  action: (event: IpcMainInvokeEvent, payload: unknown) => unknown,
): void {
  ipcMain.handle(channel, (event, payload) => {
    trusted(event);
    return action(event, payload);
  });
}
async function doFile(action: FileAction): Promise<void> {
  try {
    const result = await files.action(action);
    update();
    if (result.warnings.length)
      await dialog.showMessageBox(main!, {
        type: "info",
        message: result.warnings.join("\n"),
        buttons: ["确定"],
      });
  } catch (error) {
    await dialog.showMessageBox(main!, {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      buttons: ["确定"],
    });
  }
}
app.whenReady().then(() => {
  handle("studio:importChoice", (event, payload) => {
    if (!payload || typeof payload !== "object")
      throw new Error("导入选项无效");
    const p = payload as Record<string, unknown>;
    if (
      typeof p.id !== "string" ||
      !["smart", "original", "cancel"].includes(p.mode as string)
    )
      throw new Error("导入选项无效");
    imports.respond(
      BrowserWindow.fromWebContents(event.sender)!.id,
      p.id,
      p.mode as "smart" | "original" | "cancel",
    );
  });
  handle("studio:snapshot", () => session.snapshot());
  handle("studio:dispatch", (_event, payload) => {
    if (files.isBusy) throw new Error("文件操作进行中，请稍后重试");
    const p = current(payload);
    if (
      !p.command ||
      typeof p.command !== "object" ||
      JSON.stringify(p.command).length > 4 * 1024 * 1024
    )
      throw new Error("命令无效");
    const result = session.dispatch(p.command as Command);
    update();
    return result;
  });
  handle("studio:file", async (_event, payload) => {
    const p = current(payload);
    if (
      ![
        "new",
        "open",
        "save",
        "saveAs",
        "exportNbs",
        "exportInstruments",
        "importSample",
        "importPhrase",
        "importInstruments",
      ].includes(p.action as string)
    )
      throw new Error("文件操作无效");
    const result = await files.action(p.action as FileAction);
    update();
    return result;
  });
  handle("studio:openEditor", (_event, payload) => {
    const p = current(payload),
      project = session.snapshot().project;
    if (
      !["pattern", "phrase", "sample", "playlist"].includes(p.kind as string) ||
      typeof p.id !== "string" ||
      !(p.kind === "playlist"
        ? p.id === "song"
        : (p.kind === "pattern"
            ? project.patterns
            : p.kind === "phrase"
              ? (project.phrases ?? [])
              : project.samples
          ).some((s) => s.id === p.id))
    )
      throw new Error("编辑对象不存在");
    createWindow(p.kind as EditorKind, p.id);
  });
  handle("studio:controlWindow", (event, payload) => {
    const p = current(payload);
    const win = BrowserWindow.fromWebContents(event.sender)!;
    if (p.action === "maximize") {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else if (p.action === "minimize") win.minimize();
    else throw new Error("窗口操作无效");
  });
  handle("studio:dockEditor", (event, payload) => {
    current(payload);
    const win = BrowserWindow.fromWebContents(event.sender)!;
    const source = editorSources.get(win);
    if (!source || !main || main.isDestroyed())
      throw new Error("没有可停靠的编辑窗口");
    const dock: DockedEditor = {
      ...source,
      generation: session.documentGeneration,
      transport: audioOwner?.window === win ? audioOwner.state : undefined,
    };
    // Closing releases the former audio owner before the main renderer resumes it.
    win.close();
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
    main.webContents.send("studio:dockEditor", dock);
  });
  handle("studio:audio", (event, payload) => {
    const p = current(payload);
    if (!validAudio(p.signal)) throw new Error("播放信号无效");
    const signal = p.signal as AudioSignal,
      win = BrowserWindow.fromWebContents(event.sender)!;
    if (signal.type === "claim")
      audioOwner = { window: win, owner: signal.owner };
    else if (signal.type === "state") {
      if (audioOwner?.window !== win || audioOwner.owner !== signal.owner)
        return;
      audioOwner.state = signal.state;
    }
    broadcast("studio:audio", signal);
  });
  handle("studio:clipboard:read", async () => {
    const text = await clipboard.readText();
    if (text.length > 2 * 1024 * 1024) return [];
    try {
      const parsed = JSON.parse(text);
      return parsed.format === "note-block-notes" && validNotes(parsed.notes)
        ? parsed.notes
        : [];
    } catch {
      return [];
    }
  });
  handle("studio:clipboard:write", async (_event, payload) => {
    if (!validNotes(payload)) throw new Error("音符剪贴板无效");
    const text = JSON.stringify({ format: "note-block-notes", notes: payload });
    if (text.length > 2 * 1024 * 1024) throw new Error("音符剪贴板过大");
    await clipboard.writeText(text);
  });
  main = createWindow();
  main.on("close", (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void (async () => {
      if (imports.cancelPending())
        await new Promise<void>((resolve) => setImmediate(resolve));
      return files.confirmClose();
    })()
      .then((ok) => {
        if (ok) {
          allowClose = true;
          for (const win of editors) win.destroy();
          main?.close();
        }
      })
      .catch((error) =>
        dialog.showErrorBox(
          "无法关闭工程",
          error instanceof Error ? error.message : String(error),
        ),
      )
      .finally(() => {
        closing = false;
      });
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "文件",
        submenu: [
          {
            label: "新建工程",
            accelerator: "CmdOrCtrl+N",
            registerAccelerator: false,
            click: () => void doFile("new"),
          },
          {
            label: "打开…",
            accelerator: "CmdOrCtrl+O",
            registerAccelerator: false,
            click: () => void doFile("open"),
          },
          { type: "separator" },
          {
            label: "保存",
            accelerator: "CmdOrCtrl+S",
            registerAccelerator: false,
            click: () => void doFile("save"),
          },
          {
            label: "另存为…",
            accelerator: "CmdOrCtrl+Shift+S",
            registerAccelerator: false,
            click: () => void doFile("saveAs"),
          },
          { label: "导出 NBS…", click: () => void doFile("exportNbs") },
          {
            label: "导出乐器采样包…",
            click: () => void doFile("exportInstruments"),
          },
          { type: "separator" },
          {
            label: "导入 NBS 片段采样…",
            click: () => void doFile("importPhrase"),
          },
          { label: "导入音频资源…", click: () => void doFile("importSample") },
          {
            label: "导入自定义乐器…",
            click: () => void doFile("importInstruments"),
          },
          { type: "separator" },
          { role: "quit", label: "退出" },
        ],
      },
      {
        label: "视图",
        submenu: [
          { role: "togglefullscreen", label: "全屏" },
          { role: "resetZoom", label: "实际大小" },
          { role: "zoomIn", label: "放大" },
          { role: "zoomOut", label: "缩小" },
        ],
      },
    ]),
  );
  update();
});
app.on("window-all-closed", () => app.quit());

import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createDemoProject, NoteClipboard, ProjectSession } from '../shared/project'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = join(here, '../renderer/index.html')
const session = new ProjectSession(createDemoProject())
const clipboard = new NoteClipboard()
const windows = new Set<BrowserWindow>()
const editors = new Map<string, BrowserWindow>()
let mainWindow: BrowserWindow
const devURL = process.env.ELECTRON_RENDERER_URL
function authorized(event: IpcMainInvokeEvent): void {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || !windows.has(owner) || event.senderFrame !== event.sender.mainFrame) throw new Error('不允许此窗口调用编辑器')
  const url = new URL(event.senderFrame.url)
  if (devURL ? url.origin !== new URL(devURL).origin : url.href.split('?')[0] !== pathToFileURL(renderer).href) throw new Error('窗口来源无效')
}
function createWindow(patternId?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: patternId ? 1120 : 1440, height: patternId ? 760 : 940,
    minWidth: patternId ? 880 : 1080, minHeight: patternId ? 620 : 740,
    title: patternId ? 'Pattern · NoteBlock Editor' : 'NoteBlock Editor', backgroundColor: '#20262c',
    show: false, autoHideMenuBar: true,
    webPreferences: { preload: join(here, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  windows.add(win)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.on('closed', () => { windows.delete(win); if (patternId) editors.delete(patternId) })
  win.once('ready-to-show', () => { if (!process.env.NBE_SMOKE_TEST) win.show() })
  const query = patternId ? { pattern: patternId } : undefined
  if (devURL) { const url = new URL(devURL); if (patternId) url.searchParams.set('pattern', patternId); void win.loadURL(url.href) }
  else void win.loadFile(renderer, { query })
  return win
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  mainWindow = createWindow()
  mainWindow.on('closed', () => app.quit())
  ipcMain.handle('project:get', event => { authorized(event); return session.snapshot() })
  ipcMain.handle('notes:clipboard:read', event => { authorized(event); return clipboard.read() })
  ipcMain.handle('notes:clipboard:write', (event, notes: unknown) => { authorized(event); clipboard.write(notes) })
  ipcMain.handle('project:dispatch', (event, command: unknown) => {
    authorized(event)
    const snapshot = session.dispatch(command)
    for (const win of windows) if (!win.isDestroyed()) win.webContents.send('project:snapshot', snapshot)
    return snapshot
  })
  ipcMain.handle('pattern:open', (event, id: unknown) => {
    authorized(event)
    if (typeof id !== 'string' || !session.snapshot().project.patterns.some(p => p.id === id)) throw new Error('找不到这个 Pattern')
    const previous = editors.get(id)
    if (previous && !previous.isDestroyed()) { previous.restore(); previous.focus(); return }
    editors.set(id, createWindow(id))
  })
})
app.on('window-all-closed', () => app.quit())

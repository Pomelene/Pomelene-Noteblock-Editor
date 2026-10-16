import { contextBridge, ipcRenderer } from 'electron'
import type { EditorAPI } from '../shared/api'
const api: EditorAPI = {
  getSnapshot: () => ipcRenderer.invoke('project:get'),
  dispatch: command => ipcRenderer.invoke('project:dispatch', command),
  openPatternWindow: id => ipcRenderer.invoke('pattern:open', id),
  readNoteClipboard: () => ipcRenderer.invoke('notes:clipboard:read'),
  writeNoteClipboard: notes => ipcRenderer.invoke('notes:clipboard:write', notes),
  onSnapshot: listener => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: Parameters<typeof listener>[0]) => listener(snapshot)
    ipcRenderer.on('project:snapshot', handler)
    return () => ipcRenderer.removeListener('project:snapshot', handler)
  }
}
contextBridge.exposeInMainWorld('editor', api)

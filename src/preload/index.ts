import { contextBridge, ipcRenderer } from 'electron'
import type { EditorAPI } from '../shared/api'
let generation = -1
const receive = (snapshot: import('../shared/project').Snapshot) => { generation = Math.max(generation,snapshot.generation ?? 0); return snapshot }
const api: EditorAPI = {
  getSnapshot: () => ipcRenderer.invoke('project:get').then(receive),
  dispatch: command => ipcRenderer.invoke('project:dispatch', command, generation).then(receive),
  fileAction: action => ipcRenderer.invoke('file:action',action).then(result=>({...result,snapshot:receive(result.snapshot)})),
  beginPlayback: () => ipcRenderer.invoke('audio:begin'),
  stopPlayback: () => ipcRenderer.invoke('audio:stop'),
  onStopAudio: listener => { const handler=()=>listener();ipcRenderer.on('audio:stop',handler);return()=>ipcRenderer.removeListener('audio:stop',handler) },
  openPatternWindow: id => ipcRenderer.invoke('pattern:open', id),
  readNoteClipboard: () => ipcRenderer.invoke('notes:clipboard:read'),
  writeNoteClipboard: notes => ipcRenderer.invoke('notes:clipboard:write', notes),
  onSnapshot: listener => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: Parameters<typeof listener>[0]) => listener(receive(snapshot))
    ipcRenderer.on('project:snapshot', handler)
    return () => ipcRenderer.removeListener('project:snapshot', handler)
  }
}
contextBridge.exposeInMainWorld('editor', api)

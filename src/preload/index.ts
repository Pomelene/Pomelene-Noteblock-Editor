import { contextBridge, ipcRenderer } from "electron";
import type {
  AudioSignal,
  Command,
  FileAction,
  Note,
  Snapshot,
  StudioAPI,
} from "../shared/model";

let generation: number | undefined;
const capture = (snapshot: Snapshot) => {
  generation = Math.max(generation ?? -1, snapshot.generation);
  return snapshot;
};
const subscribe = <T>(channel: string, listener: (value: T) => void) => {
  const wrapped = (_event: unknown, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
};
const api: StudioAPI = {
  getSnapshot: async () => capture(await ipcRenderer.invoke("studio:snapshot")),
  dispatch: async (command: Command, originGeneration?: number) =>
    capture(
      await ipcRenderer.invoke("studio:dispatch", {
        generation: originGeneration ?? generation,
        command,
      }),
    ),
  onSnapshot: (fn) =>
    subscribe<Snapshot>("studio:snapshot", (s) => fn(capture(s))),
  file: async (action: FileAction) => {
    const result = await ipcRenderer.invoke("studio:file", {
      generation,
      action,
    });
    capture(result.snapshot);
    return result;
  },
  openEditor: async (kind, id) => {
    await ipcRenderer.invoke("studio:openEditor", { generation, kind, id });
  },
  audioSignal: async (signal: AudioSignal) => {
    await ipcRenderer.invoke("studio:audio", { generation, signal });
  },
  onAudioSignal: (fn) => subscribe<AudioSignal>("studio:audio", fn),
  readClipboard: () => ipcRenderer.invoke("studio:clipboard:read"),
  writeClipboard: async (notes: Omit<Note, "id">[]) => {
    await ipcRenderer.invoke("studio:clipboard:write", notes);
  },
};
contextBridge.exposeInMainWorld("studio", api);

import type { Command, Note, Snapshot } from './project'
export interface EditorAPI {
  fileAction(action: 'new' | 'open' | 'save' | 'saveAs' | 'exportNbs'): Promise<{ok: boolean; snapshot: Snapshot; warnings?: string[]}>
  beginPlayback(): Promise<void>
  stopPlayback(): Promise<void>
  onStopAudio(listener: () => void): () => void
  getSnapshot(): Promise<Snapshot>
  dispatch(command: Command): Promise<Snapshot>
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
  openPatternWindow(patternId: string): Promise<void>
  readNoteClipboard(): Promise<Omit<Note, 'id'>[]>
  writeNoteClipboard(notes: Omit<Note, 'id'>[]): Promise<void>
}

import type { Command, Note, Snapshot } from './project'
export interface EditorAPI {
  getSnapshot(): Promise<Snapshot>
  dispatch(command: Command): Promise<Snapshot>
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
  openPatternWindow(patternId: string): Promise<void>
  readNoteClipboard(): Promise<Omit<Note, 'id'>[]>
  writeNoteClipboard(notes: Omit<Note, 'id'>[]): Promise<void>
}

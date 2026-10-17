import { randomUUID } from 'node:crypto'
import { open, readFile, rename, unlink, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions, MessageBoxOptions } from 'electron'
import type { Project, Snapshot } from '../shared/project'
import { deserializeProject, serializeProject, validateProject, MAX_PROJECT_BYTES } from '../shared/project-file'

export interface FileDialogs {
  open(): Promise<string | undefined>
  save(format: 'project' | 'nbs', defaultPath: string): Promise<string | undefined>
  unsaved(): Promise<'save' | 'discard' | 'cancel'>
}
export interface FileStorage {
  read(path: string): Promise<Uint8Array>
  write(path: string, data: string | Uint8Array): Promise<void>
}
export async function atomicWrite(path: string, data: string | Uint8Array, operations = { rename }): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  let created = false
  try {
    const file = await open(temporary, 'wx'); created = true
    try { await file.writeFile(data); await file.sync() } finally { await file.close() }
    await operations.rename(temporary, path)
  } finally { if (created) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}
export function nativeFileDialogs(getWindow: () => BrowserWindow | undefined): FileDialogs {
  return {
    async open() {
      const { dialog } = await import('electron'), win = getWindow()
      const options: OpenDialogOptions = { title: '打开工程或 NBS', properties: ['openFile'], filters: [{ name: '工程 / Note Block Song', extensions: ['nbproject', 'nbs'] },{name:'所有文件',extensions:['*']}] }
      const result = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options))
      return result.canceled ? undefined : result.filePaths[0]
    },
    async save(format, defaultPath) {
      const { dialog } = await import('electron'), win = getWindow()
      const options: SaveDialogOptions = { title: format === 'project' ? '保存工程' : '导出 NBS', defaultPath, filters: [{ name: format === 'project' ? 'Note Block 工程' : 'Note Block Song', extensions: [format === 'project' ? 'nbproject' : 'nbs'] }] }
      const result = await (win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options))
      return result.canceled ? undefined : result.filePath
    },
    async unsaved() {
      const { dialog } = await import('electron'), win = getWindow()
      const options: MessageBoxOptions = { type: 'question', message: '是否保存当前工程的更改？', buttons: ['保存', '不保存', '取消'], defaultId: 0, cancelId: 2, noLink: true }
      const result = await (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
      return (['save', 'discard', 'cancel'] as const)[result.response] ?? 'cancel'
    }
  }
}
interface Options {
  getSnapshot(): Snapshot
  replaceProject(project: Project): unknown
  getWindow?: () => BrowserWindow | undefined
  dialogs?: FileDialogs
  storage?: FileStorage
  codec?: { decodeNbs(bytes: Uint8Array): Project; encodeNbs(project: Project): Uint8Array }
}
export class ProjectFiles {
  private path?: string
  private format: 'project' | 'nbs' | null = null
  private baseline: string | null
  private busy = false
  private dialogs: FileDialogs
  private storage: FileStorage
  constructor(private options: Options) {
    this.baseline = serializeProject(options.getSnapshot().project)
    this.dialogs = options.dialogs ?? nativeFileDialogs(options.getWindow ?? (() => undefined))
    this.storage = options.storage ?? { read: async path => { if ((await stat(path)).size > MAX_PROJECT_BYTES) throw new Error('文件超过 64 MB 限制'); return readFile(path) }, write: atomicWrite }
  }
  get document(): NonNullable<Snapshot['document']> {
    return { ...(this.path ? { path: this.path } : {}), dirty: this.baseline !== serializeProject(this.options.getSnapshot().project), format: this.format }
  }
  private async run(action: () => Promise<boolean>): Promise<boolean> {
    if (this.busy) return false
    this.busy = true
    try { return await action() } finally { this.busy = false }
  }
  private async mayReplace(): Promise<boolean> {
    if (!this.document.dirty) return true
    const revision = this.options.getSnapshot().revision
    const choice = await this.dialogs.unsaved()
    if (this.options.getSnapshot().revision !== revision) return false
    return choice === 'discard' || (choice === 'save' && await this.writeProject(false) && !this.document.dirty)
  }
  newProject(): Promise<boolean> { return this.run(async () => {
    if (!await this.mayReplace()) return false
    const project: Project = { title: '未命名工程', bpm: 120, meter: '4/4', patterns: [{ id: randomUUID(), name: 'Pattern 1', length: 32, notes: [] }], clips: [] }
    this.options.replaceProject(project); this.path = undefined; this.format = null; this.baseline = serializeProject(project)
    return true
  }) }
  open(): Promise<boolean> { return this.run(async () => {
    const path = await this.dialogs.open()
    if (!path) return false
    const bytes = await this.storage.read(path)
    if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error('文件超过 64 MB 限制')
    let project: Project, isNbs=false
    let text:string|undefined
    try { text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);project=deserializeProject(text) }
    catch(projectError){
      if(text&&!text.includes('\0')&&/^\s*\{/.test(text))throw projectError
      if(!this.options.codec)throw projectError
      project=validateProject(this.options.codec.decodeNbs(bytes));isNbs=true
    }
    serializeProject(project)
    if (!await this.mayReplace()) return false
    this.options.replaceProject(project); this.path = isNbs ? undefined : path; this.format = isNbs ? 'nbs' : 'project'; this.baseline = isNbs ? null : serializeProject(project)
    return true
  }) }
  save(): Promise<boolean> { return this.run(() => this.writeProject(false)) }
  confirmClose(): Promise<boolean> { return this.run(() => this.mayReplace()) }
  saveAs(): Promise<boolean> { return this.run(() => this.writeProject(true)) }
  private suggested(extension: string): string { return this.options.getSnapshot().project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100).replace(/[. ]+$/, '') + extension }
  private async writeProject(force: boolean): Promise<boolean> {
    let path = !force ? this.path : undefined
    if (!path) path = await this.dialogs.save('project', this.path ?? this.suggested('.nbproject'))
    if (!path) return false
    const text = serializeProject(this.options.getSnapshot().project)
    await this.storage.write(path, text)
    this.path = path; this.format = 'project'; this.baseline = text
    return true
  }
  exportNbs(): Promise<boolean> { return this.run(async () => {
    if (!this.options.codec) throw new Error('NBS 编解码器不可用')
    let path = await this.dialogs.save('nbs', this.suggested('.nbs'))
    if (!path) return false
    await this.storage.write(path, this.options.codec.encodeNbs(this.options.getSnapshot().project))
    return true
  }) }
}

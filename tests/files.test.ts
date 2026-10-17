import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectSession, createDemoProject } from '../src/shared/project'
import { ProjectFiles, atomicWrite, type FileDialogs } from '../src/main/files'
import { serializeProject } from '../src/shared/project-file'

it('preserves original bytes when atomic rename fails and removes temporary data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nb-files-'))
  try {
    const path = join(dir, 'song.nbproject')
    await writeFile(path, 'original')
    await expect(atomicWrite(path, 'replacement', { rename: async () => { throw new Error('locked') } })).rejects.toThrow('locked')
    expect(await readFile(path, 'utf8')).toBe('original')
    expect(await readdir(dir)).toEqual(['song.nbproject'])
  } finally { await rm(dir, { recursive: true, force: true }) }
})
it('keeps current document when saving from the unsaved prompt is canceled', async () => {
  const s = new ProjectSession(createDemoProject())
  const dialogs: FileDialogs = { open: async () => undefined, save: async () => undefined, unsaved: async () => 'save' }
  const files = new ProjectFiles({ getSnapshot: () => s.snapshot(), replaceProject: p => s.replace(p), dialogs })
  s.dispatch({ type: 'set-title', title: 'Changed' })
  expect(files.document.dirty).toBe(true)
  expect(await files.newProject()).toBe(false)
  expect(s.snapshot().project.title).toBe('Changed')
  expect(files.document.dirty).toBe(true)
})
it('imports NBS as unsaved project and never saves over its source', async () => {
  const s = new ProjectSession(createDemoProject()), writes: string[] = []
  const files = new ProjectFiles({ getSnapshot: () => s.snapshot(), replaceProject: p => s.replace(p),
    dialogs: { open: async () => 'source.nbs', save: async () => 'saved.nbproject', unsaved: async () => 'discard' },
    storage: { read: async () => new Uint8Array(), write: async path => { writes.push(path) } },
    codec: { decodeNbs: () => createDemoProject(), encodeNbs: () => new Uint8Array() } })
  expect(await files.open()).toBe(true)
  expect(files.document).toEqual({ dirty: true, format: 'nbs' })
  expect(await files.save()).toBe(true)
  expect(writes).toEqual(['saved.nbproject'])
  expect(files.document.dirty).toBe(false)
  s.dispatch({ type: 'set-title', title: 'Changed' })
  expect(files.document.dirty).toBe(true)
  s.dispatch({ type: 'undo' })
  expect(files.document.dirty).toBe(false)
})
it('failed saves and malformed opens leave current project and document state intact', async () => {
  const s = new ProjectSession(createDemoProject())
  const files = new ProjectFiles({ getSnapshot: () => s.snapshot(), replaceProject: p => s.replace(p),
    dialogs: { open: async () => 'corrupt.nbproject', save: async () => 'saved.nbproject', unsaved: async () => 'save' },
    storage: { read: async () => new TextEncoder().encode('{'), write: async () => { throw new Error('disk full') } } })
  s.dispatch({ type: 'set-title', title: 'Unsaved' })
  const before = s.snapshot(), document = files.document
  await expect(files.newProject()).rejects.toThrow('disk full')
  await expect(files.open()).rejects.toThrow()
  expect(s.snapshot()).toEqual(before)
  expect(files.document).toEqual(document)
})
it('includes edits made while the open dialog is displayed in the unsaved check', async () => {
  const s = new ProjectSession(createDemoProject())
  const files = new ProjectFiles({ getSnapshot: () => s.snapshot(), replaceProject: p => s.replace(p),
    dialogs: { open: async () => { s.dispatch({ type: 'set-title', title: 'New edit' }); return 'other.nbproject' }, save: async () => undefined, unsaved: async () => 'cancel' },
    storage: { read: async () => new TextEncoder().encode(serializeProject(createDemoProject())), write: async () => {} } })
  expect(await files.open()).toBe(false)
  expect(s.snapshot().project.title).toBe('New edit')
})
it('keeps edits made while a save is writing dirty', async () => {
  const s = new ProjectSession(createDemoProject())
  const files = new ProjectFiles({ getSnapshot: () => s.snapshot(), replaceProject: p => s.replace(p),
    dialogs: { open: async () => undefined, save: async () => 'saved.nbproject', unsaved: async () => 'cancel' },
    storage: { read: async () => new Uint8Array(), write: async () => { s.dispatch({ type: 'set-title', title: 'Later edit' }) } } })
  expect(await files.save()).toBe(true)
  expect(files.document.dirty).toBe(true)
})
it('writes only the exact path selected in the native dialog',async()=>{
 const s=new ProjectSession(createDemoProject()),writes:string[]=[]
 const files=new ProjectFiles({getSnapshot:()=>s.snapshot(),replaceProject:p=>s.replace(p),dialogs:{open:async()=>undefined,save:async()=> 'chosen.txt',unsaved:async()=> 'discard'},storage:{read:async()=>new Uint8Array(),write:async path=>{writes.push(path)}}})
 await files.saveAs();expect(writes).toEqual(['chosen.txt'])
})
it('detects project content even when its confirmed filename ends in .nbs',async()=>{
 const s=new ProjectSession(createDemoProject()),text=serializeProject({...createDemoProject(),title:'JSON content'})
 const files=new ProjectFiles({getSnapshot:()=>s.snapshot(),replaceProject:p=>s.replace(p),dialogs:{open:async()=> 'project.nbs',save:async()=>undefined,unsaved:async()=> 'discard'},storage:{read:async()=>new TextEncoder().encode(text),write:async()=>{}},codec:{decodeNbs:()=>{throw new Error('Not binary')},encodeNbs:()=>new Uint8Array()}})
 expect(await files.open()).toBe(true);expect(s.snapshot().project.title).toBe('JSON content');expect(files.document.format).toBe('project')
})
it('detects NBS content even when its confirmed filename ends in .txt',async()=>{
 const s=new ProjectSession(createDemoProject())
 const files=new ProjectFiles({getSnapshot:()=>s.snapshot(),replaceProject:p=>s.replace(p),dialogs:{open:async()=> 'song.txt',save:async()=>undefined,unsaved:async()=> 'discard'},storage:{read:async()=>new Uint8Array([0,0,5]),write:async()=>{}},codec:{decodeNbs:()=>({...createDemoProject(),title:'Binary content'}),encodeNbs:()=>new Uint8Array()}})
 expect(await files.open()).toBe(true);expect(s.snapshot().project.title).toBe('Binary content');expect(files.document.format).toBe('nbs')
})
it('rejects an unpersistable import before replacing the current document',async()=>{
 const s=new ProjectSession(createDemoProject()),oversize=Object.assign(createDemoProject(),{largeMetadata:Array(70).fill('x'.repeat(1_000_000))})
 const files=new ProjectFiles({getSnapshot:()=>s.snapshot(),replaceProject:p=>s.replace(p),dialogs:{open:async()=> 'large.nbs',save:async()=>undefined,unsaved:async()=> 'discard'},storage:{read:async()=>new Uint8Array(),write:async()=>{}},codec:{decodeNbs:()=>oversize,encodeNbs:()=>new Uint8Array()}})
 const before=s.snapshot();await expect(files.open()).rejects.toThrow();expect(s.snapshot()).toEqual(before);expect(files.document.dirty).toBe(false)
})

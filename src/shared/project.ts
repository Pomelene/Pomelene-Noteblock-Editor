import { randomUUID } from 'node:crypto'
import { serializeProject } from './project-file'

export interface Note { id: string; tick: number; layer: number; pitch: number; instrument: number; velocity: number; panning?: number; finePitch?: number }
export interface Pattern { id: string; name: string; length: number; notes: Note[]; layerCount?: number }
export interface Clip { id: string; patternId: string; tick: number; track: number }
export interface Project { title: string; bpm: number; meter: string; patterns: Pattern[]; clips: Clip[] }
export interface Snapshot { revision: number; project: Project; canUndo: boolean; canRedo: boolean; document?: { path?: string; dirty: boolean; format: 'project' | 'nbs' | null }; generation?: number }
export type Command =
  | { type: 'set-tempo'; bpm: number; meter: string }
  | { type: 'add-note'; patternId: string; tick: number; layer: number; pitch: number; instrument: number; velocity: number }
  | { type: 'paste-notes'; patternId: string; notes: Omit<Note, 'id'>[] }
  | { type: 'move-notes'; patternId: string; ids: string[]; ticks: number; pitches: number; layers: number }
  | { type: 'delete-notes'; patternId: string; ids: string[] }
  | { type: 'set-note-properties'; patternId: string; ids: string[]; instrument?: number; velocity?: number; pitch?: number; panning?: number; finePitch?: number }
  | { type: 'set-title'; title: string }
  | { type: 'set-pattern-length'; patternId: string; length: number }
  | { type: 'add-layer'; patternId: string }
  | { type: 'delete-pattern'; patternId: string }
  | { type: 'move-clips'; ids: string[]; ticks: number; tracks: number }
  | { type: 'delete-clips'; ids: string[] }
  | { type: 'paste-clips'; clips: Omit<Clip,'id'>[] }
  | { type: 'duplicate-pattern' | 'rename-pattern'; patternId: string; name?: string }
  | { type: 'create-pattern'; name: string }
  | { type: 'add-clip'; patternId: string; tick: number; track: number }
  | { type: 'move-clip'; id: string; tick: number; track: number }
  | { type: 'delete-clip'; id: string }
  | { type: 'undo' | 'redo' }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的编辑命令')
  return value as Record<string, unknown>
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('编辑数值超出允许范围')
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new Error('名称或标识无效')
  return value.trim()
}
function validateNote(value: unknown): Omit<Note, 'id'> {
  const n = record(value)
  return { tick: integer(n.tick, 0, 1_048_575), layer: integer(n.layer, 0, 4095), pitch: integer(n.pitch, 21, 108), instrument: integer(n.instrument, 0, 255), velocity: integer(n.velocity, 0, 100), ...(n.panning === undefined ? {} : {panning:integer(n.panning,0,200)}), ...(n.finePitch === undefined ? {} : {finePitch:integer(n.finePitch,-32768,32767)}) }
}
export class NoteClipboard {
  private notes: Omit<Note, 'id'>[] = []
  write(value: unknown): void {
    if (!Array.isArray(value) || value.length > 100_000) throw new Error('剪贴板内容无效')
    this.notes = value.map(validateNote)
  }
  read(): Omit<Note, 'id'>[] { return structuredClone(this.notes) }
}
function assertGrid(notes: Note[]): void {
  if (notes.length > 100_000) throw new Error('当前工程阶段最多支持 100,000 个音符')
  const occupied = new Set<string>()
  for (const n of notes) {
    validateNote(n)
    const cell = `${n.tick}:${n.layer}`
    if (occupied.has(cell)) throw new Error('目标位置已有音符，请移到空格或其他图层')
    occupied.add(cell)
  }
}
function selected(pattern: Pattern, value: unknown): Note[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100_000 || value.some(id => typeof id !== 'string')) throw new Error('请选择有效的音符')
  const ids = new Set(value), notes = pattern.notes.filter(n => ids.has(n.id))
  if (notes.length !== ids.size) throw new Error('音符已经改变，请重新选择')
  return notes
}
function extend(pattern: Pattern): void {
  const end = pattern.notes.reduce((n, note) => Math.max(n, note.tick + 1), 0)
  pattern.length = Math.max(pattern.length, end)
}

export class ProjectSession {
  private project: Project
  private revision = 0
  private past: Project[] = []
  private future: Project[] = []
  private generation = 0
  constructor(project: Project) { this.project = structuredClone(project) }
  snapshot(): Snapshot { return { revision: this.revision, project: structuredClone(this.project), canUndo: this.past.length > 0, canRedo: this.future.length > 0, generation: this.generation } }
  replace(project: Project): Snapshot { serializeProject(project);this.project=structuredClone(project); this.past=[]; this.future=[]; this.revision++; this.generation++; return this.snapshot() }
  dispatch(input: unknown): Snapshot {
    const cmd = record(input), type = text(cmd.type)
    if (type === 'undo' || type === 'redo') {
      const from = type === 'undo' ? this.past : this.future, to = type === 'undo' ? this.future : this.past
      const previous = from.pop()
      if (previous) { to.push(this.project); this.project = previous; this.revision++ }
      return this.snapshot()
    }
    const draft = structuredClone(this.project)
    const getPattern = (): Pattern => {
      const p = draft.patterns.find(p => p.id === text(cmd.patternId))
      if (!p) throw new Error('找不到这个 Pattern')
      return p
    }
    switch (type) {
      case 'set-tempo': {
        if (typeof cmd.bpm !== 'number' || !Number.isFinite(cmd.bpm) || cmd.bpm < 0.15 || cmd.bpm > 9830.25) throw new Error('BPM 必须在 0.15–9830.25 之间')
        if (!/^([1-9]|[12][0-9]|3[0-2])\/(2|4|8|16)$/.test(String(cmd.meter))) throw new Error('拍号无效')
        draft.bpm = cmd.bpm; draft.meter = String(cmd.meter); break
      }
      case 'add-note': {
        const p = getPattern(); p.notes.push({ ...validateNote(cmd), id: randomUUID() }); assertGrid(p.notes); extend(p); break
      }
      case 'paste-notes': {
        const p = getPattern()
        if (!Array.isArray(cmd.notes) || !cmd.notes.length || cmd.notes.length > 100_000) throw new Error('剪贴板内容无效')
        p.notes.push(...cmd.notes.map(n => ({ ...validateNote(n), id: randomUUID() }))); assertGrid(p.notes); extend(p); break
      }
      case 'move-notes': {
        const p = getPattern(), notes = selected(p, cmd.ids)
        const ticks = integer(cmd.ticks, -1_048_575, 1_048_575), pitches = integer(cmd.pitches, -87, 87), layers = integer(cmd.layers, -4095, 4095)
        for (const n of notes) { n.tick += ticks; n.pitch += pitches; n.layer += layers }
        assertGrid(p.notes); extend(p); break
      }
      case 'delete-notes': {
        const p = getPattern(), ids = new Set(selected(p, cmd.ids).map(n => n.id)); p.notes = p.notes.filter(n => !ids.has(n.id)); break
      }
      case 'set-note-properties': {
        const p = getPattern(), ns = selected(p, cmd.ids)
        if (['instrument','velocity','pitch','panning','finePitch'].every(key=>cmd[key]===undefined)) throw new Error('未提供需要修改的属性')
        if (cmd.instrument !== undefined) { const ins = integer(cmd.instrument, 0, 255); ns.forEach(n => n.instrument = ins) }
        if (cmd.velocity !== undefined) { const velocity = integer(cmd.velocity, 0, 100); ns.forEach(n => n.velocity = velocity) }
        if (cmd.pitch !== undefined) { const pitch = integer(cmd.pitch,21,108); ns.forEach(n=>n.pitch=pitch) }
        if (cmd.panning !== undefined) { const pan = integer(cmd.panning,0,200); ns.forEach(n=>n.panning=pan) }
        if (cmd.finePitch !== undefined) { const fine = integer(cmd.finePitch,-32768,32767); ns.forEach(n=>n.finePitch=fine) }
        break
      }
      case 'duplicate-pattern': {
        if (draft.patterns.length >= 256) throw new Error('Pattern 数量已达到当前上限')
        const p = structuredClone(getPattern()); p.id = randomUUID(); p.name = `${p.name.slice(0, 90)} 副本`; p.notes.forEach(n => n.id = randomUUID()); draft.patterns.push(p); break
      }
      case 'create-pattern': {
        if (draft.patterns.length >= 256) throw new Error('Pattern 数量已达到当前上限')
        draft.patterns.push({ id: randomUUID(), name: text(cmd.name), length: 32, notes: [] }); break
      }
      case 'rename-pattern': getPattern().name = text(cmd.name); break
      case 'add-layer': {const p=getPattern(),imported=(draft as Project & {nbs?:{layers?:unknown[]}}).nbs?.layers?.length??0;p.layerCount=integer(Math.max(p.layerCount??8,imported,...p.notes.map(n=>n.layer+1))+1,1,4096);break}
      case 'set-title': draft.title=text(cmd.title); break
      case 'set-pattern-length': {
        const p=getPattern(), length=integer(cmd.length,1,1_048_576)
        if (p.notes.some(n=>n.tick>=length)) throw new Error('不能截掉已有音符，请先移动或删除末尾音符')
        p.length=length; break
      }
      case 'delete-pattern': {
        const p=getPattern(); if(draft.patterns.length===1) throw new Error('至少保留一个 Pattern')
        draft.patterns=draft.patterns.filter(x=>x.id!==p.id); draft.clips=draft.clips.filter(c=>c.patternId!==p.id); break
      }
      case 'move-clips': case 'delete-clips': {
        if(!Array.isArray(cmd.ids)||!cmd.ids.length||cmd.ids.length>10000) throw new Error('请选择乐段')
        const ids=new Set(cmd.ids), clips=draft.clips.filter(c=>ids.has(c.id)); if(clips.length!==ids.size) throw new Error('乐段已经改变')
        if(type==='delete-clips') draft.clips=draft.clips.filter(c=>!ids.has(c.id))
        else { const dt=integer(cmd.ticks,-1_048_575,1_048_575), dy=integer(cmd.tracks,-7,7); for(const c of clips){c.tick=integer(c.tick+dt,0,1_048_575);c.track=integer(c.track+dy,0,7)} }
        break
      }
      case 'paste-clips': {
        if(!Array.isArray(cmd.clips)||!cmd.clips.length||cmd.clips.length>10000||draft.clips.length+cmd.clips.length>10000) throw new Error('乐段数量超限')
        for(const value of cmd.clips){const c=record(value), id=text(c.patternId);if(!draft.patterns.some(p=>p.id===id)) throw new Error('找不到引用的 Pattern');draft.clips.push({id:randomUUID(),patternId:id,tick:integer(c.tick,0,1_048_575),track:integer(c.track,0,7)})} break
      }
      case 'add-clip': {
        if(draft.clips.length>=10000) throw new Error('乐段数量超限')
        const p = getPattern(); draft.clips.push({ id: randomUUID(), patternId: p.id, tick: integer(cmd.tick, 0, 1_048_575), track: integer(cmd.track, 0, 7) }); break
      }
      case 'move-clip': {
        const c = draft.clips.find(c => c.id === text(cmd.id)); if (!c) throw new Error('找不到这个乐段引用')
        c.tick = integer(cmd.tick, 0, 1_048_575); c.track = integer(cmd.track, 0, 7); break
      }
      case 'delete-clip': {
        const id = text(cmd.id); if (!draft.clips.some(c => c.id === id)) throw new Error('找不到这个乐段引用')
        draft.clips = draft.clips.filter(c => c.id !== id); break
      }
      default: throw new Error('不支持这个编辑命令')
    }
    serializeProject(draft)
    this.past.push(this.project); if (this.past.length > 60) this.past.shift()
    this.future = []; this.project = draft; this.revision++
    return this.snapshot()
  }
}

export function createDemoProject(): Project {
  let index = 0
  const n = (tick: number, pitch: number, layer: number, instrument: number, velocity = 80): Note => ({ id: `demo-${++index}`, tick, pitch, layer, instrument, velocity })
  const melody = [60, 64, 67, 64, 62, 65, 69, 67, 64, 67, 72, 71, 69, 67, 64, 62].map((pitch, i) => n(i * 2, pitch, 0, 0, i % 4 ? 76 : 90))
  const notes = [...melody, ...[0, 8, 16, 24].flatMap((tick, i) => [n(tick, [64, 65, 67, 65][i], 1, 0, 50), n(tick, [55, 57, 59, 57][i], 2, 5, 58), n(tick, [48, 50, 52, 53][i], 3, 1)]), ...[0, 8, 16, 24].map(t => n(t, 66, 4, 2, 78)), ...[4, 12, 20, 28].map(t => n(t, 66, 5, 3, 50)), ...Array.from({ length: 16 }, (_, i) => n(i * 2, 66, 6, 4, i % 2 ? 25 : 35))]
  return { title: '晨光 · 编曲草稿', bpm: 120, meter: '4/4', patterns: [
    { id: 'p1', name: '主旋律', length: 32, notes },
    { id: 'p2', name: '分解和弦', length: 32, notes: Array.from({ length: 16 }, (_, i) => n(i * 2, [60, 64, 67, 72, 62, 65, 69, 74][i % 8], 0, 5, 75)) },
    { id: 'p3', name: '基础鼓组', length: 16, notes: notes.filter(n => n.layer >= 4 && n.tick < 16).map(note => ({ ...note, id: randomUUID() })) }
  ], clips: [{ id: 'c1', patternId: 'p1', tick: 0, track: 0 }, { id: 'c2', patternId: 'p1', tick: 32, track: 0 }, { id: 'c3', patternId: 'p2', tick: 64, track: 1 }, { id: 'c4', patternId: 'p2', tick: 96, track: 1 }, ...[64, 80, 96, 112].map((tick, i) => ({ id: `drum-${i}`, patternId: 'p3', tick, track: 2 }))] }
}

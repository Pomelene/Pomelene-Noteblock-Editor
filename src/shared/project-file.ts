import type { Project } from './project'

export const PROJECT_FORMAT = 'note-block-project'
export const PROJECT_VERSION = 1
export const MAX_PROJECT_BYTES = 64 * 1024 * 1024
function fail(): never { throw new Error('工程文件无效、损坏或包含超出支持范围的数据') }
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail()
  return v as Record<string, unknown>
}
function str(v: unknown, max = 1_048_576): string { if (typeof v !== 'string' || v.length > max) return fail(); return v }
function int(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return fail()
  return v
}
function array(v: unknown, max: number): unknown[] { if (!Array.isArray(v) || v.length > max) return fail(); return v }
function id(v: unknown, ids?: Set<string>): string {
  const s = str(v, 100)
  if (!s.trim() || ids?.has(s)) return fail()
  ids?.add(s); return s
}
function validateJson(value: unknown, depth = 0): void {
  if (depth > 32) fail()
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'string') { str(value, 1_048_576); return }
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail(); return }
  if (Array.isArray(value)) { for (const item of array(value, 1_000_000)) validateJson(item, depth + 1); return }
  for (const [key, item] of Object.entries(object(value))) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail()
    validateJson(item, depth + 1)
  }
}
export function validateProject(value: unknown): Project {
  validateJson(value)
  const p = object(value)
  str(p.title)
  if (typeof p.bpm !== 'number' || !Number.isFinite(p.bpm) || p.bpm < 0.15 || p.bpm > 9830.25) fail()
  if (!/^([1-9]|[12][0-9]|3[0-2])\/(2|4|8|16)$/.test(str(p.meter))) fail()
  const patterns = array(p.patterns, 256), patternIds = new Set<string>()
  if (!patterns.length) fail()
  for (const raw of patterns) {
    const pattern = object(raw), noteIds = new Set<string>(), cells = new Set<string>()
    id(pattern.id, patternIds); str(pattern.name)
    const length = int(pattern.length, 1, 1_048_576)
    if(pattern.layerCount!==undefined)int(pattern.layerCount,1,4096)
    for (const rawNote of array(pattern.notes, 100_000)) {
      const n = object(rawNote)
      id(n.id, noteIds)
      const tick = int(n.tick, 0, length - 1), layer = int(n.layer, 0, 4095), cell = `${tick}:${layer}`
      if (cells.has(cell)) fail(); cells.add(cell)
      int(n.pitch, 21, 108); int(n.instrument, 0, 255); int(n.velocity, 0, 100)
      if (n.panning !== undefined) int(n.panning, 0, 200)
      if (n.finePitch !== undefined) int(n.finePitch, -32768, 32767)
    }
  }
  const clipIds = new Set<string>()
  for (const raw of array(p.clips, 10_000)) {
    const c = object(raw)
    id(c.id, clipIds)
    if (!patternIds.has(id(c.patternId))) fail()
    int(c.tick, 0, 1_048_575); int(c.track, 0, 7)
  }
  if (p.nbs !== undefined) {
    const meta = object(p.nbs)
    for (const key of ['author', 'originalAuthor', 'description', 'midiFile']) if (meta[key] !== undefined) str(meta[key])
    const bounds: Record<string, [number, number]> = { version: [0, 5], vanillaInstrumentCount: [1, 255], autosave: [0, 1], autosaveMinutes: [0, 255], timeSignature: [1, 32], loop: [0, 1], maxLoopCount: [0, 255], loopStartTick: [0, 65535] }
    for (const key of ['minutesSpent', 'leftClicks', 'rightClicks', 'notesAdded', 'notesRemoved']) bounds[key] = [-2147483648, 2147483647]
    for (const [key, [min, max]] of Object.entries(bounds)) if (meta[key] !== undefined) int(meta[key], min, max)
    if (meta.layers !== undefined) for (const raw of array(meta.layers, 4096)) {
      const layer = object(raw); str(layer.name)
      if (layer.locked !== undefined) int(layer.locked, 0, 2)
      int(layer.volume, 0, 100); int(layer.panning, 0, 200)
    }
    if (meta.customInstruments !== undefined) for (const raw of array(meta.customInstruments, 255)) {
      const custom = object(raw); str(custom.name); str(custom.file); int(custom.key, 0, 255); int(custom.pressKey, 0, 1)
    }
    if (meta.rawStrings !== undefined) for (const raw of Object.values(object(meta.rawStrings))) {
      const value = object(raw); str(value.text)
      for (const byte of array(value.bytes, 1_048_576)) int(byte, 0, 255)
    }
    if (meta.warnings !== undefined) for (const warning of array(meta.warnings, 1000)) str(warning)
  }
  // Clone the complete JSON object, preserving NBS metadata and layer extras.
  return structuredClone(value) as Project
}
export function serializeProject(project: Project): string {
  const text = JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, project: validateProject(project) }, null, 2) + '\n'
  if (new TextEncoder().encode(text).length > MAX_PROJECT_BYTES) fail()
  return text
}
export function deserializeProject(text: string): Project {
  if (new TextEncoder().encode(text).length > MAX_PROJECT_BYTES) fail()
  let data: unknown
  try { data = JSON.parse(text) } catch { return fail() }
  const envelope = object(data)
  if (envelope.format !== PROJECT_FORMAT || envelope.version !== PROJECT_VERSION) throw new Error('不支持此工程文件格式或版本')
  return validateProject(envelope.project)
}

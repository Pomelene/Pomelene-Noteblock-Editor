import { describe, expect, it } from 'vitest'
import { NoteClipboard, ProjectSession, type Project } from '../src/shared/project'

function fixture(): Project {
  return { title: 'Test', bpm: 120, meter: '4/4', patterns: [
    { id: 'p1', name: '旋律', length: 32, notes: [
      { id: 'n1', tick: 0, layer: 0, pitch: 60, instrument: 0, velocity: 80 },
      { id: 'n2', tick: 4, layer: 1, pitch: 64, instrument: 5, velocity: 60 }
    ] }
  ], clips: [{ id: 'c1', patternId: 'p1', tick: 0, track: 0 }, { id: 'c2', patternId: 'p1', tick: 32, track: 0 }] }
}

describe('authoritative project session', () => {
  it('retains a validated clipboard across window lifecycles and rejects replacement by invalid data', () => {
    const clipboard = new NoteClipboard()
    const content = [{ tick: 0, layer: 0, pitch: 21, instrument: 0, velocity: 80 }, { tick: 4, layer: 1, pitch: 108, instrument: 15, velocity: 30 }]
    clipboard.write(content)
    const fromAnotherWindow = clipboard.read(); fromAnotherWindow.length = 0
    expect(clipboard.read()).toEqual(content)
    expect(() => clipboard.write([{ ...content[0], pitch: 109 }])).toThrow()
    expect(clipboard.read()).toEqual(content)
  })
  it('preserves edits from two windows that issue commands without replacing snapshots', () => {
    const session = new ProjectSession(fixture())
    session.dispatch({ type: 'move-notes', patternId: 'p1', ids: ['n1'], ticks: 1, pitches: 2, layers: 0 })
    const next = session.dispatch({ type: 'set-note-properties', patternId: 'p1', ids: ['n2'], velocity: 42 })
    expect(next.project.patterns[0].notes).toEqual([
      { id: 'n1', tick: 1, layer: 0, pitch: 62, instrument: 0, velocity: 80 },
      { id: 'n2', tick: 4, layer: 1, pitch: 64, instrument: 5, velocity: 42 }
    ])
    expect(next.revision).toBe(2)
  })
  it('creates an independent pattern while retaining both original references', () => {
    const session = new ProjectSession(fixture())
    const duplicated = session.dispatch({ type: 'duplicate-pattern', patternId: 'p1' }).project.patterns[1]
    session.dispatch({ type: 'delete-notes', patternId: duplicated.id, ids: duplicated.notes.map(n => n.id) })
    expect(session.snapshot().project.patterns.map(p => p.notes.length)).toEqual([2, 0])
    expect(session.snapshot().project.clips.map(c => c.patternId)).toEqual(['p1', 'p1'])
  })
  it.each([
    { type: 'add-note', patternId: 'p1', tick: -1, layer: 0, pitch: 60, instrument: 0, velocity: 80 },
    { type: 'add-note', patternId: 'p1', tick: 1, layer: 0, pitch: 109, instrument: 0, velocity: 80 },
    { type: 'add-note', patternId: 'p1', tick: 1, layer: 0, pitch: 60, instrument: 256, velocity: 80 },
    { type: 'move-notes', patternId: 'p1', ids: ['n1'], ticks: 4, pitches: 0, layers: 1 },
    { type: 'set-tempo', bpm: NaN, meter: '4/4' },
    { type: 'delete-notes', patternId: 'p1', ids: ['does-not-exist'] }
  ])('rejects invalid or conflicting commands without losing data: %j', command => {
    const session = new ProjectSession(fixture()), before = session.snapshot()
    expect(() => session.dispatch(command)).toThrow()
    expect(session.snapshot()).toEqual(before)
  })
  it('undoes and redoes a whole multi-note drag as one action', () => {
    const session = new ProjectSession(fixture())
    session.dispatch({ type: 'move-notes', patternId: 'p1', ids: ['n1', 'n2'], ticks: 2, pitches: 1, layers: 0 })
    session.dispatch({ type: 'undo' })
    expect(session.snapshot().project).toEqual(fixture())
    session.dispatch({ type: 'redo' })
    expect(session.snapshot().project.patterns[0].notes.map(n => [n.tick, n.pitch])).toEqual([[2, 61], [6, 65]])
  })
  it('does not let consumers mutate authoritative state through a returned snapshot', () => {
    const session = new ProjectSession(fixture()), external = session.snapshot()
    external.project.patterns[0].notes.length = 0
    expect(session.snapshot().project.patterns[0].notes).toHaveLength(2)
  })
})

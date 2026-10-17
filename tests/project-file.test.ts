import { expect, it } from 'vitest'
import { createDemoProject } from '../src/shared/project'
import { serializeProject, deserializeProject } from '../src/shared/project-file'

it('round trips project references and optional NBS data without losing extras', () => {
  const p = { ...createDemoProject(), nbs: { author: 'Composer', layers: [{ name: 'Lead', volume: 80, panning: 100 }] } }
  p.patterns[0].notes[0].panning = 36
  p.patterns[0].notes[0].finePitch = -30
  expect(deserializeProject(serializeProject(p))).toEqual(p)
})
it('rejects corrupt JSON, unsupported versions, duplicate cells and dangling references', () => {
  expect(() => deserializeProject('{')).toThrow()
  const envelope = JSON.parse(serializeProject(createDemoProject()))
  expect(() => deserializeProject(JSON.stringify({ ...envelope, version: 99 }))).toThrow()
  envelope.project.clips[0].patternId = 'missing'
  expect(() => deserializeProject(JSON.stringify(envelope))).toThrow()
  const p = createDemoProject()
  p.patterns[0].notes.push({ ...p.patterns[0].notes[0], id: 'duplicate-cell' })
  expect(() => serializeProject(p)).toThrow()
})
it('rejects invalid note bounds instead of clipping or silently dropping data', () => {
  for (const values of [{ pitch: 109 }, { layer: 4096 }, { panning: 201 }, { finePitch: 32768 }, { tick: -1 }]) {
    const p = createDemoProject()
    Object.assign(p.patterns[0].notes[0], values)
    expect(() => serializeProject(p)).toThrow()
  }
})

import { afterEach, expect, it, vi } from 'vitest'
import { AudioEngine } from '../src/renderer/src/audio'
import type { Project } from '../src/shared/project'
const starts = vi.fn()
class Context {
  currentTime = 0
  destination = {}
  resume() { return Promise.resolve() }
  decodeAudioData() { return Promise.resolve({ duration: 1 } as AudioBuffer) }
  createBufferSource() { return { playbackRate: { value: 1 }, connect: () => ({ connect() {} }), start: starts, stop() {}, disconnect() {} } }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} } }
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
it('notifies the previous transport when stopped or replaced, while scoped stop preserves another transport', async () => {
  vi.stubGlobal('AudioContext', Context)
  const engine = new AudioEngine(), positions: (number | null)[] = []
  const project: Project = { title: '', bpm: 120, meter: '4/4', patterns: [{ id: 'p1', name: '', length: 32, notes: [] }], clips: [] }
  await engine.play(project, undefined, tick => positions.push(tick))
  engine.stop('p1')
  expect(positions.at(-1)).toBe(0)
  await engine.play(project, 'p1', () => {})
  expect(positions.at(-1)).toBe(null)
  engine.stop()
})
it('cancels a preview whose sample finishes loading after stop', async () => {
  vi.stubGlobal('AudioContext', Context); vi.stubGlobal('document', { baseURI: 'file:///app/index.html' })
  let finish!: (response: unknown) => void
  vi.stubGlobal('fetch', () => new Promise(resolve => finish = resolve))
  const engine = new AudioEngine(), pending = engine.preview(0, 66)
  await Promise.resolve()
  engine.stop()
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
  await pending
  expect(starts.mock.calls).toHaveLength(0)
})

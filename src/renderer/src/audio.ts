import type { Note, Project } from '../../shared/project'
import type { NbsProject } from '../../shared/nbs'
import { instruments, ticksPerBar } from './instruments'

export class AudioEngine {
  private context?: AudioContext
  private buffers = new Map<number, Promise<AudioBuffer>>()
  private sources = new Set<AudioBufferSourceNode>()
  private timer?: ReturnType<typeof setInterval>
  private generation = 0
  private transport?: { scope: string; position: (tick: number | null) => void }
  private get audio(): AudioContext { return this.context ??= new AudioContext() }
  private async buffer(instrument: number): Promise<AudioBuffer> {
    if(!instruments[instrument])throw new Error(`自定义音色 #${instrument} 的外部采样尚未载入；音符和定义会保留在工程及 NBS 中`)
    let buffer = this.buffers.get(instrument)
    if (!buffer) {
      buffer = fetch(new URL(`./sounds/${instruments[instrument][1]}.ogg`, document.baseURI)).then(response => {
        if (!response.ok) throw new Error('无法加载本地音色采样')
        return response.arrayBuffer()
      }).then(data => this.audio.decodeAudioData(data)).catch(error => { this.buffers.delete(instrument); throw error })
      this.buffers.set(instrument, buffer)
    }
    return buffer
  }
  private sound(note: Note, buffer: AudioBuffer, when: number): void {
    const source = this.audio.createBufferSource(), gain = this.audio.createGain()
    source.buffer = buffer; source.playbackRate.value = 2 ** ((note.pitch - 66 + (note.finePitch??0)/100) / 12)
    gain.gain.value = note.velocity / 100 * 0.55
    const panner=typeof this.audio.createStereoPanner==='function'?this.audio.createStereoPanner():undefined
    if(panner){panner.pan.value=((note.panning??100)-100)/100;source.connect(gain).connect(panner).connect(this.audio.destination)}
    else source.connect(gain).connect(this.audio.destination)
    this.sources.add(source)
    source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect();panner?.disconnect() }
    source.start(when)
  }
  async preview(instrument: number, pitch: number, velocity = 80): Promise<void> {
    const generation = this.generation
    await this.audio.resume()
    const buffer = await this.buffer(instrument)
    if (generation !== this.generation) return
    this.sound({ id: '', tick: 0, layer: 0, instrument, pitch, velocity }, buffer, this.audio.currentTime)
  }
  stop(scope?: string): void {
    if (scope !== undefined && this.transport?.scope !== scope) return
    this.transport?.position(null); this.transport = undefined
    this.generation++; clearInterval(this.timer); this.timer = undefined
    for (const source of this.sources) { try { source.stop() } catch { /* Already ended. */ } }
    this.sources.clear()
  }
  async play(project: Project, patternId: string | undefined, position: (tick: number | null) => void, startTick=0): Promise<void> {
    this.stop(); const generation = this.generation
    this.transport = { scope: patternId ?? 'song', position }
    if(typeof window!=='undefined')await window.editor.beginPlayback()
    if(this.generation!==generation)return
    await this.audio.resume()
    const pattern = project.patterns.find(p => p.id === patternId)
    const layers=(project as NbsProject).nbs?.layers
    const rawEvents = pattern ? pattern.notes : project.clips.flatMap(clip => (project.patterns.find(p => p.id === clip.patternId)?.notes ?? []).map(n => ({ ...n, tick: n.tick + clip.tick })))
    const events=rawEvents.filter(n=>n.tick>=startTick).map(n=>({...n,velocity:n.velocity*(layers?.[n.layer]?.volume??100)/100,panning:Math.max(0,Math.min(200,(n.panning??100)+(layers?.[n.layer]?.panning??100)-100))}))
    const end = pattern?.length ?? Math.max(ticksPerBar(project.meter), ...project.clips.map(clip => clip.tick + (project.patterns.find(p => p.id === clip.patternId)?.length ?? 0)))
    const buffers = new Map(await Promise.all([...new Set(events.map(n => n.instrument))].map(async id => [id, await this.buffer(id)] as const)))
    if (this.generation !== generation) return
    const seconds = 60 / project.bpm / 4, start = this.audio.currentTime + .06 - startTick*seconds
    const sorted = [...events].sort((a, b) => a.tick - b.tick); let next = 0
    const step = () => {
      const now = this.audio.currentTime
      while (next < sorted.length && start + sorted[next].tick * seconds < now + .12) {
        const note = sorted[next++]; this.sound(note, buffers.get(note.instrument)!, Math.max(now, start + note.tick * seconds))
      }
      const tick = Math.max(0, (now - start) / seconds)
      if (tick >= end) { clearInterval(this.timer); this.timer = undefined; position(null); this.transport = undefined }
      else position(tick)
    }
    this.timer = setInterval(step, 25); step()
  }
}
export const audio = new AudioEngine()

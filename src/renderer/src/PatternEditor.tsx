import { useEffect, useRef, useState } from 'react'
import { Copy, Scissors, ClipboardPaste, MousePointer2, Pencil, Layers, Piano, Play, Square, ChevronDown } from 'lucide-react'
import type { Note, Pattern, Project } from '../../shared/project'
import type { Dispatch } from './state'
import { audio } from './audio'
import { instruments, pitchName, ticksPerBar } from './instruments'

const rowHeight = 39, pianoHeight = 22, headerHeight = 26, cellWidth = 25, labelWidth = 106
export function PatternEditor({ pattern, project, dispatch, report }: { pattern: Pattern; project: Project; dispatch: Dispatch; report(message: string): void }) {
  const [mode, setMode] = useState<'layers' | 'piano'>('layers')
  const [tool, setTool] = useState<'draw' | 'select'>('draw')
  const [instrument, setInstrument] = useState(0), [pitch, setPitch] = useState(66), [velocity, setVelocity] = useState(80)
  const [selection, setSelection] = useState<string[]>([]), [cursor, setCursor] = useState(0), [playing, setPlaying] = useState<number | null>(null)
  const [ghost, setGhost] = useState<{ ticks: number; rows: number } | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null), scroll = useRef<HTMLDivElement>(null)
  const bar = ticksPerBar(project.meter), ticks = Math.max(pattern.length + bar, bar * 4)
  const height = headerHeight + (mode === 'layers' ? 8 * rowHeight : 88 * pianoHeight), width = labelWidth + ticks * cellWidth
  const notes = pattern.notes.filter(n => selection.includes(n.id))
  const rowFor = (n: Note) => mode === 'layers' ? n.layer : 108 - n.pitch
  const rh = mode === 'layers' ? rowHeight : pianoHeight
  useEffect(() => { setSelection([]); setCursor(0) }, [pattern.id])
  useEffect(() => () => { audio.stop(pattern.id) }, [pattern.id])
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = mode === 'piano' ? (108 - 72) * pianoHeight : 0 }, [mode])
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d'); if (!el || !ctx) return
    const dpr = window.devicePixelRatio || 1; el.width = width * dpr; el.height = height * dpr; ctx.scale(dpr, dpr)
    ctx.fillStyle = '#252c32'; ctx.fillRect(0, 0, width, height)
    const rows = mode === 'layers' ? 8 : 88
    for (let r = 0; r < rows; r++) {
      const y = headerHeight + r * rh, midi = 108 - r, black = [1,3,6,8,10].includes(midi % 12)
      ctx.fillStyle = mode === 'layers' ? r % 2 ? '#293138' : '#2c343b' : black ? '#272e34' : '#303940'; ctx.fillRect(labelWidth, y, width, rh - 1)
      ctx.fillStyle = mode === 'piano' ? black ? '#202c35' : '#a9b9c4' : '#20272d'; ctx.fillRect(0, y, labelWidth - 1, rh - 1)
      ctx.fillStyle = mode === 'piano' && !black ? '#263944' : '#9caab3'; ctx.font = '11px Segoe UI, Microsoft YaHei'; ctx.textBaseline = 'middle'
      ctx.fillText(mode === 'layers' ? `${String(r + 1).padStart(2, '0')}    ${['主旋律', '和声 · 高', '和声 · 低', '贝斯', '底鼓', '军鼓', '节奏', '自由层'][r]}` : pitchName(midi), 13, y + rh / 2)
    }
    ctx.fillStyle = '#20272d'; ctx.fillRect(0, 0, width, headerHeight)
    for (let tick = 0; tick <= ticks; tick++) {
      const x = labelWidth + tick * cellWidth
      ctx.strokeStyle = tick % bar === 0 ? '#58616a' : tick % 4 === 0 ? '#404a52' : '#333d45'
      ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke()
      if (tick % bar === 0) { ctx.fillStyle = '#a6b3bc'; ctx.font = '10px Segoe UI'; ctx.fillText(String(Math.floor(tick / bar) + 1).padStart(2, '0'), x + 7, 13) }
    }
    for (const n of pattern.notes) {
      const selected = selection.includes(n.id), dx = selected && ghost ? ghost.ticks : 0, dy = selected && ghost ? ghost.rows : 0
      const row = rowFor(n) + dy; if (row < 0 || row >= rows) continue
      const x = labelWidth + (n.tick + dx) * cellWidth + 2, y = headerHeight + row * rh + 3
      ctx.fillStyle = instruments[n.instrument][2]; ctx.globalAlpha = .55 + n.velocity / 225
      ctx.fillRect(x, y, cellWidth - 4, rh - 6); ctx.globalAlpha = 1
      if (selected) { ctx.strokeStyle = '#e7f7fa'; ctx.lineWidth = 2; ctx.strokeRect(x - .5, y - .5, cellWidth - 3, rh - 5); ctx.lineWidth = 1 }
      if (mode === 'layers') { ctx.fillStyle = '#13212a'; ctx.font = '9px Segoe UI'; ctx.fillText(pitchName(n.pitch), x + 1, y + 11); ctx.fillRect(x + 2, y + rh - 14, Math.max(2, (cellWidth - 8) * n.velocity / 100), 2) }
    }
    if (box) { ctx.fillStyle = '#9cc9e329'; ctx.strokeStyle = '#a5d0e9'; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.strokeRect(box.x, box.y, box.w, box.h) }
    ctx.fillStyle = '#c3d5e3'; ctx.fillRect(labelWidth + cursor * cellWidth, 0, cellWidth, 3)
    if (playing !== null) { ctx.fillStyle = '#d4de8d'; ctx.fillRect(labelWidth + playing * cellWidth, 0, 2, height) }
  }, [pattern, selection, mode, ghost, box, width, height, playing, bar, cursor])
  async function copy(cut = false) {
    if (!notes.length) return
    const first = Math.min(...notes.map(n => n.tick))
    try { await window.editor.writeNoteClipboard(notes.map(({ id: _id, ...n }) => ({ ...n, tick: n.tick - first }))) }
    catch (e) { report(`复制失败：${String(e)}`); return }
    if (cut) { await dispatch({ type: 'delete-notes', patternId: pattern.id, ids: selection }); setSelection([]) }
    report(`${cut ? '已剪切' : '已复制'} ${notes.length} 个音符；点击时间标尺选择粘贴位置`)
  }
  async function paste() {
    const clipboard = await window.editor.readNoteClipboard().catch(() => [])
    if (!clipboard.length) { report('先选择并复制音符'); return }
    const next = await dispatch({ type: 'paste-notes', patternId: pattern.id, notes: clipboard.map(n => ({ ...n, tick: n.tick + cursor })) })
    if (next) setSelection(next.project.patterns.find(p => p.id === pattern.id)!.notes.slice(-clipboard.length).map(n => n.id))
  }
  const preview = (ins: number, key: number) => void audio.preview(ins, key, velocity).catch(e => report(String(e.message)))
  return <div className="pattern-editor" data-testid="pattern-editor" tabIndex={0} onKeyDown={e => {
    if ((e.target as HTMLElement).matches('input,select')) return
    const modifier = e.ctrlKey || e.metaKey, key = e.key.toLowerCase()
    if (modifier && ['a','c','v','x','z','y'].includes(key)) {
      e.preventDefault(); e.stopPropagation()
      if (key === 'a') setSelection(pattern.notes.map(n => n.id))
      if (key === 'c' || key === 'x') void copy(key === 'x')
      if (key === 'v') void paste()
      if (key === 'z' || key === 'y') void dispatch({ type: key === 'y' || e.shiftKey ? 'redo' : 'undo' })
    }
    if (selection.length && ['Delete','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault()
      if (e.key === 'Delete' || e.key === 'Backspace') { void dispatch({ type: 'delete-notes', patternId: pattern.id, ids: selection }); setSelection([]) }
      else void dispatch({ type: 'move-notes', patternId: pattern.id, ids: selection, ticks: e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, pitches: e.key === 'ArrowUp' ? e.shiftKey ? 12 : 1 : e.key === 'ArrowDown' ? e.shiftKey ? -12 : -1 : 0, layers: 0 })
    }
  }}>
    <div className="editor-toolbar">
      <div className="segmented"><button className={mode === 'layers' ? 'active' : ''} onClick={() => setMode('layers')}><Layers size={14}/>图层</button><button className={mode === 'piano' ? 'active' : ''} onClick={() => setMode('piano')}><Piano size={14}/>钢琴卷帘</button></div>
      <span className="separator"/>
      <button className={tool === 'draw' ? 'active icon-button' : 'icon-button'} title="绘制音符" aria-label="绘制音符" onClick={() => setTool('draw')}><Pencil size={15}/></button>
      <button className={tool === 'select' ? 'active icon-button' : 'icon-button'} title="框选音符（也可按住 Shift 拖动）" aria-label="框选音符" onClick={() => setTool('select')}><MousePointer2 size={15}/></button>
      <button className="icon-button" title="复制 Ctrl+C" aria-label="复制音符" onClick={() => void copy()}><Copy size={14}/></button><button className="icon-button" title="剪切 Ctrl+X" aria-label="剪切音符" onClick={() => void copy(true)}><Scissors size={14}/></button><button className="icon-button" title="粘贴 Ctrl+V" aria-label="粘贴音符" onClick={() => void paste()}><ClipboardPaste size={14}/></button>
      <span className="toolbar-spacer"/><span className="small-label">吸附</span><span className="readout">1/16 <ChevronDown size={11}/></span>
      <button className="icon-button" aria-label="试听 Pattern" title="试听 Pattern" onClick={() => playing === null ? void audio.play(project, pattern.id, setPlaying).catch(e => report(String(e.message))) : (audio.stop(), setPlaying(null))}>{playing === null ? <Play size={15}/> : <Square size={13}/>}</button>
    </div>
    <div className="instrument-palette" data-testid="instrument-palette"><span className="palette-label">音色库 <small>原版 16</small></span><div className="instrument-list">{instruments.map(([name, _file, color], id) => <button key={id} className={instrument === id ? 'instrument selected' : 'instrument'} title={`${name} · 点击原音试听；双击应用到选区`} onClick={() => { setInstrument(id); preview(id, 66) }} onDoubleClick={() => { if (selection.length) void dispatch({ type: 'set-note-properties', patternId: pattern.id, ids: selection, instrument: id }) }}><i style={{ background: color }}/>{name}</button>)}</div></div>
    <div className="note-properties"><span>落笔音高</span><select aria-label="落笔音高" value={pitch} onChange={e => setPitch(Number(e.target.value))}>{Array.from({ length: 88 }, (_, i) => i + 21).map(p => <option key={p} value={p}>{pitchName(p)}</option>)}</select><span>力度</span><input aria-label="音符力度" type="range" min="1" max="100" value={velocity} onChange={e => setVelocity(Number(e.target.value))} onPointerUp={() => { if (notes.some(n => n.velocity !== velocity)) void dispatch({ type: 'set-note-properties', patternId: pattern.id, ids: selection, velocity }) }} onKeyUp={e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key) && notes.some(n => n.velocity !== velocity)) void dispatch({ type: 'set-note-properties', patternId: pattern.id, ids: selection, velocity }) }}/><b>{velocity}%</b><span className="toolbar-spacer"/><span>{selection.length ? `已选 ${selection.length} 个音符` : `${pattern.notes.length} 个音符`}</span><span className="subtle">{pattern.length} ticks · {pattern.length / bar} 小节</span></div>
    <div className="note-scroll" ref={scroll} onScroll={e => setScrollLeft(e.currentTarget.scrollLeft)} onContextMenu={e => e.preventDefault()}>
      <div className="note-ruler" data-testid="note-ruler" style={{ width }} onPointerDown={e => {
        const tick = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - labelWidth) / cellWidth)
        if (tick >= 0 && e.button === 0) { setCursor(tick); e.currentTarget.closest<HTMLElement>('.pattern-editor')?.focus() }
      }}><span className="ruler-heading">{mode === 'piano' ? 'PIANO ROLL' : 'LAYERS'}</span>{Array.from({ length: Math.ceil(ticks / bar) }, (_, i) => <span key={i} className="bar-number" style={{ left: labelWidth + i * bar * cellWidth }}>{String(i + 1).padStart(2,'0')}</span>)}<i style={{ left: labelWidth + cursor * cellWidth }}/></div>
      <canvas ref={canvas} style={{ width, height }} aria-label="音符网格：左键放置，右键删除，Shift 拖动框选" data-testid="note-grid" onPointerDown={e => {
        e.currentTarget.closest<HTMLElement>('.pattern-editor')?.focus()
        const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top
        const tick = Math.floor((x - labelWidth) / cellWidth), row = Math.floor((y - headerHeight) / rh)
        if (tick < 0) return
        setCursor(tick)
        if (row < 0) return
        const hit = [...pattern.notes].reverse().find(n => n.tick === tick && rowFor(n) === row)
        if (e.button === 2) { if (hit) void dispatch({ type: 'delete-notes', patternId: pattern.id, ids: [hit.id] }); return }
        if (e.button !== 0) return
        const el = e.currentTarget; el.setPointerCapture(e.pointerId)
        if ((tool === 'select' || e.shiftKey) && !hit) {
          const previous = e.ctrlKey ? selection : []; setBox({ x, y, w: 0, h: 0 })
          el.onpointermove = move => setBox({ x: Math.min(x, move.clientX - rect.left), y: Math.min(y, move.clientY - rect.top), w: Math.abs(move.clientX - rect.left - x), h: Math.abs(move.clientY - rect.top - y) })
          el.onpointerup = up => {
            const ex = up.clientX - rect.left, ey = up.clientY - rect.top
            setSelection([...new Set([...previous, ...pattern.notes.filter(n => { const nx = labelWidth + n.tick * cellWidth + cellWidth / 2, ny = headerHeight + rowFor(n) * rh + rh / 2; return nx >= Math.min(x, ex) && nx <= Math.max(x, ex) && ny >= Math.min(y, ey) && ny <= Math.max(y, ey) }).map(n => n.id)])]); setBox(null); el.onpointermove = null; el.onpointerup = null
          }; return
        }
        if (hit) {
          const ids = e.ctrlKey ? selection.includes(hit.id) ? selection.filter(id => id !== hit.id) : [...selection, hit.id] : selection.includes(hit.id) ? selection : [hit.id]
          setSelection(ids); setPitch(hit.pitch); setVelocity(hit.velocity); setInstrument(hit.instrument); preview(hit.instrument, hit.pitch)
          el.onpointermove = move => setGhost({ ticks: Math.round((move.clientX - e.clientX) / cellWidth), rows: Math.round((move.clientY - e.clientY) / rh) })
          const sx = e.clientX, sy = e.clientY
          el.onpointerup = up => {
            const dt = Math.round((up.clientX - sx) / cellWidth), dr = Math.round((up.clientY - sy) / rh)
            if (ids.length && (dt || dr)) void dispatch({ type: 'move-notes', patternId: pattern.id, ids, ticks: dt, pitches: mode === 'piano' ? -dr : 0, layers: mode === 'layers' ? dr : 0 })
            setGhost(null); el.onpointermove = null; el.onpointerup = null
          }
        } else if (tool === 'draw' && !e.shiftKey) {
          const notePitch = mode === 'piano' ? 108 - row : pitch
          const occupied = new Set(pattern.notes.filter(n => n.tick === tick).map(n => n.layer))
          const layer = mode === 'layers' ? row : Array.from({ length: 8 }, (_, i) => i).find(i => !occupied.has(i))
          if (layer === undefined) { report('这个 tick 的 8 个图层已满'); return }
          void dispatch({ type: 'add-note', patternId: pattern.id, tick, layer, pitch: notePitch, instrument, velocity }).then(next => { if (next) setSelection([next.project.patterns.find(p => p.id === pattern.id)!.notes.at(-1)!.id]) })
          preview(instrument, notePitch)
        }
      }}/>
    </div>
    <div className="velocity-lane"><span>VELOCITY</span><div>{pattern.notes.map(n => <i key={n.id} style={{ left: n.tick * cellWidth + 8 - scrollLeft, height: `${n.velocity * .32}px`, background: instruments[n.instrument][2] }}/>)}</div></div>
    <div className="keyboard">{Array.from({ length: 36 }, (_, i) => i + 48).map(midi => <button key={midi} className={`${[1,3,6,8,10].includes(midi % 12) ? 'black-key' : 'white-key'} ${midi === pitch ? 'current-key' : ''}`} title={pitchName(midi)} onPointerDown={() => { setPitch(midi); preview(instrument, midi) }}>{midi % 12 === 0 ? pitchName(midi) : ''}</button>)}<span>{instruments[instrument][0]}<small>{pitchName(pitch)} · 点击琴键试听</small></span></div>
    <footer className="editor-hint">左键放置 · 右键删除 · 拖动音符移动 · Shift + 拖动框选<span>方向键微调 · Shift + ↑↓ 八度 · Ctrl + C / V / X</span></footer>
  </div>
}

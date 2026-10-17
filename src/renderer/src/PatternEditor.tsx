import { useEffect, useRef, useState } from 'react'
import { Copy, Scissors, ClipboardPaste, MousePointer2, Pencil, Layers, Piano, Play, Square } from 'lucide-react'
import type { NbsProject } from '../../shared/nbs'
import type { Note, Pattern, Project } from '../../shared/project'
import type { Dispatch } from './state'
import { audio } from './audio'
import { instruments, pitchName, ticksPerBar } from './instruments'
import './pattern-editor.css'
const instrumentColor = (id: number) => instruments[id]?.[2] ?? '#b6a2ce'
const instrumentName = (id: number) => instruments[id]?.[0] ?? `自定义音色 #${id}（无采样）`

const rowHeight = 39, pianoHeight = 22, headerHeight = 26, labelWidth = 106
export function PatternEditor({ pattern, project, dispatch, report }: { pattern: Pattern; project: Project; dispatch: Dispatch; report(message: string): void }) {
  const [mode, setMode] = useState<'layers' | 'piano'>('layers')
  const [tool, setTool] = useState<'draw' | 'select'>('draw')
  const [instrument, setInstrument] = useState(0), [pitch, setPitch] = useState(66), [velocity, setVelocity] = useState(80)
  const [selection, setSelection] = useState<string[]>([]), [cursor, setCursor] = useState(0), [playing, setPlaying] = useState<number | null>(null)
  const [ghost, setGhost] = useState<{ ticks: number; rows: number } | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0), [scrollTop, setScrollTop] = useState(0)
  const [cellWidth, setCellWidth] = useState(25), [snapChoice, setSnapChoice] = useState(1), [extraLayers, setExtraLayers] = useState(8)
  const bar = ticksPerBar(project.meter), snap=snapChoice===-1?bar:snapChoice
  const [viewport, setViewport] = useState({ width: 800, height: 320 })
  const [clipboardReady, setClipboardReady] = useState(false)
  const [nameDraft, setNameDraft] = useState(pattern.name), [lengthDraft, setLengthDraft] = useState(String(pattern.length))
  const [velocityPreview, setVelocityPreview] = useState<{ ids: string[]; value: number } | null>(null)
  const importedLayers = (project as NbsProject).nbs?.layers
  const rows = mode === 'layers' ? Math.max(pattern.layerCount??extraLayers, importedLayers?.length ?? 0, pattern.notes.reduce((max, n) => Math.max(max, n.layer + 1), 8)) : 88
  const quantize = (tick: number) => Math.max(0, Math.floor(tick / snap) * snap)
  const refreshClipboard = () => void window.editor.readNoteClipboard().then(ns => setClipboardReady(ns.length > 0)).catch(() => setClipboardReady(false))
  const canvas = useRef<HTMLCanvasElement>(null), scroll = useRef<HTMLDivElement>(null)
  const ticks = Math.max(pattern.length + bar, bar * 4)
  const height = headerHeight + rows * (mode === 'layers' ? rowHeight : pianoHeight), width = labelWidth + ticks * cellWidth
  const selectedIds = new Set(selection)
  const notes = pattern.notes.filter(n => selectedIds.has(n.id))
  const rowFor = (n: Note) => mode === 'layers' ? n.layer : 108 - n.pitch
  const rh = mode === 'layers' ? rowHeight : pianoHeight
  useEffect(() => { setSelection([]); setCursor(0); setExtraLayers(8); if (scroll.current) { scroll.current.scrollLeft = 0; scroll.current.scrollTop = 0 } }, [pattern.id])
  useEffect(() => { setNameDraft(pattern.name); setLengthDraft(String(pattern.length)) }, [pattern.id, pattern.name, pattern.length])
  useEffect(() => { const valid = new Set(pattern.notes.map(n => n.id)); setSelection(ids => ids.filter(id => valid.has(id))) }, [pattern.notes])
  useEffect(() => {
    const el = scroll.current; if (!el) return
    const resize = () => setViewport({ width: el.clientWidth, height: el.clientHeight })
    const observer = new ResizeObserver(resize); observer.observe(el); resize(); refreshClipboard()
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => { audio.stop(pattern.id) }, [pattern.id])
  useEffect(()=>{window.addEventListener('focus',refreshClipboard);return()=>window.removeEventListener('focus',refreshClipboard)},[])
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = mode === 'piano' ? (108 - 72) * pianoHeight : 0 }, [mode])
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d'); if (!el || !ctx) return
    const dpr = window.devicePixelRatio || 1; el.width = viewport.width * dpr; el.height = viewport.height * dpr; ctx.scale(dpr, dpr); ctx.translate(-scrollLeft, -scrollTop)
    ctx.fillStyle = '#252c32'; ctx.fillRect(scrollLeft, scrollTop, viewport.width, viewport.height)
    for (let r = Math.max(0, Math.floor((scrollTop - headerHeight) / rh)); r < Math.min(rows, Math.ceil((scrollTop + viewport.height) / rh)); r++) {
      const y = headerHeight + r * rh, midi = 108 - r, black = [1,3,6,8,10].includes(midi % 12)
      ctx.fillStyle = mode === 'layers' ? r % 2 ? '#293138' : '#2c343b' : black ? '#272e34' : '#303940'; ctx.fillRect(labelWidth, y, width, rh - 1)
      ctx.fillStyle = mode === 'piano' ? black ? '#202c35' : '#a9b9c4' : '#20272d'; ctx.fillRect(0, y, labelWidth - 1, rh - 1)
      ctx.fillStyle = mode === 'piano' && !black ? '#263944' : '#9caab3'; ctx.font = '11px Segoe UI, Microsoft YaHei'; ctx.textBaseline = 'middle'
      ctx.fillText(mode === 'layers' ? `${String(r + 1).padStart(2, '0')}    ${(importedLayers?.[r]?.name || ['主旋律', '和声 · 高', '和声 · 低', '贝斯', '底鼓', '军鼓', '节奏', '自由层'][r] || '图层')}` : pitchName(midi), 13, y + rh / 2, labelWidth - 20)
    }
    ctx.fillStyle = '#20272d'; ctx.fillRect(0, 0, width, headerHeight)
    for (let tick = Math.max(0, Math.floor((scrollLeft - labelWidth) / cellWidth)); tick <= Math.min(ticks, Math.ceil((scrollLeft + viewport.width - labelWidth) / cellWidth)); tick++) {
      const x = labelWidth + tick * cellWidth
      ctx.strokeStyle = tick % bar === 0 ? '#58616a' : tick % 4 === 0 ? '#404a52' : '#333d45'
      ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke()
      if (tick % bar === 0) { ctx.fillStyle = '#a6b3bc'; ctx.font = '10px Segoe UI'; ctx.fillText(String(Math.floor(tick / bar) + 1).padStart(2, '0'), x + 7, 13) }
    }
    for (const n of pattern.notes) {
      const selected = selectedIds.has(n.id), dx = selected && ghost ? ghost.ticks : 0, dy = selected && ghost ? ghost.rows : 0
      const row = rowFor(n) + dy; if (row < 0 || row >= rows) continue
      const x = labelWidth + (n.tick + dx) * cellWidth + 2, y = headerHeight + row * rh + 3
      if (x + cellWidth < scrollLeft || x > scrollLeft + viewport.width || y + rh < scrollTop || y > scrollTop + viewport.height) continue
      ctx.fillStyle = instrumentColor(n.instrument); ctx.globalAlpha = .55 + n.velocity / 225
      ctx.fillRect(x, y, cellWidth - 4, rh - 6); ctx.globalAlpha = 1
      if (selected) { ctx.strokeStyle = '#e7f7fa'; ctx.lineWidth = 2; ctx.strokeRect(x - .5, y - .5, cellWidth - 3, rh - 5); ctx.lineWidth = 1 }
      if (mode === 'layers') { ctx.fillStyle = '#13212a'; ctx.font = '9px Segoe UI'; ctx.fillText(pitchName(n.pitch), x + 1, y + 11); ctx.fillRect(x + 2, y + rh - 14, Math.max(2, (cellWidth - 8) * n.velocity / 100), 2) }
    }
    if (box) { ctx.fillStyle = '#9cc9e329'; ctx.strokeStyle = '#a5d0e9'; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.strokeRect(box.x, box.y, box.w, box.h) }
    ctx.fillStyle = '#c3d5e3'; ctx.fillRect(labelWidth + cursor * cellWidth, 0, cellWidth, 3)
    if (playing !== null) { ctx.fillStyle = '#d4de8d'; ctx.fillRect(labelWidth + playing * cellWidth, 0, 2, height) }
    // Keep the layer / piano-key column visible while the timeline scrolls.
    ctx.fillStyle='#20272d';ctx.fillRect(scrollLeft,scrollTop,labelWidth,viewport.height)
    for(let r=Math.max(0,Math.floor((scrollTop-headerHeight)/rh));r<Math.min(rows,Math.ceil((scrollTop+viewport.height)/rh));r++){
      const y=headerHeight+r*rh,midi=108-r,black=[1,3,6,8,10].includes(midi%12)
      ctx.fillStyle=mode==='piano'?black?'#202c35':'#a9b9c4':'#20272d';ctx.fillRect(scrollLeft,y,labelWidth-1,rh-1)
      ctx.fillStyle=mode==='piano'&&!black?'#263944':'#9caab3';ctx.font='11px Segoe UI, Microsoft YaHei';ctx.textBaseline='middle'
      const name=importedLayers?.[r]?.name||['主旋律','和声 · 高','和声 · 低','贝斯','底鼓','军鼓','节奏','自由层'][r]||'图层'
      ctx.fillText(mode==='piano'?pitchName(midi):`${String(r+1).padStart(2,'0')}  ${name}`,scrollLeft+13,y+rh/2,labelWidth-20)
    }
  }, [pattern, selection, mode, ghost, box, width, height, playing, bar, cursor, viewport, scrollLeft, scrollTop, cellWidth, rows])
  async function copy(cut = false) {
    if (!notes.length) return
    const first = Math.min(...notes.map(n => n.tick))
    try { await window.editor.writeNoteClipboard(notes.map(({ id: _id, ...n }) => ({ ...n, tick: n.tick - first }))) }
    catch (e) { report(`复制失败：${String(e)}`); return }
    setClipboardReady(true)
    if (cut) { const next = await dispatch({ type: 'delete-notes', patternId: pattern.id, ids: selection }); if (!next) return; setSelection([]) }
    report(`${cut ? '已剪切' : '已复制'} ${notes.length} 个音符；点击时间标尺选择粘贴位置`)
  }
  async function paste() {
    const clipboard = await window.editor.readNoteClipboard().catch(() => [])
    if (!clipboard.length) { report('先选择并复制音符'); return }
    const next = await dispatch({ type: 'paste-notes', patternId: pattern.id, notes: clipboard.map(n => ({ ...n, tick: n.tick + cursor })) })
    if (next) setSelection(next.project.patterns.find(p => p.id === pattern.id)!.notes.slice(-clipboard.length).map(n => n.id))
  }
  const preview = (ins: number, key: number) => { if (ins >= instruments.length) { report(`${instrumentName(ins)}：音符已保留；选择原版音色后可应用到选区`); return }; void audio.preview(ins, key, velocity).catch(e => report(String(e.message))) }
  async function deleteSelection() { if (selection.length && await dispatch({ type: 'delete-notes', patternId: pattern.id, ids: selection })) setSelection([]) }
  function setProperties(properties: { pitch?: number; velocity?: number; panning?: number; finePitch?: number; instrument?: number }) {
    if (selection.length && notes.some(n => Object.entries(properties).some(([key, value]) => (n[key as keyof Note] ?? (key === 'panning' ? 100 : 0)) !== value))) void dispatch({ type: 'set-note-properties', patternId: pattern.id, ids: selection, ...properties })
  }
  const visibleBars = Array.from({ length: Math.ceil(viewport.width / (bar * cellWidth)) + 2 }, (_, i) => Math.max(0, Math.floor((scrollLeft - labelWidth) / (bar * cellWidth))) + i)
  const visibleNotes = pattern.notes.filter(n => n.tick * cellWidth >= scrollLeft - cellWidth && n.tick * cellWidth < scrollLeft + viewport.width)

  return <div className="pattern-editor" data-testid="pattern-editor" tabIndex={0} onFocus={refreshClipboard} onKeyDown={e => {
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
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Delete' || e.key === 'Backspace') { void deleteSelection() }
      else void dispatch({ type: 'move-notes', patternId: pattern.id, ids: selection, ticks: e.key === 'ArrowRight' ? snap : e.key === 'ArrowLeft' ? -snap : 0, pitches: e.key === 'ArrowUp' ? e.shiftKey ? 12 : 1 : e.key === 'ArrowDown' ? e.shiftKey ? -12 : -1 : 0, layers: 0 })
    }
  }}>
    <div className="editor-toolbar">
      <div className="segmented"><button className={mode === 'layers' ? 'active' : ''} onClick={() => setMode('layers')}><Layers size={14}/>图层</button><button className={mode === 'piano' ? 'active' : ''} onClick={() => setMode('piano')}><Piano size={14}/>钢琴卷帘</button></div>
      <span className="separator"/>
      <button className={tool === 'draw' ? 'active icon-button' : 'icon-button'} title="绘制音符" aria-label="绘制音符" onClick={() => setTool('draw')}><Pencil size={15}/></button>
      <button className={tool === 'select' ? 'active icon-button' : 'icon-button'} title="框选音符（也可按住 Shift 拖动）" aria-label="框选音符" onClick={() => setTool('select')}><MousePointer2 size={15}/></button>
      <button className="icon-button" title="复制 Ctrl+C" aria-label="复制音符" disabled={!notes.length} onClick={() => void copy()}><Copy size={14}/></button><button className="icon-button" title="剪切 Ctrl+X" aria-label="剪切音符" disabled={!notes.length} onClick={() => void copy(true)}><Scissors size={14}/></button><button className="icon-button" title="粘贴 Ctrl+V" aria-label="粘贴音符" disabled={!clipboardReady} onClick={() => void paste()}><ClipboardPaste size={14}/></button>
      <span className="toolbar-spacer"/><span className="small-label">吸附</span><select aria-label="吸附" value={snapChoice} onChange={e => setSnapChoice(Number(e.target.value))}>{[1,2,4,-1].map(n => <option key={n} value={n}>{n === -1 ? `1 小节 (${bar})` : `${n} tick`}</option>)}</select><select aria-label="网格缩放" value={cellWidth} onChange={e => { const tick = scrollLeft / cellWidth; const zoom = Number(e.target.value); setCellWidth(zoom); if (scroll.current) scroll.current.scrollLeft = tick * zoom }}>{[8,12,18,25].map(n => <option key={n} value={n}>{n * 4}%</option>)}</select>
      <button className="icon-button" aria-label="试听 Pattern" title="试听 Pattern" onClick={() => playing === null ? void audio.play(project, pattern.id, setPlaying).catch(e => report(String(e.message))) : (audio.stop(), setPlaying(null))}>{playing === null ? <Play size={15}/> : <Square size={13}/>}</button>
    </div>
    <div className="instrument-palette" data-testid="instrument-palette"><span className="palette-label">音色库 <small>原版 16</small></span><div className="instrument-list">{instruments.map(([name, _file, color], id) => <button key={id} className={instrument === id ? 'instrument selected' : 'instrument'} title={`${name} · 点击选择落笔音色并试听`} onClick={() => { setInstrument(id); preview(id, 66) }}><i style={{ background: color }}/>{name}</button>)}</div></div>
    <div className="pattern-metadata">
      <label>名称 <input aria-label="Pattern 名称" maxLength={100} value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={() => { if (nameDraft !== pattern.name) void dispatch({ type: 'rename-pattern', patternId: pattern.id, name: nameDraft }).then(next => { if (!next) setNameDraft(pattern.name) }) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/></label>
      <label>长度 <input aria-label="Pattern 长度 ticks" type="number" min={1} max={1048576} value={lengthDraft} onChange={e => setLengthDraft(e.target.value)} onBlur={() => { if (Number(lengthDraft) !== pattern.length) void dispatch({ type: 'set-pattern-length', patternId: pattern.id, length: Number(lengthDraft) }).then(next => { if (!next) setLengthDraft(String(pattern.length)) }) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/><span>ticks</span></label>
      <button disabled={rows >= 4096 || mode !== 'layers'} onClick={() => void dispatch({type:'add-layer',patternId:pattern.id})}>＋ 图层</button><span className="toolbar-spacer"/><span>{selection.length ? `已选 ${selection.length}` : `${pattern.notes.length} 音符`} · {pattern.length / bar} 小节</span>
    </div>
    <div className="note-properties" title={notes.length > 1 ? "显示第一个所选音符的属性；修改会应用到整个选区" : ""}>
      <label>{selection.length ? '选区音高' : '落笔音高'} <select aria-label="音符音高" value={selection.length ? notes[0]?.pitch ?? pitch : pitch} onChange={e => { setPitch(Number(e.target.value)); setProperties({ pitch: Number(e.target.value) }) }}>{Array.from({ length: 88 }, (_, i) => i + 21).map(p => <option key={p} value={p}>{pitchName(p)}</option>)}</select></label>
      <label>力度 <input aria-label="音符力度" type="number" min={0} max={100} key={`v-${notes[0]?.id}-${notes[0]?.velocity}-${velocity}`} defaultValue={notes[0]?.velocity ?? velocity} onBlur={e => { const value = Number(e.target.value); if (Number.isInteger(value) && value >= 0 && value <= 100) { setVelocity(value); setProperties({ velocity: value }) } else e.target.value = String(notes[0]?.velocity ?? velocity) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/></label>
      <label>声像 <input aria-label="选区声像" disabled={!notes.length} type="number" min={0} max={200} key={`p-${notes[0]?.id}-${notes[0]?.panning}`} defaultValue={notes[0]?.panning ?? 100} onBlur={e => { const value = Number(e.target.value); if (Number.isInteger(value) && value >= 0 && value <= 200) setProperties({ panning: value }); else e.target.value = String(notes[0]?.panning ?? 100) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/></label>
      <label>微调 <input aria-label="选区微调音分" title="音分（cents）" disabled={!notes.length} type="number" min={-32768} max={32767} key={`f-${notes[0]?.id}-${notes[0]?.finePitch}`} defaultValue={notes[0]?.finePitch ?? 0} onBlur={e => { const value = Number(e.target.value); if (Number.isInteger(value) && value >= -32768 && value <= 32767) setProperties({ finePitch: value }); else e.target.value = String(notes[0]?.finePitch ?? 0) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/></label>
      <button disabled={!notes.length || instrument >= instruments.length} onClick={() => setProperties({ instrument })}>应用音色到选区</button>
      <button disabled={!notes.length} onClick={() => setSelection([])}>取消选择</button>
    </div>
    <div className="note-scroll" ref={scroll} onScroll={e => { setScrollLeft(e.currentTarget.scrollLeft); setScrollTop(e.currentTarget.scrollTop) }} onContextMenu={e => e.preventDefault()}>
      <div className="note-grid-spacer" style={{ width, height }}>
      <div className="note-ruler" data-testid="note-ruler" style={{ width: viewport.width }} onPointerDown={e => {
        if(e.clientX-e.currentTarget.getBoundingClientRect().left<labelWidth)return
        const tick = quantize(Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left + scrollLeft - labelWidth) / cellWidth))
        if (tick >= 0 && e.button === 0) { setCursor(tick); e.currentTarget.closest<HTMLElement>('.pattern-editor')?.focus() }
      }}><span className="ruler-heading">{mode === 'piano' ? 'PIANO ROLL' : 'LAYERS'}</span>{visibleBars.map(i => <span key={i} className="bar-number" style={{ left: labelWidth + i * bar * cellWidth - scrollLeft }}>{String(i + 1).padStart(2,'0')}</span>)}<i style={{ left: labelWidth + cursor * cellWidth - scrollLeft }}/></div>
      <canvas ref={canvas} style={{ width: viewport.width, height: viewport.height }} aria-label="音符网格：左键放置，右键删除，Shift 拖动框选" data-testid="note-grid" onPointerDown={e => {
        e.currentTarget.closest<HTMLElement>('.pattern-editor')?.focus()
        const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left + scrollLeft, y = e.clientY - rect.top + scrollTop
        if(e.clientX-rect.left<labelWidth){const labelRow=Math.floor((y-headerHeight)/rh);if(e.button===0&&labelRow>=0&&labelRow<rows){if(mode==='piano'){setPitch(108-labelRow);preview(instrument,108-labelRow)}else setSelection(pattern.notes.filter(n=>n.layer===labelRow).map(n=>n.id))}return}
        const tick = Math.floor((x - labelWidth) / cellWidth), row = Math.floor((y - headerHeight) / rh)
        if (tick < 0) return
        setCursor(quantize(tick))
        if (row < 0 || row >= rows) return
        const hit = [...pattern.notes].reverse().find(n => n.tick === tick && rowFor(n) === row)
        if (e.button === 2) {
          const el = e.currentTarget, deleted = new Set<string>(); el.setPointerCapture(e.pointerId)
          const erase = (tx: number, ry: number) => { const ids = pattern.notes.filter(n => n.tick === tx && rowFor(n) === ry && !deleted.has(n.id)).map(n => n.id); ids.forEach(id => deleted.add(id)); if (ids.length) void dispatch({ type: 'delete-notes', patternId: pattern.id, ids }) }
          erase(tick, row)
          el.onpointermove = move => erase(Math.floor((move.clientX - rect.left + scrollLeft - labelWidth) / cellWidth), Math.floor((move.clientY - rect.top + scrollTop - headerHeight) / rh))
          el.onpointerup = el.onpointercancel = () => { el.onpointermove = null; el.onpointerup = null; el.onpointercancel = null }; return
        }
        if (e.button !== 0) return
        const el = e.currentTarget; el.setPointerCapture(e.pointerId)
        if ((tool === 'select' || e.shiftKey) && !hit) {
          const previous = e.ctrlKey ? selection : []; setBox({ x, y, w: 0, h: 0 })
          el.onpointermove = move => setBox({ x: Math.min(x, move.clientX - rect.left + scrollLeft), y: Math.min(y, move.clientY - rect.top + scrollTop), w: Math.abs(move.clientX - rect.left + scrollLeft - x), h: Math.abs(move.clientY - rect.top + scrollTop - y) })
          el.onpointerup = up => {
            const ex = up.clientX - rect.left + scrollLeft, ey = up.clientY - rect.top + scrollTop
            setSelection([...new Set([...previous, ...pattern.notes.filter(n => { const nx = labelWidth + n.tick * cellWidth + cellWidth / 2, ny = headerHeight + rowFor(n) * rh + rh / 2; return nx >= Math.min(x, ex) && nx <= Math.max(x, ex) && ny >= Math.min(y, ey) && ny <= Math.max(y, ey) }).map(n => n.id)])]); setBox(null); el.onpointermove = null; el.onpointerup = null
          }; return
        }
        if (hit) {
          const ids = e.ctrlKey ? selection.includes(hit.id) ? selection.filter(id => id !== hit.id) : [...selection, hit.id] : selection.includes(hit.id) ? selection : [hit.id]
          setSelection(ids); setPitch(hit.pitch); setVelocity(hit.velocity); setInstrument(hit.instrument); preview(hit.instrument, hit.pitch)
          el.onpointermove = move => setGhost({ ticks: Math.round((move.clientX - e.clientX) / (cellWidth * snap)) * snap, rows: Math.round((move.clientY - e.clientY) / rh) })
          const sx = e.clientX, sy = e.clientY
          el.onpointerup = up => {
            const dt = Math.round((up.clientX - sx) / (cellWidth * snap)) * snap, dr = Math.round((up.clientY - sy) / rh)
            if (ids.length && (dt || dr)) void dispatch({ type: 'move-notes', patternId: pattern.id, ids, ticks: dt, pitches: mode === 'piano' ? -dr : 0, layers: mode === 'layers' ? dr : 0 })
            setGhost(null); el.onpointermove = null; el.onpointerup = null
          }
        } else if (tool === 'draw' && !e.shiftKey) {
          const notePitch = mode === 'piano' ? 108 - row : pitch
          const drawTick = quantize(tick)
          if (instrument >= instruments.length) { report('请选择一个原版音色再绘制；自定义音符仍然保留'); return }
          const occupied = new Set(pattern.notes.filter(n => n.tick === drawTick).map(n => n.layer))
          const layer = mode === 'layers' ? row : Array.from({ length: 4096 }, (_, i) => i).find(i => !occupied.has(i))
          if (layer === undefined) { report('这个 tick 的 4096 个图层已满'); return }
          void dispatch({ type: 'add-note', patternId: pattern.id, tick: drawTick, layer, pitch: notePitch, instrument, velocity }).then(next => { if (next) setSelection([next.project.patterns.find(p => p.id === pattern.id)!.notes.at(-1)!.id]) })
          preview(instrument, notePitch)
        }
      }} onPointerCancel={e => { e.currentTarget.onpointermove = null; e.currentTarget.onpointerup = null; setBox(null); setGhost(null) }}/>
      </div>
    </div>
    <div className="velocity-lane"><span>力度 · 拖动编辑</span><div>{visibleNotes.map(n => <button key={n.id} aria-label={`Tick ${n.tick} 图层 ${n.layer + 1} 力度 ${n.velocity}`} title={`图层 ${n.layer + 1} · ${n.velocity}% · 拖动调整力度`} className={selectedIds.has(n.id) ? 'velocity-bar selected' : 'velocity-bar'} style={{ left: n.tick * cellWidth + 4 - scrollLeft, height: `${Math.max(4, (velocityPreview?.ids.includes(n.id) ? velocityPreview.value : n.velocity) * .32)}px`, background: instrumentColor(n.instrument), width: Math.max(4, cellWidth - 8) }} onPointerDown={e => {
      if (e.button !== 0) return
      const el = e.currentTarget, rect = el.parentElement!.getBoundingClientRect(), ids = selectedIds.has(n.id) ? selection : [n.id]
      setSelection(ids); el.setPointerCapture(e.pointerId)
      const valueAt = (y: number) => Math.max(0, Math.min(100, Math.round((rect.bottom - 4 - y) / .32)))
      setVelocityPreview({ ids, value: valueAt(e.clientY) })
      el.onpointermove = move => setVelocityPreview({ ids, value: valueAt(move.clientY) })
      el.onpointerup = up => { void dispatch({ type: 'set-note-properties', patternId: pattern.id, ids, velocity: valueAt(up.clientY) }); setVelocityPreview(null); el.onpointermove = null; el.onpointerup = null }
      el.onpointercancel = () => { setVelocityPreview(null); el.onpointermove = null; el.onpointerup = null }
    }}/>)}</div></div>
    <div className="keyboard">{Array.from({ length: 36 }, (_, i) => i + 48).map(midi => <button key={midi} className={`${[1,3,6,8,10].includes(midi % 12) ? 'black-key' : 'white-key'} ${midi === pitch ? 'current-key' : ''}`} title={pitchName(midi)} onPointerDown={() => { setPitch(midi); preview(instrument, midi) }}>{midi % 12 === 0 ? pitchName(midi) : ''}</button>)}<span title={instrumentName(instrument)}>{instrumentName(instrument)}<small>{pitchName(pitch)} · 点击琴键试听</small></span></div>
    <footer className="editor-hint">左键放置 · 右键删除 · 拖动音符移动 · Shift + 拖动框选<span>方向键微调 · Shift + ↑↓ 八度 · Ctrl + C / V / X</span></footer>
  </div>
}

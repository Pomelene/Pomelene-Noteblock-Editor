import { useEffect, useState } from 'react'
import { Blocks, FolderOpen, Play, Square, Undo2, Redo2, Plus, Copy, ChevronDown, ChevronRight, AudioLines, AppWindow, Grid2X2, ArrowUpRight, X, CircleHelp } from 'lucide-react'
import { useProject } from './state'
import { PatternEditor } from './PatternEditor'
import { FloatingWindow } from './FloatingWindow'
import { Playlist } from './Playlist'
import { audio } from './audio'
import { ticksPerBar } from './instruments'

export function App() {
  const { snapshot, dispatch, error, setError } = useProject()
  const [selected, setSelected] = useState('p1'), [editor, setEditor] = useState<string>(), [minimized, setMinimized] = useState(false)
  const [message, setMessage] = useState('就绪 · 双击 Pattern 开始编辑'), [position, setPosition] = useState<number | null>(null)
  const [bpmDraft, setBpmDraft] = useState('120')
  const nativePattern = new URLSearchParams(window.location.search).get('pattern')
  useEffect(() => { if (snapshot) setBpmDraft(String(snapshot.project.bpm)) }, [snapshot?.project.bpm])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,select') || e.defaultPrevented) return
      if ((e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase())) { e.preventDefault(); void dispatch({ type: e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo' }) }
      if (e.code === 'Space' && !nativePattern) { e.preventDefault(); if (position === null) { if (snapshot) void audio.play(snapshot.project, undefined, setPosition).catch(e => setError(String(e.message))) } else { audio.stop(); setPosition(null) } }
    }
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler)
  }, [snapshot, position])
  if (!snapshot) return <div className="loading">正在连接桌面编辑会话…{error}</div>
  const { project } = snapshot, pattern = project.patterns.find(p => p.id === (nativePattern ?? editor))
  function open(id: string) { setSelected(id); setEditor(id); setMinimized(false); setMessage('Pattern 编辑器 · 可拖动标题栏，或弹出为桌面窗口') }
  async function popOut() {
    if (!editor) return
    try { await window.editor.openPatternWindow(editor); setEditor(undefined); setMinimized(false); setMessage('Pattern 已弹出 · 编辑会实时同步到所有引用') }
    catch (e) { setError(String(e)) }
  }
  async function newPattern(duplicate: boolean) {
    const result = await dispatch(duplicate ? { type: 'duplicate-pattern', patternId: selected } : { type: 'create-pattern', name: `Pattern ${String(project.patterns.length + 1).padStart(2, '0')}` })
    if (result) open(result.project.patterns.at(-1)!.id)
  }
  return <div className={nativePattern ? 'app native-editor' : 'app'} data-revision={snapshot.revision}>
    {!nativePattern && <>
      <header className="app-header"><div className="brand"><Blocks size={21}/><span>NOTE<b>BLOCK</b><small>DESKTOP EDITOR</small></span></div><div className="project-title"><span>{project.title}</span><small>桌面工程预览 · 暂存于本次会话</small></div><div className="header-end"><span className="version">0.1 / DEVELOPMENT</span><button title="操作说明" aria-label="操作说明" onClick={() => setMessage('编排：左键放置 / 右键删除 / 双击编辑；子窗口：左键放音符 / Shift 框选 / Ctrl+C、V、X；空格播放')}><CircleHelp size={17}/></button></div></header>
      <div className="transport"><div className="transport-mode"><span className="status-light"/>SONG</div><button className="play-button" aria-label={position === null ? '播放编排' : '停止播放'} onClick={() => position === null ? void audio.play(project, undefined, setPosition).catch(e => setError(String(e.message))) : (audio.stop(), setPosition(null))}>{position === null ? <Play size={20} fill="currentColor"/> : <Square size={17} fill="currentColor"/>}</button><button className="icon-button" title="停止" aria-label="停止" onClick={() => { audio.stop(); setPosition(null) }}><Square size={15}/></button>
        <div className="transport-value"><label htmlFor="bpm">TEMPO</label><input id="bpm" aria-label="BPM" type="number" min="30" max="300" step="1" value={bpmDraft} onChange={e => setBpmDraft(e.target.value)} onBlur={() => { const bpm = Number(bpmDraft); if (bpm !== project.bpm) void dispatch({ type: 'set-tempo', bpm, meter: project.meter }).then(result => { if (!result) setBpmDraft(String(project.bpm)) }) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/><span>BPM</span></div>
        <div className="transport-value meter"><label htmlFor="meter">拍号</label><select id="meter" aria-label="拍号" value={project.meter} onChange={e => void dispatch({ type: 'set-tempo', bpm: project.bpm, meter: e.target.value })}><option>4/4</option><option>3/4</option><option>6/8</option></select></div>
        <div className="time-display">{String(Math.floor((position ?? 0) / ticksPerBar(project.meter)) + 1).padStart(3,'0')}<i>:</i>{String(Math.floor((position ?? 0) % ticksPerBar(project.meter) / 4) + 1).padStart(2,'0')}<i>:</i>{String(Math.floor((position ?? 0) % 4)).padStart(2,'0')}<small>BAR · BEAT · STEP</small></div>
        <div className="toolbar-spacer"/><button className="icon-button" title="撤销 Ctrl+Z" aria-label="撤销" disabled={!snapshot.canUndo} onClick={() => void dispatch({ type: 'undo' })}><Undo2 size={17}/></button><button className="icon-button" title="重做 Ctrl+Y" aria-label="重做" disabled={!snapshot.canRedo} onClick={() => void dispatch({ type: 'redo' })}><Redo2 size={17}/></button><span className="separator"/><button className="workspace-button active" onClick={() => { setEditor(undefined); setMinimized(false) }}><Grid2X2 size={15}/>编排</button><button className="workspace-button" onClick={() => open(selected)}><AppWindow size={15}/>Pattern</button>
      </div>
      <main className="workspace"><aside className="browser"><div className="panel-heading"><FolderOpen size={14}/><strong>工程浏览器</strong><ChevronDown size={13}/></div><div className="browser-section"><ChevronDown size={12}/>PATTERNS<span>{project.patterns.length}</span></div><div className="pattern-list">{project.patterns.map((p, index) => <button key={p.id} data-testid={`pattern-${p.id}`} className={`pattern-row ${selected === p.id ? 'selected' : ''}`} onClick={() => setSelected(p.id)} onDoubleClick={() => open(p.id)}><span className="pattern-number">{String(index + 1).padStart(2,'0')}</span><span><b>{p.name}</b><small>{p.length} ticks · {p.notes.length} notes</small></span><ChevronRight size={13}/></button>)}</div><div className="browser-actions"><button onClick={() => void newPattern(false)}><Plus size={14}/>新建</button><button onClick={() => void newPattern(true)}><Copy size={13}/>独立副本</button></div><div className="browser-tip"><AudioLines size={20}/><strong>以乐段组织音乐</strong><p>同一 Pattern 可以放置多次。双击编辑，所有引用同步更新。</p><button className="open-editor" onClick={() => open(selected)}>打开 Pattern <ArrowUpRight size={13}/></button></div><div className="browser-footer"><span className="status-light"/>本地采样 · 离线可用</div></aside>
        <div className="arrangement"><div className="panel-heading"><Grid2X2 size={14}/><strong>Playlist</strong><span className="panel-description">乐段编排</span><div className="toolbar-spacer"/><span className="small-label">吸附：小节</span><span className="selected-pattern-tag">{project.patterns.find(p => p.id === selected)?.name}</span></div><div className="mdi-workspace"><Playlist project={project} selected={selected} open={open} dispatch={dispatch} position={position}/>{editor && pattern && !minimized && <FloatingWindow title={`Pattern ${String(project.patterns.indexOf(pattern) + 1).padStart(2,'0')} · ${pattern.name}`} onClose={() => setEditor(undefined)} onMinimize={() => setMinimized(true)} onPopOut={() => void popOut()}><PatternEditor key={pattern.id} pattern={pattern} project={project} dispatch={dispatch} report={setMessage}/></FloatingWindow>}</div><div className="window-dock"><Grid2X2 size={13}/><span>Playlist</span>{editor && pattern && <button className={minimized ? '' : 'active'} onClick={() => setMinimized(v => !v)}><AppWindow size={13}/>{pattern.name}{minimized && <ChevronRight size={12}/>}<X size={12} onClick={e => { e.stopPropagation(); setEditor(undefined) }}/></button>}<span className="toolbar-spacer"/><small>左键放置 · 右键删除 · 双击编辑</small></div></div>
      </main>
    </>}
    {nativePattern && pattern && <><div className="native-heading"><AppWindow size={15}/><strong>{pattern.name}</strong><span>Pattern 编辑器</span><div className="toolbar-spacer"/><span className="status-light"/><small>共享编辑会话</small><button className="icon-button" disabled={!snapshot.canUndo} aria-label="撤销" onClick={() => void dispatch({ type: 'undo' })}><Undo2 size={15}/></button><button className="icon-button" disabled={!snapshot.canRedo} aria-label="重做" onClick={() => void dispatch({ type: 'redo' })}><Redo2 size={15}/></button></div><PatternEditor pattern={pattern} project={project} dispatch={dispatch} report={setMessage}/></>}
    <footer className={`app-status ${error ? 'error' : ''}`} role="status"><span className="status-light"/><span>{error || message}</span><div className="toolbar-spacer"/><span>{project.patterns.length} PATTERNS</span><span>REV {snapshot.revision}</span><span>LOCAL AUDIO</span></footer>
  </div>
}

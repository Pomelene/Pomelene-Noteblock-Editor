import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Blocks, FolderOpen, Save, FilePlus2, FileOutput, Files, Play, Square, Undo2, Redo2, Plus, Copy, ChevronRight, AudioLines, AppWindow, Grid2X2, ArrowUpRight, X, CircleHelp, Trash2 } from 'lucide-react'
import type { NbsProject } from '../../shared/nbs'
import type { EditorAPI } from '../../shared/api'
import { useProject } from './state'
import { PatternEditor } from './PatternEditor'
import { FloatingWindow } from './FloatingWindow'
import { Playlist } from './Playlist'
import { audio } from './audio'
import { ticksPerBar } from './instruments'

function Modal({title,close,children}:{title:string;close():void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{ref.current?.showModal()},[])
  return <dialog ref={ref} className="app-dialog" onCancel={close}><header><strong>{title}</strong><button aria-label="关闭对话框" onClick={close}><X size={17}/></button></header>{children}</dialog>
}
export function App(){
  const {snapshot,dispatch,error,setError,fileAction,fileBusy,fileWarnings}=useProject()
  const [selected,setSelected]=useState('p1'),[editor,setEditor]=useState<string>(),[minimized,setMinimized]=useState(false)
  const [message,setMessage]=useState('就绪 · 双击 Pattern 编辑，拖入编排放置'),[position,setPosition]=useState<number|null>(null),[seek,setSeek]=useState(0)
  const [bpmDraft,setBpmDraft]=useState('120'),[titleDraft,setTitleDraft]=useState('')
  const [playMode,setPlayMode]=useState<'song'|'pattern'>('song'),[panel,setPanel]=useState<'help'|'delete'|'warnings'|'exportWarnings'>()
  useEffect(()=>{if(fileWarnings.length)setPanel('exportWarnings')},[fileWarnings])
  const nativePattern=new URLSearchParams(window.location.search).get('pattern')
  useEffect(()=>{if(snapshot)setBpmDraft(String(snapshot.project.bpm))},[snapshot?.project.bpm])
  useEffect(()=>{if(snapshot)setTitleDraft(snapshot.project.title)},[snapshot?.project.title])
  useEffect(()=>{
    if(!snapshot)return
    setEditor(undefined);setMinimized(false);setSelected(snapshot.project.patterns[0].id);setSeek(0);audio.stop()
    if((snapshot.project as NbsProject).nbs?.warnings?.length)setPanel('warnings')
  },[snapshot?.generation])
  const selectedId=snapshot?.project.patterns.some(p=>p.id===selected)?selected:snapshot?.project.patterns[0].id??''
  async function file(action:Parameters<EditorAPI['fileAction']>[0]){
    const ok=await fileAction(action)
    if(ok)setMessage({new:'已新建工程',open:'已打开文件',save:'工程已保存',saveAs:'工程已另存',exportNbs:'NBS 已导出；编排中的所有乐段已展开，速度按 NBS 精度保存'}[action])
  }
  function stop(){audio.stop();setPosition(null);setSeek(0);void window.editor.stopPlayback()}
  function play(start=seek){if(snapshot)void audio.play(snapshot.project,playMode==='pattern'?selectedId:undefined,setPosition,start).catch(e=>{audio.stop();setError(String(e.message))})}
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if(e.defaultPrevented)return
      const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey
      if(mod&&['s','o','n','e'].includes(key)){
        e.preventDefault();(document.activeElement as HTMLElement)?.blur()
        void file(key==='s'?e.shiftKey?'saveAs':'save':key==='o'?'open':key==='n'?'new':'exportNbs');return
      }
      if((e.target as HTMLElement).matches('input,select,textarea')||document.querySelector('dialog[open]'))return
      if(mod&&['z','y'].includes(key)){e.preventDefault();void dispatch({type:key==='y'||e.shiftKey?'redo':'undo'})}
      if(e.code==='Space'&&!nativePattern){e.preventDefault();position===null?play():stop()}
      if(e.key==='F1'){e.preventDefault();setPanel('help')}
    }
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)
  },[snapshot,position,seek,playMode,selectedId])
  if(!snapshot)return <div className="loading">正在连接编辑会话…{error}</div>
  const {project}=snapshot,pattern=project.patterns.find(p=>p.id===(nativePattern??editor))
  const selectedPattern=project.patterns.find(p=>p.id===selectedId)!
  const warnings=(project as NbsProject).nbs?.warnings??[]
  function open(id:string){setSelected(id);setEditor(id);setMinimized(false);setMessage('Pattern 编辑器 · 标题栏可拖动，右上角可弹出')}
  async function popOut(){if(!editor)return;try{await window.editor.openPatternWindow(editor);setEditor(undefined);setMinimized(false)}catch(e){setError(String(e))}}
  async function newPattern(duplicate:boolean){
    const result=await dispatch(duplicate?{type:'duplicate-pattern',patternId:selectedId}:{type:'create-pattern',name:`Pattern ${project.patterns.length+1}`})
    if(result)open(result.project.patterns.at(-1)!.id)
  }
  const fileButtons=<div className="file-actions">
    <button disabled={fileBusy} aria-label="新建工程" title="新建工程 Ctrl+N" onClick={()=>void file('new')}><FilePlus2 size={15}/><span>新建</span></button>
    <button disabled={fileBusy} aria-label="打开文件" title="打开工程 / NBS Ctrl+O" onClick={()=>void file('open')}><FolderOpen size={15}/><span>打开</span></button>
    <button disabled={fileBusy} aria-label="保存工程" title="保存工程 Ctrl+S" onClick={()=>void file('save')}><Save size={15}/><span>保存</span></button>
    <button disabled={fileBusy} aria-label="另存工程" title="另存为 Ctrl+Shift+S" onClick={()=>void file('saveAs')}><Files size={15}/><span>另存</span></button>
    <button disabled={fileBusy} aria-label="导出 NBS" title="导出 NBS Ctrl+E" onClick={()=>void file('exportNbs')}><FileOutput size={15}/><span>导出 NBS</span></button>
  </div>
  return <div className={nativePattern?'app native-editor':'app'} data-revision={snapshot.revision} data-dirty={String(snapshot.document?.dirty??false)}>
    {!nativePattern&&<>
      <header className="app-header"><div className="brand"><Blocks size={21}/><span>NOTE<b>BLOCK</b><small>DESKTOP EDITOR</small></span></div>
        <div className="project-title"><input aria-label="工程名称" value={titleDraft} maxLength={100} onChange={e=>setTitleDraft(e.target.value)} onBlur={()=>{if(titleDraft!==project.title)void dispatch({type:'set-title',title:titleDraft}).then(r=>{if(!r)setTitleDraft(project.title)})}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/><small title={snapshot.document?.path}>{snapshot.document?.dirty?'● 未保存修改 · ':''}{snapshot.document?.path?.split(/[\\/]/).at(-1)??'未保存的工程'}</small></div>
        {fileButtons}<button aria-label="操作说明" title="操作说明 F1" onClick={()=>setPanel('help')}><CircleHelp size={17}/></button>
      </header>
      <div className="transport"><div className="segmented"><button className={playMode==='song'?'active':''} onClick={()=>{audio.stop();setPlayMode('song');setSeek(0)}} title="播放完整编排">SONG</button><button className={playMode==='pattern'?'active':''} onClick={()=>{audio.stop();setPlayMode('pattern');setSeek(0)}} title="播放左侧选中的 Pattern">PAT</button></div>
        <button className="play-button" aria-label={position===null?'播放编排':'停止播放'} onClick={()=>position===null?play():stop()}>{position===null?<Play size={20} fill="currentColor"/>:<Square size={17} fill="currentColor"/>}</button><button className="icon-button" aria-label="停止" title="停止并归零" onClick={stop}><Square size={15}/></button>
        <div className="transport-value"><label htmlFor="bpm">TEMPO</label><input id="bpm" aria-label="BPM" type="number" min="0.15" max="9830.25" step="0.15" value={bpmDraft} onChange={e=>setBpmDraft(e.target.value)} onBlur={()=>{const bpm=Number(bpmDraft);if(bpm!==project.bpm)void dispatch({type:'set-tempo',bpm,meter:project.meter}).then(r=>{if(!r)setBpmDraft(String(project.bpm))})}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/><span>BPM</span></div>
        <div className="transport-value meter"><label htmlFor="meter">拍号</label><select id="meter" aria-label="拍号" value={project.meter} onChange={e=>void dispatch({type:'set-tempo',bpm:project.bpm,meter:e.target.value})}>{[...new Set([project.meter,'4/4','3/4','6/8','2/4','5/4','7/8','9/8','12/8'])].map(m=><option key={m}>{m}</option>)}</select></div>
        <div className="time-display">{String(Math.floor((position??seek)/ticksPerBar(project.meter))+1).padStart(3,'0')}<i>:</i>{String(Math.floor((position??seek)%ticksPerBar(project.meter)/(16/Number(project.meter.split('/')[1])))+1).padStart(2,'0')}<i>:</i>{String(Math.floor((position??seek)%4)).padStart(2,'0')}<small>BAR · BEAT · STEP</small></div>
        <span className="toolbar-spacer"/><button className="icon-button" aria-label="撤销" title="撤销 Ctrl+Z" disabled={!snapshot.canUndo} onClick={()=>void dispatch({type:'undo'})}><Undo2 size={17}/></button><button className="icon-button" aria-label="重做" title="重做 Ctrl+Y" disabled={!snapshot.canRedo} onClick={()=>void dispatch({type:'redo'})}><Redo2 size={17}/></button><span className="separator"/>
        <button className={`workspace-button ${!editor||minimized?'active':''}`} onClick={()=>setMinimized(true)}><Grid2X2 size={15}/>编排</button><button className={`workspace-button ${editor&&!minimized?'active':''}`} onClick={()=>open(selectedId)}><AppWindow size={15}/>Pattern</button>
      </div>
      <main className="workspace"><aside className="browser"><div className="panel-heading"><FolderOpen size={14}/><strong>工程浏览器</strong></div><div className="browser-section">PATTERNS<span>{project.patterns.length}</span></div>
        <div className="pattern-list">{project.patterns.map((p,index)=><button key={p.id} draggable onDragStart={e=>{e.dataTransfer.setData('application/x-noteblock-pattern',p.id);e.dataTransfer.effectAllowed='copy';setSelected(p.id)}} title="点击选择 · 双击编辑 · 拖入编排" data-testid={`pattern-${p.id}`} className={`pattern-row ${selectedId===p.id?'selected':''}`} onClick={()=>setSelected(p.id)} onDoubleClick={()=>open(p.id)}><span className="pattern-number">{String(index+1).padStart(2,'0')}</span><span><b>{p.name}</b><small>{p.length} ticks · {p.notes.length} notes</small></span><ChevronRight size={13}/></button>)}</div>
        <div className="browser-actions"><button onClick={()=>void newPattern(false)}><Plus size={14}/>新建</button><button onClick={()=>void newPattern(true)}><Copy size={13}/>副本</button><button aria-label="删除 Pattern" title="删除所选 Pattern 及其编排引用" disabled={project.patterns.length<=1} onClick={()=>setPanel('delete')}><Trash2 size={13}/></button></div>
        <div className="browser-tip"><AudioLines size={20}/><strong>以乐段组织音乐</strong><p>点击选择，拖入编排。双击打开编辑器；同一 Pattern 的所有引用同步更新。</p><button className="open-editor" onClick={()=>open(selectedId)}>打开 Pattern <ArrowUpRight size={13}/></button></div><div className="browser-footer"><span className="status-light"/>本地采样 · 离线可用</div>
      </aside>
      <div className="arrangement"><div className="panel-heading"><Grid2X2 size={14}/><strong>Playlist</strong><span className="panel-description">乐段编排</span><span className="toolbar-spacer"/><span className="selected-pattern-tag">{selectedPattern.name}</span></div>
        <div className="mdi-workspace"><Playlist key={snapshot.generation??0} project={project} selected={selectedId} open={open} dispatch={dispatch} position={position} report={setMessage} onSeek={tick=>{setSeek(tick);if(position!==null)play(tick)}}/>
          {editor&&pattern&&<FloatingWindow hidden={minimized} title={`Pattern · ${pattern.name}`} onClose={()=>setEditor(undefined)} onMinimize={()=>setMinimized(true)} onPopOut={()=>void popOut()}><PatternEditor key={`${snapshot.generation}:${pattern.id}`} pattern={pattern} project={project} dispatch={dispatch} report={setMessage}/></FloatingWindow>}
        </div><div className="window-dock"><Grid2X2 size={13}/><span>Playlist</span>{editor&&pattern&&<button className={minimized?'':'active'} onClick={()=>setMinimized(v=>!v)}><AppWindow size={13}/>{pattern.name}{minimized&&<ChevronRight size={12}/>}</button>}{editor&&<button aria-label="关闭停靠的编辑器" onClick={()=>setEditor(undefined)}><X size={12}/></button>}<span className="toolbar-spacer"/><small>Ctrl+C / X / V · Delete · 标尺定位播放</small></div>
      </div></main>
    </>}
    {nativePattern&&pattern&&<><div className="native-heading"><AppWindow size={15}/><strong>{pattern.name}</strong><span>Pattern 编辑器</span><span className="toolbar-spacer"/>{fileButtons}<button className="icon-button" disabled={!snapshot.canUndo} aria-label="撤销" onClick={()=>void dispatch({type:'undo'})}><Undo2 size={15}/></button><button className="icon-button" disabled={!snapshot.canRedo} aria-label="重做" onClick={()=>void dispatch({type:'redo'})}><Redo2 size={15}/></button></div><PatternEditor pattern={pattern} project={project} dispatch={dispatch} report={setMessage}/></>}
    {error&&<div className="error-banner" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={()=>setError('')}><X size={14}/></button></div>}
    <footer className="app-status" role="status"><span className="status-light"/><span>{fileBusy?'正在处理文件…':message}</span><span className="toolbar-spacer"/><span>{project.patterns.length} PATTERNS</span><span>{project.clips.length} CLIPS</span><span>{snapshot.document?.dirty?'未保存':'已保存'}</span></footer>
    {panel==='help'&&<Modal title="编辑操作" close={()=>setPanel(undefined)}><p>编排默认可按 1 tick 放置和移动；工具栏可更改吸附与缩放。Shift 在空白处拖动框选，Ctrl 点击增减选区，方向键微调，Delete 删除，Ctrl+C / X / V 复制、剪切、粘贴。</p><p>Pattern 内左键绘制、右键删除，音高和力度属性会应用到选区。时间标尺决定粘贴位置，Pattern 名称与长度可以直接编辑。力度柱支持拖动。</p><p>Ctrl+N 新建，Ctrl+O 打开工程或 NBS，Ctrl+S 保存工程，Ctrl+Shift+S 另存，Ctrl+E 导出 NBS。工程文件保存 Pattern 编排关系；NBS 导出保存完整的编排结果。</p><p>SONG 播放编排，PAT 播放左侧选中乐段；空格播放 / 停止。</p><button onClick={()=>setPanel(undefined)}>知道了</button></Modal>}
    {panel==='delete'&&<Modal title="删除 Pattern" close={()=>setPanel(undefined)}><p>删除“{selectedPattern.name}”及其 {project.clips.filter(c=>c.patternId===selectedId).length} 个编排引用？可以撤销。</p><div className="dialog-actions"><button onClick={()=>setPanel(undefined)}>取消</button><button className="danger" onClick={()=>void dispatch({type:'delete-pattern',patternId:selectedId}).then(r=>{if(r){setPanel(undefined);setEditor(undefined)}})}>删除 Pattern</button></div></Modal>}
    {panel==='warnings'&&<Modal title="NBS 读取说明" close={()=>setPanel(undefined)}><p>音符和下列附加数据已保留。需要外部文件的自定义音色在未提供采样时无法试听。</p><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul><button onClick={()=>setPanel(undefined)}>继续编辑</button></Modal>}
    {panel==='exportWarnings'&&<Modal title="NBS 导出转换说明" close={()=>setPanel(undefined)}><p>文件已导出。根据 NBS 文件格式的表示能力进行了以下转换；工程文件保留原始设置：</p><ul>{fileWarnings.map((w,i)=><li key={i}>{w}</li>)}</ul><button onClick={()=>setPanel(undefined)}>知道了</button></Modal>}
  </div>
}

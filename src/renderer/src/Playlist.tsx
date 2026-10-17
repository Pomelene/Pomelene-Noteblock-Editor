import { useEffect, useRef, useState } from 'react'
import { Copy, Scissors, ClipboardPaste, Trash2, MousePointer2, Pencil, ZoomIn, ZoomOut } from 'lucide-react'
import type { Clip, Project } from '../../shared/project'
import type { Dispatch } from './state'
import { ticksPerBar } from './instruments'

const L=122, R=74, H=34
const colors=['#789fb4','#82a991','#b6a178','#a494b9','#ad8e83']
export function Playlist({project,selected,open,dispatch,position,onSeek,report}:{project:Project;selected:string;open(id:string):void;dispatch:Dispatch;position:number|null;onSeek(tick:number):void;report(message:string):void}) {
  const canvas=useRef<HTMLCanvasElement>(null),scroll=useRef<HTMLDivElement>(null)
  const [view,setView]=useState({w:900,h:600,x:0,y:0})
  const [zoom,setZoom]=useState(10),[snap,setSnap]=useState(1),[tool,setTool]=useState('draw')
  const [ids,setIds]=useState<string[]>([]),[clipboard,setClipboard]=useState<Omit<Clip,'id'>[]>([]),[cursor,setCursor]=useState(0)
  const [ghost,setGhost]=useState<{ticks:number;tracks:number}|null>(null),[box,setBox]=useState<{x:number;y:number;w:number;h:number}|null>(null)
  const bar=ticksPerBar(project.meter),grid=snap===-1?bar:snap
  const ticks=Math.max(bar*16,...project.clips.map(c=>c.tick+(project.patterns.find(p=>p.id===c.patternId)?.length??0)+bar*4))
  const chosen=project.clips.filter(c=>ids.includes(c.id))
  useEffect(()=>{const el=scroll.current!;const observer=new ResizeObserver(()=>setView(v=>({...v,w:el.clientWidth,h:el.clientHeight})));observer.observe(el);return()=>observer.disconnect()},[])
  useEffect(()=>{setIds(old=>old.filter(id=>project.clips.some(c=>c.id===id)))},[project.clips])
  const cell=(x:number,y:number)=>({tick:Math.max(0,(x-L+view.x)/zoom),track:Math.floor((y-H+view.y)/R)})
  function hitAt(x:number,y:number){const c=cell(x,y);return [...project.clips].reverse().find(clip=>clip.track===c.track&&c.tick>=clip.tick&&c.tick<clip.tick+(project.patterns.find(p=>p.id===clip.patternId)?.length??0))}
  const quantize=(tick:number,bypass=false)=>Math.max(0,Math.floor(tick/(bypass?1:grid))*(bypass?1:grid))
  useEffect(()=>{
    const el=canvas.current,ctx=el?.getContext('2d');if(!el||!ctx)return
    const dpr=devicePixelRatio||1;el.width=view.w*dpr;el.height=view.h*dpr;ctx.scale(dpr,dpr)
    ctx.fillStyle='#272e34';ctx.fillRect(0,0,view.w,view.h);ctx.font='11px Segoe UI, Microsoft YaHei';ctx.textBaseline='middle'
    ctx.save();ctx.beginPath();ctx.rect(L,H,view.w-L,view.h-H);ctx.clip()
    for(let track=0;track<8;track++){const y=H+track*R-view.y;ctx.fillStyle=track%2?'#282f35':'#2b333a';ctx.fillRect(L,y,view.w,R-1)}
    const from=Math.floor(view.x/zoom),to=from+Math.ceil(view.w/zoom),stride=zoom<6?4:1
    for(let tick=Math.floor(from/stride)*stride;tick<=to;tick+=stride){const x=L+tick*zoom-view.x;ctx.strokeStyle=tick%bar===0?'#53616c':tick%4===0?'#3d4a54':'#303b44';ctx.beginPath();ctx.moveTo(x+.5,H);ctx.lineTo(x+.5,view.h);ctx.stroke()}
    for(const clip of project.clips){
      const index=project.patterns.findIndex(p=>p.id===clip.patternId),p=project.patterns[index];if(!p)continue
      const selected=ids.includes(clip.id),offset=selected&&ghost?ghost:{ticks:0,tracks:0}
      const x=L+(clip.tick+offset.ticks)*zoom-view.x+2,y=H+(clip.track+offset.tracks)*R-view.y+5,w=p.length*zoom-4
      if(x+w<L||x>view.w||y+R<H||y>view.h)continue
      const color=colors[index%colors.length];ctx.fillStyle=color;ctx.fillRect(x,y,Math.max(3,w),18);ctx.fillStyle='#172a33';ctx.fillText(`${String(index+1).padStart(2,'0')} ${p.name}`,Math.max(L+4,x+6),y+9,Math.max(1,w-10))
      ctx.fillStyle=color+'24';ctx.fillRect(x,y+18,Math.max(3,w),R-29);ctx.strokeStyle=selected?'#e3f1fa':color+'77';ctx.lineWidth=selected?2:1;ctx.strokeRect(x+.5,y+.5,Math.max(3,w),R-11);ctx.lineWidth=1
      ctx.fillStyle=color;for(const n of p.notes){const nx=x+n.tick*zoom+3;if(nx<L||nx>view.w)continue;ctx.fillRect(nx,y+24+(108-n.pitch)/87*29,Math.max(2,zoom-2),2)}
    }
    if(box){ctx.fillStyle='#8dbbd333';ctx.strokeStyle='#a5d0e9';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.strokeRect(box.x,box.y,box.w,box.h)}
    ctx.restore();ctx.fillStyle='#202a32';ctx.fillRect(0,0,view.w,H)
    for(let tick=Math.floor(from/bar)*bar;tick<=to;tick+=bar){const x=L+tick*zoom-view.x;if(x<L)continue;ctx.fillStyle='#9fb3c1';ctx.fillText(String(Math.floor(tick/bar)+1).padStart(2,'0'),x+7,16)}
    for(let track=0;track<8;track++){const y=H+track*R-view.y;if(y+R<H)continue;ctx.save();ctx.beginPath();ctx.rect(0,H,L,view.h-H);ctx.clip();ctx.fillStyle='#242e37';ctx.fillRect(0,y,L-1,R-1);ctx.fillStyle='#95aebf';ctx.fillText(`${String(track+1).padStart(2,'0')}   ${['旋律','和声','节奏','贝斯','装饰','Track 06','Track 07','Track 08'][track]}`,12,y+27);ctx.restore()}
    ctx.fillStyle='#202a32';ctx.fillRect(0,0,L,H);ctx.fillStyle='#8ba4b6';ctx.fillText('TRACK / 小节',12,16)
    const playX=L+(position??cursor)*zoom-view.x;if(playX>=L){ctx.fillStyle=position===null?'#87aabe':'#d5df91';ctx.fillRect(playX,0,2,view.h)}
  },[project,ids,view,zoom,position,cursor,ghost,box,bar])
  async function copy(cut=false){if(!chosen.length)return;const first=Math.min(...chosen.map(c=>c.tick));setClipboard(chosen.map(({id:_id,...c})=>({...c,tick:c.tick-first})));if(cut){const result=await dispatch({type:'delete-clips',ids});if(result)setIds([])}report(`已${cut?'剪切':'复制'} ${chosen.length} 个乐段；点击时间标尺后粘贴`)}
  async function paste(){if(!clipboard.length)return;const result=await dispatch({type:'paste-clips',clips:clipboard.map(c=>({...c,tick:c.tick+cursor}))});if(result)setIds(result.project.clips.slice(-clipboard.length).map(c=>c.id))}
  function remove(){if(ids.length)void dispatch({type:'delete-clips',ids}).then(r=>{if(r)setIds([])})}
  return <div className="playlist-editor" tabIndex={0} onKeyDown={e=>{
    if((e.target as HTMLElement).matches('input,select')||e.defaultPrevented)return
    const key=e.key.toLowerCase()
    if(e.ctrlKey||e.metaKey){
      if(['a','c','x','v','d'].includes(key)){
        e.preventDefault();e.stopPropagation()
        if(key==='a')setIds(project.clips.map(c=>c.id))
        if(key==='c'||key==='x')void copy(key==='x')
        if(key==='v')void paste()
        if(key==='d'&&chosen.length){
          const start=Math.min(...chosen.map(c=>c.tick)),end=Math.max(...chosen.map(c=>c.tick+(project.patterns.find(p=>p.id===c.patternId)?.length??0)))
          void dispatch({type:'paste-clips',clips:chosen.map(({id:_id,...c})=>({...c,tick:c.tick+end-start}))})
        }
      }
    }else if(key==='delete'||key==='backspace'){e.preventDefault();remove()}
    else if(ids.length&&e.key.startsWith('Arrow')){e.preventDefault();void dispatch({type:'move-clips',ids,ticks:e.key==='ArrowRight'?grid:e.key==='ArrowLeft'?-grid:0,tracks:e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0})}
  }}>
    <div className="playlist-tools"><button aria-label="编排绘制工具" className={tool==='draw'?'active':''} onClick={()=>setTool('draw')} title="绘制 / 拖动"><Pencil size={14}/></button><button aria-label="编排选择工具" className={tool==='select'?'active':''} onClick={()=>setTool('select')} title="框选（Shift 也可）"><MousePointer2 size={14}/></button><label>吸附<select aria-label="编排吸附" value={snap} onChange={e=>setSnap(Number(e.target.value))}><option value={1}>1/16 · 1 tick</option><option value={2}>1/8 · 2 ticks</option><option value={4}>1/4 · 1 拍</option><option value={-1}>1 小节</option></select></label><span className="separator"/><button aria-label="复制乐段" disabled={!chosen.length} onClick={()=>void copy()} title="复制 Ctrl+C"><Copy size={14}/></button><button aria-label="剪切乐段" disabled={!chosen.length} onClick={()=>void copy(true)} title="剪切 Ctrl+X"><Scissors size={14}/></button><button aria-label="粘贴乐段" disabled={!clipboard.length} onClick={()=>void paste()} title="粘贴 Ctrl+V"><ClipboardPaste size={14}/></button><button aria-label="删除乐段" disabled={!chosen.length} onClick={remove} title="删除"><Trash2 size={14}/></button><span className="small-label">{chosen.length?`选中 ${chosen.length}`:`${project.clips.length} 个乐段`}</span><span className="toolbar-spacer"/><button aria-label="缩小编排" onClick={()=>setZoom(v=>Math.max(2,v-2))} disabled={zoom<=2}><ZoomOut size={14}/></button><input aria-label="编排缩放" type="range" min={2} max={32} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><button aria-label="放大编排" onClick={()=>setZoom(v=>Math.min(32,v+2))} disabled={zoom>=32}><ZoomIn size={14}/></button></div>
    <div ref={scroll} className="playlist-scroll" onScroll={e=>setView(v=>({...v,x:e.currentTarget.scrollLeft,y:e.currentTarget.scrollTop}))} onContextMenu={e=>e.preventDefault()} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('application/x-noteblock-pattern');if(!project.patterns.some(p=>p.id===id))return;const r=canvas.current!.getBoundingClientRect(),c=cell(e.clientX-r.left,e.clientY-r.top);if(c.track>=0&&c.track<8)void dispatch({type:'add-clip',patternId:id,tick:quantize(c.tick,e.altKey),track:c.track})}}>
      <div style={{width:Math.max(view.w,L+ticks*zoom),height:Math.max(view.h,H+R*8)}}><canvas ref={canvas} style={{width:view.w,height:view.h,position:'sticky',top:0,left:0}} data-testid="playlist-grid" onDoubleClick={e=>{const r=e.currentTarget.getBoundingClientRect(),hit=hitAt(e.clientX-r.left,e.clientY-r.top);if(hit)open(hit.patternId)}} onPointerDown={e=>{
        e.currentTarget.closest<HTMLElement>('.playlist-editor')?.focus();const el=e.currentTarget,r=el.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(x<L)return
        const c=cell(x,y),tick=quantize(c.tick,e.altKey);setCursor(tick)
        if(y<H){if(e.button===0)onSeek(tick);return}if(c.track<0||c.track>=8)return
        const hit=hitAt(x,y);if(e.button===2){if(hit)void dispatch({type:'delete-clip',id:hit.id});return}if(e.button!==0)return
        el.setPointerCapture(e.pointerId)
        const clear=()=>{el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null;setGhost(null);setBox(null)};el.onpointercancel=clear
        if(!hit&&(tool==='select'||e.shiftKey)){
          const old=e.ctrlKey?ids:[];el.onpointermove=move=>{const ex=move.clientX-r.left,ey=move.clientY-r.top;setBox({x:Math.min(x,ex),y:Math.min(y,ey),w:Math.abs(ex-x),h:Math.abs(ey-y)})}
          el.onpointerup=up=>{const end=cell(up.clientX-r.left,up.clientY-r.top);setIds([...new Set([...old,...project.clips.filter(clip=>{const len=project.patterns.find(p=>p.id===clip.patternId)?.length??0;return clip.tick+len>Math.min(c.tick,end.tick)&&clip.tick<Math.max(c.tick,end.tick)&&clip.track>=Math.min(c.track,end.track)&&clip.track<=Math.max(c.track,end.track)}).map(c=>c.id)])]);clear()};return
        }
        if(!hit){void dispatch({type:'add-clip',patternId:selected,tick,track:c.track}).then(next=>{if(next)setIds([next.project.clips.at(-1)!.id])});return}
        const selection=e.ctrlKey?ids.includes(hit.id)?ids.filter(id=>id!==hit.id):[...ids,hit.id]:ids.includes(hit.id)?ids:[hit.id];setIds(selection)
        const sx=e.clientX,sy=e.clientY,delta=(event:PointerEvent)=>{const unit=event.altKey?1:grid;return{ticks:Math.round((event.clientX-sx)/zoom/unit)*unit,tracks:Math.round((event.clientY-sy)/R)}}
        el.onpointermove=move=>setGhost(delta(move));el.onpointerup=up=>{const d=delta(up);if(selection.length&&(d.ticks||d.tracks))void dispatch({type:'move-clips',ids:selection,...d});clear()}
      }}/></div>
    </div>
    <div className="playlist-help">左键放置 / 拖动 · 右键删除 · Shift 框选 · Alt 临时按 1 tick 移动 · 左侧 Pattern 可拖入<span>位置 {cursor} tick</span></div>
  </div>
}

import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AppWindow, ArrowUpRight, Maximize2, Minimize2, Minus, X } from 'lucide-react'
export function FloatingWindow({ title, hidden=false, onClose, onMinimize, onPopOut, children }: { title: string; hidden?: boolean; onClose(): void; onMinimize(): void; onPopOut(): void; children: ReactNode }) {
  const [geometry, setGeometry] = useState({ x: 30, y: 40, width: 960, height: 620 })
  const [maximized, setMaximized] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  return <section ref={root} className={`floating-window ${maximized ? 'maximized' : ''}`} style={{...(maximized ? {} : { left: geometry.x, top: geometry.y, width: `min(${geometry.width}px, calc(100% - 32px))`, height: `min(${geometry.height}px, calc(100% - 64px))` }),display:hidden?'none':undefined}} aria-label="Pattern 编辑子窗口" data-testid="floating-editor">
    <header className="window-title" onPointerDown={e => {
      if (maximized || e.button !== 0 || (e.target as HTMLElement).closest('button')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const parent = root.current!.parentElement!
      // Pointer coordinates and saved geometry remain separate while dragging.
      const sx = e.clientX, sy = e.clientY, gx = geometry.x, gy = geometry.y
      e.currentTarget.onpointermove = move => setGeometry(g => ({ ...g, x: Math.max(0, Math.min(parent.clientWidth - 180, gx + move.clientX - sx)), y: Math.max(0, Math.min(parent.clientHeight - 48, gy + move.clientY - sy)) }))
      e.currentTarget.onpointerup = () => { if (root.current) { const header = root.current.querySelector('header')!; header.onpointermove = null; header.onpointerup = null } }
    }} onDoubleClick={() => setMaximized(v => !v)}>
      <AppWindow size={15}/><strong>{title}</strong><span className="window-kind">PATTERN EDITOR</span>
      <div className="window-actions">
        <button title="弹出为桌面窗口" aria-label="弹出为桌面窗口" onClick={onPopOut}><ArrowUpRight size={15}/></button>
        <button title="最小化" aria-label="最小化" onClick={onMinimize}><Minus size={15}/></button>
        <button title="最大化 / 还原" aria-label="最大化或还原" onClick={() => setMaximized(v => !v)}>{maximized ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}</button>
        <button className="close-window" title="关闭编辑器" aria-label="关闭编辑器" onClick={onClose}><X size={16}/></button>
      </div>
    </header>
    {children}
    {!maximized && <div className="resize-grip" aria-hidden="true" onPointerDown={e => {
      e.currentTarget.setPointerCapture(e.pointerId)
      const rect=root.current!.getBoundingClientRect(),sx = e.clientX, sy = e.clientY, initial = { ...geometry,width:rect.width,height:rect.height }, handle = e.currentTarget
      handle.onpointermove = move => setGeometry(g => ({ ...g, width: Math.max(700, initial.width + move.clientX - sx), height: Math.max(450, initial.height + move.clientY - sy) }))
      handle.onpointerup = () => { handle.onpointermove = null; handle.onpointerup = null }
    }}/ >}
  </section>
}

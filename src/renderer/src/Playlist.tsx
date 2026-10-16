import { useEffect, useRef } from 'react'
import type { Clip, Project } from '../../shared/project'
import type { Dispatch } from './state'
import { ticksPerBar } from './instruments'

const labelWidth = 122, rowHeight = 74, headerHeight = 34, tickWidth = 8
const colors = ['#789fb4', '#82a991', '#b6a178', '#a494b9', '#ad8e83']
export function Playlist({ project, selected, open, dispatch, position }: { project: Project; selected: string; open(id: string): void; dispatch: Dispatch; position: number | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const bar = ticksPerBar(project.meter), ticks = Math.max(bar * 12, ...project.clips.map(c => c.tick + (project.patterns.find(p => p.id === c.patternId)?.length ?? 0) + bar))
  const width = labelWidth + ticks * tickWidth, height = headerHeight + rowHeight * 8
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d'); if (!el || !ctx) return
    const dpr = devicePixelRatio || 1; el.width = width * dpr; el.height = height * dpr; ctx.scale(dpr, dpr)
    ctx.fillStyle = '#272e34'; ctx.fillRect(0, 0, width, height)
    ctx.font = '11px Segoe UI'; ctx.textBaseline = 'middle'
    for (let track = 0; track < 8; track++) {
      const y = headerHeight + track * rowHeight
      ctx.fillStyle = track % 2 ? '#282f35' : '#2b333a'; ctx.fillRect(labelWidth, y, width, rowHeight - 1)
      ctx.fillStyle = '#242b31'; ctx.fillRect(0, y, labelWidth - 1, rowHeight - 1)
      ctx.fillStyle = '#71838f'; ctx.fillText(String(track + 1).padStart(2, '0'), 14, y + 24)
      ctx.fillStyle = '#c0cbd2'; ctx.fillText(['旋律', '和声', '节奏', '贝斯', '装饰', 'Track 06', 'Track 07', 'Track 08'][track], 38, y + 24)
      ctx.fillStyle = '#5a8e7d'; ctx.fillRect(15, y + 45, 5, 5)
    }
    for (let tick = 0; tick <= ticks; tick += 4) {
      const x = labelWidth + tick * tickWidth
      ctx.strokeStyle = tick % bar === 0 ? '#4b565f' : '#343e46'; ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke()
      if (tick % bar === 0) { ctx.fillStyle = '#a3b0b9'; ctx.fillText(String(tick / bar + 1).padStart(2, '0'), x + 9, 16) }
    }
    for (const clip of project.clips) {
      const index = project.patterns.findIndex(p => p.id === clip.patternId), p = project.patterns[index]; if (!p) continue
      const x = labelWidth + clip.tick * tickWidth + 2, y = headerHeight + clip.track * rowHeight + 5, w = p.length * tickWidth - 4
      ctx.fillStyle = colors[index % colors.length]; ctx.fillRect(x, y, w, 18)
      ctx.fillStyle = '#202e35'; ctx.fillText(`${String(index + 1).padStart(2, '0')}   ${p.name}`, x + 6, y + 9, w - 10)
      ctx.fillStyle = `${colors[index % colors.length]}24`; ctx.fillRect(x, y + 18, w, rowHeight - 29)
      ctx.strokeStyle = `${colors[index % colors.length]}77`; ctx.strokeRect(x + .5, y + .5, w, rowHeight - 11)
      ctx.fillStyle = colors[index % colors.length]
      for (const n of p.notes) { const ny = (84 - Math.max(36, Math.min(84, n.pitch))) / 48 * 29; ctx.fillRect(x + n.tick * tickWidth + 3, y + 24 + ny, Math.max(3, tickWidth - 2), 2) }
    }
    if (position !== null) { ctx.fillStyle = '#d5df91'; ctx.fillRect(labelWidth + position * tickWidth, 0, 2, height) }
  }, [project, width, height, position, bar, ticks])
  function hitAt(x: number, y: number): Clip | undefined {
    const tick = (x - labelWidth) / tickWidth, track = Math.floor((y - headerHeight) / rowHeight)
    return [...project.clips].reverse().find(c => c.track === track && tick >= c.tick && tick < c.tick + (project.patterns.find(p => p.id === c.patternId)?.length ?? 0))
  }
  return <div className="playlist-scroll" onContextMenu={e => e.preventDefault()}><canvas ref={canvas} style={{ width, height }} data-testid="playlist-grid" aria-label="乐段编排：双击编辑，左键放置 Pattern，右键删除引用" onDoubleClick={e => { const r = e.currentTarget.getBoundingClientRect(), hit = hitAt(e.clientX - r.left, e.clientY - r.top); if (hit) open(hit.patternId) }} onPointerDown={e => {
    const el = e.currentTarget, r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
    if (x < labelWidth || y < headerHeight) return
    const hit = hitAt(x, y)
    if (e.button === 2) { if (hit) void dispatch({ type: 'delete-clip', id: hit.id }); return }
    if (e.button !== 0) return
    if (!hit) { void dispatch({ type: 'add-clip', patternId: selected, tick: Math.max(0, Math.floor((x - labelWidth) / tickWidth / bar) * bar), track: Math.floor((y - headerHeight) / rowHeight) }); return }
    el.setPointerCapture(e.pointerId); const sx = e.clientX, sy = e.clientY
    el.onpointerup = up => {
      const dx = Math.round((up.clientX - sx) / tickWidth / bar) * bar, dy = Math.round((up.clientY - sy) / rowHeight)
      if (dx || dy) void dispatch({ type: 'move-clip', id: hit.id, tick: hit.tick + dx, track: hit.track + dy })
      el.onpointerup = null
    }
  }}/></div>
}

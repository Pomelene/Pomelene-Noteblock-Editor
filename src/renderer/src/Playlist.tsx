import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  MousePointer2,
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  ZoomIn,
  ZoomOut,
  Plus,
} from "lucide-react";
import { ticksPerBar, type Project, type Clip } from "../../shared/model";
import type { Run, ShowMenu, RequestText, Source } from "./ui";
import { snapTick, resizeClip } from "./editing";
import { audio } from "./audio";

const LEFT = 160,
  TOP = 30,
  ROW = 64;
export function Playlist({
  project,
  source,
  run,
  open,
  menu,
  text,
  tick,
  seek,
  stopped,
  report,
}: {
  project: Project;
  source: Source;
  run: Run;
  open: (s: Source) => void;
  menu: ShowMenu;
  text: RequestText;
  tick: number;
  seek: (n: number) => void;
  stopped: number;
  report: (s: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ w: 1000, h: 600, x: 0, y: 0 }),
    [zoom, setZoom] = useState(11),
    [snap, setSnap] = useState(1),
    [tool, setTool] = useState("draw");
  const [ids, setIds] = useState<string[]>([]),
    [cursor, setCursor] = useState(0),
    [clipboard, setClipboard] = useState<Omit<Clip, "id">[]>([]);
  const [ghost, setGhost] = useState<Clip[]>([]),
    [box, setBox] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null);
  const [waveforms, setWaveforms] = useState<
    Record<string, { peaks: number[]; duration: number }>
  >({});
  useEffect(() => {
    let disposed = false;
    for (const id of new Set(
      project.clips.filter((c) => c.kind === "sample").map((c) => c.sourceId),
    )) {
      void Promise.all([
        audio.getSamplePeaks(project, id),
        audio.getSampleDuration(project, id),
      ])
        .then(([peaks, duration]) => {
          if (!disposed)
            setWaveforms((old) => ({ ...old, [id]: { peaks, duration } }));
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
    };
  }, [project.samples, project.clips]);
  const bar = ticksPerBar(project.meter),
    unit = snap === -1 ? bar : snap;
  const selected = project.clips.filter((c) => ids.includes(c.id)),
    first = selected[0];
  const content = Math.max(
    bar * 16,
    ...project.clips.map((c) => c.tick + c.length + bar * 4),
  );
  const sourceInfo = (c: Pick<Clip, "kind" | "sourceId">) =>
    c.kind === "pattern"
      ? project.patterns.find((p) => p.id === c.sourceId)
      : project.samples.find((s) => s.id === c.sourceId);
  useEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() =>
      setView((v) => ({ ...v, w: el.clientWidth, h: el.clientHeight })),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollLeft = 0;
      setCursor(0);
    }
  }, [stopped]);
  useEffect(() => {
    setIds((old) => old.filter((id) => project.clips.some((c) => c.id === id)));
  }, [project.clips]);
  const point = (x: number, y: number) => ({
    tick: Math.max(0, (x - LEFT + view.x) / zoom),
    track: Math.floor((y - TOP + view.y) / ROW),
  });
  const hit = (x: number, y: number) => {
    const p = point(x, y);
    return [...project.clips]
      .reverse()
      .find(
        (c) =>
          c.track === p.track && p.tick >= c.tick && p.tick < c.tick + c.length,
      );
  };
  useEffect(() => {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const ratio = devicePixelRatio || 1;
    el.width = Math.round(view.w * ratio);
    el.height = Math.round(view.h * ratio);
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#20262b";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = "11px Segoe UI, Microsoft YaHei";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.beginPath();
    ctx.rect(LEFT, TOP, Math.max(0, view.w - LEFT), Math.max(0, view.h - TOP));
    ctx.clip();
    for (let r = 0; r < project.tracks.length; r++) {
      const y = TOP + r * ROW - view.y;
      ctx.fillStyle = r % 2 ? "#20262c" : "#232a30";
      ctx.fillRect(LEFT, y, view.w, ROW);
      ctx.fillStyle = "#13191d";
      ctx.fillRect(LEFT, y + ROW - 1, view.w, 1);
    }
    const from = Math.floor(view.x / zoom),
      to = Math.ceil((view.x + view.w) / zoom),
      stride = zoom < 8 ? 4 : 1;
    for (let t = Math.floor(from / stride) * stride; t <= to; t += stride) {
      const x = LEFT + t * zoom - view.x;
      ctx.fillStyle =
        t % bar === 0 ? "#485159" : t % 4 === 0 ? "#343e46" : "#2a333b";
      ctx.fillRect(x, TOP, 1, view.h);
    }
    for (const original of project.clips) {
      const c = ghost.find((g) => g.id === original.id) ?? original,
        info = sourceInfo(c);
      if (!info) continue;
      const x = LEFT + c.tick * zoom - view.x,
        y = TOP + c.track * ROW - view.y + 4,
        w = c.length * zoom - 2,
        h = ROW - 8;
      if (x + w < LEFT || x > view.w || y + h < TOP || y > view.h) continue;
      const active = ids.includes(c.id),
        muted = c.muted || project.tracks[c.track]?.muted,
        color = info.color;
      ctx.globalAlpha = muted ? 0.35 : 1;
      ctx.fillStyle = color + "35";
      ctx.fillRect(x + 1, y, Math.max(3, w), h);
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y, Math.max(3, w), 17);
      ctx.strokeStyle = active ? "#f1e3cc" : color + "95";
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x + 1.5, y + 0.5, Math.max(3, w), h - 1);
      ctx.lineWidth = 1;
      ctx.fillStyle = "#182226";
      ctx.fillText(
        (c.kind === "sample" ? "≋  " : "▤  ") + info.name,
        Math.max(LEFT + 5, x + 7),
        y + 9,
        Math.max(1, w - 12),
      );
      if (c.kind === "pattern") {
        const pattern = project.patterns.find((p) => p.id === c.sourceId)!;
        ctx.fillStyle = color;
        for (const n of pattern.notes) {
          if (n.tick < c.offset || n.tick >= c.offset + c.length) continue;
          const nx = x + (n.tick - c.offset) * zoom + 4;
          if (nx < LEFT || nx > view.w) continue;
          ctx.fillRect(
            nx,
            y + 22 + ((96 - n.pitch) / 72) * 23,
            Math.max(2, Math.min(zoom - 2, 12)),
            2,
          );
        }
        if (c.length + c.offset > pattern.length) {
          const emptyX = x + Math.max(0, pattern.length - c.offset) * zoom;
          ctx.fillStyle = "#12191e55";
          ctx.fillRect(
            Math.max(x, emptyX),
            y + 18,
            Math.max(0, x + w - Math.max(x, emptyX)),
            h - 18,
          );
        }
      } else {
        const wave = waveforms[c.sourceId];
        if (wave) {
          const totalTicks = ((wave.duration * project.bpm) / 60) * 4;
          ctx.strokeStyle = color + "bb";
          ctx.beginPath();
          for (
            let px = Math.max(3, LEFT - x);
            px < Math.min(w - 2, view.w - x);
            px += 2
          ) {
            const sampleTick = c.offset + px / zoom;
            if (sampleTick >= totalTicks) break;
            const amp =
              (wave.peaks[
                Math.min(
                  wave.peaks.length - 1,
                  Math.floor((sampleTick / totalTicks) * wave.peaks.length),
                )
              ] ?? 0) * 14;
            ctx.moveTo(x + px, y + 37 - amp);
            ctx.lineTo(x + px, y + 37 + amp);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    if (box) {
      ctx.fillStyle = "#b6d8e528";
      ctx.strokeStyle = "#b6d8e5";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
    ctx.fillStyle = "#2a3238";
    ctx.fillRect(0, 0, view.w, TOP);
    if (project.loop.enabled) {
      const x = LEFT + project.loop.start * zoom - view.x,
        w = (project.loop.end - project.loop.start) * zoom;
      ctx.fillStyle = "#d7ae6d30";
      ctx.fillRect(
        Math.max(LEFT, x),
        0,
        Math.min(w, view.w - Math.max(LEFT, x)),
        TOP,
      );
    }
    for (let t = Math.floor(from / bar) * bar; t <= to; t += bar) {
      const x = LEFT + t * zoom - view.x;
      if (x < LEFT) continue;
      ctx.fillStyle = "#b0b9bd";
      ctx.fillText(String(Math.floor(t / bar) + 1), x + 6, 15);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, LEFT, view.h - TOP);
    ctx.clip();
    project.tracks.forEach((track, i) => {
      const y = TOP + i * ROW - view.y;
      if (y + ROW < TOP || y > view.h) return;
      ctx.fillStyle = "#293137";
      ctx.fillRect(0, y, LEFT - 1, ROW - 1);
      ctx.fillStyle = track.color;
      ctx.fillRect(0, y + 6, 3, ROW - 13);
      ctx.fillStyle = "#637078";
      ctx.fillText(String(i + 1).padStart(2, "0"), 10, y + 18);
      ctx.fillStyle = "#d0d8dc";
      ctx.fillText(track.name, 33, y + 18, LEFT - 42);
      ctx.fillStyle = track.muted ? "#695a52" : "#8eb99d";
      ctx.fillRect(13, y + 39, 7, 7);
      ctx.fillStyle = track.solo ? "#e6b675" : "#77848c";
      ctx.fillText(
        track.solo ? "S 独奏" : track.locked ? "已锁定" : "音符 / 素材",
        31,
        y + 43,
      );
    });
    ctx.restore();
    ctx.fillStyle = "#2a3238";
    ctx.fillRect(0, 0, LEFT, TOP);
    ctx.fillStyle = "#a2afb6";
    ctx.fillText("TRACKS", 12, 15);
    const x = LEFT + tick * zoom - view.x;
    if (x >= LEFT && x <= view.w) {
      ctx.fillStyle = "#ecc17d";
      ctx.fillRect(x, 0, 1.5, view.h);
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x, 7);
      ctx.fill();
    }
  }, [project, view, zoom, tick, ids, ghost, box, waveforms]);
  async function copy(cut = false) {
    if (!selected.length) return;
    const start = Math.min(...selected.map((c) => c.tick));
    setClipboard(
      selected.map(({ id, ...c }) => ({ ...c, tick: c.tick - start })),
    );
    if (cut) await run({ type: "clips:remove", ids });
    report(`已${cut ? "剪切" : "复制"} ${selected.length} 个引用`);
  }
  async function paste() {
    if (!clipboard.length) return;
    const result = await run({
      type: "clips:paste",
      clips: clipboard.map((c) => ({ ...c, tick: c.tick + cursor })),
    });
    if (result)
      setIds(result.project.clips.slice(-clipboard.length).map((c) => c.id));
  }
  function clipMenu(c: Clip, x: number, y: number) {
    setIds((old) => (old.includes(c.id) ? old : [c.id]));
    const chosen = ids.includes(c.id) ? ids : [c.id];
    menu(x, y, [
      {
        label: "打开编辑器",
        action: () => open({ kind: c.kind, id: c.sourceId }),
      },
      {
        label: "创建独立副本",
        action: () => void run({ type: "source:unique", clipId: c.id }),
      },
      {
        label: "静音 / 取消静音",
        checked: c.muted,
        action: () =>
          void run({
            type: "clips:update",
            ids: chosen,
            patch: { muted: !c.muted },
          }),
      },
      { separator: true, label: "" },
      {
        label: "复制",
        shortcut: "Ctrl+C",
        action: () => {
          const start = c.tick;
          setClipboard(
            project.clips
              .filter((v) => chosen.includes(v.id))
              .map(({ id, ...v }) => ({ ...v, tick: v.tick - start })),
          );
        },
      },
      {
        label: "删除引用",
        danger: true,
        action: () => void run({ type: "clips:remove", ids: chosen }),
      },
    ]);
  }
  return (
    <div
      className="playlist"
      tabIndex={0}
      onKeyDown={(e) => {
        if (
          e.defaultPrevented ||
          (e.target as HTMLElement).matches("input,select,textarea")
        )
          return;
        const k = e.key.toLowerCase(),
          mod = e.ctrlKey || e.metaKey;
        if (mod && ["a", "c", "x", "v", "b"].includes(k)) {
          e.preventDefault();
          e.stopPropagation();
          if (k === "a") setIds(project.clips.map((c) => c.id));
          if (k === "c" || k === "x") void copy(k === "x");
          if (k === "v") void paste();
          if (k === "b" && selected.length) {
            const start = Math.min(...selected.map((c) => c.tick)),
              end = Math.max(...selected.map((c) => c.tick + c.length));
            void run({
              type: "clips:paste",
              clips: selected.map(({ id, ...c }) => ({
                ...c,
                tick: c.tick + end - start,
              })),
            });
          }
        }
        if (ids.length && ["Delete", "Backspace"].includes(e.key)) {
          e.preventDefault();
          void run({ type: "clips:remove", ids });
        }
        if (ids.length && e.key.startsWith("Arrow")) {
          e.preventDefault();
          void run({
            type: "clips:move",
            ids,
            ticks:
              e.key === "ArrowRight" ? unit : e.key === "ArrowLeft" ? -unit : 0,
            tracks: e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0,
          });
        }
      }}
    >
      <div className="panel-title">
        <span className="tiny-accent" />
        <strong>Playlist</strong>
        <span className="subtle">编排</span>
        <span className="spacer" />
        <span className="small-mono">
          {project.clips.length} CLIPS · {project.tracks.length} TRACKS
        </span>
      </div>
      <div className="canvas-toolbar">
        <div className="tool-group">
          <button
            aria-label="编排绘制"
            className={tool === "draw" ? "selected" : ""}
            onClick={() => setTool("draw")}
            title="绘制 / 拖动"
          >
            <Pencil size={15} />
          </button>
          <button
            aria-label="编排选择"
            className={tool === "select" ? "selected" : ""}
            onClick={() => setTool("select")}
            title="框选"
          >
            <MousePointer2 size={15} />
          </button>
        </div>
        <select
          aria-label="编排吸附"
          value={snap}
          onChange={(e) => setSnap(+e.target.value)}
        >
          <option value={0.5}>1/2 tick</option>
          <option value={1 / 3}>三连音</option>
          <option value={1}>1 tick</option>
          <option value={2}>1/2 拍</option>
          <option value={4}>1 拍</option>
          <option value={-1}>1 小节</option>
        </select>
        <span className="divider" />
        <button
          title="复制 Ctrl+C"
          aria-label="复制引用"
          disabled={!ids.length}
          onClick={() => void copy()}
        >
          <Copy size={14} />
        </button>
        <button
          title="剪切 Ctrl+X"
          aria-label="剪切引用"
          disabled={!ids.length}
          onClick={() => void copy(true)}
        >
          <Scissors size={14} />
        </button>
        <button
          title="粘贴 Ctrl+V"
          aria-label="粘贴引用"
          disabled={!clipboard.length}
          onClick={() => void paste()}
        >
          <ClipboardPaste size={14} />
        </button>
        <button
          title="删除 Delete"
          aria-label="删除引用"
          disabled={!ids.length}
          onClick={() => void run({ type: "clips:remove", ids })}
        >
          <Trash2 size={14} />
        </button>
        <button
          title="新增轨道"
          aria-label="新增轨道"
          onClick={() => void run({ type: "track:add" })}
        >
          <Plus size={14} />
        </button>
        {first && (
          <>
            <span className="divider" />
            <label className="inline-value">
              长度
              <input
                aria-label="引用长度"
                type="number"
                min={0.25}
                step={unit}
                key={first.id + ":" + first.length}
                defaultValue={first.length}
                onBlur={(e) => {
                  const length = +e.target.value;
                  if (length > 0 && length !== first.length)
                    void run({
                      type: "clips:update",
                      ids: [first.id],
                      patch: { length },
                    });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </label>
          </>
        )}
        <span className="spacer" />
        <button
          aria-label="缩小编排"
          disabled={zoom <= 4}
          onClick={() => setZoom((v) => Math.max(4, v - 3))}
        >
          <ZoomOut size={14} />
        </button>
        <input
          aria-label="编排缩放"
          className="zoom-range"
          type="range"
          min={4}
          max={36}
          value={zoom}
          onChange={(e) => setZoom(+e.target.value)}
        />
        <button
          aria-label="放大编排"
          disabled={zoom >= 36}
          onClick={() => setZoom((v) => Math.min(36, v + 3))}
        >
          <ZoomIn size={14} />
        </button>
      </div>
      <div
        className="arrangement-scroll"
        ref={scroller}
        onScroll={(e) => {
          const x = e.currentTarget.scrollLeft,
            y = e.currentTarget.scrollTop;
          setView((v) => ({ ...v, x, y }));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const r = canvas.current!.getBoundingClientRect(),
            x = e.clientX - r.left,
            y = e.clientY - r.top;
          if (x >= LEFT) return;
          const trackIndex = point(x, y).track,
            track = project.tracks[trackIndex];
          if (!track) return;
          menu(e.clientX, e.clientY, [
            {
              label: "重命名轨道",
              action: () =>
                text(
                  "轨道名称",
                  track.name,
                  (name) =>
                    void run({
                      type: "track:update",
                      id: track.id,
                      patch: { name },
                    }),
                ),
            },
            {
              label: "静音",
              checked: track.muted,
              action: () =>
                void run({
                  type: "track:update",
                  id: track.id,
                  patch: { muted: !track.muted },
                }),
            },
            {
              label: "独奏",
              checked: track.solo,
              action: () =>
                void run({
                  type: "track:update",
                  id: track.id,
                  patch: { solo: !track.solo },
                }),
            },
            {
              label: "锁定",
              checked: track.locked,
              action: () =>
                void run({
                  type: "track:update",
                  id: track.id,
                  patch: { locked: !track.locked },
                }),
            },
            { separator: true, label: "" },
            {
              label: "新增轨道",
              action: () => void run({ type: "track:add" }),
            },
            {
              label: "删除轨道及引用",
              danger: true,
              action: () => void run({ type: "track:remove", id: track.id }),
            },
          ]);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          try {
            const data = JSON.parse(
              e.dataTransfer.getData("application/noteblock-source"),
            ) as Source;
            const r = canvas.current!.getBoundingClientRect(),
              p = point(e.clientX - r.left, e.clientY - r.top);
            if (p.track < 0 || p.track >= project.tracks.length) return;
            place(data, snapTick(p.tick, unit, e.altKey), p.track);
          } catch {
            report("拖入项目中的 Pattern 或采样来编排");
          }
        }}
      >
        <div
          style={{
            width: Math.max(view.w, LEFT + content * zoom),
            height: Math.max(view.h, TOP + ROW * project.tracks.length),
          }}
        >
          <canvas
            ref={canvas}
            data-testid="playlist-canvas"
            style={{
              position: "sticky",
              left: 0,
              top: 0,
              width: view.w,
              height: view.h,
            }}
            onDoubleClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect(),
                c = hit(e.clientX - r.left, e.clientY - r.top);
              if (c) open({ kind: c.kind, id: c.sourceId });
            }}
            onPointerDown={(e) => {
              const el = e.currentTarget,
                r = el.getBoundingClientRect(),
                x = e.clientX - r.left,
                y = e.clientY - r.top;
              el.closest<HTMLElement>(".playlist")?.focus();
              const p = point(x, y);
              if (x < LEFT) {
                if (
                  e.button === 0 &&
                  y >= TOP &&
                  project.tracks[p.track] &&
                  x < 28 &&
                  y - (TOP + p.track * ROW - view.y) > 29
                )
                  void run({
                    type: "track:update",
                    id: project.tracks[p.track].id,
                    patch: { muted: !project.tracks[p.track].muted },
                  });
                return;
              }
              if (y < TOP) {
                if (e.button === 0) {
                  const at = snapTick(p.tick, unit, e.altKey);
                  setCursor(at);
                  seek(at);
                }
                return;
              }
              if (
                p.track < 0 ||
                p.track >= project.tracks.length ||
                project.tracks[p.track].locked
              )
                return;
              const c = hit(x, y);
              if (e.button === 2) {
                if (c) void run({ type: "clips:remove", ids: [c.id] });
                return;
              }
              if (e.button !== 0) return;
              const at = snapTick(p.tick, unit, e.altKey);
              setCursor(at);
              el.setPointerCapture(e.pointerId);
              const clear = () => {
                el.onpointermove = null;
                el.onpointerup = null;
                el.onpointercancel = null;
                setGhost([]);
                setBox(null);
              };
              el.onpointercancel = clear;
              if (
                c &&
                y - (TOP + c.track * ROW - view.y + 4) < 18 &&
                x - (LEFT + c.tick * zoom - view.x) < 16
              ) {
                clipMenu(c, e.clientX, e.clientY);
                clear();
                return;
              }
              if (!c && (tool === "select" || e.shiftKey || e.ctrlKey)) {
                el.onpointermove = (move) =>
                  setBox({
                    x: Math.min(x, move.clientX - r.left),
                    y: Math.min(y, move.clientY - r.top),
                    w: Math.abs(move.clientX - r.left - x),
                    h: Math.abs(move.clientY - r.top - y),
                  });
                el.onpointerup = (up) => {
                  const end = point(up.clientX - r.left, up.clientY - r.top);
                  const found = project.clips
                    .filter(
                      (c) =>
                        c.tick + c.length >= Math.min(p.tick, end.tick) &&
                        c.tick <= Math.max(p.tick, end.tick) &&
                        c.track >= Math.min(p.track, end.track) &&
                        c.track <= Math.max(p.track, end.track),
                    )
                    .map((c) => c.id);
                  setIds(e.ctrlKey ? [...new Set([...ids, ...found])] : found);
                  clear();
                };
                return;
              }
              if (!c) {
                place(source, at, p.track);
                clear();
                return;
              }
              const right = LEFT + (c.tick + c.length) * zoom - view.x,
                left = LEFT + c.tick * zoom - view.x,
                edge =
                  Math.abs(x - right) < 7
                    ? "right"
                    : Math.abs(x - left) < 5
                      ? "left"
                      : undefined;
              const selectedIds = e.ctrlKey
                ? ids.includes(c.id)
                  ? ids.filter((id) => id !== c.id)
                  : [...ids, c.id]
                : ids.includes(c.id)
                  ? ids
                  : [c.id];
              setIds(selectedIds);
              const originals = project.clips.filter((c) =>
                  selectedIds.includes(c.id),
                ),
                sx = e.clientX,
                sy = e.clientY;
              const change = (event: PointerEvent) => {
                const step = event.altKey ? 1 / 24 : unit,
                  d = Math.round((event.clientX - sx) / zoom / step) * step;
                if (edge)
                  return [
                    resizeClip(
                      c,
                      edge,
                      (edge === "right" ? c.tick + c.length : c.tick) + d,
                    ),
                  ];
                const dr = Math.round((event.clientY - sy) / ROW);
                return originals.map((c) => ({
                  ...c,
                  tick: c.tick + d,
                  track: c.track + dr,
                }));
              };
              el.onpointermove = (move) => setGhost(change(move));
              el.onpointerup = (up) => {
                const next = change(up);
                if (edge) {
                  const v = next[0];
                  if (v.tick !== c.tick || v.length !== c.length)
                    void run({
                      type: "clips:update",
                      ids: [c.id],
                      patch: {
                        tick: v.tick,
                        length: v.length,
                        offset: v.offset,
                      },
                    });
                } else if (next.length) {
                  const dt = next[0].tick - originals[0].tick,
                    dr = next[0].track - originals[0].track;
                  if (dt || dr) {
                    if (up.shiftKey)
                      void run({
                        type: "clips:paste",
                        clips: next.map(({ id, ...c }) => c),
                      });
                    else
                      void run({
                        type: "clips:move",
                        ids: selectedIds,
                        ticks: dt,
                        tracks: dr,
                      });
                  }
                }
                clear();
              };
            }}
          />
        </div>
      </div>
      <div className="canvas-footer">
        <span>
          {ids.length
            ? `${ids.length} 个引用已选`
            : "左键放置 · 右键删除 · Ctrl 框选 · Shift 拖动复制"}
        </span>
        <span>位置 {Number(cursor.toFixed(3))} tick</span>
        <span className="spacer" />
        <span>边缘调整：补空白 / 裁剪</span>
      </div>
    </div>
  );
  async function place(s: Source, at: number, track: number) {
    const info =
      s.kind === "pattern"
        ? project.patterns.find((p) => p.id === s.id)
        : project.samples.find((p) => p.id === s.id);
    if (!info) return;
    try {
      const length =
        s.kind === "pattern"
          ? project.patterns.find((p) => p.id === s.id)!.length
          : Math.max(
              1 / 24,
              (((await audio.getSampleDuration(project, s.id)) * project.bpm) /
                60) *
                4,
            );
      const result = await run({
        type: "clip:add",
        clip: {
          kind: s.kind,
          sourceId: s.id,
          tick: at,
          length,
          offset: 0,
          track,
          muted: false,
        },
      });
      if (result) setIds([result.project.clips.at(-1)!.id]);
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
    }
  }
}

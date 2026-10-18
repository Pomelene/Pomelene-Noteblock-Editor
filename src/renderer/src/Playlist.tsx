import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  Paintbrush,
  Eraser,
  VolumeX,
  MoveHorizontal,
  Scan,
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
import { resizeClip } from "./editing";
import { SnapPicker } from "./SnapPicker";
import {
  snapPosition,
  snapUnit,
  snapDelta,
  gridTicks,
  type SnapId,
} from "./snap";
import {
  BrushStroke,
  captureGesture,
  clipEdge,
  segmentIntersectsRect,
} from "./gestures";
import { audio } from "./audio";
import { isShortcutInput, resolveShortcut } from "./shortcuts";
import { useEditorWheelZoom, useEditorRowHeight } from "./useEditorViewport";
import "./editor-viewport.css";

const LEFT = 160,
  TOP = 30;
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
  chooseSource,
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
  chooseSource?: (source: Source) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ w: 1000, h: 600, x: 0, y: 0 }),
    [zoom, setZoom] = useState(11),
    [snap, setSnap] = useState<SnapId>("auto"),
    [tool, setTool] = useState("draw");
  const [ROW, setRowHeight] = useState(64);
  const [ids, setIds] = useState<string[]>([]),
    [cursor, setCursor] = useState(0),
    [clipboard, setClipboard] = useState<Omit<Clip, "id">[]>([]);
  const cancelGesture = useRef<(() => void) | null>(null);
  const updateScroll = (x: number, y: number) =>
    setView((v) => ({ ...v, x, y }));
  useEditorWheelZoom({
    scroller,
    zoom,
    min: 4,
    max: 36,
    gutter: LEFT,
    setZoom,
    cancelGesture,
    onScroll: updateScroll,
  });
  useEditorRowHeight(scroller, ROW, view.y, updateScroll);
  useEffect(() => {
    cancelGesture.current?.();
  }, [zoom, ROW]);
  const previousSnap = useRef<SnapId>("auto");
  const [erased, setErased] = useState<string[]>([]),
    [feedback, setFeedback] = useState("");
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
    for (const id of new Set([
      ...project.clips
        .filter((c) => c.kind === "sample")
        .map((c) => c.sourceId),
      ...(source.kind === "sample" ? [source.id] : []),
    ])) {
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
  }, [project.samples, project.clips, source.kind, source.id]);
  const bar = ticksPerBar(project.meter),
    unit = snapUnit(snap, zoom, bar);
  const atTick = (tick: number, alt = false) =>
    snapPosition(tick, snap, zoom, bar, alt);
  const selected = project.clips.filter((c) => ids.includes(c.id)),
    first = selected[0];
  const content = Math.max(
    bar * 16,
    ...project.clips.map((c) => c.tick + c.length + bar * 4),
  );
  const sourceInfo = (c: Pick<Clip, "kind" | "sourceId">) =>
    c.kind === "pattern"
      ? project.patterns.find((p) => p.id === c.sourceId)
      : c.kind === "phrase"
        ? project.phrases?.find((p) => p.id === c.sourceId)
        : project.samples.find((s) => s.id === c.sourceId);
  useEffect(() => {
    cancelGesture.current?.();
    setIds([]);
    return () => cancelGesture.current?.();
  }, [project.id]);
  useEffect(() => {
    cancelGesture.current?.();
  }, [project]);
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
          c.track === p.track &&
          p.tick >= c.tick &&
          p.tick <= c.tick + c.length + 3 / zoom,
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
      lines = gridTicks(from, to, snap, zoom, bar);
    for (const t of lines) {
      const x = LEFT + t * zoom - view.x;
      ctx.fillStyle =
        Math.abs(t / bar - Math.round(t / bar)) < 1e-6
          ? "#485159"
          : Math.abs(t / 4 - Math.round(t / 4)) < 1e-6
            ? "#343e46"
            : "#2a333b";
      ctx.fillRect(x, TOP, 1, view.h);
    }
    for (const original of [
      ...project.clips,
      ...ghost.filter((g) => !project.clips.some((c) => c.id === g.id)),
    ]) {
      if (erased.includes(original.id)) continue;
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
      ctx.fillRect(x + 1, y, Math.max(3, w), Math.min(17, h));
      ctx.strokeStyle = active ? "#f1e3cc" : color + "95";
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x + 1.5, y + 0.5, Math.max(3, w), h - 1);
      ctx.lineWidth = 1;
      ctx.fillStyle = "#182226";
      ctx.fillText(
        (c.kind === "sample" ? "≋  " : "▤  ") + info.name,
        Math.max(LEFT + 5, x + 7),
        y + Math.min(9, h / 2),
        Math.max(1, w - 12),
      );
      if (c.kind !== "sample") {
        const pattern =
          c.kind === "phrase"
            ? project.phrases!.find((p) => p.id === c.sourceId)!
            : project.patterns.find((p) => p.id === c.sourceId)!;
        ctx.fillStyle = color;
        for (const n of h >= 28 ? pattern.notes : []) {
          if (
            n.tick < c.offset ||
            n.tick >= Math.min(pattern.length, c.offset + c.length)
          )
            continue;
          const nx = x + (n.tick - c.offset) * zoom + 4;
          if (nx < LEFT || nx > view.w) continue;
          ctx.fillRect(
            nx,
            y + 22 + ((96 - n.pitch) / 72) * Math.max(0, h - 33),
            Math.max(2, Math.min(zoom - 2, 12)),
            2,
          );
        }
        if (h >= 28 && c.length + c.offset > pattern.length) {
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
        if (wave && h >= 28) {
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
              ] ?? 0) * Math.max(0, (h - 28) / 2);
            ctx.moveTo(x + px, y + 18 + (h - 18) / 2 - amp);
            ctx.lineTo(x + px, y + 18 + (h - 18) / 2 + amp);
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
      const labelY = ROW < 52 ? ROW / 2 : 18;
      ctx.fillText(String(i + 1).padStart(2, "0"), 10, y + labelY);
      ctx.fillStyle = "#d0d8dc";
      ctx.fillText(track.name, 33, y + labelY, LEFT - 42);
      if (ROW >= 52) {
        ctx.fillStyle = track.muted ? "#695a52" : "#8eb99d";
        ctx.fillRect(13, y + 39, 7, 7);
        ctx.fillStyle = track.solo ? "#e6b675" : "#77848c";
        ctx.fillText(
          track.solo ? "S 独奏" : track.locked ? "已锁定" : "音符 / 素材",
          31,
          y + 43,
        );
      }
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
  }, [
    project,
    view,
    zoom,
    ROW,
    snap,
    tick,
    ids,
    ghost,
    box,
    waveforms,
    erased,
  ]);
  async function copy(cut = false, chosen = ids) {
    const selected = project.clips.filter((c) => chosen.includes(c.id));
    if (!selected.length) return;
    const start = Math.min(...selected.map((c) => c.tick));
    setClipboard(
      selected.map(({ id, ...c }) => ({ ...c, tick: c.tick - start })),
    );
    if (cut) await run({ type: "clips:remove", ids: chosen });
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
    chooseSource?.({ kind: c.kind, id: c.sourceId });
    setIds((old) => (old.includes(c.id) ? old : [c.id]));
    const chosen = ids.includes(c.id) ? ids : [c.id];
    menu(x, y, [
      {
        label: c.kind === "phrase" ? "打开只读预览" : "打开编辑器",
        action: () => open({ kind: c.kind, id: c.sourceId }),
      },
      {
        label: c.kind === "phrase" ? "根据采样创建 Pattern" : "创建独立副本",
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
      {
        label: "保存选区为片段采样",
        action: () => void run({ type: "phrase:fromClips", ids: chosen }),
      },
      { separator: true, label: "" },
      {
        label: "复制",
        shortcut: "Ctrl+C",
        action: () => void copy(false, chosen),
      },
      {
        label: "剪切",
        shortcut: "Ctrl+X",
        action: () => void copy(true, chosen),
      },
      {
        label: "粘贴",
        shortcut: "Ctrl+V",
        disabled: !clipboard.length,
        action: () => void paste(),
      },
      {
        label: "接续复制",
        shortcut: "Ctrl+B",
        action: () => duplicate(chosen),
      },
      {
        label: "全选",
        shortcut: "Ctrl+A",
        action: () => setIds(project.clips.map((v) => v.id)),
      },
      { label: "取消选择", action: () => setIds([]) },
      { label: "缩放适应内容", action: fit },
      {
        label: "删除引用",
        danger: true,
        action: () => void run({ type: "clips:remove", ids: chosen }),
      },
    ]);
  }
  function duplicate(chosen = ids) {
    const clips = project.clips.filter((c) => chosen.includes(c.id));
    if (!clips.length) return;
    const start = Math.min(...clips.map((c) => c.tick)),
      end = Math.max(...clips.map((c) => c.tick + c.length));
    void run({
      type: "clips:paste",
      clips: clips.map(({ id, ...c }) => ({
        ...c,
        tick: c.tick + end - start,
      })),
    });
  }
  function fit(chosen = project.clips) {
    if (!chosen.length) return;
    const start =
      chosen === project.clips ? 0 : Math.min(...chosen.map((c) => c.tick));
    const end = Math.max(start + bar, ...chosen.map((c) => c.tick + c.length));
    const nextZoom = Math.max(
      4,
      Math.min(36, (view.w - LEFT - 24) / (end - start)),
    );
    setZoom(nextZoom);
    if (scroller.current) scroller.current.scrollLeft = start * nextZoom;
  }
  return (
    <div
      className="playlist"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.defaultPrevented || isShortcutInput(e.target)) return;
        if (
          e.key === "Escape" &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.shiftKey &&
          cancelGesture.current
        ) {
          cancelGesture.current?.();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const action = resolveShortcut(e, "playlist");
        if (!action) return;
        e.preventDefault();
        e.stopPropagation();
        if (action.startsWith("tool:")) {
          setTool(action.slice(5) === "erase" ? "delete" : action.slice(5));
          return;
        }
        switch (action) {
          case "selection:all":
            setIds(project.clips.map((c) => c.id));
            break;
          case "selection:none":
            setIds([]);
            break;
          case "selection:invert":
            setIds(
              project.clips.filter((c) => !ids.includes(c.id)).map((c) => c.id),
            );
            break;
          case "edit:copy":
            void copy();
            break;
          case "edit:cut":
            void copy(true);
            break;
          case "edit:paste":
            void paste();
            break;
          case "edit:duplicate":
            duplicate();
            break;
          case "edit:delete":
            if (ids.length) void run({ type: "clips:remove", ids });
            break;
          case "snap:toggle":
            if (snap === "none") setSnap(previousSnap.current);
            else {
              previousSnap.current = snap;
              setSnap("none");
            }
            break;
          case "seek:start":
            setCursor(0);
            seek(0);
            if (scroller.current) scroller.current.scrollLeft = 0;
            break;
          case "seek:end": {
            const end = Math.max(
              0,
              ...project.clips.map((c) => c.tick + c.length),
            );
            setCursor(end);
            seek(end);
            break;
          }
          case "zoom:in":
            setZoom((v) => Math.min(36, v + 3));
            break;
          case "zoom:out":
            setZoom((v) => Math.max(4, v - 3));
            break;
          case "zoom:1":
            setZoom(4);
            break;
          case "zoom:2":
            setZoom(11);
            break;
          case "zoom:3":
            setZoom(24);
            break;
          case "zoom:4":
            fit();
            break;
          case "zoom:selection":
            fit(selected);
            break;
        }
        if (ids.length && action.startsWith("move:")) {
          void run({
            type: "clips:move",
            ids,
            ticks:
              action === "move:right"
                ? unit
                : action === "move:left"
                  ? -unit
                  : 0,
            tracks: action === "move:down" ? 1 : action === "move:up" ? -1 : 0,
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
            title="绘制 / 拖动 (P)"
          >
            <Pencil size={15} />
          </button>
          <button
            aria-label="编排笔刷"
            title="连续放置 (B)"
            className={tool === "brush" ? "selected" : ""}
            onClick={() => setTool("brush")}
          >
            <Paintbrush size={15} />
          </button>
          <button
            aria-label="编排删除"
            title="连续删除 (D)"
            className={tool === "delete" ? "selected" : ""}
            onClick={() => setTool("delete")}
          >
            <Eraser size={15} />
          </button>
          <button
            aria-label="编排静音"
            title="切换引用静音 (T)"
            className={tool === "mute" ? "selected" : ""}
            onClick={() => setTool("mute")}
          >
            <VolumeX size={15} />
          </button>
          <button
            aria-label="编排滑移"
            title="滑移源内容 (S)"
            className={tool === "slip" ? "selected" : ""}
            onClick={() => setTool("slip")}
          >
            <MoveHorizontal size={15} />
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
        {chooseSource && (
          <select
            aria-label="放置来源"
            title="当前放置来源"
            style={{
              width: 160,
              maxWidth: 180,
              minWidth: 120,
              flexShrink: 0,
              marginLeft: 4,
            }}
            value={`${source.kind}:${source.id}`}
            onChange={(event) => {
              const [kind, ...id] = event.target.value.split(":");
              chooseSource({ kind: kind as Source["kind"], id: id.join(":") });
            }}
          >
            <optgroup label="Pattern">
              {project.patterns.map((item) => (
                <option key={item.id} value={`pattern:${item.id}`}>
                  {item.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="片段采样">
              {(project.phrases ?? []).map((item) => (
                <option key={item.id} value={`phrase:${item.id}`}>
                  {item.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="音频">
              {project.samples.map((item) => (
                <option key={item.id} value={`sample:${item.id}`}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          </select>
        )}
        <SnapPicker label="编排吸附" value={snap} onChange={setSnap} />
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
        <label className="editor-row-height" title="调整轨道行高以浏览更多声部">
          行高
          <input
            aria-label="编排行高"
            type="number"
            min={24}
            max={128}
            step={4}
            defaultValue={ROW}
            onChange={(e) => {
              const value = e.target.valueAsNumber;
              if (Number.isFinite(value) && value >= 24 && value <= 128) {
                cancelGesture.current?.();
                setRowHeight(value);
              }
            }}
            onBlur={(e) => {
              const value = Math.max(
                24,
                Math.min(128, e.target.valueAsNumber || ROW),
              );
              e.target.value = String(value);
              cancelGesture.current?.();
              setRowHeight(value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <button
          aria-label="编排适应内容"
          title="缩放适应内容 (Shift+4)"
          onClick={() => fit()}
        >
          <Scan size={14} />
        </button>
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
          step="any"
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
            place(data, atTick(p.tick, e.altKey), p.track);
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
            onPointerMove={(e) => {
              if (e.buttons) return;
              const r = e.currentTarget.getBoundingClientRect(),
                x = e.clientX - r.left,
                y = e.clientY - r.top,
                c = hit(x, y);
              e.currentTarget.style.cursor =
                c &&
                clipEdge(
                  x,
                  LEFT + c.tick * zoom - view.x,
                  LEFT + (c.tick + c.length) * zoom - view.x,
                )
                  ? "ew-resize"
                  : tool === "delete"
                    ? "not-allowed"
                    : tool === "select"
                      ? "crosshair"
                      : "default";
            }}
            onPointerDown={(e) => {
              const el = e.currentTarget,
                r = el.getBoundingClientRect(),
                x = e.clientX - r.left,
                y = e.clientY - r.top,
                p = point(x, y);
              el.closest<HTMLElement>(".playlist")?.focus();
              if (x < LEFT) {
                if (
                  e.button === 0 &&
                  y >= TOP &&
                  project.tracks[p.track] &&
                  x < 28 &&
                  ROW >= 52 &&
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
                  const at = atTick(p.tick, e.altKey);
                  setCursor(at);
                  seek(at);
                }
                return;
              }
              if (
                !project.tracks[p.track] ||
                project.tracks[p.track].locked ||
                ![0, 2].includes(e.button)
              )
                return;
              cancelGesture.current?.();
              e.preventDefault();
              const c = hit(x, y),
                at = atTick(p.tick, e.altKey);
              if (c && e.button === 0 && tool !== "delete")
                chooseSource?.({ kind: c.kind, id: c.sourceId });
              setCursor(at);
              const start = (
                move: (v: PointerEvent) => void,
                up: (v: PointerEvent) => void,
              ) => {
                cancelGesture.current = captureGesture(
                  el,
                  e.pointerId,
                  move,
                  up,
                  () => {
                    setGhost([]);
                    setErased([]);
                    setBox(null);
                    setFeedback("");
                    cancelGesture.current = null;
                  },
                );
              };
              const edge = c
                ? clipEdge(
                    x,
                    LEFT + c.tick * zoom - view.x,
                    LEFT + (c.tick + c.length) * zoom - view.x,
                  )
                : undefined;
              if (e.button === 2 || tool === "delete") {
                const removed = new Set<string>();
                let previous = { x: p.tick, y: p.track + 0.5 };
                const erase = (v: { clientX: number; clientY: number }) => {
                  const current = point(v.clientX - r.left, v.clientY - r.top),
                    end = { x: current.tick, y: current.track + 0.5 };
                  for (const clip of project.clips)
                    if (
                      !project.tracks[clip.track]?.locked &&
                      segmentIntersectsRect(previous, end, {
                        x: clip.tick,
                        y: clip.track,
                        w: clip.length,
                        h: 1,
                      })
                    )
                      removed.add(clip.id);
                  previous = end;
                  setErased([...removed]);
                  setFeedback(`删除 ${removed.size} 个引用 · 松开提交`);
                };
                erase(e);
                start(erase, (up) => {
                  erase(up);
                  if (removed.size)
                    void run({ type: "clips:remove", ids: [...removed] });
                });
                return;
              }
              if (e.ctrlKey || tool === "select") {
                if (c && e.ctrlKey) {
                  setIds(
                    ids.includes(c.id)
                      ? ids.filter((id) => id !== c.id)
                      : [...ids, c.id],
                  );
                  return;
                }
                start(
                  (move) =>
                    setBox({
                      x: Math.min(x, move.clientX - r.left),
                      y: Math.min(y, move.clientY - r.top),
                      w: Math.abs(move.clientX - r.left - x),
                      h: Math.abs(move.clientY - r.top - y),
                    }),
                  (up) => {
                    const end = point(up.clientX - r.left, up.clientY - r.top),
                      found = project.clips
                        .filter(
                          (v) =>
                            v.tick + v.length >= Math.min(p.tick, end.tick) &&
                            v.tick <= Math.max(p.tick, end.tick) &&
                            v.track >= Math.min(p.track, end.track) &&
                            v.track <= Math.max(p.track, end.track),
                        )
                        .map((v) => v.id);
                    setIds(
                      e.ctrlKey ? [...new Set([...ids, ...found])] : found,
                    );
                  },
                );
                return;
              }
              if (c && tool === "mute") {
                void run({
                  type: "clips:update",
                  ids: [c.id],
                  patch: { muted: !c.muted },
                });
                return;
              }
              const brush = tool === "brush" || (!c && e.shiftKey);
              if (brush || !c) {
                if (tool === "slip" || tool === "mute") return;
                const info = sourceInfo({
                  kind: source.kind,
                  sourceId: source.id,
                });
                if (!info) return;
                const length =
                  source.kind === "sample"
                    ? Math.max(
                        1 / 24,
                        (((waveforms[source.id]?.duration ??
                          project.samples.find((s) => s.id === source.id)
                            ?.duration ??
                          0) *
                          project.bpm) /
                          60) *
                          4,
                      )
                    : (info as { length: number }).length;
                if (source.kind === "sample" && length <= 1 / 24) {
                  report("音频正在加载，请稍后放置");
                  return;
                }
                const stroke = new BrushStroke(length, at);
                let pending: Clip[] = [];
                const paint = (v: {
                  clientX: number;
                  clientY: number;
                  altKey: boolean;
                }) => {
                  const q = point(v.clientX - r.left, v.clientY - r.top);
                  if (brush) {
                    const cells = stroke.visit(at + q.tick - p.tick, q.track);
                    if (stroke.exceeded) {
                      pending = [];
                      setGhost([]);
                      setFeedback("手势超过 10,000 个位置，已取消；请分段放置");
                      return;
                    }
                    for (const cell of cells) {
                      if (
                        cell.tick < 0 ||
                        !project.tracks[cell.row] ||
                        project.tracks[cell.row].locked
                      )
                        continue;
                      if (
                        project.clips.some(
                          (v) =>
                            v.kind === source.kind &&
                            v.sourceId === source.id &&
                            v.track === cell.row &&
                            Math.abs(v.tick - cell.tick) < 1e-7,
                        )
                      )
                        continue;
                      pending.push({
                        id: `preview-${pending.length}`,
                        kind: source.kind,
                        sourceId: source.id,
                        tick: cell.tick,
                        track: cell.row,
                        length,
                        offset: 0,
                        muted: false,
                      });
                    }
                  } else if (
                    project.tracks[q.track] &&
                    !project.tracks[q.track].locked
                  )
                    pending = [
                      {
                        id: "preview-new",
                        kind: source.kind,
                        sourceId: source.id,
                        tick: atTick(q.tick, v.altKey),
                        track: q.track,
                        length,
                        offset: 0,
                        muted: false,
                      },
                    ];
                  setGhost([...pending]);
                  setFeedback(
                    `${brush ? "笔刷" : "放置"} ${pending.length} 个引用 · 松开提交`,
                  );
                };
                paint(e);
                start(paint, (up) => {
                  paint(up);
                  if (pending.length)
                    void run({
                      type: "clips:paste",
                      clips: pending.map(({ id, ...v }) => v),
                    }).then((result) => {
                      if (result)
                        setIds(
                          result.project.clips
                            .slice(-pending.length)
                            .map((v) => v.id),
                        );
                    });
                });
                return;
              }
              if (
                !edge &&
                y - (TOP + c.track * ROW - view.y + 4) < 18 &&
                x - (LEFT + c.tick * zoom - view.x) < 24
              ) {
                clipMenu(c, e.clientX, e.clientY);
                return;
              }
              const selectedIds =
                edge || tool === "slip"
                  ? [c.id]
                  : ids.includes(c.id)
                    ? ids
                    : [c.id];
              setIds(selectedIds);
              const originals = project.clips.filter((v) =>
                  selectedIds.includes(v.id),
                ),
                copyDrag = e.shiftKey;
              const change = (event: PointerEvent) => {
                let d = snapDelta(
                  (event.clientX - e.clientX) / zoom,
                  snap,
                  zoom,
                  bar,
                  event.altKey,
                );
                if (edge)
                  return [
                    resizeClip(
                      c,
                      edge,
                      (edge === "right" ? c.tick + c.length : c.tick) + d,
                    ),
                  ];
                if (tool === "slip")
                  return [{ ...c, offset: Math.max(0, c.offset - d) }];
                d = Math.max(-Math.min(...originals.map((v) => v.tick)), d);
                const dr = Math.max(
                  -Math.min(...originals.map((v) => v.track)),
                  Math.min(
                    project.tracks.length -
                      1 -
                      Math.max(...originals.map((v) => v.track)),
                    Math.round((event.clientY - e.clientY) / ROW),
                  ),
                );
                return originals.map((v) => ({
                  ...v,
                  tick: v.tick + d,
                  track: v.track + dr,
                }));
              };
              start(
                (move) => {
                  const next = change(move);
                  setGhost(next);
                  if (edge) {
                    const v = next[0],
                      info = sourceInfo(v),
                      sourceLength =
                        v.kind === "sample"
                          ? (((waveforms[v.sourceId]?.duration ?? 0) *
                              project.bpm) /
                              60) *
                            4
                          : ((info as { length: number } | undefined)?.length ??
                            0);
                    setFeedback(
                      `长度 ${Number(v.length.toFixed(3))} tick · 补白 ${Number(Math.max(0, v.length + v.offset - sourceLength).toFixed(3))} tick`,
                    );
                  } else if (tool === "slip")
                    setFeedback(
                      `源偏移 ${Number(next[0].offset.toFixed(3))} tick`,
                    );
                },
                (up) => {
                  const next = change(up),
                    v = next[0];
                  if (edge || tool === "slip") {
                    if (
                      v.tick !== c.tick ||
                      v.length !== c.length ||
                      v.offset !== c.offset
                    )
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
                    const dt = v.tick - originals[0].tick,
                      dr = v.track - originals[0].track;
                    if (dt || dr) {
                      if (copyDrag)
                        void run({
                          type: "clips:paste",
                          clips: next.map(({ id, ...clip }) => clip),
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
                },
              );
            }}
          />
        </div>
      </div>
      <div className="canvas-footer">
        <span>
          {ids.length
            ? `${ids.length} 个引用已选`
            : "P 绘制 · B 连续笔刷 · 右键擦除 · Ctrl 框选 · Shift 拖动复制"}
        </span>
        <span>位置 {Number(cursor.toFixed(3))} tick</span>
        <span className="spacer" />
        <span className={feedback ? "gesture-feedback" : ""} role="status">
          {feedback ||
            "Ctrl+滚轮 时间缩放 · 拖动边缘补白 / 裁剪 · Alt 自由定位"}
        </span>
      </div>
    </div>
  );
  async function place(s: Source, at: number, track: number) {
    const info = sourceInfo({ kind: s.kind, sourceId: s.id });
    if (!info) return;
    try {
      const length =
        s.kind !== "sample"
          ? (info as { length: number }).length
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

import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  MousePointer2,
  Copy,
  Scissors,
  ClipboardPaste,
  SlidersHorizontal,
  Play,
  ChevronDown,
  Volume2,
  Layers,
  Piano,
  Plus,
} from "lucide-react";
import {
  ticksPerBar,
  pitchName,
  type Project,
  type Pattern,
  type Note,
} from "../../shared/model";
import { audio } from "./audio";
import type { Run, ShowMenu, Source } from "./ui";
import { snapTick } from "./editing";

const L = 82,
  H = 26;
export function PatternEditor({
  project,
  pattern,
  run,
  menu,
  open,
  report,
  seek,
  playTick,
  stopped,
}: {
  project: Project;
  pattern: Pattern;
  run: Run;
  menu: ShowMenu;
  open: (s: Source) => void;
  report: (s: string) => void;
  seek: (n: number) => void;
  playTick?: number;
  stopped: number;
}) {
  const scroller = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"piano" | "layers">("piano"),
    [tool, setTool] = useState<"draw" | "select">("draw"),
    [zoom, setZoom] = useState(25),
    [snap, setSnap] = useState(1),
    [layer, setLayer] = useState(0);
  const [view, setView] = useState({ w: 800, h: 240, x: 0, y: 0 }),
    [ids, setIds] = useState<string[]>([]),
    [cursor, setCursor] = useState(0),
    [instrument, setInstrument] = useState(0),
    [velocity, setVelocity] = useState(85),
    [pitch, setPitch] = useState(66);
  const [ghost, setGhost] = useState<Note[]>([]),
    [box, setBox] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null),
    [clipboard, setClipboard] = useState(false);
  const bar = ticksPerBar(project.meter),
    unit = snap === -1 ? bar : snap,
    rh = mode === "piano" ? 18 : 36,
    rows = mode === "piano" ? 88 : Math.max(4, pattern.layers.length),
    ticks = Math.max(bar * 4, pattern.length + bar);
  const selected = pattern.notes.filter((n) => ids.includes(n.id)),
    first = selected[0],
    ins = project.instruments.find((i) => i.id === instrument),
    sample = project.samples.find((s) => s.id === ins?.sampleId);
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
      scroller.current.scrollTop = mode === "piano" ? 32 * 18 : 0;
      scroller.current.scrollLeft = 0;
    }
  }, [mode, pattern.id]);
  useEffect(() => {
    setIds((old) => old.filter((id) => pattern.notes.some((n) => n.id === id)));
  }, [pattern.notes]);
  useEffect(() => {
    const check = () =>
      void window.studio
        .readClipboard()
        .then((data) => setClipboard(data.length > 0))
        .catch(() => setClipboard(false));
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);
  useEffect(() => {
    setCursor(0);
    if (scroller.current) scroller.current.scrollLeft = 0;
  }, [stopped]);
  useEffect(() => {
    setLayer((current) => Math.min(current, pattern.layers.length - 1));
  }, [pattern.layers.length]);
  const point = (x: number, y: number) => {
    const row = Math.floor((y - H + view.y) / rh);
    return {
      tick: Math.max(0, (x - L + view.x) / zoom),
      row,
      pitch: mode === "piano" ? 108 - row : pitch,
    };
  };
  const hit = (x: number, y: number) => {
    const p = point(x, y);
    return [...pattern.notes]
      .reverse()
      .find(
        (n) =>
          (mode === "piano" ? n.pitch === p.pitch : n.layer === p.row) &&
          p.tick >= n.tick &&
          p.tick < n.tick + Math.max(0.55, unit * 0.9),
      );
  };
  useEffect(() => {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const ratio = devicePixelRatio || 1;
    el.width = view.w * ratio;
    el.height = view.h * ratio;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#20282e";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = "10px Segoe UI, Microsoft YaHei";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.beginPath();
    ctx.rect(L, H, Math.max(0, view.w - L), Math.max(0, view.h - H));
    ctx.clip();
    const fromRow = Math.max(0, Math.floor(view.y / rh)),
      toRow = Math.min(rows, Math.ceil((view.y + view.h) / rh));
    for (let row = fromRow; row < toRow; row++) {
      const y = H + row * rh - view.y,
        midi = 108 - row,
        black = [1, 3, 6, 8, 10].includes(midi % 12);
      ctx.fillStyle =
        mode === "piano"
          ? black
            ? "#20272e"
            : "#252e35"
          : row % 2
            ? "#242b32"
            : "#283139";
      ctx.fillRect(L, y, view.w, rh - 1);
      if (mode === "piano" && midi % 12 === 0) {
        ctx.fillStyle = "#3b4852";
        ctx.fillRect(L, y + rh - 1, view.w, 1);
      }
    }
    const from = Math.floor(view.x / zoom),
      to = Math.ceil((view.x + view.w) / zoom);
    for (let t = from; t <= to; t++) {
      const x = L + t * zoom - view.x;
      ctx.fillStyle =
        t % bar === 0 ? "#4b5760" : t % 4 === 0 ? "#38444e" : "#2c3740";
      ctx.fillRect(x, H, 1, view.h);
    }
    const endX = L + pattern.length * zoom - view.x;
    if (endX < view.w) {
      ctx.fillStyle = "#11171d70";
      ctx.fillRect(Math.max(L, endX), H, view.w - Math.max(L, endX), view.h);
      ctx.strokeStyle = "#a4b6c0";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(endX, H);
      ctx.lineTo(endX, view.h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const original of pattern.notes) {
      const note = ghost.find((n) => n.id === original.id) ?? original,
        row = mode === "piano" ? 108 - note.pitch : note.layer,
        x = L + note.tick * zoom - view.x + 1,
        y = H + row * rh - view.y + 2,
        w = Math.max(7, zoom * Math.max(0.55, Math.min(unit, 0.95)) - 2);
      if (x + w < L || x > view.w || y + rh < H || y > view.h) continue;
      const instrumentDef = project.instruments.find(
          (i) => i.id === note.instrument,
        ),
        color =
          project.samples.find((s) => s.id === instrumentDef?.sampleId)
            ?.color ?? pattern.color,
        active = ids.includes(note.id),
        locked = pattern.layers[note.layer]?.locked,
        muted = pattern.layers[note.layer]?.muted;
      ctx.globalAlpha = locked || muted ? 0.35 : 1;
      ctx.fillStyle = active ? "#e1e6c9" : color;
      ctx.fillRect(x, y, w, rh - 4);
      ctx.fillStyle = active ? "#354338" : color + "70";
      ctx.fillRect(x, y, 2, rh - 4);
      if (mode === "layers") {
        ctx.fillStyle = "#15262d";
        ctx.fillText(
          pitchName(note.pitch),
          x + 3,
          y + (rh - 4) / 2,
          Math.max(1, w - 5),
        );
      }
      ctx.globalAlpha = 1;
    }
    if (box) {
      ctx.fillStyle = "#b8d8e52e";
      ctx.strokeStyle = "#bed7e3";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
    ctx.fillStyle = "#29353e";
    ctx.fillRect(0, 0, view.w, H);
    for (let t = Math.floor(from / bar) * bar; t <= to; t += bar) {
      const x = L + t * zoom - view.x;
      if (x < L) continue;
      ctx.fillStyle = "#b6c3cb";
      ctx.fillText(String(Math.floor(t / bar) + 1), x + 5, 13);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, H, L, view.h - H);
    ctx.clip();
    for (let row = fromRow; row < toRow; row++) {
      const y = H + row * rh - view.y,
        midi = 108 - row,
        black = [1, 3, 6, 8, 10].includes(midi % 12);
      ctx.fillStyle =
        mode === "piano"
          ? black
            ? "#303b44"
            : "#bac4c8"
          : row === layer
            ? "#3a4b56"
            : "#2b353d";
      ctx.fillRect(0, y, L - 2, rh - 1);
      ctx.fillStyle =
        mode === "piano" ? (black ? "#9eb0ba" : "#3d4d57") : "#b4c4cd";
      ctx.fillText(
        mode === "piano"
          ? midi % 12 === 0 || midi === 66
            ? pitchName(midi)
            : ""
          : (pattern.layers[row]?.name ?? `图层 ${row + 1}`),
        mode === "piano" ? 46 : 9,
        y + rh / 2,
        L - 15,
      );
      if (mode === "piano" && (midi < 54 || midi > 78)) {
        ctx.fillStyle = "#a57c6b";
        ctx.fillRect(L - 5, y + 2, 2, rh - 4);
      }
    }
    ctx.restore();
    ctx.fillStyle = "#29353e";
    ctx.fillRect(0, 0, L, H);
    ctx.fillStyle = "#9fb6c5";
    ctx.fillText(mode === "piano" ? "KEY / TIME" : "LAYER / TIME", 7, 13);
    const x = L + (playTick ?? cursor) * zoom - view.x;
    if (x >= L && x < view.w) {
      ctx.fillStyle = "#e7b66e";
      ctx.fillRect(x, 0, 1, view.h);
    }
  }, [
    pattern,
    project.instruments,
    project.samples,
    view,
    mode,
    zoom,
    snap,
    ids,
    ghost,
    box,
    cursor,
    layer,
    playTick,
  ]);
  async function copy(cut = false) {
    try {
      if (!selected.length) return;
      const start = Math.min(...selected.map((n) => n.tick)),
        base = Math.min(...selected.map((n) => n.layer));
      await window.studio.writeClipboard(
        selected.map(({ id, ...n }) => ({
          ...n,
          tick: n.tick - start,
          layer: n.layer - base,
        })),
      );
      setClipboard(true);
      if (cut) await run({ type: "notes:remove", patternId: pattern.id, ids });
      report(`已${cut ? "剪切" : "复制"} ${selected.length} 个音符`);
    } catch (error) {
      report(
        `复制失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  async function paste() {
    try {
      const notes = await window.studio.readClipboard();
      if (!notes.length) return;
      const result = await run({
        type: "notes:add",
        patternId: pattern.id,
        notes: notes.map((n) => ({
          ...n,
          tick: n.tick + cursor,
          layer: n.layer + layer,
        })),
      });
      if (result)
        setIds(
          result.project.patterns
            .find((p) => p.id === pattern.id)!
            .notes.slice(-notes.length)
            .map((n) => n.id),
        );
    } catch (error) {
      report(
        `粘贴失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  function setProps(patch: Partial<Omit<Note, "id" | "tick" | "layer">>) {
    if (ids.length)
      void run({ type: "notes:update", patternId: pattern.id, ids, patch });
  }
  function addNotes(at: number, keys: number[], targetLayer = layer) {
    const occupied = new Set(pattern.notes.map((n) => `${n.tick}:${n.layer}`));
    const notes: Omit<Note, "id">[] = [];
    for (const key of keys) {
      if (key < 21 || key > 108) continue;
      let next = targetLayer;
      while (occupied.has(`${at}:${next}`) || pattern.layers[next]?.locked)
        next++;
      occupied.add(`${at}:${next}`);
      notes.push({
        tick: at,
        layer: next,
        pitch: key,
        instrument,
        velocity,
        panning: 100,
        finePitch: 0,
      });
    }
    if (notes.length)
      void run({ type: "notes:add", patternId: pattern.id, notes }).then(
        (result) => {
          if (result)
            setIds(
              result.project.patterns
                .find((p) => p.id === pattern.id)!
                .notes.slice(-notes.length)
                .map((n) => n.id),
            );
        },
      );
  }
  function tools(x: number, y: number) {
    menu(x, y, [
      {
        label: "全选音符",
        shortcut: "Ctrl+A",
        action: () => setIds(pattern.notes.map((n) => n.id)),
      },
      {
        label: "反选",
        action: () =>
          setIds(
            pattern.notes.filter((n) => !ids.includes(n.id)).map((n) => n.id),
          ),
      },
      { separator: true, label: "" },
      {
        label: "升高八度",
        disabled: !ids.length,
        action: () =>
          void run({
            type: "notes:move",
            patternId: pattern.id,
            ids,
            ticks: 0,
            pitches: 12,
          }),
      },
      {
        label: "降低八度",
        disabled: !ids.length,
        action: () =>
          void run({
            type: "notes:move",
            patternId: pattern.id,
            ids,
            ticks: 0,
            pitches: -12,
          }),
      },
      {
        label: "复制到右侧",
        shortcut: "Ctrl+B",
        disabled: !ids.length,
        action: () => duplicate(),
      },
      { separator: true, label: "" },
      {
        label: "统一选区音色",
        disabled: !ids.length,
        action: () => setProps({ instrument }),
      },
      {
        label: "力度 +10",
        disabled: !ids.length,
        action: () => {
          for (const n of selected)
            void run({
              type: "notes:update",
              patternId: pattern.id,
              ids: [n.id],
              patch: { velocity: Math.min(100, n.velocity + 10) },
            });
        },
      },
      {
        label: "删除选区",
        danger: true,
        disabled: !ids.length,
        action: () =>
          void run({ type: "notes:remove", patternId: pattern.id, ids }),
      },
    ]);
  }
  function duplicate() {
    if (!selected.length) return;
    const from = Math.min(...selected.map((n) => n.tick)),
      end = Math.max(...selected.map((n) => n.tick + unit));
    void run({
      type: "notes:add",
      patternId: pattern.id,
      notes: selected.map(({ id, ...n }) => ({
        ...n,
        tick: n.tick + end - from,
      })),
    });
  }
  const visibleNotes = pattern.notes.filter(
    (n) =>
      n.tick * zoom >= view.x - unit * zoom &&
      n.tick * zoom < view.x + view.w - L &&
      (ids.length ? ids.includes(n.id) : n.layer === layer),
  );
  return (
    <div
      className="pattern-editor"
      data-testid="pattern-editor"
      tabIndex={0}
      onKeyDown={(e) => {
        if (
          e.defaultPrevented ||
          (e.target as HTMLElement).matches("input,select,textarea")
        )
          return;
        const key = e.key.toLowerCase(),
          mod = e.ctrlKey || e.metaKey;
        if (mod && ["a", "c", "x", "v", "b"].includes(key)) {
          e.preventDefault();
          e.stopPropagation();
          if (key === "a") setIds(pattern.notes.map((n) => n.id));
          if (key === "c" || key === "x") void copy(key === "x");
          if (key === "v") void paste();
          if (key === "b") duplicate();
        }
        if (ids.length && ["Delete", "Backspace"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          void run({ type: "notes:remove", patternId: pattern.id, ids });
        }
        if (ids.length && e.key.startsWith("Arrow")) {
          e.preventDefault();
          e.stopPropagation();
          void run({
            type: "notes:move",
            patternId: pattern.id,
            ids,
            ticks:
              e.key === "ArrowLeft" ? -unit : e.key === "ArrowRight" ? unit : 0,
            pitches:
              e.key === "ArrowUp"
                ? e.shiftKey
                  ? 12
                  : 1
                : e.key === "ArrowDown"
                  ? e.shiftKey
                    ? -12
                    : -1
                  : 0,
          });
        }
      }}
    >
      <div className="editor-tools">
        <div className="tool-group">
          <button
            aria-label="钢琴卷帘"
            className={mode === "piano" ? "selected" : ""}
            onClick={() => setMode("piano")}
            title="钢琴卷帘"
          >
            <Piano size={15} />
          </button>
          <button
            aria-label="NBS 图层"
            className={mode === "layers" ? "selected" : ""}
            onClick={() => setMode("layers")}
            title="NBS 图层"
          >
            <Layers size={15} />
          </button>
        </div>
        <span className="divider" />
        <button
          aria-label="音符绘制"
          title="绘制音符"
          className={tool === "draw" ? "selected" : ""}
          onClick={() => setTool("draw")}
        >
          <Pencil size={14} />
        </button>
        <button
          aria-label="音符框选"
          title="框选音符"
          className={tool === "select" ? "selected" : ""}
          onClick={() => setTool("select")}
        >
          <MousePointer2 size={14} />
        </button>
        <button
          aria-label="复制音符"
          title="复制"
          disabled={!ids.length}
          onClick={() => void copy()}
        >
          <Copy size={14} />
        </button>
        <button
          aria-label="剪切音符"
          title="剪切"
          disabled={!ids.length}
          onClick={() => void copy(true)}
        >
          <Scissors size={14} />
        </button>
        <button
          aria-label="粘贴音符"
          title="粘贴"
          disabled={!clipboard}
          onClick={() => void paste()}
        >
          <ClipboardPaste size={14} />
        </button>
        <button
          className="text-button"
          onClick={(e) => tools(e.clientX, e.clientY)}
        >
          <SlidersHorizontal size={13} />
          工具
          <ChevronDown size={11} />
        </button>
        <button
          className="text-button"
          onClick={(e) =>
            menu(
              e.clientX,
              e.clientY,
              [
                ["大三和弦", [0, 4, 7]],
                ["小三和弦", [0, 3, 7]],
                ["属七和弦", [0, 4, 7, 10]],
                ["大七和弦", [0, 4, 7, 11]],
                ["挂四和弦", [0, 5, 7]],
                ["减三和弦", [0, 3, 6]],
              ].map(([label, steps]) => ({
                label: String(label),
                action: () =>
                  addNotes(
                    cursor,
                    (steps as number[]).map((s) => s + pitch),
                  ),
              })),
            )
          }
        >
          和弦
          <ChevronDown size={11} />
        </button>
        <span className="spacer" />
        <select
          aria-label="音符吸附"
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
        <select
          aria-label="音符缩放"
          value={zoom}
          onChange={(e) => setZoom(+e.target.value)}
        >
          {[12, 18, 25, 32, 42].map((v) => (
            <option value={v} key={v}>
              {v * 4}%
            </option>
          ))}
        </select>
        <button
          aria-label="播放此 Pattern"
          title="播放此 Pattern"
          onClick={() =>
            void audio.play(project, pattern.id).catch((e) => report(e.message))
          }
        >
          <Play size={14} />
        </button>
      </div>
      <div className="instrument-strip" data-testid="instrument-strip">
        <span
          className="instrument-dot"
          style={{ background: sample?.color }}
        />
        <label>
          乐器
          <select
            aria-label="落笔音色"
            value={instrument}
            onChange={(e) => {
              const id = +e.target.value;
              setInstrument(id);
              void audio
                .preview(project, id, pitch)
                .catch((e) => report(e.message));
            }}
          >
            {project.instruments.map((i) => (
              <option value={i.id} key={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <button
          title="预听当前音色"
          aria-label="预听当前音色"
          onClick={() =>
            void audio
              .preview(project, instrument, pitch, velocity)
              .catch((e) => report(e.message))
          }
        >
          <Volume2 size={14} />
        </button>
        <button
          className="text-button"
          onClick={() => {
            if (ins) open({ kind: "sample", id: ins.sampleId });
          }}
        >
          采样设置
        </button>
        <span className="divider" />
        <label>
          落笔层
          <select
            aria-label="落笔图层"
            value={layer}
            onChange={(e) => setLayer(+e.target.value)}
          >
            {pattern.layers.map((l, i) => (
              <option value={i} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label="新增图层"
          title="新增图层"
          onClick={() => void run({ type: "layer:add", patternId: pattern.id })}
        >
          <Plus size={14} />
        </button>
        <span className="spacer" />
        <label className="inline-value">
          长度
          <input
            aria-label="Pattern 长度"
            type="number"
            min={0.25}
            step={1}
            key={pattern.id + ":" + pattern.length}
            defaultValue={pattern.length}
            onBlur={(e) => {
              const length = +e.target.value;
              if (length > 0 && length !== pattern.length)
                void run({
                  type: "pattern:update",
                  id: pattern.id,
                  patch: { length },
                });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
      </div>
      <div className="pattern-body">
        <div
          className="note-scroll"
          ref={scroller}
          onScroll={(e) => {
            const x = e.currentTarget.scrollLeft,
              y = e.currentTarget.scrollTop;
            setView((v) => ({ ...v, x, y }));
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const rect = canvas.current!.getBoundingClientRect(),
              x = e.clientX - rect.left,
              y = e.clientY - rect.top,
              p = point(x, y);
            if (x < L && mode === "layers") {
              const l = pattern.layers[p.row];
              if (l)
                menu(e.clientX, e.clientY, [
                  {
                    label: "选中本层",
                    action: () =>
                      setIds(
                        pattern.notes
                          .filter((n) => n.layer === p.row)
                          .map((n) => n.id),
                      ),
                  },
                  {
                    label: "静音",
                    checked: l.muted,
                    action: () =>
                      void run({
                        type: "layer:update",
                        patternId: pattern.id,
                        index: p.row,
                        patch: { muted: !l.muted },
                      }),
                  },
                  {
                    label: "独奏",
                    checked: l.solo,
                    action: () =>
                      void run({
                        type: "layer:update",
                        patternId: pattern.id,
                        index: p.row,
                        patch: { solo: !l.solo },
                      }),
                  },
                  {
                    label: "锁定",
                    checked: l.locked,
                    action: () =>
                      void run({
                        type: "layer:update",
                        patternId: pattern.id,
                        index: p.row,
                        patch: { locked: !l.locked },
                      }),
                  },
                  { separator: true, label: "" },
                  {
                    label: "删除图层与音符",
                    danger: true,
                    disabled: pattern.layers.length <= 1,
                    action: () =>
                      void run({
                        type: "layer:remove",
                        patternId: pattern.id,
                        index: p.row,
                      }),
                  },
                ]);
            }
          }}
        >
          <div
            style={{
              width: Math.max(view.w, L + ticks * zoom),
              height: Math.max(view.h, H + rows * rh),
            }}
          >
            <canvas
              ref={canvas}
              data-testid="note-canvas"
              style={{
                position: "sticky",
                top: 0,
                left: 0,
                width: view.w,
                height: view.h,
              }}
              onPointerDown={(e) => {
                const el = e.currentTarget,
                  rect = el.getBoundingClientRect(),
                  x = e.clientX - rect.left,
                  y = e.clientY - rect.top,
                  p = point(x, y);
                el.closest<HTMLElement>(".pattern-editor")?.focus();
                if (x < L) {
                  if (e.button === 0) {
                    if (mode === "piano" && p.pitch >= 21 && p.pitch <= 108) {
                      setPitch(p.pitch);
                      if (e.ctrlKey)
                        setIds(
                          pattern.notes
                            .filter((n) => n.pitch === p.pitch)
                            .map((n) => n.id),
                        );
                      else
                        void audio
                          .preview(project, instrument, p.pitch, velocity)
                          .catch((e) => report(e.message));
                    } else if (p.row >= 0 && p.row < pattern.layers.length) {
                      setLayer(p.row);
                      setIds(
                        pattern.notes
                          .filter((n) => n.layer === p.row)
                          .map((n) => n.id),
                      );
                    }
                  }
                  return;
                }
                const at = snapTick(p.tick, unit, e.altKey);
                setCursor(at);
                if (y < H) {
                  if (e.button === 0) seek(at);
                  return;
                }
                if (p.row < 0 || p.row >= rows) return;
                const note = hit(x, y);
                if (note && pattern.layers[note.layer]?.locked) return;
                el.setPointerCapture(e.pointerId);
                const clear = () => {
                  el.onpointermove = null;
                  el.onpointerup = null;
                  el.onpointercancel = null;
                  setGhost([]);
                  setBox(null);
                };
                el.onpointercancel = clear;
                if (e.button === 2) {
                  const erased = new Set<string>();
                  const erase = (xx: number, yy: number) => {
                    const n = hit(xx, yy);
                    if (
                      n &&
                      !erased.has(n.id) &&
                      !pattern.layers[n.layer]?.locked
                    ) {
                      erased.add(n.id);
                      void run({
                        type: "notes:remove",
                        patternId: pattern.id,
                        ids: [n.id],
                      });
                    }
                  };
                  erase(x, y);
                  el.onpointermove = (move) =>
                    erase(move.clientX - rect.left, move.clientY - rect.top);
                  el.onpointerup = clear;
                  return;
                }
                if (e.button !== 0) {
                  clear();
                  return;
                }
                if (!note && (tool === "select" || e.ctrlKey || e.shiftKey)) {
                  el.onpointermove = (move) =>
                    setBox({
                      x: Math.min(x, move.clientX - rect.left),
                      y: Math.min(y, move.clientY - rect.top),
                      w: Math.abs(move.clientX - rect.left - x),
                      h: Math.abs(move.clientY - rect.top - y),
                    });
                  el.onpointerup = (up) => {
                    const end = point(
                      up.clientX - rect.left,
                      up.clientY - rect.top,
                    );
                    const found = pattern.notes
                      .filter(
                        (n) =>
                          n.tick >= Math.min(p.tick, end.tick) &&
                          n.tick <= Math.max(p.tick, end.tick) &&
                          (mode === "piano"
                            ? n.pitch >= Math.min(p.pitch, end.pitch) &&
                              n.pitch <= Math.max(p.pitch, end.pitch)
                            : n.layer >= Math.min(p.row, end.row) &&
                              n.layer <= Math.max(p.row, end.row)),
                      )
                      .map((n) => n.id);
                    setIds(
                      e.ctrlKey ? [...new Set([...ids, ...found])] : found,
                    );
                    clear();
                  };
                  return;
                }
                if (!note) {
                  if (p.pitch >= 21 && p.pitch <= 108) {
                    setPitch(p.pitch);
                    addNotes(at, [p.pitch], mode === "layers" ? p.row : layer);
                    void audio
                      .preview(project, instrument, p.pitch, velocity)
                      .catch((e) => report(e.message));
                  }
                  clear();
                  return;
                }
                const next = e.ctrlKey
                  ? ids.includes(note.id)
                    ? ids.filter((id) => id !== note.id)
                    : [...ids, note.id]
                  : ids.includes(note.id)
                    ? ids
                    : [note.id];
                setIds(next);
                const originals = pattern.notes.filter((n) =>
                    next.includes(n.id),
                  ),
                  sx = e.clientX,
                  sy = e.clientY;
                const delta = (event: PointerEvent) => ({
                  ticks:
                    Math.round(
                      (event.clientX - sx) /
                        zoom /
                        (event.altKey ? 1 / 24 : unit),
                    ) * (event.altKey ? 1 / 24 : unit),
                  pitches:
                    mode === "piano"
                      ? -Math.round((event.clientY - sy) / rh)
                      : 0,
                  layers:
                    mode === "layers"
                      ? Math.round((event.clientY - sy) / rh)
                      : 0,
                });
                el.onpointermove = (move) => {
                  const d = delta(move);
                  setGhost(
                    originals.map((n) => ({
                      ...n,
                      tick: n.tick + d.ticks,
                      pitch: n.pitch + d.pitches,
                      layer: n.layer + d.layers,
                    })),
                  );
                };
                el.onpointerup = (up) => {
                  const d = delta(up);
                  if (d.ticks || d.pitches || d.layers) {
                    if (up.shiftKey)
                      void run({
                        type: "notes:add",
                        patternId: pattern.id,
                        notes: originals.map(({ id, ...n }) => ({
                          ...n,
                          tick: n.tick + d.ticks,
                          pitch: n.pitch + d.pitches,
                          layer: n.layer + d.layers,
                        })),
                      });
                    else
                      void run({
                        type: "notes:move",
                        patternId: pattern.id,
                        ids: next,
                        ...d,
                      });
                  }
                  clear();
                };
              }}
            />
          </div>
        </div>
        <aside className="note-inspector">
          <span className="section-label">
            {ids.length ? `选区 · ${ids.length} 音符` : "落笔属性"}
          </span>
          <label>
            音高
            <select
              aria-label="音符音高"
              value={first?.pitch ?? pitch}
              onChange={(e) => {
                setPitch(+e.target.value);
                setProps({ pitch: +e.target.value });
              }}
            >
              {Array.from({ length: 88 }, (_, i) => i + 21).map((p) => (
                <option value={p} key={p}>
                  {pitchName(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            力度
            <input
              aria-label="音符力度"
              type="number"
              min={0}
              max={100}
              key={ids.join() + first?.velocity}
              defaultValue={first?.velocity ?? velocity}
              onBlur={(e) => {
                const n = +e.target.value;
                if (n >= 0 && n <= 100) {
                  setVelocity(n);
                  setProps({ velocity: n });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>
          <label>
            声像
            <input
              aria-label="音符声像"
              type="number"
              min={0}
              max={200}
              key={ids.join() + first?.panning}
              defaultValue={first?.panning ?? 100}
              disabled={!ids.length}
              onBlur={(e) => setProps({ panning: +e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>
          <label>
            微调 <small>cent</small>
            <input
              aria-label="音符微调"
              type="number"
              min={-32768}
              max={32767}
              key={ids.join() + first?.finePitch}
              defaultValue={first?.finePitch ?? 0}
              disabled={!ids.length}
              onBlur={(e) => setProps({ finePitch: +e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>
          <button
            className="apply-instrument"
            disabled={!ids.length}
            onClick={() => setProps({ instrument })}
          >
            应用当前音色
          </button>
          {selected.some(
            (n) =>
              n.pitch !== first?.pitch || n.instrument !== first?.instrument,
          ) && (
            <span className="mixed-hint">
              混合选区
              <br />
              显示首个音符；修改应用全部
            </span>
          )}
        </aside>
      </div>
      <div className="velocity-lane">
        <span className="velocity-label">
          VELOCITY<small>{ids.length ? "选区" : "当前图层"}</small>
        </span>
        <div className="velocity-bars">
          {visibleNotes.map((n) => (
            <button
              key={n.id}
              className={
                ids.includes(n.id) ? "velocity-bar chosen" : "velocity-bar"
              }
              aria-label={`力度 Tick ${n.tick} 图层 ${n.layer + 1}`}
              title={`${n.velocity}%`}
              style={{
                left: n.tick * zoom - view.x,
                height: Math.max(3, n.velocity * 0.42),
                background:
                  project.samples.find(
                    (s) =>
                      s.id ===
                      project.instruments.find((i) => i.id === n.instrument)
                        ?.sampleId,
                  )?.color ?? pattern.color,
              }}
              onPointerDown={(e) => {
                const el = e.currentTarget,
                  rect = el.parentElement!.getBoundingClientRect(),
                  affected = ids.includes(n.id) ? ids : [n.id];
                el.setPointerCapture(e.pointerId);
                const value = (y: number) =>
                  Math.max(
                    0,
                    Math.min(100, Math.round((rect.bottom - y) / 0.42)),
                  );
                el.onpointermove = (move) => {
                  el.style.height = `${Math.max(3, value(move.clientY) * 0.42)}px`;
                };
                el.onpointerup = (up) => {
                  void run({
                    type: "notes:update",
                    patternId: pattern.id,
                    ids: affected,
                    patch: { velocity: value(up.clientY) },
                  });
                  el.onpointermove = null;
                  el.onpointerup = null;
                };
                el.onpointercancel = () => {
                  el.style.height = `${Math.max(3, n.velocity * 0.42)}px`;
                  el.onpointermove = null;
                  el.onpointerup = null;
                };
              }}
            />
          ))}
        </div>
      </div>
      <div className="canvas-footer">
        <span>
          {pattern.notes.length} 音符 · {pattern.layers.length} 图层
        </span>
        <span className="spacer" />
        <span>
          {Number(cursor.toFixed(3))} tick · {pitchName(pitch)}
        </span>
      </div>
    </div>
  );
}

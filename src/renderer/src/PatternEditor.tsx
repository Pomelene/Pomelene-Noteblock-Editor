import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil,
  Paintbrush,
  Eraser,
  Scan,
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
import { SnapPicker } from "./SnapPicker";
import {
  snapPosition,
  snapUnit,
  snapDelta,
  gridTicks,
  type SnapId,
} from "./snap";
import { BrushStroke, captureGesture, segmentIntersectsRect } from "./gestures";
import { resolveShortcut } from "./shortcuts";
import {
  instrumentChoices,
  navigateInstrument,
  noteOpacity,
} from "./instrumentFocus";
import "./pattern-focus.css";

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
    canvas = useRef<HTMLCanvasElement>(null),
    instrumentChoicesRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"piano" | "layers">("piano"),
    [tool, setTool] = useState<"draw" | "brush" | "select" | "delete">("draw"),
    [zoom, setZoom] = useState(25),
    [snap, setSnap] = useState<SnapId>("auto"),
    [layer, setLayer] = useState(0);
  const [view, setView] = useState({ w: 800, h: 240, x: 0, y: 0 }),
    [ids, setIds] = useState<string[]>([]),
    [cursor, setCursor] = useState(0),
    [instrument, setInstrument] = useState(project.instruments[0]?.id ?? 0),
    [showAllInstruments, setShowAllInstruments] = useState(false),
    [velocity, setVelocity] = useState(85),
    [pitch, setPitch] = useState(66);
  const cancelGesture = useRef<(() => void) | null>(null);
  const previousSnap = useRef<SnapId>("auto");
  const choices = instrumentChoices(project.instruments, pattern.notes);
  useEffect(() => {
    const strip = instrumentChoicesRef.current;
    const chip = strip?.querySelector<HTMLElement>(
      `[data-instrument-id="${instrument}"]`,
    );
    if (!strip || !chip || !strip.clientWidth) return;
    const bounds = strip.getBoundingClientRect(),
      selectedBounds = chip.getBoundingClientRect();
    if (selectedBounds.left < bounds.left + 8)
      strip.scrollLeft -= bounds.left + 8 - selectedBounds.left;
    else if (selectedBounds.right > bounds.right - 8)
      strip.scrollLeft += selectedBounds.right - bounds.right + 8;
  }, [instrument]);
  useEffect(() => {
    if (!project.instruments.some((i) => i.id === instrument))
      setInstrument(project.instruments[0]?.id ?? 0);
  }, [project.instruments, instrument]);
  const [erased, setErased] = useState<string[]>([]),
    [feedback, setFeedback] = useState("");
  const [ghost, setGhost] = useState<Note[]>([]),
    [box, setBox] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null),
    [clipboard, setClipboard] = useState(false);
  const bar = ticksPerBar(project.meter),
    unit = snapUnit(snap, zoom, bar),
    rh = mode === "piano" ? 18 : 36,
    rows = mode === "piano" ? 88 : Math.max(4, pattern.layers.length),
    ticks = Math.max(bar * 4, pattern.length + bar);
  const atTick = (tick: number, alt = false) =>
    snapPosition(tick, snap, zoom, bar, alt);
  useEffect(() => {
    cancelGesture.current?.();
    setIds([]);
    return () => cancelGesture.current?.();
  }, [project.id, pattern.id, mode]);
  useEffect(() => {
    cancelGesture.current?.();
  }, [project]);
  const selectedIds = useMemo(() => new Set(ids), [ids]);
  const noteIds = useMemo(
    () => new Set(pattern.notes.map((n) => n.id)),
    [pattern.notes],
  );
  const selected = pattern.notes.filter((n) => selectedIds.has(n.id)),
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
    setIds((old) => old.filter((id) => noteIds.has(id)));
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
    for (const t of gridTicks(from, to, snap, zoom, bar)) {
      const x = L + t * zoom - view.x;
      ctx.fillStyle =
        Math.abs(t / bar - Math.round(t / bar)) < 1e-6
          ? "#4b5760"
          : Math.abs(t / 4 - Math.round(t / 4)) < 1e-6
            ? "#38444e"
            : "#2c3740";
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
    const ghostNotes = new Map(ghost.map((n) => [n.id, n]));
    const erasedIds = new Set(erased);
    for (const original of [
      ...pattern.notes,
      ...ghost.filter((g) => !noteIds.has(g.id)),
    ]) {
      if (erasedIds.has(original.id)) continue;
      const note = ghostNotes.get(original.id) ?? original,
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
        active = selectedIds.has(note.id),
        locked = pattern.layers[note.layer]?.locked,
        muted = pattern.layers[note.layer]?.muted;
      ctx.globalAlpha = noteOpacity(
        note.instrument,
        instrument,
        showAllInstruments,
        active,
        !!(locked || muted),
      );
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
    erased,
    instrument,
    showAllInstruments,
  ]);
  async function copy(cut = false) {
    try {
      if (!selected.length) return;
      const start = selected.reduce(
          (bound, n) => Math.min(bound, n.tick),
          Infinity,
        ),
        base = selected.reduce(
          (bound, n) => Math.min(bound, n.layer),
          Infinity,
        );
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
        label: "保存为片段采样",
        action: () =>
          void run({ type: "phrase:fromPattern", patternId: pattern.id }),
      },
      { label: "缩放适应内容", action: fit },
      { label: "取消选择", action: () => setIds([]) },
      {
        label: "全选音符",
        shortcut: "Ctrl+A",
        action: () => setIds(pattern.notes.map((n) => n.id)),
      },
      {
        label: "反选",
        action: () =>
          setIds(
            pattern.notes
              .filter((n) => !selectedIds.has(n.id))
              .map((n) => n.id),
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
    const from = selected.reduce(
        (bound, n) => Math.min(bound, n.tick),
        Infinity,
      ),
      end = selected.reduce(
        (bound, n) => Math.max(bound, n.tick + unit),
        -Infinity,
      );
    void run({
      type: "notes:add",
      patternId: pattern.id,
      notes: selected.map(({ id, ...n }) => ({
        ...n,
        tick: n.tick + end - from,
      })),
    });
  }
  function fit() {
    setZoom(
      Math.max(
        12,
        Math.min(42, (view.w - L - 24) / Math.max(bar, pattern.length)),
      ),
    );
    if (scroller.current) scroller.current.scrollLeft = 0;
  }
  const visibleNotes = pattern.notes.filter(
    (n) =>
      n.tick * zoom >= view.x - unit * zoom &&
      n.tick * zoom < view.x + view.w - L &&
      (ids.length ? selectedIds.has(n.id) : n.layer === layer),
  );
  return (
    <div
      className="pattern-editor"
      data-testid="pattern-editor"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.defaultPrevented) return;
        if (
          e.key === "Escape" &&
          !(e.target as HTMLElement).closest(
            "input,select,textarea,[contenteditable=true]",
          )
        ) {
          if (cancelGesture.current || ids.length) {
            e.preventDefault();
            e.stopPropagation();
            cancelGesture.current?.();
            setIds([]);
          }
          return;
        }
        const action = resolveShortcut(e, "pattern");
        if (!action) return;
        e.preventDefault();
        e.stopPropagation();
        switch (action) {
          case "tool:draw":
            setTool("draw");
            break;
          case "tool:brush":
            setTool("brush");
            break;
          case "tool:select":
            setTool("select");
            break;
          case "tool:delete":
            setTool("delete");
            break;
          case "selection:all":
            setIds(pattern.notes.map((n) => n.id));
            break;
          case "selection:none":
            setIds([]);
            break;
          case "selection:invert":
            setIds(
              pattern.notes
                .filter((n) => !selectedIds.has(n.id))
                .map((n) => n.id),
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
            if (ids.length)
              void run({ type: "notes:remove", patternId: pattern.id, ids });
            break;
          case "move:left":
          case "move:right":
          case "move:up":
          case "move:down":
          case "move:octaveUp":
          case "move:octaveDown":
            if (ids.length)
              void run({
                type: "notes:move",
                patternId: pattern.id,
                ids,
                ticks:
                  action === "move:left"
                    ? -unit
                    : action === "move:right"
                      ? unit
                      : 0,
                pitches:
                  action === "move:up"
                    ? 1
                    : action === "move:down"
                      ? -1
                      : action === "move:octaveUp"
                        ? 12
                        : action === "move:octaveDown"
                          ? -12
                          : 0,
              });
            break;
          case "seek:start":
            setCursor(0);
            seek(0);
            break;
          case "seek:end":
            setCursor(pattern.length);
            seek(pattern.length);
            break;
          case "zoom:in":
            setZoom((v) => Math.min(64, v * 1.25));
            break;
          case "zoom:out":
            setZoom((v) => Math.max(4, v / 1.25));
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
          case "zoom:selection": {
            if (selected.length) {
              const from = selected.reduce(
                (bound, n) => Math.min(bound, n.tick),
                Infinity,
              );
              const to = selected.reduce(
                (bound, n) => Math.max(bound, n.tick + unit),
                -Infinity,
              );
              const nextZoom = Math.max(
                4,
                Math.min(64, (view.w - L - 24) / (to - from)),
              );
              setZoom(nextZoom);
              if (scroller.current)
                scroller.current.scrollLeft = from * nextZoom;
            }
            break;
          }
          case "snap:toggle":
            if (snap === "none") setSnap(previousSnap.current);
            else {
              previousSnap.current = snap;
              setSnap("none");
            }
            break;
          case "instrument:previous":
          case "instrument:next":
          case "instrument:previousUsed":
          case "instrument:nextUsed":
            setInstrument(
              navigateInstrument(
                choices,
                instrument,
                action === "instrument:previous" ||
                  action === "instrument:previousUsed"
                  ? -1
                  : 1,
                action.endsWith("Used"),
              ),
            );
            break;
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
          title="绘制音符 (P)"
          className={tool === "draw" ? "selected" : ""}
          onClick={() => setTool("draw")}
        >
          <Pencil size={14} />
        </button>
        <button
          aria-label="音符笔刷"
          title="连续绘制 (B)"
          className={tool === "brush" ? "selected" : ""}
          onClick={() => setTool("brush")}
        >
          <Paintbrush size={14} />
        </button>
        <button
          aria-label="音符删除"
          title="连续删除 (D)"
          className={tool === "delete" ? "selected" : ""}
          onClick={() => setTool("delete")}
        >
          <Eraser size={14} />
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
        <SnapPicker label="音符吸附" value={snap} onChange={setSnap} />
        <button aria-label="音符适应内容" title="缩放适应内容" onClick={fit}>
          <Scan size={14} />
        </button>
        <select
          aria-label="音符缩放"
          value={zoom}
          onChange={(e) => setZoom(+e.target.value)}
        >
          {[...new Set([12, 18, 25, 32, 42, zoom])]
            .sort((a, b) => a - b)
            .map((v) => (
              <option value={v} key={v}>
                {Math.round(v * 4)}%
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
      <section className="instrument-focus-panel" aria-label="音色焦点">
        <div
          className="instrument-strip instrument-focus-header"
          data-testid="instrument-strip"
        >
          <span
            className="instrument-dot"
            style={{ background: sample?.color }}
          />
          <label>
            当前落笔音色
            <select
              aria-label="落笔音色"
              value={instrument}
              onChange={(e) => {
                setInstrument(+e.target.value);
              }}
            >
              {project.instruments.map((i) => (
                <option value={i.id} key={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <span className="instrument-focus-count" aria-live="polite">
            {choices.find((i) => i.id === instrument)?.count ?? 0} 音符
          </span>
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
          <button
            className="instrument-show-all"
            aria-label="显示全部音色"
            aria-pressed={showAllInstruments}
            title="仅调整显示，不改变播放或导出"
            onClick={() => setShowAllInstruments((v) => !v)}
          >
            <Layers size={14} />
            {showAllInstruments ? "全部清晰" : "聚焦当前"}
          </button>
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
            onClick={() =>
              void run({ type: "layer:add", patternId: pattern.id })
            }
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
        <div
          className="instrument-choices"
          ref={instrumentChoicesRef}
          role="radiogroup"
          aria-label="音色列表"
          onKeyDown={(e) => {
            if (
              ![
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
              ].includes(e.key) ||
              e.ctrlKey ||
              e.metaKey ||
              e.altKey
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            const focused = (e.target as HTMLElement).closest<HTMLElement>(
              "[data-instrument-id]",
            )?.dataset.instrumentId;
            const next =
              e.key === "Home"
                ? choices[0]?.id
                : e.key === "End"
                  ? choices.at(-1)?.id
                  : navigateInstrument(
                      choices,
                      focused === undefined ? instrument : +focused,
                      e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1,
                    );
            if (next === undefined) return;
            setInstrument(next);
            e.currentTarget
              .querySelector<HTMLButtonElement>(
                `[data-instrument-id="${next}"]`,
              )
              ?.focus();
          }}
        >
          {choices.map((choice) => {
            const def = project.instruments.find((i) => i.id === choice.id);
            const color =
              project.samples.find((s) => s.id === def?.sampleId)?.color ??
              pattern.color;
            return (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-label={`${choice.name} · ${choice.count} 音符`}
                aria-checked={choice.id === instrument}
                tabIndex={choice.id === instrument ? 0 : -1}
                data-instrument-id={choice.id}
                className={`instrument-chip${choice.id === instrument ? " current" : ""}${choice.count ? " used" : ""}`}
                title={`${choice.name} · ${choice.count} 音符 · G/K 切换 · H/J 已使用音色`}
                onClick={() => setInstrument(choice.id)}
              >
                <span
                  className="instrument-chip-dot"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <span className="instrument-chip-name">{choice.name}</span>
                <span className="instrument-chip-count">{choice.count}</span>
                {choice.id === instrument && (
                  <span className="instrument-chip-current">当前</span>
                )}
              </button>
            );
          })}
        </div>
      </section>
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
                  if (e.button === 0 && y >= H) {
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
                const at = atTick(p.tick, e.altKey);
                setCursor(at);
                if (y < H) {
                  if (e.button === 0) seek(at);
                  return;
                }
                if (p.row < 0 || p.row >= rows || ![0, 2].includes(e.button))
                  return;
                cancelGesture.current?.();
                e.preventDefault();
                const note = hit(x, y);
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
                if (e.button === 2 || tool === "delete") {
                  const removed = new Set<string>();
                  let previous = { x: p.tick, y: p.row + 0.5 };
                  const erase = (v: { clientX: number; clientY: number }) => {
                    const q = point(
                        v.clientX - rect.left,
                        v.clientY - rect.top,
                      ),
                      end = { x: q.tick, y: q.row + 0.5 };
                    for (const n of pattern.notes)
                      if (
                        !pattern.layers[n.layer]?.locked &&
                        segmentIntersectsRect(previous, end, {
                          x: n.tick,
                          y: mode === "piano" ? 108 - n.pitch : n.layer,
                          w: Math.max(0.55, unit * 0.9),
                          h: 1,
                        })
                      )
                        removed.add(n.id);
                    previous = end;
                    setErased([...removed]);
                    setFeedback(`擦除 ${removed.size} 个音符 · 松开提交`);
                  };
                  erase(e);
                  start(erase, (up) => {
                    erase(up);
                    if (removed.size)
                      void run({
                        type: "notes:remove",
                        patternId: pattern.id,
                        ids: [...removed],
                      });
                  });
                  return;
                }
                if (e.ctrlKey || tool === "select") {
                  if (note && e.ctrlKey) {
                    setIds(
                      selectedIds.has(note.id)
                        ? ids.filter((id) => id !== note.id)
                        : [...ids, note.id],
                    );
                    return;
                  }
                  start(
                    (move) =>
                      setBox({
                        x: Math.min(x, move.clientX - rect.left),
                        y: Math.min(y, move.clientY - rect.top),
                        w: Math.abs(move.clientX - rect.left - x),
                        h: Math.abs(move.clientY - rect.top - y),
                      }),
                    (up) => {
                      const end = point(
                          up.clientX - rect.left,
                          up.clientY - rect.top,
                        ),
                        found = pattern.notes
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
                    },
                  );
                  return;
                }
                const brush = tool === "brush" || (!note && e.shiftKey);
                if (brush || !note) {
                  const spacing = e.altKey ? 1 / 24 : unit,
                    stroke = new BrushStroke(spacing, 0);
                  let pending: Note[] = [];
                  const insert = (tick: number, row: number) => {
                    const key = mode === "piano" ? 108 - row : pitch,
                      targetLayer = mode === "layers" ? row : layer;
                    if (
                      tick < 0 ||
                      row < 0 ||
                      row >= rows ||
                      key < 21 ||
                      key > 108 ||
                      pattern.layers[targetLayer]?.locked
                    )
                      return;
                    const all = [...pattern.notes, ...pending];
                    if (
                      all.some(
                        (n) =>
                          Math.abs(n.tick - tick) < 1e-7 &&
                          (mode === "piano"
                            ? n.pitch === key
                            : n.layer === targetLayer),
                      )
                    )
                      return;
                    let next = targetLayer;
                    while (
                      all.some(
                        (n) =>
                          Math.abs(n.tick - tick) < 1e-7 && n.layer === next,
                      ) ||
                      pattern.layers[next]?.locked
                    )
                      next++;
                    pending.push({
                      id: `preview-${pending.length}`,
                      tick,
                      layer: next,
                      pitch: key,
                      instrument,
                      velocity,
                      panning: 100,
                      finePitch: 0,
                    });
                  };
                  const paint = (v: {
                    clientX: number;
                    clientY: number;
                    altKey: boolean;
                  }) => {
                    const q = point(
                      v.clientX - rect.left,
                      v.clientY - rect.top,
                    );
                    if (brush) {
                      const cells = stroke.visit(q.tick, q.row);
                      if (stroke.exceeded) {
                        pending = [];
                        setGhost([]);
                        setFeedback(
                          "手势超过 10,000 个位置，已取消；请分段绘制",
                        );
                        return;
                      }
                      for (const cell of cells) insert(cell.tick, cell.row);
                    } else {
                      pending = [];
                      insert(atTick(q.tick, v.altKey), q.row);
                    }
                    setGhost([...pending]);
                    setFeedback(
                      `${brush ? "笔刷" : "放置"} ${pending.length} 个音符 · 松开提交`,
                    );
                  };
                  setPitch(p.pitch);
                  paint(e);
                  start(paint, (up) => {
                    paint(up);
                    if (pending.length)
                      void run({
                        type: "notes:add",
                        patternId: pattern.id,
                        notes: pending.map(({ id, ...n }) => n),
                      }).then((result) => {
                        if (result)
                          setIds(
                            result.project.patterns
                              .find((v) => v.id === pattern.id)!
                              .notes.slice(-pending.length)
                              .map((n) => n.id),
                          );
                      });
                  });
                  return;
                }
                if (pattern.layers[note.layer]?.locked) return;
                const next = selectedIds.has(note.id) ? ids : [note.id];
                setIds(next);
                const nextIds = new Set(next);
                const originals = pattern.notes.filter((n) =>
                    nextIds.has(n.id),
                  ),
                  copyDrag = e.shiftKey;
                const delta = (event: PointerEvent) => ({
                  ticks: Math.max(
                    -originals.reduce(
                      (bound, n) => Math.min(bound, n.tick),
                      Infinity,
                    ),
                    snapDelta(
                      (event.clientX - e.clientX) / zoom,
                      snap,
                      zoom,
                      bar,
                      event.altKey,
                    ),
                  ),
                  pitches:
                    mode === "piano"
                      ? Math.max(
                          21 -
                            originals.reduce(
                              (bound, n) => Math.min(bound, n.pitch),
                              Infinity,
                            ),
                          Math.min(
                            108 -
                              originals.reduce(
                                (bound, n) => Math.max(bound, n.pitch),
                                -Infinity,
                              ),
                            -Math.round((event.clientY - e.clientY) / rh),
                          ),
                        )
                      : 0,
                  layers:
                    mode === "layers"
                      ? Math.max(
                          -originals.reduce(
                            (bound, n) => Math.min(bound, n.layer),
                            Infinity,
                          ),
                          Math.round((event.clientY - e.clientY) / rh),
                        )
                      : 0,
                });
                start(
                  (move) => {
                    const d = delta(move);
                    setGhost(
                      originals.map((n) => ({
                        ...n,
                        tick: n.tick + d.ticks,
                        pitch: n.pitch + d.pitches,
                        layer: n.layer + d.layers,
                      })),
                    );
                  },
                  (up) => {
                    const d = delta(up);
                    if (d.ticks || d.pitches || d.layers) {
                      if (copyDrag)
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
                  },
                );
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
                selectedIds.has(n.id) ? "velocity-bar chosen" : "velocity-bar"
              }
              aria-label={`力度 Tick ${n.tick} 图层 ${n.layer + 1}`}
              title={`${n.velocity}%`}
              style={{
                opacity: noteOpacity(
                  n.instrument,
                  instrument,
                  showAllInstruments,
                  selectedIds.has(n.id),
                  !!(
                    pattern.layers[n.layer]?.locked ||
                    pattern.layers[n.layer]?.muted
                  ),
                ),
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
                  affected = selectedIds.has(n.id) ? ids : [n.id];
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
        <span className="gesture-feedback" role="status">
          {feedback || "P 绘制 · B 连续笔刷 · 右键擦除 · Alt 自由定位"}
        </span>
        <span className="spacer" />
        <span>
          {Number(cursor.toFixed(3))} tick · {pitchName(pitch)}
        </span>
      </div>
    </div>
  );
}

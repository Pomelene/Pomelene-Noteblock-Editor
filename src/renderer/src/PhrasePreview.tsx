import { useEffect, useMemo, useRef, useState } from "react";
import {
  LockKeyhole,
  Pause,
  Play,
  Square,
  Piano,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { pitchName, type PhraseSample } from "../../shared/model";
import "./phrase-preview.css";

/** Deliberately has no note-editing handlers or mutable Pattern editor controls. */
export function PhrasePreview({
  phrase,
  tick,
  playing,
  toggle,
  stop,
  createPattern,
}: {
  phrase: PhraseSample;
  tick?: number;
  playing: boolean;
  toggle: () => void;
  stop: () => void;
  createPattern: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(() =>
    Math.min(36, Math.max(4, 640 / phrase.length)),
  );
  const [view, setView] = useState({ width: 800, height: 300, x: 0, y: 0 });
  const { visibleNotes, low, high } = useMemo(() => {
    const visibleNotes = phrase.notes.filter((n) => n.tick < phrase.length);
    let low = visibleNotes[0]?.pitch ?? 48,
      high = visibleNotes[0]?.pitch ?? 72;
    for (const n of visibleNotes) {
      low = Math.min(low, n.pitch);
      high = Math.max(high, n.pitch);
    }
    if (high - low < 12) {
      const middle = (low + high) / 2;
      low = Math.floor(middle - 6);
      high = Math.ceil(middle + 6);
    }
    return {
      visibleNotes,
      low: Math.max(0, low - 2),
      high: Math.min(127, high + 2),
    };
  }, [phrase]);
  const left = 62,
    top = 27,
    row = 14;
  useEffect(() => {
    const el = scroller.current!;
    const observer = new ResizeObserver(([entry]) =>
      setView((v) => ({
        ...v,
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(1, Math.floor(entry.contentRect.height)),
      })),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const ratio = devicePixelRatio || 1;
    el.width = Math.round(view.width * ratio);
    el.height = Math.round(view.height * ratio);
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#222a2f";
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.font = "11px Segoe UI, Microsoft YaHei";
    ctx.textBaseline = "middle";
    for (let pitch = low; pitch <= high; pitch++) {
      const y = top + (high - pitch) * row - view.y;
      if (y + row < top || y > view.height) continue;
      ctx.fillStyle = [1, 3, 6, 8, 10].includes(pitch % 12)
        ? "#20282e"
        : "#293238";
      ctx.fillRect(left, y, view.width, row - 1);
      ctx.fillStyle = "#a9b5bc";
      ctx.fillText(pitchName(pitch), 12, y + row / 2);
    }
    const stride = zoom < 10 ? 4 : 1;
    for (
      let t = Math.floor(view.x / zoom / stride) * stride;
      t <= (view.x + view.width) / zoom;
      t += stride
    ) {
      const x = left + t * zoom - view.x;
      if (x < left) continue;
      ctx.fillStyle = t % 4 === 0 ? "#435058" : "#333e46";
      ctx.fillRect(x, top, 1, view.height);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, view.width - left, view.height - top);
    ctx.clip();
    for (const n of visibleNotes) {
      const x = left + n.tick * zoom - view.x,
        y = top + (high - n.pitch) * row - view.y;
      if (x + zoom < left || x > view.width || y + row < top || y > view.height)
        continue;
      const layer = phrase.layers[n.layer];
      ctx.globalAlpha =
        layer?.muted || layer?.locked ? 0.35 : 0.55 + n.velocity / 230;
      ctx.fillStyle = phrase.color;
      ctx.fillRect(x + 1, y + 2, Math.max(2, Math.min(zoom - 1, 13)), row - 4);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.fillStyle = "#303940";
    ctx.fillRect(0, 0, view.width, top);
    ctx.fillStyle = "#b8c4c9";
    ctx.fillText("TICK", 12, top / 2);
    for (
      let t = Math.floor(view.x / zoom / 4) * 4;
      t <= (view.x + view.width) / zoom;
      t += 4
    ) {
      const x = left + t * zoom - view.x;
      if (x >= left) ctx.fillText(String(t), x + 4, top / 2);
    }
    if (tick !== undefined) {
      const x = left + tick * zoom - view.x;
      if (x >= left && x <= view.width) {
        ctx.fillStyle = "#ecc17d";
        ctx.fillRect(x, 0, 1.5, view.height);
      }
    }
  }, [phrase, tick, view, zoom, low, high]);
  return (
    <section className="phrase-preview" aria-label="片段采样只读预览">
      <div className="phrase-preview-toolbar">
        <span className="readonly-badge">
          <LockKeyhole size={13} />
          只读采样
        </span>
        <button
          aria-label={playing ? "暂停片段采样" : "预听片段采样"}
          onClick={toggle}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button aria-label="终止片段采样" onClick={stop}>
          <Square size={13} />
        </button>
        <span className="spacer" />
        <button className="phrase-convert" onClick={createPattern}>
          <Piano size={14} />
          根据采样创建 Pattern
        </button>
        <button
          aria-label="缩小采样预览"
          disabled={zoom <= 4}
          onClick={() => setZoom((v) => Math.max(4, v - 4))}
        >
          <ZoomOut size={14} />
        </button>
        <button
          aria-label="放大采样预览"
          disabled={zoom >= 36}
          onClick={() => setZoom((v) => Math.min(36, v + 4))}
        >
          <ZoomIn size={14} />
        </button>
      </div>
      <p className="phrase-readonly-hint">
        此片段可反复编排、裁剪或补静音；需要改音符时，先创建独立 Pattern。
      </p>
      <div
        ref={scroller}
        className="phrase-scroll"
        onScroll={(e) =>
          setView((v) => ({
            ...v,
            x: e.currentTarget.scrollLeft,
            y: e.currentTarget.scrollTop,
          }))
        }
      >
        <div
          style={{
            width: Math.max(view.width, left + phrase.length * zoom),
            height: Math.max(view.height, top + (high - low + 1) * row),
          }}
        >
          <canvas
            ref={canvas}
            data-testid="phrase-canvas"
            aria-label={`${phrase.name}，${visibleNotes.length} 个音符，只读`}
            style={{
              position: "sticky",
              left: 0,
              top: 0,
              width: view.width,
              height: view.height,
            }}
          />
        </div>
      </div>
      <footer className="phrase-preview-footer">
        <span>
          {visibleNotes.length} 音符 · {phrase.layers.length} 图层
        </span>
        <span>{Number(phrase.length.toFixed(3))} ticks</span>
        <span>音符数据已冻结</span>
      </footer>
    </section>
  );
}

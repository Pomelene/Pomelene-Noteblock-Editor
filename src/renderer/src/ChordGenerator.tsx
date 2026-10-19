import { useEffect, useRef, useState } from "react";
import { Headphones, Music2, Plus, X } from "lucide-react";
import {
  CHORD_QUALITIES,
  NOTE_NAMES,
  chordName,
  chordPitches,
  diatonicChords,
  planChordPlacement,
  type ChordExtension,
  type ChordMode,
  type ChordQuality,
  type ChordSpec,
} from "../../shared/chords";
import {
  pitchName,
  ticksPerBar,
  type Pattern,
  type Project,
  type Snapshot,
} from "../../shared/model";
import type { Run } from "./ui";
import { audio } from "./audio";
import "./chord-generator.css";

export function ChordGenerator({
  project,
  pattern,
  tick,
  root,
  layer,
  instrument,
  velocity,
  run,
  onRoot,
  onPlaced,
  onClose,
}: {
  project: Project;
  pattern: Pattern;
  tick: number;
  root: number;
  layer: number;
  instrument: number;
  velocity: number;
  run: Run;
  onRoot: (pitch: number) => void;
  onPlaced: (snapshot: Snapshot, nextTick?: number) => void;
  onClose: () => void;
}) {
  const [quality, setQuality] = useState<ChordQuality>("major"),
    [extension, setExtension] = useState<ChordExtension>("none"),
    [inversion, setInversion] = useState(0),
    [spread, setSpread] = useState(false),
    [bass, setBass] = useState("none"),
    [tonic, setTonic] = useState(0),
    [scale, setScale] = useState<"major" | "minor">("major"),
    [mode, setMode] = useState<ChordMode>("block"),
    [step, setStep] = useState(1),
    [advance, setAdvance] = useState(false),
    [advanceTicks, setAdvanceTicks] = useState(4),
    [replace, setReplace] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const alive = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      audio.stopPreview();
    };
  }, []);
  useEffect(() => {
    audio.stopPreview();
  }, [
    root,
    quality,
    extension,
    inversion,
    spread,
    bass,
    mode,
    step,
    instrument,
    velocity,
    tick,
  ]);
  const spec: ChordSpec = {
    root,
    quality,
    extension,
    inversion,
    spread,
    bass: bass === "none" ? null : bass === "root" ? "root" : +bass,
  };
  let pitches: number[] = [],
    name = "—",
    error = "";
  try {
    pitches = chordPitches(spec);
    name = chordName(spec);
  } catch (e) {
    error = (e as Error).message;
  }
  const bar = ticksPerBar(project.meter),
    beatTicks = 16 / Number(project.meter.split("/")[1]),
    measure = Math.floor(tick / bar) + 1,
    beat = Math.floor((tick % bar) / beatTicks) + 1,
    fraction = Number((tick % beatTicks).toFixed(3));
  const octave = Math.max(1, Math.min(6, Math.floor(root / 12) - 1));
  async function act(preview: boolean, override?: ChordSpec) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const placement = {
        spec: override ?? spec,
        tick,
        layer,
        instrument,
        velocity,
        mode,
        stepTicks: step,
        replace,
      };
      const planned = planChordPlacement(pattern, placement);
      if (preview) await audio.previewNotes(project, planned.notes);
      else {
        const result = await run({
          type: "notes:chord",
          patternId: pattern.id,
          placement,
        });
        if (result && alive.current) {
          const end = Math.max(...planned.notes.map((n) => n.tick));
          onPlaced(
            result,
            advance
              ? Math.min(1_048_575, Math.max(tick + advanceTicks, end + step))
              : undefined,
          );
          setMessage(`已放置 ${planned.notes.length} 个音符 · Ctrl+Z 撤销整组`);
        }
      }
    } catch (e) {
      if (alive.current) setMessage((e as Error).message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <aside className="chord-generator" aria-label="和弦生成面板">
      <header>
        <div>
          <Music2 size={15} />
          <strong>和弦生成器</strong>
        </div>
        <button
          aria-label="关闭和弦生成器"
          title="关闭和弦生成器"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>
      <div className="chord-target">
        <span>
          落点{" "}
          <b>
            {measure}:{String(beat).padStart(2, "0")}:{fraction}
          </b>
        </span>
        <span>
          {Number(tick.toFixed(3))} tick · 图层 {layer + 1}
        </span>
      </div>
      <p className="chord-hint">
        在网格左键选择落点{"；钢琴卷帘同时选择根音"}。右键仍可连续擦除。
      </p>
      <div className="chord-summary">
        <strong>{name}</strong>
        <span>{pitches.map(pitchName).join(" · ") || "请调整音区"}</span>
        <small>
          {project.instruments.find((i) => i.id === instrument)?.name} · 力度{" "}
          {velocity}
        </small>
      </div>
      <div className="chord-actions">
        <button
          disabled={!!error || busy}
          aria-label="试听和弦"
          onClick={() => void act(true)}
        >
          <Headphones size={14} />
          试听
        </button>
        <button
          className="chord-place"
          disabled={!!error || busy}
          aria-label="放置和弦"
          onClick={() => void act(false)}
        >
          <Plus size={14} />
          {busy ? "处理中…" : "放置和弦"}
        </button>
      </div>
      <div className="chord-fields">
        <label>
          根音{" "}
          <input
            aria-label="和弦根音 MIDI"
            type="number"
            min={21}
            max={108}
            value={root}
            onChange={(e) => onRoot(+e.target.value)}
          />
          <small>{pitchName(root)}</small>
        </label>
        <label>
          和弦类型
          <select
            aria-label="和弦类型"
            value={quality}
            onChange={(e) => setQuality(e.target.value as ChordQuality)}
          >
            {Object.entries(CHORD_QUALITIES).map(([id, q]) => (
              <option key={id} value={id}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="chord-diatonic">
        <div className="chord-section-title">
          调内和弦 <small>点击选择，再放置</small>
        </div>
        <div className="chord-fields">
          <label>
            调性
            <select
              aria-label="调性主音"
              value={tonic}
              onChange={(e) => setTonic(+e.target.value)}
            >
              {NOTE_NAMES.map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            调式
            <select
              aria-label="和弦调式"
              value={scale}
              onChange={(e) => setScale(e.target.value as typeof scale)}
            >
              <option value="major">大调</option>
              <option value="minor">自然小调</option>
            </select>
          </label>
        </div>
        <div className="chord-degrees">
          {diatonicChords(tonic, scale, octave).map((c) => {
            const selected = root === c.root && quality === c.quality;
            return (
              <button
                key={c.degree}
                aria-pressed={selected}
                title={`${c.degree} · ${NOTE_NAMES[c.root % 12]}${CHORD_QUALITIES[c.quality].suffix}`}
                onClick={() => {
                  onRoot(c.root);
                  setQuality(c.quality);
                  setInversion(0);
                  setExtension("none");
                  setBass("none");
                  setSpread(false);
                }}
              >
                <small>{c.degree}</small>
                <b>
                  {NOTE_NAMES[c.root % 12]}
                  {CHORD_QUALITIES[c.quality].suffix}
                </b>
              </button>
            );
          })}
        </div>
      </section>
      <details>
        <summary>转位与排列</summary>
        <div className="chord-fields">
          <label>
            转位
            <select
              aria-label="和弦转位"
              value={inversion}
              onChange={(e) => setInversion(+e.target.value)}
            >
              {["原位", "第一转位", "第二转位", "第三转位"].map((n, i) => (
                <option value={i} key={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            附加音
            <select
              aria-label="和弦附加音"
              value={extension}
              onChange={(e) => setExtension(e.target.value as ChordExtension)}
            >
              {["none", "6", "9", "11", "13"].map((n) => (
                <option key={n} value={n}>
                  {n === "none" ? "无" : `add ${n}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            低音
            <select
              aria-label="和弦低音"
              value={bass}
              onChange={(e) => setBass(e.target.value)}
            >
              <option value="none">不添加</option>
              <option value="root">根音低八度</option>
              {NOTE_NAMES.map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="chord-check">
          <input
            type="checkbox"
            checked={spread}
            onChange={(e) => setSpread(e.target.checked)}
          />
          开放排列
        </label>
      </details>
      <div className="chord-fields">
        <label>
          触发方式
          <select
            aria-label="和弦触发方式"
            value={mode}
            onChange={(e) => setMode(e.target.value as ChordMode)}
          >
            <option value="block">同时</option>
            <option value="up">上行分解</option>
            <option value="down">下行分解</option>
          </select>
        </label>
        {mode !== "block" && (
          <label>
            音符间隔
            <select
              aria-label="和弦音符间隔"
              value={step}
              onChange={(e) => setStep(+e.target.value)}
            >
              {[0.25, 0.5, 1, 2, 4].map((n) => (
                <option key={n} value={n}>
                  {n} tick
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="chord-check">
        <input
          type="checkbox"
          checked={advance}
          onChange={(e) => setAdvance(e.target.checked)}
        />
        放置后前进{" "}
        <select
          aria-label="和弦前进距离"
          disabled={!advance}
          value={advanceTicks}
          onChange={(e) => setAdvanceTicks(+e.target.value)}
        >
          {[1, 2, 4, 8, bar]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((n) => (
              <option key={n} value={n}>
                {n} tick
              </option>
            ))}
        </select>
      </label>
      <label className="chord-check">
        <input
          type="checkbox"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
        />
        替换落点处当前音色
      </label>
      <p className="chord-hint">
        默认追加并自动分配空闲图层。替换仅影响生成时刻的当前音色，保留锁定音符。
      </p>
      <div className={`chord-message${error ? " error" : ""}`} role="status">
        {error || message || "每次放置可一步撤销"}
      </div>
    </aside>
  );
}

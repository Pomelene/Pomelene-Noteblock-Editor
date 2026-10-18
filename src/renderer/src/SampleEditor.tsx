import { Fragment, useEffect, useState } from "react";
import { Play, Volume2, FileAudio, Music2 } from "lucide-react";
import { audio } from "./audio";
import { pitchName, type Project, type Sample } from "../../shared/model";
import type { Run } from "./ui";
import { InstrumentMappingControls } from "./InstrumentManager";
export function SampleEditor({
  project,
  sample,
  run,
  report,
}: {
  project: Project;
  sample: Sample;
  run: Run;
  report: (s: string) => void;
}) {
  const [peaks, setPeaks] = useState<number[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setPeaks([]);
    setError("");
    void audio
      .getSamplePeaks(project, sample.id)
      .then((p) => {
        if (live) setPeaks(p);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [sample.id, sample.dataUrl, sample.builtin]);
  const used = project.instruments.filter((i) => i.sampleId === sample.id),
    clips = project.clips.filter(
      (c) => c.kind === "sample" && c.sourceId === sample.id,
    ).length;
  return (
    <div className="sample-editor" data-testid="sample-editor">
      <div className="sample-heading">
        <div className="sample-symbol" style={{ color: sample.color }}>
          <FileAudio size={26} />
        </div>
        <div>
          <strong>{sample.name}</strong>
          <small>
            {sample.builtin
              ? "内置采样 · 离线可用"
              : sample.dataUrl
                ? "项目采样 · 已随工程保存"
                : "等待关联采样文件"}
          </small>
        </div>
        <span className="spacer" />
        <button
          className="accent-button"
          aria-label="试听采样"
          onClick={() =>
            void audio
              .previewSample(project, sample.id)
              .catch((e) => report(e.message))
          }
        >
          <Play size={14} />
          试听
        </button>
      </div>
      <div className="waveform" style={{ color: sample.color }}>
        {peaks.length ? (
          <svg
            viewBox="0 0 640 160"
            preserveAspectRatio="none"
            aria-label="实际采样波形"
          >
            <line
              x1={0}
              x2={640}
              y1={80}
              y2={80}
              stroke="currentColor"
              opacity={0.2}
            />
            {peaks.map((p, i) => (
              <line
                key={i}
                x1={(i * 640) / peaks.length}
                x2={(i * 640) / peaks.length}
                y1={80 - p * 66}
                y2={80 + p * 66}
                stroke="currentColor"
                strokeWidth={2}
              />
            ))}
          </svg>
        ) : (
          <span>{error || "正在读取采样波形…"}</span>
        )}
      </div>
      <div className="sample-properties">
        <label>
          名称
          <input
            aria-label="采样名称"
            key={sample.id + sample.name}
            defaultValue={sample.name}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== sample.name)
                void run({
                  type: "sample:update",
                  id: sample.id,
                  patch: { name: e.target.value },
                });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <label>
          颜色
          <input
            type="color"
            aria-label="采样颜色"
            value={sample.color}
            onChange={(e) =>
              void run({
                type: "sample:update",
                id: sample.id,
                patch: { color: e.target.value },
              })
            }
          />
        </label>
        <label>
          预听基准
          <select
            aria-label="采样基准音高"
            value={sample.rootKey}
            onChange={(e) =>
              void run({
                type: "sample:update",
                id: sample.id,
                patch: { rootKey: +e.target.value },
              })
            }
          >
            {Array.from({ length: 88 }, (_, i) => i + 21).map((p) => (
              <option value={p} key={p}>
                {pitchName(p)}
              </option>
            ))}
          </select>
        </label>
        <label>
          预听音量 <span>{sample.volume}%</span>
          <input
            type="range"
            aria-label="采样音量"
            min={0}
            max={100}
            value={sample.volume}
            onChange={(e) =>
              void run({
                type: "sample:update",
                id: sample.id,
                patch: { volume: +e.target.value },
              })
            }
          />
        </label>
        <label>
          预听声像{" "}
          <span>
            {sample.panning === 100
              ? "居中"
              : sample.panning < 100
                ? "左"
                : "右"}
          </span>
          <input
            type="range"
            aria-label="采样声像"
            min={0}
            max={200}
            value={sample.panning}
            onChange={(e) =>
              void run({
                type: "sample:update",
                id: sample.id,
                patch: { panning: +e.target.value },
              })
            }
          />
        </label>
      </div>
      <div className="sample-instruments">
        <div className="section-heading">
          <Music2 size={14} />
          <strong>NBS 乐器关联</strong>
          <span>
            {used.length} 个乐器 · {clips} 个直接引用
          </span>
        </div>
        {used.map((i) => (
          <Fragment key={i.id}><div className="instrument-setting">
            <span>{i.name}</span>
            <label>
              NBS 调音
              <select
                aria-label={`乐器 ${i.id} 调音`}
                value={i.key}
                disabled={i.id < 16}
                title={
                  i.id < 16
                    ? "原版乐器调音由 NBS 格式固定"
                    : "自定义乐器 NBS 调音"
                }
                onChange={(e) =>
                  void run({
                    type: "instrument:update",
                    id: i.id,
                    patch: { key: +e.target.value },
                  })
                }
              >
                {Array.from({ length: 88 }, (_, n) => (
                  <option value={n} key={n}>
                    {pitchName(n + 21)} · {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              title="以 F♯4 预听"
              aria-label={`预听乐器 ${i.id}`}
              onClick={() =>
                void audio
                  .preview(project, i.id, 66)
                  .catch((e) => report(e.message))
              }
            >
              <Volume2 size={15} />
            </button>
          </div>
          {(i.id >= 16 || i.mappingTargetId !== undefined || (!sample.builtin && !sample.dataUrl)) && <InstrumentMappingControls project={project} instrument={i} run={run} report={report} />}
          </Fragment>
        ))}
        {!used.length && (
          <p className="subtle">
            这个采样可以直接放入 Playlist；导出 NBS
            时会提示无法直接表示的音频引用。
          </p>
        )}
      </div>
      <div className="sample-location">
        <FileAudio size={13} />
        <span title={sample.originalPath}>
          {sample.originalPath ??
            (sample.builtin ? `内置 / ${sample.builtin}.ogg` : "工程内嵌采样")}
        </span>
      </div>
    </div>
  );
}

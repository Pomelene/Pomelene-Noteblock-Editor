import { useMemo, useState } from "react";
import { Volume2 } from "lucide-react";
import type { Instrument, Project } from "../../shared/model";
import { getNbsEventKind } from "../../shared/nbsEvents";
import { NbsEventSummary } from "./NbsEventSummary";
import {
  playableMappingTargets,
  suggestInstrumentMapping,
} from "../../shared/instrumentMapping";
import type { Run } from "./ui";
import { audio } from "./audio";
import "./instrument-manager.css";
type Props = { project: Project; run: Run; report: (message: string) => void };
export function InstrumentMappingControls({
  project,
  instrument,
  run,
  report,
}: Props & { instrument: Instrument }) {
  const [pending, setPending] = useState(false);
  const targets = useMemo(
    () => playableMappingTargets(project, instrument.id),
    [project, instrument.id],
  );
  const suggestion = useMemo(
    () => suggestInstrumentMapping(project, instrument.id),
    [project, instrument.id],
  );
  const source = project.samples.find((s) => s.id === instrument.sampleId);
  if (getNbsEventKind(instrument.name))
    return <p>NBS 控制定义随歌曲保留，无需音频映射。</p>;
  const playable = !!(source?.builtin || source?.dataUrl);
  const change = async (targetId?: number) => {
    setPending(true);
    try {
      await run({
        type: "instrument:map",
        id: instrument.id,
        ...(targetId === undefined ? {} : { targetId }),
      });
    } catch (e) {
      report(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="instrument-mapping-controls">
      <p className="instrument-source-status">
        原音色：{playable ? "音频可用" : "缺少音频"}
        {source?.originalPath && (
          <span title={source.originalPath}> · {source.originalPath}</span>
        )}
      </p>
      <label>
        播放 / 导出音色
        <select
          aria-label={`乐器 ${instrument.id} 映射目标`}
          value={instrument.mappingTargetId ?? ""}
          disabled={pending}
          onChange={(e) =>
            void change(
              e.target.value === "" ? undefined : Number(e.target.value),
            )
          }
        >
          <option value="">保留原音色{playable ? "" : "（缺少音频）"}</option>
          {targets.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} · #{i.id}
            </option>
          ))}
        </select>
      </label>
      <div className="instrument-mapping-actions">
        <button
          disabled={pending || instrument.mappingTargetId === undefined}
          aria-label={`重置乐器 ${instrument.id} 映射`}
          onClick={() => void change()}
        >
          重置映射
        </button>
        <button
          disabled={
            pending || (!playable && instrument.mappingTargetId === undefined)
          }
          aria-label={`试听映射乐器 ${instrument.id}`}
          onClick={() =>
            void audio
              .preview(project, instrument.id, 66)
              .catch((e) => report(e.message))
          }
        >
          <Volume2 size={14} />
          试听
        </button>
      </div>
      {suggestion && (
        <div className="instrument-suggestion">
          <p>
            建议：
            {
              project.instruments.find((i) => i.id === suggestion.targetId)
                ?.name
            }{" "}
            <span>· {suggestion.reasons.join(" · ")}</span>
          </p>
          <button
            disabled={
              pending || instrument.mappingTargetId === suggestion.targetId
            }
            aria-label={`应用乐器 ${instrument.id} 的建议映射`}
            onClick={() => void change(suggestion.targetId)}
          >
            应用建议
          </button>
        </div>
      )}
      {!targets.length && (
        <p role="status">暂无可用的其他乐器，请先导入音频资源。</p>
      )}
    </div>
  );
}
export function InstrumentManager({ project, run, report }: Props) {
  const custom = project.instruments.filter(
    (i) =>
      i.id >= 16 ||
      i.mappingTargetId !== undefined ||
      !project.samples.some(
        (s) => s.id === i.sampleId && (s.builtin || s.dataUrl),
      ),
  );
  return (
    <section
      className="instrument-manager"
      aria-label="自定义音色与映射"
      data-testid="instrument-manager"
    >
      <p className="instrument-manager-intro">
        为缺失或不支持的音色选择现有乐器。映射随工程保存，可随时修改、重置或撤销；播放和
        NBS 导出使用相同映射。
      </p>
      <NbsEventSummary project={project} />
      <p className="instrument-manager-note">
        建议根据名称、音区与节奏生成，需点击“应用建议”才会生效，仅作近似替代。保留原音符、原音色定义和调音。
      </p>
      <div className="instrument-manager-list">
        {custom.map((i) => (
          <article key={i.id} className="instrument-mapping-card">
            <h3>
              {i.name}{" "}
              <span>
                #{i.id} · 原调音 {i.key}
              </span>
            </h3>
            <InstrumentMappingControls
              project={project}
              instrument={i}
              run={run}
              report={report}
            />
          </article>
        ))}
        {!custom.length && (
          <p>
            当前工程没有自定义或缺失音色。导入含自定义乐器的 NBS
            后，可在这里管理映射。
          </p>
        )}
      </div>
    </section>
  );
}

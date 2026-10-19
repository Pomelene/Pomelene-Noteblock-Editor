import type { Project } from "../../shared/model";
import { getNbsEventKind } from "../../shared/nbsEvents";
import "./nbs-events.css";

const kindLabel = { tempo: "速度", stop: "停止", visual: "视觉" };

export function NbsEventSummary({ project }: { project: Project }) {
  const events = project.nbsEvents ?? [];
  const definitions =
    project.nbs?.customInstruments.filter((i) => getNbsEventKind(i.name)) ?? [];
  if (!events.length && !definitions.length) return null;
  return (
    <details className="nbs-event-summary">
      <summary>
        NBS 控制事件 <small>{events.length}</small>
      </summary>
      <p>
        速度 {events.filter((e) => e.kind === "tempo").length} · 停止{" "}
        {events.filter((e) => e.kind === "stop").length} · 视觉{" "}
        {events.filter((e) => e.kind === "visual").length}
      </p>
      <p>
        整曲事件随工程 / NBS 保留。视觉效果仅保留、不执行；Show Save Popup
        不会保存文件。
      </p>
      <ul aria-label="NBS 控制事件位置">
        {events.slice(0, 200).map((event) => (
          <li key={event.id}>
            <strong>
              {kindLabel[event.kind]} ·{" "}
              {project.nbs?.customInstruments[event.instrument - 16]?.name ??
                `#${event.instrument}`}
            </strong>
            <span>
              tick {event.tick} · 源图层 {event.layer + 1}
            </span>
          </li>
        ))}
      </ul>
      {events.length > 200 && (
        <p>
          显示前 200 个事件位置，共 {events.length} 个；完整事件仍随工程 / NBS
          保存。
        </p>
      )}
      {definitions.length > 0 && (
        <p>
          保留控制定义：{definitions.map((i) => i.name).join("、")}
          。控制定义无需音频映射。
        </p>
      )}
    </details>
  );
}

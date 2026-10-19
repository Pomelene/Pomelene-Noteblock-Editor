import { formatTransportPosition } from "./formatTransportPosition";
import "./TransportPosition.css";

export function TransportPosition({
  tick,
  meter,
}: {
  tick: number;
  meter: string;
}) {
  const [bar, beat, subTick] = formatTransportPosition(tick, meter);
  return (
    <div
      className="transport-position"
      role="timer"
      aria-label="播放位置"
      aria-description={`第 ${Number(bar)} 小节，第 ${Number(beat)} 拍，拍内 ${Number(subTick) / 100} tick`}
      title="小节 · 拍 · 拍内 tick ×100"
      data-tick={tick}
    >
      <span
        className="transport-position-field transport-position-bar"
        aria-hidden="true"
      >
        <span className="transport-position-value">{bar}</span>
        <small className="transport-position-label">小节</small>
      </span>
      <span className="transport-position-separator" aria-hidden="true">
        ·
      </span>
      <span className="transport-position-field" aria-hidden="true">
        <span className="transport-position-value">{beat}</span>
        <small className="transport-position-label">拍</small>
      </span>
      <span className="transport-position-separator" aria-hidden="true">
        ·
      </span>
      <span className="transport-position-field" aria-hidden="true">
        <span className="transport-position-value">{subTick}</span>
        <small className="transport-position-label">刻度</small>
      </span>
    </div>
  );
}

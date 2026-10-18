import { Magnet } from "lucide-react";
import type { SnapId } from "./snap";
import "./interaction.css";

export function SnapPicker({
  value,
  onChange,
  label,
}: {
  value: SnapId;
  onChange: (id: SnapId) => void;
  label: string;
}) {
  return (
    <label className="snap-picker">
      <Magnet size={13} aria-hidden="true" />
      <span>吸附</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as SnapId)}
      >
        <optgroup label="网格">
          <option value="none">关闭（自由）</option>
          <option value="auto">自动网格</option>
        </optgroup>
        <optgroup label="按拍值（1 拍 = 四分音符）">
          <option value="beat">1 拍 · 1/4 音符</option>
          <option value="half-beat">1/2 拍 · 1/8 音符</option>
          <option value="quarter-beat">1/4 拍 · 1/16 音符</option>
          <option value="eighth-beat">1/8 拍 · 1/32 音符</option>
          <option value="sixteenth-beat">1/16 拍 · 1/64 音符</option>
        </optgroup>
        <optgroup label="三连音">
          <option value="third-beat">1/3 拍 · 1/8 三连音</option>
          <option value="sixth-beat">1/6 拍 · 1/16 三连音</option>
          <option value="twelfth-beat">1/12 拍 · 1/32 三连音</option>
        </optgroup>
        <optgroup label="小节">
          <option value="bar">1 小节（跟随拍号）</option>
        </optgroup>
      </select>
    </label>
  );
}

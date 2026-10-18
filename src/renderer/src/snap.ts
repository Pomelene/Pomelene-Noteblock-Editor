export type SnapId =
  | "none"
  | "auto"
  | "beat"
  | "half-beat"
  | "quarter-beat"
  | "eighth-beat"
  | "sixteenth-beat"
  | "third-beat"
  | "sixth-beat"
  | "twelfth-beat"
  | "bar";
export function snapUnit(id: SnapId, zoom: number, bar: number): number {
  if (id === "none") return 1 / 24;
  if (id === "auto")
    return [0.25, 0.5, 1, 2, 4, 8, bar].find((n) => n * zoom >= 12) ?? bar;
  return {
    beat: 4,
    "half-beat": 2,
    "quarter-beat": 1,
    "eighth-beat": 0.5,
    "sixteenth-beat": 0.25,
    "third-beat": 4 / 3,
    "sixth-beat": 2 / 3,
    "twelfth-beat": 1 / 3,
    bar,
  }[id];
}
export function snapPosition(
  tick: number,
  id: SnapId,
  zoom: number,
  bar: number,
  alt = false,
): number {
  if (alt || id === "none") return Math.max(0, Math.round(tick * 24) / 24);
  const unit = snapUnit(id, zoom, bar);
  return Math.max(0, Math.floor(tick / unit + 1e-8) * unit);
}
export function snapDelta(
  tick: number,
  id: SnapId,
  zoom: number,
  bar: number,
  alt = false,
): number {
  const unit = alt ? 1 / 24 : snapUnit(id, zoom, bar);
  return Math.round(tick / unit) * unit;
}
export function gridTicks(
  from: number,
  to: number,
  id: SnapId,
  zoom: number,
  bar: number,
): number[] {
  if (id === "none") return [];
  const unit = snapUnit(id, zoom, bar),
    result: number[] = [];
  for (let i = Math.floor(from / unit); i * unit <= to + 1e-8; i++)
    result.push(i * unit);
  return result;
}

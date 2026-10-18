import type { Clip } from "../../shared/model";
export function snapTick(tick: number, unit: number, bypass = false): number {
  return Math.max(
    0,
    bypass ? Math.round(tick * 24) / 24 : Math.floor(tick / unit + 1e-8) * unit,
  );
}
export function gridPoint(
  x: number,
  y: number,
  rect: { left: number; top: number },
  sx: number,
  sy: number,
  zoom: number,
  left: number,
  top: number,
  rowHeight: number,
) {
  return {
    tick: Math.max(0, (x - rect.left - left + sx) / zoom),
    row: Math.floor((y - rect.top - top + sy) / rowHeight),
  };
}
export function resizeClip(
  clip: Clip,
  edge: "left" | "right",
  tick: number,
): Clip {
  if (edge === "right")
    return { ...clip, length: Math.max(1 / 24, tick - clip.tick) };
  const start = Math.max(
    0,
    clip.tick - clip.offset,
    Math.min(tick, clip.tick + clip.length - 1 / 24),
  );
  return {
    ...clip,
    tick: start,
    offset: clip.offset + start - clip.tick,
    length: clip.length + clip.tick - start,
  };
}

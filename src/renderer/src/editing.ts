import type { Clip } from "../../shared/model";
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

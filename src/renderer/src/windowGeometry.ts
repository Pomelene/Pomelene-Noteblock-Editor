export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface WorkspaceBounds {
  width: number;
  height: number;
}
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export function fitWindow(
  rect: WindowRect,
  bounds: WorkspaceBounds,
): WindowRect {
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  const w = clamp(rect.w, Math.min(640, width), width);
  const h = clamp(rect.h, Math.min(360, height), height);
  return {
    x: clamp(rect.x, 0, width - w),
    y: clamp(rect.y, 0, height - h),
    w,
    h,
  };
}

export function moveWindow(
  rect: WindowRect,
  dx: number,
  dy: number,
  bounds: WorkspaceBounds,
): WindowRect {
  const fitted = fitWindow(rect, bounds);
  return fitWindow({ ...fitted, x: fitted.x + dx, y: fitted.y + dy }, bounds);
}

export function resizeWindow(
  rect: WindowRect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  bounds: WorkspaceBounds,
): WindowRect {
  const fitted = fitWindow(rect, bounds);
  let left = fitted.x;
  let top = fitted.y;
  let right = left + fitted.w;
  let bottom = top + fitted.h;
  const minWidth = Math.min(640, Math.max(0, bounds.width));
  const minHeight = Math.min(360, Math.max(0, bounds.height));
  if (edge.includes("w")) left = clamp(left + dx, 0, right - minWidth);
  if (edge.includes("e"))
    right = clamp(right + dx, left + minWidth, bounds.width);
  if (edge.includes("n")) top = clamp(top + dy, 0, bottom - minHeight);
  if (edge.includes("s"))
    bottom = clamp(bottom + dy, top + minHeight, bounds.height);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

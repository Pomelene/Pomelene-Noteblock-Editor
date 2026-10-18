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
  const w = clamp(rect.w, Math.min(320, width), width);
  const h = clamp(rect.h, Math.min(220, height), height);
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
  const minWidth = Math.min(320, Math.max(0, bounds.width));
  const minHeight = Math.min(220, Math.max(0, bounds.height));
  if (edge.includes("w")) left = clamp(left + dx, 0, right - minWidth);
  if (edge.includes("e"))
    right = clamp(right + dx, left + minWidth, bounds.width);
  if (edge.includes("n")) top = clamp(top + dy, 0, bottom - minHeight);
  if (edge.includes("s"))
    bottom = clamp(bottom + dy, top + minHeight, bounds.height);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Geometry in input order; callers choose which visible frames participate. */
export function layoutWindows(
  rects: readonly WindowRect[],
  bounds: WorkspaceBounds,
  mode: "tile" | "cascade",
): WindowRect[] {
  if (!rects.length) return [];
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  if (mode === "cascade") {
    return rects.map((rect, index) => {
      const fitted = fitWindow(rect, { width, height });
      const slots =
        Math.floor(Math.min(width - fitted.w, height - fitted.h) / 30) + 1;
      const offset = (index % slots) * 30;
      return { ...fitted, x: offset, y: offset };
    });
  }
  const preferredColumns = Math.ceil(Math.sqrt(rects.length));
  let columns = preferredColumns;
  const candidates = Array.from(
    { length: rects.length },
    (_, i) => i + 1,
  ).filter(
    (count) =>
      width / count >= 320 && height / Math.ceil(rects.length / count) >= 220,
  );
  if (candidates.length) {
    columns = candidates.reduce((best, count) =>
      Math.abs(count - preferredColumns) < Math.abs(best - preferredColumns)
        ? count
        : best,
    );
  }
  const rows = Math.ceil(rects.length / columns);
  const w = Math.min(width, Math.max(320, width / columns));
  const h = Math.min(height, Math.max(220, height / rows));
  // When minimum sizes cannot fit, spread the bounded frames across the space.
  return rects.map((_, index) => ({
    x: columns > 1 ? ((index % columns) * (width - w)) / (columns - 1) : 0,
    y: rows > 1 ? (Math.floor(index / columns) * (height - h)) / (rows - 1) : 0,
    w,
    h,
  }));
}

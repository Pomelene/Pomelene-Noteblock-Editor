export class BrushStroke {
  private previous?: { col: number; row: number };
  private visited = new Set<string>();
  private aborted = false;
  get exceeded(): boolean {
    return this.aborted;
  }
  constructor(
    private spacing: number,
    private origin: number,
  ) {}
  visit(tick: number, row: number): { tick: number; row: number }[] {
    if (this.aborted) return [];
    if (
      !Number.isFinite(tick) ||
      !Number.isFinite(row) ||
      !Number.isFinite(this.spacing) ||
      this.spacing <= 0
    ) {
      this.aborted = true;
      return [];
    }
    const col = Math.floor((tick - this.origin) / this.spacing + 1e-8),
      from = this.previous ?? { col, row },
      steps = Math.max(Math.abs(col - from.col), Math.abs(row - from.row), 1),
      added: { tick: number; row: number }[] = [];
    if (steps >= 10000) {
      this.aborted = true;
      return [];
    }
    for (let i = 0; i <= steps; i++) {
      const c = Math.round(from.col + ((col - from.col) * i) / steps),
        r = Math.round(from.row + ((row - from.row) * i) / steps),
        key = `${c}:${r}`;
      if (!this.visited.has(key)) {
        if (this.visited.size >= 10000) {
          this.aborted = true;
          return [];
        }
        this.visited.add(key);
        added.push({ tick: this.origin + c * this.spacing, row: r });
      }
    }
    this.previous = { col, row };
    return added;
  }
}
export function clipEdge(
  x: number,
  left: number,
  right: number,
): "left" | "right" | undefined {
  const zone = Math.min(8, (right - left) / 2);
  if (x >= left && x <= left + zone) return "left";
  if (x >= right - zone && x <= right + 3) return "right";
  return undefined;
}
export function segmentIntersectsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return clipSegment(a, b, r) !== undefined;
}
export function clipSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
): { a: { x: number; y: number }; b: { x: number; y: number } } | undefined {
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, r.x, r.x + r.w],
    [a.y, b.y - a.y, r.y, r.y + r.h],
  ]) {
    if (delta === 0) {
      if (start < min || start > max) return undefined;
    } else {
      const t1 = (min - start) / delta,
        t2 = (max - start) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
      if (low > high) return undefined;
    }
  }
  return {
    a: { x: a.x + (b.x - a.x) * low, y: a.y + (b.y - a.y) * low },
    b: { x: a.x + (b.x - a.x) * high, y: a.y + (b.y - a.y) * high },
  };
}

/** Preview-only gesture; every cancellation path discards it before detaching capture. */
export function captureGesture(
  el: HTMLElement,
  pointerId: number,
  move: (event: PointerEvent) => void,
  commit: (event: PointerEvent) => void,
  clear: () => void,
  button?: number,
): () => void {
  let active = true;
  const finish = (event?: PointerEvent) => {
    if (!active) return;
    active = false;
    el.removeEventListener("pointermove", trackedMove);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
    el.removeEventListener("lostpointercapture", cancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", key);
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    if (event) commit(event);
    clear();
  };
  const cancel = () => finish();
  // Chorded mouse buttons report intermediate presses/releases as pointermove.
  // End at the initiating button's release, even if another button remains down.
  const trackedMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    const mask = button === 0 ? 1 : button === 1 ? 4 : button === 2 ? 2 : 0;
    if (mask && !(event.buttons & mask)) finish(event);
    else move(event);
  };
  const up = (event: PointerEvent) => {
    if (
      event.pointerId === pointerId &&
      (button === undefined || event.button === button)
    )
      finish(event);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };
  el.setPointerCapture(pointerId);
  el.addEventListener("pointermove", trackedMove);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("lostpointercapture", cancel);
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", key);
  return cancel;
}

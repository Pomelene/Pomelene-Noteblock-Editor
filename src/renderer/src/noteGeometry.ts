/** One source of truth for the actual short NBS trigger rectangle. */
export function noteDrawRect(
  tick: number,
  row: number,
  zoom: number,
  rowHeight: number,
  unit: number,
  scrollX: number,
  scrollY: number,
) {
  return {
    x: 82 + tick * zoom - scrollX + 1,
    y: 26 + row * rowHeight - scrollY + 2,
    w: Math.max(7, zoom * Math.max(0.55, Math.min(unit, 0.95)) - 2),
    h: rowHeight - 4,
  };
}

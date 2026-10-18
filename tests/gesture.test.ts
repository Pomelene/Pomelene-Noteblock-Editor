import { describe, expect, it } from "vitest";
import {
  BrushStroke,
  segmentIntersectsRect,
  clipEdge,
} from "../src/renderer/src/gestures";

describe("continuous canvas gestures", () => {
  it("cancels an excessive tiny-source sweep rather than allocating an unbounded preview", () => {
    const stroke = new BrushStroke(1 / 1024, 0);
    stroke.visit(0, 0);
    expect(stroke.visit(100, 0).length).toBe(0);
    expect(stroke.exceeded).toBe(true);
    expect(stroke.visit(1, 0).length).toBe(0);
  });
  it("fills a fast brush sweep by source length and never duplicates a revisit", () => {
    const stroke = new BrushStroke(8, 0);
    expect(stroke.visit(0, 1)).toEqual([{ tick: 0, row: 1 }]);
    expect(stroke.visit(25, 1)).toEqual([
      { tick: 8, row: 1 },
      { tick: 16, row: 1 },
      { tick: 24, row: 1 },
    ]);
    expect(stroke.visit(0, 1)).toEqual([]);
  });
  it("fills vertical note strokes without dropping intermediate keys", () => {
    const stroke = new BrushStroke(1, 0);
    stroke.visit(2, 4);
    expect(stroke.visit(2, 1)).toEqual([
      { tick: 2, row: 3 },
      { tick: 2, row: 2 },
      { tick: 2, row: 1 },
    ]);
  });
  it("detects erased objects between pointer events, including narrow clips", () => {
    expect(
      segmentIntersectsRect(
        { x: 0, y: 10 },
        { x: 100, y: 10 },
        { x: 30, y: 0, w: 2, h: 20 },
      ),
    ).toBe(true);
    expect(
      segmentIntersectsRect(
        { x: 0, y: 25 },
        { x: 100, y: 25 },
        { x: 30, y: 0, w: 2, h: 20 },
      ),
    ).toBe(false);
  });
  it("gives each edge half of a narrow clip before considering its menu", () => {
    expect(clipEdge(101, 100, 108)).toBe("left");
    expect(clipEdge(107, 100, 108)).toBe("right");
    expect(clipEdge(120, 100, 180)).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { snapTick, resizeClip, gridPoint } from "../src/renderer/src/editing";
describe("canvas coordinates and non-destructive clip edges", () => {
  it("maps a scrolled viewport into the correct musical cell", () =>
    expect(
      gridPoint(350, 130, { left: 20, top: 10 }, 120, 80, 20, 100, 26, 40),
    ).toEqual({ tick: 17.5, row: 4 }));
  it("supports exact off-bar and triplet positions", () => {
    expect(snapTick(3.9, 1)).toBe(3);
    expect(snapTick(1.7, 1 / 3)).toBeCloseTo(5 / 3);
    expect(snapTick(1.7, 4, true)).toBeCloseTo(1.7083333333);
  });
  it("pads a 7 tick reference to 10 without looping or changing its source", () => {
    const clip = {
      id: "c",
      kind: "pattern" as const,
      sourceId: "p",
      tick: 3,
      length: 7,
      offset: 0,
      track: 0,
      muted: false,
    };
    expect(resizeClip(clip, "right", 13)).toEqual({ ...clip, length: 10 });
    expect(clip.length).toBe(7);
    expect(resizeClip(clip, "right", 8)).toEqual({ ...clip, length: 5 });
  });
  it("left crop advances source offset and never loses its right edge", () => {
    const clip = {
      id: "c",
      kind: "sample" as const,
      sourceId: "s",
      tick: 3,
      length: 7,
      offset: 0,
      track: 0,
      muted: false,
    };
    expect(resizeClip(clip, "left", 5)).toEqual({
      ...clip,
      tick: 5,
      length: 5,
      offset: 2,
    });
  });
});

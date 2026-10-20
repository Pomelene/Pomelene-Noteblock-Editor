import { describe, it, expect } from "vitest";
import { resizeClip } from "../src/renderer/src/editing";
describe("canvas coordinates and non-destructive clip edges", () => {
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

import { describe, expect, it } from "vitest";
import {
  snapUnit,
  snapPosition,
  snapDelta,
  gridTicks,
} from "../src/renderer/src/snap";

describe("musical snap", () => {
  it("uses quarter-note beats and follows the meter for bars", () => {
    expect(snapUnit("beat", 20, 12)).toBe(4);
    expect(snapUnit("half-beat", 20, 12)).toBe(2);
    expect(snapUnit("third-beat", 20, 12)).toBeCloseTo(4 / 3);
    expect(snapUnit("bar", 20, 12)).toBe(12);
    expect(snapPosition(3.9, "third-beat", 20, 12)).toBeCloseTo(8 / 3);
  });
  it("keeps off-grid phase on moves and retains internal precision with Alt or None", () => {
    expect(0.375 + snapDelta(1.8, "beat", 20, 16)).toBe(0.375);
    expect(0.375 + snapDelta(2.1, "beat", 20, 16)).toBe(4.375);
    expect(snapPosition(1.7, "none", 20, 16)).toBeCloseTo(41 / 24);
    expect(snapPosition(1.7, "bar", 20, 16, true)).toBeCloseTo(41 / 24);
  });
  it("draws the same adaptive cells that Auto places into at different zooms", () => {
    expect(snapUnit("auto", 4, 16)).toBe(4);
    expect(snapUnit("auto", 25, 16)).toBe(0.5);
    expect(gridTicks(0, 8, "auto", 4, 16)).toEqual([0, 4, 8]);
    expect(gridTicks(0, 2, "half-beat", 25, 16)).toEqual([0, 2]);
  });
});

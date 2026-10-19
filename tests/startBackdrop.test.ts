import { it, expect } from "vitest";
import { backdropState, lerp } from "../src/renderer/src/startBackdropState";
it("linear interpolation has exact endpoints and midpoint", () => {
  expect(lerp(2, 10, 0)).toBe(2);
  expect(lerp(2, 10, 1)).toBe(10);
  expect(lerp(2, 10, 0.5)).toBe(6);
});
it("background interpolation stays finite and continuous at palette boundaries", () => {
  for (const time of [0, 3, 8.99999, 9, 9.00001, 18, 27, 1000]) {
    const state = backdropState(time);
    expect(
      [state.zoom, state.rotation, state.warp, ...state.a, ...state.b].every(
        Number.isFinite,
      ),
    ).toBe(true);
    expect(state.zoom).toBeGreaterThan(0.4);
    expect(state.zoom).toBeLessThan(2);
    expect([...state.a, ...state.b].every((v) => v >= 0 && v <= 1)).toBe(true);
  }
  const before = backdropState(9 - 1e-5),
    after = backdropState(9 + 1e-5);
  expect(Math.abs(before.warp - after.warp)).toBeLessThan(0.001);
  expect(Math.abs(before.a[0] - after.a[0])).toBeLessThan(0.001);
});
it("changes palette, geometry and warp substantially across the full cycle", () => {
  const a = backdropState(0),
    b = backdropState(9),
    c = backdropState(18);
  expect(Math.abs(a.a[0] - b.a[0])).toBeGreaterThan(0.35);
  expect(Math.abs(a.rotation - b.rotation)).toBeGreaterThan(0.2);
  expect(Math.abs(a.zoom - c.zoom)).toBeGreaterThan(0.15);
  expect(Math.abs(a.warp - b.warp)).toBeGreaterThan(0.3);
});

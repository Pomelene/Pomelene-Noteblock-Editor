import { it, expect } from "vitest";
import {
  chladni,
  createParticles,
  stepParticles,
} from "../src/renderer/src/chladni";
it("has nodal diagonals and antisymmetry", () => {
  expect(chladni(0.23, 0.23).value).toBeCloseTo(0, 12);
  expect(chladni(0.24, -0.17).value).toBeCloseTo(
    -chladni(-0.17, 0.24).value,
    12,
  );
});
it("analytic gradients agree with finite differences", () => {
  const x = 0.21,
    y = -0.37,
    e = 1e-6,
    v = chladni(x, y);
  expect(v.dx).toBeCloseTo(
    (chladni(x + e, y).value - chladni(x - e, y).value) / (2 * e),
    5,
  );
  expect(v.dy).toBeCloseTo(
    (chladni(x, y + e).value - chladni(x, y - e).value) / (2 * e),
    5,
  );
});
it("seeding is reproducible and bounded", () => {
  const a = createParticles(128, 42);
  expect(a).toEqual(createParticles(128, 42));
  expect(a.length).toBe(512);
  for (let i = 0; i < a.length; i += 4) {
    expect(Math.abs(a[i])).toBeLessThanOrEqual(1);
    expect(Math.abs(a[i + 1])).toBeLessThanOrEqual(1);
  }
});
it("settles toward nodes and remains finite across mode changes and long frame gaps", () => {
  const a = createParticles(200, 9);
  const energy = () => {
    let sum = 0;
    for (let i = 0; i < a.length; i += 4)
      sum += Math.abs(chladni(a[i], a[i + 1]).value);
    return sum;
  };
  const before = energy();
  for (let i = 0; i < 150; i++) stepParticles(a, 0, 1 / 30);
  expect(energy()).toBeLessThan(before * 0.8);
  for (let i = 0; i < 400; i++)
    stepParticles(a, i / 10, i === 50 ? 30 : 1 / 30);
  for (let i = 0; i < a.length; i += 4) {
    expect(Number.isFinite(a[i] + a[i + 1] + a[i + 2] + a[i + 3])).toBe(true);
    expect(Math.abs(a[i])).toBeLessThanOrEqual(1.1);
    expect(Math.abs(a[i + 1])).toBeLessThanOrEqual(1.1);
  }
});

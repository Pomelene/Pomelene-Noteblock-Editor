import { describe, expect, it } from "vitest";
import {
  fitWindow,
  layoutWindows,
  moveWindow,
  resizeWindow,
  type ResizeEdge,
} from "../src/renderer/src/windowGeometry";

const bounds = { width: 1200, height: 800 };
const start = { x: 100, y: 70, w: 700, h: 400 };

describe("workspace composition", () => {
  it("tiles two editors without overlap in a standard laptop workspace", () => {
    expect(
      layoutWindows([start, start], { width: 1120, height: 600 }, "tile"),
    ).toEqual([
      { x: 0, y: 0, w: 560, h: 600 },
      { x: 560, y: 0, w: 560, h: 600 },
    ]);
  });
  it("tiles two windows side by side when their minimum size fits", () => {
    expect(
      layoutWindows([start, start], { width: 1600, height: 900 }, "tile"),
    ).toEqual([
      { x: 0, y: 0, w: 800, h: 900 },
      { x: 800, y: 0, w: 800, h: 900 },
    ]);
  });

  it("keeps all minimum-sized tiles reachable in a narrow workspace", () => {
    expect(
      layoutWindows([start, start], { width: 480, height: 240 }, "tile"),
    ).toEqual([
      { x: 0, y: 0, w: 320, h: 240 },
      { x: 160, y: 0, w: 320, h: 240 },
    ]);
  });

  it("cascades windows inside the workspace without mutating saved geometry", () => {
    expect(layoutWindows([start, start], bounds, "cascade")).toEqual([
      { x: 0, y: 0, w: 700, h: 400 },
      { x: 30, y: 30, w: 700, h: 400 },
    ]);
    expect(start).toEqual({ x: 100, y: 70, w: 700, h: 400 });
    expect(layoutWindows([], bounds, "tile")).toEqual([]);
    expect(
      layoutWindows([start], { width: -10, height: 0 }, "cascade"),
    ).toEqual([{ x: 0, y: 0, w: 0, h: 0 }]);
  });
});

describe("floating editor window bounds", () => {
  it("keeps a moved editor entirely reachable without resizing it", () => {
    expect(moveWindow(start, 900, -200, bounds)).toEqual({
      x: 500,
      y: 0,
      w: 700,
      h: 400,
    });
    expect(start).toEqual({ x: 100, y: 70, w: 700, h: 400 });
  });

  it("fits an oversized editor into a workspace smaller than the normal minimum", () => {
    expect(fitWindow(start, { width: 480, height: 240 })).toEqual({
      x: 0,
      y: 0,
      w: 480,
      h: 240,
    });
    expect(fitWindow({ x: 900, y: 700, w: 100, h: 100 }, bounds)).toEqual({
      x: 880,
      y: 580,
      w: 320,
      h: 220,
    });
  });

  it.each<[ResizeEdge, number, number, typeof start]>([
    ["e", 100, 90, { x: 100, y: 70, w: 800, h: 400 }],
    ["w", -100, 90, { x: 0, y: 70, w: 800, h: 400 }],
    ["s", 100, 90, { x: 100, y: 70, w: 700, h: 490 }],
    ["n", 100, -60, { x: 100, y: 10, w: 700, h: 460 }],
    ["ne", 100, -60, { x: 100, y: 10, w: 800, h: 460 }],
    ["nw", -100, -60, { x: 0, y: 10, w: 800, h: 460 }],
    ["se", 100, 90, { x: 100, y: 70, w: 800, h: 490 }],
    ["sw", -100, 90, { x: 0, y: 70, w: 800, h: 490 }],
  ])(
    "resizes the %s handle and preserves its opposite edges",
    (edge, dx, dy, expected) => {
      expect(resizeWindow(start, edge, dx, dy, bounds)).toEqual(expected);
    },
  );

  it("stops the north-west edge at minimum size without moving the opposite corner", () => {
    expect(resizeWindow(start, "nw", 1000, 1000, bounds)).toEqual({
      x: 480,
      y: 250,
      w: 320,
      h: 220,
    });
  });

  it("stops outward resizing at every workspace edge", () => {
    expect(resizeWindow(start, "nw", -1000, -1000, bounds)).toEqual({
      x: 0,
      y: 0,
      w: 800,
      h: 470,
    });
    expect(resizeWindow(start, "se", 1000, 1000, bounds)).toEqual({
      x: 100,
      y: 70,
      w: 1100,
      h: 730,
    });
  });

  it("does not force a minimum larger than the available workspace", () => {
    expect(
      resizeWindow(start, "nw", -1000, -1000, { width: 480, height: 240 }),
    ).toEqual({ x: 0, y: 0, w: 480, h: 240 });
    expect(fitWindow(start, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
  });
});

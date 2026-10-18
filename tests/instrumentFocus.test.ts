import { describe, expect, it } from "vitest";
import {
  instrumentChoices,
  navigateInstrument,
  noteOpacity,
} from "../src/renderer/src/instrumentFocus";

describe("instrument focus", () => {
  const instruments = [
    { id: 7, name: "Harp" },
    { id: 2, name: "Bass" },
    { id: 11, name: "Bell" },
  ];
  const notes = [{ instrument: 7 }, { instrument: 11 }, { instrument: 7 }];
  it("counts notes in project instrument order, including unused choices", () => {
    expect(instrumentChoices(instruments, notes)).toEqual([
      { id: 7, name: "Harp", count: 2 },
      { id: 2, name: "Bass", count: 0 },
      { id: 11, name: "Bell", count: 1 },
    ]);
  });
  it("wraps navigation across non-contiguous IDs and skips unused instruments when requested", () => {
    const choices = instrumentChoices(instruments, notes);
    expect(navigateInstrument(choices, 7, -1)).toBe(11);
    expect(navigateInstrument(choices, 7, 1)).toBe(2);
    expect(navigateInstrument(choices, 7, 1, true)).toBe(11);
    expect(navigateInstrument(choices, 2, -1, true)).toBe(7);
    expect(navigateInstrument([], 7, 1, true)).toBe(7);
  });
  it("dims other instruments equally in notes and velocity while preserving selected notes", () => {
    expect(noteOpacity(7, 7, false, false, false)).toBe(1);
    expect(noteOpacity(11, 7, false, false, false)).toBe(0.22);
    expect(noteOpacity(11, 7, false, true, true)).toBe(1);
    expect(noteOpacity(11, 7, true, false, false)).toBe(1);
    expect(noteOpacity(7, 7, false, false, true)).toBe(0.35);
    expect(noteOpacity(11, 7, false, false, true)).toBe(0.22);
  });
});

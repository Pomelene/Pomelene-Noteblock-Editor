import { decodeProject, encodeProject, fromNbs, toNbs } from "../src/shared/io";
import { describe, expect, it } from "vitest";
import {
  chordEvents,
  chordName,
  chordPitches,
  diatonicChords,
  type ChordPlacement,
  type ChordSpec,
} from "../src/shared/chords";
import {
  Session,
  createEmptyProject,
  newLayer,
  validateProject,
} from "../src/shared/session";

const spec: ChordSpec = { root: 60, quality: "major" };
const placement: ChordPlacement = {
  spec,
  tick: 0,
  instrument: 0,
  velocity: 80,
  layer: 0,
  mode: "block",
  stepTicks: 1,
  replace: false,
};
function fixture() {
  const project = createEmptyProject();
  project.patterns.push({
    id: "p",
    name: "Chords",
    color: "#fff",
    length: 32,
    layers: [newLayer()],
    notes: [],
  });
  return project;
}

describe("production chord core", () => {
  it.each([
    ["major", [60, 64, 67]],
    ["minor", [60, 63, 67]],
    ["dom7", [60, 64, 67, 70]],
    ["maj7", [60, 64, 67, 71]],
    ["min7", [60, 63, 67, 70]],
    ["sus2", [60, 62, 67]],
    ["sus4", [60, 65, 67]],
    ["dim", [60, 63, 66]],
    ["aug", [60, 64, 68]],
  ] as const)("voices %s with approved intervals", (quality, pitches) => {
    expect(chordPitches({ root: 60, quality })).toEqual(pitches);
  });
  it("combines inversion, spread, added tone and alternate bass", () => {
    const chord: ChordSpec = {
      ...spec,
      inversion: 1,
      spread: true,
      extension: "9",
      bass: 7,
    };
    expect(chordPitches(chord)).toEqual([55, 64, 72, 74, 79]);
    expect(chordName(chord)).toBe("C(add9)/G");
    expect(chordName({ ...spec, quality: "min7", inversion: 1 })).toBe(
      "Cm7/E♭",
    );
    expect(chordPitches({ ...spec, bass: "root" })).toEqual([48, 60, 64, 67]);
  });
  it("builds major and natural minor degree palettes across octaves", () => {
    expect(diatonicChords(2, "minor", 3)).toEqual([
      { root: 50, quality: "minor", degree: "i" },
      { root: 52, quality: "dim", degree: "ii°" },
      { root: 53, quality: "major", degree: "III" },
      { root: 55, quality: "minor", degree: "iv" },
      { root: 57, quality: "minor", degree: "v" },
      { root: 58, quality: "major", degree: "VI" },
      { root: 60, quality: "major", degree: "VII" },
    ]);
    expect(diatonicChords(0, "major", 4)[6]).toEqual({
      root: 71,
      quality: "dim",
      degree: "vii°",
    });
  });
  it("generates fractional ascending and descending events beyond the demo range", () => {
    expect(
      chordEvents(spec, { tick: 64.5, mode: "up", stepTicks: 0.25 }),
    ).toEqual([
      { tick: 64.5, pitch: 60 },
      { tick: 64.75, pitch: 64 },
      { tick: 65, pitch: 67 },
    ]);
    expect(
      chordEvents(spec, { tick: 1048574, mode: "down", stepTicks: 0.5 }),
    ).toEqual([
      { tick: 1048574, pitch: 67 },
      { tick: 1048574.5, pitch: 64 },
      { tick: 1048575, pitch: 60 },
    ]);
    expect(() =>
      chordEvents(spec, { tick: 1048575, mode: "up", stepTicks: 1 }),
    ).toThrow();
  });
  it.each([
    { root: 20 },
    { root: 104 },
    { inversion: 4 },
    { inversion: 0.5 },
    { bass: 12 },
    { extension: "7" },
    { quality: "toString" },
    { spread: "yes" },
  ])("rejects invalid or out of range voicings %j", (patch) => {
    expect(() => chordPitches({ ...spec, ...patch } as ChordSpec)).toThrow();
  });
  it.each([0, -1, Infinity, NaN, 1048576])(
    "rejects invalid event step %s",
    (stepTicks) => {
      expect(() =>
        chordEvents(spec, { tick: 0, mode: "block", stepTicks }),
      ).toThrow();
    },
  );
});

describe("atomic chord command", () => {
  it("skips occupied and locked layers and undoes/redoes the entire chord", () => {
    const project = fixture();
    project.patterns[0].layers.push({ ...newLayer(1), locked: true });
    project.patterns[0].notes.push({
      id: "existing",
      tick: 0,
      layer: 0,
      pitch: 72,
      instrument: 1,
      velocity: 60,
    });
    const session = new Session(project);
    const result = session.dispatch({
      type: "notes:chord",
      patternId: "p",
      placement,
    });
    expect(
      result.project.patterns[0].notes
        .slice(1)
        .map((n) => [
          n.tick,
          n.layer,
          n.pitch,
          n.instrument,
          n.velocity,
          n.panning,
          n.finePitch,
        ]),
    ).toEqual([
      [0, 2, 60, 0, 80, 100, 0],
      [0, 3, 64, 0, 80, 100, 0],
      [0, 4, 67, 0, 80, 100, 0],
    ]);
    expect(session.dispatch({ type: "undo" }).project).toEqual(project);
    expect(session.dispatch({ type: "redo" }).project).toEqual(result.project);
    expect(validateProject(result.project)).toEqual(result.project);
  });
  it("replaces only the current instrument on generated ticks and reuses emptied cells", () => {
    const project = fixture(),
      pat = project.patterns[0];
    pat.layers.push({ ...newLayer(1), locked: true });
    const note = { pitch: 50, instrument: 0, velocity: 70 };
    pat.notes = [
      { ...note, id: "replace", tick: 1 + 5e-8, layer: 0 },
      { ...note, id: "locked", tick: 1, layer: 1 },
      { ...note, id: "other", tick: 1.5, layer: 0, instrument: 1 },
      { ...note, id: "offtime", tick: 1.500001, layer: 2 },
      { ...note, id: "between", tick: 1.25, layer: 0 },
    ];
    pat.layers.push(newLayer(2));
    const session = new Session(project);
    const result = session.dispatch({
      type: "notes:chord",
      patternId: "p",
      placement: {
        ...placement,
        tick: 1,
        mode: "up",
        stepTicks: 0.5,
        replace: true,
      },
    }).project.patterns[0];
    expect(
      result.notes.filter((n) =>
        ["locked", "other", "offtime", "between"].includes(n.id),
      ),
    ).toHaveLength(4);
    expect(result.notes.some((n) => n.id === "replace")).toBe(false);
    expect(result.notes.slice(-3).map((n) => [n.tick, n.layer])).toEqual([
      [1, 0],
      [1.5, 2],
      [2, 0],
    ]);
  });
  it("extends pattern length at the production endpoint", () => {
    const session = new Session(fixture());
    const result = session.dispatch({
      type: "notes:chord",
      patternId: "p",
      placement: { ...placement, tick: 1048575 },
    });
    expect(result.project.patterns[0].length).toBe(1048576);
    expect(result.project.patterns[0].notes).toHaveLength(3);
  });
  it.each([
    { layer: 4095 },
    { layer: 4096 },
    { velocity: 0 },
    { velocity: 101 },
    { velocity: 50.5 },
    { instrument: 200 },
    { stepTicks: 0 },
    { replace: undefined },
    { tick: NaN },
    { spec: { root: 108, quality: "major" } },
  ])("rejects invalid placement atomically %j", (patch) => {
    const session = new Session(fixture());
    const before = session.snapshot();
    expect(() =>
      session.dispatch({
        type: "notes:chord",
        patternId: "p",
        placement: { ...placement, ...patch } as ChordPlacement,
      }),
    ).toThrow();
    expect(session.snapshot()).toEqual(before);
  });
});

describe("generated chord file compatibility", () => {
  it("retains generated notes through v2 and NBS export/reimport", () => {
    const p = fixture();
    p.clips.push({
      id: "clip",
      kind: "pattern",
      sourceId: "p",
      tick: 0,
      track: 0,
      length: 32,
      offset: 0,
      muted: false,
    });
    const result = new Session(p).dispatch({
      type: "notes:chord",
      patternId: "p",
      placement: { ...placement, tick: 4, mode: "up", stepTicks: 1 },
    }).project;
    expect(decodeProject(encodeProject(result))).toEqual(result);
    const exported = toNbs(result);
    const imported = fromNbs(exported.data);
    expect(
      imported.patterns
        .flatMap((p) => p.notes)
        .map((n) => [n.tick, n.pitch, n.instrument, n.velocity]),
    ).toEqual([
      [4, 60, 0, 80],
      [5, 64, 0, 80],
      [6, 67, 0, 80],
    ]);
  });
});

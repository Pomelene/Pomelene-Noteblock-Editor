import { expect, it } from "vitest";
import { createEmptyProject, newLayer, Session } from "../src/shared/session";
import { decodeProject, encodeProject, fromNbs, toNbs } from "../src/shared/io";
import { noteEvent } from "../src/shared/timeline";
function fixture() {
  const p = createEmptyProject();
  p.samples.push({
    id: "missing",
    name: "Low bass",
    color: "#fff",
    originalPath: "bass.wav",
    rootKey: 66,
    volume: 100,
    panning: 100,
  });
  p.instruments.push({
    id: 16,
    name: "Low bass",
    sampleId: "missing",
    key: 57,
    pressKey: false,
  });
  p.patterns.push({
    id: "pat",
    name: "Pattern",
    color: "#fff",
    length: 16,
    layers: [newLayer()],
    notes: [
      {
        id: "n",
        tick: 0,
        layer: 0,
        pitch: 66,
        instrument: 16,
        velocity: 100,
        finePitch: 25,
      },
    ],
  });
  p.clips.push({
    id: "c",
    kind: "pattern",
    sourceId: "pat",
    tick: 0,
    length: 16,
    offset: 0,
    track: 0,
    muted: false,
  });
  return p;
}
it("binds missing custom audio without changing source notes, persists and supports undo/reset", () => {
  const p = fixture(),
    s = new Session(p);
  const mapped = s.dispatch({
    type: "instrument:map",
    id: 16,
    targetId: 1,
  }).project;
  expect(mapped.instruments.find((i) => i.id === 16)?.mappingTargetId).toBe(1);
  expect(mapped.patterns).toEqual(p.patterns);
  expect(mapped.samples).toEqual(p.samples);
  expect(decodeProject(encodeProject(mapped))).toEqual(mapped);
  expect(s.dispatch({ type: "undo" }).project).toEqual(p);
  s.dispatch({ type: "redo" });
  expect(
    s
      .dispatch({ type: "instrument:map", id: 16 })
      .project.instruments.find((i) => i.id === 16)?.mappingTargetId,
  ).toBeUndefined();
});
it("uses the target audio while retaining source custom tuning in playback and export", () => {
  const s = new Session(fixture());
  const p = s.dispatch({ type: "instrument:map", id: 16, targetId: 1 }).project;
  const e = noteEvent(p, p.patterns[0].notes[0]);
  expect(e.sampleId).toBe("vanilla-1");
  expect(e.playbackRate).toBeCloseTo(2 ** (12.25 / 12));
  const exported = fromNbs(toNbs(p).data),
    n = exported.patterns.flatMap((p) => p.notes)[0];
  expect(n.instrument).toBe(1);
  expect(n.pitch).toBe(78);
  expect(n.finePitch).toBe(25);
  expect(exported.nbs?.customInstruments[0].key).toBe(57);
});
it("rejects missing/unplayable targets and cycles atomically", () => {
  const s = new Session(fixture()),
    before = s.snapshot();
  for (const targetId of [16, 255])
    expect(() =>
      s.dispatch({ type: "instrument:map", id: 16, targetId }),
    ).toThrow();
  expect(() =>
    s.dispatch({ type: "instrument:map", id: 0, targetId: 16 }),
  ).toThrow();
  expect(s.snapshot()).toEqual(before);
  s.dispatch({ type: "instrument:map", id: 16, targetId: 0 });
  expect(() =>
    s.dispatch({ type: "instrument:map", id: 0, targetId: 16 }),
  ).toThrow();
});
it("preserves extreme custom tuning with NBS fine pitch instead of losing mapped notes", () => {
  const p = fixture();
  p.instruments[16].key = 255;
  const mapped = new Session(p).dispatch({
    type: "instrument:map",
    id: 16,
    targetId: 0,
  }).project;
  const n = fromNbs(toNbs(mapped).data).patterns[0].notes[0];
  expect(n).toBeDefined();
  expect(n.pitch + (n.finePitch ?? 0) / 100).toBe(276.25);
});

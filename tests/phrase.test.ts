import { expect, it } from "vitest";
import {
  createDemoProject,
  Session,
  validateProject,
} from "../src/shared/session";
import { buildEvents } from "../src/shared/timeline";
import { decodeProject, encodeProject, fromNbs, toNbs } from "../src/shared/io";
import type { Command } from "../src/shared/model";

it("rejects project-level patches that bypass readonly phrase commands", () => {
  const s = new Session(createDemoProject());
  const p = s.dispatch({
    type: "phrase:fromPattern",
    patternId: s.snapshot().project.patterns[0].id,
  }).project;
  const before = s.snapshot();
  expect(() =>
    s.dispatch({
      type: "project:update",
      patch: { phrases: [{ ...p.phrases![0], notes: [] }] },
    } as unknown as Command),
  ).toThrow();
  expect(s.snapshot()).toEqual(before);
});

it("captures an immutable phrase, converts independent editable sources and round trips old audio resources", () => {
  const project = createDemoProject();
  const s = new Session(project);
  const command = (c: unknown) => s.dispatch(c as Command);
  let p = command({
    type: "phrase:fromPattern",
    patternId: project.patterns[0].id,
    name: "Saved",
  }).project;
  const phrase = p.phrases![0];
  expect(phrase.name).toBe("Saved");
  expect(phrase.notes[0].id).not.toBe(project.patterns[0].notes[0].id);
  expect(phrase.layers[0].id).not.toBe(project.patterns[0].layers[0].id);
  expect(() =>
    command({ type: "notes:add", patternId: phrase.id, notes: [] }),
  ).toThrow();
  for (const c of [
    {
      type: "notes:update",
      patternId: phrase.id,
      ids: [phrase.notes[0].id],
      patch: { velocity: 0 },
    },
    {
      type: "notes:move",
      patternId: phrase.id,
      ids: [phrase.notes[0].id],
      ticks: 1,
    },
    { type: "notes:remove", patternId: phrase.id, ids: [phrase.notes[0].id] },
    { type: "layer:add", patternId: phrase.id },
    {
      type: "layer:update",
      patternId: phrase.id,
      index: 0,
      patch: { volume: 0 },
    },
    { type: "layer:remove", patternId: phrase.id, index: 0 },
    { type: "pattern:update", id: phrase.id, patch: { length: 1 } },
    { type: "pattern:remove", id: phrase.id },
    { type: "pattern:add", duplicateId: phrase.id },
  ])
    expect(() => command(c)).toThrow();
  const before = s.snapshot();
  expect(() =>
    command({
      type: "phrase:update",
      id: phrase.id,
      patch: { notes: [], length: 1 },
    }),
  ).toThrow();
  expect(s.snapshot()).toEqual(before);
  p = command({ type: "pattern:fromPhrase", phraseId: phrase.id }).project;
  const copy = p.patterns.at(-1)!;
  expect(copy.notes[0].id).not.toBe(phrase.notes[0].id);
  expect(copy.layers[0].id).not.toBe(phrase.layers[0].id);
  expect(copy.id).not.toBe(phrase.id);
  p = command({
    type: "clip:add",
    clip: {
      ...project.clips[0],
      id: undefined,
      kind: "phrase",
      sourceId: phrase.id,
    },
  }).project;
  const reference = p.clips.at(-1)!;
  p = command({ type: "source:unique", clipId: reference.id }).project;
  expect(p.clips.at(-1)!.kind).toBe("pattern");
  expect(p.phrases![0]).toEqual(phrase);
  expect(decodeProject(encodeProject(p))).toEqual(p);
  const old = structuredClone(project);
  delete old.phrases;
  expect(validateProject(old).samples).toEqual(project.samples);
});

it("renames and deletes phrases atomically while retaining independent patterns and other references", () => {
  const s = new Session(createDemoProject());
  const pattern = s.snapshot().project.patterns[0];
  const phrase = s.dispatch({
    type: "phrase:fromPattern",
    patternId: pattern.id,
  }).project.phrases![0];
  const renamed = s.dispatch({
    type: "phrase:update",
    id: phrase.id,
    patch: { name: "Renamed", color: "#123456" },
  }).project.phrases![0];
  expect(renamed).toEqual({ ...phrase, name: "Renamed", color: "#123456" });
  s.dispatch({
    type: "clip:add",
    clip: {
      kind: "phrase",
      sourceId: phrase.id,
      tick: 0,
      offset: 0,
      length: 16,
      track: 0,
      muted: false,
    },
  });
  const before = s.snapshot();
  const removed = s.dispatch({ type: "phrase:remove", id: phrase.id });
  expect(removed.project.phrases).toEqual([]);
  expect(removed.project.clips).toEqual(
    before.project.clips.filter((c) => c.kind !== "phrase"),
  );
  expect(removed.project.patterns).toEqual(before.project.patterns);
  expect(s.dispatch({ type: "undo" }).project).toEqual(before.project);
});

it("validates phrase references, layer presence and shared source IDs", () => {
  const s = new Session(createDemoProject());
  const p = s.dispatch({
    type: "phrase:fromPattern",
    patternId: s.snapshot().project.patterns[0].id,
  }).project;
  const invalidId = structuredClone(p);
  invalidId.phrases![0].id = invalidId.patterns[0].id;
  expect(() => validateProject(invalidId)).toThrow();
  const invalidLayers = structuredClone(p);
  invalidLayers.phrases![0].layers = [];
  expect(() => validateProject(invalidLayers)).toThrow();
  const invalidReference = structuredClone(p);
  invalidReference.clips[0].kind = "phrase";
  expect(() => validateProject(invalidReference)).toThrow();
});

it("plays and exports phrases with clip windows and padding, including expression and custom instruments", () => {
  const project = createDemoProject(),
    s = new Session(project);
  const p = s.dispatch({
    type: "phrase:fromPattern",
    patternId: project.patterns[0].id,
  } as Command).project;
  const phrase = p.phrases![0];
  p.clips = [
    {
      ...p.clips[0],
      kind: "phrase",
      sourceId: phrase.id,
      tick: 3,
      offset: 2,
      length: 40,
    },
  ];
  const comparison = structuredClone(p);
  comparison.clips[0].kind = "pattern";
  comparison.clips[0].sourceId = project.patterns[0].id;
  expect(buildEvents(p).events.map(({ id, ...event }) => event)).toEqual(
    buildEvents(comparison).events.map(({ id, ...event }) => event),
  );
  expect(buildEvents(p, phrase.id).events.length).toBe(phrase.notes.length);
  const exported = fromNbs(toNbs(p).data);
  expect(exported.patterns.flatMap((x) => x.notes).length).toBe(
    buildEvents(p).events.length,
  );
  expect(toNbs(p).warnings.some((w) => w.includes("已从 NBS 导出中省略"))).toBe(
    false,
  );
});

it("captures selected clip windows and silence gaps atomically and rejects audio selections", () => {
  const project = createDemoProject();
  project.clips = [
    { ...project.clips[0], id: "a", tick: 10, offset: 4, length: 8 },
    {
      ...project.clips[0],
      id: "b",
      tick: 30,
      offset: 0,
      length: 40,
      muted: true,
    },
  ];
  const s = new Session(project);
  const p = s.dispatch({
    type: "phrase:fromClips",
    ids: ["a", "b"],
  } as Command).project;
  const phrase = p.phrases![0];
  expect(phrase.length).toBe(60);
  expect(phrase.notes.some((n) => n.tick >= 8 && n.tick < 20)).toBe(false);
  expect(phrase.notes.some((n) => n.tick >= 52)).toBe(false);
  expect(phrase.layers.some((l) => l.muted)).toBe(true);
  expect(buildEvents(p, phrase.id).events.map((e) => e.tick)).toEqual(
    buildEvents(project).events.map((e) => e.tick - 10),
  );
  s.dispatch({
    type: "clip:add",
    clip: {
      kind: "sample",
      sourceId: project.samples[0].id,
      tick: 0,
      offset: 0,
      length: 16,
      track: 0,
      muted: false,
    },
  });
  const before = s.snapshot();
  expect(() =>
    s.dispatch({
      type: "phrase:fromClips",
      ids: ["a", before.project.clips.at(-1)!.id],
    } as Command),
  ).toThrow(/音频/);
  expect(s.snapshot()).toEqual(before);
});

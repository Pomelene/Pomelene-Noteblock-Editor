import { describe, expect, it } from "vitest";
import {
  createDemoProject,
  createEmptyProject,
  Session,
  validateProject,
} from "../src/shared/session";

describe("authoritative project transactions", () => {
  it("crops and pads a clip independently of its source, and restores edits with undo", () => {
    const session = new Session(createDemoProject()),
      before = session.snapshot();
    const clip = before.project.clips[0],
      source = before.project.patterns[0];
    session.dispatch({
      type: "clips:update",
      ids: [clip.id],
      patch: { length: 2 },
    });
    expect(session.snapshot().project.patterns[0]).toEqual(source);
    session.dispatch({
      type: "clips:update",
      ids: [clip.id],
      patch: { length: 64 },
    });
    expect(session.snapshot().project.clips[0].length).toBe(64);
    expect(session.snapshot().project.patterns[0].notes).toEqual(source.notes);
    session.dispatch({ type: "undo" });
    expect(session.snapshot().project.clips[0].length).toBe(2);
    session.dispatch({ type: "undo" });
    expect(session.snapshot().document.dirty).toBe(false);
  });
  it("makes a source unique without changing other references or sharing note identities", () => {
    const s = new Session(createDemoProject()),
      clip = s.snapshot().project.clips[0];
    s.dispatch({ type: "clips:paste", clips: [clip] });
    s.dispatch({ type: "source:unique", clipId: clip.id });
    const p = s.snapshot().project;
    expect(p.clips[0].sourceId).not.toBe(p.clips[1].sourceId);
    expect(
      p.patterns.find((x) => x.id === p.clips[0].sourceId)?.notes[0].id,
    ).not.toBe(p.patterns[0].notes[0].id);
  });
  it("rejects invalid transactions atomically without consuming history", () => {
    const s = new Session(createDemoProject()),
      before = s.snapshot();
    expect(() =>
      s.dispatch({
        type: "clips:paste",
        clips: [{ ...before.project.clips[0], sourceId: "missing" }],
      }),
    ).toThrow();
    expect(s.snapshot()).toEqual(before);
    const escaped = s.snapshot();
    escaped.project.title = "external mutation";
    expect(s.snapshot().project.title).toBe(before.project.title);
  });
  it("removes a layer with its notes and reindexes later layers", () => {
    const s = new Session(createDemoProject()),
      id = s.snapshot().project.patterns[0].id;
    s.dispatch({ type: "layer:add", patternId: id });
    s.dispatch({
      type: "notes:add",
      patternId: id,
      notes: [{ tick: 0, layer: 1, pitch: 64, instrument: 0, velocity: 80 }],
    });
    s.dispatch({ type: "layer:remove", patternId: id, index: 0 });
    expect(s.snapshot().project.patterns[0].notes).toMatchObject([
      { tick: 0, layer: 0, pitch: 64 },
    ]);
  });
  it("blocks removal of samples used by master instruments and deletes sample clips safely", () => {
    const s = new Session(createDemoProject()),
      builtin = s.snapshot().project.samples[0];
    expect(() => s.dispatch({ type: "sample:remove", id: builtin.id })).toThrow(
      /instrument|乐器/,
    );
    s.dispatch({ type: "sample:clone", id: builtin.id });
    const copy = s.snapshot().project.samples.at(-1)!;
    s.dispatch({
      type: "clip:add",
      clip: {
        kind: "sample",
        sourceId: copy.id,
        tick: 0,
        length: 8,
        offset: 0,
        track: 0,
        muted: false,
      },
    });
    s.dispatch({ type: "sample:remove", id: copy.id });
    expect(s.snapshot().project.clips.some((c) => c.sourceId === copy.id)).toBe(
      false,
    );
  });
  it("changes generation on replacement, clears history, and validates references", () => {
    const s = new Session(createDemoProject()),
      generation = s.snapshot().generation;
    s.dispatch({ type: "project:update", patch: { title: "changed" } });
    s.replace(createEmptyProject());
    expect(s.snapshot()).toMatchObject({
      generation: generation + 1,
      canUndo: false,
      document: { dirty: false },
    });
    const p = createDemoProject();
    p.instruments[0].sampleId = "unknown";
    expect(() => validateProject(p)).toThrow();
  });
});

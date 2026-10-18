import { expect, it } from "vitest";
import {
  createDemoProject,
  Session,
  validateProject,
} from "../src/shared/session";
import { buildEvents } from "../src/shared/timeline";
import { toNbs, fromNbs, encodeProject, decodeProject } from "../src/shared/io";
import type { NbsImportSummary, Project } from "../src/shared/model";
function organized(): Project {
  const p = createDemoProject();
  p.patterns = [
    {
      ...p.patterns[0],
      length: 16,
      notes: [{ ...p.patterns[0].notes[0], tick: 15 }],
    },
  ];
  p.clips = [{ ...p.clips[0], tick: 0, length: 16, tailTicks: 64 }];
  const summary: NbsImportSummary = {
    fileName: "test.nbs",
    title: p.title,
    noteCount: 1,
    layerCount: 1,
    durationTicks: 64,
    bpm: p.bpm,
    meter: p.meter,
    algorithmVersion: "nbs-structure-1",
    applicable: true,
    original: { patterns: 1, clips: 1, tracks: 8 },
    proposed: { patterns: 1, clips: 1, tracks: 8, reusedClips: 0 },
    groups: [],
    warnings: [],
  };
  p.importOrganization = {
    version: "nbs-structure-1",
    summary,
    originalData: JSON.stringify({
      patterns: [{ ...p.patterns[0], length: 64 }],
      clips: [{ ...p.clips[0], length: 64, tailTicks: undefined }],
      tracks: p.tracks,
    }),
  };
  return p;
}
it("keeps original playback windows across imported phrase boundaries", () => {
  const p = organized();
  expect(buildEvents(p).events[0].durationTicks).toBe(49);
  expect(buildEvents(p, p.patterns[0].id).events[0].durationTicks).toBe(1);
});
it("explicit clip length and offset edits remove imported tail extension, and undo restores it", () => {
  const p = organized(),
    s = new Session(p);
  s.dispatch({
    type: "clips:update",
    ids: [p.clips[0].id],
    patch: { length: 8 },
  });
  expect(s.snapshot().project.clips[0].tailTicks).toBeUndefined();
  s.dispatch({ type: "undo" });
  expect(s.snapshot().project.clips[0].tailTicks).toBe(64);
  s.dispatch({
    type: "clips:update",
    ids: [p.clips[0].id],
    patch: { offset: 1 },
  });
  expect(s.snapshot().project.clips[0].tailTicks).toBeUndefined();
});
it("explicit source length edits also reset imported tails for every reference", () => {
  const p = organized();
  p.patterns[0].notes[0].tick = 1;
  p.clips[0].length = 64;
  p.clips.push({ ...p.clips[0], id: "second", tick: 64 });
  const s = new Session(p);
  s.dispatch({
    type: "pattern:update",
    id: p.patterns[0].id,
    patch: { length: 16 },
  });
  expect(s.snapshot().project.clips.every((c) => c.tailTicks === 64)).toBe(
    true,
  );
  s.dispatch({
    type: "pattern:update",
    id: p.patterns[0].id,
    patch: { length: 2 },
  });
  const changed = s.snapshot().project;
  expect(changed.clips.every((c) => c.tailTicks === undefined)).toBe(true);
  expect(buildEvents(changed).events.map((e) => e.durationTicks)).toEqual([
    1, 1,
  ]);
  s.dispatch({ type: "undo" });
  expect(s.snapshot().project.clips.every((c) => c.tailTicks === 64)).toBe(
    true,
  );
});
it("restores original layout atomically and makes restoration undoable after saving/reopening", () => {
  const p = decodeProject(encodeProject(organized())),
    s = new Session(p);
  s.dispatch({ type: "import:restoreOriginal" });
  expect(s.snapshot().project.patterns[0].length).toBe(64);
  expect(s.snapshot().project.importOrganization).toBeUndefined();
  s.dispatch({ type: "undo" });
  expect(s.snapshot().project.patterns[0].length).toBe(16);
  expect(s.snapshot().project.importOrganization?.version).toBe(
    "nbs-structure-1",
  );
});
it("rejects malformed optional import metadata and negative tail lengths", () => {
  const p = organized();
  p.clips[0].tailTicks = -1;
  expect(() => validateProject(p)).toThrow();
  const q = organized();
  q.importOrganization!.summary.groups = [
    {
      name: "bad",
      sourceLayers: [-1],
      noteCount: 1,
      patternCount: 1,
      clipCount: 1,
    },
  ];
  expect(() => validateProject(q)).toThrow();
});
it("reuses original layer definitions when exporting repeated imported phrases", () => {
  const p = organized();
  p.patterns[0].layers[0].sourceIndex = 0;
  p.clips = Array.from({ length: 20 }, (_, i) => ({
    ...p.clips[0],
    id: "ref-" + i,
    tick: i * 16,
  }));
  const output = fromNbs(toNbs(p).data);
  expect(output.patterns[0].layers.length).toBe(1);
  expect(output.patterns[0].notes.length).toBe(20);
});

import { expect, it } from "vitest";
import { createDemoProject } from "../src/shared/session";
import { decodeProject, encodeProject, toNbs, fromNbs } from "../src/shared/io";

it("round trips schema2 including embedded samples and independent clip windows", () => {
  const p = createDemoProject();
  p.clips[0].length = 5;
  p.clips[0].offset = 2;
  p.samples.push({
    id: "voice",
    name: "Voice",
    color: "#abcdef",
    dataUrl: "data:audio/wav;base64,UklGRg==",
    rootKey: 60,
    volume: 100,
    panning: 100,
  });
  expect(decodeProject(encodeProject(p))).toEqual(p);
});
it("migrates the old project envelope retaining layer metadata and clip length", () => {
  const old = {
    format: "note-block-project",
    version: 1,
    project: {
      title: "Old",
      bpm: 120,
      meter: "4/4",
      patterns: [
        {
          id: "p",
          name: "One",
          length: 16,
          notes: [
            {
              id: "n",
              tick: 2,
              layer: 2,
              pitch: 60,
              instrument: 0,
              velocity: 73,
            },
          ],
        },
      ],
      clips: [{ id: "c", patternId: "p", tick: 4, track: 2 }],
    },
  };
  const p = decodeProject(new TextEncoder().encode(JSON.stringify(old)));
  expect(p).toMatchObject({
    schema: 2,
    title: "Old",
    clips: [{ sourceId: "p", length: 16, offset: 0, track: 2 }],
  });
  expect(p.patterns[0].layers).toHaveLength(3);
});
it("exports visible clip windows with per-pattern layer settings and warns about sample clips", () => {
  const p = createDemoProject();
  p.patterns[0].notes = [
    { id: "a", tick: 1, layer: 0, pitch: 60, instrument: 0, velocity: 70 },
    { id: "b", tick: 5, layer: 0, pitch: 62, instrument: 0, velocity: 90 },
  ];
  p.patterns[0].layers[0].volume = 63;
  p.clips = [{ ...p.clips[0], tick: 4, offset: 3, length: 4 }];
  const n = fromNbs(toNbs(p).data);
  expect(n.patterns[0].notes).toMatchObject([
    { tick: 6, pitch: 62, velocity: 90 },
  ]);
  expect(n.patterns[0].layers[0].volume).toBe(63);
  p.clips.push({
    id: "s",
    kind: "sample",
    sourceId: p.samples[0].id,
    tick: 0,
    length: 8,
    offset: 0,
    track: 0,
    muted: false,
  });
  expect(toNbs(p).warnings.join(" ")).toMatch(/sample|采样/i);
});

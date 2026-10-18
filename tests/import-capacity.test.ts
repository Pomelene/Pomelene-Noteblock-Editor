import { expect, it } from "vitest";
import { createDemoProject, validateProject } from "../src/shared/session";
import { decodeProject, encodeProject } from "../src/shared/io";

it("persists smart import summaries above the old 100k-note and 64-voice caps", () => {
  const p = createDemoProject();
  p.importOrganization = {
    version: "nbs-structure-1",
    originalData: JSON.stringify({
      patterns: p.patterns,
      clips: p.clips,
      tracks: p.tracks,
    }),
    summary: {
      fileName: "large.nbs",
      title: "Large",
      noteCount: 500_000,
      layerCount: 4096,
      durationTicks: 65535,
      bpm: 120,
      meter: "4/4",
      algorithmVersion: "nbs-structure-1",
      applicable: true,
      original: { patterns: 1, clips: 1, tracks: 1 },
      proposed: { patterns: 256, clips: 256, tracks: 256, reusedClips: 0 },
      groups: Array.from({ length: 256 }, (_, i) => ({
        name: `Voice ${i}`,
        sourceLayers: [i],
        noteCount: i ? 1 : 250_000,
        patternCount: 1,
        clipCount: 1,
      })),
      warnings: [],
    },
  };
  expect(() => validateProject(p)).not.toThrow();
  expect(decodeProject(encodeProject(p)).importOrganization).toEqual(
    p.importOrganization,
  );
  p.importOrganization.summary.noteCount = 1_000_001;
  expect(() => validateProject(p)).toThrow();
});

import { describe, expect, it } from "vitest";
import type { Layer, Note, Project } from "../src/shared/model";
import { buildEvents } from "../src/shared/timeline";
import { validateProject } from "../src/shared/session";
import {
  collectMusicalEvents,
  organizeImportedProject,
} from "../src/shared/smartPattern";

const layer = (name = "Layer 1", patch: Partial<Layer> = {}): Layer => ({
  id: `layer-${name}`,
  name,
  volume: 100,
  panning: 100,
  locked: false,
  muted: false,
  solo: false,
  ...patch,
});
const note = (tick: number, pitch = 60, patch: Partial<Note> = {}): Note => ({
  id: `note-${tick}-${pitch}`,
  tick,
  pitch,
  layer: 0,
  instrument: 0,
  velocity: 100,
  ...patch,
});
function song(notes: Note[], length = 192, layers = [layer()]): Project {
  return {
    schema: 2,
    id: "original",
    title: "Authored song",
    bpm: 120,
    meter: "4/4",
    loop: { enabled: false, start: 0, end: length },
    patterns: [
      {
        id: "whole",
        name: "Original",
        color: "#123456",
        length,
        layers,
        notes,
      },
    ],
    clips: [
      {
        id: "whole-clip",
        kind: "pattern",
        sourceId: "whole",
        tick: 0,
        length,
        offset: 0,
        track: 0,
        muted: false,
      },
    ],
    tracks: [
      {
        id: "original-track",
        name: "Original",
        color: "#123456",
        muted: false,
        solo: false,
        locked: false,
      },
    ],
    samples: [
      {
        id: "audio",
        name: "Harp",
        color: "#fff",
        builtin: "harp",
        rootKey: 60,
        volume: 80,
        panning: 100,
      },
    ],
    instruments: [0, 2, 3, 4, 16].map((id) => ({
      id,
      name:
        id === 16
          ? "Custom bell"
          : ["Harp", "", "Bass drum", "Snare drum", "Click"][id],
      sampleId: "audio",
      key: 45,
      pressKey: true,
    })),
  };
}
function repeatedPhrase(repetitions = 4, bars = 3): Note[] {
  return Array.from({ length: repetitions }, (_, repeat) =>
    Array.from({ length: bars }, (_, bar) => [
      note((repeat * bars + bar) * 16 + 0.375, 60 + bar * 3),
      note((repeat * bars + bar) * 16 + 9.25, 62 + bar * 3),
    ]).flat(),
  ).flat();
}
function audioTrace(project: Project) {
  return buildEvents(project)
    .events.map(({ id: _id, ...event }) => event)
    .sort(
      (a, b) =>
        a.tick - b.tick ||
        a.playbackRate - b.playbackRate ||
        a.gain - b.gain ||
        a.pan - b.pan,
    );
}
function assertPreserved(before: Project, after: Project) {
  expect(collectMusicalEvents(after)).toEqual(collectMusicalEvents(before));
  expect(audioTrace(after)).toEqual(audioTrace(before));
  expect(buildEvents(after).endTick).toBe(buildEvents(before).endTick);
}

describe("smart NBS structure", () => {
  it("reports a canonical trigger with source identity and every raw expressive/layer property", () => {
    const input = song(
      [
        note(2.25, 64, {
          instrument: 16,
          velocity: 77,
          panning: 180,
          finePitch: -25,
        }),
      ],
      32,
      [
        layer("Named", {
          sourceIndex: 5,
          volume: 65,
          panning: 20,
          locked: true,
          muted: true,
        }),
      ],
    );
    expect(collectMusicalEvents(input)).toEqual([
      '[2.25,5,64,16,77,180,-25,"Named",65,20,true,true,false]',
    ]);
  });

  it("stores one exact three-bar phrase once and preserves every fractional trigger and tail", () => {
    const input = song(repeatedPhrase());
    const before = structuredClone(input);
    const { project, summary } = organizeImportedProject(input);
    expect(summary.applicable).toBe(true);
    expect(project.patterns).toHaveLength(1);
    expect(project.patterns[0].length).toBe(48);
    expect(project.clips.map((c) => [c.tick, c.sourceId])).toEqual([
      [0, project.patterns[0].id],
      [48, project.patterns[0].id],
      [96, project.patterns[0].id],
      [144, project.patterns[0].id],
    ]);
    expect(summary.proposed.reusedClips).toBe(3);
    assertPreserved(input, project);
    expect(input).toEqual(before);
    expect(project.importOrganization?.version).toBe("nbs-structure-1");
    expect(JSON.parse(project.importOrganization!.originalData)).toEqual({
      patterns: input.patterns,
      clips: input.clips,
      tracks: input.tracks,
    });
  });

  it.each([
    ["velocity", { velocity: 99 }],
    ["detune", { finePitch: 1 }],
    ["pan", { panning: 101 }],
    ["strummed timing", { tick: 48 + 0.375 + 0.125 }],
  ] as const)(
    "keeps a %s variation independent instead of sharing its exact pattern",
    (_name, change) => {
      const input = song(repeatedPhrase(2), 96);
      Object.assign(input.patterns[0].notes[6], change);
      const { project } = organizeImportedProject(input, {
        candidateBars: [3],
      });
      expect(project.patterns).toHaveLength(2);
      expect(new Set(project.clips.map((c) => c.sourceId)).size).toBe(2);
      assertPreserved(input, project);
    },
  );

  it("groups nearby co-onset chord voices while leaving a separate bass register alone", () => {
    const input = song(
      Array.from({ length: 16 }, (_, i) => [
        note(i * 4, 60, { layer: 0 }),
        note(i * 4, 67, { layer: 1 }),
        note(i * 4 + 1, 31, { layer: 2 }),
      ]).flat(),
      64,
      [layer("Layer 1"), layer("Layer 2"), layer("Layer 3")],
    );
    const { project, summary } = organizeImportedProject(input);
    expect(summary.groups.map((g) => g.sourceLayers)).toEqual([[0, 1], [2]]);
    expect(project.tracks).toHaveLength(2);
    assertPreserved(input, project);
  });

  it("uses authored families but ignores generic layer and instrument-only names", () => {
    const input = song(
      [
        note(0, 42, { layer: 0 }),
        note(12, 87, { layer: 1 }),
        note(4, 30, { layer: 2 }),
        note(5, 82, { layer: 3 }),
      ],
      32,
      [layer("Theme 1"), layer("Theme 2"), layer("Harp 1"), layer("Harp 2")],
    );
    const { summary } = organizeImportedProject(input);
    expect(summary.groups.map((g) => g.sourceLayers)).toEqual([
      [0, 1],
      [2],
      [3],
    ]);
    expect(summary.groups[0].name).toBe("Theme");
    expect(summary.groups[1].name).not.toMatch(/bass|melody|drum/i);
  });

  it("leaves melodic Click and custom instrument lanes neutral and separate", () => {
    const input = song(
      Array.from({ length: 8 }, (_, i) => [
        note(i * 4, 50 + i, { instrument: 4, layer: 0 }),
        note(i * 4, 60, { instrument: 2, layer: 1 }),
        note(i * 4, 67, { instrument: 16, layer: 2 }),
      ]).flat(),
      32,
      [layer("图层1"), layer("图层2"), layer("图层3")],
    );
    const { project, summary } = organizeImportedProject(input);
    expect(summary.groups).toHaveLength(3);
    expect(summary.groups.every((g) => !/drum|bass|melody/i.test(g.name))).toBe(
      true,
    );
    assertPreserved(input, project);
  });

  it("retains authored layer settings, inactive triggers, custom instruments and duplicate multiplicity", () => {
    const input = song(
      [
        note(0, 60),
        note(0, 60, { id: "same-trigger-again" }),
        note(3, 72, {
          layer: 1,
          instrument: 16,
          velocity: 75,
          finePitch: -23,
          panning: 170,
        }),
        note(20, 40, { layer: 2 }),
      ],
      80,
      [
        layer("Lead 1", { volume: 75, panning: 20 }),
        layer("Lead 2", { locked: true, panning: 180 }),
        layer("Other", { muted: true }),
      ],
    );
    const { project } = organizeImportedProject(input);
    assertPreserved(input, project);
    expect(project.samples).toEqual(input.samples);
    expect(project.instruments).toEqual(input.instruments);
    for (const pattern of project.patterns)
      for (const local of pattern.layers) {
        const { sourceIndex, ...copy } = local;
        expect(copy).toEqual(input.patterns[0].layers[sourceIndex!]);
      }
    expect(collectMusicalEvents(project)).toHaveLength(4);
  });

  it("preserves leading blank space, weak pickup phase and trailing silence without repeating notes", () => {
    const input = song([note(17 + 1 / 3, 60), note(41.125, 64)], 135);
    const { project } = organizeImportedProject(input);
    assertPreserved(input, project);
    const final = [...project.clips].sort((a, b) => b.tick - a.tick)[0];
    expect(final.tick + final.length).toBe(135);
    expect(project.clips.every((c) => c.tailTicks === 135 - c.tick)).toBe(true);
    expect(collectMusicalEvents(project)).toHaveLength(2);
  });

  it("keeps an empty song restorable with its complete duration", () => {
    const input = song([], 141);
    const { project, summary } = organizeImportedProject(input);
    expect(summary.applicable).toBe(true);
    expect(summary.noteCount).toBe(0);
    expect(project.importOrganization).toBeDefined();
    assertPreserved(input, project);
  });

  it("uses the file meter for three-bar cycles and produces a valid saved project", () => {
    const input = song(
      Array.from({ length: 6 }, (_, bar) =>
        note(bar * 12 + 0.5, 60 + (bar % 3)),
      ),
      72,
    );
    input.meter = "3/4";
    const { project, summary } = organizeImportedProject(input);
    expect(summary.applicable).toBe(true);
    expect(project.patterns).toHaveLength(1);
    expect(project.patterns[0].length).toBe(36);
    expect(project.clips.map((c) => c.tick)).toEqual([0, 36]);
    expect(() => validateProject(project)).not.toThrow();
    assertPreserved(input, project);
  });

  it("never shares identical notes across incompatible source-layer groups", () => {
    const input = song(
      [note(0, 60), note(0, 60, { layer: 1, id: "second" })],
      16,
      [layer("Authored lead"), layer("Authored countervoice")],
    );
    const { project, summary } = organizeImportedProject(input);
    expect(summary.groups).toHaveLength(2);
    expect(project.patterns).toHaveLength(2);
    assertPreserved(input, project);
  });

  it.each(["track", "clip"])(
    "preserves effective %s mute after splitting into several groups",
    (kind) => {
      const input = song([note(0, 30), note(1, 90, { layer: 1 })], 32, [
        layer("Layer 1"),
        layer("Layer 2"),
      ]);
      if (kind === "track") input.tracks[0].muted = true;
      else input.clips[0].muted = true;
      const { project } = organizeImportedProject(input);
      expect(project.tracks).toHaveLength(2);
      expect(audioTrace(project)).toEqual([]);
      expect(collectMusicalEvents(project)).toHaveLength(2);
      assertPreserved(input, project);
    },
  );

  it("retains long original names while keeping report labels within the saved-format budget", () => {
    const input = song([note(0)], 32, [
      layer("Theme".repeat(1000), { id: "long-name-layer" }),
    ]);
    const { project, summary } = organizeImportedProject(input);
    expect(summary.applicable).toBe(true);
    expect(() => validateProject(project)).not.toThrow();
    assertPreserved(input, project);
  });

  it("falls back rather than generating an invalid sub-minimum partial phrase", () => {
    const input = song([note(128.00005)], 128.0001);
    const { project, summary } = organizeImportedProject(input);
    expect(summary.applicable).toBe(false);
    expect(project).toEqual(input);
  });

  it("uses reasonably long phrases for through-composed music instead of chopping every bar", () => {
    const input = song(
      Array.from({ length: 16 }, (_, bar) => note(bar * 16 + 2, 45 + bar)),
      256,
    );
    const { project } = organizeImportedProject(input);
    expect(project.clips.length).toBeLessThanOrEqual(4);
    expect(project.patterns.every((p) => p.length >= 64)).toBe(true);
    assertPreserved(input, project);
  });

  it.each([
    { maxAnalysisBars: 1 },
    { maxLanes: 0 },
    { maxGroups: 0 },
    { maxPatterns: 0 },
    { maxClips: 0 },
    { maxBackupBytes: 1 },
  ])(
    "safely falls back when an analysis or output budget is exceeded: %j",
    (overrides) => {
      const input = song(repeatedPhrase());
      const { project, summary } = organizeImportedProject(input, overrides);
      expect(summary.applicable).toBe(false);
      expect(summary.warnings.length).toBeGreaterThan(0);
      expect(project).toEqual(input);
      expect(project).not.toBe(input);
    },
  );

  it.each([
    "clip-offset",
    "layer-solo",
    "multiple-patterns",
    "out-of-range-note",
  ])("refuses unsupported manual input safely: %s", (mutation) => {
    const input = song([note(0)], 32);
    if (mutation === "clip-offset") input.clips[0].offset = 1;
    if (mutation === "layer-solo") input.patterns[0].layers[0].solo = true;
    if (mutation === "multiple-patterns")
      input.patterns.push({ ...input.patterns[0], id: "extra" });
    if (mutation === "out-of-range-note") input.patterns[0].notes[0].tick = 32;
    const { project, summary } = organizeImportedProject(input);
    expect(summary.applicable).toBe(false);
    expect(project).toEqual(input);
  });

  it("makes the same grouping and boundary choices regardless of IDs and note array order", () => {
    const input = song(repeatedPhrase());
    const other = structuredClone(input);
    other.id = "different";
    other.patterns[0].notes.reverse().forEach((n, i) => (n.id = `random-${i}`));
    other.patterns[0].layers[0].id = "new-layer";
    other.patterns[0].id = "new-pattern";
    other.clips[0].sourceId = "new-pattern";
    const a = organizeImportedProject(input),
      b = organizeImportedProject(other);
    expect(a.summary.groups).toEqual(b.summary.groups);
    expect(a.project.clips.map((c) => [c.tick, c.length, c.track])).toEqual(
      b.project.clips.map((c) => [c.tick, c.length, c.track]),
    );
    expect(collectMusicalEvents(a.project)).toEqual(
      collectMusicalEvents(b.project),
    );
  });

  it("analyzes a 35,000-note import within a practical bounded budget", () => {
    const input = song(
      Array.from({ length: 35_000 }, (_, i) => note(i * 0.5, 60 + (i % 7))),
      17_500,
    );
    const start = performance.now();
    const { project, summary } = organizeImportedProject(input);
    expect(summary.applicable).toBe(true);
    expect(performance.now() - start).toBeLessThan(5000);
    assertPreserved(input, project);
  });
});

import { describe, expect, it } from "vitest";
import type { Project } from "../src/shared/model";
import { buildEvents } from "../src/shared/timeline";

function fixture(): Project {
  return {
    schema: 2,
    id: "p",
    title: "Test",
    bpm: 120,
    meter: "4/4",
    loop: { enabled: false, start: 0, end: 16 },
    samples: [
      {
        id: "harp",
        name: "Harp",
        color: "#fff",
        builtin: "harp",
        rootKey: 66,
        volume: 100,
        panning: 100,
      },
    ],
    instruments: [
      { id: 0, name: "Harp", sampleId: "harp", key: 45, pressKey: true },
    ],
    patterns: [
      {
        id: "pattern",
        name: "Pattern",
        color: "#fff",
        length: 8,
        layers: [
          {
            id: "l",
            name: "Layer",
            volume: 100,
            panning: 100,
            locked: false,
            muted: false,
            solo: false,
          },
        ],
        notes: [
          {
            id: "a",
            tick: 0,
            layer: 0,
            pitch: 66,
            instrument: 0,
            velocity: 100,
          },
          {
            id: "b",
            tick: 2.5,
            layer: 0,
            pitch: 78,
            instrument: 0,
            velocity: 80,
          },
          {
            id: "c",
            tick: 6,
            layer: 0,
            pitch: 54,
            instrument: 0,
            velocity: 50,
          },
        ],
      },
    ],
    tracks: [
      {
        id: "t",
        name: "Track",
        color: "#fff",
        muted: false,
        solo: false,
        locked: false,
      },
    ],
    clips: [],
  };
}

describe("event plans", () => {
  it("places independent instances and crops offsets without implicitly repeating a pattern", () => {
    const p = fixture();
    p.clips = [
      {
        id: "one",
        kind: "pattern",
        sourceId: "pattern",
        tick: 4,
        length: 3,
        offset: 2,
        track: 0,
        muted: false,
      },
      {
        id: "two",
        kind: "pattern",
        sourceId: "pattern",
        tick: 12,
        length: 20,
        offset: 0,
        track: 0,
        muted: false,
      },
    ];
    const plan = buildEvents(p, "song");
    expect(plan.endTick).toBe(32);
    expect(plan.secondsPerTick).toBe(0.125);
    expect(plan.events.map((e) => [e.id, e.tick, e.durationTicks])).toEqual([
      ["one:b", 4.5, 2.5],
      ["two:a", 12, 8],
      ["two:b", 14.5, 5.5],
      ["two:c", 18, 2],
    ]);
    expect(p.patterns[0].notes[1].tick).toBe(2.5);
  });
  it("uses NBS center-or-average layer pan and additive custom instrument tuning", () => {
    const p = fixture(),
      layer = p.patterns[0].layers[0];
    layer.volume = 50;
    layer.panning = 0;
    p.samples[0].volume = 50;
    p.instruments[0].key = 57;
    p.patterns[0].notes[1].panning = 200;
    p.patterns[0].notes[1].finePitch = 100;
    const event = buildEvents(p, "pattern").events[1];
    expect(event.gain).toBeCloseTo(0.2);
    expect(event.pan).toBe(0);
    expect(event.playbackRate).toBeCloseTo(2 ** (25 / 12));
    layer.panning = 100;
    expect(buildEvents(p, "pattern").events[1].pan).toBe(1);
    p.samples[0].rootKey = 78;
    expect(buildEvents(p, "pattern").events[1].playbackRate).toBeCloseTo(
      2 ** (13 / 12),
    );
  });
  it("honors layer lock, mute and solo plus track mute/solo and clip mute", () => {
    const p = fixture();
    p.patterns[0].layers.push({
      ...p.patterns[0].layers[0],
      id: "other",
      solo: true,
    });
    p.patterns[0].notes.push({
      ...p.patterns[0].notes[0],
      id: "solo-note",
      layer: 1,
    });
    expect(buildEvents(p, "pattern").events.map((e) => e.id)).toEqual([
      "pattern:solo-note",
    ]);
    p.patterns[0].layers[1].locked = true;
    expect(buildEvents(p, "pattern").events).toEqual([]);
    p.patterns[0].layers[1].locked = false;
    p.patterns[0].layers[1].muted = true;
    expect(buildEvents(p, "pattern").events).toEqual([]);
    p.patterns[0].layers[1].muted = false;
    p.tracks.push({ ...p.tracks[0], id: "solo", solo: true });
    p.clips = [
      {
        id: "silent",
        kind: "pattern",
        sourceId: "pattern",
        tick: 0,
        length: 8,
        offset: 0,
        track: 0,
        muted: false,
      },
      {
        id: "audible",
        kind: "pattern",
        sourceId: "pattern",
        tick: 8,
        length: 8,
        offset: 0,
        track: 1,
        muted: false,
      },
    ];
    expect(buildEvents(p, "song").events.map((e) => e.id)).toEqual([
      "audible:solo-note",
    ]);
    p.clips[1].muted = true;
    expect(buildEvents(p, "song").events).toEqual([]);
    p.clips[1].muted = false;
    p.tracks[1].muted = true;
    expect(buildEvents(p, "song").events).toEqual([]);
  });
  it("keeps direct samples as single cropped events with native speed and padded window", () => {
    const p = fixture();
    p.samples[0].volume = 25;
    p.samples[0].panning = 0;
    p.clips = [
      {
        id: "s1",
        kind: "sample",
        sourceId: "harp",
        tick: 1.25,
        length: 40,
        offset: 2.5,
        track: 0,
        muted: false,
      },
      {
        id: "s2",
        kind: "sample",
        sourceId: "harp",
        tick: 8,
        length: 2,
        offset: 0,
        track: 0,
        muted: false,
      },
    ];
    const events = buildEvents(p, "song").events;
    expect(
      events.map((e) => [
        e.id,
        e.tick,
        e.durationTicks,
        e.offsetTicks,
        e.playbackRate,
        e.gain,
        e.pan,
      ]),
    ).toEqual([
      ["s1:sample", 1.25, 40, 2.5, 1, 0.25, -1],
      ["s2:sample", 8, 2, 0, 1, 0.25, -1],
    ]);
  });
  it("ignores out-of-window source notes and reports missing audible samples", () => {
    const p = fixture();
    p.patterns[0].notes.push({
      ...p.patterns[0].notes[0],
      id: "outside",
      tick: 8,
    });
    expect(buildEvents(p, "pattern").events).toHaveLength(3);
    p.samples = [];
    expect(() => buildEvents(p, "pattern")).toThrow(/sample/i);
  });
});

it("treats a sample source as a transport scope at its natural duration", () => {
  const p = fixture();
  p.samples[0].duration = 2;
  const plan = buildEvents(p, "harp");
  expect(plan.endTick).toBe(16);
  expect(
    plan.events.map((e) => [e.id, e.sampleId, e.playbackRate, e.durationTicks]),
  ).toEqual([["harp:sample", "harp", 1, 16]]);
});

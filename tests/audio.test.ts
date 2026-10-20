import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioSignal, Note, Project, StudioAPI } from "../src/shared/model";
import { AudioEngine } from "../src/renderer/src/audio";

class FakeSource {
  buffer: unknown;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  started: number[] = [];
  stopped: number[] = [];
  connect(node: unknown) {
    return node;
  }
  disconnect() {}
  start(...args: number[]) {
    this.started = args;
  }
  stop(time = 0) {
    this.stopped.push(time);
  }
}
class FakeContext {
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  resume = async () => {};
  decodeAudioData = async (_data: ArrayBuffer) => ({
    duration: 10,
    numberOfChannels: 1,
    length: 4,
    getChannelData: () => new Float32Array([0, 0.5, -1, 0]),
  });
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createGain() {
    return { gain: { value: 1 }, connect: (n: unknown) => n, disconnect() {} };
  }
  createStereoPanner() {
    return { pan: { value: 0 }, connect: (n: unknown) => n, disconnect() {} };
  }
}
function project(): Project {
  return {
    schema: 2,
    id: "p",
    title: "test",
    bpm: 120,
    meter: "4/4",
    loop: { enabled: false, start: 0, end: 16 },
    samples: [
      {
        id: "s",
        name: "Sample",
        color: "#fff",
        dataUrl: "data:audio/wav;base64,AAAA",
        rootKey: 66,
        volume: 100,
        panning: 100,
      },
    ],
    instruments: [
      { id: 0, name: "Harp", sampleId: "s", key: 45, pressKey: true },
    ],
    patterns: [],
    tracks: [
      {
        id: "t",
        name: "Track",
        color: "#fff",
        locked: false,
        muted: false,
        solo: false,
      },
    ],
    clips: [
      {
        id: "c",
        kind: "sample",
        sourceId: "s",
        tick: 0,
        length: 16,
        offset: 0,
        track: 0,
        muted: false,
      },
    ],
  };
}
function engine(
  context = new FakeContext(),
  bridge?: Pick<StudioAPI, "audioSignal" | "onAudioSignal">,
) {
  return {
    context,
    audio: new AudioEngine({
      createContext: () => context as unknown as AudioContext,
      bridge,
    }),
  };
}
function bus() {
  const listeners = new Map<string, (s: AudioSignal) => void>(),
    signals: AudioSignal[] = [];
  return {
    signals,
    bridge: (id: string) => ({
      onAudioSignal: (fn: (s: AudioSignal) => void) => {
        listeners.set(id, fn);
        return () => listeners.delete(id);
      },
      audioSignal: async (s: AudioSignal) => {
        signals.push(s);
        for (const [key, fn] of listeners) if (key !== id) fn(s);
      },
    }),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async () => new Response(new ArrayBuffer(4)));
}

it('reuses waveform analysis by decoded audio identity, isolates results and refreshes replaced audio', async () => {
  setup();
  const context = new FakeContext();
  const readChannel = vi.fn(() => new Float32Array([0, 0.5, -1, 0]));
  context.decodeAudioData = async () => ({ duration: 10, numberOfChannels: 1, length: 4,
    getChannelData: readChannel });
  const { audio } = engine(context);
  const p = project();
  const first = await audio.getSamplePeaks(p, 's');
  expect(first.slice(0, 4)).toEqual([0, 0.5, 1, 0]);
  first[0] = 99;
  expect((await audio.getSamplePeaks(p, 's'))[0]).toBe(0);
  expect(readChannel).toHaveBeenCalledTimes(1);
  p.samples[0].dataUrl = 'data:audio/wav;base64,AQID';
  await audio.getSamplePeaks(p, 's');
  expect(readChannel).toHaveBeenCalledTimes(2);
});

const previewChord = (tick = 12): Omit<Note, "id">[] => [60, 64, 67].map((pitch, i) => ({ tick: tick + i, layer: i, pitch, instrument: 0, velocity: 80 }));

it("schedules an auditioned chord on one clock without moving or owning the transport", async () => {
  setup();
  const b = bus(), { audio, context } = engine(new FakeContext(), b.bridge("chord"));
  await audio.previewNotes(project(), previewChord());
  expect(context.sources).toHaveLength(3);
  expect(context.sources.map(s => s.started[0])).toEqual([0.025, 0.15, 0.275]);
  expect(context.sources.map(s => s.playbackRate.value)).toEqual([60, 64, 67].map(pitch => 2 ** ((pitch - 66) / 12)));
  expect(audio.getState()).toMatchObject({ status: "stopped", tick: 0 });
  expect(b.signals).toHaveLength(0);
  audio.stopPreview();
});

it("cancels chord preview sources without stopping an active song", async () => {
  setup();
  const { audio, context } = engine();
  await audio.play(project());
  const song = context.sources[0], scheduledStops = [...song.stopped];
  await audio.previewNotes(project(), previewChord());
  const chordSources = context.sources.slice(1);
  audio.stopPreview();
  expect(song.stopped).toEqual(scheduledStops);
  expect(chordSources.every(source => source.stopped.at(-1) === 0)).toBe(true);
  expect(audio.getState().status).toBe("playing");
  audio.stop();
});

it("does not emit a late chord when the panel closes during decoding", async () => {
  setup();
  const context = new FakeContext();
  let resolve!: (buffer: any) => void;
  context.decodeAudioData = () => new Promise(r => { resolve = r; });
  const { audio } = engine(context);
  const pending = audio.previewNotes(project(), previewChord());
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  audio.stopPreview();
  resolve({ duration: 1 });
  await pending;
  expect(context.sources).toHaveLength(0);
});

it("cancels a previous chord audition before another starts and respects transport stop", async () => {
  setup();
  const { audio, context } = engine();
  await audio.previewNotes(project(), previewChord());
  const first = [...context.sources];
  await audio.previewNotes(project(), previewChord(24));
  expect(first.every(source => source.stopped.at(-1) === 0)).toBe(true);
  audio.stop();
  expect(context.sources.every(source => source.stopped.at(-1) === 0)).toBe(true);
});

describe("audio transport", () => {
  it("previews a frozen note phrase through its instruments rather than looking for a phrase audio buffer", async () => {
    setup();
    const { audio, context } = engine();
    const p = project();
    p.phrases = [
      {
        id: "frozen",
        name: "Read only",
        color: "#82b5a2",
        length: 16,
        layers: [
          {
            id: "l",
            name: "Harp",
            volume: 100,
            panning: 100,
            locked: false,
            muted: false,
            solo: false,
          },
        ],
        notes: [
          {
            id: "n",
            tick: 0,
            layer: 0,
            pitch: 66,
            instrument: 0,
            velocity: 80,
          },
        ],
      },
    ];
    await audio.play(p, "frozen");
    expect(audio.getState()).toMatchObject({
      status: "playing",
      scope: "frozen",
    });
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].started[1]).toBe(0);
    audio.stop();
  });
  it("creates audio lazily, pauses at the precise clock tick, resumes tails, and stops at zero once", async () => {
    setup();
    const context = new FakeContext(),
      create = vi.fn(() => context as unknown as AudioContext);
    const audio = new AudioEngine({ createContext: create });
    expect(create).not.toHaveBeenCalled();
    await audio.play(project());
    context.currentTime = 0.4;
    audio.pause();
    expect(audio.getState()).toMatchObject({ status: "paused", tick: 3 });
    expect(context.sources[0].stopped).toContain(0);
    await audio.play(project());
    expect(context.sources[1].started[1]).toBeCloseTo(0.375);
    audio.stop();
    expect(audio.getState()).toMatchObject({ status: "stopped", tick: 0 });
  });
  it("seek cancels previous scheduled sound and restarts at the selected sample offset", async () => {
    setup();
    const { audio, context } = engine();
    const p = project();
    p.clips[0].offset = 2;
    await audio.play(p);
    expect(context.sources[0].started[1]).toBe(0.25);
    audio.seek(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(context.sources[0].stopped).toContain(0);
    expect(context.sources[1].started[1]).toBe(1);
    expect(audio.getState()).toMatchObject({ status: "playing", tick: 6 });
    audio.stop();
  });
  it("crops direct audio at its clip boundary without replaying a padded sample", async () => {
    setup();
    const { audio, context } = engine();
    const p = project();
    p.clips[0].length = 4;
    await audio.play(p);
    expect(context.sources[0].stopped[0]).toBeCloseTo(0.525);
    context.currentTime = 1;
    await vi.advanceTimersByTimeAsync(200);
    expect(context.sources).toHaveLength(1);
    audio.stop();
  });
  it("never claims another window after a loading play was cancelled", async () => {
    setup();
    const context = new FakeContext(),
      b = bus();
    let resolve!: () => void;
    context.resume = () =>
      new Promise<void>((r) => {
        resolve = r;
      });
    const { audio } = engine(context, b.bridge("one"));
    const loading = audio.play(project());
    audio.stop();
    resolve();
    await loading;
    expect(audio.getState()).toMatchObject({ status: "stopped", tick: 0 });
    expect(b.signals.filter((s) => s.type === "claim")).toEqual([]);
    expect(context.sources).toEqual([]);
  });
  it("coordinates ownership across windows and lets a remote window pause and stop the owner", async () => {
    setup();
    const b = bus(),
      one = engine(new FakeContext(), b.bridge("one")),
      two = engine(new FakeContext(), b.bridge("two"));
    await one.audio.play(project());
    one.context.currentTime = 0.4;
    await vi.advanceTimersByTimeAsync(50);
    expect(two.audio.getState().status).toBe("playing");
    two.audio.pause();
    expect(one.audio.getState()).toMatchObject({ status: "paused", tick: 3 });
    expect(two.audio.getState()).toMatchObject({ status: "paused", tick: 3 });
    await two.audio.play(project());
    expect(one.context.sources[0].stopped).toContain(0);
    one.audio.stop();
    expect(two.audio.getState()).toMatchObject({ status: "stopped", tick: 0 });
    expect(one.audio.getState()).toMatchObject({ status: "stopped", tick: 0 });
  });
  it("reports failed audio loads without claiming transport ownership", async () => {
    setup();
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    const b = bus(),
      { audio } = engine(new FakeContext(), b.bridge("one"));
    await expect(audio.play(project())).rejects.toThrow(/load|audio/i);
    expect(audio.getState().status).toBe("stopped");
    expect(audio.getState().error).toBeTruthy();
    expect(b.signals.filter((s) => s.type === "claim")).toEqual([]);
  });
});

it("schedules explicit loop repetitions on the audio clock with no timer-sized gap", async () => {
  setup();
  const { audio, context } = engine();
  const p = project();
  p.loop = { enabled: true, start: 0, end: 2 };
  await audio.play(p);
  context.currentTime = 0.2;
  await vi.advanceTimersByTimeAsync(25);
  expect(context.sources).toHaveLength(2);
  expect(context.sources[0].stopped[0]).toBeCloseTo(0.275);
  expect(context.sources[1].started[0]).toBeCloseTo(0.275);
  context.currentTime = 0.4;
  expect(audio.getState().tick).toBeCloseTo(1);
  audio.stop();
});

it("rebuilds changed playback from its precise tick and cancels scheduled pre-edit audio", async () => {
  setup();
  const { audio, context } = engine();
  const p = project();
  await audio.play(p);
  context.currentTime = 0.4;
  audio.updateProject({ ...p, clips: [{ ...p.clips[0], muted: true }] });
  await vi.advanceTimersByTimeAsync(1);
  expect(context.sources[0].stopped).toContain(0);
  expect(context.sources).toHaveLength(1);
  expect(audio.getState()).toMatchObject({ status: "playing", tick: 3 });
  audio.stop();
});

it("applies project edits arriving during an unfinished audio load and cancels the stale plan", async () => {
  setup();
  const context = new FakeContext(),
    b = bus();
  let resolve!: (b: any) => void;
  context.decodeAudioData = () =>
    new Promise((r) => {
      resolve = r;
    });
  const { audio } = engine(context, b.bridge("one")),
    p = project(),
    loading = audio.play(p);
  await vi.advanceTimersByTimeAsync(1);
  audio.updateProject({ ...p, clips: [{ ...p.clips[0], muted: true }] });
  await vi.advanceTimersByTimeAsync(1);
  resolve({
    duration: 10,
    numberOfChannels: 1,
    length: 1,
    getChannelData: () => new Float32Array([0]),
  });
  await loading;
  expect(audio.getState().status).toBe("playing");
  expect(context.sources).toHaveLength(0);
  expect(b.signals.filter((s) => s.type === "claim")).toHaveLength(1);
  audio.stop();
});

it("resets transport when an entirely different project is opened", async () => {
  setup();
  const { audio, context } = engine();
  await audio.play(project());
  context.currentTime = 0.4;
  audio.updateProject({ ...project(), id: "other" });
  expect(audio.getState()).toMatchObject({
    status: "stopped",
    tick: 0,
    scope: "song",
  });
  expect(context.sources[0].stopped).toContain(0);
});

it("plays sample scopes with decoded duration and supports their pause/resume transport", async () => {
  setup();
  const { audio, context } = engine();
  const p = project();
  await audio.play(p, "s");
  expect(audio.getState()).toMatchObject({
    status: "playing",
    scope: "s",
    tick: 0,
  });
  context.currentTime = 0.4;
  audio.pause();
  expect(audio.getState().tick).toBe(3);
  await audio.play(p, "s");
  expect(context.sources[1].started[1]).toBe(0.375);
  context.currentTime = 11;
  await vi.advanceTimersByTimeAsync(25);
  expect(audio.getState()).toMatchObject({
    status: "stopped",
    tick: 0,
    scope: "s",
  });
});
it("seeks into an explicitly selected editor scope before first playback", async () => {
  setup();
  const { audio } = engine();
  const p = project();
  audio.updateProject(p);
  audio.seek(4, "s");
  expect(audio.getState()).toMatchObject({
    scope: "s",
    tick: 4,
    status: "stopped",
  });
  await audio.play(p, "s");
  expect(audio.getState()).toMatchObject({
    scope: "s",
    tick: 4,
    status: "playing",
  });
  audio.stop();
});
it("releases a closed transport owner so remaining windows can stop and play normally", async () => {
  setup();
  const b = bus(),
    one = engine(new FakeContext(), b.bridge("one")),
    two = engine(new FakeContext(), b.bridge("two"));
  await one.audio.play(project());
  await b.bridge("one").audioSignal({
    type: "release",
    owner: b.signals.find((s) => s.type === "claim")!.owner,
  });
  expect(two.audio.getState()).toMatchObject({ status: "stopped", tick: 0 });
  two.audio.seek(3);
  expect(two.audio.getState().tick).toBe(3);
  one.audio.stop();
});
it("transfers a docked paused transport to the main window and publishes its cursor to all editors", async () => {
  setup();
  const b = bus(),
    main = engine(new FakeContext(), b.bridge("main")),
    other = engine(new FakeContext(), b.bridge("other"));
  await main.audio.adoptTransport(project(), {
    status: "paused",
    tick: 5.25,
    scope: "song",
  });
  expect(main.audio.getState()).toMatchObject({
    status: "paused",
    tick: 5.25,
    scope: "song",
  });
  expect(other.audio.getState()).toMatchObject({
    status: "paused",
    tick: 5.25,
    scope: "song",
  });
  other.audio.stop();
  expect(main.audio.getState()).toMatchObject({ status: "stopped", tick: 0 });
});
it("resumes a docked playing transport at its transferred cursor", async () => {
  setup();
  const { audio, context } = engine();
  await audio.adoptTransport(project(), {
    status: "playing",
    tick: 4,
    scope: "song",
  });
  expect(audio.getState()).toMatchObject({
    status: "playing",
    tick: 4,
    scope: "song",
  });
  expect(context.sources[0].started[1]).toBeCloseTo(0.5);
  audio.stop();
});

it("uses tempo-clock elapsed seconds for seek offsets, durations and precise pause", async () => {
  setup();
  const { audio, context } = engine();
  const p = project();
  p.nbsEvents = [
    {
      id: "tempo",
      kind: "tempo",
      tick: 4,
      layer: 0,
      instrument: 16,
      pitch: 66,
      velocity: 100,
      panning: 100,
      finePitch: 240,
    },
  ];
  p.clips[0].offset = 2;
  await audio.play(p);
  expect(context.sources[0].stopped[0]).toBeCloseTo(1.275);
  context.currentTime = 0.775;
  audio.pause();
  expect(audio.getState().tick).toBeCloseTo(8);
  await audio.play(p);
  expect(context.sources[1].started[1]).toBeCloseTo(1);
  expect(context.sources[1].stopped[0]).toBeCloseTo(1.3);
  audio.seek(12);
  await vi.advanceTimersByTimeAsync(1);
  expect(context.sources[2].started[1]).toBeCloseTo(1.25);
  audio.stop();
});

it("loops over multiple tempo changes at exact audio deadlines and wraps the cursor in seconds", async () => {
  setup();
  const { audio, context } = engine();
  const p = project();
  p.nbsEvents = [
    {
      id: "tempo",
      kind: "tempo",
      tick: 2,
      layer: 0,
      instrument: 16,
      pitch: 66,
      velocity: 100,
      panning: 100,
      finePitch: 240,
    },
  ];
  p.nbsEvents.push({
    ...p.nbsEvents[0],
    id: "slower",
    tick: 3,
    finePitch: 120,
  });
  p.loop = { enabled: true, start: 1, end: 4 };
  await audio.play(p);
  expect(context.sources[0].stopped[0]).toBeCloseTo(0.4625);
  context.currentTime = 0.4;
  await vi.advanceTimersByTimeAsync(25);
  expect(context.sources[1].started[0]).toBeCloseTo(0.4625);
  expect(context.sources[1].started[1]).toBeCloseTo(0.125);
  expect(context.sources[1].stopped[0]).toBeCloseTo(0.775);
  context.currentTime = 0.7;
  expect(audio.getState().tick).toBeCloseTo(3.4);
  audio.stop();
});

it("stops a prior sample tail on its source layer and keeps new notes on that tick", async () => {
  setup();
  const { audio, context } = engine();
  const p = project();
  p.patterns = [
    {
      id: "p",
      name: "p",
      color: "#fff",
      length: 8,
      layers: [
        {
          id: "l",
          name: "l",
          sourceIndex: 4,
          volume: 100,
          panning: 100,
          locked: true,
          muted: false,
          solo: false,
        },
      ],
      notes: [0, 2].map((tick) => ({
        id: `n${tick}`,
        tick,
        layer: 0,
        instrument: 0,
        pitch: 66,
        velocity: 100,
      })),
    },
  ];
  p.clips = [
    {
      id: "c",
      kind: "pattern",
      sourceId: "p",
      tick: 0,
      length: 8,
      offset: 0,
      track: 0,
      muted: false,
    },
  ];
  p.nbsEvents = [
    {
      id: "cut",
      kind: "stop",
      tick: 2,
      layer: 0,
      instrument: 17,
      pitch: 66,
      velocity: 100,
      panning: 105,
      finePitch: 5,
    },
  ];
  await audio.play(p);
  expect(context.sources[0].stopped[0]).toBeCloseTo(0.275);
  context.currentTime = 0.2;
  await vi.advanceTimersByTimeAsync(25);
  expect(context.sources[1].started[0]).toBeCloseTo(0.275);
  expect(context.sources[1].stopped[0]).toBeCloseTo(1.025);
  audio.seek(3);
  await vi.advanceTimersByTimeAsync(1);
  expect(context.sources).toHaveLength(3);
  expect(context.sources[2].started[1]).toBeCloseTo(0.125);
  audio.stop();
});

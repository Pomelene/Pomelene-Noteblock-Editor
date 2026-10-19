import { expect, it } from "vitest";
import { fromNbs, toNbs } from "../src/shared/io";
import { Session, validateProject } from "../src/shared/session";
import { organizeImportedProject } from "../src/shared/smartPattern";

it("rejects reserved protocol names for playable custom instruments before export can reinterpret notes", () => {
  const p = fromNbs(fixture(5, 16, "Ordinary custom instrument"));
  const session = new Session(p);
  const before = session.snapshot();
  for (const name of [
    "Tempo Changer",
    "Sound Stopper",
    "Show Save Popup",
    "Change Color to #123456",
  ]) {
    expect(() =>
      session.dispatch({ type: "instrument:update", id: 16, patch: { name } }),
    ).toThrow(/保留|控制/);
    expect(session.snapshot()).toEqual(before);
  }
});

// Independent binary writer: permits protocol bytes outside ordinary note ranges.
function fixture(
  version = 5,
  vanilla = 16,
  name = "Sound Stopper",
  state = 0,
  definitions = 1,
) {
  const chunks: Buffer[] = [];
  const b = (n: number) => chunks.push(Buffer.from([n]));
  const s = (n: number) => {
    const v = Buffer.alloc(2);
    v.writeUInt16LE(n & 65535);
    chunks.push(v);
  };
  const i = (n: number) => {
    const v = Buffer.alloc(4);
    v.writeInt32LE(n);
    chunks.push(v);
  };
  const str = (v: string) => {
    const bytes = Buffer.from(v);
    i(bytes.length);
    chunks.push(bytes);
  };
  s(version ? 0 : 16);
  if (version) {
    b(version);
    b(vanilla);
    if (version >= 3) s(16);
  }
  s(1);
  for (const v of ["Events", "", "", ""]) str(v);
  s(800);
  b(0);
  b(10);
  b(4);
  for (let n = 0; n < 5; n++) i(0);
  str("");
  if (version >= 4) {
    b(0);
    b(0);
    s(0);
  }
  s(5);
  s(1);
  b(version ? vanilla : 10);
  b(39);
  if (version >= 4) {
    b(255);
    b(254);
    s(3);
  }
  s(0);
  s(0);
  str("Layer");
  if (version >= 4) b(state);
  b(100);
  if (version >= 2) b(100);
  b(definitions);
  for (let n = 0; n < definitions; n++) {
    str(n === 0 ? name : `Unused ${n}`);
    str("effect.ogg");
    b(45);
    b(0);
  }
  return Buffer.concat(chunks);
}

it("extracts controls after definitions, retaining protocol bytes and global positions", () => {
  const p = fromNbs(fixture());
  expect(p.patterns[0].notes).toHaveLength(0);
  expect(p.nbsEvents).toMatchObject([
    {
      tick: 4,
      layer: 0,
      instrument: 16,
      kind: "stop",
      pitch: 60,
      velocity: 255,
      panning: 254,
      finePitch: 3,
    },
  ]);
  expect(p.instruments.find((i) => i.id === 16)).toBeUndefined();
  expect(p.nbs?.controlEvents).toBeUndefined();
  const reopened = fromNbs(toNbs(p).data);
  expect(reopened.nbsEvents).toEqual(p.nbsEvents);
});

it.each([0, 1, 2, 3, 4, 5, 6])(
  "recognizes named controls with version %s custom bases",
  (version) => {
    const p = fromNbs(
      fixture(version, version === 6 ? 20 : 10, "Tempo Changer"),
    );
    expect(p.nbsEvents?.[0]).toMatchObject({ kind: "tempo", instrument: 16 });
    expect(p.patterns[0].notes).toHaveLength(0);
  },
);

it("keeps unknown custom instruments as ordinary notes with disclosed repairs", () => {
  const p = fromNbs(fixture(6, 20, "Unrecognized effect"));
  expect(p.nbsEvents ?? []).toHaveLength(0);
  expect(p.patterns[0].notes[0]).toMatchObject({
    instrument: 16,
    velocity: 100,
    panning: 200,
  });
  expect(p.instruments.find((i) => i.id === 16)?.name).toBe(
    "Unrecognized effect",
  );
  expect(p.nbs?.warnings.join(" ")).toMatch(/力度/);
});

it("distinguishes layer solo from editing lock", () => {
  const solo = fromNbs(fixture(5, 16, "Tempo Changer", 2));
  expect(solo.patterns[0].layers[0]).toMatchObject({
    locked: false,
    solo: true,
  });
  expect(
    fromNbs(fixture(5, 16, "Tempo Changer", 1)).patterns[0].layers[0],
  ).toMatchObject({ locked: true, solo: false });
});

it("validates raw event values and references", () => {
  const p = fromNbs(fixture());
  for (const patch of [
    { velocity: 256 },
    { tick: 1_048_576 },
    { layer: 4096 },
    { instrument: 17 },
    { kind: "visual" },
    { finePitch: 32768 },
  ]) {
    const q = structuredClone(p);
    Object.assign(q.nbsEvents![0], patch);
    expect(() => validateProject(q)).toThrow();
  }
});

it("retains visual controls and exports events independently from clips", () => {
  for (const name of [
    "Toggle Rainbow",
    "Toggle Background Accent",
    "Show Save Popup",
    "Change Color to #123456",
  ]) {
    const p = fromNbs(fixture(5, 16, name));
    p.clips = [];
    expect(fromNbs(toNbs(p).data).nbsEvents?.[0]).toMatchObject({
      kind: "visual",
      tick: 4,
    });
  }
});

it("interprets tempo and signed stopper ranges without normalizing protocol bytes", async () => {
  const { tempoForEvent, stopRangeForEvent, getNbsEventKind } = await import(
    "../src/shared/nbsEvents"
  );
  const e = fromNbs(fixture()).nbsEvents![0];
  expect(stopRangeForEvent(e)).toEqual({ start: 3, end: 3 });
  expect(
    stopRangeForEvent({ ...e, velocity: 100, panning: 105, finePitch: 2 }),
  ).toEqual({ start: 2, end: 5 });
  expect(stopRangeForEvent({ ...e, finePitch: -1 })).toEqual({
    start: 0,
    end: 0,
  });
  expect(tempoForEvent({ ...e, kind: "tempo", finePitch: -300 })).toBe(20);
  expect(tempoForEvent({ ...e, kind: "tempo", finePitch: 0 })).toBeUndefined();
  expect(tempoForEvent(e)).toBeUndefined();
  expect(getNbsEventKind("tempo changer")).toBeUndefined();
  expect(getNbsEventKind("A Tempo Changer")).toBeUndefined();
  expect(getNbsEventKind("change color to #abcdef")).toBe("visual");
});

it("keeps control layers fixed when a musical note collides and after organization", () => {
  const p = fromNbs(fixture());
  p.patterns[0].notes.push({
    id: "musical",
    tick: 4,
    layer: 0,
    pitch: 60,
    instrument: 0,
    velocity: 100,
  });
  const organized = organizeImportedProject(p).project;
  expect(organized.nbsEvents).toEqual(p.nbsEvents);
  const result = fromNbs(toNbs(organized).data);
  expect(result.nbsEvents?.[0]).toMatchObject({
    tick: 4,
    layer: 0,
    velocity: 255,
    panning: 254,
  });
  expect(result.patterns[0].notes[0]).toMatchObject({ tick: 4, layer: 1 });
});

it("validates preserved metadata before export", () => {
  const p = fromNbs(fixture());
  for (const mutate of [
    (q: typeof p) => {
      q.nbs!.layers[0].locked = 3;
    },
    (q: typeof p) => {
      q.nbs!.customInstruments[0].pressKey = 2;
    },
    (q: typeof p) => {
      q.nbs!.rawStrings.title.bytes = [256];
    },
    (q: typeof p) => {
      q.nbs!.loopStartTick = 65536;
    },
  ]) {
    const q = structuredClone(p);
    mutate(q);
    expect(() => validateProject(q)).toThrow();
  }
});

it("rejects events beyond v5 tick bounds explicitly", () => {
  const p = fromNbs(fixture());
  p.nbsEvents![0].tick = 65536;
  expect(() => toNbs(p)).toThrow(/v5 control tick.*65535/);
});

it("preserves unused definition slots beyond the instrument byte range", () => {
  const p = fromNbs(fixture(5, 16, "Sound Stopper", 0, 255));
  expect(p.nbs?.customInstruments).toHaveLength(255);
  expect(p.instruments.every((i) => i.id <= 255)).toBe(true);
  expect(fromNbs(toNbs(p).data).nbs?.customInstruments).toEqual(
    p.nbs?.customInstruments,
  );
});

it("rejects playable instruments occupying reserved protocol definition slots", () => {
  const p = fromNbs(fixture());
  p.instruments.push({ ...p.instruments[0], id: 16, name: "Playable alias" });
  expect(() => validateProject(p)).toThrow(/控制|协议/);
});

it("exports the final v5 tick even when its first delta needs an empty stepping record", () => {
  const p = fromNbs(fixture());
  p.clips = [];
  p.nbsEvents![0].tick = 65535;
  expect(fromNbs(toNbs(p).data).nbsEvents?.[0].tick).toBe(65535);
});

it("rejects collision lane changes that would invalidate Sound Stopper target ranges", () => {
  const p = fromNbs(fixture());
  Object.assign(p.nbsEvents![0], { finePitch: 1, velocity: 100, panning: 101 });
  p.patterns[0].notes.push({
    id: "musical",
    tick: 4,
    layer: 0,
    pitch: 60,
    instrument: 0,
    velocity: 100,
  });
  expect(() => toNbs(p)).toThrow(/Sound Stopper.*collision|碰撞.*停止/);
});

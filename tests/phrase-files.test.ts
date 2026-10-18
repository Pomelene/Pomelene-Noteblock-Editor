import { expect, it } from "vitest";
import { ProjectFiles, type FileDialogs } from "../src/main/files";
import { createDemoProject, Session } from "../src/shared/session";
import { toNbs } from "../src/shared/io";
import { buildEvents } from "../src/shared/timeline";

const dialogs = (open: FileDialogs["open"]): FileDialogs => ({
  open,
  save: async () => undefined,
  unsaved: async () => {
    throw Error("unexpected replace prompt");
  },
  sounds: async () => undefined,
});
function customSong() {
  const p = createDemoProject();
  p.bpm = 90;
  p.samples.push({
    id: "custom-16",
    name: "New",
    color: "#fff",
    originalPath: "new.ogg",
    rootKey: 66,
    volume: 100,
    panning: 100,
  });
  p.instruments.push({
    id: 16,
    name: "New",
    sampleId: "custom-16",
    key: 51,
    pressKey: true,
  });
  p.patterns[0].notes.forEach((n) => {
    n.instrument = 16;
    n.panning = 42;
    n.velocity = 67;
    n.finePitch = 25;
  });
  return toNbs(p).data;
}
it("imports NBS into the phrase library without replacing the song and remaps custom resources", async () => {
  const host = createDemoProject();
  host.samples.push({
    id: "custom-16",
    name: "Existing",
    color: "#fff",
    dataUrl: "data:audio/ogg;base64,T2xk",
    rootKey: 66,
    volume: 100,
    panning: 100,
  });
  host.instruments.push({
    id: 16,
    name: "Existing",
    sampleId: "custom-16",
    key: 45,
    pressKey: false,
  });
  const s = new Session(host);
  s.markSaved("host.nbproject");
  const before = s.snapshot(),
    requested: string[] = [];
  const bytes = customSong();
  const files = new ProjectFiles({
    session: s,
    dialogs: dialogs(async (kind) => {
      requested.push(kind);
      return "/songs/phrase.nbs";
    }),
    chooseImport: async () => {
      throw Error("unexpected organization");
    },
    storage: {
      read: async (path) => {
        if (path.endsWith("phrase.nbs")) return bytes;
        if (path.endsWith("new.ogg")) return new TextEncoder().encode("OggS");
        throw Error("missing");
      },
      write: async () => {},
    },
  });
  const result = await files.action("importPhrase");
  expect(result.ok).toBe(true);
  expect(requested).toEqual(["phrase"]);
  expect(result.snapshot.generation).toBe(before.generation);
  expect(result.snapshot.document).toEqual({
    path: "host.nbproject",
    dirty: true,
  });
  const p = result.snapshot.project;
  for (const key of [
    "id",
    "title",
    "bpm",
    "meter",
    "loop",
    "patterns",
    "clips",
    "tracks",
    "nbs",
  ] as const)
    expect(p[key]).toEqual(host[key]);
  const phrase = p.phrases![0];
  const note = phrase.notes.find((n) => n.velocity === 67)!;
  expect(note).toMatchObject({ velocity: 67, panning: 42, finePitch: 25 });
  expect(note.instrument).not.toBe(16);
  const instrument = p.instruments.find((i) => i.id === note.instrument)!;
  expect(instrument).toMatchObject({ name: "New", key: 51, pressKey: true });
  expect(p.samples.find((x) => x.id === instrument.sampleId)).toMatchObject({
    dataUrl: "data:audio/ogg;base64,T2dnUw==",
  });
  expect(phrase.layers.every((l) => l.sourceIndex === undefined)).toBe(true);
  expect(
    buildEvents(p, phrase.id).events.some(
      (e) => e.sampleId === instrument.sampleId,
    ),
  ).toBe(true);
  expect(
    result.warnings.some((w) => w.includes("90") && w.includes("108")),
  ).toBe(true);
  expect(s.dispatch({ type: "undo" }).project).toEqual(before.project);
  expect(s.dispatch({ type: "redo" }).project.phrases).toEqual(p.phrases);
  const exportable = structuredClone(p);
  exportable.clips = [
    {
      ...p.clips[0],
      kind: "phrase",
      sourceId: phrase.id,
      tick: 0,
      offset: 0,
      length: phrase.length,
    },
  ];
  const { fromNbs } = await import("../src/shared/io");
  const roundTrip = fromNbs(toNbs(exportable).data);
  expect(
    roundTrip.patterns.flatMap((x) => x.notes).find((n) => n.velocity === 67),
  ).toMatchObject({ panning: 42, finePitch: 25 });
  expect(roundTrip.instruments.find((i) => i.name === "New")).toMatchObject({
    key: 51,
    pressKey: true,
  });
});

it("keeps the complete current project when phrase resource allocation fails", async () => {
  const host = createDemoProject();
  for (let id = 16; id <= 255; id++)
    host.instruments.push({
      id,
      name: `Existing ${id}`,
      sampleId: host.samples[0].id,
      key: 45,
      pressKey: false,
    });
  const s = new Session(host),
    before = s.snapshot(),
    bytes = customSong();
  const files = new ProjectFiles({
    session: s,
    dialogs: dialogs(async () => "/phrase.nbs"),
    storage: {
      read: async (path) => {
        if (path.endsWith(".nbs")) return bytes;
        throw Error("missing");
      },
      write: async () => {},
    },
  });
  await expect(files.action("importPhrase")).rejects.toThrow(/乐器/);
  expect(s.snapshot()).toEqual(before);
});

it("rejects audio files as NBS phrases without modifying the library", async () => {
  const s = new Session(),
    before = s.snapshot();
  const files = new ProjectFiles({
    session: s,
    dialogs: dialogs(async () => "/voice.wav"),
    storage: {
      read: async () => new TextEncoder().encode("RIFF fake WAVE"),
      write: async () => {},
    },
  });
  await expect(files.action("importPhrase")).rejects.toThrow();
  expect(s.snapshot()).toEqual(before);
});

it("discards an in-flight phrase import if the current document has changed", async () => {
  const s = new Session(),
    bytes = customSong();
  let release!: (bytes: Uint8Array) => void;
  const pending = new Promise<Uint8Array>((resolve) => {
    release = resolve;
  });
  const files = new ProjectFiles({
    session: s,
    dialogs: dialogs(async () => "/phrase.nbs"),
    storage: {
      read: async (path) => {
        if (path.endsWith(".nbs")) return pending;
        throw Error("missing");
      },
      write: async () => {},
    },
  });
  const importing = files.action("importPhrase");
  await Promise.resolve();
  s.replace(createDemoProject());
  const before = s.snapshot();
  release(bytes);
  expect((await importing).ok).toBe(false);
  expect(s.snapshot()).toEqual(before);
});

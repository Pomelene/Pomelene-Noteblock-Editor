import { expect, it } from "vitest";
import { ProjectFiles, type FileDialogs } from "../src/main/files";
import { Session, createEmptyProject } from "../src/shared/session";
import { readAudioZip } from "../src/main/zip";
function fixture(target: "custom" | "builtin" = "custom", shared = false) {
  const p = createEmptyProject();
  p.samples.push({
    ...p.samples[0],
    id: "missing",
    name: "Lost",
    originalPath: "lost.wav",
  });
  p.instruments.push({
    id: 16,
    name: "Lost",
    sampleId: "missing",
    key: 45,
    pressKey: false,
    mappingTargetId: target === "custom" ? 17 : 0,
  });
  if (target === "custom") {
    p.samples.push({
      ...p.samples[0],
      id: "target",
      originalPath: "replacement.ogg",
      dataUrl: "data:audio/ogg;base64,T2dnUw==",
    });
    p.instruments.push({
      id: 17,
      name: "Replacement",
      sampleId: "target",
      key: 45,
      pressKey: false,
    });
  }
  if (shared)
    p.instruments.push({
      id: 18,
      name: "Unmapped sibling",
      sampleId: "missing",
      key: 45,
      pressKey: false,
    });
  for (const sample of p.samples.filter(
    (s) => s.id === "missing" || s.id === "target",
  ))
    delete sample.builtin;
  const session = new Session(p),
    writes: Uint8Array[] = [];
  let saves = 0;
  const dialogs: FileDialogs = {
    open: async () => undefined,
    save: async () => {
      saves++;
      return "/sounds.zip";
    },
    sounds: async () => undefined,
    unsaved: async () => "cancel",
  };
  const files = new ProjectFiles({
    session,
    dialogs,
    storage: {
      read: async () => new Uint8Array(),
      write: async (_path, data) => {
        writes.push(
          typeof data === "string" ? new TextEncoder().encode(data) : data,
        );
      },
    },
  });
  return { session, files, writes, saves: () => saves };
}
it("exports mapped custom target while warning that unavailable original audio was omitted", async () => {
  const { session, files, writes } = fixture(),
    before = session.snapshot();
  const result = await files.action("exportInstruments");
  expect(result.ok).toBe(true);
  expect([...readAudioZip(writes[0]).keys()]).toEqual(["replacement.ogg"]);
  expect(result.warnings.join(" ")).toMatch(/Lost.*映射.*省略/);
  expect(session.snapshot()).toEqual(before);
});
it("still rejects missing audio needed by an unmapped instrument sharing that sample", async () => {
  const { files, writes } = fixture("custom", true);
  await expect(files.action("exportInstruments")).rejects.toThrow(
    "缺少采样音频",
  );
  expect(writes).toHaveLength(0);
});
it("explains that builtin-only mapping needs no external resource pack", async () => {
  const { files, writes, saves } = fixture("builtin");
  const result = await files.action("exportInstruments");
  expect(result.ok).toBe(true);
  expect(result.warnings.join(" ")).toContain("无需导出");
  expect(writes).toHaveLength(0);
  expect(saves()).toBe(0);
});

it("reopens mapped project without asking for the missing original audio directory", async () => {
  const { encodeProject } = await import("../src/shared/io");
  const { noteEvent } = await import("../src/shared/timeline");
  const original = fixture("builtin").session.snapshot().project,
    bytes = encodeProject(original);
  const session = new Session(createEmptyProject());
  let soundPrompts = 0;
  const files = new ProjectFiles({
    session,
    dialogs: {
      open: async () => "/saved.nbproject",
      save: async () => undefined,
      unsaved: async () => "discard",
      sounds: async () => {
        soundPrompts++;
        return undefined;
      },
    },
    storage: {
      read: async (path) => {
        if (path === "/saved.nbproject") return bytes;
        throw new Error("Original sample not present");
      },
      write: async () => {},
    },
  });
  const result = await files.action("open");
  expect(result.ok).toBe(true);
  expect(soundPrompts).toBe(0);
  expect(session.snapshot().project).toEqual(original);
  expect(result.warnings.join(" ")).toContain("lost.wav");
  expect(
    noteEvent(session.snapshot().project, {
      id: "n",
      tick: 0,
      layer: 0,
      pitch: 66,
      instrument: 16,
      velocity: 100,
    }).sampleId,
  ).toBe("vanilla-0");
});

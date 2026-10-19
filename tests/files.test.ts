import { expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Session, createDemoProject } from "../src/shared/session";
import { ProjectFiles, atomicWrite, type FileDialogs } from "../src/main/files";

const dialogs = (patch: Partial<FileDialogs> = {}): FileDialogs => ({
  open: async () => undefined,
  save: async () => undefined,
  unsaved: async () => "cancel",
  sounds: async () => undefined,
  ...patch,
});
it("opens v2 bytes at any extension as the saved project without an NBS import prompt", async () => {
  const { encodeProject } = await import("../src/shared/io");
  const s = new Session();
  let imports = 0;
  const files = new ProjectFiles({
    session: s,
    dialogs: dialogs({ open: async () => "/project.bin" }),
    chooseImport: async () => {
      imports++;
      return "original";
    },
    storage: {
      read: async () => encodeProject(createDemoProject()),
      write: async () => {},
    },
  });
  expect((await files.action("open")).ok).toBe(true);
  expect(imports).toBe(0);
  expect(s.snapshot().document).toEqual({ path: "/project.bin", dirty: false });
});

it("does not export functional NBS definitions as missing audio", async () => {
  const { fromNbs, toNbs } = await import("../src/shared/io");
  const p = fromNbs(toNbs(createDemoProject()).data);
  p.nbs!.customInstruments = [
    { name: "Tempo Changer", file: "missing.ogg", key: 45, pressKey: 0 },
  ];
  let writes = 0;
  const files = new ProjectFiles({
    session: new Session(p),
    dialogs: dialogs(),
    storage: {
      read: async () => new Uint8Array(),
      write: async () => {
        writes++;
      },
    },
  });
  const result = await files.action("exportInstruments");
  expect(result.ok).toBe(true);
  expect(writes).toBe(0);
  expect(result.warnings.join(" ")).toMatch(/控制/);
});

it("opens control-bearing NBS without audio searches and discloses retained events in preview", async () => {
  const { fromNbs, toNbs } = await import("../src/shared/io");
  const p = fromNbs(toNbs(createDemoProject()).data);
  p.nbs!.customInstruments = [
    { name: "Show Save Popup", file: "missing.ogg", key: 45, pressKey: 0 },
  ];
  p.nbsEvents = [
    {
      id: "popup",
      tick: 16,
      layer: 0,
      instrument: 16,
      pitch: 66,
      velocity: 100,
      panning: 100,
      finePitch: 0,
      kind: "visual",
    },
  ];
  const bytes = toNbs(p).data,
    reads: string[] = [],
    previews: string[] = [];
  let writes = 0;
  const files = new ProjectFiles({
    session: new Session(),
    dialogs: dialogs({ open: async () => "/controls.nbs" }),
    chooseImport: async (summary) => {
      previews.push(...summary.warnings);
      return "original";
    },
    storage: {
      read: async (path) => {
        reads.push(path);
        return bytes;
      },
      write: async () => {
        writes++;
      },
    },
  });
  const result = await files.action("open");
  expect(result.ok).toBe(true);
  expect(result.snapshot.project.nbsEvents).toHaveLength(1);
  expect(result.snapshot.document.path).toBeUndefined();
  expect(reads).toEqual(["/controls.nbs"]);
  expect(writes).toBe(0);
  expect(result.warnings.join(" ")).not.toMatch(/采样尚未找到/);
  expect(previews.join(" ")).toContain("Show Save Popup 不会保存文件");
});
it("keeps an unsaved project and document identity when a write fails", async () => {
  const s = new Session(createDemoProject());
  s.dispatch({ type: "project:update", patch: { title: "Edited" } });
  const before = s.snapshot(),
    files = new ProjectFiles({
      session: s,
      dialogs: dialogs({ save: async () => "/fail.nbproject" }),
      storage: {
        read: async () => new Uint8Array(),
        write: async () => {
          throw Error("Disk full");
        },
      },
    });
  await expect(files.action("save")).rejects.toThrow("Disk full");
  expect(s.snapshot()).toEqual(before);
});
it("does not clear edits made while a save is in progress", async () => {
  const s = new Session(createDemoProject());
  let release!: () => void;
  const files = new ProjectFiles({
    session: s,
    dialogs: dialogs({ save: async () => "/saved.nbproject" }),
    storage: {
      read: async () => new Uint8Array(),
      write: async () =>
        new Promise<void>((r) => {
          release = r;
        }),
    },
  });
  const saving = files.action("save");
  await new Promise((r) => setTimeout(r, 0));
  s.dispatch({ type: "project:update", patch: { title: "later edit" } });
  release();
  await saving;
  expect(s.snapshot().document.dirty).toBe(true);
});
it("atomic write preserves the original file on rename failure and removes the temporary file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "studio-files-")),
    path = join(dir, "project.nbproject");
  try {
    await writeFile(path, "original");
    await expect(
      atomicWrite(path, "new", {
        rename: async () => {
          throw Error("locked");
        },
      }),
    ).rejects.toThrow("locked");
    expect(await readFile(path, "utf8")).toBe("original");
    expect(await readdir(dir)).toEqual(["project.nbproject"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("does not adopt an imported binary song path as an editable project save target", async () => {
  const { toNbs } = await import("../src/shared/io");
  const song = toNbs(createDemoProject()).data;
  const s = new Session();
  let saveRequests = 0;
  const written: string[] = [];
  const files = new ProjectFiles({
    session: s,
    dialogs: dialogs({
      open: async () => "/song.bin",
      save: async () => {
        saveRequests++;
        return "/safe.nbproject";
      },
      unsaved: async () => "discard",
    }),
    storage: {
      read: async () => song,
      write: async (path) => {
        written.push(path);
      },
    },
  });
  await files.action("open");
  expect(s.snapshot().document.path).toBeUndefined();
  await files.action("save");
  expect(saveRequests).toBe(1);
  expect(written).toEqual(["/safe.nbproject"]);
});
it("exports imported custom samples in a portable NBS-compatible ZIP pack", async () => {
  const { readAudioZip } = await import("../src/main/zip");
  const p = createDemoProject();
  p.samples.push({
    id: "custom",
    name: "Soft piano",
    originalPath: "Piano/soft.ogg",
    dataUrl: "data:audio/ogg;base64,T2dnUw==",
    rootKey: 66,
    volume: 100,
    panning: 100,
    color: "#aabbcc",
  });
  p.instruments.push({
    id: 16,
    name: "Soft piano",
    sampleId: "custom",
    key: 45,
    pressKey: false,
  });
  let output: Uint8Array | undefined;
  const files = new ProjectFiles({
    session: new Session(p),
    dialogs: dialogs({ save: async () => "/pack.zip" }),
    storage: {
      read: async () => new Uint8Array(),
      write: async (_p, data) => {
        output =
          typeof data === "string" ? new TextEncoder().encode(data) : data;
      },
    },
  });
  expect((await files.action("exportInstruments")).ok).toBe(true);
  expect([...readAudioZip(output!).keys()]).toEqual(["Piano/soft.ogg"]);
});
it("canceling an open or unsaved-close prompt preserves the current document and history", async () => {
  const s = new Session(createDemoProject());
  s.dispatch({ type: "project:update", patch: { title: "Unsaved work" } });
  const before = s.snapshot();
  const files = new ProjectFiles({ session: s, dialogs: dialogs() });
  expect((await files.action("open")).ok).toBe(false);
  expect(await files.confirmClose()).toBe(false);
  expect(s.snapshot()).toEqual(before);
});
it("a corrupt imported project cannot replace the current document", async () => {
  const s = new Session(createDemoProject());
  const before = s.snapshot();
  const files = new ProjectFiles({
    session: s,
    dialogs: dialogs({
      open: async () => "/corrupt.nbproject",
      unsaved: async () => "discard",
    }),
    storage: {
      read: async () => new TextEncoder().encode("{broken"),
      write: async () => {},
    },
  });
  await expect(files.action("open")).rejects.toThrow();
  expect(s.snapshot()).toEqual(before);
});

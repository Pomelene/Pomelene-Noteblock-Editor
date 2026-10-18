import { expect, it } from "vitest";
import { Session, createDemoProject } from "../src/shared/session";
import { ProjectFiles, type FileDialogs } from "../src/main/files";
import { toNbs, encodeProject } from "../src/shared/io";
const dialogs: FileDialogs = {
  open: async () => "/song.nbs",
  save: async () => undefined,
  unsaved: async () => "discard",
  sounds: async () => undefined,
};
const data = toNbs(createDemoProject()).data;
it("canceling import options leaves the current project, document and history untouched", async () => {
  const s = new Session();
  s.dispatch({ type: "project:update", patch: { title: "Keep me" } });
  const before = s.snapshot();
  const files = new ProjectFiles({
    session: s,
    dialogs,
    chooseImport: async (summary) => {
      expect(summary.fileName).toBe("song.nbs");
      return "cancel";
    },
    storage: { read: async () => data, write: async () => {} },
  });
  expect((await files.action("open")).ok).toBe(false);
  expect(s.snapshot()).toEqual(before);
  expect(files.isBusy).toBe(false);
});
it("smart and original choices are explicit, and smart metadata persists only for smart mode", async () => {
  for (const choice of ["smart", "original"] as const) {
    const s = new Session(),
      files = new ProjectFiles({
        session: s,
        dialogs,
        chooseImport: async () => choice,
        storage: { read: async () => data, write: async () => {} },
      });
    const result = await files.action("open");
    expect(result.ok).toBe(true);
    expect(!!result.snapshot.project.importOrganization).toBe(
      choice === "smart",
    );
    if (choice === "smart")
      expect(result.snapshot.project.patterns.length).toBeGreaterThan(1);
    else expect(result.snapshot.project.patterns.length).toBe(1);
  }
});
it("opening a complete project never reruns the NBS organizing algorithm or asks for its options", async () => {
  const s = new Session(),
    files = new ProjectFiles({
      session: s,
      dialogs,
      chooseImport: async () => {
        throw Error("Unexpected NBS options");
      },
      storage: {
        read: async () => encodeProject(createDemoProject()),
        write: async () => {},
      },
    });
  expect((await files.action("open")).ok).toBe(true);
});

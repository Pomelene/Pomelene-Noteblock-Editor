import { describe, it, expect } from "vitest";
import { ProjectFiles, type FileDialogs } from "../src/main/files";
import { Session, createDemoProject } from "../src/shared/session";
import { encodeProject, toNbs } from "../src/shared/io";
import type { FileAction } from "../src/shared/model";

const dialogs = (open: FileDialogs["open"]): FileDialogs => ({
  open,
  save: async () => undefined,
  unsaved: async () => "cancel",
  sounds: async () => undefined,
});
describe("start page file actions", () => {
  for (const [action, kind, project] of [
    ["openProject", "projectOnly", true],
    ["openSong", "song", false],
  ] as const) {
    it(`${action} routes the native filter and opens the intended document`, async () => {
      const session = new Session(),
        requested: string[] = [];
      let imports = 0;
      const files = new ProjectFiles({
        session,
        dialogs: dialogs(async (k) => {
          requested.push(k);
          return "/chosen.bin";
        }),
        storage: {
          read: async () =>
            project
              ? encodeProject(createDemoProject())
              : toNbs(createDemoProject()).data,
          write: async () => {},
        },
        chooseImport: async () => {
          imports++;
          return "original";
        },
      });
      const result = await files.action(action as FileAction);
      expect(result.ok).toBe(true);
      expect(requested).toEqual([kind]);
      expect(imports).toBe(project ? 0 : 1);
      expect(result.snapshot.document.path).toBe(
        project ? "/chosen.bin" : undefined,
      );
    });
    it(`${action} preserves the document when selection is canceled`, async () => {
      const session = new Session(),
        before = session.snapshot();
      const files = new ProjectFiles({
        session,
        dialogs: dialogs(async () => undefined),
      });
      expect((await files.action(action as FileAction)).ok).toBe(false);
      expect(session.snapshot()).toEqual(before);
    });
    it(`${action} rejects the wrong content without replacing the project`, async () => {
      const session = new Session(),
        before = session.snapshot();
      const files = new ProjectFiles({
        session,
        dialogs: dialogs(async () => "/wrong.bin"),
        storage: {
          read: async () =>
            project
              ? toNbs(createDemoProject()).data
              : encodeProject(createDemoProject()),
          write: async () => {},
        },
      });
      await expect(files.action(action as FileAction)).rejects.toThrow(
        project ? /工程/ : /歌曲/,
      );
      expect(session.snapshot()).toEqual(before);
    });
  }
});

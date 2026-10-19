import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const {
  removalMacro,
  collectOwnedFiles,
} = require("../scripts/installer-manifest.cjs");
describe("installer file ownership", () => {
  it("deletes only packaged files and removes directories without recursion", () => {
    const text = removalMacro([
      "app.exe",
      "resources/app.asar",
      "locales/en-US.pak",
    ]);
    expect(text).toContain(
      'Rename "$INSTDIR\\resources\\app.asar" "$PneStage\\resources\\app.asar"',
    );
    expect(text).toContain('RMDir "$INSTDIR\\resources"');
    expect(text).not.toMatch(/RMDir\s+\/r/i);
    expect(text).not.toMatch(/Delete[^\n]*\*/);
    expect(text).toContain("${UNINSTALL_FILENAME}");
  });
  it("escapes NSIS variable and string syntax from literal file names", () => {
    expect(removalMacro(["resources/cash$note.pak"])).toContain(
      "cash$$note.pak",
    );
  });
  it("rejects absolute, traversal, wildcard, control and case-colliding paths", () => {
    for (const name of [
      "../outside",
      "a/../b",
      "/root",
      "C:/app.exe",
      "a/*",
      "a/line\nfile",
      'a/quote"',
    ]) {
      expect(() => removalMacro([name])).toThrow();
    }
    expect(() => removalMacro(["App.exe", "app.exe"])).toThrow();
  });
  it("walks actual files and refuses linked directories", () => {
    const root = mkdtempSync(join(tmpdir(), "pne-owned-"));
    try {
      mkdirSync(join(root, "resources"));
      writeFileSync(join(root, "resources", "app.asar"), "test");
      expect(collectOwnedFiles(root)).toEqual(["resources/app.asar"]);
      symlinkSync(join(root, "resources"), join(root, "linked"), "junction");
      expect(() => collectOwnedFiles(root)).toThrow(/link|reparse/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

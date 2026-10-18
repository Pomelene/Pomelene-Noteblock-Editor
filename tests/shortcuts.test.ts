import { describe, expect, it } from "vitest";
import {
  resolveShortcut,
  filterShortcuts,
  type ShortcutEvent,
} from "../src/renderer/src/shortcuts";

const key = (
  key: string,
  patch: Partial<ShortcutEvent> = {},
): ShortcutEvent => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...patch,
});
describe("scoped shortcut resolution", () => {
  it("requires exact modifiers and accepts platform command keys", () => {
    expect(resolveShortcut(key("s", { ctrlKey: true }), "global")).toBe(
      "file:save",
    );
    expect(
      resolveShortcut(key("S", { metaKey: true, shiftKey: true }), "global"),
    ).toBe("file:saveAs");
    expect(
      resolveShortcut(key("s", { ctrlKey: true, altKey: true }), "global"),
    ).toBeUndefined();
    expect(
      resolveShortcut(key("s", { ctrlKey: true, metaKey: true }), "global"),
    ).toBeUndefined();
    expect(resolveShortcut(key("Tab", { ctrlKey: true }), "global")).toBe(
      "window:cycle",
    );
    expect(
      resolveShortcut(key("Tab", { ctrlKey: true, shiftKey: true }), "global"),
    ).toBe("window:cycle");
    expect(resolveShortcut(key("F4"), "global")).toBe("project:newPattern");
  });
  it("keeps destructive and transport globals from repeating", () => {
    for (const value of [
      key("n", { ctrlKey: true, repeat: true }),
      key(" ", { repeat: true }),
      key("F5", { repeat: true }),
    ])
      expect(resolveShortcut(value, "global")).toBeUndefined();
    expect(
      resolveShortcut(key("ArrowRight", { repeat: true }), "playlist"),
    ).toBe("move:right");
    expect(
      resolveShortcut(key("Backspace", { repeat: true }), "playlist"),
    ).toBeUndefined();
  });
  it("protects form controls, nested editable content and dialog descendants", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"])
      expect(
        resolveShortcut(key("Delete", { target: { tagName } }), "playlist"),
      ).toBeUndefined();
    for (const parentElement of [
      { isContentEditable: true },
      { getAttribute: (name: string) => (name === "role" ? "dialog" : null) },
    ])
      expect(
        resolveShortcut(
          key("p", { target: { tagName: "SPAN", parentElement } }),
          "pattern",
        ),
      ).toBeUndefined();
    expect(
      resolveShortcut(key("p", { target: { tagName: "BUTTON" } }), "playlist"),
    ).toBe("tool:draw");
    for (const keyName of ["Enter", " "]) {
      expect(
        resolveShortcut(
          key(keyName, {
            target: { tagName: "SPAN", parentElement: { tagName: "BUTTON" } },
          }),
          "global",
        ),
      ).toBeUndefined();
    }
  });
  it("resolves only implemented editor scope commands", () => {
    expect(resolveShortcut(key("F2"), "global")).toBe("source:rename");
    expect(resolveShortcut(key("Backspace"), "playlist")).toBe("snap:toggle");
    expect(resolveShortcut(key("Delete"), "playlist")).toBe("edit:delete");
    expect(resolveShortcut(key("d", { ctrlKey: true }), "playlist")).toBe(
      "selection:none",
    );
    expect(resolveShortcut(key("I", { shiftKey: true }), "pattern")).toBe(
      "selection:invert",
    );
    expect(resolveShortcut(key("T"), "playlist")).toBe("tool:mute");
    expect(resolveShortcut(key("T"), "pattern")).toBeUndefined();
    expect(resolveShortcut(key("g"), "pattern")).toBe("instrument:previous");
    expect(resolveShortcut(key("g"), "playlist")).toBeUndefined();
    expect(
      resolveShortcut(key("%", { code: "Digit5", shiftKey: true }), "playlist"),
    ).toBe("zoom:selection");
    expect(resolveShortcut(key("ArrowUp", { shiftKey: true }), "pattern")).toBe(
      "move:octaveUp",
    );
  });
  it("allows file commands from text fields while preserving text undo and dialog isolation", () => {
    const input = { tagName: "INPUT" };
    expect(
      resolveShortcut(key("s", { ctrlKey: true, target: input }), "global"),
    ).toBe("file:save");
    expect(
      resolveShortcut(key("z", { ctrlKey: true, target: input }), "global"),
    ).toBeUndefined();
    expect(
      resolveShortcut(
        key("s", {
          ctrlKey: true,
          target: {
            ...input,
            parentElement: {
              getAttribute: (name: string) =>
                name === "role" ? "dialog" : null,
            },
          },
        }),
        "global",
      ),
    ).toBeUndefined();
  });
  it("searches labels, scope and key descriptions used in help", () => {
    expect(filterShortcuts("复制").map((row) => row.action)).toContain(
      "edit:copy",
    );
    expect(filterShortcuts("Ctrl+C").map((row) => row.action)).toContain(
      "edit:copy",
    );
    expect(filterShortcuts("instrument").length).toBeGreaterThan(0);
    expect(filterShortcuts("does-not-exist")).toEqual([]);
  });
});

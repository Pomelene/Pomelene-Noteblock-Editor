import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/shared/session";
import { decodeProject, encodeProject, fromNbs, toNbs } from "../src/shared/io";
import { isProjectV2, PROJECT_V2_MAGIC } from "../src/shared/projectCodec";
import { crc32 } from "node:zlib";

function frame(payload: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(PROJECT_V2_MAGIC);
  const bytes = new Uint8Array(prefix.length + 8 + payload.length);
  bytes.set(prefix);
  const view = new DataView(bytes.buffer);
  view.setUint32(prefix.length, payload.length, true);
  view.setUint32(prefix.length + 4, crc32(payload), true);
  bytes.set(payload, prefix.length + 8);
  return bytes;
}

describe("versioned project container", () => {
  it("starts with a readable v2 label and retains embedded audio and extension data", () => {
    const project = createDemoProject();
    project.samples[0].dataUrl = "data:audio/wav;base64,UklGRg==";
    const extended = {
      ...project,
      extensions: { producer: { opaque: [1, "x"] } },
    };
    const bytes = encodeProject(extended);
    expect(
      new TextDecoder().decode(bytes.slice(0, PROJECT_V2_MAGIC.length)),
    ).toBe("PNE-PROJECT v2\n");
    expect(isProjectV2(bytes)).toBe(true);
    expect(decodeProject(bytes, "song.nbproject")).toEqual(extended);
  });

  it("rejects truncation, appended bytes and changed payloads", () => {
    const bytes = encodeProject(createDemoProject());
    expect(() => decodeProject(bytes.slice(0, -1), "a.nbproject")).toThrow(
      /长度|损坏/,
    );
    const trailing = new Uint8Array(bytes.length + 1);
    trailing.set(bytes);
    expect(() => decodeProject(trailing, "a.nbproject")).toThrow(/长度|损坏/);
    const changed = bytes.slice();
    changed[changed.length - 5] ^= 1;
    expect(() => decodeProject(changed, "a.nbproject")).toThrow(/校验|损坏/);
  });

  it("rejects oversized lengths, future versions and old JSON project dialects", () => {
    const bytes = encodeProject(createDemoProject());
    const changed = bytes.slice();
    new DataView(changed.buffer).setUint32(
      PROJECT_V2_MAGIC.length,
      0xffffffff,
      true,
    );
    expect(() => decodeProject(changed)).toThrow(/长度|限制/);
    const future = bytes.slice();
    future["PNE-PROJECT v".length] = "3".charCodeAt(0);
    expect(() => decodeProject(future)).toThrow(/版本/);
    for (const old of [
      createDemoProject(),
      { format: "note-block-project", version: 1, project: {} },
      {
        format: "note-block-project",
        version: 2,
        project: createDemoProject(),
      },
    ]) {
      expect(() =>
        decodeProject(new TextEncoder().encode(JSON.stringify(old))),
      ).toThrow(/v2|旧工程/);
    }
  });

  it("does not mistake NBS files for project containers", () => {
    const bytes = toNbs(createDemoProject()).data;
    expect(isProjectV2(bytes)).toBe(false);
    expect(decodeProject(bytes, "song.nbs")).toEqual(
      expect.objectContaining({ title: fromNbs(bytes).title }),
    );
    expect(() => decodeProject(bytes, "song.nbproject")).toThrow(/v2|工程/);
  });

  it("checks UTF-8, JSON and references even when the checksum is valid", () => {
    expect(() => decodeProject(frame(new Uint8Array([0xff])))).toThrow(/UTF-8/);
    expect(() => decodeProject(frame(new TextEncoder().encode("{")))).toThrow(
      /JSON/,
    );
    const project = createDemoProject();
    project.clips[0].sourceId = "absent-pattern";
    expect(() =>
      decodeProject(frame(new TextEncoder().encode(JSON.stringify(project)))),
    ).toThrow(/引用/);
    const malformed = JSON.stringify(createDemoProject()).replace(
      '"schema":2',
      '"schema":3',
    );
    expect(() =>
      decodeProject(frame(new TextEncoder().encode(malformed))),
    ).toThrow(/版本/);
    expect(() =>
      decodeProject(frame(new TextEncoder().encode('{"__proto__":{}}'))),
    ).toThrow();
  });

  it("handles non-zero Uint8Array byte offsets and truncated headers", () => {
    const project = createDemoProject();
    const bytes = encodeProject(project);
    const padded = new Uint8Array(bytes.length + 10);
    padded.set(bytes, 5);
    expect(decodeProject(padded.subarray(5, -5))).toEqual(project);
    expect(() =>
      decodeProject(bytes.slice(0, PROJECT_V2_MAGIC.length)),
    ).toThrow(/文件头/);
  });

  it("does not interpret a classic NBS length starting with a brace as JSON", () => {
    const classic = Buffer.concat([
      Buffer.from([123, 0, 0, 0]), // song length 123, no layers
      Buffer.alloc(16), // four empty strings
      Buffer.from([32, 3, 0, 10, 4]), // tempo 800, autosave settings, meter
      Buffer.alloc(24), // five counters, empty MIDI filename
      Buffer.alloc(3), // note terminator and custom definition count
    ]);
    expect(decodeProject(classic, "classic.nbs").patterns[0].length).toBe(123);
    expect(decodeProject(classic).patterns[0].length).toBe(123);
  });
});

import { expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readAudioZip, crc32 } from "../src/main/zip";

function zip(name: string, data: Buffer, method = 8): Uint8Array {
  const filename = Buffer.from(name),
    compressed = method === 8 ? deflateRawSync(data) : data,
    local = Buffer.alloc(30),
    central = Buffer.alloc(46),
    end = Buffer.alloc(22),
    crc = crc32(data);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}
it("reads upstream relative audio-only ZIP files without a definition manifest", () => {
  const entries = readAudioZip(
    zip("Piano/soft.ogg", Buffer.from("OggS audio")),
  );
  expect([...entries.keys()]).toEqual(["Piano/soft.ogg"]);
  expect(Buffer.from(entries.get("Piano/soft.ogg")!).toString()).toBe(
    "OggS audio",
  );
});
it("rejects traversal, absolute paths, integrity failures, and compression bombs", () => {
  for (const path of [
    "../bad.ogg",
    "C:/bad.wav",
    "/root.wav",
    "safe/../../bad.wav",
  ])
    expect(() => readAudioZip(zip(path, Buffer.from("x")))).toThrow();
  const damaged = zip("x.ogg", Buffer.from("abc"), 0);
  damaged[35] ^= 1;
  expect(() => readAudioZip(damaged)).toThrow();
  expect(() => readAudioZip(zip("bomb.wav", Buffer.alloc(1_000_000)))).toThrow(
    /ratio|压缩/,
  );
});
it("writes portable audio packs with original relative paths, Unicode and CRC", async () => {
  const { writeAudioZip } = await import("../src/main/zip");
  const source = new Map([
    ["钢琴/soft.ogg", new Uint8Array([79, 103, 103, 83])],
    ["kit/snare.wav", new Uint8Array([1, 2, 3])],
  ]);
  const result = readAudioZip(writeAudioZip(source));
  expect([...result.keys()]).toEqual([...source.keys()]);
  for (const [name, data] of source)
    expect([...result.get(name)!]).toEqual([...data]);
  expect(() =>
    writeAudioZip(new Map([["../bad.wav", new Uint8Array([1])]])),
  ).toThrow();
  expect(() =>
    writeAudioZip(
      new Map([
        ["A.wav", new Uint8Array([1])],
        ["a.wav", new Uint8Array([2])],
      ]),
    ),
  ).toThrow();
});

import type { Project } from "./model";
import { validateProject } from "./session";

/** File format version, independent of the application's version and model schema. */
export const PROJECT_V2_MAGIC = "PNE-PROJECT v2\n";
export const MAX_PROJECT_BYTES = 96 * 1024 * 1024;
const magic = new TextEncoder().encode(PROJECT_V2_MAGIC);
const family = new TextEncoder().encode("PNE-PROJECT");
const HEADER_BYTES = magic.length + 8;
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

/** CRC32 detects accidental corruption; this is not an authenticity signature. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return (
    bytes.length >= prefix.length &&
    prefix.every((value, i) => bytes[i] === value)
  );
}
export function isProjectV2(bytes: Uint8Array): boolean {
  return startsWith(bytes, magic);
}
export function isProjectContainer(bytes: Uint8Array): boolean {
  return startsWith(bytes, family);
}

export function encodeProjectV2(project: Project): Uint8Array {
  const text = JSON.stringify(validateProject(project));
  if (text.length > MAX_PROJECT_BYTES - HEADER_BYTES)
    throw new Error("工程文件超过 96 MiB 限制");
  const payload = new TextEncoder().encode(text);
  if (payload.length > MAX_PROJECT_BYTES - HEADER_BYTES)
    throw new Error("工程文件超过 96 MiB 限制");
  const bytes = new Uint8Array(HEADER_BYTES + payload.length);
  bytes.set(magic);
  const view = new DataView(bytes.buffer);
  view.setUint32(magic.length, payload.length, true);
  view.setUint32(magic.length + 4, crc32(payload), true);
  bytes.set(payload, HEADER_BYTES);
  return bytes;
}

export function decodeProjectV2(bytes: Uint8Array): Project {
  if (bytes.byteLength > MAX_PROJECT_BYTES)
    throw new Error("工程文件超过 96 MiB 限制");
  if (!isProjectV2(bytes))
    throw new Error("不支持此工程版本；仅支持 PNE 工程 v2");
  if (bytes.length < HEADER_BYTES) throw new Error("工程文件头损坏或长度不足");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(magic.length, true);
  if (
    length > MAX_PROJECT_BYTES - HEADER_BYTES ||
    length !== bytes.length - HEADER_BYTES
  )
    throw new Error("工程文件长度不匹配，文件可能损坏或不完整");
  const payload = bytes.subarray(HEADER_BYTES);
  if (crc32(payload) !== view.getUint32(magic.length + 4, true))
    throw new Error("工程数据校验失败，文件可能已损坏");
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(payload),
    );
  } catch {
    throw new Error("工程数据不是有效的 UTF-8 JSON，文件可能损坏");
  }
  return validateProject(parsed);
}

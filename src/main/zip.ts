import { inflateRawSync } from "node:zlib";

export const MAX_AUDIO_BYTES = 32 * 1024 * 1024,
  MAX_AUDIO_TOTAL = 60 * 1024 * 1024;
const audio = /\.(wav|ogg|mp3|flac|m4a|aac|webm)$/i;
export const isAudioPath = (path: string) => audio.test(path);
export function safeRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.length > 4096 ||
    normalized.startsWith("/") ||
    /[:\0]/.test(normalized) ||
    normalized.split("/").some((part) => part === "..")
  )
    throw new Error("采样路径必须为安全的相对路径");
  return normalized;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** Stored ZIP32: audio codecs are already compressed, so preserve bytes exactly. */
export function writeAudioZip(entries: Map<string, Uint8Array>): Uint8Array {
  if (!entries.size || entries.size > 4096)
    throw new Error("没有可导出的乐器采样，或采样数量超过限制");
  const local: Buffer[] = [],
    central: Buffer[] = [],
    names = new Set<string>();
  let offset = 0,
    total = 0;
  for (const [relative, data] of entries) {
    const name = safeRelativePath(relative),
      lower = name.toLowerCase(),
      filename = Buffer.from(name, "utf8");
    if (!isAudioPath(name) || names.has(lower))
      throw new Error("采样包路径无效或重名");
    if (
      data.length > MAX_AUDIO_BYTES ||
      (total += data.length) > MAX_AUDIO_TOTAL
    )
      throw new Error("采样包超过大小限制");
    names.add(lower);
    const header = Buffer.alloc(30),
      directory = Buffer.alloc(46),
      checksum = crc32(data);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(header, filename, Buffer.from(data));
    central.push(directory, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
/** Reads ordinary ZIP32 instrument packs in memory. No archive content is ever executed or extracted. */
export function readAudioZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length > 64 * 1024 * 1024) throw new Error("ZIP 超过 64 MiB 限制");
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > b.length)
      throw new Error("ZIP 数据截断");
  };
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (
      b.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + b.readUInt16LE(i + 20) === b.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("ZIP 目录不存在");
  if (
    b.readUInt16LE(end + 4) ||
    b.readUInt16LE(end + 6) ||
    b.readUInt16LE(end + 8) !== b.readUInt16LE(end + 10)
  )
    throw new Error("不支持分卷 ZIP");
  const entries = b.readUInt16LE(end + 10),
    centralSize = b.readUInt32LE(end + 12),
    centralStart = b.readUInt32LE(end + 16);
  if (
    entries > 4096 ||
    entries === 65535 ||
    centralSize === 0xffffffff ||
    centralStart === 0xffffffff
  )
    throw new Error("不支持超大 ZIP / ZIP64");
  need(centralStart, centralSize);
  if (centralStart + centralSize > end) throw new Error("ZIP 目录范围无效");
  let pos = centralStart,
    total = 0;
  const result = new Map<string, Uint8Array>(),
    names = new Set<string>();
  for (let index = 0; index < entries; index++) {
    need(pos, 46);
    if (b.readUInt32LE(pos) !== 0x02014b50) throw new Error("ZIP 目录损坏");
    const flags = b.readUInt16LE(pos + 8),
      method = b.readUInt16LE(pos + 10),
      crc = b.readUInt32LE(pos + 16),
      packed = b.readUInt32LE(pos + 20),
      size = b.readUInt32LE(pos + 24),
      nameLength = b.readUInt16LE(pos + 28),
      extra = b.readUInt16LE(pos + 30),
      comment = b.readUInt16LE(pos + 32),
      local = b.readUInt32LE(pos + 42);
    need(pos + 46, nameLength + extra + comment);
    const nameBytes = b.subarray(pos + 46, pos + 46 + nameLength),
      name = safeRelativePath(nameBytes.toString("utf8")),
      mode = b.readUInt32LE(pos + 38) >>> 16;
    if ((mode & 0xf000) === 0xa000) throw new Error("ZIP 不支持符号链接");
    if (flags & 1 || ![0, 8].includes(method))
      throw new Error("ZIP 加密或压缩方法不受支持");
    if (
      size === 0xffffffff ||
      packed === 0xffffffff ||
      local === 0xffffffff ||
      size > MAX_AUDIO_BYTES ||
      (total += size) > MAX_AUDIO_TOTAL
    )
      throw new Error("ZIP 音频超过大小限制");
    if (size > Math.max(1, packed) * 200)
      throw new Error("ZIP 压缩 ratio 超出安全限制");
    const lower = name.toLowerCase();
    if (names.has(lower)) throw new Error("ZIP 包含重名文件");
    names.add(lower);
    need(local, 30);
    if (b.readUInt32LE(local) !== 0x04034b50) throw new Error("ZIP 文件头无效");
    if (
      b.readUInt16LE(local + 6) !== flags ||
      b.readUInt16LE(local + 8) !== method
    )
      throw new Error("ZIP 文件头与目录不匹配");
    const localName = b.readUInt16LE(local + 26),
      localExtra = b.readUInt16LE(local + 28),
      start = local + 30 + localName + localExtra;
    need(local + 30, localName + localExtra);
    need(start, packed);
    if (
      !b.subarray(local + 30, local + 30 + localName).equals(nameBytes) ||
      start + packed > centralStart
    )
      throw new Error("ZIP 文件范围无效");
    if (isAudioPath(name)) {
      const compressed = b.subarray(start, start + packed),
        data =
          method === 8
            ? inflateRawSync(compressed, { maxOutputLength: MAX_AUDIO_BYTES })
            : Buffer.from(compressed);
      if (data.length !== size || crc32(data) !== crc)
        throw new Error("ZIP 音频完整性校验失败");
      result.set(name, data);
    }
    pos += 46 + nameLength + extra + comment;
  }
  if (pos !== centralStart + centralSize) throw new Error("ZIP 目录长度无效");
  if (!result.size) throw new Error("ZIP 中没有受支持的音频采样");
  return result;
}

import type { Note, Project } from "./project";

export interface NbsLayer {
  name: string;
  locked: number;
  volume: number;
  panning: number;
}
export interface NbsCustomInstrument {
  name: string;
  file: string;
  key: number;
  pressKey: number;
}
export interface NbsMetadata {
  /** Original file's custom-instrument base; editor note IDs always use 16. */
  version: number;
  vanillaInstrumentCount: number;
  author: string;
  originalAuthor: string;
  description: string;
  autosave: number;
  autosaveMinutes: number;
  timeSignature: number;
  minutesSpent: number;
  leftClicks: number;
  rightClicks: number;
  notesAdded: number;
  notesRemoved: number;
  midiFile: string;
  loop: number;
  maxLoopCount: number;
  loopStartTick: number;
  layers: NbsLayer[];
  customInstruments: NbsCustomInstrument[];
  rawStrings: Record<string, { text: string; bytes: number[] }>;
  warnings: string[];
}
export type NbsProject = Project & { nbs?: NbsMetadata };
const MAX_BYTES = 32 * 1024 * 1024,
  MAX_STRING = 1024 * 1024,
  MAX_NOTES = 100_000;
function integer(n: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`NBS ${label} out of range (${min}–${max})`);
  return n;
}
const defaultLayer = (): NbsLayer => ({
  name: "",
  locked: 0,
  volume: 100,
  panning: 100,
});
const VANILLA_INSTRUMENTS = 16;

function exportTiming(project: Project): { tempo: number; signature: number } {
  const meter = /^(\d+)\/(2|4|8|16)$/.exec(project.meter);
  if (!meter) throw new Error("NBS cannot represent this meter");
  const signature = integer(
    (Number(meter[1]) * 4) / Number(meter[2]),
    1,
    32,
    "meter in quarter notes",
  );
  if (
    !Number.isFinite(project.bpm) ||
    project.bpm < 0.15 ||
    project.bpm > 9830.25
  )
    throw new Error("NBS tempo out of range (0.15–9830.25 BPM)");
  return {
    signature,
    tempo: integer(Math.round(project.bpm / 0.15), 1, 65535, "tempo"),
  };
}

/** Disclose representable timing conversions before writing a version 5 file. */
export function getNbsExportWarnings(project: Project): string[] {
  const { tempo, signature } = exportTiming(project);
  const warnings: string[] = [];
  if (Math.abs(tempo * 0.15 - project.bpm) > 1e-8)
    warnings.push(
      `NBS tempo is rounded from ${project.bpm} BPM to ${Number((tempo * 0.15).toFixed(2))} BPM (0.15 BPM precision).`,
    );
  if (project.meter !== `${signature}/4`)
    warnings.push(
      `NBS stores ${project.meter} as ${signature}/4, preserving bar length in quarter notes.`,
    );
  return warnings;
}

/** NBS ticks are retained exactly. The editor has four ticks/quarter, hence BPM = ticks/sec * 15. */
export function decodeNbs(data: Uint8Array): NbsProject {
  if (!(data instanceof Uint8Array) || data.byteLength > MAX_BYTES)
    throw new Error("NBS file exceeds 32 MiB limit");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;
  const need = (n: number) => {
    if (pos + n > data.length) throw new Error(`Truncated NBS at byte ${pos}`);
  };
  const byte = () => {
    need(1);
    return view.getUint8(pos++);
  };
  const short = () => {
    need(2);
    const n = view.getUint16(pos, true);
    pos += 2;
    return n;
  };
  const signed = () => {
    const n = short();
    return n > 32767 ? n - 65536 : n;
  };
  const int = () => {
    need(4);
    const n = view.getInt32(pos, true);
    pos += 4;
    return n;
  };
  const rawStrings: NbsMetadata["rawStrings"] = {};
  const str = (key: string) => {
    const length = integer(int(), 0, MAX_STRING, "string length");
    need(length);
    const bytes = data.subarray(pos, pos + length);
    pos += length;
    // Original OpenNBS writes ord(character) as a byte. Other producers use UTF-8.
    // Preserve the actual bytes independently, so either convention survives saving.
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = Buffer.from(bytes).toString("latin1");
    }
    rawStrings[key] = { text, bytes: Array.from(bytes) };
    return text;
  };
  const first = short(),
    version = first === 0 ? byte() : 0;
  if (first === 0 && (version < 1 || version > 5))
    throw new Error(`Unsupported NBS version ${version}`);
  const vanillaInstrumentCount = version
    ? integer(byte(), 1, VANILLA_INSTRUMENTS, "vanilla instrument count")
    : 10;
  const length = version === 0 ? first : version >= 3 ? short() : 0;
  const height = integer(short(), 0, 4096, "layer count");
  const title = str("title"),
    author = str("author"),
    originalAuthor = str("originalAuthor"),
    description = str("description");
  const tempo = integer(short(), 1, 65535, "tempo"),
    autosave = byte(),
    autosaveMinutes = byte();
  const timeSignature = integer(byte(), 1, 32, "time signature");
  const minutesSpent = int(),
    leftClicks = int(),
    rightClicks = int(),
    notesAdded = int(),
    notesRemoved = int(),
    midiFile = str("midiFile");
  const loop = version >= 4 ? integer(byte(), 0, 1, "loop") : 0;
  const maxLoopCount = version >= 4 ? byte() : 0,
    loopStartTick = version >= 4 ? short() : 0;
  const notes: Note[] = [];
  let tick = -1;
  for (;;) {
    const jump = short();
    if (!jump) break;
    tick = integer(tick + jump, 0, 1_048_575, "tick");
    let layer = -1;
    for (;;) {
      const delta = short();
      if (!delta) break;
      layer = integer(layer + delta, 0, height - 1, "note layer");
      const instrument = byte(),
        pitch = integer(byte(), 0, 87, "key") + 21;
      const velocity = version >= 4 ? integer(byte(), 0, 100, "velocity") : 100;
      const panning =
        version >= 4 ? integer(byte(), 0, 200, "note panning") : 100;
      const finePitch = version >= 4 ? signed() : 0;
      if (notes.length >= MAX_NOTES)
        throw new Error("NBS exceeds 100,000 notes");
      notes.push({
        id: `nbs-note-${notes.length}`,
        tick,
        layer,
        instrument,
        pitch,
        velocity,
        panning,
        finePitch,
      });
    }
  }
  const layers: NbsLayer[] = [];
  // OpenNBS permits older producers to stop after notes or after complete layers.
  // Once a layer section starts, every declared layer must be present.
  if (pos === data.length)
    for (let i = 0; i < height; i++) layers.push(defaultLayer());
  else
    for (let i = 0; i < height; i++)
      layers.push({
        name: str(`layer.${i}`),
        locked: version >= 4 ? integer(byte(), 0, 2, "layer lock") : 0,
        volume: integer(byte(), 0, 100, "layer volume"),
        panning: version >= 2 ? integer(byte(), 0, 200, "layer panning") : 100,
      });
  const customCount = pos === data.length ? 0 : byte(),
    customInstruments: NbsCustomInstrument[] = [];
  for (let i = 0; i < customCount; i++)
    customInstruments.push({
      name: str(`custom.${i}.name`),
      file: str(`custom.${i}.file`),
      key: byte(),
      pressKey: integer(byte(), 0, 1, "custom press key"),
    });
  if (pos !== data.length)
    throw new Error(
      `Unsupported trailing NBS data (${data.length - pos} bytes)`,
    );
  for (const n of notes) {
    if (n.instrument >= vanillaInstrumentCount + customCount)
      throw new Error(`NBS instrument ${n.instrument} has no definition`);
    if (n.instrument >= vanillaInstrumentCount)
      n.instrument = integer(
        n.instrument + VANILLA_INSTRUMENTS - vanillaInstrumentCount,
        0,
        255,
        "remapped instrument",
      );
  }
  const warnings: string[] = [];
  if (customCount)
    warnings.push(
      "自定义音色定义已保留；外部采样加载尚未接入，缺少采样的音色无法预听。",
    );
  if (loop)
    warnings.push(
      "NBS 循环设置已保留用于导出；当前编排播放不自动执行 NBS 循环。",
    );
  if (layers.some((l) => l.volume !== 100 || l.panning !== 100 || l.locked))
    warnings.push(
      "图层附加设置已保留；音量和声像参与预听，图层锁定目前不限制编辑。",
    );
  const patternLength = notes.reduce(
    (end, n) => Math.max(end, n.tick + 1),
    Math.max(1, length),
  );
  return {
    title,
    bpm: tempo * 0.15,
    meter: `${timeSignature}/4`,
    patterns: [
      {
        id: "nbs-pattern",
        name: title || "Imported NBS",
        length: patternLength,
        notes,
      },
    ],
    clips: [{ id: "nbs-clip", patternId: "nbs-pattern", tick: 0, track: 0 }],
    nbs: {
      version,
      vanillaInstrumentCount,
      author,
      originalAuthor,
      description,
      autosave,
      autosaveMinutes,
      timeSignature,
      minutesSpent,
      leftClicks,
      rightClicks,
      notesAdded,
      notesRemoved,
      midiFile,
      loop,
      maxLoopCount,
      loopStartTick,
      layers,
      customInstruments,
      rawStrings,
      warnings,
    },
  };
}

/** Writes version 5. Clips are rendered in full; colliding notes get extra layers with copied settings. */
export function encodeNbs(project: Project): Uint8Array {
  const meta = (project as NbsProject).nbs;
  const { signature, tempo } = exportTiming(project);
  const vanilla = VANILLA_INSTRUMENTS;
  const custom = meta?.customInstruments ?? [];
  integer(custom.length, 0, 255, "custom instrument count");
  const layers = (meta?.layers ?? []).map((l) => ({ ...l }));
  integer(layers.length, 0, 4096, "layer count");
  const notes: Note[] = [],
    occupied = new Map<number, Set<number>>();
  let length = 0;
  const patterns = new Map(project.patterns.map((p) => [p.id, p]));
  integer(project.clips.length, 0, 10000, "clip count");
  // Reserve all original layers before allocating collision lanes.
  for (const p of project.patterns) {
    if (p.layerCount !== undefined) {
      integer(p.layerCount, 1, 4096, "layer count");
      while (layers.length < p.layerCount) layers.push(defaultLayer());
    }
  }
  for (const p of project.patterns)
    for (const n of p.notes) {
      integer(n.layer, 0, 4095, "layer");
      while (layers.length <= n.layer) layers.push(defaultLayer());
    }
  const overflow = new Map<number, number[]>();
  for (const clip of project.clips) {
    const pattern = patterns.get(clip.patternId);
    if (!pattern) throw new Error("NBS clip references a missing pattern");
    integer(clip.tick, 0, 65535, "clip tick");
    integer(pattern.length, 1, 65535, "pattern length");
    length = Math.max(length, clip.tick + pattern.length);
    integer(length, 0, 65535, "song length");
    for (const n of pattern.notes) {
      integer(n.tick, 0, pattern.length - 1, "note tick");
      integer(n.pitch, 21, 108, "pitch");
      integer(
        n.instrument,
        0,
        Math.min(255, vanilla + custom.length - 1),
        "instrument",
      );
      integer(n.velocity, 0, 100, "velocity");
      integer(n.panning ?? 100, 0, 200, "panning");
      integer(n.finePitch ?? 0, -32768, 32767, "fine pitch");
      const tick = clip.tick + n.tick,
        used = occupied.get(tick) ?? new Set<number>();
      occupied.set(tick, used);
      let layer = n.layer;
      if (used.has(layer)) {
        const candidates = overflow.get(n.layer) ?? [];
        layer = candidates.find((x) => !used.has(x)) ?? layers.length;
        if (layer === layers.length) {
          integer(layer, 0, 4095, "collision layer");
          layers.push({ ...layers[n.layer] });
          candidates.push(layer);
          overflow.set(n.layer, candidates);
        }
      }
      used.add(layer);
      notes.push({ ...n, tick, layer });
      if (notes.length > MAX_NOTES)
        throw new Error("NBS export exceeds 100,000 notes");
    }
  }
  notes.sort((a, b) => a.tick - b.tick || a.layer - b.layer);
  const chunks: Buffer[] = [];
  let size = 0;
  const push = (b: Buffer) => {
    size += b.length;
    if (size > MAX_BYTES) throw new Error("NBS export exceeds 32 MiB");
    chunks.push(b);
  };
  const byte = (n: number) => {
    integer(n, 0, 255, "byte");
    push(Buffer.from([n]));
  };
  const short = (n: number) => {
    integer(n, 0, 65535, "short");
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n);
    push(b);
  };
  const int = (n: number) => {
    integer(n, -2147483648, 2147483647, "integer");
    const b = Buffer.alloc(4);
    b.writeInt32LE(n);
    push(b);
  };
  const str = (key: string, value: string) => {
    if (typeof value !== "string") throw new Error("Invalid NBS string");
    const raw = meta?.rawStrings?.[key];
    const b =
      raw?.text === value
        ? Buffer.from(raw.bytes.map((n) => integer(n, 0, 255, "string byte")))
        : Buffer.from(value, "utf8");
    integer(b.length, 0, MAX_STRING, "string length");
    int(b.length);
    push(b);
  };
  short(0);
  byte(5);
  byte(vanilla);
  short(length);
  short(layers.length);
  str("title", project.title);
  str("author", meta?.author ?? "");
  str("originalAuthor", meta?.originalAuthor ?? "");
  str("description", meta?.description ?? "");
  short(tempo);
  byte(meta?.autosave ?? 0);
  byte(meta?.autosaveMinutes ?? 10);
  byte(signature);
  for (const n of [
    meta?.minutesSpent,
    meta?.leftClicks,
    meta?.rightClicks,
    meta?.notesAdded,
    meta?.notesRemoved,
  ])
    int(n ?? 0);
  str("midiFile", meta?.midiFile ?? "");
  byte(integer(meta?.loop ?? 0, 0, 1, "loop"));
  byte(meta?.maxLoopCount ?? 0);
  short(meta?.loopStartTick ?? 0);
  let previousTick = -1,
    index = 0;
  while (index < notes.length) {
    const tick = notes[index].tick;
    short(tick - previousTick);
    previousTick = tick;
    let previousLayer = -1;
    while (index < notes.length && notes[index].tick === tick) {
      const n = notes[index++];
      short(n.layer - previousLayer);
      previousLayer = n.layer;
      byte(n.instrument);
      byte(n.pitch - 21);
      byte(n.velocity);
      byte(n.panning ?? 100);
      short((n.finePitch ?? 0) & 65535);
    }
    short(0);
  }
  short(0);
  layers.forEach((l, i) => {
    str(`layer.${i}`, l.name);
    byte(integer(l.locked, 0, 2, "layer lock"));
    byte(integer(l.volume, 0, 100, "layer volume"));
    byte(integer(l.panning, 0, 200, "layer pan"));
  });
  byte(custom.length);
  custom.forEach((c, i) => {
    str(`custom.${i}.name`, c.name);
    str(`custom.${i}.file`, c.file);
    byte(c.key);
    byte(integer(c.pressKey, 0, 1, "press key"));
  });
  return Buffer.concat(chunks);
}

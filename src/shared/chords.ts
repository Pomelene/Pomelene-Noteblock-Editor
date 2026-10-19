import type { Note, Pattern } from "./model";

export const CHORD_QUALITIES = {
  major: { label: "大三和弦", suffix: "", intervals: [0, 4, 7] },
  minor: { label: "小三和弦", suffix: "m", intervals: [0, 3, 7] },
  dom7: { label: "属七和弦", suffix: "7", intervals: [0, 4, 7, 10] },
  maj7: { label: "大七和弦", suffix: "maj7", intervals: [0, 4, 7, 11] },
  min7: { label: "小七和弦", suffix: "m7", intervals: [0, 3, 7, 10] },
  sus2: { label: "挂二和弦", suffix: "sus2", intervals: [0, 2, 7] },
  sus4: { label: "挂四和弦", suffix: "sus4", intervals: [0, 5, 7] },
  dim: { label: "减三和弦", suffix: "dim", intervals: [0, 3, 6] },
  aug: { label: "增三和弦", suffix: "aug", intervals: [0, 4, 8] },
} as const;
export const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
export type ChordQuality = keyof typeof CHORD_QUALITIES;
export type ChordExtension = "none" | "6" | "9" | "11" | "13";
export type ChordMode = "block" | "up" | "down";
export interface ChordSpec {
  root: number;
  quality: ChordQuality;
  inversion?: number;
  extension?: ChordExtension;
  bass?: number | "root" | null;
  spread?: boolean;
}
export interface ChordPlacement {
  spec: ChordSpec;
  tick: number;
  instrument: number;
  velocity: number;
  layer: number;
  mode: ChordMode;
  stepTicks: number;
  replace: boolean;
}
function integer(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw Error(`${label}无效`);
  return value;
}
export function chordPitches(spec: ChordSpec): number[] {
  integer(spec.root, 21, 108, "和弦根音");
  if (!Object.hasOwn(CHORD_QUALITIES, spec.quality))
    throw Error("和弦类型无效");
  const inversion = integer(spec.inversion ?? 0, 0, 3, "转位");
  if (spec.spread !== undefined && typeof spec.spread !== "boolean")
    throw Error("排列设置无效");
  const added: Record<ChordExtension, number | null> = {
    none: null,
    "6": 9,
    "9": 14,
    "11": 17,
    "13": 21,
  };
  const extension = spec.extension ?? "none";
  if (!Object.hasOwn(added, extension)) throw Error("附加音无效");
  const intervals: number[] = [...CHORD_QUALITIES[spec.quality].intervals];
  if (added[extension] !== null && !intervals.includes(added[extension]!))
    intervals.push(added[extension]!);
  const pitches = intervals
    .sort((a, b) => a - b)
    .map((interval) => spec.root + interval);
  for (let i = 0; i < inversion; i++) {
    pitches.push(pitches.shift()! + 12);
    pitches.sort((a, b) => a - b);
  }
  if (spec.spread && pitches.length > 2) {
    pitches[1] += 12;
    pitches.sort((a, b) => a - b);
  }
  if (spec.bass !== undefined && spec.bass !== null) {
    const bass =
      spec.bass === "root" ? spec.root % 12 : integer(spec.bass, 0, 11, "低音");
    let pitch = pitches[0] - 1;
    while (((pitch % 12) + 12) % 12 !== bass) pitch--;
    pitches.unshift(pitch);
  }
  if (pitches.some((pitch) => pitch < 21 || pitch > 108))
    throw Error("和弦超出 NBS 音高 21–108，请降低音区或转位");
  return [...new Set(pitches)].sort((a, b) => a - b);
}
export function chordName(spec: ChordSpec): string {
  const pitches = chordPitches(spec);
  const added =
    spec.extension && spec.extension !== "none" ? `(add${spec.extension})` : "";
  return `${NOTE_NAMES[spec.root % 12]}${CHORD_QUALITIES[spec.quality].suffix}${added}${pitches[0] % 12 !== spec.root % 12 ? "/" + NOTE_NAMES[pitches[0] % 12] : ""}`;
}
export function diatonicChords(
  tonic: number,
  scale: "major" | "minor",
  octave: number,
): { root: number; quality: ChordQuality; degree: string }[] {
  integer(tonic, 0, 11, "调性根音");
  integer(octave, 1, 6, "音区");
  if (scale !== "major" && scale !== "minor") throw Error("调式无效");
  const major = scale === "major";
  const steps = major ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const qualities: ChordQuality[] = major
    ? ["major", "minor", "minor", "major", "major", "minor", "dim"]
    : ["minor", "dim", "major", "minor", "minor", "major", "major"];
  const degrees = major
    ? ["I", "ii", "iii", "IV", "V", "vi", "vii°"]
    : ["i", "ii°", "III", "iv", "v", "VI", "VII"];
  return steps.map((step, i) => ({
    root: 12 * (octave + 1) + tonic + step,
    quality: qualities[i],
    degree: degrees[i],
  }));
}
export function chordEvents(
  spec: ChordSpec,
  options: { tick: number; mode: ChordMode; stepTicks: number },
): { tick: number; pitch: number }[] {
  const { tick, mode, stepTicks } = options;
  if (
    !Number.isFinite(tick) ||
    tick < 0 ||
    tick > 1_048_575 ||
    !Number.isFinite(stepTicks) ||
    stepTicks <= 0 ||
    stepTicks >= 1_048_576
  )
    throw Error("和弦时间设置无效");
  if (!["block", "up", "down"].includes(mode)) throw Error("和弦放置方式无效");
  const pitches = chordPitches(spec);
  if (mode === "down") pitches.reverse();
  const notes = pitches.map((pitch, i) => ({
    pitch,
    tick: tick + (mode === "block" ? 0 : i * stepTicks),
  }));
  if (notes.some((note) => note.tick > 1_048_575))
    throw Error("和弦超出工程时间范围");
  return notes;
}

export function planChordPlacement(
  pattern: Pattern,
  request: ChordPlacement,
): { notes: Omit<Note, "id">[]; removeIds: Set<string> } {
  integer(request.layer, 0, 4095, "起始图层");
  integer(request.instrument, 0, 255, "音色");
  integer(request.velocity, 1, 100, "力度");
  if (typeof request.replace !== "boolean") throw Error("和弦替换设置无效");
  const events = chordEvents(request.spec, request);
  const ticks = [...new Set(events.map((event) => event.tick))].sort(
    (a, b) => a - b,
  );
  const occupied = new Map(ticks.map((tick) => [tick, new Set<number>()]));
  const removeIds = new Set<string>();
  for (const note of pattern.notes) {
    const tick = ticks.find((tick) => Math.abs(tick - note.tick) < 1e-7);
    if (tick === undefined) continue;
    if (
      request.replace &&
      note.instrument === request.instrument &&
      !pattern.layers[note.layer]?.locked
    )
      removeIds.add(note.id);
    else occupied.get(tick)!.add(note.layer);
  }
  const notes = events.map((event) => {
    const used = occupied.get(event.tick)!;
    let layer = request.layer;
    while (used.has(layer) || pattern.layers[layer]?.locked) layer++;
    integer(layer, 0, 4095, "可用图层（上限 4096）");
    used.add(layer);
    return {
      ...event,
      layer,
      instrument: request.instrument,
      velocity: request.velocity,
      panning: 100,
      finePitch: 0,
    };
  });
  return { notes, removeIds };
}

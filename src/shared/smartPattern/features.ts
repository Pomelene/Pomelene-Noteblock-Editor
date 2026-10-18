import type { Layer, Note, Pattern, Project } from "../model";

export interface Lane {
  sourceLayer: number;
  instrument: number;
  notes: Note[];
  onsets: Set<number>;
  medianPitch: number;
  pitchMotion: number;
  authoredName?: string;
  /** A hypothesis only; never authorizes changing or suppressing a trigger. */
  percussionHint: boolean;
}

const genericNames =
  /^(?:layer|图层|声部|track|音轨|instrument|乐器|untitled|unnamed|default|未命名)$/i;
const builtinNames = new Set([
  "harp",
  "piano",
  "bass",
  "bass drum",
  "basedrum",
  "snare",
  "snare drum",
  "hat",
  "hi hat",
  "hi-hat",
  "click",
  "guitar",
  "flute",
  "bell",
  "chime",
  "xylophone",
  "iron xylophone",
  "cow bell",
  "cowbell",
  "didgeridoo",
  "bit",
  "banjo",
  "pling",
  "竖琴",
  "钢琴",
  "贝斯",
  "底鼓",
  "军鼓",
  "踩镲",
  "吉他",
  "长笛",
  "钟",
  "木琴",
]);

export function authoredLayerName(
  name: string,
  instrumentNames: Set<string>,
): string | undefined {
  const base = name
    .trim()
    .replace(/(?:[\s_\-#]*(?:\(?\d+\)?|[一二三四五六七八九十]+))$/u, "")
    .trim();
  const folded = base.toLocaleLowerCase("en-US");
  if (
    !base ||
    genericNames.test(base) ||
    builtinNames.has(folded) ||
    instrumentNames.has(folded)
  )
    return undefined;
  return base;
}

export function noteOrder(a: Note, b: Note): number {
  return (
    a.tick - b.tick ||
    a.layer - b.layer ||
    a.instrument - b.instrument ||
    a.pitch - b.pitch ||
    a.velocity - b.velocity ||
    (a.panning ?? -1) - (b.panning ?? -1) ||
    (a.finePitch ?? -Infinity) - (b.finePitch ?? -Infinity)
  );
}

/** IDs are deliberately absent. Optional expressive values retain their raw representation. */
export function noteTuple(
  note: Note,
  tick: number,
  sourceLayer: number,
): unknown[] {
  return [
    tick,
    sourceLayer,
    note.pitch,
    note.instrument,
    note.velocity,
    note.panning ?? null,
    note.finePitch ?? null,
  ];
}

export function layerTuple(layer: Layer): unknown[] {
  return [
    layer.name,
    layer.volume,
    layer.panning,
    layer.locked,
    layer.muted,
    layer.solo,
  ];
}

export function extractLanes(project: Project, pattern: Pattern): Lane[] {
  const instrumentNames = new Set(
    project.instruments.map((i) => i.name.trim().toLocaleLowerCase("en-US")),
  );
  const lanes = new Map<string, Lane>();
  for (const note of pattern.notes) {
    const key = `${note.layer}:${note.instrument}`;
    let lane = lanes.get(key);
    if (!lane) {
      lane = {
        sourceLayer: note.layer,
        instrument: note.instrument,
        notes: [],
        onsets: new Set(),
        medianPitch: 0,
        pitchMotion: 0,
        authoredName: authoredLayerName(
          pattern.layers[note.layer].name,
          instrumentNames,
        ),
        percussionHint: false,
      };
      lanes.set(key, lane);
    }
    lane.notes.push(note);
    lane.onsets.add(note.tick);
  }
  for (const lane of lanes.values()) {
    lane.notes.sort(noteOrder);
    const pitches = lane.notes.map((n) => n.pitch).sort((a, b) => a - b);
    lane.medianPitch = pitches[Math.floor(pitches.length / 2)];
    lane.pitchMotion = pitches[pitches.length - 1] - pitches[0];
    // Vanilla IDs alone are insufficient: resource packs can repurpose Click.
    lane.percussionHint =
      [2, 3, 4].includes(lane.instrument) && lane.pitchMotion <= 2;
  }
  return [...lanes.values()].sort(
    (a, b) => a.sourceLayer - b.sourceLayer || a.instrument - b.instrument,
  );
}

export interface BarFeature {
  notes: Note[];
  chroma: number[];
  instruments: Set<number>;
  rhythm: Set<number>;
  first: number;
  last: number;
}

export function extractBars(
  notes: Note[],
  barTicks: number,
  count: number,
): BarFeature[] {
  const bars: BarFeature[] = Array.from({ length: count }, () => ({
    notes: [],
    chroma: Array(12).fill(0),
    instruments: new Set(),
    rhythm: new Set(),
    first: Infinity,
    last: -Infinity,
  }));
  for (const note of notes) {
    const index = Math.floor(note.tick / barTicks),
      bar = bars[index];
    if (!bar) continue;
    const relative = note.tick - index * barTicks;
    bar.notes.push(note);
    bar.chroma[((Math.round(note.pitch) % 12) + 12) % 12]++;
    bar.instruments.add(note.instrument);
    // This coarse grid describes evidence only. Source timing is never rounded.
    bar.rhythm.add(Math.floor((relative / barTicks) * 24));
    bar.first = Math.min(bar.first, relative);
    bar.last = Math.max(bar.last, relative);
  }
  return bars;
}

function setDistance<T>(a: Set<T>, b: Set<T>): number {
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return 1 - common / Math.max(1, a.size + b.size - common);
}

/** Boundary support combines timbral, rhythmic, register-independent and rest evidence. */
export function boundarySupport(
  left: BarFeature,
  right: BarFeature,
  barTicks: number,
): number {
  if (!left.notes.length || !right.notes.length) return 1;
  let chroma = 0;
  for (let i = 0; i < 12; i++)
    chroma += Math.abs(
      left.chroma[i] / left.notes.length - right.chroma[i] / right.notes.length,
    );
  const density =
    Math.abs(left.notes.length - right.notes.length) /
    Math.max(left.notes.length, right.notes.length);
  const rest = Math.min(1, (barTicks - left.last + right.first) / barTicks);
  return Math.min(
    1,
    chroma * 0.2 +
      setDistance(left.rhythm, right.rhythm) * 0.25 +
      setDistance(left.instruments, right.instruments) * 0.2 +
      density * 0.15 +
      rest * 0.2,
  );
}

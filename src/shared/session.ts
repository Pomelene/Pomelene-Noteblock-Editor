import type { Command, Layer, Pattern, Project, Snapshot } from "./model";

const MAX_TICK = 1_048_576;
export const uid = () => crypto.randomUUID();
const color = "#75b9ab";
export const newLayer = (index = 0): Layer => ({
  id: uid(),
  name: `图层 ${index + 1}`,
  volume: 100,
  panning: 100,
  locked: false,
  muted: false,
  solo: false,
});
const names = [
  "Harp",
  "Double Bass",
  "Bass Drum",
  "Snare Drum",
  "Click",
  "Guitar",
  "Flute",
  "Bell",
  "Chime",
  "Xylophone",
  "Iron Xylophone",
  "Cow Bell",
  "Didgeridoo",
  "Bit",
  "Banjo",
  "Pling",
];
const builtin = [
  "harp",
  "dbass",
  "bdrum",
  "sdrum",
  "click",
  "guitar",
  "flute",
  "bell",
  "icechime",
  "xylobone",
  "iron_xylophone",
  "cow_bell",
  "didgeridoo",
  "bit",
  "banjo",
  "pling",
];
export function createEmptyProject(): Project {
  const samples = names.map((name, i) => ({
    id: `vanilla-${i}`,
    name,
    color:
      i >= 2 && i <= 4
        ? "#c59c85"
        : i === 1 || i === 12
          ? "#9b9fc7"
          : i >= 7 && i <= 11
            ? "#b4a1ce"
            : "#75b9ab",
    builtin: builtin[i],
    rootKey: 66,
    volume: 100,
    panning: 100,
  }));
  return {
    schema: 2,
    id: uid(),
    title: "未命名工程",
    bpm: 120,
    meter: "4/4",
    patterns: [],
    phrases: [],
    samples,
    instruments: samples.map((s, id) => ({
      id,
      name: s.name,
      sampleId: s.id,
      key: 45,
      pressKey: false,
    })),
    tracks: Array.from({ length: 8 }, (_, i) => ({
      id: uid(),
      name: `轨道 ${i + 1}`,
      color: i % 2 ? "#ad9bd0" : color,
      muted: false,
      solo: false,
      locked: false,
    })),
    clips: [],
    loop: { enabled: false, start: 0, end: 64 },
  };
}
export function createDemoProject(): Project {
  const p = createEmptyProject();
  p.title = "First Light · 晨光";
  p.bpm = 108;
  const make = (
    name: string,
    color: string,
    instrument: number,
    events: {
      tick: number;
      pitch: number;
      layer?: number;
      velocity?: number;
    }[],
  ): Pattern => ({
    id: uid(),
    name,
    color,
    length: 32,
    layers: Array.from(
      { length: Math.max(1, ...events.map((e) => (e.layer ?? 0) + 1)) },
      (_, i) => newLayer(i),
    ),
    notes: events.map((e) => ({
      id: uid(),
      tick: e.tick,
      layer: e.layer ?? 0,
      pitch: e.pitch,
      instrument,
      velocity: e.velocity ?? 78,
      panning: 100,
      finePitch: 0,
    })),
  });
  const melody = make("Aurora · 晨光旋律", "#78b9a9", 0, [
    { tick: 0, pitch: 64 },
    { tick: 3, pitch: 67 },
    { tick: 6, pitch: 71 },
    { tick: 8, pitch: 72 },
    { tick: 11, pitch: 71 },
    { tick: 14, pitch: 67 },
    { tick: 16, pitch: 62 },
    { tick: 19, pitch: 64 },
    { tick: 22, pitch: 67 },
    { tick: 24, pitch: 69 },
    { tick: 27, pitch: 67 },
    { tick: 30, pitch: 64 },
  ]);
  const harmony = make(
    "Soft Keys · 和声",
    "#96b6d6",
    5,
    [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ].flatMap((chord, i) =>
      chord.map((pitch, layer) => ({
        tick: i * 8,
        pitch,
        layer,
        velocity: 58,
      })),
    ),
  );
  const rhythm = make(
    "Pulse · 节奏",
    "#c79c87",
    2,
    Array.from({ length: 16 }, (_, i) => ({
      tick: i * 2,
      pitch: 66,
      velocity: i % 4 === 0 ? 82 : 48,
    })),
  );
  rhythm.notes.forEach((n, i) => {
    n.instrument = i % 4 === 2 ? 3 : i % 2 ? 4 : 2;
  });
  const bass = make(
    "Low Tide · 低音",
    "#b09bd0",
    1,
    [48, 45, 41, 43].flatMap((pitch, i) => [
      { tick: i * 8, pitch, velocity: 82 },
      { tick: i * 8 + 6, pitch: pitch + 12, velocity: 66 },
    ]),
  );
  p.patterns.push(melody, harmony, rhythm, bass);
  const trackNames = [
    "Melody · 旋律",
    "Harmony · 和声",
    "Rhythm · 节奏",
    "Bass · 低音",
  ];
  p.patterns.forEach((pattern, track) => {
    p.tracks[track].name = trackNames[track];
    p.tracks[track].color = pattern.color;
    for (let i = 0; i < 4; i++)
      p.clips.push({
        id: uid(),
        kind: "pattern",
        sourceId: pattern.id,
        tick: i * 32,
        length: 32,
        offset: 0,
        track,
        muted: false,
      });
  });
  p.loop.end = 128;
  return p;
}
function fail(message = "工程数据无效"): never {
  throw new Error(message);
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail();
  return v as Record<string, unknown>;
}
function arr(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) fail();
  return v;
}
function str(v: unknown, max = 1_048_576): string {
  if (typeof v !== "string" || v.length > max) fail();
  return v;
}
function num(v: unknown, min: number, max: number, integer = false): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isInteger(v))
  )
    fail();
  return v;
}
function bool(v: unknown): void {
  if (typeof v !== "boolean") fail();
}
function unique(v: unknown, ids: Set<string | number>): string {
  const id = str(v, 128);
  if (!id || ids.has(id)) fail();
  ids.add(id);
  return id;
}
function jsonSafe(v: unknown, depth = 0): void {
  if (depth > 32) fail();
  if (v === null || typeof v === "boolean") return;
  if (typeof v === "string") {
    str(v, 48 * 1024 * 1024);
    return;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) fail();
    return;
  }
  if (Array.isArray(v)) {
    arr(v, 1_000_000).forEach((x) => jsonSafe(x, depth + 1));
    return;
  }
  for (const [key, value] of Object.entries(obj(v))) {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail();
    jsonSafe(value, depth + 1);
  }
}
export function validateProject(value: unknown): Project {
  jsonSafe(value);
  const p = obj(value);
  if (p.schema !== 2) fail("不支持此工程版本");
  str(p.id, 128);
  str(p.title);
  num(p.bpm, 0.15, 9830.25);
  if (!/^([1-9]|[12][0-9]|3[0-2])\/(2|4|8|16)$/.test(str(p.meter)))
    fail("拍号无效");
  const samples = new Set<string | number>(),
    patterns = new Set<string | number>(),
    phrases = new Set<string | number>(),
    tracks = new Set<string | number>(),
    instruments = new Set<string | number>();
  let embedded = 0;
  for (const raw of arr(p.samples, 4096)) {
    const s = obj(raw);
    unique(s.id, samples);
    str(s.name);
    str(s.color, 100);
    num(s.rootKey, 0, 127, true);
    num(s.volume, 0, 100);
    num(s.panning, 0, 200);
    if (s.builtin !== undefined) str(s.builtin, 100);
    if (s.originalPath !== undefined) str(s.originalPath, 4096);
    if (s.duration !== undefined) num(s.duration, 0, 86400);
    if (s.dataUrl !== undefined) {
      const data = str(s.dataUrl, 44 * 1024 * 1024);
      if (
        !/^data:audio\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(data)
      )
        fail("采样格式无效");
      embedded += data.length;
    }
  }
  if (embedded > 80 * 1024 * 1024) fail("采样总量超出限制");
  for (const raw of arr(p.instruments, 256)) {
    const i = obj(raw),
      id = num(i.id, 0, 255, true);
    if (instruments.has(id)) fail();
    instruments.add(id);
    str(i.name);
    if (!samples.has(str(i.sampleId, 128))) fail("乐器引用的采样不存在");
    num(i.key, 0, 255, true);
    bool(i.pressKey);
    if (i.mappingTargetId !== undefined) num(i.mappingTargetId, 0, 255, true);
  }
  for (const raw of p.instruments as Project["instruments"]) {
    if (raw.mappingTargetId === undefined) continue;
    const target = (p.instruments as Project["instruments"]).find(
      (i) => i.id === raw.mappingTargetId,
    );
    const sample = (p.samples as Project["samples"]).find(
      (s) => s.id === target?.sampleId,
    );
    if (
      !target ||
      target.id === raw.id ||
      target.mappingTargetId !== undefined ||
      !sample ||
      (!sample.builtin && !sample.dataUrl)
    )
      fail("映射目标必须是有可用音频且未被映射的现有乐器，不能形成循环");
  }
  let notes = 0;
  const patternArray = arr(p.patterns, 1024),
    phraseArray = p.phrases === undefined ? [] : arr(p.phrases, 1024);
  for (const raw of [...patternArray, ...phraseArray]) {
    const pattern = obj(raw);
    unique(pattern.id, patterns);
    if (phraseArray.includes(raw)) phrases.add(pattern.id as string);
    str(pattern.name);
    str(pattern.color, 100);
    num(pattern.length, 1 / 1024, MAX_TICK);
    const layerIds = new Set<string | number>(),
      layers = arr(pattern.layers, 4096);
    if (!layers.length) fail("Pattern 至少需要一个图层");
    for (const rawLayer of layers) {
      const l = obj(rawLayer);
      unique(l.id, layerIds);
      str(l.name);
      num(l.volume, 0, 100);
      num(l.panning, 0, 200);
      bool(l.locked);
      bool(l.muted);
      bool(l.solo);
      if (l.sourceIndex !== undefined) num(l.sourceIndex, 0, 4095, true);
    }
    const noteIds = new Set<string | number>();
    for (const rawNote of arr(pattern.notes, 500_000)) {
      if (++notes > 1_000_000) fail("工程音符总数超出限制（1,000,000）");
      const n = obj(rawNote);
      unique(n.id, noteIds);
      num(n.tick, 0, MAX_TICK);
      num(n.layer, 0, layers.length - 1, true);
      num(n.pitch, 0, 127, true);
      num(n.velocity, 0, 100, true);
      if (!instruments.has(num(n.instrument, 0, 255, true)))
        fail("音符引用的乐器不存在");
      if (n.panning !== undefined) num(n.panning, 0, 200, true);
      if (n.finePitch !== undefined) num(n.finePitch, -32768, 32767, true);
    }
  }
  for (const id of phrases) patterns.delete(id);
  const trackArray = arr(p.tracks, 256);
  if (!trackArray.length) fail("工程至少需要一条轨道");
  for (const raw of trackArray) {
    const t = obj(raw);
    unique(t.id, tracks);
    str(t.name);
    str(t.color, 100);
    bool(t.muted);
    bool(t.solo);
    bool(t.locked);
  }
  const clipIds = new Set<string | number>();
  for (const raw of arr(p.clips, 10_000)) {
    const c = obj(raw);
    unique(c.id, clipIds);
    if (c.kind !== "pattern" && c.kind !== "phrase" && c.kind !== "sample")
      fail();
    if (
      !(
        c.kind === "pattern"
          ? patterns
          : c.kind === "phrase"
            ? phrases
            : samples
      ).has(str(c.sourceId, 128))
    )
      fail("乐段引用的源不存在");
    num(c.tick, 0, MAX_TICK);
    num(c.length, 1 / 1024, MAX_TICK);
    num(c.offset, 0, MAX_TICK);
    num(c.track, 0, trackArray.length - 1, true);
    bool(c.muted);
    if (c.tailTicks !== undefined) num(c.tailTicks, 0, MAX_TICK);
  }
  const loop = obj(p.loop);
  bool(loop.enabled);
  num(loop.start, 0, MAX_TICK);
  num(loop.end, 0, MAX_TICK);
  if ((loop.end as number) <= (loop.start as number))
    fail("循环结束必须晚于开始");
  if (p.nbs !== undefined) {
    const n = obj(p.nbs);
    num(n.version, 0, 6, true);
    arr(n.customInstruments, 255);
    arr(n.layers, 4096);
  }
  if (p.importOrganization !== undefined) {
    const info = obj(p.importOrganization);
    if (info.version !== "nbs-structure-1") fail("不支持此智能整理版本");
    str(info.originalData, 32 * 1024 * 1024);
    const s = obj(info.summary);
    str(s.fileName, 4096);
    str(s.title);
    str(s.algorithmVersion, 128);
    if (s.algorithmVersion !== info.version) fail("智能整理版本信息不一致");
    bool(s.applicable);
    num(s.noteCount, 0, 1_000_000, true);
    num(s.layerCount, 0, 4096, true);
    num(s.durationTicks, 0, MAX_TICK);
    num(s.bpm, 0.15, 9830.25);
    str(s.meter, 32);
    for (const raw of [s.original, s.proposed]) {
      const counts = obj(raw);
      num(counts.patterns, 0, 1024, true);
      num(counts.clips, 0, 10000, true);
      num(counts.tracks, 0, 256, true);
    }
    num(obj(s.proposed).reusedClips, 0, 10000, true);
    for (const raw of arr(s.groups, 256)) {
      const g = obj(raw);
      str(g.name, 4096);
      arr(g.sourceLayers, 4096).forEach((n) => num(n, 0, 4095, true));
      num(g.noteCount, 0, 1_000_000, true);
      num(g.patternCount, 0, 1024, true);
      num(g.clipCount, 0, 10000, true);
    }
    arr(s.warnings, 128).forEach((w) => str(w, 4096));
  }
  return structuredClone(value) as Project;
}
function find<T extends { id: string | number }>(
  items: T[],
  id: string | number,
): T {
  return items.find((x) => x.id === id) ?? fail("对象不存在");
}
function clonePattern(p: Pattern): Pattern {
  return {
    ...structuredClone(p),
    id: uid(),
    name: `${p.name} 副本`,
    notes: p.notes.map((n) => ({ ...n, id: uid() })),
    layers: p.layers.map((l) => ({ ...l, id: uid() })),
  };
}
export class Session {
  private project: Project;
  private past: Project[] = [];
  private future: Project[] = [];
  private revision = 0;
  private generation = 0;
  private path?: string;
  private saved: string;
  constructor(project = createDemoProject()) {
    this.project = validateProject(project);
    this.saved = JSON.stringify(this.project);
  }
  get documentGeneration(): number {
    return this.generation;
  }
  snapshot(): Snapshot {
    return {
      project: structuredClone(this.project),
      revision: this.revision,
      generation: this.generation,
      canUndo: !!this.past.length,
      canRedo: !!this.future.length,
      document: {
        ...(this.path ? { path: this.path } : {}),
        dirty: JSON.stringify(this.project) !== this.saved,
      },
    };
  }
  replace(project: Project): Snapshot {
    this.project = validateProject(project);
    this.past = [];
    this.future = [];
    this.generation++;
    this.revision++;
    this.path = undefined;
    this.saved = JSON.stringify(this.project);
    return this.snapshot();
  }
  markSaved(path?: string): void {
    this.path = path ?? this.path;
    this.saved = JSON.stringify(this.project);
  }
  /** Resource import joins history as one atomic transaction, without changing generation. */
  transact(change: (project: Project) => void): Snapshot {
    const next = structuredClone(this.project);
    change(next);
    return this.commit(next);
  }
  private commit(next: Project): Snapshot {
    const checked = validateProject(next);
    if (JSON.stringify(checked) === JSON.stringify(this.project))
      return this.snapshot();
    this.past.push(this.project);
    if (this.past.length > 100) this.past.shift();
    this.project = checked;
    this.future = [];
    this.revision++;
    return this.snapshot();
  }
  dispatch(command: Command): Snapshot {
    if (command.type === "undo" || command.type === "redo") {
      const from = command.type === "undo" ? this.past : this.future,
        to = command.type === "undo" ? this.future : this.past,
        next = from.pop();
      if (next) {
        to.push(this.project);
        this.project = next;
        this.revision++;
      }
      return this.snapshot();
    }
    return this.transact((p) => {
      const pattern = (id: string) => find(p.patterns, id);
      const editable = (id: string) => {
        const c = find(p.clips, id);
        if (p.tracks[c.track].locked) fail("轨道已锁定");
        return c;
      };
      const noteSelection = (id: string, ids: string[]) => {
        const pat = pattern(id);
        const requested = new Set(ids);
        const chosen = pat.notes.filter((n) => requested.has(n.id));
        if (chosen.some((n) => pat.layers[n.layer].locked)) fail("图层已锁定");
        return { pat, chosen };
      };
      switch (command.type) {
        case "phrase:fromPattern": {
          const copy = clonePattern(pattern(command.patternId));
          copy.name = command.name ?? pattern(command.patternId).name;
          (p.phrases ??= []).push(copy);
          break;
        }
        case "phrase:fromClips": {
          if (!command.ids.length) fail("请先选择音符片段");
          const selected = [...new Set(command.ids)].map((id) =>
            find(p.clips, id),
          );
          if (selected.some((c) => c.kind === "sample"))
            fail("音频资源不能转换为音符片段采样");
          const start = Math.min(...selected.map((c) => c.tick));
          const copy: Pattern = {
            id: uid(),
            name: command.name ?? "选区片段采样",
            color,
            length: Math.max(...selected.map((c) => c.tick + c.length)) - start,
            notes: [],
            layers: [],
          };
          const trackSolo = p.tracks.some((t) => t.solo);
          for (const clip of selected) {
            const source =
              clip.kind === "pattern"
                ? pattern(clip.sourceId)
                : find(p.phrases ?? [], clip.sourceId);
            const firstLayer = copy.layers.length,
              layerSolo = source.layers.some((l) => l.solo);
            if (firstLayer + source.layers.length > 4096)
              fail("选区图层数量超出限制");
            const track = p.tracks[clip.track];
            copy.layers.push(
              ...source.layers.map((l) => ({
                ...l,
                id: uid(),
                solo: false,
                muted:
                  l.muted ||
                  (layerSolo && !l.solo) ||
                  clip.muted ||
                  track.muted ||
                  (trackSolo && !track.solo),
              })),
            );
            const notes = source.notes.filter(
              (n) =>
                n.tick >= clip.offset &&
                n.tick < clip.offset + clip.length &&
                n.tick < source.length,
            );
            if (copy.notes.length + notes.length > 500_000)
              fail("选区音符数量超出限制");
            for (const n of notes)
              copy.notes.push({
                ...n,
                id: uid(),
                tick: clip.tick - start + n.tick - clip.offset,
                layer: firstLayer + n.layer,
              });
          }
          (p.phrases ??= []).push(copy);
          break;
        }
        case "phrase:update": {
          const patch = obj(command.patch);
          if (
            Object.keys(patch).some((key) => key !== "name" && key !== "color")
          )
            fail("片段采样只允许修改名称和颜色");
          Object.assign(find(p.phrases ?? [], command.id), patch);
          break;
        }
        case "phrase:remove":
          find(p.phrases ?? [], command.id);
          p.phrases = p.phrases!.filter((x) => x.id !== command.id);
          p.clips = p.clips.filter(
            (c) => c.kind !== "phrase" || c.sourceId !== command.id,
          );
          break;
        case "pattern:fromPhrase": {
          const source = find(p.phrases ?? [], command.phraseId);
          p.patterns.push({ ...clonePattern(source), name: source.name });
          break;
        }
        case "import:restoreOriginal": {
          if (!p.importOrganization) fail("当前工程没有原始导入布局");
          let original: Record<string, unknown>;
          try {
            original = obj(JSON.parse(p.importOrganization.originalData));
          } catch {
            fail("原始导入布局备份已损坏");
          }
          p.patterns = original.patterns as Project["patterns"];
          p.clips = original.clips as Project["clips"];
          p.tracks = original.tracks as Project["tracks"];
          delete p.importOrganization;
          break;
        }
        case "project:update": {
          const patch = obj(command.patch);
          if (
            Object.keys(patch).some(
              (key) => !["title", "bpm", "meter", "loop"].includes(key),
            )
          )
            fail("工程属性命令不能修改源对象或片段采样");
          Object.assign(p, patch);
          break;
        }
        case "pattern:add":
          p.patterns.push(
            command.duplicateId
              ? clonePattern(pattern(command.duplicateId))
              : {
                  id: uid(),
                  name: command.name || `Pattern ${p.patterns.length + 1}`,
                  color,
                  length: 32,
                  notes: [],
                  layers: [newLayer()],
                },
          );
          break;
        case "pattern:update": {
          const pat = pattern(command.id);
          if (
            command.patch.length !== undefined &&
            command.patch.length !== pat.length
          )
            for (const clip of p.clips)
              if (clip.kind === "pattern" && clip.sourceId === pat.id)
                delete clip.tailTicks;
          Object.assign(pat, command.patch);
          break;
        }
        case "pattern:remove":
          find(p.patterns, command.id);
          p.patterns = p.patterns.filter((x) => x.id !== command.id);
          p.clips = p.clips.filter(
            (c) => c.kind !== "pattern" || c.sourceId !== command.id,
          );
          break;
        case "notes:add": {
          const pat = pattern(command.patternId);
          for (const note of command.notes) {
            num(note.layer, 0, 4095, true);
            while (pat.layers.length <= note.layer)
              pat.layers.push(newLayer(pat.layers.length));
            if (pat.layers[note.layer]?.locked) fail("图层已锁定");
            pat.notes.push({ ...note, id: uid() });
            pat.length = Math.max(pat.length, note.tick + 1);
          }
          break;
        }
        case "notes:update": {
          const { chosen } = noteSelection(command.patternId, command.ids);
          chosen.forEach((n) => Object.assign(n, command.patch));
          break;
        }
        case "notes:move": {
          const { pat, chosen } = noteSelection(command.patternId, command.ids);
          for (const n of chosen) {
            n.tick += command.ticks;
            n.pitch += command.pitches ?? 0;
            n.layer += command.layers ?? 0;
            if (pat.layers[n.layer]?.locked) fail("目标图层已锁定");
            pat.length = Math.max(pat.length, n.tick + 1);
          }
          break;
        }
        case "notes:remove": {
          const { pat } = noteSelection(command.patternId, command.ids);
          const removing = new Set(command.ids);
          pat.notes = pat.notes.filter((n) => !removing.has(n.id));
          break;
        }
        case "layer:add": {
          const pat = pattern(command.patternId);
          pat.layers.push(newLayer(pat.layers.length));
          break;
        }
        case "layer:update": {
          const l = pattern(command.patternId).layers[command.index];
          if (!l) fail("图层不存在");
          Object.assign(l, command.patch);
          break;
        }
        case "layer:remove": {
          const pat = pattern(command.patternId);
          if (!pat.layers[command.index]) fail("图层不存在");
          if (pat.layers.length === 1) fail("必须保留一个图层");
          pat.layers.splice(command.index, 1);
          pat.notes = pat.notes
            .filter((n) => n.layer !== command.index)
            .map((n) => ({
              ...n,
              layer: n.layer > command.index ? n.layer - 1 : n.layer,
            }));
          break;
        }
        case "clip:add":
          if (p.tracks[command.clip.track]?.locked) fail("轨道已锁定");
          p.clips.push({ ...command.clip, id: uid() });
          break;
        case "clips:paste":
          for (const c of command.clips) {
            if (p.tracks[c.track]?.locked) fail("轨道已锁定");
            p.clips.push({ ...c, id: uid() });
          }
          break;
        case "clips:update":
          for (const id of command.ids) {
            const c = editable(id);
            if (
              (command.patch.length !== undefined &&
                command.patch.length !== c.length) ||
              (command.patch.offset !== undefined &&
                command.patch.offset !== c.offset)
            )
              delete c.tailTicks;
            Object.assign(c, command.patch);
            if (p.tracks[c.track]?.locked) fail("目标轨道已锁定");
          }
          break;
        case "clips:move":
          for (const id of command.ids) {
            const c = editable(id);
            c.tick += command.ticks;
            c.track += command.tracks;
            if (p.tracks[c.track]?.locked) fail("目标轨道已锁定");
          }
          break;
        case "clips:remove":
          command.ids.forEach(editable);
          p.clips = p.clips.filter((c) => !command.ids.includes(c.id));
          break;
        case "source:unique": {
          const c = editable(command.clipId);
          if (c.kind === "pattern" || c.kind === "phrase") {
            const copy = clonePattern(
              c.kind === "pattern"
                ? pattern(c.sourceId)
                : find(p.phrases ?? [], c.sourceId),
            );
            p.patterns.push(copy);
            c.kind = "pattern";
            c.sourceId = copy.id;
          } else {
            const sample = structuredClone(find(p.samples, c.sourceId));
            sample.id = uid();
            sample.name += " 副本";
            p.samples.push(sample);
            c.sourceId = sample.id;
          }
          break;
        }
        case "sample:update":
          Object.assign(find(p.samples, command.id), command.patch);
          break;
        case "sample:clone": {
          const sample = structuredClone(find(p.samples, command.id));
          sample.id = uid();
          sample.name += " 副本";
          p.samples.push(sample);
          break;
        }
        case "sample:remove":
          find(p.samples, command.id);
          if (p.instruments.some((i) => i.sampleId === command.id))
            fail("采样正由 NBS 乐器引用，无法删除");
          p.samples = p.samples.filter((s) => s.id !== command.id);
          p.clips = p.clips.filter(
            (c) => c.kind !== "sample" || c.sourceId !== command.id,
          );
          break;
        case "instrument:update":
          Object.assign(find(p.instruments, command.id), command.patch);
          break;
        case "instrument:map": {
          const instrument = find(p.instruments, command.id);
          if (command.targetId === undefined) delete instrument.mappingTargetId;
          else instrument.mappingTargetId = command.targetId;
          break;
        }
        case "track:add":
          p.tracks.push({
            id: uid(),
            name: command.name || `轨道 ${p.tracks.length + 1}`,
            color,
            muted: false,
            solo: false,
            locked: false,
          });
          break;
        case "track:update":
          Object.assign(find(p.tracks, command.id), command.patch);
          break;
        case "track:remove": {
          const index = p.tracks.findIndex((t) => t.id === command.id);
          if (index < 0) fail("轨道不存在");
          if (p.tracks.length === 1) fail("必须保留一条轨道");
          p.tracks.splice(index, 1);
          p.clips = p.clips
            .filter((c) => c.track !== index)
            .map((c) => ({
              ...c,
              track: c.track > index ? c.track - 1 : c.track,
            }));
          break;
        }
        default:
          fail("未知编辑命令");
      }
    });
  }
}

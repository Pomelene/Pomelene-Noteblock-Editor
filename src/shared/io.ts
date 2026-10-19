import { getNbsEventKind } from "./nbsEvents";
import { decodeNbs, encodeNbs, getNbsExportWarnings } from "../legacy/nbs";
import type { NbsMetadata, NbsProject } from "../legacy/nbs";
import type { Project as LegacyProject } from "../legacy/project";
import type { Pattern, Project } from "./model";
import { createEmptyProject, newLayer, uid, validateProject } from "./session";

import {
  MAX_PROJECT_BYTES,
  decodeProjectV2,
  encodeProjectV2,
  isProjectContainer,
} from "./projectCodec";
export { MAX_PROJECT_BYTES } from "./projectCodec";
function migrate(old: LegacyProject & { nbs?: NbsMetadata }): Project {
  const p = createEmptyProject();
  p.title = old.title;
  p.bpm = old.bpm;
  p.meter = old.meter;
  if (old.nbs) {
    const { controlEvents, ...metadata } = old.nbs;
    p.nbs = metadata;
    if (controlEvents?.length) p.nbsEvents = structuredClone(controlEvents);
  }
  p.patterns = old.patterns.map((pattern) => {
    const height = pattern.notes.reduce(
      (max, n) => Math.max(max, n.layer + 1),
      Math.max(1, pattern.layerCount ?? 0, old.nbs?.layers.length ?? 0),
    );
    if (height > 4096) throw new Error("图层数量超出限制");
    return {
      id: pattern.id,
      name: pattern.name,
      color: "#75b9ab",
      length: pattern.length,
      notes: structuredClone(pattern.notes),
      layers: Array.from({ length: height }, (_, i) => {
        const l = old.nbs?.layers[i];
        return {
          ...newLayer(i),
          ...(l
            ? {
                name: l.name,
                locked: l.locked === 1,
                solo: l.locked === 2,
                sourceIndex: i,
                volume: l.volume,
                panning: l.panning,
              }
            : {}),
        };
      }),
    };
  });
  p.clips = old.clips.map((c) => ({
    id: c.id,
    kind: "pattern",
    sourceId: c.patternId,
    tick: c.tick,
    track: c.track,
    length: p.patterns.find((x) => x.id === c.patternId)?.length ?? 0,
    offset: 0,
    muted: false,
  }));
  const tracks = Math.max(8, ...p.clips.map((c) => c.track + 1));
  if (tracks > 256) throw new Error("轨道数量超出限制");
  while (p.tracks.length < tracks)
    p.tracks.push({
      ...p.tracks[0],
      id: uid(),
      name: `轨道 ${p.tracks.length + 1}`,
    });
  for (const [index, c] of (old.nbs?.customInstruments ?? []).entries()) {
    if (index + 16 > 255 || getNbsEventKind(c.name)) continue;
    const id = 16 + index,
      sampleId = `custom-${id}`;
    p.samples.push({
      id: sampleId,
      name: c.name,
      color: "#ad9bd0",
      originalPath: c.file,
      rootKey: 66,
      volume: 100,
      panning: 100,
    });
    p.instruments.push({
      id,
      name: c.name,
      sampleId,
      key: c.key,
      pressKey: !!c.pressKey,
    });
  }
  p.loop = {
    enabled: !!old.nbs?.loop,
    start: old.nbs?.loopStartTick ?? 0,
    end: Math.max(
      (old.nbs?.loopStartTick ?? 0) + 1,
      ...p.clips.map((c) => c.tick + c.length),
      16,
    ),
  };
  return validateProject(p);
}
export function fromNbs(data: Uint8Array): Project {
  return migrate(decodeNbs(data));
}
export function decodeProject(bytes: Uint8Array, filename?: string): Project {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_PROJECT_BYTES)
    throw new Error("工程文件超过 96 MiB 限制");
  if (isProjectContainer(bytes)) return decodeProjectV2(bytes);
  if (filename?.toLowerCase().endsWith(".nbs")) return fromNbs(bytes);
  if (
    filename?.toLowerCase().endsWith(".nbproject") ||
    /^\s*\{\s*"/.test(new TextDecoder().decode(bytes.subarray(0, 256)))
  )
    throw new Error("仅支持带版本标识的 v2 工程；旧工程格式不再支持");
  return fromNbs(bytes);
}
export function encodeProject(project: Project): Uint8Array {
  return encodeProjectV2(project);
}
export function toNbs(input: Project): {
  data: Uint8Array;
  warnings: string[];
} {
  const project = validateProject(input),
    warnings: string[] = [],
    custom = project.instruments
      .filter((i) => i.id >= 16)
      .sort((a, b) => a.id - b.id);
  const customIds = new Map(custom.map((i, index) => [i.id, index + 16]));
  if (
    project.samples.some(
      (s) => s.volume !== 100 || s.panning !== 100 || s.rootKey !== 66,
    )
  )
    warnings.push(
      "采样的预听音量、声像和基准设置仅随工程保存；NBS 导出使用音符、图层和自定义乐器调音设置。",
    );
  // Protocol definitions retain their slots without ordinary sample resources.
  const definitions = structuredClone(project.nbs?.customInstruments ?? []);
  for (const i of custom) {
    const sample = project.samples.find((s) => s.id === i.sampleId)!;
    const index = i.id - 16;
    const old = definitions[index];
    const destination = old ? index : definitions.length;
    customIds.set(i.id, 16 + destination);
    definitions[destination] = {
      name: i.name,
      file: sample.originalPath ?? old?.file ?? `${sample.name}.wav`,
      key: i.key,
      pressKey: Number(i.pressKey),
    };
  }
  if (
    custom.some(
      (i) => project.samples.find((s) => s.id === i.sampleId)?.dataUrl,
    )
  )
    warnings.push(
      "NBS 只保存自定义乐器的文件引用，采样音频保留在工程文件中；可通过“文件 → 导出乐器采样包”同时分发对应资源。",
    );
  const meta: NbsMetadata = {
    version: 5,
    vanillaInstrumentCount: 16,
    author: "",
    originalAuthor: "",
    description: "",
    autosave: 0,
    autosaveMinutes: 10,
    timeSignature: 4,
    minutesSpent: 0,
    leftClicks: 0,
    rightClicks: 0,
    notesAdded: 0,
    notesRemoved: 0,
    midiFile: "",
    loop: 0,
    maxLoopCount: 0,
    loopStartTick: 0,
    layers: [],
    customInstruments: [],
    rawStrings: {},
    warnings: [],
    ...project.nbs,
  };
  delete meta.controlEvents;
  if (project.nbsEvents?.length)
    meta.controlEvents = structuredClone(project.nbsEvents);
  meta.layers = [];
  meta.customInstruments = definitions;
  meta.loop = Number(project.loop.enabled);
  meta.loopStartTick = Math.round(project.loop.start);
  const legacy: NbsProject = {
    title: project.title,
    bpm: project.bpm,
    meter: project.meter,
    patterns: [],
    clips: [],
    nbs: meta,
  };
  let fractional = false,
    omittedSamples = false,
    unsupportedPitch = false;
  const solo = project.tracks.some((t) => t.solo);
  const lanes = new Map<string, number>(),
    claimedOriginal = new Set<number>();
  if (
    [...project.patterns, ...(project.phrases ?? [])].some((p) =>
      p.layers.some((l) => l.sourceIndex !== undefined),
    )
  )
    meta.layers = structuredClone(project.nbs?.layers ?? []);
  for (const c of project.clips) {
    const track = project.tracks[c.track];
    if (c.muted || track.muted || (solo && !track.solo)) continue;
    if (c.kind === "sample") {
      omittedSamples = true;
      continue;
    }
    const source = (
        c.kind === "phrase" ? (project.phrases ?? []) : project.patterns
      ).find((p) => p.id === c.sourceId)!,
      layerSolo = source.layers.some((l) => l.solo);
    // Repeated references share lane settings. The codec still allocates
    // collision lanes when references overlap at the same tick.
    const layerMap = source.layers.map((l, index) => {
      const definition = {
          name: l.name,
          volume: Math.round(l.volume),
          panning: Math.round(l.panning),
          locked: Number(l.locked),
        },
        key = JSON.stringify([
          l.sourceIndex === undefined
            ? [source.id, index]
            : ["nbs", l.sourceIndex],
          definition,
        ]);
      const known = lanes.get(key);
      if (known !== undefined) return known;
      let destination = meta.layers.length;
      if (l.sourceIndex !== undefined && !claimedOriginal.has(l.sourceIndex)) {
        destination = l.sourceIndex;
        claimedOriginal.add(destination);
        while (meta.layers.length <= destination)
          meta.layers.push({
            name: `图层 ${meta.layers.length + 1}`,
            volume: 100,
            panning: 100,
            locked: 0,
          });
        meta.layers[destination] = definition;
      } else meta.layers.push(definition);
      lanes.set(key, destination);
      return destination;
    });
    fractional ||=
      !Number.isInteger(c.tick) ||
      !Number.isInteger(c.length) ||
      !Number.isInteger(c.offset);
    const length = Math.max(1, Math.round(c.length)),
      tick = Math.round(c.tick);
    const notes: Pattern["notes"] = [];
    for (const n of source.notes) {
      const l = source.layers[n.layer];
      if (
        l.muted ||
        (layerSolo && !l.solo) ||
        n.tick < c.offset ||
        n.tick >= c.offset + c.length ||
        n.tick >= source.length
      )
        continue;
      fractional ||= !Number.isInteger(n.tick - c.offset);
      const relative = Math.round(n.tick - c.offset);
      if (relative >= length) continue;
      const instrument = project.instruments.find(
        (i) => i.id === n.instrument,
      )!;
      const target =
        instrument.mappingTargetId === undefined
          ? instrument
          : project.instruments.find(
              (i) => i.id === instrument.mappingTargetId,
            )!;
      const effectivePitch = n.pitch + instrument.key - target.key;
      const pitch =
        instrument.mappingTargetId === undefined
          ? n.pitch
          : Math.min(108, Math.max(21, effectivePitch));
      const finePitch = (n.finePitch ?? 0) + (effectivePitch - pitch) * 100;
      if (finePitch < -32768 || finePitch > 32767)
        throw new Error(
          `乐器“${instrument.name}”的映射调音超出 NBS 可表示范围`,
        );
      if (pitch < 21 || pitch > 108) {
        unsupportedPitch = true;
        continue;
      }
      notes.push({
        ...n,
        tick: relative,
        pitch,
        finePitch,
        layer: layerMap[n.layer],
        instrument: customIds.get(target.id) ?? target.id,
      });
    }
    legacy.patterns.push({ id: c.id, name: source.name, length, notes });
    legacy.clips.push({ id: c.id, patternId: c.id, tick, track: 0 });
  }
  if (omittedSamples)
    warnings.push(
      "采样乐段不属于 NBS 音符数据，已从 NBS 导出中省略；完整内容仍保存在工程文件中。",
    );
  if (unsupportedPitch)
    warnings.push("NBS 仅支持 MIDI 21–108，范围外的音符已省略。");
  if (fractional)
    warnings.push(
      "NBS 只支持整数 tick；细分网格和三连音时间已四舍五入到最近的 tick。",
    );
  warnings.push(...getNbsExportWarnings(legacy));
  return { data: encodeNbs(legacy), warnings };
}

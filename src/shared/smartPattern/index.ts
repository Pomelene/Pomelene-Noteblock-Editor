import {
  ticksPerBar,
  type Project,
  type NbsImportSummary,
  type Pattern,
  type Clip,
} from "../model";
import { extractLanes, layerTuple, noteTuple } from "./features";
import { groupLanes } from "./grouping";
import {
  ALGORITHM_VERSION,
  resolveProfile,
  type SmartPatternProfile,
} from "./profile";
import { segmentGroup } from "./segmentation";
export {
  ALGORITHM_VERSION,
  DEFAULT_SMART_PATTERN_PROFILE,
  type SmartPatternProfile,
} from "./profile";

/** Raw trigger multiset, including inactive notes and exact duplicate multiplicity. */
export function collectMusicalEvents(project: Project): string[] {
  const patterns = new Map(
    project.patterns.map((pattern) => [pattern.id, pattern]),
  );
  const events: string[] = [];
  for (const clip of project.clips) {
    if (clip.kind !== "pattern") continue;
    const pattern = patterns.get(clip.sourceId);
    if (!pattern) continue;
    for (const note of pattern.notes) {
      if (
        note.tick < clip.offset ||
        note.tick >= clip.offset + clip.length ||
        note.tick >= pattern.length
      )
        continue;
      const layer = pattern.layers[note.layer];
      if (!layer) continue;
      events.push(
        JSON.stringify([
          ...noteTuple(
            note,
            clip.tick + note.tick - clip.offset,
            layer.sourceIndex ?? note.layer,
          ),
          ...layerTuple(layer),
        ]),
      );
    }
  }
  return events.sort();
}

function fingerprint(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function organizeImportedProject(
  input: Project,
  overrides: Partial<SmartPatternProfile> = {},
): { project: Project; summary: NbsImportSummary } {
  const project = structuredClone(input);
  const profile = resolveProfile(overrides);
  const original = {
    patterns: input.patterns.length,
    clips: input.clips.length,
    tracks: input.tracks.length,
  };
  const summary: NbsImportSummary = {
    fileName: "",
    title: input.title,
    noteCount: input.patterns.reduce((sum, p) => sum + p.notes.length, 0),
    layerCount: input.patterns.reduce((sum, p) => sum + p.layers.length, 0),
    durationTicks: input.clips.reduce(
      (end, c) => Math.max(end, c.tick + c.length),
      0,
    ),
    bpm: input.bpm,
    meter: input.meter,
    algorithmVersion: ALGORITHM_VERSION,
    applicable: false,
    original,
    proposed: { ...original, reusedClips: 0 },
    groups: [],
    warnings: [...(input.nbs?.warnings ?? [])],
  };
  const fallback = (warning: string) => {
    summary.applicable = false;
    summary.proposed = { ...original, reusedClips: 0 };
    summary.groups = [];
    summary.warnings.push(warning);
    return { project: structuredClone(input), summary };
  };
  const pattern = input.patterns[0],
    clip = input.clips[0];
  const barTicks = ticksPerBar(input.meter);
  if (
    input.importOrganization ||
    input.patterns.length !== 1 ||
    input.clips.length !== 1 ||
    !pattern ||
    !clip ||
    clip.kind !== "pattern" ||
    clip.sourceId !== pattern.id ||
    clip.tick !== 0 ||
    clip.offset !== 0 ||
    clip.length !== pattern.length ||
    (clip.tailTicks !== undefined && clip.tailTicks !== pattern.length) ||
    !input.tracks[clip.track] ||
    !Number.isFinite(pattern.length) ||
    pattern.length <= 0 ||
    !Number.isFinite(barTicks) ||
    barTicks <= 0 ||
    pattern.layers.some((l) => l.solo) ||
    input.tracks.some((t) => t.solo)
  )
    return fallback("仅适用于原始的单 Pattern NBS 导入布局；已保留原布局。");
  if (
    pattern.notes.some(
      (n) =>
        !Number.isFinite(n.tick) ||
        n.tick < 0 ||
        n.tick >= pattern.length ||
        !Number.isInteger(n.layer) ||
        !pattern.layers[n.layer] ||
        !Number.isFinite(n.pitch) ||
        !Number.isFinite(n.velocity) ||
        !Number.isFinite(n.instrument) ||
        (n.panning !== undefined && !Number.isFinite(n.panning)) ||
        (n.finePitch !== undefined && !Number.isFinite(n.finePitch)),
    )
  )
    return fallback("原始音符数据超出安全分析范围；已保留原布局。");
  if (Math.ceil(pattern.length / barTicks) > profile.maxAnalysisBars)
    return fallback(
      `歌曲跨度超过 ${profile.maxAnalysisBars} 小节分析预算；已保留原布局。`,
    );
  const originalData = JSON.stringify({
    patterns: input.patterns,
    clips: input.clips,
    tracks: input.tracks,
  });
  if (
    new TextEncoder().encode(originalData).byteLength > profile.maxBackupBytes
  )
    return fallback("原始布局备份超过大小预算；已保留原布局。");
  const lanes = extractLanes(input, pattern);
  if (lanes.length > profile.maxLanes)
    return fallback("图层/乐器 lane 数超过分析预算；已保留原布局。");
  const groups = groupLanes(lanes, profile);
  if (!groups) return fallback("声部分组数超过轨道预算；已保留原布局。");
  if (!groups.length) {
    if (
      original.patterns > profile.maxPatterns ||
      original.clips > profile.maxClips
    )
      return fallback("空曲布局超过 Pattern 或引用预算；已保留原布局。");
    summary.applicable = true;
    project.importOrganization = {
      version: ALGORITHM_VERSION,
      summary: structuredClone(summary),
      originalData,
    };
    return { project, summary };
  }
  const patterns: Pattern[] = [],
    clips: Clip[] = [];
  const sourceTrack = input.tracks[clip.track];
  const tracks = groups.map((group, index) => ({
    ...sourceTrack,
    id: `smart-track-${index}`,
    name: group.name,
    color: pattern.color,
  }));
  for (const [groupIndex, group] of groups.entries()) {
    const layers = group.sourceLayers.map((index) => ({
      ...pattern.layers[index],
      sourceIndex: pattern.layers[index].sourceIndex ?? index,
    }));
    const layerIndices = new Map(
      group.sourceLayers.map((source, index) => [source, index]),
    );
    // Hashes only select a bucket. Full signature equality authorizes reuse.
    const shared = new Map<number, { signature: string; pattern: Pattern }[]>();
    let cursor = 0,
      patternCount = 0,
      clipCount = 0;
    for (const segment of segmentGroup(
      group,
      pattern.length,
      barTicks,
      profile,
    )) {
      while (
        cursor < group.notes.length &&
        group.notes[cursor].tick < segment.start
      )
        cursor++;
      const sourceNotes = [];
      while (
        cursor < group.notes.length &&
        group.notes[cursor].tick < segment.end
      )
        sourceNotes.push(group.notes[cursor++]);
      if (!sourceNotes.length) continue;
      const length = segment.end - segment.start;
      if (length < 1 / 1024)
        return fallback("分段后乐句长度低于工程格式精度；已保留原布局。");
      const signature = JSON.stringify([
        length,
        layers.map((l) => [l.sourceIndex, ...layerTuple(l)]),
        sourceNotes.map((n) =>
          noteTuple(
            n,
            n.tick - segment.start,
            pattern.layers[n.layer].sourceIndex ?? n.layer,
          ),
        ),
      ]);
      const hash = fingerprint(signature);
      let bucket = shared.get(hash);
      if (!bucket) {
        bucket = [];
        shared.set(hash, bucket);
      }
      let source = bucket.find(
        (entry) => entry.signature === signature,
      )?.pattern;
      if (!source) {
        if (patterns.length >= profile.maxPatterns)
          return fallback("整理后的 Pattern 数超过预算；已保留原布局。");
        source = {
          id: `smart-pattern-${groupIndex}-${patternCount}`,
          name: `${group.name} ${patternCount + 1}`,
          color: pattern.color,
          length,
          layers: structuredClone(layers),
          notes: sourceNotes.map((n) => ({
            ...n,
            tick: n.tick - segment.start,
            layer: layerIndices.get(n.layer)!,
          })),
        };
        patterns.push(source);
        bucket.push({ signature, pattern: source });
        patternCount++;
      }
      if (clips.length >= profile.maxClips)
        return fallback("整理后的引用数超过预算；已保留原布局。");
      clips.push({
        ...clip,
        id: `smart-clip-${groupIndex}-${clipCount}`,
        sourceId: source.id,
        track: groupIndex,
        tick: segment.start,
        offset: 0,
        length,
        tailTicks: pattern.length - segment.start,
      });
      clipCount++;
    }
    summary.groups.push({
      name: group.name,
      sourceLayers: group.sourceLayers.map(
        (index) => pattern.layers[index].sourceIndex ?? index,
      ),
      noteCount: group.notes.length,
      patternCount,
      clipCount,
    });
  }
  // Pad the final chronological reference only; its source does not repeat.
  let last: Clip | undefined;
  for (const candidate of clips)
    if (!last || candidate.tick >= last.tick) last = candidate;
  if (last) last.length = pattern.length - last.tick;
  project.patterns = patterns;
  project.clips = clips;
  project.tracks = tracks;
  const before = collectMusicalEvents(input),
    after = collectMusicalEvents(project);
  if (
    before.length !== after.length ||
    before.some((event, index) => event !== after[index])
  )
    return fallback("精确音符完整性校验未通过；已保留原布局。");
  summary.applicable = true;
  summary.proposed = {
    patterns: patterns.length,
    clips: clips.length,
    tracks: tracks.length,
    reusedClips: clips.length - patterns.length,
  };
  project.importOrganization = {
    version: ALGORITHM_VERSION,
    summary: structuredClone(summary),
    originalData,
  };
  return { project, summary };
}

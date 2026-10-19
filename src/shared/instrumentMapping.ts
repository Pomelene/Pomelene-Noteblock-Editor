import type { Instrument, Note, Project } from "./model";
import { getNbsEventKind } from "./nbsEvents";
const groupedNotes = new WeakMap<Project, Map<number, Note[][]>>();
function notesByInstrument(project: Project) {
  let result = groupedNotes.get(project);
  if (result) return result;
  result = new Map<number, Note[][]>();
  for (const pattern of [...project.patterns, ...(project.phrases ?? [])]) {
    const local = new Map<number, Note[]>();
    for (const note of pattern.notes) {
      let notes = local.get(note.instrument);
      if (!notes) {
        notes = [];
        local.set(note.instrument, notes);
      }
      notes.push(note);
    }
    for (const [id, notes] of local) {
      let groups = result.get(id);
      if (!groups) {
        groups = [];
        result.set(id, groups);
      }
      groups.push(notes);
    }
  }
  groupedNotes.set(project, result);
  return result;
}
export interface InstrumentSuggestion {
  targetId: number;
  reasons: string[];
}
export function playableMappingTargets(
  project: Project,
  sourceId: number,
): Instrument[] {
  if (
    getNbsEventKind(
      project.instruments.find((i) => i.id === sourceId)?.name ?? "",
    )
  )
    return [];
  return project.instruments
    .filter(
      (i) =>
        i.id !== sourceId &&
        !getNbsEventKind(i.name) &&
        i.mappingTargetId === undefined &&
        project.samples.some(
          (s) => s.id === i.sampleId && !!(s.builtin || s.dataUrl),
        ),
    )
    .sort((a, b) => a.id - b.id);
}
/** Symbolic approximation inspired by SmartAssignment: metadata plus real register/rhythm. */
export function suggestInstrumentMapping(
  project: Project,
  id: number,
): InstrumentSuggestion | undefined {
  const instrument = project.instruments.find((i) => i.id === id);
  if (!instrument || getNbsEventKind(instrument.name)) return;
  const sample = project.samples.find((s) => s.id === instrument.sampleId);
  const hint = `${instrument.name} ${sample?.originalPath ?? ""}`
    .toLowerCase()
    .replace(/[_-]/g, " ");
  const pitches: number[] = [],
    gaps: number[] = [],
    reasons: string[] = [];
  let repeated = 0,
    transitions = 0,
    chordNotes = 0,
    total = 0;
  for (const group of notesByInstrument(project).get(id) ?? []) {
    const notes = [...group].sort(
      (a, b) => a.tick - b.tick || a.layer - b.layer || a.pitch - b.pitch,
    );
    let previous: (typeof notes)[number] | undefined;
    for (const n of notes) {
      pitches.push(n.pitch + instrument.key - 45 + (n.finePitch ?? 0) / 100);
      total++;
      if (previous) {
        if (n.tick === previous.tick) chordNotes++;
        else {
          transitions++;
          gaps.push(n.tick - previous.tick);
          if (n.pitch === previous.pitch) repeated++;
        }
      }
      previous = n;
    }
  }
  pitches.sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)] ?? 66;
  const counts = new Map<number, number>();
  for (const gap of gaps) counts.set(gap, (counts.get(gap) ?? 0) + 1);
  const regular =
    gaps.length > 1 &&
    [...counts.values()].reduce((max, n) => Math.max(max, n), 0) / gaps.length >
      0.6;
  const rhythm = regular && repeated / Math.max(1, transitions) > 0.5;
  if (total) reasons.push(`${total} 个音符 · 中位音高 ${Math.round(median)}`);
  if (median < 45 && total) reasons.push("低音音区");
  if (rhythm) reasons.push("稳定重复节奏");
  if (chordNotes / Math.max(1, total) > 0.25) reasons.push("同 tick 和声");
  const percussion =
    /drum|kick|snare|clap|hihat|hi hat|cymbal|percussion|鼓|镲/.test(hint);
  const scores = new Map<number, number>();
  const add = (ids: number[], score: number) =>
    ids.forEach((i) => scores.set(i, (scores.get(i) ?? 0) + score));
  add([0], 1);
  if (total && median < 45) add([1, 12], 3);
  if (chordNotes / Math.max(1, total) > 0.25) add([0, 5, 15], 1.5);
  if (total && median > 72) add([6, 7, 8], 1);
  if (percussion) {
    add([2, 3, 4, 11], 3);
    if (rhythm) add([2, 3, 4], 1);
  }
  const named: [RegExp, number[]][] = [
    [/kick|bass drum|底鼓/, [2]],
    [/snare|clap|军鼓/, [3]],
    [/hihat|hi hat|cymbal|镲/, [4]],
    [/bass|低音|贝斯/, [1]],
    [/guitar|吉他/, [5]],
    [/flute|笛/, [6]],
    [/bell|chime|钟/, [7, 8]],
    [/piano|keyboard|钢琴/, [15, 0]],
    [/synth|chip|square|合成|电子/, [13]],
  ];
  let namedHint = false;
  for (const [re, ids] of named)
    if (re.test(hint)) {
      add(ids, 5);
      namedHint = true;
    }
  if (namedHint) reasons.push("名称 / 文件名提示");
  if (!reasons.length) reasons.push("音符证据不足，使用通用音色作为起点");
  const targets = playableMappingTargets(project, id);
  if (!targets.length) return;
  targets.sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.id - b.id,
  );
  return { targetId: targets[0].id, reasons };
}

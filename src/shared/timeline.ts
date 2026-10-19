import {
  ticksPerBar,
  type Layer,
  type Note,
  type Pattern,
  type Project,
} from "./model";
import { buildTempoMap, type TempoMap } from "./tempo";
import { stopRangeForEvent } from "./nbsEvents";

/** One sample trigger. Durations are playback windows, never stretch or repeat counts. */
export interface AudioEvent {
  id: string;
  kind: "note" | "sample";
  sampleId: string;
  tick: number;
  durationTicks: number;
  /** Offset in the original sample, expressed in project ticks at native speed. */
  offsetTicks: number;
  playbackRate: number;
  gain: number;
  pan: number;
  /** Original one-based NBS layer identity, independent of pattern segmentation. */
  sourceLayer?: number;
}
export interface EventPlan extends TempoMap {
  events: AudioEvent[];
  endTick: number;
  secondsPerTick: number;
}
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const pan = (n: number) => clamp((n - 100) / 100, -1, 1);

export function sampleEvent(project: Project, sampleId: string): AudioEvent {
  const sample = project.samples.find((s) => s.id === sampleId);
  if (!sample) throw new Error(`Missing sample: ${sampleId}`);
  if (!sample.dataUrl && !sample.builtin)
    throw new Error(`Sample has no audio: ${sample.name}`);
  return {
    id: sampleId,
    kind: "sample",
    sampleId,
    tick: 0,
    durationTicks: Infinity,
    offsetTicks: 0,
    playbackRate: 1,
    gain: clamp(sample.volume, 0, 100) / 100,
    pan: pan(sample.panning),
  };
}

export function noteEvent(
  project: Project,
  note: Note,
  layer?: Layer,
): AudioEvent {
  const instrument = project.instruments.find((i) => i.id === note.instrument);
  if (!instrument) throw new Error(`Missing instrument: ${note.instrument}`);
  const target =
    instrument.mappingTargetId === undefined
      ? instrument
      : project.instruments.find((i) => i.id === instrument.mappingTargetId)!;
  const event = sampleEvent(project, target.sampleId);
  const sample = project.samples.find((s) => s.id === target.sampleId)!;
  // NBS calculations and OpenNBS toggle_playing/play_sound: layer center keeps
  // note pan; other layers average it. Custom instrument key ADDS key - 45.
  const notePan = note.panning ?? 100;
  const nbsPan =
    !layer || layer.panning === 100 ? notePan : (layer.panning + notePan) / 2;
  return {
    ...event,
    id: note.id,
    kind: "note",
    playbackRate:
      2 **
      ((note.pitch -
        sample.rootKey +
        instrument.key -
        45 +
        (note.finePitch ?? 0) / 100) /
        12),
    gain:
      (((event.gain * clamp(note.velocity, 0, 100)) / 100) *
        clamp(layer?.volume ?? 100, 0, 100)) /
      100,
    pan: pan(nbsPan + sample.panning - 100),
  };
}

export function buildEvents(project: Project, scope = "song"): EventPlan {
  const events: AudioEvent[] = [];
  const secondsPerTick = 60 / project.bpm / 4;
  function addPattern(
    pattern: Pattern,
    id: string,
    tick: number,
    length: number,
    offset: number,
    tailTicks?: number,
  ) {
    const solo = pattern.layers.some((l) => l.solo);
    for (const note of pattern.notes) {
      const layer = pattern.layers[note.layer];
      if (!layer || layer.muted || (solo && !layer.solo)) continue;
      if (
        note.tick < offset ||
        note.tick >= offset + length ||
        note.tick >= pattern.length
      )
        continue;
      const event = noteEvent(project, note, layer);
      events.push({
        ...event,
        id: `${id}:${note.id}`,
        tick: tick + note.tick - offset,
        sourceLayer: (layer.sourceIndex ?? note.layer) + 1,
        durationTicks:
          tailTicks !== undefined
            ? Math.max(0, tailTicks - (note.tick - offset))
            : Math.min(
                length - (note.tick - offset),
                pattern.length - note.tick,
              ),
      });
    }
  }
  let endTick: number;
  if (scope !== "song") {
    const pattern = [...project.patterns, ...(project.phrases ?? [])].find(
      (p) => p.id === scope,
    );
    if (pattern) {
      endTick = pattern.length;
      addPattern(pattern, pattern.id, 0, pattern.length, 0);
    } else {
      const sample = project.samples.find((s) => s.id === scope);
      if (!sample) throw new Error(`Missing source: ${scope}`);
      // Unknown duration is resolved from the decoded AudioBuffer by the engine.
      endTick =
        sample.duration === undefined
          ? Infinity
          : sample.duration / secondsPerTick;
      events.push({
        ...sampleEvent(project, sample.id),
        id: `${sample.id}:sample`,
        durationTicks: endTick,
      });
    }
  } else {
    endTick = ticksPerBar(project.meter);
    for (const clip of project.clips)
      endTick = Math.max(endTick, clip.tick + clip.length);
    const solo = project.tracks.some((t) => t.solo);
    for (const clip of project.clips) {
      const track = project.tracks[clip.track];
      if (
        clip.muted ||
        !track ||
        track.muted ||
        (solo && !track.solo) ||
        clip.length <= 0
      )
        continue;
      if (clip.kind === "pattern" || clip.kind === "phrase") {
        const pattern = (
          clip.kind === "pattern" ? project.patterns : (project.phrases ?? [])
        ).find((p) => p.id === clip.sourceId);
        if (!pattern) throw new Error(`Missing pattern: ${clip.sourceId}`);
        addPattern(
          pattern,
          clip.id,
          clip.tick,
          clip.length,
          clip.offset,
          clip.tailTicks,
        );
      } else {
        events.push({
          ...sampleEvent(project, clip.sourceId),
          id: `${clip.id}:sample`,
          tick: clip.tick,
          durationTicks: clip.length,
          offsetTicks: clip.offset,
        });
      }
    }
  }
  events.sort((a, b) => a.tick - b.tick);
  if (scope === "song") {
    capStoppedTails(events, project);
    for (const control of project.nbsEvents ?? [])
      endTick = Math.max(endTick, control.tick + 1);
  }
  return {
    events,
    endTick,
    secondsPerTick,
    ...buildTempoMap(project.bpm, scope === "song" ? project.nbsEvents : []),
  };
}

/** Reverse sweep: range-min updates and point queries avoid notes × controls work. */
function capStoppedTails(events: AudioEvent[], project: Project) {
  const stops = (project.nbsEvents ?? [])
    .flatMap((event) => {
      const range = stopRangeForEvent(event);
      return range ? [{ tick: event.tick, ...range }] : [];
    })
    .sort((a, b) => b.tick - a.tick);
  if (!stops.length) return;
  const layers = [
    ...new Set(
      events.flatMap((e) =>
        e.sourceLayer === undefined ? [] : [e.sourceLayer],
      ),
    ),
  ].sort((a, b) => a - b);
  if (!layers.length) return;
  let size = 1;
  while (size < layers.length) size *= 2;
  const cuts = new Float64Array(size * 2).fill(Infinity);
  function lower(value: number) {
    let lo = 0,
      hi = layers.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (layers[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  let next = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    // A stopper executes before new triggers on its tick, so only strictly earlier notes are cut.
    while (next < stops.length && stops[next].tick > event.tick) {
      const stop = stops[next++];
      let left = (stop.start === 0 ? 0 : lower(stop.start)) + size;
      let right =
        (stop.start === 0 ? layers.length : lower(stop.end + 1)) + size;
      while (left < right) {
        if (left & 1) {
          cuts[left] = Math.min(cuts[left], stop.tick);
          left++;
        }
        if (right & 1) {
          --right;
          cuts[right] = Math.min(cuts[right], stop.tick);
        }
        left >>>= 1;
        right >>>= 1;
      }
    }
    if (event.sourceLayer === undefined) continue;
    let node = lower(event.sourceLayer) + size,
      cut = Infinity;
    while (node) {
      cut = Math.min(cut, cuts[node]);
      node >>>= 1;
    }
    event.durationTicks = Math.min(event.durationTicks, cut - event.tick);
  }
}

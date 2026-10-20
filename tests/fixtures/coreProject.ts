import { createEmptyProject, newLayer } from '../../src/shared/session';
import type { Project } from '../../src/shared/model';

/** Deterministic mixed-resource input for characterization and local benchmarks. */
export function coreProject(bars = 8, layers = 4, instrumentCount = 24): Project {
  const p = createEmptyProject();
  p.id = 'core-fixture';
  p.title = 'Core regression';
  p.tracks.forEach((track, i) => { track.id = `track-${i}`; });
  for (let id = 16; id < instrumentCount; id++) {
    const sampleId = `custom-${id}`;
    p.samples.push({ ...p.samples[0], id: sampleId, name: sampleId,
      originalPath: `${sampleId}.ogg`, builtin: 'harp' });
    p.instruments.push({ id, name: sampleId, sampleId, key: 45 + id % 5, pressKey: false });
  }
  p.instruments[instrumentCount - 1].mappingTargetId = 5;
  const length = bars * 16;
  p.patterns = [{
    id: 'whole', name: 'Whole', color: '#75b9ab', length,
    layers: Array.from({ length: layers }, (_, i) => ({ ...newLayer(i),
      id: `layer-${i}`, sourceIndex: i, name: `Voice ${String.fromCharCode(65 + i % 26)}`,
      volume: 60 + i % 41, panning: 80 + i % 41, muted: i === 2,
    })),
    notes: Array.from({ length: bars * layers * 4 }, (_, i) => ({
      id: `note-${i}`, tick: Math.floor(i / (layers * 4)) * 16 + i % 4 * 3.25,
      layer: Math.floor(i / 4) % layers, instrument: i % instrumentCount,
      pitch: 48 + i % 25, velocity: 60 + i % 41,
      ...(i % 3 ? {} : { panning: 75, finePitch: 25 }),
    })),
  }];
  p.clips = [{ id: 'whole-clip', kind: 'pattern', sourceId: 'whole', tick: 0,
    length, offset: 0, track: 0, muted: false }];
  p.loop.end = length;
  return p;
}

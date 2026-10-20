import { writeFileSync } from 'node:fs';
import { coreProject } from '../tests/fixtures/coreProject';
import { buildEvents } from '../src/shared/timeline';
import { toNbs } from '../src/shared/io';
import { organizeImportedProject } from '../src/shared/smartPattern';
import { Session } from '../src/shared/session';

const source = coreProject(128, 32, 128);
const arranged = structuredClone(source);
const session = new Session(source);
arranged.clips = Array.from({ length: 8 }, (_, i) => ({
  ...source.clips[0], id: `repeat-${i}`, tick: i * source.patterns[0].length,
}));
const measurements = [
  ['playback', () => buildEvents(arranged)],
  ['export-v6', () => toNbs(arranged, 6)],
  ['smart-pattern', () => organizeImportedProject(source)],
  ['smart-fallback', () => organizeImportedProject(source, { maxAnalysisBars: 0 })],
  ['session-snapshot', () => session.snapshot()],
] as const;
const results = measurements.map(([name, operation]) => {
  operation(); // Warm up; timings are observations, never pass/fail gates.
  const times = Array.from({ length: 7 }, () => {
    const start = performance.now();
    operation();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return { name, medianMs: +times[3].toFixed(2), minMs: +times[0].toFixed(2) };
});
const report = { node: process.version, sourceNotes: source.patterns[0].notes.length,
  renderedNotes: source.patterns[0].notes.filter(n => !source.patterns[0].layers[n.layer].muted).length * 8,
  results };
console.log(JSON.stringify(report, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));

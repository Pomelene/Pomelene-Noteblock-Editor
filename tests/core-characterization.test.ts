import { expect, it } from 'vitest';
import { toNbs } from '../src/shared/io';
import { buildEvents } from '../src/shared/timeline';
import { organizeImportedProject } from '../src/shared/smartPattern';
import { coreProject } from './fixtures/coreProject';

it('preserves complete export bytes, warnings and playback for reused, cropped and mapped sources', () => {
  const p = coreProject(2);
  p.phrases = [{ ...structuredClone(p.patterns[0]), id: 'phrase', name: 'Phrase' }];
  p.clips.push(
    { ...p.clips[0], id: 'crop', tick: 28.5, offset: 3.25, length: 17.5 },
    { ...p.clips[0], id: 'phrase-clip', kind: 'phrase', sourceId: 'phrase', tick: 48 },
    { ...p.clips[0], id: 'audio', kind: 'sample', sourceId: 'vanilla-0', tick: 80 },
  );
  for (const version of [5, 6] as const) {
    const exported = toNbs(p, version);
    expect({ bytes: Buffer.from(exported.data).toString('base64'), warnings: exported.warnings })
      .toMatchSnapshot(`NBS v${version}`);
  }
  const { events, endTick, secondsPerTick } = buildEvents(p);
  expect({ events, endTick, secondsPerTick }).toMatchSnapshot('playback');
});

it('preserves exact intelligent organization decisions and owns its returned data', () => {
  const p = coreProject();
  const original = structuredClone(p);
  const result = organizeImportedProject(p);
  expect(result).toMatchSnapshot('organized');
  expect(p).toEqual(original);
  result.project.samples[0].name = 'changed';
  expect(p).toEqual(original);
  const fallback = organizeImportedProject(p, { maxAnalysisBars: 0 });
  expect(fallback.summary.applicable).toBe(false);
  fallback.project.patterns[0].notes[0].pitch = 99;
  expect(p).toEqual(original);
});

it('retains independent ownership of nested layer extension data during organization', () => {
  const p = coreProject();
  const extension = { labels: ['original'] };
  Object.assign(p.patterns[0].layers[0], { extension });
  const result = organizeImportedProject(p);
  expect(result.summary.applicable).toBe(true);
  const output = result.project.patterns.flatMap(pattern => pattern.layers)
    .find(layer => layer.sourceIndex === 0)! as typeof p.patterns[0]['layers'][0] & { extension: typeof extension };
  output.extension.labels[0] = 'changed';
  expect(extension.labels).toEqual(['original']);
});

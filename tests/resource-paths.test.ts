import { expect, it } from 'vitest';
import { ProjectFiles, type FileDialogs } from '../src/main/files';
import { readAudioZip, writeAudioZip } from '../src/main/zip';
import { createEmptyProject, Session } from '../src/shared/session';

const dialogs: FileDialogs = {
  open: async () => '/sounds.zip', save: async () => '/export.zip',
  unsaved: async () => 'discard', sounds: async () => undefined,
};

it('associates every matching resource and updates a new resource reused through a Sounds prefix', async () => {
  const p = createEmptyProject();
  p.samples.push(...['shared-a', 'shared-b'].map(id => ({
    ...p.samples[0], id, originalPath: 'Sounds/Piano.ogg',
  })));
  p.samples.slice(-2).forEach(s => { delete s.builtin; });
  const session = new Session(p);
  const input = writeAudioZip(new Map([
    ['piano.ogg', new Uint8Array([1])],
    ['new.ogg', new Uint8Array([2])],
    ['Sounds/NEW.ogg', new Uint8Array([3])],
  ]));
  const files = new ProjectFiles({ session, dialogs, storage: {
    read: async () => input, write: async () => {},
  } });
  const result = await files.action('importInstruments');
  expect(result.warnings.join(' ')).toContain('已关联 3 个乐器采样，新增 1 个采样');
  const after = session.snapshot();
  expect(after.project.samples.filter(s => s.id.startsWith('shared-')).map(s => s.dataUrl))
    .toEqual(['data:audio/ogg;base64,AQ==', 'data:audio/ogg;base64,AQ==']);
  expect(after.project.samples.at(-1)?.dataUrl).toBe('data:audio/ogg;base64,Aw==');
  session.dispatch({ type: 'undo' });
  expect(session.snapshot().project).toEqual(p);
});

it.each([false, true])('deduplicates identical audio using case-insensitive paths (reverse=%s)', async reverse => {
  const p = createEmptyProject();
  const paths = ['sounds/Piano.ogg', 'SOUNDS/piano.OGG'];
  if (reverse) paths.reverse();
  for (const [i, originalPath] of paths.entries()) {
    const id = `external-${i}`;
    p.samples.push({ ...p.samples[0], id, originalPath,
      dataUrl: 'data:audio/ogg;base64,AQID' });
    delete p.samples.at(-1)!.builtin;
    p.instruments.push({ id: 16 + i, name: id, sampleId: id, key: 45, pressKey: false });
  }
  const outputs: Uint8Array[] = [];
  const files = new ProjectFiles({ session: new Session(p), dialogs, storage: {
    read: async () => new Uint8Array(),
    write: async (_path, bytes) => { outputs.push(bytes as Uint8Array); },
  } });
  expect((await files.action('exportInstruments')).ok).toBe(true);
  const entries = readAudioZip(outputs[0]);
  expect([...entries.keys()]).toEqual([paths[0]]);
  expect([...entries.values()][0]).toEqual(Buffer.from([1, 2, 3]));
});

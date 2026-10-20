import { expect, it, vi } from 'vitest';
import { Session, createDemoProject, createEmptyProject } from '../src/shared/session';

it('serves repeated isolated snapshots without serializing unchanged music again', () => {
  const session = new Session(createDemoProject());
  const stringify = vi.spyOn(JSON, 'stringify');
  try {
    const first = session.snapshot();
    first.project.title = 'external';
    expect(session.snapshot().project.title).not.toBe('external');
    expect(stringify).not.toHaveBeenCalled();
  } finally { stringify.mockRestore(); }
});

it('tracks the saved content through no-ops, rejected changes, undo, redo and replacement', () => {
  const s = new Session(createDemoProject());
  const original = s.snapshot();
  s.dispatch({ type: 'project:update', patch: { title: 'saved title' } });
  s.markSaved('/song.nbproject');
  const saved = s.snapshot();
  expect(saved.document).toEqual({ path: '/song.nbproject', dirty: false });
  expect(s.dispatch({ type: 'project:update', patch: { title: 'saved title' } })).toEqual(saved);
  expect(() => s.transact(p => { p.bpm = -1; })).toThrow();
  expect(s.snapshot()).toEqual(saved);
  expect(s.dispatch({ type: 'undo' }).document.dirty).toBe(true);
  expect(s.dispatch({ type: 'redo' }).document.dirty).toBe(false);
  s.dispatch({ type: 'project:update', patch: { title: original.project.title } });
  expect(s.snapshot().document.dirty).toBe(true);
  s.markSaved();
  expect(s.snapshot().document.dirty).toBe(false);
  expect(s.replace(createEmptyProject()).document).toEqual({ dirty: false });
});

it('isolates committed state from a retained transaction reference', () => {
  const s = new Session(createDemoProject());
  let captured: ReturnType<typeof createDemoProject> | undefined;
  s.transact(p => { captured = p; p.title = 'committed'; });
  captured!.title = 'late mutation';
  expect(s.snapshot().project.title).toBe('committed');
  expect(s.snapshot().document.dirty).toBe(true);
});

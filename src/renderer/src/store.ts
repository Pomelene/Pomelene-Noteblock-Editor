import { useSyncExternalStore } from "react";
import type { Command, Snapshot } from "../../shared/model";
let state: Snapshot | undefined;
const listeners = new Set<() => void>();
export function acceptsSnapshot(
  incoming: Snapshot,
  existing?: Snapshot,
): boolean {
  return (
    !existing ||
    incoming.generation > existing.generation ||
    (incoming.generation === existing.generation &&
      incoming.revision >= existing.revision)
  );
}
const emit = (s: Snapshot) => {
  if (acceptsSnapshot(s, state)) {
    state = s;
    for (const fn of listeners) fn();
  }
};
export function connect(onError?: (error: unknown) => void) {
  let active = true,
    off = () => {};
  const receive = (snapshot: Snapshot) => {
    if (active) emit(snapshot);
  };
  const fail = (error: unknown) => {
    if (active) onError?.(error);
  };
  try {
    off = window.studio.onSnapshot(receive);
    void Promise.resolve(window.studio.getSnapshot()).then(receive, fail);
  } catch (error) {
    fail(error);
  }
  return () => {
    active = false;
    off();
  };
}
export function useStudio() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}
export const currentGeneration = () => state?.generation;
export function execute(command: Command, originGeneration?: number) {
  return window.studio.dispatch(command, originGeneration).then((s) => {
    emit(s);
    return s;
  });
}
export function accept(s: Snapshot) {
  emit(s);
}

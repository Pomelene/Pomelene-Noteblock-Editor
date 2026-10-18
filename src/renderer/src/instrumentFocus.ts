export interface InstrumentChoice {
  id: number;
  name: string;
  count: number;
}
export function instrumentChoices(
  instruments: readonly { id: number; name: string }[],
  notes: readonly { instrument: number }[],
): InstrumentChoice[] {
  const counts = new Map<number, number>();
  for (const note of notes)
    counts.set(note.instrument, (counts.get(note.instrument) ?? 0) + 1);
  return instruments.map((i) => ({
    id: i.id,
    name: i.name,
    count: counts.get(i.id) ?? 0,
  }));
}
export function navigateInstrument(
  choices: readonly InstrumentChoice[],
  current: number,
  direction: -1 | 1,
  usedOnly = false,
): number {
  const index = choices.findIndex((i) => i.id === current);
  for (let step = 1; step <= choices.length; step++) {
    const choice =
      choices[(index + direction * step + choices.length * 2) % choices.length];
    if (!usedOnly || choice.count > 0) return choice.id;
  }
  return current;
}
/** Shared by canvas notes and velocity controls; focus never changes musical data. */
export function noteOpacity(
  noteInstrument: number,
  current: number,
  showAll: boolean,
  selected: boolean,
  subdued: boolean,
): number {
  if (selected) return 1;
  return Math.min(
    subdued ? 0.35 : 1,
    !showAll && noteInstrument !== current ? 0.22 : 1,
  );
}

export interface NbsControlEvent {
  id: string;
  tick: number;
  layer: number;
  instrument: number;
  /** Raw NBS key plus 21; protocol events may use the full byte. */
  pitch: number;
  velocity: number;
  panning: number;
  finePitch: number;
  kind: "tempo" | "stop" | "visual";
}

export function getNbsEventKind(
  name: string,
): NbsControlEvent["kind"] | undefined {
  if (name === "Tempo Changer") return "tempo";
  if (name === "Sound Stopper") return "stop";
  if (
    ["Toggle Rainbow", "Toggle Background Accent", "Show Save Popup"].includes(
      name,
    ) ||
    /^Change Color to #/i.test(name)
  )
    return "visual";
  return undefined;
}

export function tempoForEvent(event: NbsControlEvent): number | undefined {
  const tempo = Math.abs(event.finePitch / 15);
  return event.kind === "tempo" && Number.isFinite(tempo) && tempo > 0
    ? tempo
    : undefined;
}

export function stopRangeForEvent(
  event: NbsControlEvent,
): { start: number; end: number } | undefined {
  if (event.kind !== "stop") return undefined;
  const raw =
    (((event.velocity - 100) & 255) << 8) | ((event.panning - 100) & 255);
  const signed = raw >= 32768 ? raw - 65536 : raw;
  const start = Math.max(event.finePitch, 0);
  return { start, end: Math.max(signed, start) };
}

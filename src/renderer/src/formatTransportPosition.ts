import { ticksPerBar } from "../../shared/model";

/** BAR and BEAT are one-based; TICK preserves hundredths of a project tick. */
export function formatTransportPosition(
  position: number,
  meter: string,
): [string, string, string] {
  const bar = ticksPerBar(meter),
    beat = 16 / +meter.split("/")[1];
  return [
    String(Math.floor(position / bar) + 1).padStart(3, "0"),
    String(Math.floor((position % bar) / beat) + 1).padStart(2, "0"),
    String(Math.floor((position % beat) * 100)).padStart(3, "0"),
  ];
}

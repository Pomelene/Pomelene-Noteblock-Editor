import type { NbsControlEvent } from "./nbsEvents";
import { tempoForEvent } from "./nbsEvents";

export interface TempoMap {
  tickToSeconds(tick: number): number;
  secondsToTick(seconds: number): number;
}

/** Piecewise-linear audio-clock map; stable event order makes the last change win. */
export function buildTempoMap(
  bpm: number,
  events: readonly NbsControlEvent[] = [],
): TempoMap {
  const segments = [{ tick: 0, seconds: 0, secondsPerTick: 60 / bpm / 4 }];
  for (const event of [...events].sort((a, b) => a.tick - b.tick)) {
    const tempo = tempoForEvent(event);
    if (tempo === undefined || !(tempo > 0) || !Number.isFinite(tempo))
      continue;
    const previous = segments[segments.length - 1];
    const segment = {
      tick: event.tick,
      seconds:
        previous.seconds +
        (event.tick - previous.tick) * previous.secondsPerTick,
      secondsPerTick: 1 / tempo,
    };
    if (event.tick === previous.tick) segments[segments.length - 1] = segment;
    else segments.push(segment);
  }
  function find(value: number, key: "tick" | "seconds") {
    let lo = 0,
      hi = segments.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (segments[mid][key] <= value) lo = mid;
      else hi = mid;
    }
    return segments[lo];
  }
  return {
    tickToSeconds(tick) {
      const segment = find(tick, "tick");
      return segment.seconds + (tick - segment.tick) * segment.secondsPerTick;
    },
    secondsToTick(seconds) {
      const segment = find(seconds, "seconds");
      return (
        segment.tick + (seconds - segment.seconds) / segment.secondsPerTick
      );
    },
  };
}

import type { LayerGroup } from "./grouping";
import { boundarySupport, extractBars, noteTuple } from "./features";
import type { SmartPatternProfile } from "./profile";

export interface Segment {
  start: number;
  end: number;
}
interface Frequency {
  count: number;
  lastEnd: number;
}

/**
 * Exact bar tokens make candidate lookup O(bars × bounded candidate count).
 * Storage cost rewards non-overlapping recurrence, while overhead favors longer
 * unique phrases. Novelty only supports boundaries; it never makes notes equal.
 */
export function segmentGroup(
  group: LayerGroup,
  totalTicks: number,
  barTicks: number,
  profile: SmartPatternProfile,
): Segment[] {
  // A trigger exactly on a bar boundary still belongs to the following bar.
  const barCount =
    Math.floor(group.notes[group.notes.length - 1].tick / barTicks) + 1;
  const bars = extractBars(group.notes, barTicks, barCount);
  const vocabulary = new Map<string, number>();
  const tokens = bars.map((bar, index) => {
    const signature = JSON.stringify(
      bar.notes.map((n) => noteTuple(n, n.tick - index * barTicks, n.layer)),
    );
    let token = vocabulary.get(signature);
    if (token === undefined) {
      token = vocabulary.size;
      vocabulary.set(signature, token);
    }
    return token;
  });
  const choices: { end: number; key: string; noteCount: number }[][] =
    Array.from({ length: barCount }, () => []);
  const prefix = [0];
  for (const bar of bars)
    prefix.push(prefix[prefix.length - 1] + bar.notes.length);
  const frequencies = new Map<string, Frequency>();
  const supports = bars.map((bar, index) => index + 1 < barCount
    ? boundarySupport(bar, bars[index + 1], barTicks) : 1);
  for (let start = 0; start < barCount; start++) {
    const lengths = new Set(
      profile.candidateBars.map((n) => Math.min(n, barCount - start)),
    );
    for (const length of lengths) {
      const end = start + length;
      const key = `${length}:${tokens.slice(start, end).join(",")}`;
      choices[start].push({ end, key, noteCount: prefix[end] - prefix[start] });
      const frequency = frequencies.get(key);
      if (!frequency) frequencies.set(key, { count: 1, lastEnd: end });
      else if (start >= frequency.lastEnd) {
        frequency.count++;
        frequency.lastEnd = end;
      }
    }
    // Stable ties prefer longer phrases.
    choices[start].sort((a, b) => b.end - a.end);
  }
  const cost = Array(barCount + 1).fill(Infinity) as number[];
  const next = Array(barCount).fill(0) as number[];
  cost[barCount] = 0;
  for (let start = barCount - 1; start >= 0; start--) {
    for (const candidate of choices[start]) {
      const { end, key, noteCount } = candidate;
      const frequency = frequencies.get(key)!.count;
      const support = supports[end - 1];
      const localCost =
        noteCount === 0
          ? 0
          : (noteCount * profile.noteStorageCost + profile.patternOverhead) /
              frequency +
            profile.clipOverhead;
      const proposal =
        localCost +
        cost[end] +
        (noteCount ? profile.boundaryWeight * (1 - support) : 0);
      if (proposal < cost[start] - 1e-9) {
        cost[start] = proposal;
        next[start] = end;
      }
    }
  }
  const result: Segment[] = [];
  for (let start = 0; start < barCount; ) {
    const end = next[start];
    if (prefix[end] > prefix[start])
      result.push({
        start: start * barTicks,
        end: Math.min(totalTicks, end * barTicks),
      });
    start = end;
  }
  return result;
}

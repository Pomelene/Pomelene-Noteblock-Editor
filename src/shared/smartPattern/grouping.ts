import type { Note } from "../model";
import { noteOrder, type Lane } from "./features";
import type { SmartPatternProfile } from "./profile";

export interface LayerGroup {
  name: string;
  lanes: Lane[];
  sourceLayers: number[];
  notes: Note[];
}

function chordEvidence(
  a: Lane,
  b: Lane,
  profile: SmartPatternProfile,
): boolean {
  if (
    a.instrument !== b.instrument ||
    a.sourceLayer === b.sourceLayer ||
    Math.abs(a.medianPitch - b.medianPitch) > profile.maxChordRegisterDistance
  )
    return false;
  const smaller = a.onsets.size < b.onsets.size ? a.onsets : b.onsets;
  const larger = smaller === a.onsets ? b.onsets : a.onsets;
  if (smaller.size / larger.size < profile.coOnsetThreshold) return false;
  let common = 0;
  for (const tick of smaller) if (larger.has(tick)) common++;
  return common / larger.size >= profile.coOnsetThreshold;
}

/** Compare lanes with at most the bounded group's representative, never all song notes pairwise. */
export function groupLanes(
  lanes: Lane[],
  profile: SmartPatternProfile,
): LayerGroup[] | undefined {
  const groups: LayerGroup[] = [];
  for (const lane of lanes) {
    let group = groups.find((g) => {
      const representative = g.lanes[0];
      if (lane.authoredName && representative.authoredName)
        return (
          lane.authoredName.toLocaleLowerCase("en-US") ===
          representative.authoredName.toLocaleLowerCase("en-US")
        );
      // An authored family should not absorb an unrelated unnamed voice.
      if (lane.authoredName || representative.authoredName) return false;
      return chordEvidence(representative, lane, profile);
    });
    if (!group) {
      if (groups.length >= profile.maxGroups) return undefined;
      group = {
        name: lane.authoredName?.slice(0, 128) ?? `声部 ${groups.length + 1}`,
        lanes: [],
        sourceLayers: [],
        notes: [],
      };
      groups.push(group);
    }
    group.lanes.push(lane);
    if (!group.sourceLayers.includes(lane.sourceLayer))
      group.sourceLayers.push(lane.sourceLayer);
    for (const note of lane.notes) group.notes.push(note);
  }
  for (const group of groups) {
    group.sourceLayers.sort((a, b) => a - b);
    group.notes.sort(noteOrder);
  }
  return groups;
}

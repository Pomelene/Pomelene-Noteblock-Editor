/** Initial engineering heuristics, not claims about universal musical structure. */
export interface SmartPatternProfile {
  candidateBars: readonly number[];
  maxAnalysisBars: number;
  maxLanes: number;
  maxGroups: number;
  maxPatterns: number;
  maxClips: number;
  maxBackupBytes: number;
  coOnsetThreshold: number;
  maxChordRegisterDistance: number;
  noteStorageCost: number;
  patternOverhead: number;
  clipOverhead: number;
  boundaryWeight: number;
}

export const ALGORITHM_VERSION = "nbs-structure-1" as const;
export const DEFAULT_SMART_PATTERN_PROFILE: Readonly<SmartPatternProfile> =
  Object.freeze({
    candidateBars: Object.freeze([1, 2, 3, 4, 6, 8]),
    maxAnalysisBars: 8192,
    maxLanes: 65536,
    maxGroups: 256,
    maxPatterns: 1024,
    maxClips: 10000,
    maxBackupBytes: 32 * 1024 * 1024,
    coOnsetThreshold: 0.72,
    maxChordRegisterDistance: 19,
    noteStorageCost: 3,
    patternOverhead: 12,
    clipOverhead: 3,
    boundaryWeight: 3,
  });

/** Overrides may tighten budgets, but never exceed the persisted format's limits. */
export function resolveProfile(
  overrides: Partial<SmartPatternProfile>,
): SmartPatternProfile {
  const profile = { ...DEFAULT_SMART_PATTERN_PROFILE, ...overrides };
  for (const key of [
    "maxAnalysisBars",
    "maxLanes",
    "maxGroups",
    "maxPatterns",
    "maxClips",
    "maxBackupBytes",
  ] as const) {
    const value = profile[key];
    profile[key] = Number.isFinite(value)
      ? Math.max(
          0,
          Math.min(Math.floor(value), DEFAULT_SMART_PATTERN_PROFILE[key]),
        )
      : DEFAULT_SMART_PATTERN_PROFILE[key];
  }
  profile.candidateBars = [...new Set(profile.candidateBars)]
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 8)
    .sort((a, b) => a - b);
  if (!profile.candidateBars.length)
    profile.candidateBars = DEFAULT_SMART_PATTERN_PROFILE.candidateBars;
  for (const key of [
    "coOnsetThreshold",
    "maxChordRegisterDistance",
    "noteStorageCost",
    "patternOverhead",
    "clipOverhead",
    "boundaryWeight",
  ] as const)
    if (!Number.isFinite(profile[key]) || profile[key] < 0)
      profile[key] = DEFAULT_SMART_PATTERN_PROFILE[key];
  profile.coOnsetThreshold = Math.min(1, profile.coOnsetThreshold);
  return profile;
}

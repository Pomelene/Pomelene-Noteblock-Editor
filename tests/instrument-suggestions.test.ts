import { expect, it } from "vitest";
import { createEmptyProject, newLayer } from "../src/shared/session";
import { suggestInstrumentMapping } from "../src/shared/instrumentMapping";
it("bases deterministic suggestions on actual low register, rhythm and name evidence", () => {
  const p = createEmptyProject();
  p.samples.push({ ...p.samples[0], id: "lost", builtin: undefined });
  p.instruments.push({
    id: 16,
    name: "unknown",
    sampleId: "lost",
    key: 45,
    pressKey: false,
  });
  p.patterns.push({
    id: "pattern",
    name: "pattern",
    color: "#fff",
    length: 32,
    layers: [newLayer()],
    notes: Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      tick: i * 4,
      layer: 0,
      pitch: 28,
      instrument: 16,
      velocity: 100,
    })),
  });
  const s = suggestInstrumentMapping(p, 16)!;
  expect(s.targetId).toBe(1);
  expect(s.reasons.join(" ")).toContain("低音");
  expect(suggestInstrumentMapping(p, 16)).toEqual(s);
  p.instruments[16].name = "snare drum";
  expect(suggestInstrumentMapping(p, 16)?.targetId).toBe(3);
  expect(p.instruments[16].mappingTargetId).toBeUndefined();
});

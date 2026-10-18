import { expect, it } from "vitest";
import { decodeNbs, encodeNbs } from "../src/legacy/nbs";
import { fromNbs, encodeProject, decodeProject } from "../src/shared/io";
import { Session } from "../src/shared/session";
import { organizeImportedProject } from "../src/shared/smartPattern";
import { ProjectFiles } from "../src/main/files";

// Independently written miniature NBS files; no corpus music is embedded here.
function fixture(
  options: {
    version?: number;
    height?: number;
    layer?: number;
    padding?: number[];
    count?: number;
    velocity?: number;
    vanilla?: number;
    instrument?: number;
    custom?: boolean;
  } = {},
) {
  const { version = 0, height = 1, layer = 0, count = 1 } = options;
  const chunks: Buffer[] = [];
  const byte = (n: number) => chunks.push(Buffer.from([n]));
  const short = (n: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n);
    chunks.push(b);
  };
  const int = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(n);
    chunks.push(b);
  };
  const str = (s: string) => {
    const b = Buffer.from(s);
    int(b.length);
    chunks.push(b);
  };
  short(version ? 0 : 4);
  if (version) {
    byte(version);
    byte(options.vanilla ?? 16);
    if (version >= 3) short(4);
  }
  short(height);
  str("Synthetic");
  str("");
  str("");
  str("");
  short(800);
  byte(0);
  byte(10);
  byte(4);
  for (let i = 0; i < 5; i++) int(0);
  str("");
  if (version >= 4) {
    byte(0);
    byte(0);
    short(0);
  }
  // One tick with many layers allows testing note budgets without exceeding NBS song length.
  let previousTick = -1;
  for (let tick = 0, written = 0; written < count; tick++) {
    short(tick - previousTick);
    previousTick = tick;
    for (let lane = 0; lane < height && written < count; lane++, written++) {
      short(written === 0 ? layer + 1 : 1);
      byte(options.instrument ?? 0);
      byte(39);
      if (version >= 4) {
        byte(options.velocity ?? 100);
        byte(100);
        short(0);
      }
    }
    short(0);
  }
  short(0);
  for (let i = 0; i < height; i++) {
    str(i === 0 ? "Original layer" : "");
    if (version >= 4) byte(0);
    byte(100);
    if (version >= 2) byte(100);
  }
  byte(options.custom ? 1 : 0);
  if (options.custom) {
    str("Synthetic custom");
    str("sample.ogg");
    byte(45);
    byte(0);
  }
  if (options.padding) chunks.push(Buffer.from(options.padding));
  return Buffer.concat(chunks);
}

it("opens classic files with zero-filled allocation padding and discloses it", () => {
  const project = decodeNbs(fixture({ padding: Array(48).fill(0) }));
  expect(project.patterns[0].notes).toMatchObject([
    { tick: 0, layer: 0, pitch: 60 },
  ]);
  expect(project.nbs?.warnings.join(" ")).toMatch(/padding|填充/i);
});

it("still rejects nonzero bytes after complete NBS sections", () => {
  expect(() => decodeNbs(fixture({ padding: [0, 0, 7] }))).toThrow(/trailing/i);
});

it("keeps notes beyond an understated classic layer header and supplies missing layer settings", () => {
  const project = decodeNbs(fixture({ height: 1, layer: 2 }));
  expect(project.patterns[0].notes).toMatchObject([
    { tick: 0, layer: 2, pitch: 60 },
  ]);
  expect(project.nbs?.layers).toHaveLength(3);
  expect(project.nbs?.layers[0].name).toBe("Original layer");
  expect(project.nbs?.layers[2]).toEqual({
    name: "",
    volume: 100,
    panning: 100,
    locked: 0,
  });
  expect(project.nbs?.warnings.join(" ")).toMatch(/layer|图层/i);
  expect(decodeNbs(encodeNbs(project)).patterns[0].notes).toMatchObject([
    { tick: 0, layer: 2, pitch: 60 },
  ]);
});

it("imports and exports large valid note streams without losing the final note", () => {
  const project = decodeNbs(
    fixture({ version: 5, height: 100, count: 265495 }),
  );
  expect(project.patterns[0].notes).toHaveLength(265495);
  expect(project.patterns[0].notes.at(-1)).toMatchObject({
    tick: 2654,
    layer: 94,
    pitch: 60,
  });
  expect(decodeNbs(encodeNbs(project)).patterns[0].notes).toHaveLength(265495);
}, 15000);

it("normalizes out-of-spec velocity with an explicit compatibility warning, without losing notes", () => {
  const project = decodeNbs(fixture({ version: 5, velocity: 125 }));
  expect(project.patterns[0].notes[0].velocity).toBe(100);
  expect(project.nbs?.warnings.join(" ")).toMatch(/125.*100/);
});

it("reads extended vanilla IDs in classic files that have no custom instrument definitions", () => {
  const project = decodeNbs(fixture({ instrument: 14 }));
  expect(project.patterns[0].notes[0].instrument).toBe(14);
  expect(project.nbs?.warnings.join(" ")).toMatch(/原版|vanilla/i);
});
it("reads version 6 custom instrument offsets without confusing them with the new copper instruments", () => {
  const project = decodeNbs(
    fixture({ version: 6, vanilla: 20, instrument: 20, custom: true }),
  );
  expect(project.patterns[0].notes[0].instrument).toBe(16);
  expect(project.nbs?.customInstruments[0].name).toBe("Synthetic custom");
  expect(decodeNbs(encodeNbs(project)).patterns[0].notes[0].instrument).toBe(
    16,
  );
});
it("retains version 6 copper instruments as named portable custom resources rather than substituting another tone", () => {
  const project = decodeNbs(
    fixture({ version: 6, vanilla: 20, instrument: 18 }),
  );
  expect(project.patterns[0].notes[0].instrument).toBe(16);
  expect(project.nbs?.customInstruments[0]).toMatchObject({
    name: "Weathered Trumpet",
    key: 45,
  });
  expect(project.nbs?.warnings.join(" ")).toMatch(/铜号|Trumpet/);
  expect(decodeNbs(encodeNbs(project)).nbs?.customInstruments[0].name).toBe(
    "Weathered Trumpet",
  );
});

it("rejects truncated note streams rather than treating incomplete notes as optional metadata", () => {
  const bytes = fixture({ version: 5 });
  // Header is 66 bytes for this title; truncate in the first note's six-byte payload.
  expect(() => decodeNbs(bytes.subarray(0, 69))).toThrow(/Truncated/);
});
it("opens, saves and reopens a 265,495-note project through the actual application schema", () => {
  const p = fromNbs(fixture({ version: 5, height: 100, count: 265495 }));
  const session = new Session(p);
  const reopened = decodeProject(encodeProject(session.snapshot().project));
  expect(reopened.patterns[0].notes).toHaveLength(265495);
  expect(reopened.patterns[0].notes.at(-1)?.tick).toBe(2654);
}, 30000);
it("includes parser compatibility notices in the import preview", () => {
  const p = fromNbs(fixture({ padding: [0, 0, 0] }));
  expect(organizeImportedProject(p).summary.warnings.join(" ")).toMatch(
    /padding|填充/,
  );
});
it("preserves v6 source metadata through a complete project save and reopen", () => {
  const p = fromNbs(
    fixture({ version: 6, vanilla: 20, instrument: 20, custom: true }),
  );
  expect(decodeProject(encodeProject(p)).nbs?.version).toBe(6);
});
it("shows compatibility notices once in the import preview rather than a second blocking dialog", async () => {
  let previewWarnings: string[] = [];
  const files = new ProjectFiles({session:new Session(),soundsRoots:[],
    dialogs:{open:async()=>'/synthetic.nbs',save:async()=>undefined,unsaved:async()=>'discard',sounds:async()=>undefined},
    storage:{read:async()=>fixture({padding:[0,0,0]}),write:async()=>{}},
    chooseImport:async summary=>{previewWarnings=summary.warnings;return 'original';},
  });
  const result=await files.action('open');
  expect(previewWarnings.join(' ')).toMatch(/padding|填充/);
  expect(result.warnings).toEqual([]);
});

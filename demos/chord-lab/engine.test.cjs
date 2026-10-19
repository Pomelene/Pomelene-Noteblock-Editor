const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./chord-engine.js");
const E = globalThis.PomeleneChords;

test("major/minor/seventh/extensions use musical intervals rather than scale step numbers", () => {
  assert.deepEqual(E.voice({ root: 60, quality: "major" }), [60, 64, 67]);
  assert.deepEqual(E.voice({ root: 60, quality: "minor" }), [60, 63, 67]);
  assert.deepEqual(E.voice({ root: 60, quality: "dom7" }), [60, 64, 67, 70]);
  assert.deepEqual(
    E.voice({ root: 60, quality: "maj7", extension: "9" }),
    [60, 64, 67, 71, 74],
  );
});
test("inversion, open voicing and slash bass preserve chord pitch classes", () => {
  assert.deepEqual(
    E.voice({ root: 60, quality: "major", inversion: 1 }),
    [64, 67, 72],
  );
  assert.deepEqual(
    E.voice({ root: 60, quality: "major", spread: true }),
    [60, 67, 76],
  );
  assert.deepEqual(
    E.voice({ root: 60, quality: "major", bass: 4 }),
    [52, 60, 64, 67],
  );
});
test("diatonic strips respect major and natural minor qualities", () => {
  const major = E.palette(0, "major", 4);
  assert.deepEqual(
    major.map((c) => c.root),
    [60, 62, 64, 65, 67, 69, 71],
  );
  assert.deepEqual(
    major.map((c) => c.quality),
    ["major", "minor", "minor", "major", "major", "minor", "dim"],
  );
  const minor = E.palette(9, "minor", 3);
  assert.deepEqual(
    minor.map((c) => c.root),
    [57, 59, 60, 62, 64, 65, 67],
  );
  assert.deepEqual(
    minor.map((c) => c.quality),
    ["minor", "dim", "major", "minor", "minor", "major", "major"],
  );
});
test("one click produces one atomic group of notes at the selected tick", () => {
  const notes = E.generate(
    { root: 60, quality: "major" },
    { tick: 12, mode: "block", velocity: 75, instrument: "harp" },
  );
  assert.deepEqual(
    notes.map((n) => [n.tick, n.pitch]),
    [
      [12, 60],
      [12, 64],
      [12, 67],
    ],
  );
  assert.ok(notes.every((n) => n.velocity === 75 && n.instrument === "harp"));
  assert.deepEqual(
    E.generate({ root: 60, quality: "major" }, { tick: 12, mode: "down" }).map(
      (n) => [n.tick, n.pitch],
    ),
    [
      [12, 67],
      [13, 64],
      [14, 60],
    ],
  );
});
test("out-of-range chords and end-of-grid arpeggios reject without silently dropping tones", () => {
  assert.throws(() => E.voice({ root: 108, quality: "major" }), /NBS/);
  assert.throws(
    () => E.generate({ root: 60, quality: "major" }, { tick: 63, mode: "up" }),
    /时间/,
  );
  assert.throws(() => E.voice({ root: 60, quality: "missing" }), /和弦/);
  assert.throws(
    () => E.generate({ root: 60, quality: "major" }, { tick: NaN }),
    /时间/,
  );
});

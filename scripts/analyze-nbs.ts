import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, extname, basename } from "node:path";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { fromNbs, toNbs } from "../src/shared/io";
import {
  organizeImportedProject,
  collectMusicalEvents,
} from "../src/shared/smartPattern";
import { buildEvents } from "../src/shared/timeline";
import type { Project } from "../src/shared/model";
const corpus = process.argv[2];
if (!corpus) throw Error("Usage: node scripts/analyze-nbs.cjs <folder>");
const result: unknown[] = [];
function audible(project: Project) {
  const copy = structuredClone(project);
  for (const s of copy.samples)
    if (!s.builtin && !s.dataUrl) s.dataUrl = "data:audio/wav;base64,AAAA";
  const p = buildEvents(copy);
  return {
    endTick: p.endTick,
    secondsPerTick: p.secondsPerTick,
    events: p.events
      .map(({ id, ...e }) => e)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}
for (const entry of (await readdir(corpus, { withFileTypes: true }))
  .filter((e) => e.isFile() && extname(e.name).toLowerCase() === ".nbs")
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const started = performance.now();
  try {
    const original = fromNbs(await readFile(join(corpus, entry.name))),
      out = organizeImportedProject(original);
    const preserved = isDeepStrictEqual(
      collectMusicalEvents(original),
      collectMusicalEvents(out.project),
    );
    const audioPreserved = isDeepStrictEqual(
      audible(original),
      audible(out.project),
    );
    let exportable = false,
      exportPreserved = false,
      exportError = "";
    try {
      const exported = fromNbs(toNbs(out.project).data);
      const baseline = fromNbs(toNbs(original).data);
      exportable = true;
      // Compare both through the same format conversion so existing NBS
      // export restrictions are not attributed to organization heuristics.
      exportPreserved = isDeepStrictEqual(
        collectMusicalEvents(baseline),
        collectMusicalEvents(exported),
      );
    } catch (e) {
      exportError = String(e);
    }
    const row = {
      file: entry.name,
      milliseconds: Math.round(performance.now() - started),
      notes: out.summary.noteCount,
      groups: out.summary.proposed.tracks,
      patterns: out.summary.proposed.patterns,
      clips: out.summary.proposed.clips,
      reused: out.summary.proposed.reusedClips,
      applied: out.summary.applicable,
      preserved,
      audioPreserved,
      exportable,
      exportPreserved,
      exportError,
      warnings: out.summary.warnings,
    };
    result.push(row);
    console.log(JSON.stringify(row));
    if (!preserved || !audioPreserved || !exportable || !exportPreserved)
      process.exitCode = 1;
  } catch (e) {
    const row = { file: entry.name, error: String(e) };
    result.push(row);
    console.log(JSON.stringify(row));
    process.exitCode = 1;
  }
}
await mkdir(resolve("test-results"), { recursive: true });
await writeFile(
  resolve("test-results/smart-pattern-corpus.json"),
  JSON.stringify(
    {
      source: basename(resolve(corpus)),
      date: new Date().toISOString(),
      results: result,
    },
    null,
    2,
  ),
);

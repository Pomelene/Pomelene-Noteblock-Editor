import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, extname, basename, relative, dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { encodeProject, fromNbs, toNbs } from "../src/shared/io";
import {
  organizeImportedProject,
  collectMusicalEvents,
} from "../src/shared/smartPattern";
import { buildEvents } from "../src/shared/timeline";
import type { Project } from "../src/shared/model";
const corpus = process.argv[2];
if (!corpus)
  throw Error("Usage: node scripts/analyze-nbs.cjs <folder> [output.json]");
const output = resolve(
  process.argv[3] ?? "test-results/smart-pattern-corpus.json",
);
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
for (const entry of (
  await readdir(corpus, { withFileTypes: true, recursive: true })
)
  .filter((e) => e.isFile() && extname(e.name).toLowerCase() === ".nbs")
  .sort((a, b) =>
    join(a.parentPath, a.name).localeCompare(join(b.parentPath, b.name)),
  )) {
  const file = relative(corpus, join(entry.parentPath, entry.name));
  const started = performance.now();
  try {
    const original = fromNbs(
        await readFile(join(entry.parentPath, entry.name)),
      ),
      organizing = performance.now(),
      out = organizeImportedProject(original),
      organizeMilliseconds = Math.round(performance.now() - organizing);
    let sessionError = "", projectBytes = 0;
    try {
      projectBytes = encodeProject(out.project).byteLength;
    } catch (e) {
      sessionError = String(e);
    }
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
      file,
      milliseconds: Math.round(performance.now() - started),
      organizeMilliseconds,
      backupBytes: out.project.importOrganization
        ? Buffer.byteLength(out.project.importOrganization.originalData)
        : 0,
      sessionError,
      projectBytes,
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
    if (
      !preserved ||
      !audioPreserved ||
      !exportable ||
      !exportPreserved ||
      sessionError
    )
      process.exitCode = 1;
  } catch (e) {
    const row = { file, error: String(e) };
    result.push(row);
    console.log(JSON.stringify(row));
    process.exitCode = 1;
  }
}
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
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

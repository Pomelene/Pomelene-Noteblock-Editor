import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { decodeNbs, encodeNbs } from "../src/legacy/nbs";
import { fromNbs, toNbs } from "../src/shared/io";
const corpus = process.argv[2];
if (!corpus)
  throw Error(
    "Usage: node scripts/nbs-compatibility.cjs <folder> [report.json]",
  );
async function files(folder: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isDirectory())
      result.push(...(await files(join(folder, entry.name))));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".nbs"))
      result.push(join(folder, entry.name));
  }
  return result.sort();
}
const rows: Record<string, unknown>[] = [];
const musical = (project: ReturnType<typeof decodeNbs>) => ({
  bpm: project.bpm,
  meter: project.meter,
  notes: project.patterns.flatMap((p) =>
    p.notes.map(({ id: _id, ...note }) => note),
  ),
  controls:
    project.nbs?.controlEvents?.map(({ id: _id, ...event }) => event) ?? [],
});
for (const file of await files(corpus)) {
  const data = await readFile(file);
  const row: Record<string, unknown> = {
    file: relative(corpus, file),
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    version: data.length < 2 ? null : data.readUInt16LE(0) === 0 ? data[2] : 0,
  };
  let decoded;
  try {
    decoded = decodeNbs(data);
    row.decode = true;
    row.notes = decoded.patterns[0].notes.length;
    row.layers = decoded.nbs?.layers.length;
    row.warnings = decoded.nbs?.warnings;
  } catch (error) {
    row.decode = false;
    row.decodeError = String(error);
  }
  try {
    const project = fromNbs(data);
    row.import = true;
    try {
      const exported = toNbs(project),
        imported = decodeNbs(exported.data);
      row.export = true;
      row.exportWarnings = exported.warnings;
      row.musicalRoundTrip = isDeepStrictEqual(
        musical(decoded!),
        musical(imported),
      );
      row.roundTripNotes = imported.patterns[0].notes.length;
    } catch (error) {
      row.export = false;
      row.exportError = String(error);
    }
  } catch (error) {
    row.import = false;
    row.importError = String(error);
  }
  if (decoded)
    try {
      row.codecRoundTrip = isDeepStrictEqual(
        musical(decoded),
        musical(decodeNbs(encodeNbs(decoded))),
      );
    } catch (error) {
      row.codecExportError = String(error);
    }
  rows.push(row);
}
const summary = {
  files: rows.length,
  decoded: rows.filter((r) => r.decode).length,
  imported: rows.filter((r) => r.import).length,
  exported: rows.filter((r) => r.export).length,
  musicalRoundTrips: rows.filter((r) => r.musicalRoundTrip).length,
  errors: rows
    .filter((r) => !r.import)
    .map((r) => ({ file: r.file, error: r.importError })),
};
const report = resolve(
  process.argv[3] ?? "test-results/nbs-compatibility/report.json",
);
await mkdir(resolve(report, ".."), { recursive: true });
await writeFile(report, JSON.stringify({ summary, rows }, null, 2) + "\n");
console.log(JSON.stringify({ ...summary, report }, null, 2));

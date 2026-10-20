import type { Project, Sample } from "./model";

export const COPPER_INSTRUMENTS = [
  { id: 16, name: "铜号 · Trumpet", nbsName: "Trumpet", file: "trumpet" },
  { id: 17, name: "斑驳铜号 · Exposed Trumpet", nbsName: "Exposed Trumpet", file: "trumpet_exposed" },
  { id: 18, name: "锈蚀铜号 · Weathered Trumpet", nbsName: "Weathered Trumpet", file: "trumpet_weathered" },
  { id: 19, name: "氧化铜号 · Oxidized Trumpet", nbsName: "Oxidized Trumpet", file: "trumpet_oxidized" },
] as const;

export function copperForSample(sample: Sample) {
  if (sample.dataUrl) return undefined;
  return COPPER_INSTRUMENTS.find(c => c.file === sample.builtin?.replace(/\.ogg$/, ""));
}

/** Internal IDs keep the existing custom base of 16; wire IDs are assigned on export. */
export function addCopperInstruments(project: Project): void {
  const samples = new Map(project.samples.map(s => [s.id, s]));
  const present = new Set(project.instruments.map(i => copperForSample(samples.get(i.sampleId)!)?.id));
  const occupied = new Set(project.instruments.map(i => i.id));
  project.nbs?.customInstruments.forEach((_, i) => occupied.add(16 + i));
  project.nbsEvents?.forEach(e => occupied.add(e.instrument));
  let nextId = 16;
  for (const copper of COPPER_INSTRUMENTS) {
    if (present.has(copper.id)) continue;
    while (occupied.has(nextId)) nextId++;
    if (nextId > 255) throw new Error("乐器编号已满，无法添加铜号；请先移除不使用的乐器");
    const id = nextId++;
    occupied.add(id);
    let sample = project.samples.find(s => s.builtin === copper.file && !s.dataUrl);
    if (!sample) {
      sample = {
        id: crypto.randomUUID(), name: copper.name, color: "#c79b71",
        builtin: copper.file, originalPath: `minecraft/${copper.file}.ogg`,
        rootKey: 66, volume: 100, panning: 100,
      };
      project.samples.push(sample);
    }
    project.instruments.push({ id, name: copper.name, sampleId: sample.id, key: 45, pressKey: false });
  }
}

/** Restore built-in playback for native v6 imports and earlier v6 conversion projects. */
export function bindCopperSamples(project: Project): Project {
  const instruments = new Map(project.instruments.map(i => [i.id, i]));
  const samples = new Map(project.samples.map(s => [s.id, s]));
  project.nbs?.customInstruments.forEach((definition, index) => {
    const copper = COPPER_INSTRUMENTS.find(c => definition.vanillaId === c.id ||
      (project.nbs?.version === 6 && definition.name === c.nbsName && definition.file === `minecraft/${c.file}.ogg`));
    if (!copper) return;
    const instrument = instruments.get(16 + index);
    const sample = instrument && samples.get(instrument.sampleId);
    if (sample && !sample.dataUrl && sample.originalPath===definition.file) {
      sample.builtin = copper.file;
      definition.vanillaId = copper.id;
    }
  });
  return project;
}

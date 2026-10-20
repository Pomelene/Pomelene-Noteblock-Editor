import type { Project, Sample } from './model';

export const COPPER_INSTRUMENTS = [
  { id:16, name:'铜号 · Trumpet', nbsName:'Trumpet', file:'trumpet' },
  { id:17, name:'斑驳铜号 · Exposed Trumpet', nbsName:'Exposed Trumpet', file:'trumpet_exposed' },
  { id:18, name:'锈蚀铜号 · Weathered Trumpet', nbsName:'Weathered Trumpet', file:'trumpet_weathered' },
  { id:19, name:'氧化铜号 · Oxidized Trumpet', nbsName:'Oxidized Trumpet', file:'trumpet_oxidized' },
] as const;

export function copperForSample(sample: Sample) {
  if (sample.dataUrl) return undefined;
  return COPPER_INSTRUMENTS.find(c => c.file === sample.builtin?.replace(/\.ogg$/,''));
}

/** Internal IDs keep the existing custom base of 16; wire IDs are assigned on export. */
export function addCopperInstruments(project: Project): void {
  const occupied = new Set(project.instruments.map(i=>i.id));
  project.nbs?.customInstruments.forEach((_,i)=>occupied.add(16+i));
  project.nbsEvents?.forEach(e=>occupied.add(e.instrument));
  for (const copper of COPPER_INSTRUMENTS) {
    if (project.instruments.some(i => copperForSample(project.samples.find(s=>s.id===i.sampleId)!)?.id===copper.id)) continue;
    const id = Array.from({length:240},(_,i)=>i+16).find(i=>!occupied.has(i));
    if (id===undefined) throw new Error('乐器编号已满，无法添加铜号；请先移除不使用的乐器');
    occupied.add(id);
    let sample = project.samples.find(s=>s.builtin===copper.file && !s.dataUrl);
    if (!sample) {
      sample={id:crypto.randomUUID(),name:copper.name,color:'#c79b71',builtin:copper.file,originalPath:`minecraft/${copper.file}.ogg`,rootKey:66,volume:100,panning:100};
      project.samples.push(sample);
    }
    project.instruments.push({id,name:copper.name,sampleId:sample.id,key:45,pressKey:false});
  }
}

/** Restore built-in playback for native v6 imports and earlier v6 conversion projects. */
export function bindCopperSamples(project: Project): Project {
  project.nbs?.customInstruments.forEach((definition,index)=>{
    const copper = COPPER_INSTRUMENTS.find(c => definition.vanillaId===c.id ||
      (project.nbs?.version===6 && definition.name===c.nbsName && definition.file===`minecraft/${c.file}.ogg`));
    if (!copper) return;
    const instrument=project.instruments.find(i=>i.id===16+index);
    const sample=project.samples.find(s=>s.id===instrument?.sampleId);
    if (sample && !sample.dataUrl && sample.originalPath===definition.file) {
      sample.builtin=copper.file;
      definition.vanillaId=copper.id;
    }
  });
  return project;
}

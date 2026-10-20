import { expect, it } from 'vitest';
import { createDemoProject, Session } from '../src/shared/session';
import { toNbs, fromNbs, encodeProject, decodeProject } from '../src/shared/io';
import { decodeNbs, encodeNbs } from '../src/legacy/nbs';
import { ProjectFiles } from '../src/main/files';
import { readAudioZip } from '../src/main/zip';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function copperProject() {
  const session = new Session(createDemoProject());
  const p = session.dispatch({ type: 'instrument:addCopper' }).project;
  const copper = p.instruments.filter(i => p.samples.find(s => s.id === i.sampleId)?.builtin?.startsWith('trumpet'));
  expect(copper).toHaveLength(4);
  p.patterns[0].notes = copper.map((i, index) => ({id:`c${index}`,tick:index,layer:0,pitch:66+index,instrument:i.id,velocity:100}));
  p.clips = [{id:'clip',kind:'pattern',sourceId:p.patterns[0].id,tick:0,length:p.patterns[0].length,offset:0,track:0,muted:false}];
  return p;
}

it('adds four reusable built-in copper instruments without displacing existing custom IDs and supports undo', () => {
  const s = new Session(createDemoProject());
  const first = s.dispatch({type:'instrument:addCopper'}).project;
  expect(first.instruments).toHaveLength(20);
  const second = s.dispatch({type:'instrument:addCopper'}).project;
  expect(second.instruments).toHaveLength(20);
  s.dispatch({type:'undo'});
  expect(s.snapshot().project.instruments).toHaveLength(16);
});

it('exports all four copper timbres as native v6 instruments and reopens without missing external sounds', () => {
  const p = copperProject();
  const {data,warnings} = toNbs(p,6);
  expect([...data.subarray(0,4)]).toEqual([0,0,6,20]);
  const raw = decodeNbs(data);
  expect(raw.nbs?.customInstruments.map(i => i.vanillaId)).toEqual([16,17,18,19]);
  const reopened = fromNbs(data);
  expect(reopened.patterns[0].notes.map(n => reopened.samples.find(s => s.id === reopened.instruments.find(i => i.id === n.instrument)?.sampleId)?.builtin)).toEqual(['trumpet','trumpet_exposed','trumpet_weathered','trumpet_oxidized']);
  expect(warnings.join(' ')).not.toMatch(/铜号.*采样包/);
  const saved = decodeProject(encodeProject(reopened));
  expect([...toNbs(saved,6).data.subarray(0,4)]).toEqual([0,0,6,20]);
});

it('keeps copper as playable custom definitions when explicitly exporting v5 and discloses the sample-pack requirement', () => {
  const {data,warnings} = toNbs(copperProject(),5);
  expect([...data.subarray(0,4)]).toEqual([0,0,5,16]);
  expect(decodeNbs(data).nbs?.customInstruments).toHaveLength(4);
  expect(warnings.join(' ')).toMatch(/v5.*铜号|铜号.*v5/);
});

it('does not promote an unrelated custom instrument named Trumpet into a v6 vanilla instrument', () => {
  const base = decodeNbs(toNbs(createDemoProject()).data);
  base.nbs!.customInstruments = [{name:'Trumpet',file:'my-custom.ogg',key:45,pressKey:0}];
  base.patterns[0].notes = [{id:'custom',tick:0,layer:0,pitch:66,instrument:16,velocity:100}];
  const bytes = encodeNbs(base,6);
  expect([...bytes.subarray(0,4)]).toEqual([0,0,6,20]);
  const result=decodeNbs(bytes);
  expect(result.nbs?.customInstruments[0]).toMatchObject({name:'Trumpet',file:'my-custom.ogg'});
  expect(result.nbs?.customInstruments[0].vanillaId).toBeUndefined();
});

it('enforces the v6 limit of 236 custom instruments rather than overflowing its byte IDs', () => {
  const p = decodeNbs(toNbs(createDemoProject()).data);
  p.nbs!.customInstruments = Array.from({length:237},(_,i)=>({name:`custom${i}`,file:`custom${i}.ogg`,key:45,pressKey:0}));
  expect(()=>encodeNbs(p,6)).toThrow(/236/);
  expect(()=>encodeNbs(p,5)).not.toThrow();
});

it('passes the selected version through file export and cancellation writes nothing', async () => {
  let selected:5|6|undefined=6, saves=0;
  const writes:Uint8Array[]=[];
  const files=new ProjectFiles({session:new Session(createDemoProject()),dialogs:{open:async()=>undefined,save:async()=>{saves++;return '/test.nbs'},unsaved:async()=>'discard',sounds:async()=>undefined,nbsVersion:async()=>selected},storage:{read:async()=>new Uint8Array(),write:async(_path,bytes)=>{writes.push(bytes as Uint8Array)}}});
  expect((await files.action('exportNbs')).ok).toBe(true);
  expect(writes[0][2]).toBe(6);
  selected=undefined;
  expect((await files.action('exportNbs')).ok).toBe(false);
  expect(writes).toHaveLength(1);
  expect(saves).toBe(1);
});

it('exports the bundled four copper sounds with the exact relative paths used by v5 definitions', async()=>{
  let written:Uint8Array|undefined;
  const files=new ProjectFiles({session:new Session(copperProject()),builtinSoundsRoot:resolve('src/renderer/public/sounds'),dialogs:{open:async()=>undefined,save:async()=>'/sounds.zip',unsaved:async()=>'cancel',sounds:async()=>undefined},storage:{read:async path=>readFileSync(path),write:async(_path,data)=>{written=data as Uint8Array}}});
  expect((await files.action('exportInstruments')).ok).toBe(true);
  const entries=readAudioZip(written!);
  expect([...entries.keys()].sort()).toEqual(['minecraft/trumpet.ogg','minecraft/trumpet_exposed.ogg','minecraft/trumpet_oxidized.ogg','minecraft/trumpet_weathered.ogg']);
  for (const [name,data] of entries) {
    expect(Buffer.from(data).subarray(0,4).toString()).toBe('OggS');
    expect(Buffer.from(data).equals(readFileSync(resolve('src/renderer/public/sounds',name.split('/')[1])))).toBe(true);
  }
});

it('remaps native instruments and control definitions together without shifting control payloads',()=>{
  const p=decodeNbs(toNbs(createDemoProject()).data);
  p.nbs!.customInstruments=[{name:'Trumpet',file:'minecraft/trumpet.ogg',key:45,pressKey:0,vanillaId:16},{name:'Tempo Changer',file:'',key:45,pressKey:0}];
  p.patterns[0].notes=[{id:'copper',tick:0,layer:0,instrument:16,pitch:66,velocity:100}];
  p.nbs!.controlEvents=[{id:'tempo',kind:'tempo',tick:1,layer:1,instrument:17,pitch:45,velocity:0,panning:100,finePitch:1200}];
  const out=decodeNbs(encodeNbs(p,6));
  expect(out.nbs?.controlEvents?.[0]).toMatchObject({kind:'tempo',tick:1,layer:1,instrument:16,finePitch:1200});
  expect(out.nbs?.customInstruments.map(i=>i.name)).toEqual(['Tempo Changer','Trumpet']);
});

it('can retain all 236 custom definitions alongside four native copper timbres',()=>{
  const p=decodeNbs(toNbs(createDemoProject()).data);
  p.nbs!.customInstruments=Array.from({length:240},(_,i)=>({name:`i${i}`,file:`i${i}.ogg`,key:45,pressKey:0,...(i<4 ? {vanillaId:16+i} : {})}));
  p.patterns[0].notes=[{id:'last',tick:0,layer:0,instrument:255,pitch:66,velocity:100}];
  const out=decodeNbs(encodeNbs(p,6));
  expect(out.nbs?.customInstruments).toHaveLength(236);
  expect(out.nbs?.customInstruments[235].name).toBe('i239');
  expect(out.patterns[0].notes[0].instrument).toBe(251);
});

it('rejects invalid copper identity metadata in saved projects',()=>{
  const p=fromNbs(toNbs(copperProject(),6).data);
  p.nbs!.customInstruments[0].vanillaId=99;
  expect(()=>encodeProject(p)).toThrow();
});

it('refuses conflicting audio at a copper sample path rather than overwriting a custom instrument in its ZIP', async()=>{
  const p=copperProject();
  p.samples.push({id:'conflict',name:'Conflicting audio',color:'#fff',dataUrl:'data:audio/ogg;base64,T2dnUw==',originalPath:'minecraft/trumpet.ogg',rootKey:66,volume:100,panning:100});
  p.instruments.unshift({id:20,name:'Conflicting audio',sampleId:'conflict',key:45,pressKey:false});
  let writes=0;
  const files=new ProjectFiles({session:new Session(p),builtinSoundsRoot:resolve('src/renderer/public/sounds'),dialogs:{open:async()=>undefined,save:async()=>'/sounds.zip',unsaved:async()=>'cancel',sounds:async()=>undefined},storage:{read:async path=>readFileSync(path),write:async()=>{writes++}}});
  await expect(files.action('exportInstruments')).rejects.toThrow(/共用|路径/);
  expect(writes).toBe(0);
});

it('adds copper around an existing custom ID and a reserved control ID without changing either identity',()=>{
  const p=fromNbs(toNbs(createDemoProject()).data);
  p.nbs!.customInstruments=[{name:'Existing custom',file:'custom.ogg',key:45,pressKey:0},{name:'Tempo Changer',file:'',key:45,pressKey:0}];
  p.instruments.push({...p.instruments[0],id:16,name:'Existing custom'});
  p.nbsEvents=[{id:'tempo',kind:'tempo',tick:16,layer:0,instrument:17,pitch:45,velocity:0,panning:100,finePitch:1200}];
  const s=new Session(p);
  const added=s.dispatch({type:'instrument:addCopper'}).project;
  expect(added.instruments.find(i=>i.id===16)?.name).toBe('Existing custom');
  expect(added.nbsEvents?.[0].instrument).toBe(17);
  expect(added.instruments.filter(i=>i.id>=18).map(i=>i.id)).toEqual([18,19,20,21]);
  expect(decodeNbs(toNbs(added,6).data).nbs?.controlEvents?.[0].kind).toBe('tempo');
});

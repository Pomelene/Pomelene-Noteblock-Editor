import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { decodeNbs, encodeNbs, getNbsExportWarnings } from '../src/shared/nbs'

// Independent, hand-built wire fixture; no production writer used.
function fixture(version: number, title = Buffer.from('Test'), options: { vanilla?: number; instrument?: number; customCount?: number; tail?: 'notes' | 'layers' } = {}): Buffer {
  const parts: Buffer[] = []
  const u8=(n:number)=>parts.push(Buffer.from([n]))
  const u16=(n:number)=>{const b=Buffer.alloc(2);b.writeUInt16LE(n & 65535);parts.push(b)}
  const i32=(n:number)=>{const b=Buffer.alloc(4);b.writeInt32LE(n);parts.push(b)}
  const str=(s:Buffer|string)=>{const b=typeof s==='string'?Buffer.from(s):s;i32(b.length);parts.push(b)}
  if(version>0){u16(0);u8(version);u8(options.vanilla ?? 16)}
  if(version===0||version>=3)u16(8)
  u16(1);str(title);str('Author');str('Original');str('Description');u16(801)
  u8(1);u8(5);u8(3);[1,2,3,4,5].forEach(i32);str('source.mid')
  if(version>=4){u8(1);u8(2);u16(1)}
  u16(1);u16(1);u8(options.instrument ?? 0);u8(39)
  if(version>=4){u8(70);u8(120);u16(-40)}
  u16(0);u16(0)
  if(options.tail==='notes')return Buffer.concat(parts)
  str('Lead');if(version>=4)u8(1);u8(80);if(version>=2)u8(140)
  if(options.tail==='layers')return Buffer.concat(parts)
  u8(options.customCount ?? 1)
  for(let i=0;i<(options.customCount ?? 1);i++){str('Custom');str('custom.ogg');u8(45);u8(1)}
  return Buffer.concat(parts)
}
describe('NBS codec',()=>{
  it.each(readdirSync('../references/OpenNBS/datafiles/Songs').filter(f=>f.endsWith('.nbs')))('imports and exports shipped OpenNBS song %s',file=>{
    const p=decodeNbs(readFileSync(`../references/OpenNBS/datafiles/Songs/${file}`))
    const q=decodeNbs(encodeNbs(p))
    expect(q.patterns[0].notes).toEqual(p.patterns[0].notes)
    expect(q.bpm).toEqual(p.bpm)
    expect(q.nbs?.layers).toEqual(p.nbs?.layers)
  })
  it.each([0,1,2,3,4,5])('reads independently constructed version %i',version=>{
    const p=decodeNbs(fixture(version))
    expect(p.bpm).toBeCloseTo(120.15);expect(p.meter).toBe('3/4')
    expect(p.patterns[0].notes[0]).toMatchObject({tick:0,layer:0,pitch:60,instrument:0,velocity:version>=4?70:100,panning:version>=4?120:100,finePitch:version>=4?-40:0})
    expect(p.nbs?.layers[0]).toEqual({name:'Lead',volume:80,panning:version>=2?140:100,locked:version>=4?1:0})
    expect(p.nbs?.customInstruments[0]).toEqual({name:'Custom',file:'custom.ogg',key:45,pressKey:1})
  })
  it('preserves metadata, note expression, original byte strings and tempo on v5 roundtrip',()=>{
    const bytes=fixture(5,Buffer.from([0xe9]));const p=decodeNbs(bytes)
    expect(p.title).toBe('é');expect(Buffer.from(encodeNbs(p))).toEqual(bytes)
  })
  it('flattens clip offsets and allocates collision layers without losing notes',()=>{
    const p=decodeNbs(fixture(5));p.clips.push({...p.clips[0],id:'overlap'},{...p.clips[0],id:'later',tick:8})
    const q=decodeNbs(encodeNbs(p));expect(q.patterns[0].notes.map(n=>[n.tick,n.layer])).toEqual([[0,0],[0,1],[8,0]])
    expect(q.nbs?.layers[1]).toEqual(q.nbs?.layers[0])
  })
  it('rejects every truncated prefix, unknown versions, invalid fields and trailing bytes',()=>{
    const bytes=fixture(5)
    const validEnds=[fixture(5,undefined,{tail:'notes'}).length,fixture(5,undefined,{tail:'layers'}).length]
    for(let end=0;end<bytes.length;end++)if(!validEnds.includes(end))expect(()=>decodeNbs(bytes.subarray(0,end))).toThrow()
    const future=Buffer.from(bytes);future[2]=6;expect(()=>decodeNbs(future)).toThrow(/version/i)
    const huge=Buffer.from(bytes);huge.writeInt32LE(2147483647,8);expect(()=>decodeNbs(huge)).toThrow()
    expect(()=>decodeNbs(Buffer.concat([bytes,Buffer.from([99])]))).toThrow(/trailing/i)
  })
  it('rejects unrepresentable meter, tempo, instrument and length instead of losing data',()=>{
    const p=decodeNbs(fixture(5));p.meter='7/8';expect(()=>encodeNbs(p)).toThrow(/meter/i)
    p.meter='4/4';p.bpm=10000;expect(()=>encodeNbs(p)).toThrow(/tempo/i)
    p.bpm=120;p.patterns[0].notes[0].instrument=255;expect(()=>encodeNbs(p)).toThrow(/instrument/i)
    p.patterns[0].notes[0].instrument=0;p.clips[0].tick=65535;expect(()=>encodeNbs(p)).toThrow(/length/i)
  })
  it.each([0,1,5])('maps legacy custom IDs to canonical editor IDs for version %i',version=>{
    const p=decodeNbs(fixture(version,undefined,{vanilla:10,instrument:10}))
    expect(p.patterns[0].notes[0].instrument).toBe(16)
    expect(p.nbs?.vanillaInstrumentCount).toBe(10)
    p.patterns[0].length=Math.max(2,p.patterns[0].length)
    p.patterns[0].notes.push({...p.patterns[0].notes[0],id:'new-built-in',tick:1,instrument:10})
    const encoded=encodeNbs(p);expect(encoded[3]).toBe(16)
    const q=decodeNbs(encoded)
    expect(q.patterns[0].notes.map(n=>n.instrument)).toEqual([16,10])
    expect(q.nbs?.customInstruments).toEqual(p.nbs?.customInstruments)
  })
  it('rejects future built-in instrument banks instead of interpreting them as known sounds',()=>{
    expect(()=>decodeNbs(fixture(5,undefined,{vanilla:17}))).toThrow(/vanilla instrument count/i)
  })
  it('retains all 255 custom definitions even when some have no addressable note ID',()=>{
    const p=decodeNbs(fixture(5,undefined,{customCount:255,instrument:255}))
    expect(p.patterns[0].notes[0].instrument).toBe(255)
    expect(p.nbs?.customInstruments).toHaveLength(255)
    expect(decodeNbs(encodeNbs(p)).nbs?.customInstruments).toEqual(p.nbs?.customInstruments)
  })
  it('rejects legacy notes whose remapped custom index exceeds the editor byte limit',()=>{
    expect(()=>decodeNbs(fixture(5,undefined,{vanilla:10,customCount:255,instrument:250}))).toThrow(/instrument.*range/i)
  })
  it.each([100,120.123,0.15,9830.25])('quantizes export BPM %s to NBS tempo precision',bpm=>{
    const p=decodeNbs(fixture(5));p.bpm=bpm
    const q=decodeNbs(encodeNbs(p))
    const expected=new Map([[100,100.05],[120.123,120.15],[0.15,0.15],[9830.25,9830.25]]).get(bpm)!
    expect(q.bpm).toBeCloseTo(expected,8)
    if(bpm!==expected)expect(getNbsExportWarnings(p).join(' ')).toContain(String(expected))
    else expect(getNbsExportWarnings(p)).toEqual([])
  })
  it('exports equal-length meter bars and discloses the notation conversion',()=>{
    const p=decodeNbs(fixture(5));p.meter='6/8'
    expect(decodeNbs(encodeNbs(p)).meter).toBe('3/4')
    expect(getNbsExportWarnings(p).join(' ')).toMatch(/6\/8.*3\/4/)
  })
  it.each(['notes','layers'] as const)('accepts old producers ending at the complete %s boundary',tail=>{
    const p=decodeNbs(fixture(5,undefined,{tail}))
    expect(p.patterns[0].notes).toHaveLength(1)
    expect(p.nbs?.customInstruments).toEqual([])
    expect(p.nbs?.layers).toHaveLength(1)
    expect(decodeNbs(encodeNbs(p)).patterns[0].notes).toEqual(p.patterns[0].notes)
  })
})

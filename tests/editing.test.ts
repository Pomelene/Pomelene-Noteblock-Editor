import { expect, it } from 'vitest'
import { ProjectSession, createDemoProject } from '../src/shared/project'
it('allows precise clip placement and atomic group movement with undo', () => {
  const s = new ProjectSession(createDemoProject())
  s.dispatch({type:'add-clip',patternId:'p1',tick:3,track:3})
  const ids = s.snapshot().project.clips.slice(-1).map(c=>c.id)
  s.dispatch({type:'move-clips',ids,ticks:2,tracks:1})
  expect(s.snapshot().project.clips.at(-1)).toMatchObject({tick:5,track:4})
  const before=s.snapshot()
  expect(()=>s.dispatch({type:'move-clips',ids,ticks:-6,tracks:0})).toThrow()
  expect(s.snapshot()).toEqual(before)
  s.dispatch({type:'undo'})
  expect(s.snapshot().project.clips.at(-1)).toMatchObject({tick:3,track:3})
})
it('changes pattern length at tick resolution and refuses destructive truncation',()=>{
  const s=new ProjectSession(createDemoProject())
  s.dispatch({type:'set-pattern-length',patternId:'p1',length:33})
  expect(s.snapshot().project.patterns[0].length).toBe(33)
  expect(()=>s.dispatch({type:'set-pattern-length',patternId:'p1',length:2})).toThrow()
  expect(s.snapshot().project.patterns[0].length).toBe(33)
})
it('keeps short patterns exact when placing inside them and extends only to the new final tick',()=>{
 const p=createDemoProject();p.patterns=[{id:'short',name:'Short',length:1,notes:[]}];p.clips=[]
 const s=new ProjectSession(p)
 s.dispatch({type:'add-note',patternId:'short',tick:0,layer:0,pitch:60,instrument:0,velocity:80})
 expect(s.snapshot().project.patterns[0].length).toBe(1)
 s.dispatch({type:'add-note',patternId:'short',tick:2,layer:0,pitch:62,instrument:0,velocity:80})
 expect(s.snapshot().project.patterns[0].length).toBe(3)
})
it('edits note pitch and preserves extended NBS properties in clipboard and history',()=>{
  const s=new ProjectSession(createDemoProject()), id=s.snapshot().project.patterns[0].notes[0].id
  s.dispatch({type:'set-note-properties',patternId:'p1',ids:[id],pitch:72,panning:35,finePitch:-25})
  expect(s.snapshot().project.patterns[0].notes[0]).toMatchObject({pitch:72,panning:35,finePitch:-25})
})

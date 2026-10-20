const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const output=path.resolve('test-results/copper-export'); fs.mkdirSync(output,{recursive:true});
  const packaged=process.argv.includes('--packaged');
  const exe=process.env.NBE_EXE || path.resolve('../deliverables/PomeleneNoteblockEditor-0.5.8/win-unpacked/Pomelene Noteblock Editor.exe');
  const app=await electron.launch({executablePath:packaged ? exe : require('electron'),args:packaged ? [] : ['.'],env:{...process.env,NBE_SMOKE_TEST:'1'}});
  try {
    const version=await app.evaluate(({app})=>app.getVersion());
    assert.equal(version,'0.5.8');
    const page=await app.firstWindow(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(({dialog,BrowserWindow})=>{
      BrowserWindow.getAllWindows()[0].show();
      globalThis.exportVersion=6;
      globalThis.formatPrompts=[];
      dialog.showMessageBox=async(...args)=>{
        const options=args.at(-1);
        if(options.message==='选择 NBS 导出版本') { globalThis.formatPrompts.push(options.buttons); return {response:globalThis.exportVersion===6 ? 0 : 1}; }
        return {response:1};
      };
      dialog.showSaveDialog=async()=>({canceled:false,filePath:globalThis.exportPath});
    });
    await page.waitForFunction(()=>!!window.studio);
    await page.getByRole('button',{name:'新建工程',exact:true}).click();
    await page.evaluate(async()=>{await window.studio.dispatch({type:'pattern:add',name:'铜号验证'});});
    const editorPromise=app.waitForEvent('window');
    await page.evaluate(async()=>{const s=await window.studio.getSnapshot();await window.studio.openEditor('pattern',s.project.patterns[0].id)});
    // The action is exercised through the Pattern editor rather than an IPC-only fixture.
    const editor=await editorPromise;
    await editor.waitForLoadState('domcontentloaded');
    await editor.getByRole('button',{name:'添加内置铜号',exact:true}).click();
    await page.waitForFunction(async()=>{const s=await window.studio.getSnapshot();return s.project.instruments.length===20});
    const copper=await page.evaluate(async()=>{
      const s=await window.studio.getSnapshot(),p=s.project;
      const list=p.instruments.filter(i=>p.samples.find(x=>x.id===i.sampleId)?.builtin?.startsWith('trumpet'));
      for(let j=0;j<list.length;j++) await window.studio.dispatch({type:'notes:add',patternId:p.patterns[0].id,notes:[{tick:j,layer:0,pitch:66+j,instrument:list[j].id,velocity:100}]});
      return list;
    });
    assert.equal(copper.length,4);
    const decoded=await page.evaluate(async()=>{
      const context=new AudioContext(), result=[];
      for(const name of ['trumpet','trumpet_exposed','trumpet_weathered','trumpet_oxidized']) {
        const response=await fetch(new URL(`./sounds/${name}.ogg`,document.baseURI));
        const buffer=await context.decodeAudioData(await response.arrayBuffer());
        result.push({name,duration:buffer.duration,nonzero:buffer.getChannelData(0).some(x=>Math.abs(x)>0.001)});
      }
      await context.close();return result;
    });
    assert.ok(decoded.every(x=>x.nonzero && x.duration>0));
    await page.evaluate(async()=>{const s=await window.studio.getSnapshot();await window.studio.dispatch({type:'clip:add',clip:{kind:'pattern',sourceId:s.project.patterns[0].id,tick:0,track:0,length:16,offset:0,muted:false}})});
    const exports=[];
    for(const version of [5,6]) {
      const file=path.join(output,`copper-v${version}.nbs`);
      await app.evaluate((_,v)=>{globalThis.exportVersion=v.version;globalThis.exportPath=v.file},{version,file});
      const result=await page.evaluate(()=>window.studio.file('exportNbs'));
      assert.equal(result.ok,true); const bytes=fs.readFileSync(file);
      assert.equal(bytes[2],version);assert.equal(bytes[3],version===6?20:16);
      exports.push({version,bytes:bytes.length,warnings:result.warnings});
    }
    const zip=path.join(output,'copper-sounds.zip'); await app.evaluate((_,p)=>globalThis.exportPath=p,zip);
    assert.equal((await page.evaluate(()=>window.studio.file('exportInstruments'))).ok,true);
    assert.ok(fs.statSync(zip).size>1000);
    const prompts=await app.evaluate(()=>globalThis.formatPrompts);
    assert.equal(prompts.length,2);assert.equal(prompts[0].length,3);
    assert.deepEqual(errors,[]);
    await editor.screenshot({path:path.join(output,packaged?'packaged.png':'source.png')});
    fs.writeFileSync(path.join(output,packaged?'packaged-results.json':'source-results.json'),JSON.stringify({packaged,version,copper,decoded,exports,zipBytes:fs.statSync(zip).size,errors},null,2));
    console.log(JSON.stringify({packaged,version,copper:4,decodedSounds:decoded.length,exports,zipBytes:fs.statSync(zip).size}));
  } finally { await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});

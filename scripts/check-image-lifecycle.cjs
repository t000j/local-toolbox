// Simulated Vue lifecycle / Worker / dialog; no real browser or filesystem save.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
const hooks=[], watchers=[], workers=[], urls=[];let clock, resolveSave, saves=0
const ref=value=>({value}), vue={ref,shallowRef:ref,computed:f=>({get value(){return f()}}),watch:(source,callback)=>watchers.push([source,callback]),onBeforeUnmount:fn=>hooks.push(fn)}
const exportsTask={}
new Function('exports','require','setTimeout','clearTimeout',compile(fs.readFileSync('src/tools/useWorkerTask.ts','utf8')))(exportsTask,()=>vue,fn=>(clock=fn,1),()=>{})
class FakeWorker {constructor(){workers.push(this)}terminate(){this.stopped=true}postMessage(request){this.request=request}}
const e={};let source=fs.readFileSync('src/tools/useImageOutput.ts','utf8').replace("new URL('./imageProcessing.worker.ts', import.meta.url)","'worker'")
new Function('exports','require','Worker','URL',compile(source))(e,n=>n==='vue'?vue:n.includes('useWorkerTask')?exportsTask:{saveBinaryOutput:async(bytes,name,current)=>{saves++;await new Promise(r=>resolveSave=r);return current()}},FakeWorker,{createObjectURL:()=>{urls.push('blob:'+urls.length);return urls.at(-1)},revokeObjectURL:url=>urls.push('revoked:'+url)})
async function test(){
 const t=e.useImageOutput(),output={name:'synthetic.png',bytes:new Uint8Array([1]),width:1,height:1,sourceWidth:1,sourceHeight:1}
 t.run({files:[]});eq(t.busy.value,true);const old=workers.at(-1);t.clear();eq(old.stopped,true);old.onmessage({data:{ok:true,result:[output]}});eq(t.result.value,null)
 t.run({files:[]});const active=workers.at(-1);active.onmessage({data:{ok:true,result:[output]}});eq(t.result.value,[output]);eq(t.busy.value,false);eq(active.stopped,true)
 watchers[0][1](output);eq(t.preview.value,'blob:0');watchers[0][1](null);eq(t.preview.value,'');eq(urls.includes('revoked:blob:0'),true)
 let save=t.saveOutput();eq(saves,1);await t.saveOutput();eq(saves,1);t.clear();resolveSave();await save;eq(t.notice.value,'');eq(t.saving.value,false)
 t.run({files:[]});clock();eq(t.busy.value,false);eq(t.error.value.includes('30'),true)
 t.run({files:[]});t.cancel();eq(t.result.value,null);eq(t.busy.value,false)
 t.run({files:[]});const last=workers.at(-1);hooks.forEach(f=>f());eq(last.stopped,true);await t.saveOutput();eq(saves,1)
 console.log(`${checks} simulated image lifecycle assertions passed; UI and native saving untested`)
}test().catch(e=>{console.error(e);process.exitCode=1})

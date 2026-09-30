// Mock Vue/Worker/save lifecycle only; no browser or native IO.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
function setup(mode){const tasks=[],hooks=[],exports={};let finish,saves=0
 const ref=initial=>{let value=initial;const listeners=[];return {listeners,get value(){return value},set value(v){value=v;listeners.forEach(fn=>fn(v))}}}
 const vue={ref,shallowRef:ref,watch:(source,fn)=>(Array.isArray(source)?source:[source]).forEach(r=>r.listeners.push(fn)),onBeforeUnmount:fn=>hooks.push(fn)}
 const createTask=()=>{const t={result:ref(null),busy:ref(false),error:ref(''),requests:[],reset(){t.result.value=null;t.busy.value=false;t.error.value=''},cancel(){t.reset()},run(request){t.requests.push(request)}};tasks.push(t);return t}
 const source=fs.readFileSync('src/tools/usePdfPageEditor.ts','utf8').replace(/new URL\([^)]*import.meta.url\)/g,"'worker'")
 new Function('exports','require',compile(source))(exports,id=>id==='vue'?vue:id.includes('useWorkerTask')?{useWorkerTask:createTask}:{saveBinaryOutput:async(bytes,name,current)=>{saves++;await new Promise(r=>finish=r);return current()}})
 return {e:exports.usePdfPageEditor(mode),tasks,hooks,get saves(){return saves},finish:()=>finish()}
}
async function main(){
 const s=setup('split'),e=s.e,[i,o]=s.tasks;e.inspect();eq(i.requests.length,0);e.choose({target:{files:[{name:'synthetic.pdf',size:20}],value:'x'}});e.inspect();eq(i.requests.length,1)
 i.result.value={pages:[{number:1,width:100,height:100,rotation:0},{number:2,width:100,height:100,rotation:90}]};eq(e.order.value,[1,2]);eq(e.selection.value,'1-2')
 e.selection.value='2';e.generate();eq(o.requests[0].selection,'2');o.busy.value=true;e.generate();eq(o.requests.length,1);o.busy.value=false
 o.result.value={bytes:new Uint8Array([1]),pages:[]};await e.saveOutput();eq(s.saves,0);e.acknowledged.value=true;let pending=e.saveOutput();await e.saveOutput();eq(s.saves,1);e.selection.value='1';eq(o.result.value,null);eq(e.acknowledged.value,false);s.finish();await pending;eq(e.notice.value,'')
 o.result.value={bytes:new Uint8Array([1])};e.acknowledged.value=true;pending=e.saveOutput();s.hooks.forEach(fn=>fn());s.finish();await pending;eq(e.notice.value,'');e.generate();eq(o.requests.length,1)
 const b=setup('split');b.e.choose({target:{files:[{size:8*1024*1024+1}],value:'x'}});eq(b.e.file.value,null);eq(b.e.notice.value,'PDF必须为1字节至8MiB。')
 console.log(`${checks} simulated PDF editor lifecycle checks passed; UI/Worker/native IO not exercised`)
}
main().catch(e=>{console.error(e);process.exitCode=1})

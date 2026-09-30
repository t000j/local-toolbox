// Simulated Vue refs, Worker, dialogs and native task; no OS commands or files.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let checks=0; const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
function setup(){
 const hooks=[],requests=[],nativeCalls=[],e={};let resolveDialog,resolveNative,resolveSave,saves=0
 const ref=initial=>{let value=initial;const listeners=[];return {get value(){return value},set value(v){value=v;listeners.forEach(fn=>fn(v))},listeners}}
 const vue={ref,shallowRef:ref,computed:fn=>({get value(){return fn()}}),watch:(source,fn)=>(Array.isArray(source)?source:[source]).forEach(r=>r.listeners.push(fn)),onBeforeUnmount:fn=>hooks.push(fn)}
 const task={result:ref(null),error:ref(''),busy:ref(false),reset(){task.result.value=null;task.error.value='';task.busy.value=false},cancel(){task.reset()},run:request=>{requests.push(request);task.busy.value=true}}
 const native={result:ref(null),error:ref(''),busy:ref(false),cancelling:ref(false),clear(){if(!native.busy.value){native.result.value=null;native.error.value=''}},async start(command,args){if(native.busy.value)return;native.clear();nativeCalls.push({command,args});native.busy.value=true;try{native.result.value=await new Promise(r=>resolveNative=r)}finally{native.busy.value=false;native.cancelling.value=false}},async cancel(){native.cancelling.value=true}}
 const zip={};new Function('exports','require',compile(fs.readFileSync('src/tools/zipArchive.ts','utf8')))(zip,require)
 let source=fs.readFileSync('src/tools/components/ZipArchiveTool.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0].replace(/new URL\([^)]*import.meta.url\)/g,"'worker'")
 new Function('exports','require',compile(source+'\nexport {mode,createSource,archive,files,sourceDirectory,destination,folderName,confirmed,result,error,notice,locked,selected,choose,chooseDirectory,process,extract,select,saveTree,saveOutput,stop,clear};'))(e,n=>n==='vue'?vue:n.includes('plugin-dialog')?{open:()=>new Promise(r=>resolveDialog=r)}:n.includes('useWorkerTask')?{useWorkerTask:()=>task}:n.includes('useNativeDiagnostic')?{useNativeDiagnostic:()=>native}:n.includes('binaryExport')?{saveBinaryOutput:async(b,n,current)=>{saves++;await new Promise(r=>resolveSave=r);return current()}}:zip)
 return {e,hooks,requests,nativeCalls,native,task,get saves(){return saves},dialog:path=>resolveDialog(path),finish:value=>resolveNative(value),finishSave:()=>resolveSave()}
}
const reply=output=>({status:'completed',exitCode:0,output:typeof output==='string'?output:JSON.stringify(output)}), tree=[{name:'a/',directory:true,content:'',size:0,crc:0},{name:'a/f',directory:false,content:'eA==',size:1,crc:2363233923}]
async function test(){
 let s=setup(),e=s.e
 await e.process();eq(s.requests.length,0);e.choose({target:{files:[{name:'a.zip',size:10}],value:'x'}});await e.process();eq(s.requests[0].mode,'browse');s.task.busy.value=false;e.result.value={entries:[]};e.extract(true);eq(s.requests[1].mode,'extractAll');s.task.busy.value=false;e.result.value={entries:[],tree};e.destination.value='C:\\fixture';await e.saveTree();eq(s.nativeCalls.length,0)
 e.confirmed.value=true;e.folderName.value='changed';eq(e.confirmed.value,false);e.confirmed.value=true;e.destination.value='C:\\other';eq(e.confirmed.value,false)
 e.folderName.value='../bad';e.confirmed.value=true;await e.saveTree();eq(s.nativeCalls.length,0);e.folderName.value='safe';e.confirmed.value=true
 let pending=e.saveTree();await e.saveTree();eq(s.nativeCalls.length,1);eq(e.confirmed.value,false);eq(s.nativeCalls[0].args,{destination:'C:\\other',name:'safe',entries:tree});e.stop();eq(s.native.cancelling.value,true);s.finish(reply({outputPath:'C:\\other\\safe',entries:2,bytes:1}));await pending;eq(e.notice.value.startsWith('已校验并保存'),true)
 e.confirmed.value=true;e.select(0);eq(e.result.value.tree,undefined);eq(e.confirmed.value,false)
 s=setup();e=s.e;e.mode.value='create';e.createSource.value='directory';e.sourceDirectory.value='C:\\fixture';pending=e.process();await e.process();eq(s.nativeCalls.length,1);eq(s.nativeCalls[0].command,'read_zip_directory');s.finish(reply([{name:'empty/',directory:true,content:'',size:0}]));await pending;eq(s.requests[0].mode,'create');eq(s.requests[0].files[0].name,'empty/');eq(s.native.result.value,null)
 s=setup();e=s.e;e.mode.value='create';e.createSource.value='directory';e.sourceDirectory.value='C:\\fixture';pending=e.process();e.stop();s.finish(reply([{name:'empty/',directory:true,content:'',size:0}]));await pending;eq(s.requests.length,0)
 s=setup();e=s.e;e.mode.value='create';e.createSource.value='directory';e.sourceDirectory.value='C:\\fixture';pending=e.process();s.hooks.forEach(fn=>fn());s.finish(reply([{name:'empty/',directory:true,content:'',size:0}]));await pending;eq(s.requests.length,0)
 s=setup();e=s.e;pending=e.chooseDirectory('destination');e.mode.value='create';s.dialog('C:\\late');await pending;eq(e.destination.value,'')
 s=setup();e=s.e;pending=e.chooseDirectory('source');s.hooks.forEach(fn=>fn());s.dialog('C:\\late');await pending;eq(e.sourceDirectory.value,'')
 s=setup();e=s.e;e.result.value={entries:[],bytes:new Uint8Array([1]),name:'x.zip'};pending=e.saveOutput();await e.saveOutput();eq(s.saves,1);s.hooks.forEach(fn=>fn());s.finishSave();await pending;eq(e.notice.value,'')
 s=setup();e=s.e;e.result.value={entries:[],tree};e.destination.value='C:\\fixture';e.confirmed.value=true;pending=e.saveTree();s.hooks.forEach(fn=>fn());s.finish(reply({}));await pending;eq(e.notice.value,'');await e.saveTree();eq(s.nativeCalls.length,1)
 for(const response of [reply({outputPath:'C:\\wrong',entries:2,bytes:1}),{...reply({outputPath:'C:\\fixture\\extracted',entries:2,bytes:1}),exitCode:1},reply({outputPath:'C:\\fixture\\extracted',entries:99,bytes:1})]) {s=setup();e=s.e;e.result.value={entries:[],tree};e.destination.value='C:\\fixture';e.confirmed.value=true;pending=e.saveTree();s.finish(response);await pending;eq(e.notice.value.startsWith('无法核验'),true)}
 s=setup();e=s.e;e.mode.value='create';e.createSource.value='directory';e.sourceDirectory.value='C:\\fixture';pending=e.process();s.finish({...reply([{name:'empty/',directory:true,content:'',size:0}]),exitCode:1});await pending;eq(s.requests.length,0)
 console.log(`${checks} ZIP dialog, authorization, cancellation, duplicate-submit and stale/unmount assertions passed; real desktop UI untested`)
}
test().catch(e=>{console.error(e);process.exitCode=1})

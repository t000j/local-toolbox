// UI state simulation, not a browser or native-save run.
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
function setup(){const e={},hooks=[],calls=[],created=[],revoked=[];let saves=0,finish
 const ref=initial=>{let value=initial;const listeners=[];return {listeners,get value(){return value},set value(v){value=v;listeners.forEach(fn=>fn(v))}}}
 const vue={ref,shallowRef:ref,watch:(sources,fn)=>sources.forEach(r=>r.listeners.push(fn)),onBeforeUnmount:fn=>hooks.push(fn)}
 const raster={renderPdfRaster:(file,options,signal)=>new Promise((resolve,reject)=>calls.push({file,options,signal,resolve,reject}))}
 const binary={saveBinaryOutput:async(bytes,name,current)=>{saves++;await new Promise(r=>finish=r);return current()}}
 let code=fs.readFileSync('src/tools/components/PdfImagesTool.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0]+'\nexport {file,selection,dpi,format,quality,result,urls,busy,saving,notice,clear,choose,generate,saveImage};'
 new Function('exports','require','URL',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,id=>id==='vue'?vue:id.includes('pdfRaster')?raster:id.includes('pdfPageSelection')?{parsePageSelection:s=>s==='1-9'?Array.from({length:9},(_,i)=>i+1):[2,1]}:binary,{createObjectURL:()=>{const u='blob:'+created.length;created.push(u);return u},revokeObjectURL:u=>revoked.push(u)})
 return {e,hooks,calls,created,revoked,get saves(){return saves},finish:()=>finish()}
}
async function main(){const s=setup(),e=s.e;await e.generate();eq(s.calls.length,0);e.choose({target:{files:[{name:'synthetic.pdf',size:1}],value:'x'}});let p=e.generate();await e.generate();eq(s.calls.length,1);eq(s.calls[0].options.pages,[2,1]);e.dpi.value=144;eq(s.calls[0].signal.aborted,true);s.calls[0].resolve({images:[],mime:'image/png'});await p;eq(e.result.value,null)
 p=e.generate();s.calls[1].resolve({images:[{page:2,bytes:new Uint8Array([1]),width:1,height:1}],mime:'image/png',format:'png'});await p;eq(e.urls.value,['blob:0']);const saving=e.saveImage(0);await e.saveImage(0);eq(s.saves,1);e.selection.value='1';eq(e.result.value,null);eq(s.revoked,['blob:0']);s.finish();await saving;eq(e.notice.value,'')
 e.selection.value='1-9';await e.generate();eq(s.calls.length,2);assert.match(e.notice.value,/最多/);checks++
 e.selection.value='1';p=e.generate();s.hooks.forEach(fn=>fn());eq(s.calls[2].signal.aborted,true);s.calls[2].resolve({images:[],mime:'image/png'});await p;eq(e.result.value,null);eq(s.created.length,1)
 console.log(`${checks} simulated PDF-image UI stale/cancel/URL/save checks passed; actual UI/Windows untested`)
}main().catch(e=>{console.error(e);process.exitCode=1})

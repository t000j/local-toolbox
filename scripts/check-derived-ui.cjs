// Synthetic component state/Worker/dialog/clipboard simulations, no native calls.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
function setup(component,exportsList){
 const hooks=[],requests=[],revoked=[],e={};let resolveSave,saves=0
 const ref=initial=>{let value=initial;const listeners=[];return {get value(){return value},set value(v){value=v;listeners.forEach(fn=>fn(v))},listeners}}
 const vue={ref,shallowRef:ref,computed:fn=>({get value(){return fn()}}),watch:(source,fn)=>(Array.isArray(source)?source:[source]).forEach(r=>r.listeners.push(fn)),onBeforeUnmount:fn=>hooks.push(fn)}
 const task={result:ref(null),error:ref(''),busy:ref(false),reset(){task.result.value=null;task.error.value='';task.busy.value=false},cancel(){task.reset()},run:request=>requests.push(request)}
 const binary={saveBinaryOutput:async(bytes,name,current)=>{saves++;await new Promise(r=>resolveSave=r);return current()}}
 let source=fs.readFileSync('src/tools/components/'+component+'.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0].replace(/new URL\([^)]*import.meta.url\)/g,"'worker'")
 new Function('exports','require','URL',compile(source+'\nexport {'+exportsList+'};'))(e,n=>n==='vue'?vue:n.includes('useWorkerTask')?{useWorkerTask:()=>task}:n.includes('binaryExport')?binary:n.includes('favicon')?{FAVICON_PNG_SIZES:[16,32,256]}:{copyText:async()=>{}},{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:url=>revoked.push(url)})
 return {e,hooks,requests,revoked,get saves(){return saves},finish:()=>resolveSave()}
}
async function test(){
 const f=setup('FaviconTool','file,format,fit,size,result,preview,notice,saving,choose,generate,saveOutput,clear'),e=f.e
 e.generate();eq(f.requests.length,0);e.choose({target:{files:[{name:'fake.png'}],value:'x'}});e.generate();eq(f.requests.length,1)
 const output={bytes:new Uint8Array([1]),preview:new Uint8Array([2]),format:'ico',sizes:[16],width:1,height:1};e.result.value=output;eq(e.preview.value,'blob:synthetic')
 let pending=e.saveOutput();await e.saveOutput();eq(f.saves,1);e.format.value='png';eq(e.result.value,null);eq(f.revoked,['blob:synthetic']);f.finish();await pending;eq(e.notice.value,'')
 e.result.value=output;pending=e.saveOutput();f.hooks.forEach(fn=>fn());f.finish();await pending;eq(e.notice.value,'');eq(e.preview.value,'')
 const p=setup('PdfMergeTool','files,result,acknowledged,notice,choose,move,remove,merge,saveOutput,clear'),m=p.e
 const a={name:'a.pdf',size:1},b={name:'b.pdf',size:1};m.choose({target:{files:[a,b],value:'x'}});m.move(1,-1);eq(m.files.value,[b,a]);m.merge();eq(p.requests[0],[b,a]);m.result.value={bytes:new Uint8Array([1]),pages:2,inputs:[],warnings:[]}
 await m.saveOutput();eq(p.saves,0);m.acknowledged.value=true;pending=m.saveOutput();await m.saveOutput();eq(p.saves,1);m.files.value=[];eq(m.result.value,null);eq(m.acknowledged.value,false);p.finish();await pending;eq(m.notice.value,'')
 m.choose({target:{files:[a,b],value:'x'}});m.remove(0);eq(m.files.value,[b]);m.merge();eq(p.requests.length,1);m.choose({target:{files:Array(9).fill(a),value:'x'}});eq(m.files.value,[])
 m.result.value={bytes:new Uint8Array([1])};m.acknowledged.value=true;pending=m.saveOutput();p.hooks.forEach(fn=>fn());p.finish();await pending;eq(m.notice.value,'');await m.saveOutput();eq(p.saves,2)
 const q=setup('ImagePaletteTool','file,count,result,choose,extract,clear'),v=q.e;v.choose({target:{files:[{name:'fake.png'}],value:'x'}});v.extract();eq(q.requests.length,1);v.result.value={colors:[]};v.count.value=8;eq(v.result.value,null);q.hooks.forEach(fn=>fn());v.extract();eq(q.requests.length,1)
 const compression=setup('PdfCompressionTool','file,quality,result,acknowledged,notice,choose,compress,saveOutput,clear'),c=compression.e;c.compress();eq(compression.requests.length,0);c.choose({target:{files:[{name:'synthetic.pdf',size:1}],value:'x'}});c.compress();eq(compression.requests[0].quality,75);c.result.value={bytes:new Uint8Array([1])};await c.saveOutput();eq(compression.saves,0);c.acknowledged.value=true;pending=c.saveOutput();c.quality.value=50;eq(c.result.value,null);compression.finish();await pending;eq(c.notice.value,'');compression.hooks.forEach(fn=>fn());c.compress();eq(compression.requests.length,1)
 const imagePdf=setup('ImagePdfTool','files,page,encoding,result,acknowledged,notice,choose,move,generate,saveOutput,clear'),ip=imagePdf.e;ip.choose({target:{files:[a,b],value:'x'}});ip.move(1,-1);eq(ip.files.value,[b,a]);ip.generate();eq(imagePdf.requests[0].options.encoding,'png');ip.result.value={bytes:new Uint8Array([1])};ip.acknowledged.value=true;pending=ip.saveOutput();await ip.saveOutput();eq(imagePdf.saves,1);ip.encoding.value='jpeg';eq(ip.result.value,null);imagePdf.finish();await pending;eq(ip.notice.value,'');ip.move(-1,1);eq(ip.files.value,[b,a]);imagePdf.hooks.forEach(fn=>fn());ip.generate();eq(imagePdf.requests.length,1)
 const text=setup('PdfTextTool','file,selection,result,notice,choose,extract,saveOutput,clear'),tx=text.e;tx.extract();eq(text.requests.length,0);tx.choose({target:{files:[a],value:'x'}});tx.selection.value='2,1';tx.extract();eq(text.requests[0].selection,'2,1');tx.result.value={bytes:new Uint8Array([1])};pending=tx.saveOutput();await tx.saveOutput();eq(text.saves,1);tx.selection.value='1';eq(tx.result.value,null);text.finish();await pending;eq(tx.notice.value,'');text.hooks.forEach(fn=>fn());tx.extract();eq(text.requests.length,1)
 console.log(`${checks} simulated palette/favicon/PDF page-state assertions passed; UI/native saving untested`)
}test().catch(e=>{console.error(e);process.exitCode=1})

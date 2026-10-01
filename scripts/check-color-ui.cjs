// Component state simulation only; no browser or clipboard access.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
function environment(){const hooks=[];const ref=initial=>{let value=initial;const listeners=[];return {get value(){return value},set value(v){value=v;listeners.forEach(fn=>fn(v))},listeners}};return {hooks,vue:{ref,shallowRef:ref,watch:(r,fn)=>r.listeners.push(fn),onBeforeUnmount:fn=>hooks.push(fn)}}}
const colors={};new Function('exports',compile(fs.readFileSync('src/tools/colorFormats.ts','utf8')))(colors)
async function test(){
 let resolveCopy,copies=0;const env=environment(),e={}
 let code=fs.readFileSync('src/tools/components/ColorFormatTool.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
 new Function('exports','require',compile(code+'\nexport {input,result,error,copied,copying,convert,copy};'))(e,n=>n==='vue'?env.vue:n.includes('colorFormats')?colors:{copyText:async()=>{copies++;await new Promise(r=>resolveCopy=r)}})
 e.convert();eq(e.result.value.hex,'#33669980');let pending=e.copy('hex');await e.copy('rgb');eq(copies,1);e.input.value='#fff';eq(e.result.value,null);resolveCopy();await pending;eq(e.copied.value,'')
 e.convert();pending=e.copy('rgb');resolveCopy();await pending;eq(e.copied.value,'rgb')
 e.input.value='bad';e.convert();eq(e.result.value,null);eq(!!e.error.value,true)
 e.input.value='#000';e.convert();pending=e.copy('hex');env.hooks.forEach(fn=>fn());resolveCopy();await pending;eq(e.copied.value,'')
 const stripEnv=environment(),s={};let resolveSave,saves=0,runs=0
 const task={result:stripEnv.vue.ref(null),error:stripEnv.vue.ref(''),busy:stripEnv.vue.ref(false),reset(){task.result.value=null;task.error.value='';task.busy.value=false},cancel(){task.reset()},run(){runs++}}
 code=fs.readFileSync('src/tools/components/ImageMetadataStripTool.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0].replace("new URL('../imageMetadataStrip.worker.ts', import.meta.url)","'worker'")
 new Function('exports','require',compile(code+'\nexport {file,result,acknowledged,saving,notice,choose,strip,saveOutput};'))(s,n=>n==='vue'?stripEnv.vue:n.includes('useWorkerTask')?{useWorkerTask:()=>task}:{saveBinaryOutput:async(bytes,name,current)=>{saves++;await new Promise(r=>resolveSave=r);return current()}})
 s.strip();eq(runs,0);const input={files:[{name:'synthetic.png',size:1}],value:'x'};s.choose({target:input});eq(input.value,'');s.strip();eq(runs,1)
 const output={bytes:new Uint8Array([1]),format:'png',removed:1,retained:[],before:{width:1,height:1},after:{fields:[]}}
 s.result.value=output;await s.saveOutput();eq(saves,0);s.acknowledged.value=true;pending=s.saveOutput();await s.saveOutput();eq(saves,1);s.choose({target:input});eq(s.result.value,null);eq(s.acknowledged.value,false);resolveSave();await pending;eq(s.notice.value,'')
 s.result.value=output;s.acknowledged.value=true;pending=s.saveOutput();stripEnv.hooks.forEach(fn=>fn());resolveSave();await pending;eq(s.notice.value,'');await s.saveOutput();eq(saves,2)
 console.log(`${checks} simulated color/metadata component lifecycle assertions passed; UI and saving untested`)
}test().catch(e=>{console.error(e);process.exitCode=1})

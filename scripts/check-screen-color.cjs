// Mock browser-owned EyeDropper only; never samples a real screen.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),e={},hooks=[]
let timer,checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
new Function('exports','require','setTimeout','clearTimeout',ts.transpileModule(fs.readFileSync('src/tools/useScreenColorPicker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,()=>({ref:value=>({value}),onBeforeUnmount:fn=>hooks.push(fn)}),fn=>(timer=fn,1),()=>{})
let calls=0,requests=[]
class Dropper{open({signal}){calls++;return new Promise((resolve,reject)=>{requests.push({resolve,reject,signal});signal.addEventListener('abort',()=>reject(new DOMException('cancel','AbortError')),{once:true})})}}
async function test(){
 const unsupported=e.useScreenColorPicker({isSecureContext:true});await unsupported.pick();eq(unsupported.supported,false);eq(calls,0)
 const insecure=e.useScreenColorPicker({isSecureContext:false,EyeDropper:Dropper});await insecure.pick();eq(insecure.supported,false);eq(calls,0)
 const broken=e.useScreenColorPicker({isSecureContext:true,EyeDropper:class {open(){throw new Error('synthetic failure')}}});await broken.pick();eq(broken.busy.value,false);eq(broken.error.value,'synthetic failure')
 const t=e.useScreenColorPicker({isSecureContext:true,EyeDropper:Dropper});eq(t.supported,true)
 let op=t.pick();eq(calls,1);eq(t.busy.value,true);await t.pick();eq(calls,1);requests.at(-1).resolve({sRGBHex:'#aBcDeF'});await op;eq(t.color.value,'#ABCDEF');eq(t.busy.value,false)
 op=t.pick();eq(t.color.value,'');t.cancel();eq(requests.at(-1).signal.aborted,true);await op;eq(t.busy.value,false);eq(t.notice.value,'已取消取色。')
 op=t.pick();timer();await op;eq(t.notice.value.includes('30'),true);eq(t.busy.value,false)
 op=t.pick();requests.at(-1).reject(new DOMException('gesture','NotAllowedError'));await op;eq(t.error.value.includes('拒绝'),true)
 op=t.pick();requests.at(-1).resolve({sRGBHex:'url(https://invalid/)'});await op;eq(t.color.value,'');eq(t.error.value.includes('非规范'),true)
 op=t.pick();t.clear();await op;eq(t.color.value,'');eq(t.busy.value,false)
 op=t.pick();const count=calls;hooks.forEach(fn=>fn());await op;eq(requests.at(-1).signal.aborted,true);eq(t.color.value,'');await t.pick();eq(calls,count)
 const source=fs.readFileSync('src/tools/components/ScreenColorPickerTool.vue','utf8')+fs.readFileSync('src/tools/useScreenColorPicker.ts','utf8')
 for(const unsafe of ['getDisplayMedia(', 'getUserMedia(', 'localStorage.', 'sessionStorage.', 'fetch(', 'invoke(', 'v-html']){eq(source.includes(unsafe),false)}
 console.log(`${checks} mocked EyeDropper/lifecycle/safety assertions passed; no screen was sampled`)
}test().catch(e=>{console.error(e);process.exitCode=1})

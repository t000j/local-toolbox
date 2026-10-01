// Worker protocol simulation only. Actual PDF library logic has separate synthetic checks.
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict')
const replies=[],requests=[],self={postMessage:(message,options)=>replies.push({message,options})};let inspected=0,previewed=0
const pages={inspectPdfPages:async()=>{inspected++;return [{number:1},{number:2}]},loadPageDocument:async()=>({}),parsePageSelection:()=>[2],exportPdfPages:async(bytes,order,rotations)=>{requests.push({order,rotations});return {bytes:new Uint8Array([1]),pages:order.map(number=>({number}))}}}
new Function('exports','require','self',ts.transpileModule(fs.readFileSync('src/tools/pdfPages.worker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)({},id=>id.includes('pdfPreviewGate')?{auditPdfPreview:()=>previewed++}:pages,self)
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},file={size:1,arrayBuffer:async()=>new Uint8Array([1]).buffer}
async function run(data){await self.onmessage({data});return replies.at(-1)}
async function main(){
 eq((await run({file,action:'inspect'})).message.result.pages.length,2);eq((await run({file,action:'split',selection:'2'})).message.ok,true);eq(requests.at(-1).order,[2]);eq(replies.at(-1).options.transfer.length,1)
 eq((await run({file,action:'order',order:[2,1]})).message.ok,true);eq(requests.at(-1).order,[2,1]);eq((await run({file,action:'rotate',order:[1,2],rotations:[90,270]})).message.ok,true);eq(requests.at(-1).rotations,[90,270])
 for(const input of [{file,action:'order',order:[1,1]},{file,action:'order',order:[1]},{file,action:'rotate',order:[2,1],rotations:[0,0]},{file,action:'rotate',order:[1,2]},{file,action:'preview',order:[]},{file,action:'preview',order:Array(13).fill(1)}])eq((await run(input)).message.ok,false)
 eq((await run({file,action:'preview',order:[2]})).message.ok,true);eq(previewed,1)
 const count=inspected;for(const data of [null,{}, {file:{size:0},action:'inspect'},{file:{size:8*1024*1024+1},action:'inspect'},{file,action:'bad'}])eq((await run(data)).message.ok,false);eq(inspected,count)
 console.log(`${checks} simulated PDF worker protocol checks passed`)
}main().catch(e=>{console.error(e);process.exitCode=1})

// Mock Canvas with generated PNG byte results; no real rasterizer is exercised.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const fixture=fs.readFileSync('scripts/check-favicon.cjs','utf8').split('const sizes=')[0]
const {png,load}=new Function('require',fixture+'\nreturn {png,load}')(require),favicon=load('favicon')
let checks=0,closed=0,decodes=0,reply,fail=false,canvases=[],draws=[];const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
class Canvas{constructor(w,h){this.width=w;this.height=h;canvases.push(this)}getContext(){return {drawImage:(...args)=>draws.push(args.slice(1))}}async convertToBlob(){if(fail)throw new Error('synthetic encoder failure');return new Blob([png(this.width)],{type:'image/png'})}}
const self={postMessage:r=>reply=r},decoder={decodeBoundedImage:async()=>{decodes++;return {width:4,height:2,bitmap:{close(){closed++}}}}}
new Function('exports','require','self','OffscreenCanvas',ts.transpileModule(fs.readFileSync('src/tools/favicon.worker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)({},n=>n.includes('imageDecode')?decoder:favicon,self,Canvas)
async function run(data){reply=null;canvases=[];draws=[];await self.onmessage({data});return reply}
async function test(){
 let result=await run({file:{},format:'png',size:32,fit:'contain'});eq(result.ok,true);eq(result.result.sizes,[32]);eq(draws,[[0,0,4,2,0,8,32,16]]);eq(closed,decodes);eq([canvases[0].width,canvases[0].height],[1,1])
 result=await run({file:{},format:'ico',size:32,fit:'cover'});eq(result.ok,true);eq(result.result.sizes,[16,32,48,64,128,256]);eq(draws.length,6);eq(draws[0],[1,0,2,2,0,0,16,16]);eq(closed,decodes);eq(canvases.every(c=>c.width===1&&c.height===1),true)
 const count=decodes;result=await run({file:{},format:'gif',size:32,fit:'contain'});eq(result.ok,false);eq(decodes,count)
 fail=true;result=await run({file:{},format:'png',size:32,fit:'contain'});eq(result.ok,false);eq(closed,decodes);eq(canvases.every(c=>c.width===1&&c.height===1),true)
 console.log(`${checks} mocked favicon Worker fit/format/cleanup assertions passed; Canvas untested`)
}test().catch(e=>{console.error(e);process.exitCode=1})

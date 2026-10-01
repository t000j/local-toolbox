// Mock Canvas/bitmap orchestration, not a browser pixel-rendering test.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const load=p=>{const e={};new Function('exports',compile(fs.readFileSync(p,'utf8')))(e);return e}
const geometry=load('src/tools/imageGeometry.ts'), processing=load('src/tools/imageProcessing.ts')
let header={width:4,height:3,orientation:1,format:'jpeg',animated:false,fields:[]}, bitmapSize, blobSize=3, decoded=0, closed=0, calls=[], reply, checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++},self={postMessage:r=>reply=r}
class Canvas{constructor(w,h){calls.push(['canvas',w,h])}getContext(){return {translate:(...a)=>calls.push(['translate',...a]),scale:(...a)=>calls.push(['scale',...a]),rotate:(...a)=>calls.push(['rotate',...a]),drawImage:(...a)=>calls.push(['draw',...a.slice(1)])}}async convertToBlob(){return new Blob([new Uint8Array(blobSize)],{type:'image/png'})}}
new Function('exports','require','self','createImageBitmap','OffscreenCanvas',compile(fs.readFileSync('src/tools/imageProcessing.worker.ts','utf8')))({},n=>n.includes('imageHeaders')?{parseImageHeader:()=>header}:n.includes('imageGeometry')?geometry:processing,self,async()=>{decoded++;const size=bitmapSize??(header.orientation>=5?{width:3,height:4}:{width:4,height:3});return {...size,close(){closed++}}},Canvas)
const file={name:'fixture.jpg',size:1,arrayBuffer:async()=>new Uint8Array([1]).buffer},resize={mode:'percent',percent:50,width:1,height:1,keepAspect:true}
async function run(request){calls=[];reply=null;await self.onmessage({data:request});return reply}
async function test(){
 for(let orientation=1;orientation<=8;orientation++){header.orientation=orientation;const r=await run({files:[file],resize});eq(r.ok,true);eq([r.result[0].width,r.result[0].height],[2,2]);eq(r.result[0].sourceWidth,orientation>=5?3:4)}
 eq(decoded,closed);header.orientation=1
 for(const rotation of [0,90,180,270])for(const flipX of [false,true])for(const flipY of [false,true]){
  const crop={x:1,y:1,width:3,height:2,rotation,flipX,flipY};const r=await run({files:[file],crop});eq(r.ok,true)
  eq(calls.slice(1),[['translate',r.result[0].width/2,r.result[0].height/2],['scale',flipX?-1:1,flipY?-1:1],['rotate',rotation*Math.PI/180],['draw',1,1,3,2,-1.5,-1,3,2]])
 }
 header.animated=true;let count=decoded;eq((await run({files:[file],resize})).ok,false);eq(decoded,count);header.animated=false
 bitmapSize={width:3,height:4};eq((await run({files:[file],resize})).ok,false);bitmapSize=null;eq(decoded,closed)
 eq((await run({files:Array(9).fill(file),resize})).ok,false)
 eq((await run({files:[{...file,size:17*1024*1024}],resize})).ok,false)
 eq((await run({files:[file],resize,crop:{}})).ok,false)
 eq((await run({files:[],resize})).ok,false)
 blobSize=16*1024*1024+1;eq((await run({files:[file],resize})).ok,false);eq(decoded,closed)
 blobSize=12*1024*1024;eq((await run({files:[file,file,file],resize})).ok,false);eq(decoded,closed)
 console.log(`${checks} synthetic mocked image Worker assertions passed; decoding/rendering untested`)
}test().catch(e=>{console.error(e);process.exitCode=1})

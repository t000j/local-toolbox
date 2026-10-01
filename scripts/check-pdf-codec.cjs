// Canvas/ImageBitmap simulations. These validate contracts and cleanup, not real browser pixels.
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict')
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
function setup(options={}){let closed=0,canvas,rgba;class C{constructor(w,h){this.width=w;this.height=h;canvas=this}getContext(){return {drawImage(){},putImageData:image=>rgba=image.data}}async convertToBlob(){if(options.fail)throw Error('encode failed');return new Blob([new Uint8Array([1])],{type:options.type??'image/jpeg'})}}
 const e={};new Function('exports','require','OffscreenCanvas','createImageBitmap','ImageData',ts.transpileModule(fs.readFileSync('src/tools/pdfJpegEncoder.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,()=>({}),C,async()=>({width:options.width??1,height:1,close(){closed++}}),class{constructor(data){this.data=data}});return {run:e.encodePdfJpeg,get canvas(){return canvas},get rgba(){return rgba},get closed(){return closed}}}
async function main(){const a=setup();await a.run({kind:'rgb',width:1,height:1,bytes:new Uint8Array([12,34,56])},.5);eq([...a.rgba],[12,34,56,255]);eq(a.canvas.width,0);eq(a.canvas.height,0)
 const b=setup();await b.run({kind:'jpeg',width:1,height:1,bytes:new Uint8Array([1])},.5);eq(b.closed,1);eq(b.canvas.width,0)
 for(const options of [{width:2},{fail:true},{type:'image/png'}]){const s=setup(options);await assert.rejects(()=>s.run({kind:'jpeg',width:1,height:1,bytes:new Uint8Array([1])},.5));checks++;eq(s.closed,1);eq(s.canvas.width,0)}
 console.log(`${checks} mocked PDF JPEG codec/cleanup checks passed; browser codec not run`)
}main().catch(e=>{console.error(e);process.exitCode=1})

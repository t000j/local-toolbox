// Mock bitmap/Canvas operations only; these checks do not validate rasterized pixels.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
const palette={},processing={};new Function('exports',compile(fs.readFileSync('src/tools/palette.ts','utf8')))(palette);new Function('exports',compile(fs.readFileSync('src/tools/imageProcessing.ts','utf8')))(processing)
let header={format:'jpeg',width:4,height:3,orientation:1,animated:false},mismatch=false,closed=0,decoded=0
const decoder={};new Function('exports','require','createImageBitmap',compile(fs.readFileSync('src/tools/imageDecode.ts','utf8')))(decoder,n=>n.includes('imageHeaders')?{parseImageHeader:()=>header}:processing,async()=>{decoded++;return {width:mismatch?1:header.orientation>=5?3:4,height:header.orientation>=5?4:3,close(){closed++}}})
const file={name:'synthetic.jpg',size:1,arrayBuffer:async()=>new ArrayBuffer(1)},canvasSizes=[];let failure=false,reply
class Canvas{constructor(w,h){this.width=w;this.height=h;canvasSizes.push(this)}getContext(){return failure?null:{drawImage(){},getImageData(){return {data:new Uint8ClampedArray([255,0,0,255,0,0,255,255])}}}}}
const self={postMessage:r=>reply=r};new Function('exports','require','self','OffscreenCanvas',compile(fs.readFileSync('src/tools/palette.worker.ts','utf8')))({},n=>n.includes('imageDecode')?decoder:palette,self,Canvas)
async function test(){
 for(let orientation=1;orientation<=8;orientation++){header.orientation=orientation;const d=await decoder.decodeBoundedImage(file);eq([d.width,d.height],orientation>=5?[3,4]:[4,3]);d.bitmap.close()}
 mismatch=true;await assert.rejects(decoder.decodeBoundedImage(file));checks++;mismatch=false;eq(closed,decoded)
 header.animated=true;let count=decoded;await assert.rejects(decoder.decodeBoundedImage(file));checks++;eq(decoded,count);header.animated=false;header.orientation=1
 await self.onmessage({data:{file,count:2,alphaThreshold:1}});eq(reply.ok,true);eq(reply.result.colors.length,2);eq([canvasSizes.at(-1).width,canvasSizes.at(-1).height],[1,1]);eq(closed,decoded)
 failure=true;await self.onmessage({data:{file,count:2,alphaThreshold:1}});eq(reply.ok,false);eq(closed,decoded);eq([canvasSizes.at(-1).width,canvasSizes.at(-1).height],[1,1])
 console.log(`${checks} mocked orientation/derived-image Worker cleanup assertions passed; Canvas untested`)
}test().catch(e=>{console.error(e);process.exitCode=1})

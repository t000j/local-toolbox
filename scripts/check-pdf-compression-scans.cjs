// Generated fixtures only; native Node canvas is not browser/WebView evidence.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),ts=require('typescript'),pdf=require('pdf-lib'),native=require('@napi-rs/canvas')
const dir='/tmp/local-toolbox-pdf-compression-scans';fs.mkdirSync(dir,{recursive:true})
const cache=new Map();function load(n){if(cache.has(n))return cache.get(n);const e={};cache.set(n,e);new Function('exports','require',ts.transpileModule(fs.readFileSync(`src/tools/${n}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,id=>id.startsWith('.')?load(id.slice(2)):require(id));return e}
const {compressPdfImages}=load('pdfImageCompression'),{encodePdfJpeg}=load('pdfJpegEncoder');let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=v=>{assert.ok(v);checks++}
// Native canvas injects an ICC profile unlike the admitted browser-style fixture; remove only its APP2 marker in this test adapter.
function withoutIcc(b){const parts=[b.subarray(0,2)];let p=2;while(p<b.length){if(b[p+1]===0xda){parts.push(b.subarray(p));break}const end=p+2+b.readUInt16BE(p+2);if(!(b[p+1]===0xe2&&b.subarray(p+4,p+16).toString()==='ICC_PROFILE\0'))parts.push(b.subarray(p,end));p=end}return Buffer.concat(parts)}
global.ImageData=native.ImageData;const canvases=[];global.OffscreenCanvas=class{constructor(w,h){const c=native.createCanvas(w,h);c.convertToBlob=async({type,quality})=>new Blob([withoutIcc(await c.encode('jpeg',Math.round(quality*100)))],{type});canvases.push(c);return c}}
global.createImageBitmap=async blob=>{const i=await native.loadImage(Buffer.from(await blob.arrayBuffer()));i.close=()=>{};return i}
cp.execFileSync('python3',['-c',`from PIL import Image
import random
r=random.Random(479)
for mode in ['L','RGB']:
 im=Image.new(mode,(2480,3508)); p=im.load()
 for y in range(3508):
  for x in range(2480):
   v=(x//32*11+y//32*7)%180+35
   p[x,y]=v if mode=='L' else (v,(v+30)%220,(v+60)%240)
 im.save('${dir}/'+mode+'.jpg',quality=98)
`])
async function fixture(bytes,raw=false,w=2480,h=3508,color='DeviceGray') {const d=await pdf.PDFDocument.create({updateMetadata:false}),p=d.addPage([595.2,841.92]);p.drawText('SELECTABLE TEXT',{x:20,y:800,size:12});if(!raw)p.drawImage(await d.embedJpg(bytes),{x:0,y:0,width:595.2,height:740});else{const ref=d.context.register(d.context.flateStream(bytes,{Type:'XObject',Subtype:'Image',Width:w,Height:h,ColorSpace:color,BitsPerComponent:8}));p.node.set(pdf.PDFName.of('Resources'),d.context.obj({XObject:{Scan:ref}}));p.node.set(pdf.PDFName.of('Contents'),d.context.register(d.context.stream('q 200 0 0 200 0 0 cm /Scan Do Q')))}return d.save({useObjectStreams:false})}
async function main(){
 for(const mode of ['L','RGB']){const bytes=await fixture(fs.readFileSync(`${dir}/${mode}.jpg`));let seen=0;const out=await compressPdfImages(bytes,35,async(i,q)=>{seen++;eq([i.width,i.height,i.components],[2480,3508,mode==='L'?1:3]);const encoded=await encodePdfJpeg(i,q);fs.writeFileSync(`${dir}/${mode}-encoded.jpg`,encoded);return encoded});eq(seen,1);eq(out.changed,1);ok(out.after<out.before);const d=await pdf.PDFDocument.load(out.bytes),image=d.context.enumerateIndirectObjects().find(([,o])=>o instanceof pdf.PDFRawStream&&o.dict.get(pdf.PDFName.of('Subtype'))?.toString()==='/Image')[1];eq(image.dict.get(pdf.PDFName.of('ColorSpace')).toString(),'/DeviceRGB');
  for(const [name,data] of [['before',bytes],['after',out.bytes]]){const f=`${dir}/${mode}-${name}`;fs.writeFileSync(f+'.pdf',data);cp.execFileSync('pdftoppm',['-scale-to','400','-singlefile','-png',f+'.pdf',f]);cp.execFileSync('pdftotext',[f+'.pdf',f+'.txt'])}
  eq(fs.readFileSync(`${dir}/${mode}-before.txt`,'utf8'),fs.readFileSync(`${dir}/${mode}-after.txt`,'utf8'));const imgs=await Promise.all(['before','after'].map(n=>native.loadImage(`${dir}/${mode}-${n}.png`))),pixels=imgs.map(i=>{const c=native.createCanvas(i.width,i.height),ctx=c.getContext('2d');ctx.drawImage(i,0,0);return ctx.getImageData(0,0,i.width,i.height).data});eq(pixels[0].length,pixels[1].length);let diff=0;for(let i=0;i<pixels[0].length;i++)diff+=Math.abs(pixels[0][i]-pixels[1][i]);ok(diff/pixels[0].length<8)
 }
 const gray=Uint8Array.from({length:256*256},(_,i)=>(i*73+(i>>8)*51)%256);let calls=0;const r=await compressPdfImages(await fixture(gray,true,256,256),40,async(i,q)=>{calls++;eq(i.kind,'gray');eq(i.bytes.length,gray.length);return encodePdfJpeg(i,q)});eq(calls,1);ok(r.changed+r.skipped===1)
 for(const [w,h,color] of [[4097,1,'DeviceGray'],[4000,4000,'DeviceGray'],[4000,3000,'DeviceRGB']]){let invoked=false;const r=await compressPdfImages(await fixture(new Uint8Array([0]),true,w,h,color),40,async()=>{invoked=true;throw Error('unexpected')});eq(invoked,false);eq(r.skipped,1)}
 const count=canvases.length;for(const i of [{kind:'gray',width:4000,height:4000,bytes:new Uint8Array()}, {kind:'gray',width:2,height:2,bytes:new Uint8Array(3)}]){await assert.rejects(()=>encodePdfJpeg(i,.5));checks++}eq(canvases.length,count);ok(canvases.every(c=>c.width===350&&c.height===150));console.log(`${checks} grayscale/300dpi compression, native codec and independent Poppler/text checks passed`)
}main().catch(e=>{console.error(e);process.exitCode=1})
